use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// Cosa fare quando a destinazione esiste già un elemento con lo stesso nome.
#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Politica {
    Sovrascrivi,
    Rinomina,
    Salta,
}

#[derive(Serialize, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Esito {
    pub copiati: u64,
    pub saltati: u64,
    pub annullato: bool,
    /// Sorgente e path d'arrivo effettivo di ogni elemento trasferito.
    /// Serve ad annullare: con la politica «rinomina» l'arrivo può avere
    /// un nome diverso da quello di partenza.
    pub coppie: Vec<[String; 2]>,
}

/// Nome libero dentro `dir`, numerando come fa Windows: `nota (2).txt`.
///
/// L'estensione resta in coda al numero: rinominare non deve cambiare il
/// tipo del file.
pub fn unique_name(dir: &Path, nome: &str) -> String {
    if !paths::extended(&dir.join(nome)).exists() {
        return nome.to_string();
    }

    let punto = nome.rfind('.').filter(|i| *i > 0);
    let (base, estensione) = match punto {
        Some(i) => (&nome[..i], &nome[i..]),
        None => (nome, ""),
    };

    for n in 2..10_000 {
        let candidato = format!("{} ({}){}", base, n, estensione);
        if !paths::extended(&dir.join(&candidato)).exists() {
            return candidato;
        }
    }

    format!("{} ({}){}", base, uuid_semplice(), estensione)
}

/// Ultima spiaggia quando 10.000 nomi numerati sono tutti occupati.
fn uuid_semplice() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Nomi che esistono già a destinazione. Vuoto = nessuna domanda da fare.
pub fn scan_conflicts(sorgenti: &[String], destinazione: &str) -> Vec<String> {
    let dest = Path::new(destinazione);

    sorgenti
        .iter()
        .filter_map(|s| {
            let nome = Path::new(s).file_name()?.to_string_lossy().into_owned();
            if paths::extended(&dest.join(&nome)).exists() {
                Some(nome)
            } else {
                None
            }
        })
        .collect()
}

/// Byte totali da trasferire, per dare una barra di avanzamento onesta.
pub fn total_bytes(sorgenti: &[String]) -> u64 {
    sorgenti.iter().map(|s| peso(Path::new(s))).sum()
}

fn peso(path: &Path) -> u64 {
    let esteso = paths::extended(path);

    let Ok(meta) = std::fs::symlink_metadata(&esteso) else {
        return 0;
    };

    if meta.is_dir() {
        let Ok(voci) = std::fs::read_dir(&esteso) else {
            return 0;
        };
        return voci.filter_map(|v| v.ok()).map(|v| peso(&v.path())).sum();
    }

    meta.len()
}

/// Copia sorgenti dentro `destinazione`.
///
/// `avanzamento` riceve i byte trasferiti finora; `annulla` viene consultato
/// fra un file e l'altro. L'interruzione lascia sul disco i file già copiati:
/// non è una transazione, e fingere il contrario richiederebbe un'area di
/// staging grande quanto i dati.
pub fn copy_all(
    sorgenti: &[String],
    destinazione: &str,
    politica: Politica,
    annulla: &AtomicBool,
    avanzamento: &mut dyn FnMut(u64),
) -> Result<Esito, FsError> {
    let dest = Path::new(destinazione);
    let mut esito = Esito::default();
    let mut fatti = 0u64;

    for sorgente in sorgenti {
        if annulla.load(Ordering::Relaxed) {
            esito.annullato = true;
            return Ok(esito);
        }

        let origine = Path::new(sorgente);
        let Some(nome) = origine.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };

        // Copiare una cartella dentro sé stessa genererebbe ricorsione
        // infinita: il controllo va fatto prima di aprire qualsiasi handle.
        if dest.starts_with(origine) {
            return Err(FsError::Io {
                message: format!(
                    "Non puoi copiare «{}» dentro sé stessa.",
                    nome
                ),
            });
        }

        let arrivo = match risolvi_destinazione(dest, &nome, politica) {
            Some(p) => p,
            None => {
                esito.saltati += 1;
                continue;
            }
        };

        copia_ricorsiva(origine, &arrivo, annulla, &mut fatti, avanzamento)?;
        esito.copiati += 1;
        esito.coppie.push([sorgente.clone(), paths::display(&arrivo)]);
    }

    Ok(esito)
}

