//! Duplicate finder: files with the same bytes anywhere under a folder.
//!
//! Three passes so most files are never read: same size first, then the
//! hash of the first 64 KB, then the hash of the whole file. Groups go out
//! as soon as they are proven, biggest files first, so the list fills while
//! the slow part runs.

use crate::fs::entry::{entry_from_dir_entry, Entry, EntryKind};
use crate::fs::paths;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const PREFIX: u64 = 64 * 1024;
const PROGRESS_EVERY: Duration = Duration::from_millis(150);

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DuplicateEvent {
    /// Bytes compared so far out of the bytes that might need comparing.
    #[serde(rename_all = "camelCase")]
    Progress { done: u64, total: u64 },
    /// Two or more files with identical content, in the order found.
    #[serde(rename_all = "camelCase")]
    Group { size: u64, entries: Vec<Entry> },
}

/// Hash of `len` bytes from the start of the file, or `None` if unreadable.
fn hash(path: &Path, len: u64, cancel: &AtomicBool) -> Option<[u8; 32]> {
    let file = std::fs::File::open(paths::extended(path)).ok()?;
    let mut reader = file.take(len);
    let mut hasher = blake3::Hasher::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return None;
        }
        let n = reader.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(*hasher.finalize().as_bytes())
}

/// Splits `files` by the hash of their first `len` bytes; keeps buckets of two or more.
fn split(files: Vec<(PathBuf, Entry)>, len: u64, cancel: &AtomicBool) -> Vec<Vec<(PathBuf, Entry)>> {
    let mut buckets: HashMap<[u8; 32], Vec<(PathBuf, Entry)>> = HashMap::new();
    for f in files {
        if let Some(h) = hash(&f.0, len, cancel) {
            buckets.entry(h).or_default().push(f);
        }
    }
    buckets.into_values().filter(|b| b.len() > 1).collect()
}

/// Walks `root` and reports every group of identical files. Returns how many groups.
pub fn find(
    root: &str,
    hidden: bool,
    cancel: &AtomicBool,
    emit: &mut dyn FnMut(DuplicateEvent),
) -> usize {
    let mut by_size: HashMap<u64, Vec<(PathBuf, Entry)>> = HashMap::new();
    let mut stack = vec![PathBuf::from(root)];

    while let Some(dir) = stack.pop() {
        if cancel.load(Ordering::Relaxed) {
            return 0;
        }
        let Ok(items) = std::fs::read_dir(paths::extended(&dir)) else {
            continue;
        };
        for de in items.filter_map(|d| d.ok()) {
            let Some(e) = entry_from_dir_entry(&de) else {
                continue;
            };
            if e.hidden && !hidden {
                continue;
            }
            // Links and junctions are neither followed nor compared: a link
            // "duplicates" its target, and deleting one would hurt the other.
            if de.file_type().map(|t| t.is_symlink()).unwrap_or(true) {
                continue;
            }
            match e.kind {
                EntryKind::Dir => stack.push(de.path()),
                // Empty files are all equal and free: not worth a group.
                _ if e.size > 0 => by_size.entry(e.size).or_default().push((de.path(), e)),
                _ => {}
            }
        }
    }

    let mut sizes: Vec<(u64, Vec<(PathBuf, Entry)>)> =
        by_size.into_iter().filter(|(_, v)| v.len() > 1).collect();
    sizes.sort_by(|a, b| b.0.cmp(&a.0));

    let total: u64 = sizes.iter().map(|(s, v)| s * v.len() as u64).sum();
    let mut done = 0u64;
    let mut last = Instant::now();
    emit(DuplicateEvent::Progress { done, total });

    let mut groups = 0;
    for (size, files) in sizes {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let count = files.len() as u64;
        let mut proven = Vec::new();
        for bucket in split(files, PREFIX, cancel) {
            if size <= PREFIX {
                proven.push(bucket);
            } else {
                proven.extend(split(bucket, size, cancel));
            }
        }
        for bucket in proven {
            groups += 1;
            let mut entries: Vec<Entry> = bucket.into_iter().map(|(_, e)| e).collect();
            // Oldest first: the likely original leads its group.
            entries.sort_by_key(|e| e.modified.unwrap_or(i64::MAX));
            emit(DuplicateEvent::Group { size, entries });
        }
        // Counted as done even when the prefix ruled files out unread.
        done += size * count;
        if last.elapsed() >= PROGRESS_EVERY {
            last = Instant::now();
            emit(DuplicateEvent::Progress { done, total });
        }
    }
    emit(DuplicateEvent::Progress { done: total, total });
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(root: &Path) -> Vec<(u64, Vec<String>)> {
        let mut groups = Vec::new();
        find(&root.to_string_lossy(), false, &AtomicBool::new(false), &mut |ev| {
            if let DuplicateEvent::Group { size, entries } = ev {
                let mut names: Vec<String> = entries.into_iter().map(|e| e.name).collect();
                names.sort();
                groups.push((size, names));
            }
        });
        groups
    }

    #[test]
    fn groups_files_with_the_same_bytes_only() {
        let dir = std::env::temp_dir().join(format!("st-dup-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.txt"), b"same").unwrap();
        std::fs::write(dir.join("sub").join("b.txt"), b"same").unwrap();
        // Same size, different bytes.
        std::fs::write(dir.join("c.txt"), b"diff").unwrap();
        std::fs::write(dir.join("empty1"), b"").unwrap();
        std::fs::write(dir.join("empty2"), b"").unwrap();
        // Big files that differ only after the 64 KB prefix.
        let mut big = vec![7u8; 100_000];
        std::fs::write(dir.join("big1.bin"), &big).unwrap();
        std::fs::write(dir.join("big2.bin"), &big).unwrap();
        big[90_000] = 8;
        std::fs::write(dir.join("big3.bin"), &big).unwrap();

        let groups = run(&dir);
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(
            groups,
            vec![
                (100_000, vec!["big1.bin".to_string(), "big2.bin".to_string()]),
                (4, vec!["a.txt".to_string(), "b.txt".to_string()]),
            ]
        );
    }
}
