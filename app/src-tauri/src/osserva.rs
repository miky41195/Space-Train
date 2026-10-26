//! Aggiornamento automatico: avvisa il frontend quando cambia il contenuto
//! di una cartella aperta in un tab, anche per mano di altri programmi.
//!
//! Gli eventi del filesystem arrivano a raffiche (copiare cento file ne
//! produce centinaia): si accumulano e si spedisce un avviso per cartella
//! solo dopo un attimo di calma.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

const CALMA: Duration = Duration::from_millis(250);

pub const EVENTO: &str = "cartella-cambiata";

#[derive(Default)]
pub struct Osservatore {
    stato: Mutex<Option<Stato>>,
}

struct Stato {
    watcher: RecommendedWatcher,
    /// Chiave minuscola → path come lo ha mandato il frontend.
    osservate: HashMap<String, PathBuf>,
    /// Le cartelle aperte nelle schede di ogni finestra.
    per_finestra: HashMap<String, Vec<String>>,
}

/// Tutte le cartelle da osservare: l'unione di quelle di ogni finestra,
/// senza le posizioni virtuali (Questo PC, Cestino, Rete), che sul disco
/// non esistono.
fn unione(per_finestra: &HashMap<String, Vec<String>>) -> HashMap<String, PathBuf> {
    per_finestra
        .values()
        .flatten()
        .filter(|c| !c.starts_with("::") && !crate::shell::rete::e_server(c))
        .map(|c| (chiave(Path::new(c)), PathBuf::from(c)))
        .collect()
}

fn chiave(p: &Path) -> String {
    crate::fs::paths::display(p)
        .trim_end_matches('\\')
        .to_lowercase()
}

impl Osservatore {
    /// Le cartelle aperte ora nella finestra `finestra`. Si osservano quelle
    /// di tutte le finestre: una che cambia scheda non deve spegnere
    /// l'aggiornamento automatico delle altre.
    pub fn imposta(
        &self,
        app: &tauri::AppHandle,
        finestra: &str,
        cartelle: &[String],
    ) -> Result<(), String> {
        let mut guardia = self.stato.lock().map_err(|e| e.to_string())?;

        if guardia.is_none() {
            *guardia = Some(Stato {
                watcher: crea_watcher(app.clone())?,
                osservate: HashMap::new(),
                per_finestra: HashMap::new(),
            });
        }
        let stato = guardia.as_mut().expect("appena creato");
        stato.per_finestra.insert(finestra.to_string(), cartelle.to_vec());
        Self::sincronizza(stato);
        Ok(())
    }

    /// Una finestra chiusa smette di contare.
    pub fn dimentica(&self, finestra: &str) {
        if let Ok(mut g) = self.stato.lock() {
            if let Some(stato) = g.as_mut() {
                stato.per_finestra.remove(finestra);
                Self::sincronizza(stato);
            }
        }
    }

    fn sincronizza(stato: &mut Stato) {
        let volute = unione(&stato.per_finestra);

        let da_togliere: Vec<String> = stato
            .osservate
            .keys()
            .filter(|k| !volute.contains_key(*k))
            .cloned()
            .collect();
        for k in da_togliere {
            if let Some(p) = stato.osservate.remove(&k) {
                let _ = stato.watcher.unwatch(&p);
            }
        }

        for (k, p) in volute {
            if stato.osservate.contains_key(&k) {
                continue;
            }
            // Una cartella che sparisce o non si può osservare non deve
            // impedire di osservare le altre.
            if stato.watcher.watch(&p, RecursiveMode::NonRecursive).is_ok() {
                stato.osservate.insert(k, p);
            }
        }
    }
}

fn crea_watcher(app: tauri::AppHandle) -> Result<RecommendedWatcher, String> {
    let (invia, ricevi) = channel::<PathBuf>();
    avvia_smistatore(app, ricevi);

    let invia: Mutex<Sender<PathBuf>> = Mutex::new(invia);
    notify::recommended_watcher(move |evento: notify::Result<notify::Event>| {
        let Ok(evento) = evento else { return };
        if let Ok(invia) = invia.lock() {
            for p in evento.paths {
                // Il cambiamento di un elemento riguarda la cartella che lo
                // contiene; si manda anche il path stesso nel caso sia proprio
                // una cartella osservata (rinominata, eliminata).
                if let Some(g) = p.parent() {
                    let _ = invia.send(g.to_path_buf());
                }
                let _ = invia.send(p);
            }
        }
    })
    .map_err(|e| e.to_string())
}

fn avvia_smistatore(app: tauri::AppHandle, ricevi: std::sync::mpsc::Receiver<PathBuf>) {
    std::thread::Builder::new()
        .name("osserva-cartelle".into())
        .spawn(move || {
            let mut in_attesa: HashSet<String> = HashSet::new();
            loop {
                match ricevi.recv_timeout(CALMA) {
                    Ok(p) => {
                        in_attesa.insert(crate::fs::paths::display(&p));
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        for p in in_attesa.drain() {
                            let _ = app.emit(EVENTO, p);
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        })
        .expect("thread dell'osservatore");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn si_osservano_le_cartelle_di_tutte_le_finestre() {
        let mut m = HashMap::new();
        m.insert("main".to_string(), vec![r"C:\Uno".to_string(), "::pc".to_string()]);
        m.insert("finestra-2".to_string(), vec![r"C:\Due".to_string(), r"c:\uno\".to_string()]);
        let mut chiavi: Vec<String> = unione(&m).into_keys().collect();
        chiavi.sort();
        // «Uno» aperta in due finestre si osserva una volta; Questo PC no.
        assert_eq!(chiavi, vec![r"c:\due".to_string(), r"c:\uno".to_string()]);
    }

    #[test]
    fn la_chiave_ignora_maiuscole_e_barra_finale() {
        assert_eq!(chiave(Path::new(r"C:\Dati\")), chiave(Path::new(r"c:\dati")));
    }
}