/// Sposta sorgenti dentro `destinazione`.
///
/// Prova prima `rename`, istantaneo sullo stesso volume. Se fallisce perché
/// la destinazione è su un altro disco, ricade su copia più eliminazione.
pub fn move_all(
    sorgenti: &[String],
    destinazione: &str,
    politica: Politica,
    annulla: &AtomicBool,
    avanzamento: &mut dyn FnMut(u64),
) -> Result<Esito, FsError> {
    let dest = Path::new(destinazione);
    let mut esito = Esito::default();
    let mut fatti = 0u64;

    for sorgente in sorgenti {
        if annulla.load(Ordering::Relaxed) {
            esito.annullato = true;
            return Ok(esito);
        }

        let origine = Path::new(sorgente);
        let Some(nome) = origine.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };

        if dest.starts_with(origine) {
            return Err(FsError::Io {
                message: format!("Non puoi spostare «{}» dentro sé stessa.", nome),
            });
        }

        let arrivo = match risolvi_destinazione(dest, &nome, politica) {
            Some(p) => p,
            None => {
                esito.saltati += 1;
                continue;
            }
        };

        if politica == Politica::Sovrascrivi && paths::extended(&arrivo).exists() {
            rimuovi(&arrivo)?;
        }

        match std::fs::rename(paths::extended(origine), paths::extended(&arrivo)) {
            Ok(()) => {
                fatti += peso(&arrivo);
                avanzamento(fatti);
            }
            Err(_) => {
                // Volumi diversi: rename non può attraversarli.
                copia_ricorsiva(origine, &arrivo, annulla, &mut fatti, avanzamento)?;
                rimuovi(origine)?;
            }
        }

        esito.copiati += 1;
        esito.coppie.push([sorgente.clone(), paths::display(&arrivo)]);
    }

    Ok(esito)
}

/// Path di arrivo secondo la politica. `None` significa "salta questo".
fn risolvi_destinazione(dest: &Path, nome: &str, politica: Politica) -> Option<PathBuf> {
    let diretto = dest.join(nome);

    if !paths::extended(&diretto).exists() {
        return Some(diretto);
    }

    match politica {
        Politica::Sovrascrivi => Some(diretto),
        Politica::Rinomina => Some(dest.join(unique_name(dest, nome))),
        Politica::Salta => None,
    }
}

pub fn rimuovi(path: &Path) -> Result<(), FsError> {
    let esteso = paths::extended(path);
    let meta = std::fs::symlink_metadata(&esteso).map_err(|e| from_io(&e))?;

    if meta.is_dir() {
        std::fs::remove_dir_all(&esteso).map_err(|e| from_io(&e))
    } else {
        std::fs::remove_file(&esteso).map_err(|e| from_io(&e))
    }
}

