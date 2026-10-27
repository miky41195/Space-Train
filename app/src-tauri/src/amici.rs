//! Amici: scambiarsi file e cartelle con altri PC ovunque siano, senza VPN
//! e senza aprire porte del router.
//!
//! Ogni installazione ha un'identità: una coppia di chiavi crittografiche.
//! La chiave pubblica, scritta in base32, è il **codice personale** da dare
//! agli amici (anche come QR). Le connessioni passano da iroh: QUIC cifrato
//! da un capo all'altro e autenticato con quelle chiavi, collegamento
//! diretto quando i router lo permettono, altrimenti un server ponte che
//! vede solo dati cifrati. Nessuno può fingersi un amico senza il suo PC.
//!
//! L'amicizia vale solo se confermata da entrambi. Chi non è un amico
//! confermato può solo chiedere l'amicizia: sfogliare la cartella condivisa
//! e mandare file restano riservati agli amici, e ogni invio va comunque
//! accettato, come in rete locale. La cartella condivisa si apre amico per
//! amico.
//!
//! Sopra il canale cifrato viaggiano le stesse richieste della rete locale
//! (`lan::Richiesta`), servite dallo stesso codice.

use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;
use crate::fs::paths;
use crate::lan::{
    avvisa, controlla, errore_io, leggi_json, manda_file, piano, prendi_file, scrivi_json, servi_richiesta,
    Avvisi, Lan, Permessi, Richiesta, Risposta,
};
use iroh::endpoint::{presets, Connection, RecvStream, SendStream};
use iroh::{Endpoint, EndpointId, SecretKey};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::runtime::Handle;
use tokio_util::io::SyncIoBridge;

pub const ALPN: &[u8] = b"space-train/amici/1";
pub const RADICE: &str = "::amici";
/// Davanti al codice di un amico quando lo si sceglie come destinatario
/// di un invio, per distinguerlo da un PC della rete locale.
pub const PREFISSO_INVIO: &str = "@";

/// Ogni quanto si controlla chi è in linea, e si riprovano i messaggi
/// d'amicizia che non sono ancora arrivati.
const GIRO: Duration = Duration::from_secs(20);
/// Un amico sentito più di così fa è considerato fuori linea.
const IN_LINEA: Duration = Duration::from_secs(50);
const ATTESA_CONNESSIONE: Duration = Duration::from_secs(15);
/// Richieste d'amicizia in sospeso accettate al massimo: oltre si ignorano,
/// così nessuno può riempire la lista mandandone a raffica.
const RICHIESTE_MASSIME: usize = 20;

