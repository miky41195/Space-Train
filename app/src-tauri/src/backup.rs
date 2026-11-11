//! Backup to a friend: one folder kept aligned on a friend's PC.
//!
//! The sender asks for the list of what the friend already holds, sends
//! only what is missing or changed (size or modification time differ) and
//! never deletes anything, on either side. The friend accepts once; after
//! that backups arrive on their own into the folder they chose.
//!
//! The friend keeps each file's modification time, so the next comparison
//! does not depend on the two PCs' clocks agreeing.

use crate::fs::paths;
use crate::fs::provenienza::{e_virus, esamina, Esame};
use crate::lan::{rel_sicuro, Voce};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, UNIX_EPOCH};

/// Once a day, and after a failure not before ten minutes.
pub const OGNI: i64 = 24 * 60 * 60 * 1000;
pub const RIPROVA: i64 = 10 * 60 * 1000;

/// A file of the backup: path from the folder's own name (`Foto/a.jpg`),
/// size and modification time in ms.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoceBackup {
    pub rel: String,
    pub dimensione: u64,
    pub modificato: Option<i64>,
}

/// Our folder kept on a friend's PC.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub cartella: String,
    /// Last backup that went through, ms since 1970.
    #[serde(default)]
    pub ultimo: Option<i64>,
    /// Last attempt, successful or not.
    #[serde(default)]
    pub tentato: Option<i64>,
    /// What happened last time, for the Friends window.
    #[serde(default)]
    pub esito: Option<String>,
}

/// A friend's backup kept on our PC: they ask, we say yes or no once.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Consenso {
    Chiesto,
    Si,
    No,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Ospite {
    pub consenso: Consenso,
    /// Where their folders go, chosen when accepting.
    #[serde(default)]
    pub cartella: Option<String>,
    /// Last backup received, ms since 1970.
    #[serde(default)]
    pub ultimo: Option<i64>,
}

/// An error as the Friends window shows it.
pub fn testo(e: &crate::fs::error::FsError) -> String {
    use crate::fs::error::FsError::*;
    match e {
        AccessDenied => "Accesso negato.".into(),
        NotFound => "Elemento non trovato.".into(),
        NotADirectory => "Non è una cartella.".into(),
        DeviceNotReady => "Disco non pronto.".into(),
        Io { message } => message.clone(),
        ServerKey { .. } => "Chiave del server da confermare.".into(),
        ServerPassword => "Il server chiede la password.".into(),
    }
}

pub fn adesso() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Whether the daily backup is due at `ora`.
pub fn dovuto(b: &Backup, ora: i64) -> bool {
    b.ultimo.is_none_or(|u| ora - u >= OGNI) && b.tentato.is_none_or(|t| ora - t >= RIPROVA)
}

/// Every file under `cartella`, paths starting with its name. Links and
/// files the antivirus holds back are left out.
pub fn elenco(cartella: &Path) -> Vec<VoceBackup> {
    let Some(nome) = cartella.file_name().map(|n| n.to_string_lossy().into_owned()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut pila = vec![(cartella.to_path_buf(), nome)];
    while let Some((dir, rel)) = pila.pop() {
        let Ok(rd) = std::fs::read_dir(paths::extended(&dir)) else { continue };
        for d in rd.flatten() {
            let Ok(meta) = std::fs::symlink_metadata(d.path()) else { continue };
            let nome = d.file_name().to_string_lossy().into_owned();
            let figlio = format!("{rel}/{nome}");
            let path = PathBuf::from(paths::display(&d.path()));
            if meta.is_dir() {
                pila.push((path, figlio));
            } else if meta.is_file() && !temporaneo(&nome) {
                out.push(VoceBackup {
                    rel: figlio,
                    dimensione: meta.len(),
                    modificato: meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64),
                });
            }
        }
    }
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    out
}