fn copia_ricorsiva(
    origine: &Path,
    arrivo: &Path,
    annulla: &AtomicBool,
    fatti: &mut u64,
    avanzamento: &mut dyn FnMut(u64),
) -> Result<(), FsError> {
    if annulla.load(Ordering::Relaxed) {
        return Ok(());
    }

    let meta = std::fs::symlink_metadata(paths::extended(origine)).map_err(|e| from_io(&e))?;

    if !meta.is_dir() {
        std::fs::copy(paths::extended(origine), paths::extended(arrivo)).map_err(|e| from_io(&e))?;
        *fatti += meta.len();
        avanzamento(*fatti);
        return Ok(());
    }

    std::fs::create_dir_all(paths::extended(arrivo)).map_err(|e| from_io(&e))?;

    let voci = std::fs::read_dir(paths::extended(origine)).map_err(|e| from_io(&e))?;

    for voce in voci.filter_map(|v| v.ok()) {
        if annulla.load(Ordering::Relaxed) {
            return Ok(());
        }
        let nome = voce.file_name();
        copia_ricorsiva(&voce.path(), &arrivo.join(nome), annulla, fatti, avanzamento)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn mai() -> AtomicBool {
        AtomicBool::new(false)
    }

    fn zitto() -> impl FnMut(u64) {
        |_| {}
    }

    #[test]
    fn unique_name_lascia_stare_i_nomi_liberi() {
        let dir = tempdir().unwrap();
        assert_eq!(unique_name(dir.path(), "nuovo.txt"), "nuovo.txt");
    }

    #[test]
    fn unique_name_numera_conservando_l_estensione() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("nota.txt"), b"x").unwrap();

        assert_eq!(unique_name(dir.path(), "nota.txt"), "nota (2).txt");
    }

    #[test]
    fn unique_name_salta_i_numeri_gia_occupati() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("nota.txt"), b"x").unwrap();
        fs::write(dir.path().join("nota (2).txt"), b"x").unwrap();

        assert_eq!(unique_name(dir.path(), "nota.txt"), "nota (3).txt");
    }

    #[test]
    fn unique_name_funziona_senza_estensione() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("cartella")).unwrap();

        assert_eq!(unique_name(dir.path(), "cartella"), "cartella (2)");
    }

    #[test]
    fn scan_conflicts_trova_solo_i_nomi_occupati() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();

        fs::write(origine.path().join("a.txt"), b"x").unwrap();
        fs::write(origine.path().join("b.txt"), b"x").unwrap();
        fs::write(dest.path().join("a.txt"), b"gia qui").unwrap();

        let sorgenti = vec![
            origine.path().join("a.txt").to_string_lossy().into_owned(),
            origine.path().join("b.txt").to_string_lossy().into_owned(),
        ];

        let conflitti = scan_conflicts(&sorgenti, &dest.path().to_string_lossy());
        assert_eq!(conflitti, vec!["a.txt"]);
    }

    #[test]
    fn copia_un_file() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origine.path().join("a.txt"), b"contenuto").unwrap();

        let sorgenti = vec![origine.path().join("a.txt").to_string_lossy().into_owned()];
        let esito = copy_all(
            &sorgenti,
            &dest.path().to_string_lossy(),
            Politica::Rinomina,
            &mai(),
            &mut zitto(),
        )
        .unwrap();

        assert_eq!(esito.copiati, 1);
        assert_eq!(
            fs::read_to_string(dest.path().join("a.txt")).unwrap(),
            "contenuto"
        );
        // L'originale resta dov'era.
        assert!(origine.path().join("a.txt").exists());
    }

    #[test]
    fn copia_una_cartella_con_tutto_il_contenuto() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();

        let sub = origine.path().join("cartella");
        fs::create_dir_all(sub.join("dentro")).unwrap();
        fs::write(sub.join("uno.txt"), b"1").unwrap();
        fs::write(sub.join("dentro").join("due.txt"), b"2").unwrap();

        let sorgenti = vec![sub.to_string_lossy().into_owned()];
        copy_all(
            &sorgenti,
            &dest.path().to_string_lossy(),
            Politica::Rinomina,
            &mai(),
            &mut zitto(),
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(dest.path().join("cartella").join("uno.txt")).unwrap(),
            "1"
        );
        assert_eq!(
            fs::read_to_string(
                dest.path()
                    .join("cartella")
                    .join("dentro")
                    .join("due.txt")
            )
            .unwrap(),
            "2"
        );
    }

    #[test]
    fn la_politica_rinomina_non_tocca_l_esistente() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origine.path().join("a.txt"), b"nuovo").unwrap();
        fs::write(dest.path().join("a.txt"), b"vecchio").unwrap();

        let sorgenti = vec![origine.path().join("a.txt").to_string_lossy().into_owned()];
        copy_all(
            &sorgenti,
            &dest.path().to_string_lossy(),
            Politica::Rinomina,
            &mai(),
            &mut zitto(),
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(dest.path().join("a.txt")).unwrap(),
            "vecchio"
        );
        assert_eq!(
            fs::read_to_string(dest.path().join("a (2).txt")).unwrap(),
            "nuovo"
        );
    }

    #[test]
    fn la_politica_sovrascrivi_rimpiazza() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origine.path().join("a.txt"), b"nuovo").unwrap();
        fs::write(dest.path().join("a.txt"), b"vecchio").unwrap();

        let sorgenti = vec![origine.path().join("a.txt").to_string_lossy().into_owned()];
        copy_all(
            &sorgenti,
            &dest.path().to_string_lossy(),
            Politica::Sovrascrivi,
            &mai(),
            &mut zitto(),
        )
        .unwrap();

        assert_eq!(fs::read_to_string(dest.path().join("a.txt")).unwrap(), "nuovo");
    }

    #[test]
    fn la_politica_salta_lascia_tutto_com_e() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origine.path().join("a.txt"), b"nuovo").unwrap();
        fs::write(dest.path().join("a.txt"), b"vecchio").unwrap();

        let sorgenti = vec![origine.path().join("a.txt").to_string_lossy().into_owned()];
        let esito = copy_all(
            &sorgenti,
            &dest.path().to_string_lossy(),
            Politica::Salta,
            &mai(),
            &mut zitto(),
        )
        .unwrap();

        assert_eq!(esito.saltati, 1);
        assert_eq!(esito.copiati, 0);
        assert_eq!(
            fs::read_to_string(dest.path().join("a.txt")).unwrap(),
            "vecchio"
        );
    }

    #[test]
    fn spostare_toglie_l_originale() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origine.path().join("a.txt"), b"contenuto").unwrap();

        let sorgenti = vec![origine.path().join("a.txt").to_string_lossy().into_owned()];
        move_all(
            &sorgenti,
            &dest.path().to_string_lossy(),
            Politica::Rinomina,
            &mai(),
            &mut zitto(),
        )
        .unwrap();

        assert!(!origine.path().join("a.txt").exists());
        assert_eq!(
            fs::read_to_string(dest.path().join("a.txt")).unwrap(),
            "contenuto"
        );
    }

    #[test]
    fn rifiuta_di_copiare_una_cartella_dentro_se_stessa() {
        let dir = tempdir().unwrap();
        let padre = dir.path().join("padre");
        let figlia = padre.join("figlia");
        fs::create_dir_all(&figlia).unwrap();

        let sorgenti = vec![padre.to_string_lossy().into_owned()];
        let err = copy_all(
            &sorgenti,
            &figlia.to_string_lossy(),
            Politica::Rinomina,
            &mai(),
            &mut zitto(),
        )
        .unwrap_err();

        match err {
            FsError::Io { message } => assert!(message.contains("dentro sé stessa")),
            altro => panic!("errore inatteso: {:?}", altro),
        }
    }

    #[test]
    fn annullare_prima_di_iniziare_non_copia_niente() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origine.path().join("a.txt"), b"x").unwrap();

        let sorgenti = vec![origine.path().join("a.txt").to_string_lossy().into_owned()];
        let esito = copy_all(
            &sorgenti,
            &dest.path().to_string_lossy(),
            Politica::Rinomina,
            &AtomicBool::new(true),
            &mut zitto(),
        )
        .unwrap();

        assert!(esito.annullato);
        assert_eq!(esito.copiati, 0);
        assert!(!dest.path().join("a.txt").exists());
    }

    #[test]
    fn l_avanzamento_riporta_i_byte_trasferiti() {
        let origine = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origine.path().join("a.txt"), vec![0u8; 100]).unwrap();
        fs::write(origine.path().join("b.txt"), vec![0u8; 50]).unwrap();

        let sorgenti = vec![
            origine.path().join("a.txt").to_string_lossy().into_owned(),
            origine.path().join("b.txt").to_string_lossy().into_owned(),
        ];

        assert_eq!(total_bytes(&sorgenti), 150);

        let mut letture = Vec::new();
        copy_all(
            &sorgenti,
            &dest.path().to_string_lossy(),
            Politica::Rinomina,
            &mai(),
            &mut |b| letture.push(b),
        )
        .unwrap();

        assert_eq!(letture.last(), Some(&150));
    }

    #[test]
    fn total_bytes_somma_anche_le_sottocartelle() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join("cartella");
        fs::create_dir_all(sub.join("dentro")).unwrap();
        fs::write(sub.join("uno.bin"), vec![0u8; 30]).unwrap();
        fs::write(sub.join("dentro").join("due.bin"), vec![0u8; 70]).unwrap();

        let sorgenti = vec![sub.to_string_lossy().into_owned()];
        assert_eq!(total_bytes(&sorgenti), 100);
    }
}