pub const EVENTO: &str = "amici";
pub const EVENTO_RICHIESTA: &str = "amici-richiesta";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Stato {
    /// Amici da entrambe le parti.
    Confermato,
    /// L'abbiamo chiesta noi: si aspetta che l'altro accetti.
    Inviata,
    /// L'ha chiesta l'altro: tocca a noi accettare o rifiutare.
    Ricevuta,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Amico {
    /// Il suo codice personale.
    pub id: String,
    /// Il nome con cui si presenta.
    pub nome: String,
    pub stato: Stato,
    /// Può sfogliare e scaricare la nostra cartella condivisa.
    #[serde(default)]
    pub condividi: bool,
    /// L'altro sa già del nostro ultimo passo (richiesta o conferma).
    #[serde(default)]
    pub consegnata: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VistaAmico {
    #[serde(flatten)]
    pub amico: Amico,
    pub in_linea: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatoAmici {
    /// Il nostro codice personale, da dare agli amici.
    pub codice: String,
    /// La connessione è pronta: senza, gli amici non si raggiungono.
    pub pronto: bool,
    pub amici: Vec<VistaAmico>,
}

/// Il codice personale: la chiave pubblica in base32 minuscolo.
pub fn codice_di(id: &EndpointId) -> String {
    data_encoding::BASE32_NOPAD.encode(id.as_bytes()).to_lowercase()
}

/// Legge un codice scritto o incollato dall'utente: spazi, trattini e
/// maiuscole non contano.
pub fn leggi_codice(testo: &str) -> Option<EndpointId> {
    let pulito: String = testo.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    pulito.to_lowercase().parse::<EndpointId>().ok()
}

/// La chiave segreta, creata la prima volta e poi letta dal file. Non lascia
/// mai il PC: è ciò che dimostra agli amici che siamo davvero noi.
fn chiave(cartella_dati: &Path) -> SecretKey {
    let file = cartella_dati.join("amici.key");
    if let Ok(dati) = std::fs::read(&file) {
        if let Ok(byte) = <[u8; 32]>::try_from(dati.as_slice()) {
            return SecretKey::from_bytes(&byte);
        }
    }
    let nuova = SecretKey::generate();
    let _ = std::fs::create_dir_all(cartella_dati);
    let _ = std::fs::write(&file, nuova.to_bytes());
    nuova
}

/// Un flusso QUIC visto come `Read + Write`, per riusare il codice della rete
/// locale. Si usa solo da thread bloccanti.
struct Flusso {
    r: SyncIoBridge<RecvStream>,
    w: SyncIoBridge<SendStream>,
}

impl Flusso {
    fn nuovo(rt: &Handle, send: SendStream, recv: RecvStream) -> Self {
        Flusso {
            r: SyncIoBridge::new_with_handle(recv, rt.clone()),
            w: SyncIoBridge::new_with_handle(send, rt.clone()),
        }
    }

    /// Chiude il verso d'uscita: dall'altra parte la lettura finisce.
    fn chiudi(mut self) {
        let _ = self.w.shutdown();
    }

    /// Chiude il nostro verso e aspetta che l'altro chiuda il suo: solo
    /// allora ha letto tutto. Chiudere la connessione prima, con QUIC,
    /// può perdere gli ultimi dati ancora in viaggio.
    fn chiudi_e_aspetta(mut self) {
        let _ = self.w.shutdown();
        let mut avanzo = [0u8; 4096];
        while matches!(self.r.read(&mut avanzo), Ok(n) if n > 0) {}
    }
}

impl Read for Flusso {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.r.read(buf)
    }
}

impl Write for Flusso {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.w.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.w.flush()
    }
}

#[derive(Serialize, Deserialize, Default)]
struct FileAmici {
    #[serde(default)]
    amici: Vec<Amico>,
}

pub struct Amici {
    rt: Handle,
    codice: String,
    endpoint: OnceLock<Endpoint>,
    lista: Mutex<Vec<Amico>>,
    file: PathBuf,
    sentiti: Mutex<HashMap<String, Instant>>,
    lan: Arc<Lan>,
    avvisi: Avvisi,
}

fn errore(msg: impl Into<String>) -> FsError {
    FsError::Io { message: msg.into() }
}

impl Amici {
    /// Carica identità e amici e avvia la connessione in sottofondo: l'app
    /// parte subito, gli amici diventano raggiungibili appena è pronta.
    pub fn avvia(rt: Handle, cartella_dati: PathBuf, lan: Arc<Lan>, avvisi: Avvisi) -> Arc<Amici> {
        let segreta = chiave(&cartella_dati);
        let file = cartella_dati.join("amici.json");
        let salvati: FileAmici = std::fs::read(&file)
            .ok()
            .and_then(|d| serde_json::from_slice(&d).ok())
            .unwrap_or_default();
        let amici = Arc::new(Amici {
            rt: rt.clone(),
            codice: codice_di(&segreta.public()),
            endpoint: OnceLock::new(),
            lista: Mutex::new(salvati.amici),
            file,
            sentiti: Mutex::new(HashMap::new()),
            lan,
            avvisi,
        });

        let a = amici.clone();
        rt.spawn(async move {
            let endpoint = match Endpoint::builder(presets::N0)
                .secret_key(segreta)
                .alpns(vec![ALPN.to_vec()])
                .bind()
                .await
            {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("Amici: connessione non avviata: {e}");
                    return;
                }
            };
            let _ = a.endpoint.set(endpoint.clone());
            a.annuncia();
            let ascolto = a.clone();
            tokio::spawn(async move { ascolto.ascolta(endpoint).await });
            loop {
                a.clone().giro().await;
                tokio::time::sleep(GIRO).await;
            }
        });
        amici
    }

    pub fn stato(&self) -> StatoAmici {
        let sentiti = self.sentiti.lock().map(|s| s.clone()).unwrap_or_default();
        StatoAmici {
            codice: self.codice.clone(),
            pronto: self.endpoint.get().is_some(),
            amici: self
                .lista()
                .into_iter()
                .map(|amico| VistaAmico {
                    in_linea: sentiti.get(&amico.id).is_some_and(|t| t.elapsed() < IN_LINEA),
                    amico,
                })
                .collect(),
        }
    }

    fn lista(&self) -> Vec<Amico> {
        self.lista.lock().map(|l| l.clone()).unwrap_or_default()
    }

    fn amico(&self, id: &str) -> Option<Amico> {
        self.lista().into_iter().find(|a| a.id == id)
    }

    /// Cambia la lista e, se è cambiato qualcosa, la salva e avvisa le
    /// finestre: i controlli periodici di solito non cambiano niente.
    fn modifica(&self, f: impl FnOnce(&mut Vec<Amico>)) {
        let cambiata = match self.lista.lock() {
            Ok(mut l) => {
                let prima = l.clone();
                f(&mut l);
                if *l != prima {
                    let dati = serde_json::to_vec_pretty(&FileAmici { amici: l.clone() });
                    if let (Ok(d), Some(dir)) = (dati, self.file.parent()) {
                        let _ = std::fs::create_dir_all(dir);
                        let _ = std::fs::write(&self.file, d);
                    }
                }
                *l != prima
            }
            Err(_) => false,
        };
        if cambiata {
            self.annuncia();
        }
    }

    fn annuncia(&self) {
        avvisa(&self.avvisi, EVENTO, self.stato());
    }

    fn sentito(&self, id: &str) {
        if let Ok(mut s) = self.sentiti.lock() {
            s.insert(id.to_string(), Instant::now());
        }
    }

    // ── Chi ci contatta ───────────────────────────────────────────────

    async fn ascolta(self: Arc<Self>, endpoint: Endpoint) {
        while let Some(arrivo) = endpoint.accept().await {
            let a = self.clone();
            tokio::spawn(async move {
                let Ok(conn) = arrivo.await else { return };
                let chi = codice_di(&conn.remote_id());
                while let Ok((send, recv)) = conn.accept_bi().await {
                    let a = a.clone();
                    let chi = chi.clone();
                    let rt = a.rt.clone();
                    tokio::task::spawn_blocking(move || {
                        let mut s = Flusso::nuovo(&rt, send, recv);
                        if let Ok(r) = leggi_json::<Richiesta>(&mut s) {
                            let _ = a.servi(&chi, r, &mut s);
                        }
                        s.chiudi();
                    });
                }
            });
        }
    }

    /// Risponde a una richiesta arrivata da `chi`, già riconosciuto dalla
    /// sua chiave: nessuno può spacciarsi per un altro.
    fn servi(&self, chi: &str, richiesta: Richiesta, s: &mut Flusso) -> io::Result<()> {
        let amico = self.amico(chi);
        if amico.is_some() {
            self.sentito(chi);
        }
        let confermato = amico.as_ref().is_some_and(|a| a.stato == Stato::Confermato);
        match richiesta {
            Richiesta::Ciao { nome } => {
                if confermato {
                    self.modifica(|l| {
                        if let Some(a) = l.iter_mut().find(|a| a.id == chi) {
                            a.nome = nome_sicuro(&nome, &a.nome);
                        }
                    });
                }
                // A chi non è un amico non si dice nemmeno come ci si chiama.
                scrivi_json(
                    s,
                    &Risposta {
                        ok: true,
                        confermato,
                        nome: confermato.then(|| self.lan.nome().to_string()),
                        ..Default::default()
                    },
                )
            }
            Richiesta::Amicizia { nome } => {
                let confermato = self.ricevi_amicizia(chi, &nome);
                scrivi_json(
                    s,
                    &Risposta {
                        ok: true,
                        confermato,
                        nome: confermato.then(|| self.lan.nome().to_string()),
                        ..Default::default()
                    },
                )
            }
            Richiesta::Rimuovi => {
                self.modifica(|l| l.retain(|a| a.id != chi));
                scrivi_json(s, &Risposta { ok: true, ..Default::default() })
            }
            altra => {
                let Some(amico) = amico.filter(|_| confermato) else {
                    return scrivi_json(s, &Risposta::errore("Non siete amici su Space Train."));
                };
                let permessi = Permessi { condivisione: amico.condividi, mittente: Some(amico.nome.clone()) };
                servi_richiesta(&self.avvisi, &self.lan, s, altra, &permessi)
            }
        }
    }

    /// Qualcuno ci chiede l'amicizia, o accetta la nostra chiedendola a sua
    /// volta. Ritorna vero se ora l'amicizia è confermata.
    fn ricevi_amicizia(&self, chi: &str, nome: &str) -> bool {
        let prima = self.amico(chi);
        match prima.as_ref().map(|a| a.stato) {
            Some(Stato::Confermato) => true,
            Some(Stato::Inviata) => {
                // L'avevamo chiesta noi: questa è la sua conferma.
                self.modifica(|l| {
                    if let Some(a) = l.iter_mut().find(|a| a.id == chi) {
                        a.stato = Stato::Confermato;
                        a.nome = nome_sicuro(nome, &a.nome);
                        a.consegnata = true;
                    }
                });
                true
            }
            Some(Stato::Ricevuta) => false,
            None => {
                let in_sospeso = self.lista().iter().filter(|a| a.stato == Stato::Ricevuta).count();
                if in_sospeso >= RICHIESTE_MASSIME {
                    return false;
                }
                let nome = nome_sicuro(nome, "Sconosciuto");
                self.modifica(|l| {
                    l.push(Amico {
                        id: chi.to_string(),
                        nome: nome.clone(),
                        stato: Stato::Ricevuta,
                        condividi: false,
                        consegnata: true,
                    })
                });
                avvisa(&self.avvisi, EVENTO_RICHIESTA, serde_json::json!({ "id": chi, "nome": nome }));
                false
            }
        }
    }

    // ── Noi che contattiamo gli altri ─────────────────────────────────

    async fn connetti(&self, id: &str) -> Result<Connection, FsError> {
        let endpoint = self
            .endpoint
            .get()
            .ok_or_else(|| errore("La connessione con gli amici non è ancora pronta: riprova fra poco."))?;
        let chiave = leggi_codice(id).ok_or_else(|| errore("Codice non valido."))?;
        match tokio::time::timeout(ATTESA_CONNESSIONE, endpoint.connect(chiave, ALPN)).await {
            Ok(Ok(c)) => Ok(c),
            _ => Err(errore("Amico non raggiungibile: forse ha Space Train chiuso o è offline.")),
        }
    }

    /// Apre un flusso verso un amico e ci esegue `lavoro`. Da chiamare fuori
    /// dal runtime (da un thread bloccante): aspetta la connessione e poi
    /// lavora con letture e scritture normali.
    fn con_flusso<T>(&self, id: &str, lavoro: impl FnOnce(&mut Flusso) -> Result<T, FsError>) -> Result<T, FsError> {
        let (conn, send, recv) = self.rt.block_on(async {
            let conn = self.connetti(id).await?;
            let (send, recv) = conn
                .open_bi()
                .await
                .map_err(|e| errore(format!("Collegamento interrotto: {e}")))?;
            Ok::<_, FsError>((conn, send, recv))
        })?;
        let mut s = Flusso::nuovo(&self.rt, send, recv);
        let esito = lavoro(&mut s);
        s.chiudi_e_aspetta();
        drop(conn);
        if esito.is_ok() {
            self.sentito(id);
        }
        esito
    }

    /// Una richiesta breve con la sua risposta.
    fn chiedi(&self, id: &str, r: &Richiesta) -> Result<Risposta, FsError> {
        self.con_flusso(id, |s| {
            scrivi_json(s, r).map_err(errore_io)?;
            leggi_json(s).map_err(errore_io)
        })
    }

    /// Aggiunge un amico dal suo codice e gli manda la richiesta. Se ora non
    /// è raggiungibile, gliela si rimanda finché non arriva.
    pub fn aggiungi(&self, codice: &str) -> Result<(), FsError> {
        let id = leggi_codice(codice)
            .map(|k| codice_di(&k))
            .ok_or_else(|| errore("Codice non valido: controlla di averlo copiato intero."))?;
        if id == self.codice {
            return Err(errore("Questo è il tuo codice: serve quello dell'amico."));
        }
        match self.amico(&id).map(|a| a.stato) {
            Some(Stato::Ricevuta) => return self.accetta(&id),
            Some(_) => return Ok(()),
            None => {}
        }
        let provvisorio = format!("Amico {}", &id[..6]);
        self.modifica(|l| {
            l.push(Amico { id: id.clone(), nome: provvisorio, stato: Stato::Inviata, condividi: false, consegnata: false })
        });
        let _ = self.consegna(&id);
        Ok(())
    }

    /// Accetta una richiesta ricevuta.
    pub fn accetta(&self, id: &str) -> Result<(), FsError> {
        self.modifica(|l| {
            if let Some(a) = l.iter_mut().find(|a| a.id == id) {
                a.stato = Stato::Confermato;
                a.consegnata = false;
            }
        });
        let _ = self.consegna(id);
        Ok(())
    }

    /// Toglie un amico, o rifiuta la sua richiesta. Glielo si dice se è
    /// raggiungibile; altrimenti per lui resterà in attesa, senza poter fare
    /// niente.
    pub fn rimuovi(&self, id: &str) -> Result<(), FsError> {
        self.modifica(|l| l.retain(|a| a.id != id));
        let _ = self.chiedi(id, &Richiesta::Rimuovi);
        Ok(())
    }

    pub fn condividi(&self, id: &str, si: bool) {
        self.modifica(|l| {
            if let Some(a) = l.iter_mut().find(|a| a.id == id) {
                a.condividi = si;
            }
        });
    }

    /// Fa sapere all'altro la nostra richiesta o la nostra conferma.
    fn consegna(&self, id: &str) -> Result<(), FsError> {
        let r = self.chiedi(id, &Richiesta::Amicizia { nome: self.lan.nome().to_string() })?;
        self.modifica(|l| {
            if let Some(a) = l.iter_mut().find(|a| a.id == id) {
                a.consegnata = true;
                if r.confermato {
                    a.stato = Stato::Confermato;
                }
                if let Some(n) = &r.nome {
                    a.nome = nome_sicuro(n, &a.nome);
                }
            }
        });
        Ok(())
    }

    /// Un giro su tutti gli amici: chi è in linea, e le richieste o conferme
    /// che non erano ancora arrivate.
    async fn giro(self: Arc<Self>) {
        let lista = self.lista();
        let mut lavori = Vec::new();
        for amico in lista.into_iter().filter(|a| a.stato != Stato::Ricevuta) {
            let a = self.clone();
            lavori.push(tokio::task::spawn_blocking(move || {
                if !amico.consegnata {
                    let _ = a.consegna(&amico.id);
                    return;
                }
                let Ok(r) = a.chiedi(&amico.id, &Richiesta::Ciao { nome: a.lan.nome().to_string() }) else {
                    return;
                };
                a.modifica(|l| {
                    if let Some(x) = l.iter_mut().find(|x| x.id == amico.id) {
                        if let Some(n) = &r.nome {
                            x.nome = nome_sicuro(n, &x.nome);
                        }
                        // Per lui non siamo più amici (ci ha tolti mentre eravamo
                        // spenti): si torna ad aspettare una sua conferma.
                        if x.stato == Stato::Confermato && !r.confermato {
                            x.stato = Stato::Inviata;
                        } else if x.stato == Stato::Inviata && r.confermato {
                            x.stato = Stato::Confermato;
                        }
                    }
                });
            }));
        }
        for l in lavori {
            let _ = l.await;
        }
        self.annuncia();
    }

    // ── Cartelle condivise e invii ────────────────────────────────────

    /// Gli amici confermati come voci della posizione «Amici».
    pub fn voci(&self) -> Vec<Entry> {
        self.stato()
            .amici
            .into_iter()
            .filter(|v| v.amico.stato == Stato::Confermato)
            .map(|v| Entry {
                name: v.amico.nome.clone(),
                path: format!("{}\\{}", RADICE, v.amico.id),
                kind: EntryKind::Dir,
                size: 0,
                modified: None,
                hidden: false,
                origine: Some(if v.in_linea { "In linea".to_string() } else { "Non in linea".to_string() }),
                libero: None,
                totale: None,
                icona_propria: false,
            })
            .collect()
    }

    /// Il contenuto della cartella che un amico condivide con noi.
    pub fn elenca(&self, path: &str) -> Result<Vec<Entry>, FsError> {
        let (id, rel) = dividi(path).ok_or(FsError::NotFound)?;
        let r = self.con_flusso(&id, |s| {
            scrivi_json(s, &Richiesta::Elenca { path: rel }).map_err(errore_io)?;
            controlla(leggi_json(s).map_err(errore_io)?)
        })?;
        let base = path.trim_end_matches('\\');
        Ok(r.voci
            .into_iter()
            .map(|v| Entry {
                path: format!("{}\\{}", base, v.nome),
                name: v.nome,
                kind: if v.cartella { EntryKind::Dir } else { EntryKind::File },
                size: v.dimensione,
                modified: v.modificato,
                hidden: false,
                origine: None,
                libero: None,
                totale: None,
                icona_propria: false,
            })
            .collect())
    }

    /// Scarica elementi della cartella condivisa da un amico dentro `dest`.
    pub fn scarica(
        &self,
        sorgenti: &[String],
        dest: &str,
        annulla: &AtomicBool,
        avanzamento: &mut dyn FnMut(u64, u64),
    ) -> Result<Vec<[String; 2]>, FsError> {
        let mut coppie = Vec::new();
        let mut gia = 0u64;
        for sorgente in sorgenti {
            let (id, rel) = dividi(sorgente).ok_or(FsError::NotFound)?;
            let (creati, totale) = self.con_flusso(&id, |s| {
                scrivi_json(s, &Richiesta::Scarica { path: rel }).map_err(errore_io)?;
                let r = controlla(leggi_json(s).map_err(errore_io)?)?;
                let totale: u64 = r.contenuto.iter().map(|v| v.dimensione).sum();
                let creati = prendi_file(s, Path::new(dest), &r.contenuto, annulla, &mut |f| {
                    avanzamento(gia + f, gia + totale)
                })
                .map_err(errore_io)?;
                Ok((creati, totale))
            })?;
            gia += totale;
            if let Some(c) = creati.first() {
                coppie.push([sorgente.clone(), paths::display(c)]);
            }
        }
        Ok(coppie)
    }

    /// Manda file a un amico. Aspetta che lui accetti, come in rete locale.
    pub fn invia(
        &self,
        id: &str,
        sorgenti: &[String],
        annulla: &AtomicBool,
        avanzamento: &mut dyn FnMut(u64, u64),
    ) -> Result<(), FsError> {
        let piani: Vec<(PathBuf, Vec<crate::lan::Voce>)> = sorgenti
            .iter()
            .map(|p| {
                let path = PathBuf::from(p);
                let base = path.parent().unwrap_or(&path).to_path_buf();
                (base, piano(&path))
            })
            .collect();
        let voci: Vec<_> = piani.iter().flat_map(|(_, v)| v.clone()).collect();
        let totale: u64 = voci.iter().map(|v| v.dimensione).sum();
        let nome = self.lan.nome().to_string();
        self.con_flusso(id, |s| {
            scrivi_json(s, &Richiesta::Invia { da: nome, voci, totale }).map_err(errore_io)?;
            controlla(leggi_json(s).map_err(errore_io)?)?;
            let mut gia = 0u64;
            for (base, voci) in &piani {
                let parte: u64 = voci.iter().map(|v| v.dimensione).sum();
                manda_file(s, base, voci, annulla, &mut |f| avanzamento(gia + f, totale)).map_err(|e| {
                    use io::ErrorKind::*;
                    if matches!(e.kind(), BrokenPipe | ConnectionReset | ConnectionAborted) {
                        errore("L'amico ha interrotto il trasferimento.")
                    } else {
                        errore_io(e)
                    }
                })?;
                gia += parte;
            }
            s.flush().map_err(errore_io)
        })
    }
}

