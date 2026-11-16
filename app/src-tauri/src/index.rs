//! The whole-disk index behind «Ovunque»: every name on the fixed drives,
//! in memory, so a search answers while the user types.
//!
//! Built by Space Train itself, with no administrator rights: the first
//! time it walks the drives in the background (searches work on what is
//! read so far), then a watcher on each drive keeps it current, rereading
//! only the folders that changed. It is saved in `<data>/index` and loaded
//! on the next start; a save older than six hours is walked again in the
//! background. Results are checked on disk before they are shown, so a file
//! deleted while Space Train was closed never appears.
//!
//! Names live in one contiguous buffer and nodes are 24 bytes with links to
//! their first child and next sibling: about 45 bytes per item, and a
//! search over millions of names takes a few milliseconds.

use crate::fs::entry::{entry_from_path, Entry};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{BinaryHeap, HashSet};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::{Duration, SystemTime};

const MAX_RESULTS: usize = 300;
const STALE: Duration = Duration::from_secs(6 * 60 * 60);
const SAVE_EVERY: Duration = Duration::from_secs(10 * 60);
const MAGIC: &[u8; 5] = b"STIX2";
const NONE: u32 = u32::MAX;

/// Linux folders that are not files on a disk.
const SKIP_LINUX: &[&str] = &["/proc", "/sys", "/dev", "/run", "/tmp", "/snap", "/var/lib/docker"];
/// Folders nobody searches by name and that hold millions of items:
/// packages of code projects, git's own store, Windows' component store.
const SKIP_NAMES: &[&str] = &["node_modules", ".git", "WinSxS"];

#[derive(Clone, Copy)]
struct Node {
    parent: u32,
    first_child: u32,
    next_sibling: u32,
    /// Where the name starts in `Volume::names`.
    off: u32,
    len: u16,
    dir: bool,
    gone: bool,
    /// Seconds since 1970, for ranking the newest first.
    modified: u32,
}

/// One drive: node 0 is its root.
struct Volume {
    root: PathBuf,
    nodes: Vec<Node>,
    names: Vec<u8>,
}

impl Volume {
    fn new(root: PathBuf) -> Self {
        let mut v = Volume { root, nodes: Vec::new(), names: Vec::new() };
        v.nodes.push(Node { parent: 0, first_child: NONE, next_sibling: NONE, off: 0, len: 0, dir: true, gone: false, modified: 0 });
        v
    }

    fn name(&self, id: u32) -> &str {
        let n = &self.nodes[id as usize];
        std::str::from_utf8(&self.names[n.off as usize..n.off as usize + n.len as usize]).unwrap_or("")
    }

    fn add(&mut self, parent: u32, name: &str, modified: u32, dir: bool) -> u32 {
        let id = self.nodes.len() as u32;
        let (off, len) = self.store(name);
        let next_sibling = self.nodes[parent as usize].first_child;
        self.nodes.push(Node { parent, first_child: NONE, next_sibling, off, len, dir, gone: false, modified });
        self.nodes[parent as usize].first_child = id;
        id
    }

    fn store(&mut self, name: &str) -> (u32, u16) {
        // A name is cut on a character boundary at 65535 bytes: no real one is longer.
        let mut end = name.len().min(u16::MAX as usize);
        while !name.is_char_boundary(end) {
            end -= 1;
        }
        let off = self.names.len() as u32;
        self.names.extend_from_slice(&name.as_bytes()[..end]);
        (off, end as u16)
    }

    fn children(&self, id: u32) -> impl Iterator<Item = u32> + '_ {
        let mut next = self.nodes[id as usize].first_child;
        std::iter::from_fn(move || {
            while next != NONE {
                let c = next;
                next = self.nodes[c as usize].next_sibling;
                if !self.nodes[c as usize].gone {
                    return Some(c);
                }
            }
            None
        })
    }

    fn path_of(&self, mut id: u32) -> PathBuf {
        let mut parts = Vec::new();
        while id != 0 {
            parts.push(self.name(id));
            id = self.nodes[id as usize].parent;
        }
        let mut p = self.root.clone();
        for part in parts.iter().rev() {
            p.push(part);
        }
        p
    }

    fn remove_tree(&mut self, id: u32) {
        let mut stack = vec![id];
        while let Some(n) = stack.pop() {
            self.nodes[n as usize].gone = true;
            let mut c = self.nodes[n as usize].first_child;
            while c != NONE {
                stack.push(c);
                c = self.nodes[c as usize].next_sibling;
            }
        }
    }

    /// The node of a path inside this volume, if indexed.
    fn find(&self, path: &Path) -> Option<u32> {
        let rest = path.strip_prefix(&self.root).ok()?;
        let mut id = 0u32;
        for part in rest.components() {
            let part = part.as_os_str().to_string_lossy();
            id = self.children(id).find(|&c| same_name(self.name(c), &part))?;
        }
        Some(id)
    }

    fn files(&self) -> u64 {
        self.nodes.iter().filter(|n| !n.gone).count() as u64 - 1
    }
}

