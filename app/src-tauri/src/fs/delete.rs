//! Deletion with progress: to the Trash, from disk, or out of the Trash.
//!
//! Progress counts items, not bytes: deleting a 4 GB file costs the same as
//! deleting a 4 KB one, while a folder with ten thousand files is slow.
//! Every function stops between items when `cancel` is raised and returns
//! what it actually finished, so the caller can undo exactly that.

use crate::fs::trash;
use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use std::path::Path;
use std::sync::atomic::AtomicBool;

/// How many items each call to the system takes at most. One call per item
/// would let the bar move smoothly but on Windows every call is a whole
/// shell operation: with thousands of items it would take minutes.
fn batch(total: usize) -> usize {
    (total / 50).max(1)
}

fn trash_error(e: ::trash::Error) -> FsError {
    FsError::Io {
        message: format!("Impossibile spostare nel Cestino: {}", e),
    }
}

/// An item that could not be removed, and why. The others go on anyway.
#[derive(serde::Serialize, Debug, PartialEq, Eq)]
pub struct Failed {
    pub path: String,
    pub error: FsError,
}

/// What a deletion did: the paths removed, and the ones it had to skip.
#[derive(serde::Serialize, Debug, Default, PartialEq, Eq)]
pub struct Deleted {
    pub done: Vec<String>,
    pub failed: Vec<Failed>,
}

/// Runs `action` on whole batches; when a batch fails, retries its items one
/// by one so a single locked file never stops the others. `already_done` says
/// whether a failed item had in fact gone in the batch before the error.
fn in_batches<T: Clone>(
    items: &[T],
    cancel: &AtomicBool,
    advance: &mut dyn FnMut(u64),
    path_of: impl Fn(&T) -> String,
    already_done: impl Fn(&T) -> bool,
    action: impl Fn(&[T]) -> Result<(), FsError>,
) -> Deleted {
    let mut outcome = Deleted::default();
    let mut counted = 0u64;
    for group in items.chunks(batch(items.len())) {
        if crate::fs::pause::stopped(cancel) {
            break;
        }
        if action(group).is_ok() {
            outcome.done.extend(group.iter().map(&path_of));
        } else {
            for v in group {
                match action(std::slice::from_ref(v)) {
                    Ok(()) => outcome.done.push(path_of(v)),
                    Err(_) if already_done(v) => outcome.done.push(path_of(v)),
                    Err(error) => outcome.failed.push(Failed { path: path_of(v), error }),
                }
            }
        }
        counted += group.len() as u64;
        advance(counted);
    }
    outcome
}

/// Moves the items to the Trash, skipping the ones that refuse.
pub fn trash(
    paths: &[String],
    cancel: &AtomicBool,
    advance: &mut dyn FnMut(u64),
) -> Result<Deleted, FsError> {
    Ok(in_batches(
        paths,
        cancel,
        advance,
        |p| p.clone(),
        |p| std::fs::symlink_metadata(paths::extended(Path::new(p))).is_err(),
        |group| ::trash::delete_all(group).map_err(trash_error),
    ))
}

/// Every file and folder under `path`, itself included. Links are not
/// followed: they are one item, removed without touching their target.
pub fn count(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(paths::extended(path)) else {
        return 0;
    };
    if !meta.is_dir() {
        return 1;
    }
    let children = std::fs::read_dir(paths::extended(path))
        .map(|items| items.flatten().map(|v| count(&v.path())).sum())
        .unwrap_or(0);
    1 + children
}

/// Total items for a permanent deletion of `paths`.
pub fn count_all(paths: &[String]) -> u64 {
    paths.iter().map(|p| count(Path::new(p))).sum()
}

/// Removes one link or file. A link to a folder is a folder for Windows
/// and goes away with `remove_dir`, not with `remove_file`.
fn remove_leaf(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) => std::fs::remove_dir(path).map_err(|_| e),
    }
}

/// Removes `path` bottom-up, one item at a time, going past children that
/// refuse (their folder then stays too). Returns `Ok(false)` if it stopped
/// because of `cancel`, `Err` with the first failure otherwise.
fn remove_tree(
    path: &Path,
    cancel: &AtomicBool,
    done: &mut u64,
    advance: &mut dyn FnMut(u64),
) -> Result<bool, FsError> {
    if crate::fs::pause::stopped(cancel) {
        return Ok(false);
    }
    let extended = paths::extended(path);
    let meta = std::fs::symlink_metadata(&extended).map_err(|e| from_io(&e))?;

    if meta.is_dir() {
        let children: Vec<_> = std::fs::read_dir(&extended)
            .map_err(|e| from_io(&e))?
            .flatten()
            .map(|v| v.path())
            .collect();
        let mut first_error = None;
        for child in children {
            match remove_tree(&child, cancel, done, advance) {
                Ok(true) => {}
                Ok(false) => return Ok(false),
                Err(e) => {
                    first_error.get_or_insert(e);
                }
            }
        }
        if let Some(e) = first_error {
            return Err(e);
        }
        std::fs::remove_dir(&extended).map_err(|e| from_io(&e))?;
    } else {
        remove_leaf(&extended).map_err(|e| from_io(&e))?;
    }
    *done += 1;
    advance(*done);
    Ok(true)
}