/// Un nome ricevuto da fuori, ripulito: niente caratteri di controllo né
/// lunghezze esagerate. Vuoto, resta quello di prima.
fn nome_sicuro(nome: &str, riserva: &str) -> String {
    let pulito: String = nome.chars().filter(|c| !c.is_control()).take(40).collect();
    let pulito = pulito.trim();
    if pulito.is_empty() {
        riserva.to_string()
    } else {
        pulito.to_string()
    }
}

/// Separa `::amici\<codice>\a\b` nel codice e nel path relativo `a/b`.
pub fn dividi(path: &str) -> Option<(String, String)> {
    let resto = path.strip_prefix(RADICE)?.strip_prefix('\\')?;
    let mut parti = resto.splitn(2, '\\');
    let id = parti.next().filter(|s| !s.is_empty())?.to_string();
    let rel = parti.next().unwrap_or("").replace('\\', "/");
    Some((id, rel))
}

/// Il genitore fra gli amici: cartella → amico → Amici.
pub fn genitore(path: &str) -> Option<String> {
    let (id, rel) = dividi(path)?;
    if rel.is_empty() {
        return Some(RADICE.to_string());
    }
    match rel.rsplit_once('/') {
        Some((su, _)) => Some(format!("{}\\{}\\{}", RADICE, id, su.replace('/', "\\"))),
        None => Some(format!("{}\\{}", RADICE, id)),
    }
}

