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
use std::sync::atomic::AtomicBool;

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

/// An item that could not be removed, and why. The others go on anyway.
#[derive(serde::Serialize, Debug, PartialEq, Eq)]
pub struct Fallito {
    pub path: String,
    pub error: FsError,
}

/// What a deletion did: the paths removed, and the ones it had to skip.
#[derive(serde::Serialize, Debug, Default, PartialEq, Eq)]
pub struct Eliminati {
    pub done: Vec<String>,
    pub failed: Vec<Fallito>,
}

/// Runs `azione` on whole batches; when a batch fails, retries its items one
/// by one so a single locked file never stops the others. `gia_fatto` says
/// whether a failed item had in fact gone in the batch before the error.
fn a_lotti<T: Clone>(
    voci: &[T],
    annulla: &AtomicBool,
    avanza: &mut dyn FnMut(u64),
    path_di: impl Fn(&T) -> String,
    gia_fatto: impl Fn(&T) -> bool,
    azione: impl Fn(&[T]) -> Result<(), FsError>,
) -> Eliminati {
    let mut esito = Eliminati::default();
    let mut contati = 0u64;
    for gruppo in voci.chunks(lotto(voci.len())) {
        if crate::fs::pausa::fermo(annulla) {
            break;
        }
        if azione(gruppo).is_ok() {
            esito.done.extend(gruppo.iter().map(&path_di));
        } else {
            for v in gruppo {
                match azione(std::slice::from_ref(v)) {
                    Ok(()) => esito.done.push(path_di(v)),
                    Err(_) if gia_fatto(v) => esito.done.push(path_di(v)),
                    Err(error) => esito.failed.push(Fallito { path: path_di(v), error }),
                }
            }
        }
        contati += gruppo.len() as u64;
        avanza(contati);
    }
    esito
}

/// Moves the items to the Trash, skipping the ones that refuse.
pub fn cestina(
    percorsi: &[String],
    annulla: &AtomicBool,
    avanza: &mut dyn FnMut(u64),
) -> Result<Eliminati, FsError> {
    Ok(a_lotti(
        percorsi,
        annulla,
        avanza,
        |p| p.clone(),
        |p| std::fs::symlink_metadata(paths::extended(Path::new(p))).is_err(),
        |gruppo| trash::delete_all(gruppo).map_err(errore_cestino),
    ))
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

/// Removes `path` bottom-up, one item at a time, going past children that
/// refuse (their folder then stays too). Returns `Ok(false)` if it stopped
/// because of `annulla`, `Err` with the first failure otherwise.
fn rimuovi_albero(
    path: &Path,
    annulla: &AtomicBool,
    fatti: &mut u64,
    avanza: &mut dyn FnMut(u64),
) -> Result<bool, FsError> {
    if crate::fs::pausa::fermo(annulla) {
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
        let mut primo_errore = None;
        for figlio in figli {
            match rimuovi_albero(&figlio, annulla, fatti, avanza) {
                Ok(true) => {}
                Ok(false) => return Ok(false),
                Err(e) => {
                    primo_errore.get_or_insert(e);
                }
            }
        }
        if let Some(e) = primo_errore {
            return Err(e);
        }
        std::fs::remove_dir(&esteso).map_err(|e| from_io(&e))?;
    } else {
        rimuovi_foglia(&esteso).map_err(|e| from_io(&e))?;
    }
    *fatti += 1;
    avanza(*fatti);
    Ok(true)
}

/// Deletes without the Trash, going past items that refuse.
pub fn elimina_disco(
    percorsi: &[String],
    annulla: &AtomicBool,
    avanza: &mut dyn FnMut(u64),
) -> Result<Eliminati, FsError> {
    let mut contati = 0;
    let mut esito = Eliminati::default();
    for p in percorsi {
        match rimuovi_albero(Path::new(p), annulla, &mut contati, avanza) {
            Ok(true) => esito.done.push(p.clone()),
            Ok(false) => break,
            Err(error) => esito.failed.push(Fallito { path: p.clone(), error }),
        }
    }
    Ok(esito)
}

/// Deletes for good items already in the Trash (`::cestino\<id>` paths).
/// With `None`, empties it all, going past items that refuse.
pub fn elimina_dal_cestino(
    percorsi: Option<&[String]>,
    annulla: &AtomicBool,
    avanza: &mut dyn FnMut(u64),
) -> Result<Eliminati, FsError> {
    let voci = cestino::voci(percorsi)?;
    Ok(a_lotti(
        &voci,
        annulla,
        avanza,
        cestino::path_di,
        |_| false,
        |gruppo| cestino::elimina_voci(gruppo.to_vec()),
    ))
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

        assert_eq!(fatti.done, vec![s(&a), s(&f)]);
        assert!(fatti.failed.is_empty());
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
            annulla.store(true, std::sync::atomic::Ordering::Relaxed)
        })
        .unwrap();

        assert_eq!(fatti.done, vec![s(&f)]);
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
        let manca = s(&dir.path().join("manca.txt"));

        let fatti = elimina_disco(&[manca.clone(), s(&f), s(&g)], &AtomicBool::new(false), &mut |_| {}).unwrap();

        assert_eq!(fatti.done, vec![s(&f), s(&g)]);
        assert_eq!(fatti.failed, vec![Fallito { path: manca, error: FsError::NotFound }]);
        assert!(!f.exists() && !g.exists());
    }

    #[test]
    fn batches_retry_item_by_item_after_a_failure() {
        // A fake action that refuses «b» and every batch containing it.
        let voci: Vec<String> = ["a", "b", "c"].iter().map(|v| v.to_string()).collect();
        let mut visti = Vec::new();
        let esito = a_lotti(
            &voci,
            &AtomicBool::new(false),
            &mut |n| visti.push(n),
            |v| v.clone(),
            |_| false,
            |gruppo| {
                if gruppo.iter().any(|v| v == "b") {
                    Err(FsError::AccessDenied)
                } else {
                    Ok(())
                }
            },
        );
        assert_eq!(esito.done, vec!["a", "c"]);
        assert_eq!(esito.failed, vec![Fallito { path: "b".into(), error: FsError::AccessDenied }]);
        assert_eq!(visti, vec![1, 2, 3]);
    }

    #[test]
    fn batches_stay_few_with_many_items() {
        assert_eq!(lotto(0), 1);
        assert_eq!(lotto(10), 1);
        assert_eq!(lotto(1000), 20);
    }
}
