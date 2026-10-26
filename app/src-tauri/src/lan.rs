//! Rete locale fra copie di Space Train: trovarsi, scambiarsi file,
//! sfogliare la cartella che un altro PC ha deciso di condividere.
//!
//! - Scoperta: ogni copia visibile annuncia sé stessa in broadcast UDP e
//!   ascolta gli annunci delle altre.
//! - Dati: un server TCP risponde a tre richieste — elenca una cartella
//!   condivisa, scarica da lì, ricevi file inviati. Ricevere chiede sempre
//!   il consenso dell'utente; la condivisione è in sola lettura.
//!
//! Il traffico non è cifrato: è pensato per la rete di casa o dell'ufficio,
//! non per reti pubbliche. Nessun path che arriva dalla rete può uscire
//! dalla cartella condivisa o da quella dei ricevuti.

use crate::fs::copy::unique_name;
use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;
use crate::fs::paths;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::Emitter;

/// Come il servizio avvisa il frontend. Nell'app è `AppHandle::emit`; nei
/// test una funzione qualsiasi, così il server gira senza una finestra.
pub type Avvisi = Arc<dyn Fn(&str, serde_json::Value) + Send + Sync>;

fn avvisa<T: Serialize>(avvisi: &Avvisi, nome: &str, dato: T) {
    if let Ok(v) = serde_json::to_value(dato) {
        avvisi(nome, v);
    }
}

pub const RADICE: &str = "::lan";
pub const PORTA_ANNUNCI: u16 = 47820;
pub const PORTA_DATI: u16 = 47821;

const OGNI: Duration = Duration::from_secs(3);
/// Un PC che non si annuncia da così tanto si considera spento.
const SCADENZA: Duration = Duration::from_secs(12);
/// Quanto aspetta chi invia che l'altro accetti o rifiuti.
const ATTESA_CONSENSO: Duration = Duration::from_secs(120);
const MASSIMO_INTESTAZIONE: usize = 16 * 1024 * 1024;