fn same_name(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b) || a.to_lowercase() == b.to_lowercase()
    } else {
        a == b
    }
}

fn seconds(t: Option<SystemTime>) -> u32 {
    t.and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok()).map(|d| d.as_secs().min(u32::MAX as u64) as u32).unwrap_or(0)
}

fn skipped(path: &Path) -> bool {
    let name = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();
    SKIP_NAMES.iter().any(|s| name.eq_ignore_ascii_case(s)) || (cfg!(not(windows)) && SKIP_LINUX.iter().any(|s| path == Path::new(s)))
}

/// What a folder holds now: name, folder or not, date.
fn list(dir: &Path) -> Option<Vec<(String, bool, u32)>> {
    let items = std::fs::read_dir(crate::fs::paths::extended(dir)).ok()?;
    Some(
        items
            .filter_map(|i| i.ok())
            .filter_map(|i| {
                let kind = i.file_type().ok()?;
                // Links and junctions: their target is indexed where it really is.
                if kind.is_symlink() {
                    return None;
                }
                let modified = seconds(i.metadata().ok().and_then(|m| m.modified().ok()));
                Some((i.file_name().to_string_lossy().into_owned(), kind.is_dir(), modified))
            })
            .collect(),
    )
}

/// Walks a whole subtree, publishing one folder at a time.
fn walk(vol: &RwLock<Volume>, from: u32, path: PathBuf, stop: &AtomicBool, counted: &AtomicU64) {
    let mut stack = vec![(from, path)];
    while let Some((id, dir)) = stack.pop() {
        if stop.load(Ordering::Relaxed) {
            return;
        }
        let Some(found) = list(&dir) else { continue };
        let mut v = vol.write().unwrap();
        for (name, is_dir, modified) in found {
            let path = dir.join(&name);
            let child = v.add(id, &name, modified, is_dir);
            if is_dir && !skipped(&path) {
                stack.push((child, path));
            }
        }
        drop(v);
        counted.fetch_add(1, Ordering::Relaxed);
    }
}

/// Rereads one folder: children gone are removed, new ones read (whole
/// subtree for new folders), dates refreshed.
fn refresh_dir(vol: &RwLock<Volume>, id: u32, dir: &Path, stop: &AtomicBool) {
    // The folder itself is gone: its parent's refresh removes it.
    let Some(now) = list(dir) else { return };
    let mut new_dirs = Vec::new();
    {
        let mut v = vol.write().unwrap();
        let kids: Vec<u32> = v.children(id).collect();
        let mut seen = HashSet::new();
        for (name, is_dir, modified) in &now {
            match kids.iter().copied().find(|&k| same_name(v.name(k), name)) {
                Some(k) if v.nodes[k as usize].dir == *is_dir => {
                    if v.name(k) != name {
                        let (off, len) = v.store(name);
                        let n = &mut v.nodes[k as usize];
                        (n.off, n.len) = (off, len);
                    }
                    v.nodes[k as usize].modified = *modified;
                    seen.insert(k);
                }
                other => {
                    if let Some(k) = other {
                        v.remove_tree(k);
                    }
                    let k = v.add(id, name, *modified, *is_dir);
                    seen.insert(k);
                    if *is_dir && !skipped(&dir.join(name)) {
                        new_dirs.push((k, dir.join(name)));
                    }
                }
            }
        }
        for k in kids {
            if !seen.contains(&k) {
                v.remove_tree(k);
            }
        }
    }
    let counted = AtomicU64::new(0);
    for (k, p) in new_dirs {
        walk(vol, k, p, stop, &counted);
    }
}

