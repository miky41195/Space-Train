use crate::fs::entry::{entry_from_dir_entry, Entry};
use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use crate::fs::sort::{sort_entries, SortSpec};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    /// Path normalized for display, without the `\\?\` prefix.
    pub path: String,
    pub entries: Vec<Entry>,
}

pub fn list_dir(path: &str, spec: &SortSpec, show_hidden: bool) -> Result<Listing, FsError> {
    let raw = Path::new(path);

    // Explicit distinction: without this check a file passed as a
    // directory would give a generic Io instead of NotADirectory.
    let meta = std::fs::metadata(paths::extended(raw)).map_err(|e| from_io(&e))?;
    if !meta.is_dir() {
        return Err(FsError::NotADirectory);
    }

    let read = std::fs::read_dir(paths::extended(raw)).map_err(|e| from_io(&e))?;

    // An unreadable entry is skipped without failing the whole listing.
    let mut entries: Vec<Entry> = read
        .filter_map(|res| res.ok())
        .filter_map(|de| entry_from_dir_entry(&de))
        .filter(|e| show_hidden || !e.hidden)
        .map(|mut e| {
            e.path = paths::display(Path::new(&e.path));
            e
        })
        .collect();

    sort_entries(&mut entries, spec);

    Ok(Listing {
        path: paths::display(raw),
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs::sort::{SortKey, SortSpec};
    use std::fs;
    use tempfile::tempdir;

    fn spec() -> SortSpec {
        SortSpec {
            key: SortKey::Name,
            ascending: true,
        }
    }

    #[test]
    fn an_empty_folder_gives_zero_entries() {
        let dir = tempdir().unwrap();
        let r = list_dir(&dir.path().to_string_lossy(), &spec(), false).unwrap();
        assert_eq!(r.entries.len(), 0);
    }

    #[test]
    fn lists_and_sorts_entries() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("b.txt"), b"x").unwrap();
        fs::write(dir.path().join("a.txt"), b"x").unwrap();
        fs::create_dir(dir.path().join("zsub")).unwrap();

        let r = list_dir(&dir.path().to_string_lossy(), &spec(), false).unwrap();

        let names: Vec<&str> = r.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["zsub", "a.txt", "b.txt"]);
    }

    #[test]
    fn a_missing_path_gives_not_found() {
        let err = list_dir(r"C:\questo\non\esiste\davvero", &spec(), false).unwrap_err();
        assert_eq!(err, FsError::NotFound);
    }

    #[test]
    fn a_file_instead_of_a_folder_gives_not_a_directory() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f.txt");
        fs::write(&file, b"x").unwrap();

        let err = list_dir(&file.to_string_lossy(), &spec(), false).unwrap_err();
        assert_eq!(err, FsError::NotADirectory);
    }

    #[test]
    fn handles_paths_over_260_characters() {
        let dir = tempdir().unwrap();
        let mut p = dir.path().to_path_buf();
        for _ in 0..12 {
            p = p.join("cartella_con_nome_abbastanza_lungo_da_sforare");
        }
        // The extended prefix is needed for the setup too: without it,
        // create_dir_all would fail before even reaching the code under test.
        fs::create_dir_all(paths::extended(&p)).unwrap();
        fs::write(paths::extended(&p).join("dentro.txt"), b"x").unwrap();

        assert!(
            p.to_string_lossy().len() > 260,
            "the test path must exceed 260 characters"
        );

        let r = list_dir(&p.to_string_lossy(), &spec(), false).unwrap();
        assert_eq!(r.entries.len(), 1);
        assert_eq!(r.entries[0].name, "dentro.txt");
    }

    #[test]
    fn the_returned_path_has_no_extended_prefix() {
        let dir = tempdir().unwrap();
        let r = list_dir(&dir.path().to_string_lossy(), &spec(), false).unwrap();
        assert!(!r.path.starts_with(r"\\?\"));
    }
}