// ── Dati condivisi con il frontend ──────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// Questo PC si annuncia e risponde agli altri.
    pub visibile: bool,
    /// Cartella che gli altri possono sfogliare e da cui possono copiare.
    pub condivisa: Option<String>,
    /// Dove finiscono i file ricevuti. Assente = Download\Space Train.
    pub ricevuti: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Stato {
    pub id: String,
    pub nome: String,
    /// La cartella dei ricevuti effettiva, anche quando è quella predefinita.
    pub cartella_ricevuti: String,
    #[serde(flatten)]
    pub config: Config,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Pari {
    pub id: String,
    pub nome: String,
    pub ip: String,
    pub porta: u16,
    /// Nome della cartella che condivide, se ne condivide una.
    pub condivisa: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RichiestaInvio {
    pub id: u64,
    pub da: String,
    pub quanti: usize,
    pub totale: u64,
    /// I primi nomi, per far capire all'utente che cosa sta arrivando.
    pub nomi: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Ricezione {
    pub id: u64,
    pub fatti: u64,
    pub totale: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Ricevuto {
    pub id: u64,
    pub da: String,
    pub cartella: String,
    pub quanti: usize,
    pub errore: Option<String>,
}

// ── Protocollo ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct Annuncio {
    app: String,
    v: u32,
    id: String,
    nome: String,
    porta: u16,
    condivisa: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "tipo", rename_all = "camelCase")]
enum Richiesta {
    Elenca { path: String },
    Scarica { path: String },
    Invia { da: String, voci: Vec<Voce>, totale: u64 },
}

/// Un elemento in viaggio. `rel` usa `/` come separatore e parte dal nome
/// dell'elemento scelto, così la destinazione ricostruisce l'albero.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Voce {
    rel: String,
    dimensione: u64,
    cartella: bool,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VoceRemota {
    nome: String,
    cartella: bool,
    dimensione: u64,
    modificato: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct Risposta {
    ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    errore: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    voci: Vec<VoceRemota>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    contenuto: Vec<Voce>,
}

impl Risposta {
    fn errore(msg: impl Into<String>) -> Self {
        Risposta { ok: false, errore: Some(msg.into()), ..Default::default() }
    }
}

fn scrivi_json<T: Serialize>(s: &mut impl Write, v: &T) -> io::Result<()> {
    let dati = serde_json::to_vec(v).map_err(io::Error::other)?;
    s.write_all(&(dati.len() as u32).to_be_bytes())?;
    s.write_all(&dati)?;
    s.flush()
}

fn leggi_json<T: for<'de> Deserialize<'de>>(s: &mut impl Read) -> io::Result<T> {
    let mut lunghezza = [0u8; 4];
    s.read_exact(&mut lunghezza)?;
    let n = u32::from_be_bytes(lunghezza) as usize;
    if n > MASSIMO_INTESTAZIONE {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "intestazione troppo grande"));
    }
    let mut dati = vec![0u8; n];
    s.read_exact(&mut dati)?;
    serde_json::from_slice(&dati).map_err(io::Error::other)
}

/// Un path relativo arrivato dalla rete, solo se non può uscire dalla
/// cartella a cui verrà attaccato: niente `..`, radici o lettere di unità.
fn rel_sicuro(rel: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for parte in rel.split(['/', '\\']).filter(|p| !p.is_empty()) {
        if parte == "." || parte == ".." || parte.contains(':') {
            return None;
        }
        let p = Path::new(parte);
        if !matches!(p.components().next(), Some(Component::Normal(_))) || p.components().count() != 1 {
            return None;
        }
        out.push(parte);
    }
    Some(out)
}

/// `rel` dentro `radice`, verificato anche dopo aver risolto i collegamenti.
fn dentro(radice: &Path, rel: &str) -> Option<PathBuf> {
    let unito = radice.join(rel_sicuro(rel)?);
    let base = std::fs::canonicalize(paths::extended(radice)).ok()?;
    let reale = std::fs::canonicalize(paths::extended(&unito)).ok()?;
    reale.starts_with(&base).then_some(unito)
}

fn errore_io(e: io::Error) -> FsError {
    FsError::Io { message: format!("Rete locale: {}", e) }
}

// ── Stato del servizio ───────────────────────────────────────────────

pub struct Lan {
    pub id: String,
    pub nome: String,
    config: Mutex<Config>,
    file_config: PathBuf,
    pari: Mutex<HashMap<String, (Pari, Instant)>>,
    richieste: Mutex<HashMap<u64, mpsc::Sender<bool>>>,
    prossima: AtomicU64,
}

#[derive(Serialize, Deserialize, Default)]
struct FileConfig {
    id: Option<String>,
    #[serde(flatten)]
    config: Config,
}

impl Lan {
    /// Carica identità e preferenze e avvia i thread di rete.
    pub fn avvia(app: tauri::AppHandle, cartella_dati: PathBuf) -> Arc<Lan> {
        let file_config = cartella_dati.join("lan.json");
        let salvato: FileConfig = std::fs::read(&file_config)
            .ok()
            .and_then(|d| serde_json::from_slice(&d).ok())
            .unwrap_or_default();

        let nome = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".to_string());
        // L'id è leggibile — nome del PC più un suffisso — perché compare
        // nella barra degli indirizzi quando si sfoglia l'altro PC.
        let id = salvato.id.clone().unwrap_or_else(|| {
            let casuale = std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.subsec_nanos() ^ std::process::id())
                .unwrap_or(0);
            format!("{}-{:04x}", nome.replace(['\\', '/', ' '], "-"), casuale & 0xffff)
        });

        let lan = Arc::new(Lan::nuovo(id, nome, salvato.config, file_config));
        lan.salva();

        let avvisi: Avvisi = Arc::new(move |nome: &str, dato: serde_json::Value| {
            // Il consenso e l'avanzamento di una ricezione si mostrano in una
            // finestra sola, l'ultima usata; la lista dei PC vale per tutte.
            if nome == "lan-pari" {
                let _ = app.emit(nome, dato);
            } else {
                let w = crate::finestre::ultima(&app);
                let _ = app.emit_to(w.label(), nome, dato);
            }
        });
        avvia_scoperta(avvisi.clone(), lan.clone());
        if let Ok(server) = TcpListener::bind(("0.0.0.0", PORTA_DATI)) {
            avvia_server(avvisi, lan.clone(), server);
        } else {
            eprintln!("Rete locale: porta {} occupata, server disattivato", PORTA_DATI);
        }
        lan
    }

    fn nuovo(id: String, nome: String, config: Config, file_config: PathBuf) -> Lan {
        Lan {
            id,
            nome,
            config: Mutex::new(config),
            file_config,
            pari: Mutex::new(HashMap::new()),
            richieste: Mutex::new(HashMap::new()),
            prossima: AtomicU64::new(1),
        }
    }

    pub fn stato(&self) -> Stato {
        Stato {
            id: self.id.clone(),
            nome: self.nome.clone(),
            cartella_ricevuti: paths::display(&self.cartella_ricevuti()),
            config: self.config(),
        }
    }

    pub fn config(&self) -> Config {
        self.config.lock().map(|c| c.clone()).unwrap_or_default()
    }

    pub fn imposta(&self, nuova: Config) {
        if let Ok(mut c) = self.config.lock() {
            *c = nuova;
        }
        self.salva();
    }

    fn salva(&self) {
        let f = FileConfig { id: Some(self.id.clone()), config: self.config() };
        if let Some(dir) = self.file_config.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(d) = serde_json::to_vec_pretty(&f) {
            let _ = std::fs::write(&self.file_config, d);
        }
    }

    /// I PC sentiti di recente, ordinati per nome.
    pub fn pari(&self) -> Vec<Pari> {
        let mut v: Vec<Pari> = self
            .pari
            .lock()
            .map(|m| {
                m.values()
                    .filter(|(_, visto)| visto.elapsed() < SCADENZA)
                    .map(|(p, _)| p.clone())
                    .collect()
            })
            .unwrap_or_default();
        v.sort_by(|a, b| a.nome.to_lowercase().cmp(&b.nome.to_lowercase()));
        v
    }

    fn indirizzo(&self, id: &str) -> Result<SocketAddr, FsError> {
        self.pari()
            .into_iter()
            .find(|p| p.id == id)
            .and_then(|p| p.ip.parse::<IpAddr>().ok().map(|ip| SocketAddr::new(ip, p.porta)))
            .ok_or_else(|| FsError::Io {
                message: "Questo PC non è più raggiungibile in rete locale.".to_string(),
            })
    }

    fn cartella_ricevuti(&self) -> PathBuf {
        self.config()
            .ricevuti
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let casa = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
                Path::new(&casa).join("Downloads").join("Space Train")
            })
    }

    /// La risposta dell'utente a una richiesta d'invio.
    pub fn rispondi(&self, id: u64, accetta: bool) {
        if let Some(tx) = self.richieste.lock().ok().and_then(|mut m| m.remove(&id)) {
            let _ = tx.send(accetta);
        }
    }
}

