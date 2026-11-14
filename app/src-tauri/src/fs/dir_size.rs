//! Size of a folder: the sum of the files of its whole tree.
//!
//! Explorer does not show it because it is costly: every subfolder must be read.
//! Here it is computed on request, one folder at a time, and the computation
//! stops as soon as the listing moves to another folder.

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

/// The current turn. Every time the listing changes folder a new one
/// starts, and the computations of the previous turn stop at the first check.
static TURN: AtomicU64 = AtomicU64::new(0);

pub fn new_turn(turn: u64) {
    TURN.store(turn, Ordering::SeqCst);
}

/// The bytes of all the files under `folder`, or `None` if meanwhile another
/// turn started. Unreadable folders are skipped.
pub fn size(folder: &Path, turn: u64) -> Option<u64> {
    measure(folder, &|| TURN.load(Ordering::Relaxed) != turn).map(|m| m.bytes)
}

/// Size of a tree and its newest modification.
pub struct Measure {
    pub bytes: u64,
    /// Newest modification of the folder itself or any file in it, in ms.
    pub recent: u64,
    /// Newest access to any file in it, in ms. Folders do not count: reading
    /// them to measure would update their own access time.
    pub opened: u64,
}

pub fn ms(t: std::io::Result<std::time::SystemTime>) -> u64 {
    t.ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

/// Walks the tree under `folder`; `None` as soon as `stopped` says stop.
pub fn measure(folder: &Path, stopped: &dyn Fn() -> bool) -> Option<Measure> {
    let mut total = Measure { bytes: 0, recent: 0, opened: 0 };
    if let Ok(md) = std::fs::metadata(folder) {
        total.recent = ms(md.modified());
    }
    let mut to_read = vec![folder.to_path_buf()];
    while let Some(dir) = to_read.pop() {
        if stopped() {
            return None;
        }
        let Ok(items) = std::fs::read_dir(&dir) else {
            continue;
        };
        for item in items.flatten() {
            let Ok(kind) = item.file_type() else {
                continue;
            };
            // Symlinks and junctions are not followed: they lead out of
            // the tree or in a circle (like «Dati applicazioni» in the profile).
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                to_read.push(item.path());
            } else if let Ok(m) = item.metadata() {
                total.bytes = total.bytes.saturating_add(m.len());
                total.recent = total.recent.max(ms(m.modified()));
                total.opened = total.opened.max(ms(m.accessed()));
            }
        }
    }
    Some(total)
}

#[cfg(test)]
mod test {
    use super::*;
    use std::sync::Mutex;

    /// The turn is global: the tests that change it must not overlap.
    static QUEUE: Mutex<()> = Mutex::new(());

    #[test]
    fn sums_files_of_all_subfolders() {
        let _queue = QUEUE.lock().unwrap();
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.bin"), vec![0u8; 100]).unwrap();
        std::fs::create_dir_all(d.path().join("sotto/ancora")).unwrap();
        std::fs::write(d.path().join("sotto/b.bin"), vec![0u8; 20]).unwrap();
        std::fs::write(d.path().join("sotto/ancora/c.bin"), vec![0u8; 3]).unwrap();
        new_turn(7);
        assert_eq!(size(d.path(), 7), Some(123));
    }

    #[test]
    fn an_outdated_turn_stops() {
        let _queue = QUEUE.lock().unwrap();
        let d = tempfile::tempdir().unwrap();
        new_turn(2);
        assert_eq!(size(d.path(), 1), None);
    }

    #[test]
    fn a_missing_folder_weighs_zero() {
        let _queue = QUEUE.lock().unwrap();
        new_turn(3);
        assert_eq!(size(Path::new("Z:\\non\\esiste\\davvero"), 3), Some(0));
    }
}
