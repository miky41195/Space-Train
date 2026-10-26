//! Ricerca nelle sottocartelle, per nome ed eventualmente per contenuto.
//!
//! I risultati escono a gruppi mentre la visita procede: aspettare la
//! fine su un disco intero vorrebbe dire minuti di schermo vuoto.

use crate::fs::entry::{entry_from_dir_entry, Entry, EntryKind};
use crate::fs::paths;
use serde::Deserialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// Oltre questo numero la ricerca si ferma: nessuno scorre diecimila
/// risultati, e una lista infinita non aiuta a trovare niente.
pub const MASSIMO_RISULTATI: usize = 10_000;

/// File più grandi non vengono letti per cercare nel contenuto.
const MASSIMO_CONTENUTO: u64 = 20 * 1024 * 1024;

const LOTTO: usize = 64;
const INTERVALLO: Duration = Duration::from_millis(150);

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Criteri {
    pub testo: String,
    /// Cerca il testo anche dentro i file, non solo nei nomi.
    pub contenuto: bool,
    pub nascosti: bool,
}

/// Visita `radice` e consegna i risultati a lotti. Ritorna quanti ne ha trovati.
pub fn cerca(
    radice: &str,
    criteri: &Criteri,
    annulla: &AtomicBool,
    consegna: &mut dyn FnMut(Vec<Entry>),
) -> usize {
    let testo = criteri.testo.trim().to_lowercase();
    if testo.is_empty() {
        return 0;
    }
    let confronto = Confronto::nuovo(&testo);

    let mut pila: Vec<PathBuf> = vec![PathBuf::from(radice)];
    let mut lotto: Vec<Entry> = Vec::new();
    let mut trovati = 0usize;
    let mut ultimo = Instant::now();

    while let Some(dir) = pila.pop() {
        if annulla.load(Ordering::Relaxed) || trovati >= MASSIMO_RISULTATI {
            break;
        }

        // Una cartella illeggibile si salta: la ricerca continua altrove.
        let Ok(voci) = std::fs::read_dir(paths::extended(&dir)) else {
            continue;
        };

        for de in voci.filter_map(|v| v.ok()) {
            let Some(mut e) = entry_from_dir_entry(&de) else {
                continue;
            };
            if e.hidden && !criteri.nascosti {
                continue;
            }

            // Collegamenti e giunzioni non si attraversano: possono puntare
            // a un antenato e chiudere un ciclo.
            let collegamento = de.file_type().map(|t| t.is_symlink()).unwrap_or(true);
            if e.kind == EntryKind::Dir && !collegamento {
                pila.push(de.path());
            }

            let nome_ok = confronto.nome(&e.name.to_lowercase());
            let contenuto_ok = !nome_ok
                && criteri.contenuto
                && e.kind == EntryKind::File
                && e.size <= MASSIMO_CONTENUTO
                && contiene(&de.path(), &testo);

            if nome_ok || contenuto_ok {
                e.path = paths::display(Path::new(&e.path));
                lotto.push(e);
                trovati += 1;
                if trovati >= MASSIMO_RISULTATI {
                    break;
                }
            }

            if lotto.len() >= LOTTO || (!lotto.is_empty() && ultimo.elapsed() >= INTERVALLO) {
                consegna(std::mem::take(&mut lotto));
                ultimo = Instant::now();
            }
        }
    }

    if !lotto.is_empty() {
        consegna(lotto);
    }
    trovati
}

/// Come si confronta un nome: tutte le parole contenute, oppure un
/// modello con `*` e `?` se l'utente ne ha scritto uno.
enum Confronto {
    Parole(Vec<String>),
    Modello(Vec<char>),
}

impl Confronto {
    fn nuovo(testo: &str) -> Self {
        if testo.contains('*') || testo.contains('?') {
            Confronto::Modello(testo.chars().collect())
        } else {
            Confronto::Parole(testo.split_whitespace().map(String::from).collect())
        }
    }

    fn nome(&self, nome: &str) -> bool {
        match self {
            Confronto::Parole(p) => p.iter().all(|w| nome.contains(w.as_str())),
            Confronto::Modello(m) => corrisponde(m, &nome.chars().collect::<Vec<_>>()),
        }
    }
}