// ── Scoperta ─────────────────────────────────────────────────────────

fn avvia_scoperta(avvisi: Avvisi, lan: Arc<Lan>) {
    let Ok(socket) = UdpSocket::bind(("0.0.0.0", PORTA_ANNUNCI)) else {
        eprintln!("Rete locale: porta {} occupata, scoperta disattivata", PORTA_ANNUNCI);
        return;
    };
    let _ = socket.set_broadcast(true);
    let _ = socket.set_read_timeout(Some(Duration::from_secs(1)));
    let Ok(invio) = socket.try_clone() else { return };

    // Annunci periodici, solo se l'utente ha reso visibile questo PC.
    let lan_a = lan.clone();
    std::thread::Builder::new()
        .name("lan-annunci".into())
        .spawn(move || loop {
            let c = lan_a.config();
            if c.visibile {
                let a = Annuncio {
                    app: "space-train".into(),
                    v: 1,
                    id: lan_a.id.clone(),
                    nome: lan_a.nome.clone(),
                    porta: PORTA_DATI,
                    condivisa: c.condivisa.as_deref().map(crate::shell::nome_di),
                };
                if let Ok(d) = serde_json::to_vec(&a) {
                    let _ = invio.send_to(&d, ("255.255.255.255", PORTA_ANNUNCI));
                }
            }
            std::thread::sleep(OGNI);
        })
        .ok();

    std::thread::Builder::new()
        .name("lan-ascolto".into())
        .spawn(move || {
            let mut buf = [0u8; 2048];
            let mut ultimi: Vec<Pari> = Vec::new();
            loop {
                if let Ok((n, da)) = socket.recv_from(&mut buf) {
                    if let Ok(a) = serde_json::from_slice::<Annuncio>(&buf[..n]) {
                        if a.app == "space-train" && a.id != lan.id {
                            let p = Pari {
                                id: a.id.clone(),
                                nome: a.nome,
                                ip: da.ip().to_string(),
                                porta: a.porta,
                                condivisa: a.condivisa,
                            };
                            if let Ok(mut m) = lan.pari.lock() {
                                m.insert(a.id, (p, Instant::now()));
                            }
                        }
                    }
                }
                // Avvisa il frontend solo quando la lista cambia davvero.
                let ora = lan.pari();
                if ora != ultimi {
                    avvisa(&avvisi, "lan-pari", &ora);
                    ultimi = ora;
                }
            }
        })
        .ok();
}

// ── Server ───────────────────────────────────────────────────────────

fn avvia_server(avvisi: Avvisi, lan: Arc<Lan>, server: TcpListener) {
    std::thread::Builder::new()
        .name("lan-server".into())
        .spawn(move || {
            for conn in server.incoming().flatten() {
                let avvisi = avvisi.clone();
                let lan = lan.clone();
                std::thread::spawn(move || {
                    let _ = servi(avvisi, lan, conn);
                });
            }
        })
        .ok();
}

