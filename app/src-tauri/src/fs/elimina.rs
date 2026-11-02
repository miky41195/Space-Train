//! Deletion with progress: to the Trash, from disk, or out of the Trash.
//!
//! Progress counts items, not bytes: deleting a 4 GB file costs the same as
//! deleting a 4 KB one, while a folder with ten thousand files is slow.
//! Every function stops between items when `annulla` is raised and returns
//! what it actually finished, so the caller can undo exactly that.

use crate::fs::cestino;
use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

/// How many items each call to the system takes at most. One call per item
/// would let the bar move smoothly but on Windows every call is a whole
/// shell operation: with thousands of items it would take minutes.
fn lotto(totale: usize) -> usize {
    (totale / 50).max(1)
}

fn errore_cestino(e: trash::Error) -> FsError {
    FsError::Io {
        message: format!("Impossibile spostare nel Cestino: {}", e),
    }
}

/// Moves the items to the Trash. Returns the paths actually moved.
pub fn cestina(
    percorsi: &[String],
    annulla: &AtomicBool,
    avanza: &mut dyn FnMut(u64),
) -> Result<Vec<String>, FsError> {
    let mut fatti = Vec::new();
    for gruppo in percorsi.chunks(lotto(percorsi.len())) {
        if annulla.load(Ordering::Relaxed) {
            break;
        }
        trash::delete_all(gruppo).map_err(errore_cestino)?;
        fatti.extend(gruppo.iter().cloned());
        avanza(fatti.len() as u64);
    }
    Ok(fatti)
}

/// Every file and folder under `path`, itself included. Links are not
/// followed: they are one item, removed without touching their target.
pub fn conta(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(paths::extended(path)) else {
        return 0;
    };
    if !meta.is_dir() {
        return 1;
    }
    let figli = std::fs::read_dir(paths::extended(path))
        .map(|voci| voci.flatten().map(|v| conta(&v.path())).sum())
        .unwrap_or(0);
    1 + figli
}

/// Total items for a permanent deletion of `percorsi`.
pub fn conta_tutti(percorsi: &[String]) -> u64 {
    percorsi.iter().map(|p| conta(Path::new(p))).sum()
}

/// Removes one link or file. A link to a folder is a folder for Windows
/// and goes away with `remove_dir`, not with `remove_file`.
fn rimuovi_foglia(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) => std::fs::remove_dir(path).map_err(|_| e),
    }
}

/// Removes `path` bottom-up, one item at a time. Returns false if it
/// stopped because of `annulla`, leaving the rest in place.
fn rimuovi_albero(
    path: &Path,
    annulla: &AtomicBool,
    fatti: &mut u64,
    avanza: &mut dyn FnMut(u64),
) -> Result<bool, FsError> {
    if annulla.load(Ordering::Relaxed) {
        return Ok(false);
    }
    let esteso = paths::extended(path);
    let meta = std::fs::symlink_metadata(&esteso).map_err(|e| from_io(&e))?;

    if meta.is_dir() {
        let figli: Vec<_> = std::fs::read_dir(&esteso)
            .map_err(|e| from_io(&e))?
            .flatten()
            .map(|v| v.path())
            .collect();
        for figlio in figli {
            if !rimuovi_albero(&figlio, annulla, fatti, avanza)? {
                return Ok(false);
            }
        }
        std::fs::remove_dir(&esteso).map_err(|e| from_io(&e))?;
    } else {
        rimuovi_foglia(&esteso).map_err(|e| from_io(&e))?;
    }
    *fatti += 1;
    avanza(*fatti);
    Ok(true)
}

/// Deletes without the Trash. Returns the paths fully removed.
pub fn elimina_disco(
    percorsi: &[String],
    annulla: &AtomicBool,
    avanza: &mut dyn FnMut(u64),
) -> Result<Vec<String>, FsError> {
    let mut contati = 0;
    let mut fatti = Vec::new();
    for p in percorsi {
        if !rimuovi_albero(Path::new(p), annulla, &mut contati, avanza)? {
            break;
        }
        fatti.push(p.clone());
    }
    Ok(fatti)
}

/// Deletes for good items already in the Trash (`::cestino\<id>` paths).
/// With `None`, empties it all. Returns how many were removed.
pub fn elimina_dal_cestino(
    percorsi: Option<&[String]>,
    annulla: &AtomicBool,
    avanza: &mut dyn FnMut(u64),
) -> Result<Vec<String>, FsError> {
    let voci = cestino::voci(percorsi)?;
    let mut fatti = Vec::new();
    for gruppo in voci.chunks(lotto(voci.len())) {
        if annulla.load(Ordering::Relaxed) {
            break;
        }
        cestino::elimina_voci(gruppo.to_vec())?;
        fatti.extend(gruppo.iter().map(cestino::path_di));
        avanza(fatti.len() as u64);
    }
    Ok(fatti)
}

/// Items in the Trash that `elimina_dal_cestino` would remove.
pub fn conta_nel_cestino(percorsi: Option<&[String]>) -> u64 {
    cestino::voci(percorsi).map(|v| v.len() as u64).unwrap_or(0)
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
        assert_eq!(conta(&a), 4);
        assert_eq!(conta(&dir.path().join("nessuno")), 0);
    }

    #[test]
    fn permanent_delete_reports_each_item_and_removes_all() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a");
        std::fs::create_dir_all(a.join("b")).unwrap();
        std::fs::write(a.join("b").join("due.txt"), "2").unwrap();
        let f = dir.path().join("f.txt");
        std::fs::write(&f, "x").unwrap();

        let mut visti = Vec::new();
        let fatti = elimina_disco(
            &[s(&a), s(&f)],
            &AtomicBool::new(false),
            &mut |n| visti.push(n),
        )
        .unwrap();

        assert_eq!(fatti, vec![s(&a), s(&f)]);
        assert_eq!(visti, vec![1, 2, 3, 4]);
        assert!(!a.exists() && !f.exists());
    }

    #[test]
    fn cancelled_permanent_delete_keeps_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("f.txt");
        let g = dir.path().join("g.txt");
        std::fs::write(&f, "x").unwrap();
        std::fs::write(&g, "y").unwrap();

        let annulla = AtomicBool::new(false);
        let fatti = elimina_disco(&[s(&f), s(&g)], &annulla, &mut |_| {
            annulla.store(true, Ordering::Relaxed)
        })
        .unwrap();

        assert_eq!(fatti, vec![s(&f)]);
        assert!(!f.exists());
        assert!(g.exists());
    }

    #[test]
    fn batches_stay_few_with_many_items() {
        assert_eq!(lotto(0), 1);
        assert_eq!(lotto(10), 1);
        assert_eq!(lotto(1000), 20);
    }
}