// ── Saving ──

fn save(vol: &Volume, file: &Path) -> std::io::Result<()> {
    let tmp = file.with_extension("tmp");
    {
        let mut w = BufWriter::new(std::fs::File::create(&tmp)?);
        w.write_all(MAGIC)?;
        // Gone nodes are left out: the others get new, compact numbers.
        // A parent always comes before its children, so one pass maps them.
        let mut map = vec![NONE; vol.nodes.len()];
        let mut next = 0u32;
        for (i, n) in vol.nodes.iter().enumerate() {
            if n.gone || (i != 0 && map[n.parent as usize] == NONE) {
                continue;
            }
            map[i] = next;
            next += 1;
        }
        w.write_all(&next.to_le_bytes())?;
        for (i, n) in vol.nodes.iter().enumerate() {
            if map[i] == NONE {
                continue;
            }
            let name = vol.name(i as u32).as_bytes();
            w.write_all(&map[n.parent as usize].to_le_bytes())?;
            w.write_all(&[n.dir as u8])?;
            w.write_all(&n.modified.to_le_bytes())?;
            w.write_all(&(name.len() as u16).to_le_bytes())?;
            w.write_all(name)?;
        }
        w.flush()?;
    }
    std::fs::rename(tmp, file)
}

fn load(root: &Path, file: &Path) -> Option<Volume> {
    let mut r = BufReader::new(std::fs::File::open(file).ok()?);
    let mut magic = [0u8; 5];
    r.read_exact(&mut magic).ok()?;
    if &magic != MAGIC {
        return None;
    }
    let mut u32b = [0u8; 4];
    r.read_exact(&mut u32b).ok()?;
    let count = u32::from_le_bytes(u32b) as usize;
    let mut vol = Volume::new(root.to_path_buf());
    let (mut u8b, mut u16b) = ([0u8; 1], [0u8; 2]);
    let mut name = Vec::new();
    for i in 0..count {
        r.read_exact(&mut u32b).ok()?;
        let parent = u32::from_le_bytes(u32b);
        r.read_exact(&mut u8b).ok()?;
        r.read_exact(&mut u32b).ok()?;
        let modified = u32::from_le_bytes(u32b);
        r.read_exact(&mut u16b).ok()?;
        name.resize(u16::from_le_bytes(u16b) as usize, 0);
        r.read_exact(&mut name).ok()?;
        if i == 0 {
            continue;
        }
        if parent as usize >= i {
            return None;
        }
        vol.add(parent, &String::from_utf8_lossy(&name), modified, u8b[0] == 1);
    }
    Some(vol)
}

// ── The running index ──

struct Index {
    dir: PathBuf,
    volumes: Vec<Arc<RwLock<Volume>>>,
    building: AtomicU64,
    folders_read: AtomicU64,
    stop: AtomicBool,
    dirty: Mutex<HashSet<PathBuf>>,
    watchers: Mutex<Vec<RecommendedWatcher>>,
}

static DATA: OnceLock<PathBuf> = OnceLock::new();
static INDEX: OnceLock<Arc<Index>> = OnceLock::new();

pub fn install(dir: PathBuf) {
    let _ = DATA.set(dir);
}

fn roots() -> Vec<PathBuf> {
    if cfg!(windows) {
        crate::shell::drives::list_drives().into_iter().filter(|d| d.kind == "fixed").map(|d| PathBuf::from(d.path)).collect()
    } else {
        vec![PathBuf::from("/")]
    }
}

fn file_for(dir: &Path, root: &Path) -> PathBuf {
    dir.join(format!("{}.bin", blake3::hash(root.to_string_lossy().as_bytes()).to_hex()))
}

