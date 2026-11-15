//! Previous versions of files, kept by Space Train.
//!
//! Two sources: before Space Train overwrites a file (paste with
//! «Sovrascrivi», «Allinea», the text editor, a restore) it keeps the copy
//! that was there; inside the folders the user protects, every file that
//! changes, by any program, leaves its new content, after a first copy of
//! the whole folder.
//!
//! Contents are stored once each, named by their BLAKE3 hash, in
//! `<data>/versions/blobs`; `index.json` maps each file to its versions.
//! Versions older than the chosen days go, except the newest of each file
//! (it is what the next change is compared with); past the size limit the
//! oldest go first.

use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Bigger files are never kept: one copy would weigh too much.
pub const MAX_FILE: u64 = 200 * 1024 * 1024;
const DEFAULT_DAYS: u32 = 30;
const DEFAULT_MAX: u64 = 5 * 1024 * 1024 * 1024;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// A changed file is kept only once it has been quiet this long.
const SETTLE: Duration = Duration::from_secs(3);

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Reason {
    /// Before Space Train wrote over it.
    Overwritten,
    /// Before the text editor saved it.
    Edited,
    /// Before a previous version was put back.
    Restored,
    /// Changed inside a protected folder.
    Changed,
    /// First copy when the folder was protected.
    Protected,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    /// BLAKE3 of the content, also the blob's name.
    pub id: String,
    /// When it was kept, ms since 1970.
    pub at: i64,
    pub size: u64,
    /// The file's own modification time then.
    pub modified: Option<i64>,
    pub reason: Reason,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub protected: Vec<String>,
    #[serde(default = "default_days")]
    pub days: u32,
    #[serde(default = "default_max")]
    pub max_bytes: u64,
}

fn default_days() -> u32 {
    DEFAULT_DAYS
}
fn default_max() -> u64 {
    DEFAULT_MAX
}

impl Default for Settings {
    fn default() -> Self {
        Settings { protected: Vec::new(), days: DEFAULT_DAYS, max_bytes: DEFAULT_MAX }
    }
}

#[derive(Serialize, Deserialize, Default)]
struct Index {
    #[serde(default)]
    settings: Settings,
    /// Key (lowercase path on Windows) → versions, oldest first.
    #[serde(default)]
    files: HashMap<String, Vec<Version>>,
}

/// What the Settings window shows.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    #[serde(flatten)]
    pub settings: Settings,
    /// Bytes the kept contents take.
    pub used: u64,
}

pub struct Versions {
    dir: PathBuf,
    index: Mutex<Index>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

static VERSIONS: OnceLock<Arc<Versions>> = OnceLock::new();

/// Keeps the current content of `path` before Space Train replaces it.
/// Does nothing before the app has started the store (tests) or for files
/// that are missing or too big.
pub fn keep_before(path: &Path, reason: Reason) {
    if let Some(v) = VERSIONS.get() {
        let _ = v.keep(path, reason);
    }
}

/// Before a copy or a move with «Sovrascrivi»: keeps each file of `arrival`
/// that the item from `source` is about to replace.
pub fn keep_overwritten(source: &Path, arrival: &Path) {
    if VERSIONS.get().is_none() {
        return;
    }
    if paths::extended(arrival).is_file() {
        keep_before(arrival, Reason::Overwritten);
        return;
    }
    for (f, _) in walk(source) {
        if let Ok(rel) = f.strip_prefix(source) {
            let old = arrival.join(rel);
            if paths::extended(&old).is_file() {
                keep_before(&old, Reason::Overwritten);
            }
        }
    }
}

fn key(path: &Path) -> String {
    let p = paths::display(path);
    if cfg!(windows) { p.to_lowercase() } else { p }
}

fn now() -> i64 {
    crate::backup::now()
}

fn modified_ms(m: &std::fs::Metadata) -> Option<i64> {
    m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64)
}