fn servi(avvisi: Avvisi, lan: Arc<Lan>, mut s: TcpStream) -> io::Result<()> {
    let _ = s.set_read_timeout(Some(Duration::from_secs(30)));
    let richiesta: Richiesta = leggi_json(&mut s)?;
    let config = lan.config();

    // Un PC non visibile non risponde a nessuno: invisibile davvero.
    if !config.visibile {
        return scrivi_json(&mut s, &Risposta::errore("Questo PC non è visibile in rete locale."));
    }

    match richiesta {
        Richiesta::Elenca { path } => {
            let Some(radice) = config.condivisa.as_deref().map(PathBuf::from) else {
                return scrivi_json(&mut s, &Risposta::errore("Questo PC non condivide nessuna cartella."));
            };
            let Some(cartella) = dentro(&radice, &path) else {
                return scrivi_json(&mut s, &Risposta::errore("Cartella non trovata."));
            };
            let voci = elenca_locale(&cartella);
            scrivi_json(&mut s, &Risposta { ok: true, voci, ..Default::default() })
        }
        Richiesta::Scarica { path } => {
            let Some(radice) = config.condivisa.as_deref().map(PathBuf::from) else {
                return scrivi_json(&mut s, &Risposta::errore("Questo PC non condivide nessuna cartella."));
            };
            let Some(sorgente) = dentro(&radice, &path) else {
                return scrivi_json(&mut s, &Risposta::errore("Elemento non trovato."));
            };
            let contenuto = piano(&sorgente);
            scrivi_json(&mut s, &Risposta { ok: true, contenuto: contenuto.clone(), ..Default::default() })?;
            let base = sorgente.parent().unwrap_or(&sorgente).to_path_buf();
            manda_file(&mut s, &base, &contenuto, &AtomicBool::new(false), &mut |_| {})
        }
        Richiesta::Invia { da, voci, totale } => ricevi(avvisi, lan, s, da, voci, totale),
    }
}

fn elenca_locale(cartella: &Path) -> Vec<VoceRemota> {
    let Ok(rd) = std::fs::read_dir(paths::extended(cartella)) else { return Vec::new() };
    rd.filter_map(|d| d.ok())
        .filter_map(|d| crate::fs::entry::entry_from_dir_entry(&d))
        .filter(|e| !e.hidden)
        .map(|e| VoceRemota {
            nome: e.name,
            cartella: e.kind == EntryKind::Dir,
            dimensione: e.size,
            modificato: e.modified,
        })
        .collect()
}

/// Tutto ciò che va spedito per `sorgente`: lei stessa e, se è una
/// cartella, il suo contenuto. I path partono dal nome di `sorgente`.
fn piano(sorgente: &Path) -> Vec<Voce> {
    let base = sorgente.parent().unwrap_or(sorgente);
    let mut out = Vec::new();
    let mut pila = vec![sorgente.to_path_buf()];
    while let Some(p) = pila.pop() {
        let Ok(meta) = std::fs::symlink_metadata(paths::extended(&p)) else { continue };
        let rel = p
            .strip_prefix(base)
            .map(|r| r.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if meta.is_dir() {
            out.push(Voce { rel, dimensione: 0, cartella: true });
            if let Ok(rd) = std::fs::read_dir(paths::extended(&p)) {
                let mut figli: Vec<PathBuf> = rd.filter_map(|d| d.ok()).map(|d| d.path()).collect();
                figli.sort();
                for f in figli.into_iter().rev() {
                    pila.push(PathBuf::from(paths::display(&f)));
                }
            }
        } else if meta.is_file() {
            out.push(Voce { rel, dimensione: meta.len(), cartella: false });
        }
    }
    out
}

/// Spedisce i byte dei file del piano, uno dopo l'altro, nella stessa
/// misura annunciata: chi riceve legge esattamente `dimensione` byte.
fn manda_file(
    s: &mut impl Write,
    base: &Path,
    voci: &[Voce],
    annulla: &AtomicBool,
    avanzamento: &mut dyn FnMut(u64),
) -> io::Result<()> {
    let mut fatti = 0u64;
    let mut buf = vec![0u8; 256 * 1024];
    for v in voci.iter().filter(|v| !v.cartella) {
        let path = base.join(rel_sicuro(&v.rel).unwrap_or_default());
        let mut f = std::fs::File::open(paths::extended(&path))?.take(v.dimensione);
        let mut mandati = 0u64;
        loop {
            if annulla.load(Ordering::Relaxed) {
                return Err(io::Error::new(io::ErrorKind::Interrupted, "annullato"));
            }
            let n = f.read(&mut buf)?;
            if n == 0 {
                break;
            }
            s.write_all(&buf[..n])?;
            mandati += n as u64;
            fatti += n as u64;
            avanzamento(fatti);
        }
        // Un file accorciato nel frattempo: si completa con zeri per non
        // sfasare tutti quelli che seguono.
        if mandati < v.dimensione {
            let zeri = vec![0u8; (v.dimensione - mandati) as usize];
            s.write_all(&zeri)?;
        }
    }
    s.flush()
}

/// Legge i byte annunciati e li scrive sotto `dest`. Ritorna i path di
/// primo livello creati, già con il nome libero scelto.
fn prendi_file(
    s: &mut impl Read,
    dest: &Path,
    voci: &[Voce],
    annulla: &AtomicBool,
    avanzamento: &mut dyn FnMut(u64),
) -> io::Result<Vec<PathBuf>> {
    std::fs::create_dir_all(paths::extended(dest))?;
    // Ogni elemento di primo livello riceve un nome libero a destinazione;
    // tutto ciò che sta sotto segue il nome scelto.
    let mut rinomine: HashMap<String, String> = HashMap::new();
    let mut creati = Vec::new();
    let mut fatti = 0u64;
    let mut buf = vec![0u8; 256 * 1024];

    for v in voci {
        let rel = rel_sicuro(&v.rel)
            .filter(|r| r.components().count() > 0)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "path non valido"))?;
        let primo = rel.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned()).unwrap_or_default();
        let scelto = rinomine.entry(primo.clone()).or_insert_with(|| {
            let n = unique_name(dest, &primo);
            creati.push(dest.join(&n));
            n
        });
        let mut arrivo = dest.join(scelto.as_str());
        for c in rel.components().skip(1) {
            arrivo.push(c);
        }

        if v.cartella {
            std::fs::create_dir_all(paths::extended(&arrivo))?;
            continue;
        }
        if let Some(g) = arrivo.parent() {
            std::fs::create_dir_all(paths::extended(g))?;
        }
        let mut out = std::fs::File::create(paths::extended(&arrivo))?;
        let mut resto = v.dimensione;
        while resto > 0 {
            if annulla.load(Ordering::Relaxed) {
                return Err(io::Error::new(io::ErrorKind::Interrupted, "annullato"));
            }
            let quanto = (resto as usize).min(buf.len());
            s.read_exact(&mut buf[..quanto])?;
            out.write_all(&buf[..quanto])?;
            resto -= quanto as u64;
            fatti += quanto as u64;
            avanzamento(fatti);
        }
    }
    Ok(creati)
}