/// The index, started on first use: loaded from disk or walked anew.
fn index() -> Arc<Index> {
    INDEX
        .get_or_init(|| {
            let dir = DATA.get().cloned().unwrap_or_else(|| std::env::temp_dir().join("space-train-index"));
            let _ = std::fs::create_dir_all(&dir);
            let mut volumes = Vec::new();
            let mut to_walk = Vec::new();
            for root in roots() {
                let file = file_for(&dir, &root);
                let age = std::fs::metadata(&file).and_then(|m| m.modified()).ok().and_then(|m| SystemTime::now().duration_since(m).ok());
                let loaded = load(&root, &file);
                let fresh = loaded.is_some() && age.is_some_and(|a| a < STALE);
                let vol = Arc::new(RwLock::new(loaded.unwrap_or_else(|| Volume::new(root.clone()))));
                if !fresh {
                    to_walk.push(vol.clone());
                }
                volumes.push(vol);
            }
            let ix = Arc::new(Index {
                dir,
                volumes,
                building: AtomicU64::new(0),
                folders_read: AtomicU64::new(0),
                stop: AtomicBool::new(false),
                dirty: Mutex::new(HashSet::new()),
                watchers: Mutex::new(Vec::new()),
            });
            ix.watch();
            for vol in to_walk {
                ix.rebuild(vol);
            }
            let keeper = ix.clone();
            std::thread::spawn(move || keeper.keep_current());
            ix
        })
        .clone()
}

impl Index {
    /// Walks a volume again in the background. While it runs the old
    /// content (if any) keeps answering; the new one replaces it at the end.
    fn rebuild(self: &Arc<Self>, vol: Arc<RwLock<Volume>>) {
        let ix = self.clone();
        self.building.fetch_add(1, Ordering::Relaxed);
        std::thread::spawn(move || {
            let root = vol.read().unwrap().root.clone();
            let empty = vol.read().unwrap().nodes.len() <= 1;
            // An empty volume fills in place, so searches see it grow.
            let target = if empty { vol.clone() } else { Arc::new(RwLock::new(Volume::new(root.clone()))) };
            walk(&target, 0, root.clone(), &ix.stop, &ix.folders_read);
            if !empty && !ix.stop.load(Ordering::Relaxed) {
                let fresh = std::mem::replace(&mut *target.write().unwrap(), Volume::new(root.clone()));
                *vol.write().unwrap() = fresh;
            }
            let _ = save(&vol.read().unwrap(), &file_for(&ix.dir, &root));
            ix.building.fetch_sub(1, Ordering::Relaxed);
        });
    }

    fn watch(self: &Arc<Self>) {
        for vol in &self.volumes {
            let root = vol.read().unwrap().root.clone();
            let ix = Arc::downgrade(self);
            let vol2 = vol.clone();
            let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                let Some(ix) = ix.upgrade() else { return };
                match res {
                    // Too many changes at once: the watcher lost some.
                    Ok(e) if e.need_rescan() => ix.rebuild(vol2.clone()),
                    Ok(e) => {
                        let mut dirty = ix.dirty.lock().unwrap();
                        for p in e.paths {
                            if let Some(parent) = p.parent() {
                                dirty.insert(parent.to_path_buf());
                            }
                            dirty.insert(p);
                        }
                    }
                    Err(_) => {}
                }
            });
            if let Ok(mut w) = watcher {
                if w.watch(&root, RecursiveMode::Recursive).is_ok() {
                    self.watchers.lock().unwrap().push(w);
                }
            }
        }
    }

    /// Every few seconds: rereads the folders that changed; every ten
    /// minutes saves what changed.
    fn keep_current(self: Arc<Self>) {
        let mut last_save = std::time::Instant::now();
        let mut changed = false;
        while !self.stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_secs(3));
            let dirty: Vec<PathBuf> = std::mem::take(&mut *self.dirty.lock().unwrap()).into_iter().collect();
            let mut done = HashSet::new();
            for path in dirty {
                if path.components().any(|c| SKIP_NAMES.iter().any(|s| c.as_os_str().eq_ignore_ascii_case(s))) {
                    continue;
                }
                let Some(vol) = self.volumes.iter().find(|v| path.starts_with(&v.read().unwrap().root)) else { continue };
                // The nearest indexed folder at or above the change.
                let mut at = path.as_path();
                let found = loop {
                    let hit = {
                        let v = vol.read().unwrap();
                        v.find(at).filter(|&id| v.nodes[id as usize].dir)
                    };
                    if let Some(id) = hit {
                        break Some((id, at.to_path_buf()));
                    }
                    match at.parent() {
                        Some(p) => at = p,
                        None => break None,
                    }
                };
                if let Some((id, dir)) = found.filter(|(_, dir)| done.insert(dir.clone())) {
                    refresh_dir(vol, id, &dir, &self.stop);
                    changed = true;
                }
            }
            if changed && last_save.elapsed() > SAVE_EVERY && self.building.load(Ordering::Relaxed) == 0 {
                for vol in &self.volumes {
                    let v = vol.read().unwrap();
                    let _ = save(&v, &file_for(&self.dir, &v.root));
                }
                last_save = std::time::Instant::now();
                changed = false;
            }
        }
    }
}