/// Corrispondenza con caratteri jolly, iterativa per non esplodere sui `*`.
fn corrisponde(modello: &[char], nome: &[char]) -> bool {
    let (mut m, mut n) = (0usize, 0usize);
    let mut stella: Option<usize> = None;
    let mut ripresa = 0usize;

    while n < nome.len() {
        if m < modello.len() && (modello[m] == '?' || modello[m] == nome[n]) {
            m += 1;
            n += 1;
        } else if m < modello.len() && modello[m] == '*' {
            stella = Some(m);
            ripresa = n;
            m += 1;
        } else if let Some(s) = stella {
            m = s + 1;
            ripresa += 1;
            n = ripresa;
        } else {
            return false;
        }
    }
    while m < modello.len() && modello[m] == '*' {
        m += 1;
    }
    m == modello.len()
}

/// Vero se il file è testo e contiene `testo` (già minuscolo).
fn contiene(path: &Path, testo: &str) -> bool {
    let Ok(mut f) = std::fs::File::open(paths::extended(path)) else {
        return false;
    };
    let mut dati = Vec::new();
    if f.by_ref().take(MASSIMO_CONTENUTO).read_to_end(&mut dati).is_err() {
        return false;
    }
    // Un byte nullo all'inizio indica un file binario: cercarci dentro
    // darebbe solo falsi positivi.
    if dati.iter().take(8000).any(|b| *b == 0) {
        return false;
    }
    String::from_utf8_lossy(&dati).to_lowercase().contains(testo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn criteri(testo: &str, contenuto: bool) -> Criteri {
        Criteri {
            testo: testo.into(),
            contenuto,
            nascosti: false,
        }
    }

    fn nomi(radice: &Path, c: &Criteri) -> Vec<String> {
        let mut out = Vec::new();
        cerca(
            &radice.to_string_lossy(),
            c,
            &AtomicBool::new(false),
            &mut |lotto| out.extend(lotto.into_iter().map(|e| e.name)),
        );
        out.sort();
        out
    }

    #[test]
    fn trova_nelle_sottocartelle() {
        let d = tempdir().unwrap();
        fs::create_dir_all(d.path().join("a").join("b")).unwrap();
        fs::write(d.path().join("a").join("b").join("relazione.txt"), b"x").unwrap();
        fs::write(d.path().join("altro.txt"), b"x").unwrap();

        assert_eq!(nomi(d.path(), &criteri("relaz", false)), vec!["relazione.txt"]);
    }

    #[test]
    fn ignora_le_maiuscole_e_richiede_tutte_le_parole() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("Fattura Marzo.pdf"), b"x").unwrap();
        fs::write(d.path().join("Fattura Aprile.pdf"), b"x").unwrap();

        assert_eq!(nomi(d.path(), &criteri("fattura marzo", false)), vec!["Fattura Marzo.pdf"]);
    }

    #[test]
    fn supporta_i_caratteri_jolly() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("foto1.jpg"), b"x").unwrap();
        fs::write(d.path().join("foto2.png"), b"x").unwrap();

        assert_eq!(nomi(d.path(), &criteri("*.jpg", false)), vec!["foto1.jpg"]);
        assert_eq!(nomi(d.path(), &criteri("foto?.*", false)).len(), 2);
    }

    #[test]
    fn cerca_nel_contenuto_solo_se_richiesto() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("note.txt"), b"la parola segreta e qui").unwrap();

        assert!(nomi(d.path(), &criteri("segreta", false)).is_empty());
        assert_eq!(nomi(d.path(), &criteri("SEGRETA", true)), vec!["note.txt"]);
    }

    #[test]
    fn non_cerca_nei_file_binari() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("dati.bin"), b"\0\0segreta").unwrap();
        assert!(nomi(d.path(), &criteri("segreta", true)).is_empty());
    }

    #[test]
    fn si_ferma_se_annullata() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("uno.txt"), b"x").unwrap();
        let mut n = 0;
        cerca(
            &d.path().to_string_lossy(),
            &criteri("uno", false),
            &AtomicBool::new(true),
            &mut |l| n += l.len(),
        );
        assert_eq!(n, 0);
    }
}