/// What the friend lacks or holds in another version.
pub fn da_mandare(locali: &[VoceBackup], remoti: &[VoceBackup]) -> Vec<VoceBackup> {
    let la: HashMap<&str, &VoceBackup> = remoti.iter().map(|v| (v.rel.as_str(), v)).collect();
    locali
        .iter()
        .filter(|v| la.get(v.rel.as_str()).is_none_or(|r| r.dimensione != v.dimensione || r.modificato != v.modificato))
        .cloned()
        .collect()
}

/// The same files as `lan::manda_file` wants them.
pub(crate) fn come_voci(v: &[VoceBackup]) -> Vec<Voce> {
    v.iter().map(|v| Voce { rel: v.rel.clone(), dimensione: v.dimensione, cartella: false }).collect()
}

const ESTENSIONE_TEMPORANEA: &str = ".st-backup";

fn temporaneo(nome: &str) -> bool {
    nome.ends_with(ESTENSIONE_TEMPORANEA)
}

/// Every path starts with `cartella/` and cannot leave it.
pub fn voci_valide(cartella: &str, voci: &[VoceBackup]) -> bool {
    rel_sicuro(cartella).is_some_and(|c| c.components().count() == 1)
        && voci.iter().all(|v| {
            v.rel.strip_prefix(cartella).is_some_and(|r| r.starts_with('/'))
                && rel_sicuro(&v.rel).is_some_and(|r| r.components().count() > 1)
        })
}