// ── Searching ──

/// ASCII letters ignore case; other letters must match as typed.
/// shortcut: «È» does not find «è», when it matters fold Unicode case into a second buffer.
fn contains_ci(hay: &[u8], needle: &[u8]) -> bool {
    let Some((&first, rest)) = needle.split_first() else { return true };
    if hay.len() < needle.len() {
        return false;
    }
    let other = first.to_ascii_uppercase();
    let last = hay.len() - needle.len();
    let mut i = 0;
    while i <= last {
        let b = hay[i];
        if (b == first || b == other) && hay[i + 1..i + needle.len()].eq_ignore_ascii_case(rest) {
            return true;
        }
        i += 1;
    }
    false
}

/// Smaller is better: the whole name, then the start of the name, then
/// the rest; newer first.
type Rank = (u8, std::cmp::Reverse<u32>, usize, u32);

fn rank(name: &[u8], first: &[u8], joined: &[u8]) -> u8 {
    let stem = name.iter().rposition(|&b| b == b'.').map_or(name, |p| &name[..p]);
    if name.eq_ignore_ascii_case(joined) || stem.eq_ignore_ascii_case(joined) {
        0
    } else if name.len() >= first.len() && name[..first.len()].eq_ignore_ascii_case(first) {
        1
    } else {
        2
    }
}

