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
use crate::fs::origin::{is_virus, scan, Scan};
use crate::lan::{safe_rel, Item};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, UNIX_EPOCH};

/// Once a day, and after a failure not before ten minutes.
pub const EVERY: i64 = 24 * 60 * 60 * 1000;
pub const RETRY: i64 = 10 * 60 * 1000;

/// A file of the backup: path from the folder's own name (`Foto/a.jpg`),
/// size and modification time in ms.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupItem {
    pub rel: String,
    #[serde(rename = "dimensione")]
    pub size: u64,
    #[serde(rename = "modificato")]
    pub modified: Option<i64>,
}

/// Our folder kept on a friend's PC.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    #[serde(rename = "cartella")]
    pub folder: String,
    /// Last backup that went through, ms since 1970.
    #[serde(default, rename = "ultimo")]
    pub last: Option<i64>,
    /// Last attempt, successful or not.
    #[serde(default, rename = "tentato")]
    pub attempted: Option<i64>,
    /// What happened last time, for the Friends window.
    #[serde(default, rename = "esito")]
    pub outcome: Option<String>,
}

/// A friend's backup kept on our PC: they ask, we say yes or no once.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Consent {
    #[serde(rename = "chiesto")]
    Asked,
    #[serde(rename = "si")]
    Yes,
    No,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Guest {
    #[serde(rename = "consenso")]
    pub consent: Consent,
    /// Where their folders go, chosen when accepting.
    #[serde(default, rename = "cartella")]
    pub folder: Option<String>,
    /// Last backup received, ms since 1970.
    #[serde(default, rename = "ultimo")]
    pub last: Option<i64>,
}

/// An error as the Friends window shows it.
pub fn text(e: &crate::fs::error::FsError) -> String {
    use crate::fs::error::FsError::*;
    match e {
        AccessDenied => "Accesso negato.".into(),
        NotFound => "Elemento non trovato.".into(),
        NotADirectory => "Non è una cartella.".into(),
        DeviceNotReady => "Disco non pronto.".into(),
        Io { message } => message.clone(),
        ServerKey { .. } => "Chiave del server da confermare.".into(),
        ServerPassword => "Il server chiede la password.".into(),
        Changed => "Il file è cambiato su disco nel frattempo.".into(),
    }
}

pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Whether the daily backup is due at `now`.
pub fn due(b: &Backup, now: i64) -> bool {
    due_at(b.last, b.attempted, now)
}

/// Due when the last success is a day old and the last try ten minutes old.
pub fn due_at(last: Option<i64>, attempted: Option<i64>, now: i64) -> bool {
    last.is_none_or(|u| now - u >= EVERY) && attempted.is_none_or(|t| now - t >= RETRY)
}

/// Every file under `folder`, paths starting with its name. Links and
/// files the antivirus holds back are left out.
pub fn listing(folder: &Path) -> Vec<BackupItem> {
    let Some(name) = folder.file_name().map(|n| n.to_string_lossy().into_owned()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut stack = vec![(folder.to_path_buf(), name)];
    while let Some((dir, rel)) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(paths::extended(&dir)) else { continue };
        for d in rd.flatten() {
            let Ok(meta) = std::fs::symlink_metadata(d.path()) else { continue };
            let name = d.file_name().to_string_lossy().into_owned();
            let child = format!("{rel}/{name}");
            let path = PathBuf::from(paths::display(&d.path()));
            if meta.is_dir() {
                stack.push((path, child));
            } else if meta.is_file() && !is_temp(&name) {
                out.push(BackupItem {
                    rel: child,
                    size: meta.len(),
                    modified: meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64),
                });
            }
        }
    }
    out.sort_by(|a, b| a.rel.cmp(&b.rel));
    out
}

/// What the friend lacks or holds in another version.
pub fn to_send(local: &[BackupItem], remote: &[BackupItem]) -> Vec<BackupItem> {
    let there: HashMap<&str, &BackupItem> = remote.iter().map(|v| (v.rel.as_str(), v)).collect();
    local
        .iter()
        .filter(|v| there.get(v.rel.as_str()).is_none_or(|r| r.size != v.size || r.modified != v.modified))
        .cloned()
        .collect()
}

/// The same files as `lan::send_files` wants them.
pub(crate) fn as_items(v: &[BackupItem]) -> Vec<Item> {
    v.iter().map(|v| Item { rel: v.rel.clone(), size: v.size, folder: false }).collect()
}

const TEMP_EXTENSION: &str = ".st-backup";

fn is_temp(name: &str) -> bool {
    name.ends_with(TEMP_EXTENSION)
}

/// Every path starts with `folder/` and cannot leave it.
pub fn valid_items(folder: &str, items: &[BackupItem]) -> bool {
    safe_rel(folder).is_some_and(|c| c.components().count() == 1)
        && items.iter().all(|v| {
            v.rel.strip_prefix(folder).is_some_and(|r| r.starts_with('/'))
                && safe_rel(&v.rel).is_some_and(|r| r.components().count() > 1)
        })
}

