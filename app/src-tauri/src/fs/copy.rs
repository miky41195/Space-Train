use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

/// What to do when an item with the same name already exists at the destination.
#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConflictPolicy {
    Overwrite,
    Rename,
    Skip,
}

#[derive(Serialize, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CopyOutcome {
    pub copied: u64,
    pub skipped: u64,
    pub cancelled: bool,
    /// Source and actual arrival path of every transferred item.
    /// Used for undo: with the «rename» policy the arrival can have a
    /// different name from the starting one.
    pub pairs: Vec<[String; 2]>,
}

/// A free name inside `dir`, numbering as Windows does: `nota (2).txt`.
///
/// The extension stays after the number: renaming must not change the
/// file's type.
pub fn unique_name(dir: &Path, name: &str) -> String {
    if !paths::extended(&dir.join(name)).exists() {
        return name.to_string();
    }

    let dot = name.rfind('.').filter(|i| *i > 0);
    let (base, extension) = match dot {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };

    for n in 2..10_000 {
        let candidate = format!("{} ({}){}", base, n, extension);
        if !paths::extended(&dir.join(&candidate)).exists() {
            return candidate;
        }
    }

    format!("{} ({}){}", base, simple_uuid(), extension)
}

/// Last resort when 10,000 numbered names are all taken.
fn simple_uuid() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Names that already exist at the destination. Empty = no question to ask.
pub fn scan_conflicts(sources: &[String], destination: &str) -> Vec<String> {
    let dest = Path::new(destination);

    sources
        .iter()
        .filter_map(|s| {
            let name = Path::new(s).file_name()?.to_string_lossy().into_owned();
            if paths::extended(&dest.join(&name)).exists() {
                Some(name)
            } else {
                None
            }
        })
        .collect()
}

/// Total bytes to transfer, to give an honest progress bar.
pub fn total_bytes(sources: &[String]) -> u64 {
    sources.iter().map(|s| weight(Path::new(s))).sum()
}

fn weight(path: &Path) -> u64 {
    let extended = paths::extended(path);

    let Ok(meta) = std::fs::symlink_metadata(&extended) else {
        return 0;
    };

    if meta.is_dir() {
        let Ok(items) = std::fs::read_dir(&extended) else {
            return 0;
        };
        return items.filter_map(|v| v.ok()).map(|v| weight(&v.path())).sum();
    }

    meta.len()
}

/// Copies sources into `destination`.
///
/// `progress` receives the bytes transferred so far; `cancel` is checked
/// between one file and the next. Stopping leaves the files already copied on
/// disk: it is not a transaction, and pretending otherwise would need a
/// staging area as big as the data.
pub fn copy_all(
    sources: &[String],
    destination: &str,
    policy: ConflictPolicy,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<CopyOutcome, FsError> {
    let dest = Path::new(destination);
    let mut outcome = CopyOutcome::default();
    let mut done = 0u64;

    for source in sources {
        if crate::fs::pause::stopped(cancel) {
            outcome.cancelled = true;
            return Ok(outcome);
        }

        let origin = Path::new(source);
        let Some(name) = origin.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };

        // Copying a folder into itself would cause infinite recursion: the
        // check must be done before opening any handle.
        if dest.starts_with(origin) {
            return Err(FsError::Io {
                message: format!(
                    "Non puoi copiare «{}» dentro sé stessa.",
                    name
                ),
            });
        }

        let arrival = match resolve_destination(dest, &name, policy) {
            Some(p) => p,
            None => {
                outcome.skipped += 1;
                continue;
            }
        };

        if policy == ConflictPolicy::Overwrite {
            crate::versions::keep_overwritten(origin, &arrival);
        }
        copy_recursive(origin, &arrival, cancel, &mut done, progress)?;
        outcome.copied += 1;
        outcome.pairs.push([source.clone(), paths::display(&arrival)]);
    }

    Ok(outcome)
}

/// Moves sources into `destination`.
///
/// Tries `rename` first, instant on the same volume. If it fails because
/// the destination is on another disk, it falls back to copy plus delete.
pub fn move_all(
    sources: &[String],
    destination: &str,
    policy: ConflictPolicy,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<CopyOutcome, FsError> {
    let dest = Path::new(destination);
    let mut outcome = CopyOutcome::default();
    let mut done = 0u64;

    for source in sources {
        if crate::fs::pause::stopped(cancel) {
            outcome.cancelled = true;
            return Ok(outcome);
        }

        let origin = Path::new(source);
        let Some(name) = origin.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };

        if dest.starts_with(origin) {
            return Err(FsError::Io {
                message: format!("Non puoi spostare «{}» dentro sé stessa.", name),
            });
        }

        let arrival = match resolve_destination(dest, &name, policy) {
            Some(p) => p,
            None => {
                outcome.skipped += 1;
                continue;
            }
        };

        if policy == ConflictPolicy::Overwrite && paths::extended(&arrival).exists() {
            crate::versions::keep_overwritten(origin, &arrival);
            remove(&arrival)?;
        }

        match std::fs::rename(paths::extended(origin), paths::extended(&arrival)) {
            Ok(()) => {
                done += weight(&arrival);
                progress(done);
            }
            Err(_) => {
                // Different volumes: rename cannot cross them.
                copy_recursive(origin, &arrival, cancel, &mut done, progress)?;
                remove(origin)?;
            }
        }

        outcome.copied += 1;
        outcome.pairs.push([source.clone(), paths::display(&arrival)]);
    }

    Ok(outcome)
}