fn ricevi(
    avvisi: Avvisi,
    lan: Arc<Lan>,
    mut s: TcpStream,
    da: String,
    voci: Vec<Voce>,
    totale: u64,
) -> io::Result<()> {
    // Tutti i path vengono controllati prima di chiedere il consenso.
    if voci.iter().any(|v| rel_sicuro(&v.rel).is_none_or(|r| r.as_os_str().is_empty())) {
        return scrivi_json(&mut s, &Risposta::errore("Richiesta non valida."));
    }

    let id = lan.prossima.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    if let Ok(mut m) = lan.richieste.lock() {
        m.insert(id, tx);
    }
    let primi: Vec<String> = voci
        .iter()
        .filter(|v| !v.rel.contains('/'))
        .map(|v| v.rel.clone())
        .collect();
    avvisa(
        &avvisi,
        "lan-richiesta",
        RichiestaInvio { id, da: da.clone(), quanti: primi.len(), totale, nomi: primi.iter().take(8).cloned().collect() },
    );

    let accetta = rx.recv_timeout(ATTESA_CONSENSO).unwrap_or(false);
    if let Ok(mut m) = lan.richieste.lock() {
        m.remove(&id);
    }
    if !accetta {
        return scrivi_json(&mut s, &Risposta::errore("Il destinatario ha rifiutato."));
    }
    scrivi_json(&mut s, &Risposta { ok: true, ..Default::default() })?;

    let dest = lan.cartella_ricevuti();
    let _ = s.set_read_timeout(Some(Duration::from_secs(60)));
    let mut ultimo = Instant::now();
    let esito = prendi_file(&mut s, &dest, &voci, &AtomicBool::new(false), &mut |fatti| {
        if ultimo.elapsed() >= Duration::from_millis(100) {
            ultimo = Instant::now();
            avvisa(&avvisi, "lan-ricezione", Ricezione { id, fatti, totale });
        }
    });

    avvisa(
        &avvisi,
        "lan-ricevuto",
        Ricevuto {
            id,
            da,
            cartella: paths::display(&dest),
            quanti: esito.as_ref().map(|c| c.len()).unwrap_or(0),
            errore: esito.as_ref().err().map(|e| e.to_string()),
        },
    );
    Ok(())
}

// ── Lato client ──────────────────────────────────────────────────────

/// Separa `::lan\<id>\a\b` in id e path relativo `a/b`.
pub fn dividi(path: &str) -> Option<(String, String)> {
    let resto = path.strip_prefix(RADICE)?.strip_prefix('\\')?;
    let mut parti = resto.splitn(2, '\\');
    let id = parti.next().filter(|s| !s.is_empty())?.to_string();
    let rel = parti.next().unwrap_or("").replace('\\', "/");
    Some((id, rel))
}

/// Il genitore dentro la rete locale: cartella → PC → Rete locale.
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

fn connetti(lan: &Lan, id: &str) -> Result<TcpStream, FsError> {
    let indirizzo = lan.indirizzo(id)?;
    let s = TcpStream::connect_timeout(&indirizzo, Duration::from_secs(5)).map_err(errore_io)?;
    let _ = s.set_read_timeout(Some(Duration::from_secs(30)));
    Ok(s)
}