/// Deletes without the Trash, going past items that refuse.
pub fn delete_from_disk(
    paths: &[String],
    cancel: &AtomicBool,
    advance: &mut dyn FnMut(u64),
) -> Result<Deleted, FsError> {
    let mut counted = 0;
    let mut outcome = Deleted::default();
    for p in paths {
        match remove_tree(Path::new(p), cancel, &mut counted, advance) {
            Ok(true) => outcome.done.push(p.clone()),
            Ok(false) => break,
            Err(error) => outcome.failed.push(Failed { path: p.clone(), error }),
        }
    }
    Ok(outcome)
}

/// Deletes for good items already in the Trash (`::cestino\<id>` paths).
/// With `None`, empties it all, going past items that refuse.
pub fn delete_from_trash(
    paths: Option<&[String]>,
    cancel: &AtomicBool,
    advance: &mut dyn FnMut(u64),
) -> Result<Deleted, FsError> {
    let items = trash::items(paths)?;
    Ok(in_batches(
        &items,
        cancel,
        advance,
        trash::path_of,
        |_| false,
        |group| trash::delete_items(group.to_vec()),
    ))
}

/// Items in the Trash that `delete_from_trash` would remove.
pub fn count_in_trash(paths: Option<&[String]>) -> u64 {
    trash::items(paths).map(|v| v.len() as u64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn counts_every_file_and_folder() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        std::fs::create_dir_all(a.join("b")).unwrap();
        std::fs::write(a.join("uno.txt"), "1").unwrap();
        std::fs::write(a.join("b").join("due.txt"), "2").unwrap();
        // a, a/b, a/uno.txt, a/b/due.txt
        assert_eq!(count(&a), 4);
        assert_eq!(count(&dir.path().join("nessuno")), 0);
    }

    #[test]
    fn permanent_delete_reports_each_item_and_removes_all() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        std::fs::create_dir_all(a.join("b")).unwrap();
        std::fs::write(a.join("b").join("due.txt"), "2").unwrap();
        let f = dir.path().join("f.txt");
        std::fs::write(&f, "x").unwrap();

        let mut seen = Vec::new();
        let done = delete_from_disk(
            &[s(&a), s(&f)],
            &AtomicBool::new(false),
            &mut |n| seen.push(n),
        )
        .unwrap();

        assert_eq!(done.done, vec![s(&a), s(&f)]);
        assert!(done.failed.is_empty());
        assert_eq!(seen, vec![1, 2, 3, 4]);
        assert!(!a.exists() && !f.exists());
    }

    /// pnpm fills node_modules with junctions: deleting the folder must
    /// remove the links, never what they point to.
    #[cfg(windows)]
    #[test]
    fn permanent_delete_does_not_follow_junctions() {
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("sources");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("keep.txt"), "x").unwrap();
        let modules = dir.path().join("node_modules");
        std::fs::create_dir_all(&modules).unwrap();
        let link = modules.join("pkg");
        let made = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(&outside)
            .output()
            .unwrap();
        assert!(made.status.success());

        let done = delete_from_disk(&[s(&modules)], &AtomicBool::new(false), &mut |_| {}).unwrap();

        assert!(done.failed.is_empty());
        assert!(!modules.exists());
        assert!(outside.join("keep.txt").exists());
    }

    #[test]
    fn cancelled_permanent_delete_keeps_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("f.txt");
        let g = dir.path().join("g.txt");
        std::fs::write(&f, "x").unwrap();
        std::fs::write(&g, "y").unwrap();

        let cancel = AtomicBool::new(false);
        let done = delete_from_disk(&[s(&f), s(&g)], &cancel, &mut |_| {
            cancel.store(true, std::sync::atomic::Ordering::Relaxed)
        })
        .unwrap();

        assert_eq!(done.done, vec![s(&f)]);
        assert!(!f.exists());
        assert!(g.exists());
    }

    #[test]
    fn a_failing_item_does_not_stop_the_others() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("f.txt");
        let g = dir.path().join("g.txt");
        std::fs::write(&f, "x").unwrap();
        std::fs::write(&g, "y").unwrap();
        let missing = s(&dir.path().join("manca.txt"));

        let done = delete_from_disk(&[missing.clone(), s(&f), s(&g)], &AtomicBool::new(false), &mut |_| {}).unwrap();

        assert_eq!(done.done, vec![s(&f), s(&g)]);
        assert_eq!(done.failed, vec![Failed { path: missing, error: FsError::NotFound }]);
        assert!(!f.exists() && !g.exists());
    }

    #[test]
    fn batches_retry_item_by_item_after_a_failure() {
        // A fake action that refuses «b» and every batch containing it.
        let items: Vec<String> = ["a", "b", "c"].iter().map(|v| v.to_string()).collect();
        let mut seen = Vec::new();
        let outcome = in_batches(
            &items,
            &AtomicBool::new(false),
            &mut |n| seen.push(n),
            |v| v.clone(),
            |_| false,
            |group| {
                if group.iter().any(|v| v == "b") {
                    Err(FsError::AccessDenied)
                } else {
                    Ok(())
                }
            },
        );
        assert_eq!(outcome.done, vec!["a", "c"]);
        assert_eq!(outcome.failed, vec![Failed { path: "b".into(), error: FsError::AccessDenied }]);
        assert_eq!(seen, vec![1, 2, 3]);
    }

    #[test]
    fn batches_stay_few_with_many_items() {
        assert_eq!(batch(0), 1);
        assert_eq!(batch(10), 1);
        assert_eq!(batch(1000), 20);
    }
}