fn search_volumes(volumes: &[Arc<RwLock<Volume>>], query: &str) -> (u64, Vec<PathBuf>) {
    let words: Vec<Vec<u8>> = query.split_whitespace().map(|w| w.to_lowercase().into_bytes()).collect();
    if words.is_empty() {
        return (0, Vec::new());
    }
    let joined = words.join(&b' ');
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(8);
    let mut total = 0u64;
    let mut best: BinaryHeap<Rank> = BinaryHeap::new();
    for (vi, vol) in volumes.iter().enumerate() {
        let v = vol.read().unwrap();
        let chunk = v.nodes.len().div_ceil(threads).max(1);
        let parts: Vec<(u64, BinaryHeap<Rank>)> = std::thread::scope(|s| {
            let handles: Vec<_> = v
                .nodes
                .chunks(chunk)
                .enumerate()
                .map(|(ci, nodes)| {
                    let (words, joined, names) = (&words, &joined, &v.names);
                    s.spawn(move || {
                        let mut count = 0u64;
                        let mut heap: BinaryHeap<Rank> = BinaryHeap::new();
                        for (i, n) in nodes.iter().enumerate() {
                            if n.gone || n.len == 0 {
                                continue;
                            }
                            let name = &names[n.off as usize..n.off as usize + n.len as usize];
                            if !words.iter().all(|w| contains_ci(name, w)) {
                                continue;
                            }
                            count += 1;
                            heap.push((rank(name, &words[0], joined), std::cmp::Reverse(n.modified), vi, (ci * chunk + i) as u32));
                            if heap.len() > MAX_RESULTS {
                                heap.pop();
                            }
                        }
                        (count, heap)
                    })
                })
                .collect();
            handles.into_iter().map(|h| h.join().unwrap_or_default()).collect()
        });
        for (count, heap) in parts {
            total += count;
            for item in heap {
                best.push(item);
                if best.len() > MAX_RESULTS {
                    best.pop();
                }
            }
        }
    }
    let paths = best.into_sorted_vec().into_iter().map(|(_, _, vi, id)| volumes[vi].read().unwrap().path_of(id)).collect();
    (total, paths)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    /// Items indexed so far.
    pub files: u64,
    /// A drive is being walked.
    pub building: bool,
    pub folders_read: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexResults {
    /// All the names that match, beyond those returned.
    pub total: u64,
    pub entries: Vec<Entry>,
}

#[tauri::command]
pub async fn index_search(query: String) -> IndexResults {
    tauri::async_runtime::spawn_blocking(move || {
        let ix = index();
        let (total, paths) = search_volumes(&ix.volumes, &query);
        // Checked on disk: what went away while Space Train was closed is not shown.
        let entries: Vec<Entry> = paths.iter().filter_map(|p| entry_from_path(p)).collect();
        IndexResults { total, entries }
    })
    .await
    .unwrap_or(IndexResults { total: 0, entries: Vec::new() })
}

#[tauri::command]
pub async fn index_status() -> IndexStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let ix = index();
        IndexStatus {
            files: ix.volumes.iter().map(|v| v.read().unwrap().files()).sum(),
            building: ix.building.load(Ordering::Relaxed) > 0,
            folders_read: ix.folders_read.load(Ordering::Relaxed),
        }
    })
    .await
    .unwrap_or(IndexStatus { files: 0, building: false, folders_read: 0 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn built(root: &Path) -> Arc<RwLock<Volume>> {
        let vol = Arc::new(RwLock::new(Volume::new(root.to_path_buf())));
        walk(&vol, 0, root.to_path_buf(), &AtomicBool::new(false), &AtomicU64::new(0));
        vol
    }

    fn names(found: &[PathBuf]) -> Vec<String> {
        found.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect()
    }

    /// Timing on the real home folder: cargo test --lib index::tests::timing -- --ignored --nocapture
    #[test]
    #[ignore]
    fn timing() {
        let home = PathBuf::from(crate::fs::paths::home().unwrap());
        let t = std::time::Instant::now();
        let vol = built(&home);
        let n = vol.read().unwrap().files();
        println!("walked {n} items in {:?}, names {} MB", t.elapsed(), vol.read().unwrap().names.len() / 1_048_576);
        for q in ["readme", "fattura 2026", "e"] {
            let t = std::time::Instant::now();
            let (total, _) = search_volumes(&[vol.clone()], q);
            println!("search «{q}»: {total} matches in {:?}", t.elapsed());
        }
    }

    #[test]
    fn finds_by_every_word_ignoring_case_whole_name_first() {
        let d = tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("Casa").join("Fatture 2026")).unwrap();
        std::fs::write(d.path().join("Casa").join("Fattura_marzo_2026.pdf"), b"x").unwrap();
        std::fs::write(d.path().join("Casa").join("fattura 2026.pdf"), b"x").unwrap();
        std::fs::write(d.path().join("Casa").join("Fattura 2025.pdf"), b"x").unwrap();
        let vol = built(d.path());

        let (total, found) = search_volumes(&[vol], "FATTURA 2026");
        assert_eq!(total, 2);
        assert_eq!(names(&found)[0], "fattura 2026.pdf");
        assert!(names(&found).contains(&"Fattura_marzo_2026.pdf".to_string()));
        assert!(found[0].starts_with(d.path().join("Casa")));
    }

    #[test]
    fn package_folders_are_left_out() {
        let d = tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("app").join("node_modules").join("left")).unwrap();
        let vol = built(d.path());
        assert_eq!(names(&search_volumes(&[vol.clone()], "node_modules").1), vec!["node_modules"]);
        assert_eq!(search_volumes(&[vol], "left").0, 0);
    }

    #[test]
    fn a_changed_folder_is_read_again_and_a_saved_index_comes_back() {
        let d = tempdir().unwrap();
        let docs = d.path().join("Documenti");
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(docs.join("vecchio.txt"), b"x").unwrap();
        let vol = built(d.path());

        std::fs::remove_file(docs.join("vecchio.txt")).unwrap();
        std::fs::create_dir_all(docs.join("Nuova")).unwrap();
        std::fs::write(docs.join("Nuova").join("nuovo.txt"), b"x").unwrap();
        let id = vol.read().unwrap().find(&docs).unwrap();
        refresh_dir(&vol, id, &docs, &AtomicBool::new(false));

        assert_eq!(search_volumes(&[vol.clone()], "vecchio").0, 0);
        assert_eq!(names(&search_volumes(&[vol.clone()], "nuovo").1), vec!["nuovo.txt"]);

        let file = d.path().join("ix.bin");
        save(&vol.read().unwrap(), &file).unwrap();
        let back = Arc::new(RwLock::new(load(d.path(), &file).unwrap()));
        assert_eq!(search_volumes(&[back.clone()], "nuovo").1, search_volumes(&[vol], "nuovo").1);
        assert_eq!(back.read().unwrap().files(), 3);
    }
}