/// Files the change is not worth keeping for: partial downloads, Office
/// lock files, saves in progress.
fn is_scratch(name: &str) -> bool {
    let n = name.to_lowercase();
    n.starts_with("~$")
        || n.starts_with(".~")
        || [".tmp", ".parziale", ".space-train-save", ".st-backup", ".crdownload", ".part", ".partial", ".download"].iter().any(|e| n.ends_with(e))
}

fn inside(path: &str, folder: &str) -> bool {
    let (p, f) = if cfg!(windows) { (path.to_lowercase(), folder.to_lowercase()) } else { (path.to_string(), folder.to_string()) };
    let f = f.trim_end_matches(['\\', '/']);
    p == f || p.strip_prefix(f).is_some_and(|rest| rest.starts_with(['\\', '/']))
}

impl Versions {
    pub fn load(dir: PathBuf) -> Self {
        let index = std::fs::read(dir.join("index.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Versions { dir, index: Mutex::new(index), watcher: Mutex::new(None) }
    }

    /// Makes the store the one `keep_before` uses and starts watching.
    pub fn install(self: &Arc<Self>) {
        let _ = VERSIONS.set(self.clone());
        self.rewatch();
    }

    fn blob(&self, id: &str) -> PathBuf {
        self.dir.join("blobs").join(id)
    }

    fn save(&self, index: &Index) -> Result<(), FsError> {
        std::fs::create_dir_all(&self.dir).map_err(|e| from_io(&e))?;
        let tmp = self.dir.join("index.json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(index).map_err(|e| FsError::Io { message: e.to_string() })?).map_err(|e| from_io(&e))?;
        std::fs::rename(&tmp, self.dir.join("index.json")).map_err(|e| from_io(&e))
    }

    /// Copies the file into the blobs while hashing it; the same content is stored once.
    fn store(&self, path: &Path) -> std::io::Result<String> {
        let blobs = self.dir.join("blobs");
        std::fs::create_dir_all(&blobs)?;
        let tmp = blobs.join(format!(".in-{}-{:?}", std::process::id(), std::thread::current().id()));
        let mut from = std::fs::File::open(paths::extended(path))?;
        let mut to = std::io::BufWriter::new(std::fs::File::create(&tmp)?);
        let mut hasher = blake3::Hasher::new();
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            let n = from.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            to.write_all(&buf[..n])?;
        }
        to.flush()?;
        drop(to);
        let id = hasher.finalize().to_hex().to_string();
        let dest = blobs.join(&id);
        if dest.exists() {
            std::fs::remove_file(&tmp)?;
        } else {
            std::fs::rename(&tmp, &dest)?;
        }
        Ok(id)
    }

    fn hash(path: &Path) -> Option<String> {
        let mut f = std::fs::File::open(paths::extended(path)).ok()?;
        let mut hasher = blake3::Hasher::new();
        std::io::copy(&mut f, &mut hasher).ok()?;
        Some(hasher.finalize().to_hex().to_string())
    }

    /// Keeps the file's current content as a version, unless it is the
    /// same as the newest one already kept.
    pub fn keep(&self, path: &Path, reason: Reason) -> Result<bool, FsError> {
        let Ok(meta) = std::fs::metadata(paths::extended(path)) else { return Ok(false) };
        if !meta.is_file() || meta.len() > MAX_FILE {
            return Ok(false);
        }
        let id = self.store(path).map_err(|e| from_io(&e))?;
        let mut index = self.index.lock().unwrap();
        let list = index.files.entry(key(path)).or_default();
        if list.last().is_some_and(|v| v.id == id) {
            return Ok(false);
        }
        list.push(Version { id, at: now(), size: meta.len(), modified: modified_ms(&meta), reason });
        prune(&mut index, now());
        self.collect(&index);
        self.save(&index)?;
        Ok(true)
    }

    /// The versions of a file other than its current content, newest first.
    pub fn list(&self, path: &Path) -> Vec<Version> {
        let current = Self::hash(path);
        let index = self.index.lock().unwrap();
        let mut out: Vec<Version> = index.files.get(&key(path)).cloned().unwrap_or_default();
        out.retain(|v| Some(&v.id) != current.as_ref());
        out.reverse();
        out
    }

    fn find(&self, path: &Path, id: &str) -> Result<Version, FsError> {
        let index = self.index.lock().unwrap();
        index.files.get(&key(path)).and_then(|l| l.iter().find(|v| v.id == id)).cloned().ok_or(FsError::NotFound)
    }

    /// A copy of the version in a temporary folder, to open or compare.
    pub fn extract(&self, path: &Path, id: &str) -> Result<PathBuf, FsError> {
        self.find(path, id)?;
        let name = path.file_name().ok_or(FsError::NotFound)?;
        let dir = std::env::temp_dir().join("space-train-versions").join(&id[..12.min(id.len())]);
        std::fs::create_dir_all(&dir).map_err(|e| from_io(&e))?;
        let out = dir.join(name);
        std::fs::copy(self.blob(id), &out).map_err(|e| from_io(&e))?;
        Ok(out)
    }

    /// Puts the version back in place; what was there becomes a version too.
    pub fn restore(&self, path: &Path, id: &str) -> Result<(), FsError> {
        self.find(path, id)?;
        self.keep(path, Reason::Restored)?;
        let p = paths::extended(path);
        let name = p.file_name().ok_or(FsError::NotFound)?.to_string_lossy().into_owned();
        let tmp = p.with_file_name(format!(".{name}.space-train-save"));
        std::fs::copy(self.blob(id), &tmp).map_err(|e| from_io(&e))?;
        std::fs::rename(&tmp, &p).map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            from_io(&e)
        })
    }