fn controlla(r: Risposta) -> Result<Risposta, FsError> {
    if r.ok {
        Ok(r)
    } else {
        Err(FsError::Io { message: r.errore.unwrap_or_else(|| "Richiesta rifiutata.".into()) })
    }
}

/// I PC in rete come voci della posizione «Rete locale».
pub fn voci_pari(lan: &Lan) -> Vec<Entry> {
    lan.pari()
        .into_iter()
        .map(|p| Entry {
            name: p.nome.clone(),
            path: format!("{}\\{}", RADICE, p.id),
            kind: EntryKind::Dir,
            size: 0,
            modified: None,
            hidden: false,
            origine: p.condivisa.map(|c| format!("condivide «{}»", c)),
            libero: None,
            totale: None,
            icona_propria: false,
        })
        .collect()
}

/// Il contenuto di una cartella condivisa da un altro PC.
pub fn elenca_remoto(lan: &Lan, path: &str) -> Result<Vec<Entry>, FsError> {
    let (id, rel) = dividi(path).ok_or(FsError::NotFound)?;
    let mut s = connetti(lan, &id)?;
    scrivi_json(&mut s, &Richiesta::Elenca { path: rel }).map_err(errore_io)?;
    let r = controlla(leggi_json(&mut s).map_err(errore_io)?)?;
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

/// Scarica elementi dalla cartella condivisa di un altro PC dentro `dest`.
/// Ritorna le coppie sorgente → path creato.
pub fn scarica(
    lan: &Lan,
    sorgenti: &[String],
    dest: &str,
    annulla: &AtomicBool,
    avanzamento: &mut dyn FnMut(u64, u64),
) -> Result<Vec<[String; 2]>, FsError> {
    let mut coppie = Vec::new();
    let mut gia = 0u64;
    for sorgente in sorgenti {
        let (id, rel) = dividi(sorgente).ok_or(FsError::NotFound)?;
        let mut s = connetti(lan, &id)?;
        scrivi_json(&mut s, &Richiesta::Scarica { path: rel }).map_err(errore_io)?;
        let r = controlla(leggi_json(&mut s).map_err(errore_io)?)?;
        let totale: u64 = r.contenuto.iter().map(|v| v.dimensione).sum();
        let creati = prendi_file(&mut s, Path::new(dest), &r.contenuto, annulla, &mut |f| {
            avanzamento(gia + f, gia + totale)
        })
        .map_err(errore_io)?;
        gia += totale;
        if let Some(c) = creati.first() {
            coppie.push([sorgente.clone(), paths::display(c)]);
        }
    }
    Ok(coppie)
}

/// Invia file locali a un altro PC. Attende che l'altro accetti.
pub fn invia(
    lan: &Lan,
    id: &str,
    sorgenti: &[String],
    annulla: &AtomicBool,
    avanzamento: &mut dyn FnMut(u64, u64),
) -> Result<(), FsError> {
    let mut s = connetti(lan, id)?;
    // Sorgenti da cartelle diverse: ognuna con la sua base, nello stesso flusso.
    let piani: Vec<(PathBuf, Vec<Voce>)> = sorgenti
        .iter()
        .map(|p| {
            let path = PathBuf::from(p);
            let base = path.parent().unwrap_or(&path).to_path_buf();
            (base, piano(&path))
        })
        .collect();
    let voci: Vec<Voce> = piani.iter().flat_map(|(_, v)| v.clone()).collect();
    let totale: u64 = voci.iter().map(|v| v.dimensione).sum();

    scrivi_json(&mut s, &Richiesta::Invia { da: lan.nome.clone(), voci, totale }).map_err(errore_io)?;
    // Il destinatario ha tempo di leggere e decidere.
    let _ = s.set_read_timeout(Some(ATTESA_CONSENSO + Duration::from_secs(5)));
    controlla(leggi_json(&mut s).map_err(errore_io)?)?;

    let mut gia = 0u64;
    for (base, voci) in &piani {
        let parte: u64 = voci.iter().map(|v| v.dimensione).sum();
        manda_file(&mut s, base, voci, annulla, &mut |f| avanzamento(gia + f, totale)).map_err(errore_io)?;
        gia += parte;
    }
    Ok(())
}

/// Scarica un file remoto in una cartella temporanea e lo apre.
pub fn apri(lan: &Lan, path: &str) -> Result<(), FsError> {
    let temp = std::env::temp_dir().join("SpaceTrain-rete");
    let coppie = scarica(lan, &[path.to_string()], &temp.to_string_lossy(), &AtomicBool::new(false), &mut |_, _| {})?;
    let locale = coppie.first().map(|c| c[1].clone()).ok_or(FsError::NotFound)?;
    crate::shell::open::open_default(&locale)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn i_path_dalla_rete_non_escono_dalla_cartella() {
        assert_eq!(rel_sicuro("a/b.txt"), Some(PathBuf::from("a").join("b.txt")));
        assert_eq!(rel_sicuro(""), Some(PathBuf::new()));
        assert_eq!(rel_sicuro("../segreto"), None);
        assert_eq!(rel_sicuro("a/../../x"), None);
        assert_eq!(rel_sicuro("C:/Windows"), None);
        assert_eq!(rel_sicuro("a\\..\\x"), None);
    }

    #[test]
    fn dentro_rifiuta_chi_prova_a_uscire() {
        let d = tempdir().unwrap();
        let radice = d.path().join("condivisa");
        fs::create_dir_all(radice.join("sotto")).unwrap();
        fs::write(d.path().join("fuori.txt"), b"x").unwrap();

        assert!(dentro(&radice, "sotto").is_some());
        assert!(dentro(&radice, "").is_some());
        assert!(dentro(&radice, "../fuori.txt").is_none());
    }

    #[test]
    fn i_path_virtuali_si_dividono_e_si_risale() {
        assert_eq!(dividi(r"::lan\PC-1\a\b"), Some(("PC-1".into(), "a/b".into())));
        assert_eq!(dividi(r"::lan\PC-1"), Some(("PC-1".into(), "".into())));
        assert_eq!(dividi(r"::lan"), None);
        assert_eq!(genitore(r"::lan\PC-1\a\b"), Some(r"::lan\PC-1\a".into()));
        assert_eq!(genitore(r"::lan\PC-1\a"), Some(r"::lan\PC-1".into()));
        assert_eq!(genitore(r"::lan\PC-1"), Some("::lan".into()));
    }

    #[test]
    fn un_albero_fa_il_giro_completo_intatto() {
        let d = tempdir().unwrap();
        let src = d.path().join("progetto");
        fs::create_dir_all(src.join("vuota")).unwrap();
        fs::create_dir_all(src.join("sotto")).unwrap();
        fs::write(src.join("a.txt"), b"alfa").unwrap();
        fs::write(src.join("sotto").join("b.bin"), vec![7u8; 300_000]).unwrap();

        let voci = piano(&src);
        let mut flusso = Vec::new();
        manda_file(&mut flusso, d.path(), &voci, &AtomicBool::new(false), &mut |_| {}).unwrap();

        let dest = d.path().join("arrivo");
        // «progetto» non esiste a destinazione: tiene il suo nome.
        let creati = prendi_file(&mut flusso.as_slice(), &dest, &voci, &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert_eq!(creati, vec![dest.join("progetto")]);
        assert_eq!(fs::read_to_string(dest.join("progetto").join("a.txt")).unwrap(), "alfa");
        assert_eq!(fs::read(dest.join("progetto").join("sotto").join("b.bin")).unwrap().len(), 300_000);
        assert!(dest.join("progetto").join("vuota").is_dir());

        // Una seconda volta il nome è occupato: arriva numerato.
        let creati = prendi_file(&mut flusso.as_slice(), &dest, &voci, &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert_eq!(creati, vec![dest.join("progetto (2)")]);
    }

    #[test]
    fn chi_riceve_rifiuta_path_maliziosi() {
        let d = tempdir().unwrap();
        let voci = vec![Voce { rel: "../evaso.txt".into(), dimensione: 1, cartella: false }];
        let errore = prendi_file(&mut [0u8].as_slice(), d.path(), &voci, &AtomicBool::new(false), &mut |_| {});
        assert!(errore.is_err());
        assert!(!d.path().parent().unwrap().join("evaso.txt").exists());
    }

    #[test]
    fn le_intestazioni_viaggiano_con_la_loro_lunghezza() {
        let mut b = Vec::new();
        scrivi_json(&mut b, &Richiesta::Elenca { path: "x/y".into() }).unwrap();
        let r: Richiesta = leggi_json(&mut b.as_slice()).unwrap();
        assert!(matches!(r, Richiesta::Elenca { path } if path == "x/y"));
    }

    /// Un «PC» completo dentro il test: server TCP su una porta libera di
    /// 127.0.0.1, che accetta da solo ogni invio se `accetta` è vero.
    fn pc_di_prova(nome: &str, config: Config, accetta: bool) -> (Arc<Lan>, u16) {
        let dir = tempdir().unwrap().keep();
        let lan = Arc::new(Lan::nuovo(nome.into(), nome.into(), config, dir.join("lan.json")));
        let per_avvisi = lan.clone();
        let avvisi: Avvisi = Arc::new(move |evento: &str, dato: serde_json::Value| {
            if evento == "lan-richiesta" {
                let id = dato["id"].as_u64().unwrap();
                let lan = per_avvisi.clone();
                // Risponde da un altro thread, come farebbe l'utente.
                std::thread::spawn(move || lan.rispondi(id, accetta));
            }
        });
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = server.local_addr().unwrap().port();
        avvia_server(avvisi, lan.clone(), server);
        (lan, porta)
    }

    /// Fa conoscere a `chi` il PC `altro`, come avrebbe fatto un annuncio.
    fn presenta(chi: &Lan, altro: &Lan, porta: u16) {
        let p = Pari { id: altro.id.clone(), nome: altro.nome.clone(), ip: "127.0.0.1".into(), porta, condivisa: None };
        chi.pari.lock().unwrap().insert(altro.id.clone(), (p, Instant::now()));
    }

    #[test]
    fn due_pc_si_sfogliano_scaricano_e_si_inviano_file() {
        let d = tempdir().unwrap();
        let condivisa = d.path().join("condivisa");
        fs::create_dir_all(condivisa.join("Foto")).unwrap();
        fs::write(condivisa.join("Foto").join("mare.jpg"), vec![9u8; 50_000]).unwrap();
        fs::write(condivisa.join("nota.txt"), b"ciao").unwrap();
        let ricevuti = d.path().join("ricevuti");

        let (server, porta) = pc_di_prova(
            "SERVER",
            Config {
                visibile: true,
                condivisa: Some(condivisa.to_string_lossy().into_owned()),
                ricevuti: Some(ricevuti.to_string_lossy().into_owned()),
            },
            true,
        );
        let (client, _) = pc_di_prova("CLIENT", Config::default(), true);
        presenta(&client, &server, porta);

        // Sfoglia la radice condivisa e una sottocartella.
        let mut nomi: Vec<String> = elenca_remoto(&client, r"::lan\SERVER")
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        nomi.sort();
        assert_eq!(nomi, vec!["Foto", "nota.txt"]);
        let foto = elenca_remoto(&client, r"::lan\SERVER\Foto").unwrap();
        assert_eq!(foto[0].path, r"::lan\SERVER\Foto\mare.jpg");
        assert_eq!(foto[0].size, 50_000);

        // Scarica una cartella intera.
        let qui = d.path().join("qui");
        let coppie = scarica(
            &client,
            &[r"::lan\SERVER\Foto".to_string()],
            &qui.to_string_lossy(),
            &AtomicBool::new(false),
            &mut |_, _| {},
        )
        .unwrap();
        assert_eq!(coppie.len(), 1);
        assert_eq!(fs::read(qui.join("Foto").join("mare.jpg")).unwrap().len(), 50_000);

        // Uscire dalla cartella condivisa non si può.
        assert!(elenca_remoto(&client, r"::lan\SERVER\..").is_err());

        // Invio: il server accetta e i file arrivano nei suoi ricevuti.
        let da_inviare = d.path().join("regalo.txt");
        fs::write(&da_inviare, b"per te").unwrap();
        invia(
            &client,
            "SERVER",
            &[da_inviare.to_string_lossy().into_owned()],
            &AtomicBool::new(false),
            &mut |_, _| {},
        )
        .unwrap();
        let arrivato = ricevuti.join("regalo.txt");
        for _ in 0..50 {
            if arrivato.exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(fs::read_to_string(arrivato).unwrap(), "per te");
    }

    #[test]
    fn un_invio_rifiutato_non_lascia_niente() {
        let d = tempdir().unwrap();
        let ricevuti = d.path().join("ricevuti");
        let (server, porta) = pc_di_prova(
            "RIFIUTA",
            Config { visibile: true, condivisa: None, ricevuti: Some(ricevuti.to_string_lossy().into_owned()) },
            false,
        );
        let (client, _) = pc_di_prova("MANDA", Config::default(), true);
        presenta(&client, &server, porta);

        let f = d.path().join("x.txt");
        fs::write(&f, b"x").unwrap();
        let errore = invia(&client, "RIFIUTA", &[f.to_string_lossy().into_owned()], &AtomicBool::new(false), &mut |_, _| {});
        match errore {
            Err(FsError::Io { message }) => assert!(message.contains("rifiutato")),
            altro => panic!("doveva essere rifiutato: {:?}", altro),
        }
        assert!(!ricevuti.join("x.txt").exists());
    }

    #[test]
    fn un_pc_invisibile_non_risponde_e_senza_condivisione_non_si_sfoglia() {
        let (nascosto, porta_n) = pc_di_prova("NASCOSTO", Config::default(), true);
        let (senza, porta_s) = pc_di_prova("SENZA", Config { visibile: true, ..Default::default() }, true);
        let (client, _) = pc_di_prova("CHIEDE", Config::default(), true);
        presenta(&client, &nascosto, porta_n);
        presenta(&client, &senza, porta_s);

        let e = elenca_remoto(&client, r"::lan\NASCOSTO").unwrap_err();
        assert!(format!("{:?}", e).contains("non è visibile"));
        let e = elenca_remoto(&client, r"::lan\SENZA").unwrap_err();
        assert!(format!("{:?}", e).contains("non condivide"));
    }

    #[test]
    fn un_intestazione_enorme_viene_rifiutata() {
        let b = (u32::MAX).to_be_bytes();
        assert!(leggi_json::<Risposta>(&mut b.as_slice()).is_err());
    }
}