/// Reads the files' bytes and writes them under `dest`, replacing older
/// copies. Each file is written aside and swapped in only when complete, so
/// a broken transfer never leaves a half file in place of a good one.
/// Returns how many arrived; the antivirus may hold some back.
pub fn prendi(s: &mut impl Read, dest: &Path, voci: &[VoceBackup], annulla: &AtomicBool) -> io::Result<usize> {
    let mut buf = vec![0u8; 256 * 1024];
    let mut arrivati = 0;
    for v in voci {
        let rel = rel_sicuro(&v.rel).ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "path non valido"))?;
        let arrivo = dest.join(rel);
        if let Some(g) = arrivo.parent() {
            std::fs::create_dir_all(paths::extended(g))?;
        }
        let tmp = PathBuf::from(format!("{}{ESTENSIONE_TEMPORANEA}", arrivo.display()));
        let mut out = match std::fs::File::create(paths::extended(&tmp)) {
            Ok(f) => Some(f),
            Err(e) if e_virus(&e) => None,
            Err(e) => return Err(e),
        };
        let mut resto = v.dimensione;
        while resto > 0 {
            if annulla.load(Ordering::Relaxed) {
                drop(out);
                let _ = std::fs::remove_file(paths::extended(&tmp));
                return Err(io::Error::new(io::ErrorKind::Interrupted, "annullato"));
            }
            let quanto = (resto as usize).min(buf.len());
            if let Err(e) = s.read_exact(&mut buf[..quanto]) {
                drop(out);
                let _ = std::fs::remove_file(paths::extended(&tmp));
                return Err(e);
            }
            if let Some(f) = out.as_mut() {
                if let Err(e) = f.write_all(&buf[..quanto]) {
                    out = None;
                    let _ = std::fs::remove_file(paths::extended(&tmp));
                    if !e_virus(&e) {
                        return Err(e);
                    }
                }
            }
            resto -= quanto as u64;
        }
        let Some(f) = out else { continue };
        drop(f);
        std::fs::rename(paths::extended(&tmp), paths::extended(&arrivo))?;
        if esamina(&arrivo) == Esame::Bloccato {
            let _ = std::fs::remove_file(paths::extended(&arrivo));
            continue;
        }
        // Last: closing the file and the antivirus mark both touch the time.
        if let Some(m) = v.modificato.filter(|m| *m >= 0) {
            let _ = std::fs::File::options()
                .write(true)
                .open(paths::extended(&arrivo))
                .and_then(|f| f.set_modified(UNIX_EPOCH + Duration::from_millis(m as u64)));
        }
        arrivati += 1;
    }
    Ok(arrivati)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(rel: &str, dimensione: u64, modificato: i64) -> VoceBackup {
        VoceBackup { rel: rel.into(), dimensione, modificato: Some(modificato) }
    }

    #[test]
    fn sends_only_missing_or_changed_files() {
        let qui = [v("F/a", 1, 10), v("F/b", 2, 20), v("F/c", 3, 30), v("F/d", 4, 40)];
        let la = [v("F/a", 1, 10), v("F/b", 9, 20), v("F/c", 3, 31), v("F/vecchio", 5, 5)];
        let rel: Vec<_> = da_mandare(&qui, &la).into_iter().map(|v| v.rel).collect();
        assert_eq!(rel, ["F/b", "F/c", "F/d"]);
    }

    #[test]
    fn due_once_a_day_and_not_right_after_a_failure() {
        let b = |ultimo, tentato| Backup { cartella: "x".into(), ultimo, tentato, esito: None };
        assert!(dovuto(&b(None, None), 0));
        assert!(!dovuto(&b(Some(0), Some(0)), OGNI - 1));
        assert!(dovuto(&b(Some(0), Some(0)), OGNI));
        assert!(!dovuto(&b(None, Some(100)), 100 + RIPROVA - 1));
        assert!(dovuto(&b(None, Some(100)), 100 + RIPROVA));
    }

    #[test]
    fn refuses_paths_outside_the_folder() {
        assert!(voci_valide("F", &[v("F/a/b.txt", 1, 1)]));
        assert!(!voci_valide("F", &[v("G/a.txt", 1, 1)]));
        assert!(!voci_valide("F", &[v("F/../x", 1, 1)]));
        assert!(!voci_valide("F", &[v("Foto/a", 1, 1)]));
        assert!(!voci_valide("..", &[]));
        assert!(!voci_valide("F/G", &[]));
    }

    #[test]
    fn writes_replaces_and_keeps_the_time_then_lists_the_same() {
        let dir = tempfile::tempdir().unwrap();
        let sorgente = dir.path().join("qui").join("Foto");
        std::fs::create_dir_all(sorgente.join("2024")).unwrap();
        std::fs::write(sorgente.join("a.txt"), "uno").unwrap();
        std::fs::write(sorgente.join("2024").join("b.txt"), "duetre").unwrap();
        let locali = elenco(&sorgente);
        assert_eq!(locali.iter().map(|v| v.rel.as_str()).collect::<Vec<_>>(), ["Foto/2024/b.txt", "Foto/a.txt"]);

        let la = dir.path().join("la");
        std::fs::create_dir_all(la.join("Foto")).unwrap();
        std::fs::write(la.join("Foto").join("a.txt"), "vecchio").unwrap();
        let mut byte: Vec<u8> = Vec::new();
        byte.extend(b"duetre");
        byte.extend(b"uno");
        let n = prendi(&mut byte.as_slice(), &la, &locali, &AtomicBool::new(false)).unwrap();

        assert_eq!(n, 2);
        assert_eq!(std::fs::read_to_string(la.join("Foto").join("a.txt")).unwrap(), "uno");
        // Same size and time: the next round sends nothing.
        assert!(da_mandare(&locali, &elenco(&la.join("Foto"))).is_empty());
    }

    #[test]
    fn a_broken_transfer_leaves_the_old_copy() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("F")).unwrap();
        std::fs::write(dir.path().join("F").join("a"), "buono").unwrap();
        let corti: &[u8] = b"xy";
        assert!(prendi(&mut &corti[..], dir.path(), &[v("F/a", 10, 1)], &AtomicBool::new(false)).is_err());
        assert_eq!(std::fs::read_to_string(dir.path().join("F").join("a")).unwrap(), "buono");
        assert_eq!(elenco(&dir.path().join("F")).len(), 1);
    }
}