    pub fn overview(&self) -> Overview {
        let settings = self.index.lock().unwrap().settings.clone();
        let used = std::fs::read_dir(self.dir.join("blobs"))
            .map(|rd| rd.flatten().filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum())
            .unwrap_or(0);
        Overview { settings, used }
    }

    pub fn set_limits(&self, days: u32, max_bytes: u64) -> Result<(), FsError> {
        let mut index = self.index.lock().unwrap();
        index.settings.days = days.clamp(1, 3650);
        index.settings.max_bytes = max_bytes.max(100 * 1024 * 1024);
        prune(&mut index, now());
        self.collect(&index);
        self.save(&index)
    }

    pub fn is_protected(&self, path: &str) -> bool {
        self.index.lock().unwrap().settings.protected.iter().any(|f| inside(path, f))
    }

    /// Protects a folder (first copy of every file in it, in the
    /// background) or stops protecting it; its versions stay until they expire.
    pub fn protect(self: &Arc<Self>, folder: &str, on: bool) -> Result<(), FsError> {
        let root = PathBuf::from(folder);
        if on {
            if !paths::extended(&root).is_dir() {
                return Err(FsError::NotADirectory);
            }
            let files = walk(&root);
            let weight: u64 = files.iter().map(|f| f.1).sum();
            let max = self.index.lock().unwrap().settings.max_bytes;
            if weight > max {
                return Err(FsError::Io {
                    message: format!(
                        "La cartella pesa {:.1} GB: supera il limite delle versioni ({:.1} GB). Alzalo in Impostazioni o proteggi una cartella più piccola.",
                        weight as f64 / 1e9,
                        max as f64 / 1e9
                    ),
                });
            }
            {
                let mut index = self.index.lock().unwrap();
                if index.settings.protected.iter().any(|f| inside(folder, f)) {
                    return Ok(());
                }
                // A folder inside it is covered from now on.
                index.settings.protected.retain(|f| !inside(f, folder));
                index.settings.protected.push(paths::display(&root));
                self.save(&index)?;
            }
            let me = self.clone();
            std::thread::spawn(move || {
                for (f, _) in files {
                    let _ = me.keep(&f, Reason::Protected);
                }
            });
        } else {
            let mut index = self.index.lock().unwrap();
            index.settings.protected.retain(|f| !inside(f, folder) && !inside(folder, f));
            self.save(&index)?;
        }
        self.rewatch();
        Ok(())
    }

