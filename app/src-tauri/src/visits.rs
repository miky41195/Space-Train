//! What each folder looked like at the last visit, for «Dall'ultima visita».
//!
//! Only names, sizes and dates, never contents: one small JSON file per
//! folder in `<data>/visits`, named by the hash of its path. Files nobody
//! has opened for six months are removed at startup.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

static DIR: OnceLock<PathBuf> = OnceLock::new();
const KEEP: Duration = Duration::from_secs(180 * 24 * 60 * 60);
/// Bigger folders are not remembered: the file would weigh megabytes.
const MAX_ENTRIES: usize = 20_000;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Seen {
    pub name: String,
    pub folder: bool,
    pub size: f64,
    pub modified: f64,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Visit {
    /// When it was seen, in ms.
    pub at: f64,
    pub entries: Vec<Seen>,
}

pub fn install(dir: PathBuf) {
    let old = dir.clone();
    std::thread::spawn(move || prune(&old, KEEP));
    let _ = DIR.set(dir);
}

fn prune(dir: &Path, keep: Duration) {
    let Ok(items) = std::fs::read_dir(dir) else { return };
    for item in items.filter_map(|i| i.ok()) {
        let old = item
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|m| SystemTime::now().duration_since(m).ok())
            .is_some_and(|age| age >= keep);
        if old {
            let _ = std::fs::remove_file(item.path());
        }
    }
}

fn file_for(dir: &Path, folder: &str) -> PathBuf {
    // Windows paths ignore case: «C:\Foto» and «c:\foto» are one folder.
    let key = if cfg!(windows) { folder.to_lowercase() } else { folder.to_string() };
    dir.join(format!("{}.json", blake3::hash(key.trim_end_matches(['\\', '/']).as_bytes()).to_hex()))
}

/// Saves what the folder holds now and gives back the previous visit.
pub fn swap(dir: &Path, folder: &str, entries: Vec<Seen>, now: f64) -> Option<Visit> {
    let file = file_for(dir, folder);
    let before = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok());
    if entries.len() <= MAX_ENTRIES {
        let _ = std::fs::create_dir_all(dir);
        if let Ok(json) = serde_json::to_vec(&Visit { at: now, entries }) {
            let _ = std::fs::write(&file, json);
        }
    }
    before
}

/// The previous visit of `path`, after saving `entries` as the new one.
#[tauri::command]
pub fn folder_visit(path: String, entries: Vec<Seen>) -> Option<Visit> {
    let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0);
    swap(DIR.get()?, &path, entries, now)
}

/// Forgets every visit: the user switched the feature off.
#[tauri::command]
pub fn folder_visits_forget() {
    if let Some(dir) = DIR.get() {
        let _ = std::fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn seen(name: &str) -> Seen {
        Seen { name: name.into(), folder: false, size: 1.0, modified: 2.0 }
    }

    #[test]
    fn the_first_visit_has_nothing_before_and_the_second_gets_the_first() {
        let d = tempdir().unwrap();
        assert_eq!(swap(d.path(), r"C:\Foto", vec![seen("a.jpg")], 10.0), None);
        // Same folder with a trailing separator (and, on Windows, other case).
        let again = if cfg!(windows) { r"c:\foto\" } else { r"C:\Foto\" };
        let before = swap(d.path(), again, vec![seen("b.jpg")], 20.0).unwrap();
        assert_eq!(before.at, 10.0);
        assert_eq!(before.entries, vec![seen("a.jpg")]);
    }

    #[test]
    fn old_visits_are_removed() {
        let d = tempdir().unwrap();
        swap(d.path(), "/x", vec![seen("a")], 1.0);
        prune(d.path(), Duration::ZERO);
        assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 0);
    }
}
