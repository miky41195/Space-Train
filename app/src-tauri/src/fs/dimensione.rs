//! Dimensione di una cartella: la somma dei file di tutto il suo albero.
//!
//! Esplora non la mostra perché costa: va letta ogni sottocartella. Qui la
//! si calcola su richiesta, una cartella alla volta, e il calcolo si ferma
//! appena l'elenco passa a un'altra cartella.

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

/// Il turno in corso. Ogni volta che l'elenco cambia cartella ne parte uno
/// nuovo, e i calcoli del turno precedente si fermano al primo controllo.
static TURNO: AtomicU64 = AtomicU64::new(0);

pub fn nuovo_turno(turno: u64) {
    TURNO.store(turno, Ordering::SeqCst);
}

/// I byte di tutti i file sotto `cartella`, o `None` se nel frattempo è
/// cominciato un altro turno. Le cartelle illeggibili si saltano.
pub fn dimensione(cartella: &Path, turno: u64) -> Option<u64> {
    misura(cartella, &|| TURNO.load(Ordering::Relaxed) != turno).map(|m| m.bytes)
}

/// Size of a tree and its newest modification.
pub struct Misura {
    pub bytes: u64,
    /// Newest modification of the folder itself or any file in it, in ms.
    pub recente: u64,
}

pub fn ms(t: std::io::Result<std::time::SystemTime>) -> u64 {
    t.ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

/// Walks the tree under `cartella`; `None` as soon as `fermo` says stop.
pub fn misura(cartella: &Path, fermo: &dyn Fn() -> bool) -> Option<Misura> {
    let mut totale = Misura { bytes: 0, recente: 0 };
    if let Ok(md) = std::fs::metadata(cartella) {
        totale.recente = ms(md.modified());
    }
    let mut da_leggere = vec![cartella.to_path_buf()];
    while let Some(dir) = da_leggere.pop() {
        if fermo() {
            return None;
        }
        let Ok(voci) = std::fs::read_dir(&dir) else {
            continue;
        };
        for voce in voci.flatten() {
            let Ok(tipo) = voce.file_type() else {
                continue;
            };
            // Collegamenti e giunzioni non si seguono: portano fuori
            // dall'albero o in cerchio (come «Dati applicazioni» nel profilo).
            if tipo.is_symlink() {
                continue;
            }
            if tipo.is_dir() {
                da_leggere.push(voce.path());
            } else if let Ok(m) = voce.metadata() {
                totale.bytes = totale.bytes.saturating_add(m.len());
                totale.recente = totale.recente.max(ms(m.modified()));
            }
        }
    }
    Some(totale)
}

#[cfg(test)]
mod test {
    use super::*;
    use std::sync::Mutex;

    /// Il turno è globale: i test che lo cambiano non devono incrociarsi.
    static IN_FILA: Mutex<()> = Mutex::new(());

    #[test]
    fn somma_i_file_di_tutte_le_sottocartelle() {
        let _fila = IN_FILA.lock().unwrap();
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.bin"), vec![0u8; 100]).unwrap();
        std::fs::create_dir_all(d.path().join("sotto/ancora")).unwrap();
        std::fs::write(d.path().join("sotto/b.bin"), vec![0u8; 20]).unwrap();
        std::fs::write(d.path().join("sotto/ancora/c.bin"), vec![0u8; 3]).unwrap();
        nuovo_turno(7);
        assert_eq!(dimensione(d.path(), 7), Some(123));
    }

    #[test]
    fn un_turno_superato_si_ferma() {
        let _fila = IN_FILA.lock().unwrap();
        let d = tempfile::tempdir().unwrap();
        nuovo_turno(2);
        assert_eq!(dimensione(d.path(), 1), None);
    }

    #[test]
    fn una_cartella_che_non_esiste_pesa_zero() {
        let _fila = IN_FILA.lock().unwrap();
        nuovo_turno(3);
        assert_eq!(dimensione(Path::new("Z:\\non\\esiste\\davvero"), 3), Some(0));
    }
}