/// Il QR code del codice personale, come SVG da mostrare.
pub fn qr(testo: &str) -> Result<String, FsError> {
    let codice = qrcode::QrCode::new(testo.as_bytes()).map_err(|e| errore(e.to_string()))?;
    Ok(codice
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(200, 200)
        .quiet_zone(true)
        .build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn il_codice_si_legge_anche_scritto_male() {
        let k = SecretKey::generate().public();
        let c = codice_di(&k);
        assert_eq!(c.len(), 52);
        assert_eq!(leggi_codice(&c), Some(k));
        // A gruppi, con spazi e maiuscole, come lo si copia da un messaggio.
        let a_gruppi: String = c
            .to_uppercase()
            .chars()
            .collect::<Vec<_>>()
            .chunks(4)
            .map(|g| g.iter().collect::<String>())
            .collect::<Vec<_>>()
            .join(" - ");
        assert_eq!(leggi_codice(&a_gruppi), Some(k));
        assert_eq!(leggi_codice("non è un codice"), None);
    }

    #[test]
    fn i_path_degli_amici_si_dividono_e_si_risale() {
        assert_eq!(dividi(r"::amici\abc\Foto\mare"), Some(("abc".into(), "Foto/mare".into())));
        assert_eq!(genitore(r"::amici\abc\Foto"), Some(r"::amici\abc".into()));
        assert_eq!(genitore(r"::amici\abc"), Some("::amici".into()));
        assert_eq!(dividi("::amici"), None);
    }

    #[test]
    fn i_nomi_da_fuori_si_ripuliscono() {
        assert_eq!(nome_sicuro("  Anna\n\u{7}  ", "x"), "Anna");
        assert_eq!(nome_sicuro("   ", "prima"), "prima");
        assert_eq!(nome_sicuro(&"a".repeat(100), "x").len(), 40);
    }

    #[test]
    fn il_qr_code_e_un_svg() {
        let svg = qr("abcdefgh").unwrap();
        assert!(svg.starts_with("<?xml") || svg.contains("<svg"));
    }

    /// Un PC con Space Train dentro il test, che accetta da solo ogni invio.
    fn pc_di_prova(rt: &tokio::runtime::Runtime, nome: &str, condivisa: Option<&Path>) -> (Arc<Amici>, PathBuf) {
        let dir = tempfile::tempdir().unwrap().keep();
        let config = crate::lan::Config {
            condivisa: condivisa.map(|p| p.to_string_lossy().into_owned()),
            ricevuti: Some(dir.join("ricevuti").to_string_lossy().into_owned()),
            ..Default::default()
        };
        let lan = Arc::new(Lan::nuovo(nome.into(), nome.into(), config, dir.join("lan.json")));
        let per_avvisi = lan.clone();
        let avvisi: Avvisi = Arc::new(move |evento: &str, dato: serde_json::Value| {
            if evento == "lan-richiesta" {
                let id = dato["id"].as_u64().unwrap();
                let lan = per_avvisi.clone();
                std::thread::spawn(move || lan.rispondi(id, true));
            }
        });
        let amici = Amici::avvia(rt.handle().clone(), dir.clone(), lan, avvisi);
        (amici, dir.join("ricevuti"))
    }

    fn aspetta(cosa: &str, mut f: impl FnMut() -> bool) {
        let inizio = Instant::now();
        while !f() {
            assert!(inizio.elapsed() < Duration::from_secs(60), "troppo tempo ad aspettare: {cosa}");
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    /// Due PC diventano amici, si sfogliano, scaricano e si mandano file,
    /// poi uno toglie l'altro. Passa davvero da internet: si lancia a mano
    /// con `cargo test --lib amici -- --ignored`.
    #[test]
    #[ignore = "usa internet"]
    fn due_amici_su_internet() {
        let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        let d = tempfile::tempdir().unwrap();
        let condivisa = d.path().join("condivisa");
        std::fs::create_dir_all(condivisa.join("Foto")).unwrap();
        std::fs::write(condivisa.join("Foto").join("mare.jpg"), vec![7u8; 300_000]).unwrap();
        let (anna, ricevuti_anna) = pc_di_prova(&rt, "Anna", Some(&condivisa));
        let (bruno, _) = pc_di_prova(&rt, "Bruno", None);
        aspetta("connessioni pronte", || anna.stato().pronto && bruno.stato().pronto);
        // Il tempo di pubblicare dove ci si trova, come all'avvio dell'app.
        for a in [&anna, &bruno] {
            let e = a.endpoint.get().unwrap().clone();
            rt.block_on(async { tokio::time::timeout(Duration::from_secs(30), e.online()).await.unwrap() });
        }

        // Anna chiede, Bruno vede la richiesta e accetta.
        anna.aggiungi(&bruno.stato().codice).unwrap();
        let codice_anna = anna.stato().codice;
        aspetta("richiesta arrivata", || bruno.amico(&codice_anna).is_some_and(|a| a.stato == Stato::Ricevuta));
        assert_eq!(bruno.amico(&codice_anna).unwrap().nome, "Anna");
        // Prima della conferma, niente cartella né invii.
        assert!(bruno.elenca(&format!("{RADICE}\\{codice_anna}")).is_err());
        bruno.accetta(&codice_anna).unwrap();
        let codice_bruno = bruno.stato().codice;
        assert_eq!(anna.amico(&codice_bruno).unwrap().stato, Stato::Confermato);
        assert_eq!(anna.amico(&codice_bruno).unwrap().nome, "Bruno");

        // La cartella si vede solo dopo che Anna la condivide con Bruno.
        let radice = format!("{RADICE}\\{codice_anna}");
        assert!(bruno.elenca(&radice).is_err());
        anna.condividi(&codice_bruno, true);
        let voci = bruno.elenca(&radice).unwrap();
        assert_eq!(voci.iter().map(|v| v.name.as_str()).collect::<Vec<_>>(), ["Foto"]);
        let dest = d.path().join("scaricati");
        std::fs::create_dir_all(&dest).unwrap();
        bruno
            .scarica(&[format!("{radice}\\Foto")], &dest.to_string_lossy(), &AtomicBool::new(false), &mut |_, _| {})
            .unwrap();
        assert_eq!(std::fs::read(dest.join("Foto").join("mare.jpg")).unwrap().len(), 300_000);

        // Bruno manda un file ad Anna, che lo accetta.
        let file = d.path().join("lettera.txt");
        std::fs::write(&file, b"ciao Anna").unwrap();
        bruno
            .invia(&codice_anna, &[file.to_string_lossy().into_owned()], &AtomicBool::new(false), &mut |_, _| {})
            .unwrap();
        assert_eq!(std::fs::read(ricevuti_anna.join("lettera.txt")).unwrap(), b"ciao Anna");

        // Bruno toglie Anna: lei lo sa subito, e lui non vede più niente.
        bruno.rimuovi(&codice_anna).unwrap();
        assert!(anna.amico(&codice_bruno).is_none());
        assert!(anna.invia(&codice_bruno, &[file.to_string_lossy().into_owned()], &AtomicBool::new(false), &mut |_, _| {}).is_err());
    }

    #[test]
    fn la_chiave_resta_la_stessa_fra_un_avvio_e_l_altro() {
        let d = tempfile::tempdir().unwrap();
        let prima = chiave(d.path()).public();
        let dopo = chiave(d.path()).public();
        assert_eq!(prima, dopo);
    }
}