    /// Removes the blobs no version uses any more.
    fn collect(&self, index: &Index) {
        let used: HashSet<&str> = index.files.values().flatten().map(|v| v.id.as_str()).collect();
        if let Ok(rd) = std::fs::read_dir(self.dir.join("blobs")) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if !name.starts_with('.') && !used.contains(name.as_str()) {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
    }

    /// Watches the protected folders again, after the list changed.
    fn rewatch(self: &Arc<Self>) {
        let folders = self.index.lock().unwrap().settings.protected.clone();
        let mut slot = self.watcher.lock().unwrap();
        *slot = None;
        if folders.is_empty() {
            return;
        }
        let (tx, rx) = std::sync::mpsc::channel::<PathBuf>();
        let tx = Mutex::new(tx);
        let Ok(mut w) = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
            if let (Ok(event), Ok(tx)) = (event, tx.lock()) {
                if matches!(event.kind, notify::EventKind::Create(_) | notify::EventKind::Modify(_)) {
                    for p in event.paths {
                        let _ = tx.send(p);
                    }
                }
            }
        }) else {
            return;
        };
        for f in &folders {
            let _ = w.watch(Path::new(f), RecursiveMode::Recursive);
        }
        *slot = Some(w);
        let me = Arc::downgrade(self);
        std::thread::spawn(move || {
            let mut pending: HashMap<PathBuf, Instant> = HashMap::new();
            loop {
                match rx.recv_timeout(Duration::from_secs(1)) {
                    Ok(p) => {
                        pending.insert(p, Instant::now());
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                    // The watcher was replaced or dropped: this thread ends with it.
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                }
                let ready: Vec<PathBuf> = pending.iter().filter(|(_, t)| t.elapsed() >= SETTLE).map(|(p, _)| p.clone()).collect();
                let Some(v) = me.upgrade() else { return };
                for p in ready {
                    pending.remove(&p);
                    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                    if !is_scratch(&name) && !p.starts_with(&v.dir) && v.is_protected(&paths::display(&p)) {
                        let _ = v.keep(&p, Reason::Changed);
                    }
                }
            }
        });
    }
}

/// Every file under `root` that can be kept, with its size.
fn walk(root: &Path) -> Vec<(PathBuf, u64)> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(paths::extended(&dir)) else { continue };
        for e in rd.flatten() {
            let Ok(m) = std::fs::symlink_metadata(e.path()) else { continue };
            let p = PathBuf::from(paths::display(&e.path()));
            if m.is_dir() {
                stack.push(p);
            } else if m.is_file() && m.len() <= MAX_FILE && !is_scratch(&e.file_name().to_string_lossy()) {
                out.push((p, m.len()));
            }
        }
    }
    out
}

/// Drops the versions past the days and then, oldest first, past the size;
/// the newest version of each file always stays.
fn prune(index: &mut Index, now: i64) {
    let cutoff = now - index.settings.days as i64 * DAY_MS;
    for list in index.files.values_mut() {
        let n = list.len();
        let mut i = 0;
        list.retain(|v| {
            i += 1;
            i == n || v.at >= cutoff
        });
    }
    let size_of: HashMap<String, u64> = index.files.values().flatten().map(|v| (v.id.clone(), v.size)).collect();
    let mut total: u64 = size_of.values().sum();
    while total > index.settings.max_bytes {
        let oldest = index
            .files
            .iter()
            .filter(|(_, l)| l.len() > 1)
            .map(|(k, l)| (l[0].at, k.clone()))
            .min();
        let Some((_, k)) = oldest else { break };
        let gone = index.files.get_mut(&k).unwrap().remove(0);
        if !index.files.values().flatten().any(|v| v.id == gone.id) {
            total -= gone.size;
        }
    }
    index.files.retain(|_, l| !l.is_empty());
}

// ── Commands ────────────────────────────────────────────────────────