/// Arrival path according to the policy. `None` means "skip this one".
fn resolve_destination(dest: &Path, name: &str, policy: ConflictPolicy) -> Option<PathBuf> {
    let direct = dest.join(name);

    if !paths::extended(&direct).exists() {
        return Some(direct);
    }

    match policy {
        ConflictPolicy::Overwrite => Some(direct),
        ConflictPolicy::Rename => Some(dest.join(unique_name(dest, name))),
        ConflictPolicy::Skip => None,
    }
}

pub fn remove(path: &Path) -> Result<(), FsError> {
    let extended = paths::extended(path);
    let meta = std::fs::symlink_metadata(&extended).map_err(|e| from_io(&e))?;

    if meta.is_dir() {
        std::fs::remove_dir_all(&extended).map_err(|e| from_io(&e))
    } else {
        std::fs::remove_file(&extended).map_err(|e| from_io(&e))
    }
}

fn copy_recursive(
    origin: &Path,
    arrival: &Path,
    cancel: &AtomicBool,
    done: &mut u64,
    progress: &mut dyn FnMut(u64),
) -> Result<(), FsError> {
    if crate::fs::pause::stopped(cancel) {
        return Ok(());
    }

    let meta = std::fs::symlink_metadata(paths::extended(origin)).map_err(|e| from_io(&e))?;

    if !meta.is_dir() {
        std::fs::copy(paths::extended(origin), paths::extended(arrival)).map_err(|e| from_io(&e))?;
        *done += meta.len();
        progress(*done);
        return Ok(());
    }

    std::fs::create_dir_all(paths::extended(arrival)).map_err(|e| from_io(&e))?;

    let items = std::fs::read_dir(paths::extended(origin)).map_err(|e| from_io(&e))?;

    for item in items.filter_map(|v| v.ok()) {
        if crate::fs::pause::stopped(cancel) {
            return Ok(());
        }
        let name = item.file_name();
        copy_recursive(&item.path(), &arrival.join(name), cancel, done, progress)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn never() -> AtomicBool {
        AtomicBool::new(false)
    }

    fn silent() -> impl FnMut(u64) {
        |_| {}
    }

    #[test]
    fn unique_name_leaves_free_names_alone() {
        let dir = tempdir().unwrap();
        assert_eq!(unique_name(dir.path(), "nuovo.txt"), "nuovo.txt");
    }

    #[test]
    fn unique_name_numbers_keeping_the_extension() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("nota.txt"), b"x").unwrap();

        assert_eq!(unique_name(dir.path(), "nota.txt"), "nota (2).txt");
    }

    #[test]
    fn unique_name_skips_numbers_already_taken() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("nota.txt"), b"x").unwrap();
        fs::write(dir.path().join("nota (2).txt"), b"x").unwrap();

        assert_eq!(unique_name(dir.path(), "nota.txt"), "nota (3).txt");
    }

    #[test]
    fn unique_name_works_without_extension() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("cartella")).unwrap();

        assert_eq!(unique_name(dir.path(), "cartella"), "cartella (2)");
    }

    #[test]
    fn scan_conflicts_finds_only_taken_names() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();

        fs::write(origin.path().join("a.txt"), b"x").unwrap();
        fs::write(origin.path().join("b.txt"), b"x").unwrap();
        fs::write(dest.path().join("a.txt"), b"gia qui").unwrap();

        let sources = vec![
            origin.path().join("a.txt").to_string_lossy().into_owned(),
            origin.path().join("b.txt").to_string_lossy().into_owned(),
        ];

        let conflicts = scan_conflicts(&sources, &dest.path().to_string_lossy());
        assert_eq!(conflicts, vec!["a.txt"]);
    }

    #[test]
    fn copies_a_file() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origin.path().join("a.txt"), b"contenuto").unwrap();

        let sources = vec![origin.path().join("a.txt").to_string_lossy().into_owned()];
        let outcome = copy_all(
            &sources,
            &dest.path().to_string_lossy(),
            ConflictPolicy::Rename,
            &never(),
            &mut silent(),
        )
        .unwrap();

        assert_eq!(outcome.copied, 1);
        assert_eq!(
            fs::read_to_string(dest.path().join("a.txt")).unwrap(),
            "contenuto"
        );
        // L'originale resta dov'era.
        assert!(origin.path().join("a.txt").exists());
    }

    #[test]
    fn copies_a_folder_with_all_its_content() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();

        let sub = origin.path().join("cartella");
        fs::create_dir_all(sub.join("dentro")).unwrap();
        fs::write(sub.join("uno.txt"), b"1").unwrap();
        fs::write(sub.join("dentro").join("due.txt"), b"2").unwrap();

        let sources = vec![sub.to_string_lossy().into_owned()];
        copy_all(
            &sources,
            &dest.path().to_string_lossy(),
            ConflictPolicy::Rename,
            &never(),
            &mut silent(),
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
    fn the_rename_policy_does_not_touch_the_existing() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origin.path().join("a.txt"), b"nuovo").unwrap();
        fs::write(dest.path().join("a.txt"), b"vecchio").unwrap();

        let sources = vec![origin.path().join("a.txt").to_string_lossy().into_owned()];
        copy_all(
            &sources,
            &dest.path().to_string_lossy(),
            ConflictPolicy::Rename,
            &never(),
            &mut silent(),
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
    fn the_overwrite_policy_replaces() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origin.path().join("a.txt"), b"nuovo").unwrap();
        fs::write(dest.path().join("a.txt"), b"vecchio").unwrap();

        let sources = vec![origin.path().join("a.txt").to_string_lossy().into_owned()];
        copy_all(
            &sources,
            &dest.path().to_string_lossy(),
            ConflictPolicy::Overwrite,
            &never(),
            &mut silent(),
        )
        .unwrap();

        assert_eq!(fs::read_to_string(dest.path().join("a.txt")).unwrap(), "nuovo");
    }

    #[test]
    fn the_skip_policy_leaves_everything_as_is() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origin.path().join("a.txt"), b"nuovo").unwrap();
        fs::write(dest.path().join("a.txt"), b"vecchio").unwrap();

        let sources = vec![origin.path().join("a.txt").to_string_lossy().into_owned()];
        let outcome = copy_all(
            &sources,
            &dest.path().to_string_lossy(),
            ConflictPolicy::Skip,
            &never(),
            &mut silent(),
        )
        .unwrap();

        assert_eq!(outcome.skipped, 1);
        assert_eq!(outcome.copied, 0);
        assert_eq!(
            fs::read_to_string(dest.path().join("a.txt")).unwrap(),
            "vecchio"
        );
    }

    #[test]
    fn moving_removes_the_original() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origin.path().join("a.txt"), b"contenuto").unwrap();

        let sources = vec![origin.path().join("a.txt").to_string_lossy().into_owned()];
        move_all(
            &sources,
            &dest.path().to_string_lossy(),
            ConflictPolicy::Rename,
            &never(),
            &mut silent(),
        )
        .unwrap();

        assert!(!origin.path().join("a.txt").exists());
        assert_eq!(
            fs::read_to_string(dest.path().join("a.txt")).unwrap(),
            "contenuto"
        );
    }

    #[test]
    fn refuses_to_copy_a_folder_into_itself() {
        let dir = tempdir().unwrap();
        let parent = dir.path().join("padre");
        let child = parent.join("figlia");
        fs::create_dir_all(&child).unwrap();

        let sources = vec![parent.to_string_lossy().into_owned()];
        let err = copy_all(
            &sources,
            &child.to_string_lossy(),
            ConflictPolicy::Rename,
            &never(),
            &mut silent(),
        )
        .unwrap_err();

        match err {
            FsError::Io { message } => assert!(message.contains("dentro sé stessa")),
            other => panic!("unexpected error: {:?}", other),
        }
    }

    #[test]
    fn cancelling_before_starting_copies_nothing() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origin.path().join("a.txt"), b"x").unwrap();

        let sources = vec![origin.path().join("a.txt").to_string_lossy().into_owned()];
        let outcome = copy_all(
            &sources,
            &dest.path().to_string_lossy(),
            ConflictPolicy::Rename,
            &AtomicBool::new(true),
            &mut silent(),
        )
        .unwrap();

        assert!(outcome.cancelled);
        assert_eq!(outcome.copied, 0);
        assert!(!dest.path().join("a.txt").exists());
    }

    #[test]
    fn progress_reports_the_transferred_bytes() {
        let origin = tempdir().unwrap();
        let dest = tempdir().unwrap();
        fs::write(origin.path().join("a.txt"), vec![0u8; 100]).unwrap();
        fs::write(origin.path().join("b.txt"), vec![0u8; 50]).unwrap();

        let sources = vec![
            origin.path().join("a.txt").to_string_lossy().into_owned(),
            origin.path().join("b.txt").to_string_lossy().into_owned(),
        ];

        assert_eq!(total_bytes(&sources), 150);

        let mut reads = Vec::new();
        copy_all(
            &sources,
            &dest.path().to_string_lossy(),
            ConflictPolicy::Rename,
            &never(),
            &mut |b| reads.push(b),
        )
        .unwrap();

        assert_eq!(reads.last(), Some(&150));
    }

    #[test]
    fn total_bytes_also_sums_subfolders() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join("cartella");
        fs::create_dir_all(sub.join("dentro")).unwrap();
        fs::write(sub.join("uno.bin"), vec![0u8; 30]).unwrap();
        fs::write(sub.join("dentro").join("due.bin"), vec![0u8; 70]).unwrap();

        let sources = vec![sub.to_string_lossy().into_owned()];
        assert_eq!(total_bytes(&sources), 100);
    }
}
