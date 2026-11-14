//! The Windows Recycle Bin as a browsable folder.
//!
//! Items have path `::cestino\<id>`: the id is the name by which the Shell
//! knows the item inside `$Recycle.Bin`, and it is used to find it again to
//! restore or delete it. The frontend never interprets it.

use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;
use std::collections::HashSet;
use std::ffi::OsString;
use trash::{TrashItem, TrashItemSize};

pub const ROOT: &str = "::cestino";

fn error(e: trash::Error) -> FsError {
    let message = match e {
        trash::Error::RestoreCollision { path, .. } => format!(
            "Impossibile ripristinare: esiste già «{}».",
            path.to_string_lossy()
        ),
        other => format!("Operazione sul Cestino non riuscita: {}", other),
    };
    FsError::Io { message }
}

pub(crate) fn path_of(item: &TrashItem) -> String {
    format!("{}\\{}", ROOT, item.id.to_string_lossy())
}

fn id_from_path(path: &str) -> Option<OsString> {
    path.strip_prefix(ROOT)
        .and_then(|r| r.strip_prefix('\\'))
        .map(OsString::from)
}

pub fn list() -> Result<Vec<Entry>, FsError> {
    let items = trash::os_limited::list().map_err(error)?;

    let mut entries: Vec<Entry> = items
        .iter()
        .map(|v| {
            let measure = trash::os_limited::metadata(v).ok().map(|m| m.size);
            let (kind, size) = match measure {
                Some(TrashItemSize::Entries(_)) => (EntryKind::Dir, 0),
                Some(TrashItemSize::Bytes(b)) => (EntryKind::File, b),
                None => (EntryKind::File, 0),
            };
            Entry {
                name: v.name.to_string_lossy().into_owned(),
                path: path_of(v),
                kind,
                size,
                modified: Some(v.time_deleted * 1000),
                hidden: false,
                origin: Some(v.original_parent.to_string_lossy().into_owned()),
                free: None,
                total: None,
                own_icon: false,
                snippet: None,
            }
        })
        .collect();

    // Most recent on top: in the Recycle Bin you almost always look for what
    // you just threw away.
    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

fn pick(paths: &[String]) -> Result<Vec<TrashItem>, FsError> {
    let ids: HashSet<OsString> = paths.iter().filter_map(|p| id_from_path(p)).collect();
    Ok(trash::os_limited::list()
        .map_err(error)?
        .into_iter()
        .filter(|v| ids.contains(&v.id))
        .collect())
}

/// The selected items, or every item when `paths` is `None`.
pub(crate) fn items(paths: Option<&[String]>) -> Result<Vec<TrashItem>, FsError> {
    match paths {
        Some(p) => pick(p),
        None => trash::os_limited::list().map_err(error),
    }
}

pub(crate) fn delete_items(items: Vec<TrashItem>) -> Result<(), FsError> {
    if items.is_empty() {
        return Ok(());
    }
    trash::os_limited::purge_all(items).map_err(error)
}

pub fn restore(paths: &[String]) -> Result<(), FsError> {
    let items = pick(paths)?;
    if items.is_empty() {
        return Ok(());
    }
    trash::os_limited::restore_all(items).map_err(error)
}

pub fn delete(paths: &[String]) -> Result<(), FsError> {
    let items = pick(paths)?;
    if items.is_empty() {
        return Ok(());
    }
    trash::os_limited::purge_all(items).map_err(error)
}

pub fn empty() -> Result<(), FsError> {
    let items = trash::os_limited::list().map_err(error)?;
    if items.is_empty() {
        return Ok(());
    }
    trash::os_limited::purge_all(items).map_err(error)
}

/// Restores the items deleted from these original paths.
///
/// Used to undo a «Sposta nel Cestino»: if the same path was
/// trashed several times, the most recent deletion comes back.
pub fn restore_originals(originals: &[String]) -> Result<(), FsError> {
    let items = trash::os_limited::list().map_err(error)?;
    let mut chosen: Vec<TrashItem> = Vec::new();

    for original in originals {
        let target = std::path::Path::new(original);
        let best = items
            .iter()
            .filter(|v| v.original_path() == target)
            .max_by_key(|v| v.time_deleted);
        if let Some(v) = best {
            chosen.push(v.clone());
        }
    }

    if chosen.is_empty() {
        return Err(FsError::Io {
            message: "Gli elementi non sono più nel Cestino.".to_string(),
        });
    }
    trash::os_limited::restore_all(chosen).map_err(error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_id_comes_from_the_item_path() {
        assert_eq!(
            id_from_path(r"::cestino\C:\$Recycle.Bin\S-1\$R1.txt"),
            Some(OsString::from(r"C:\$Recycle.Bin\S-1\$R1.txt"))
        );
        assert_eq!(id_from_path(r"C:\normale.txt"), None);
    }

    #[test]
    fn trashing_and_restoring_puts_the_file_back() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("da_ripristinare.txt");
        std::fs::write(&file, b"x").unwrap();
        let path = file.to_string_lossy().into_owned();

        trash::delete(&file).unwrap();
        assert!(!file.exists());

        restore_originals(&[path]).unwrap();
        assert!(file.exists());
    }
}