fn store() -> Result<&'static Arc<Versions>, FsError> {
    VERSIONS.get().ok_or_else(|| FsError::Io { message: "Le versioni non sono pronte.".into() })
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, FsError> + Send + 'static) -> Result<T, FsError> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| FsError::Io { message: e.to_string() })?
}

#[tauri::command]
pub async fn versions_list(path: String) -> Result<Vec<Version>, FsError> {
    blocking(move || Ok(store()?.list(Path::new(&path)))).await
}

#[tauri::command]
pub async fn version_extract(path: String, id: String) -> Result<String, FsError> {
    blocking(move || store()?.extract(Path::new(&path), &id).map(|p| paths::display(&p))).await
}

#[tauri::command]
pub async fn version_restore(path: String, id: String) -> Result<(), FsError> {
    blocking(move || store()?.restore(Path::new(&path), &id)).await
}

#[tauri::command]
pub async fn versions_overview() -> Result<Overview, FsError> {
    blocking(move || Ok(store()?.overview())).await
}

#[tauri::command]
pub async fn versions_protect(folder: String, on: bool) -> Result<(), FsError> {
    blocking(move || store()?.protect(&folder, on)).await
}

#[tauri::command]
pub async fn versions_limits(days: u32, max_bytes: u64) -> Result<(), FsError> {
    blocking(move || store()?.set_limits(days, max_bytes)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(id: &str, at: i64, size: u64) -> Version {
        Version { id: id.into(), at, size, modified: None, reason: Reason::Changed }
    }

    #[test]
    fn keeps_changes_once_and_lists_only_the_past() {
        let t = tempfile::tempdir().unwrap();
        let v = Versions::load(t.path().join("store"));
        let f = t.path().join("nota.txt");
        std::fs::write(&f, b"uno").unwrap();
        assert!(v.keep(&f, Reason::Protected).unwrap());
        assert!(!v.keep(&f, Reason::Changed).unwrap(), "same content as the newest");
        assert!(v.list(&f).is_empty(), "the current content is not a previous version");
        std::fs::write(&f, b"due").unwrap();
        v.keep(&f, Reason::Edited).unwrap();
        std::fs::write(&f, b"tre").unwrap();
        let past = v.list(&f);
        assert_eq!(past.len(), 2);
        assert_eq!(past[0].reason, Reason::Edited, "newest first");

        v.restore(&f, &past[1].id).unwrap();
        assert_eq!(std::fs::read(&f).unwrap(), b"uno");
        assert!(v.list(&f).iter().any(|x| x.reason == Reason::Restored), "what was there before the restore is kept");
        let copy = v.extract(&f, &past[0].id).unwrap();
        assert_eq!(std::fs::read(copy).unwrap(), b"due");

        let again = Versions::load(t.path().join("store"));
        assert_eq!(again.list(&f).len(), v.list(&f).len(), "the index survives a restart");
    }

    #[test]
    fn prune_drops_old_and_big_but_never_the_newest() {
        let mut index = Index::default();
        index.settings.days = 30;
        index.settings.max_bytes = 150;
        let now = 100 * DAY_MS;
        index.files.insert("a".into(), vec![version("a1", 0, 50), version("a2", now - DAY_MS, 50), version("a3", now, 50)]);
        index.files.insert("b".into(), vec![version("b1", 0, 80)]);
        prune(&mut index, now);
        assert_eq!(index.files["b"].len(), 1, "a lone old version is the newest of its file");
        assert_eq!(index.files["a"].iter().map(|v| v.id.as_str()).collect::<Vec<_>>(), vec!["a3"], "a1 too old, a2 over the size");
    }

    #[test]
    fn scratch_files_and_folder_paths() {
        assert!(is_scratch("~$relazione.docx"));
        assert!(is_scratch("film.mkv.parziale"));
        assert!(!is_scratch("relazione.docx"));
        assert!(inside("C:\\Docs\\a.txt", "C:\\Docs"));
        assert!(inside("C:\\Docs", "C:\\Docs\\"));
        assert!(!inside("C:\\Documenti\\a.txt", "C:\\Docs"));
    }
}