/// Reads the files' bytes and writes them under `dest`, replacing older
/// copies. Each file is written aside and swapped in only when complete, so
/// a broken transfer never leaves a half file in place of a good one.
/// Returns how many arrived; the antivirus may hold some back.
pub fn receive(s: &mut impl Read, dest: &Path, items: &[BackupItem], cancel: &AtomicBool) -> io::Result<usize> {
    let mut buf = vec![0u8; 256 * 1024];
    let mut arrived = 0;
    for v in items {
        let rel = safe_rel(&v.rel).ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "path non valido"))?;
        let arrival = dest.join(rel);
        if let Some(g) = arrival.parent() {
            std::fs::create_dir_all(paths::extended(g))?;
        }
        let tmp = PathBuf::from(format!("{}{TEMP_EXTENSION}", arrival.display()));
        let mut out = match std::fs::File::create(paths::extended(&tmp)) {
            Ok(f) => Some(f),
            Err(e) if is_virus(&e) => None,
            Err(e) => return Err(e),
        };
        let mut rest = v.size;
        while rest > 0 {
            if cancel.load(Ordering::Relaxed) {
                drop(out);
                let _ = std::fs::remove_file(paths::extended(&tmp));
                return Err(io::Error::new(io::ErrorKind::Interrupted, "annullato"));
            }
            let chunk = (rest as usize).min(buf.len());
            if let Err(e) = s.read_exact(&mut buf[..chunk]) {
                drop(out);
                let _ = std::fs::remove_file(paths::extended(&tmp));
                return Err(e);
            }
            if let Some(f) = out.as_mut() {
                if let Err(e) = f.write_all(&buf[..chunk]) {
                    out = None;
                    let _ = std::fs::remove_file(paths::extended(&tmp));
                    if !is_virus(&e) {
                        return Err(e);
                    }
                }
            }
            rest -= chunk as u64;
        }
        let Some(f) = out else { continue };
        drop(f);
        std::fs::rename(paths::extended(&tmp), paths::extended(&arrival))?;
        if scan(&arrival) == Scan::Blocked {
            let _ = std::fs::remove_file(paths::extended(&arrival));
            continue;
        }
        // Last: closing the file and the antivirus mark both touch the time.
        if let Some(m) = v.modified.filter(|m| *m >= 0) {
            let _ = std::fs::File::options()
                .write(true)
                .open(paths::extended(&arrival))
                .and_then(|f| f.set_modified(UNIX_EPOCH + Duration::from_millis(m as u64)));
        }
        arrived += 1;
    }
    Ok(arrived)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(rel: &str, size: u64, modified: i64) -> BackupItem {
        BackupItem { rel: rel.into(), size, modified: Some(modified) }
    }

    #[test]
    fn sends_only_missing_or_changed_files() {
        let here = [v("F/a", 1, 10), v("F/b", 2, 20), v("F/c", 3, 30), v("F/d", 4, 40)];
        let there = [v("F/a", 1, 10), v("F/b", 9, 20), v("F/c", 3, 31), v("F/vecchio", 5, 5)];
        let rel: Vec<_> = to_send(&here, &there).into_iter().map(|v| v.rel).collect();
        assert_eq!(rel, ["F/b", "F/c", "F/d"]);
    }

    #[test]
    fn due_once_a_day_and_not_right_after_a_failure() {
        let b = |last, attempted| Backup { folder: "x".into(), last, attempted, outcome: None };
        assert!(due(&b(None, None), 0));
        assert!(!due(&b(Some(0), Some(0)), EVERY - 1));
        assert!(due(&b(Some(0), Some(0)), EVERY));
        assert!(!due(&b(None, Some(100)), 100 + RETRY - 1));
        assert!(due(&b(None, Some(100)), 100 + RETRY));
    }

    #[test]
    fn refuses_paths_outside_the_folder() {
        assert!(valid_items("F", &[v("F/a/b.txt", 1, 1)]));
        assert!(!valid_items("F", &[v("G/a.txt", 1, 1)]));
        assert!(!valid_items("F", &[v("F/../x", 1, 1)]));
        assert!(!valid_items("F", &[v("Foto/a", 1, 1)]));
        assert!(!valid_items("..", &[]));
        assert!(!valid_items("F/G", &[]));
    }

    #[test]
    fn writes_replaces_and_keeps_the_time_then_lists_the_same() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("qui").join("Foto");
        std::fs::create_dir_all(source.join("2024")).unwrap();
        std::fs::write(source.join("a.txt"), "uno").unwrap();
        std::fs::write(source.join("2024").join("b.txt"), "duetre").unwrap();
        let local = listing(&source);
        assert_eq!(local.iter().map(|v| v.rel.as_str()).collect::<Vec<_>>(), ["Foto/2024/b.txt", "Foto/a.txt"]);

        let there = dir.path().join("la");
        std::fs::create_dir_all(there.join("Foto")).unwrap();
        std::fs::write(there.join("Foto").join("a.txt"), "vecchio").unwrap();
        let mut byte: Vec<u8> = Vec::new();
        byte.extend(b"duetre");
        byte.extend(b"uno");
        let n = receive(&mut byte.as_slice(), &there, &local, &AtomicBool::new(false)).unwrap();

        assert_eq!(n, 2);
        assert_eq!(std::fs::read_to_string(there.join("Foto").join("a.txt")).unwrap(), "uno");
        // Same size and time: the next round sends nothing.
        assert!(to_send(&local, &listing(&there.join("Foto"))).is_empty());
    }

    #[test]
    fn a_broken_transfer_leaves_the_old_copy() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("F")).unwrap();
        std::fs::write(dir.path().join("F").join("a"), "buono").unwrap();
        let short: &[u8] = b"xy";
        assert!(receive(&mut &short[..], dir.path(), &[v("F/a", 10, 1)], &AtomicBool::new(false)).is_err());
        assert_eq!(std::fs::read_to_string(dir.path().join("F").join("a")).unwrap(), "buono");
        assert_eq!(listing(&dir.path().join("F")).len(), 1);
    }
}
