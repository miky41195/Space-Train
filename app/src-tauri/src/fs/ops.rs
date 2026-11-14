use crate::fs::error::{from_io, FsError};
use crate::fs::names::validate_name;
use crate::fs::paths;
use std::path::Path;

/// Creates a folder inside `parent` and returns the created path.
///
/// The name is validated before touching the disk: a reserved name or one with
/// forbidden characters gives a readable error instead of a Win32 code.
pub fn create_folder(parent: &str, name: &str) -> Result<String, FsError> {
    validate_name(name).map_err(|e| FsError::Io {
        message: describe_name(&e),
    })?;

    let destination = Path::new(parent).join(name);

    if paths::extended(&destination).exists() {
        return Err(FsError::Io {
            message: format!("Esiste già un elemento con nome «{}».", name),
        });
    }

    std::fs::create_dir(paths::extended(&destination)).map_err(|e| from_io(&e))?;
    Ok(paths::display(&destination))
}

/// Renames an item, keeping it in the same folder.
/// Returns the new path.
pub fn rename(path: &str, new_name: &str) -> Result<String, FsError> {
    validate_name(new_name).map_err(|e| FsError::Io {
        message: describe_name(&e),
    })?;

    let origin = Path::new(path);
    let parent = origin.parent().ok_or(FsError::NotFound)?;
    let destination = parent.join(new_name);

    if destination == origin {
        return Ok(paths::display(&destination));
    }

    // On Windows rename silently overwrites the destination file: the
    // explicit check avoids destroying a same-named item by mistake.
    if paths::extended(&destination).exists() {
        return Err(FsError::Io {
            message: format!("Esiste già un elemento con nome «{}».", new_name),
        });
    }

    std::fs::rename(paths::extended(origin), paths::extended(&destination))
        .map_err(|e| from_io(&e))?;

    Ok(paths::display(&destination))
}

/// Moves the items to the Windows Recycle Bin.
///
/// It goes through the Shell API: the items stay recoverable. The code has
/// no permanent deletion, by choice.
pub fn move_to_trash(paths: &[String]) -> Result<(), FsError> {
    if paths.is_empty() {
        return Ok(());
    }

    trash::delete_all(paths).map_err(|e| FsError::Io {
        message: format!("Impossibile spostare nel Cestino: {}", e),
    })
}

/// Deletes without going through the Recycle Bin. It cannot be undone: the
/// frontend asks for an explicit confirmation before getting here.
pub fn delete_permanently(paths: &[String]) -> Result<(), FsError> {
    for p in paths {
        crate::fs::copy::remove(Path::new(p))?;
    }
    Ok(())
}

/// First bytes of a text file, for the preview pane.
/// `None` if the file looks binary.
pub fn text_preview(path: &str, max: usize) -> Result<Option<String>, FsError> {
    use std::io::Read;
    let f = std::fs::File::open(paths::extended(Path::new(path))).map_err(|e| from_io(&e))?;
    let mut data = Vec::new();
    f.take(max as u64)
        .read_to_end(&mut data)
        .map_err(|e| from_io(&e))?;
    if data.iter().take(8000).any(|b| *b == 0) {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&data).into_owned()))
}

/// Where to take the user after they typed a path in the bar.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    /// Folder to open.
    pub folder: String,
    /// If the user typed the path of a file: the item to select.
    pub select: Option<String>,
}

/// Interprets what the user typed in the address bar.
///
/// Accepts quotes around the path, environment variables (`%USERPROFILE%`),
/// `~` for the user folder and the names of the special locations.
pub fn resolve_input(input: &str) -> Result<Destination, FsError> {
    let clean = input.trim().trim_matches('"').trim();
    if clean.is_empty() {
        return Err(FsError::NotFound);
    }

    let special = match clean.to_lowercase().as_str() {
        "questo pc" | "computer" | "risorse del computer" | "this pc" => Some("::pc"),
        "rete" | "network" => Some("::rete"),
        "cestino" | "recycle bin" => Some(crate::fs::trash::ROOT),
        _ => None,
    };
    if let Some(s) = special {
        return Ok(Destination { folder: s.to_string(), select: None });
    }
    if clean.starts_with("::") {
        return Ok(Destination { folder: clean.to_string(), select: None });
    }

    let mut expanded = expand_variables(clean);
    if expanded == "~" || expanded.starts_with("~\\") || expanded.starts_with("~/") {
        if let Some(home) = paths::home() {
            expanded = format!("{}{}", home, &expanded[1..]);
        }
    }
    // On Windows both slashes work but the app shows backslashes; elsewhere
    // the backslash is an ordinary character in names and stays as typed.
    let expanded = if cfg!(windows) { expanded.replace('/', "\\") } else { expanded };
    // «C:» on its own is the root of the drive, not the drive's current folder.
    let expanded = if cfg!(windows) && expanded.len() == 2 && expanded.ends_with(':') {
        format!("{}\\", expanded)
    } else {
        expanded
    };

    // A server without a share is not a filesystem path: the Network lists
    // it, not read_dir.
    if crate::shell::network::is_server(&expanded) {
        return Ok(Destination { folder: expanded, select: None });
    }

    let p = Path::new(&expanded);
    let meta = std::fs::metadata(paths::extended(p)).map_err(|e| from_io(&e))?;
    if meta.is_dir() {
        Ok(Destination { folder: paths::display(p), select: None })
    } else {
        let parent_of = paths::parent_of(&expanded).ok_or(FsError::NotFound)?;
        Ok(Destination { folder: parent_of, select: Some(paths::display(p)) })
    }
}

fn expand_variables(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        match after.find('%') {
            Some(j) => {
                let name = &after[..j];
                match std::env::var(name) {
                    Ok(v) if !name.is_empty() => out.push_str(&v),
                    _ => {
                        out.push('%');
                        out.push_str(name);
                        out.push('%');
                    }
                }
                rest = &after[j + 1..];
            }
            None => {
                out.push('%');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

fn describe_name(e: &crate::fs::names::NameError) -> String {
    use crate::fs::names::NameError::*;
    match e {
        Empty => "Il nome non può essere vuoto.".to_string(),
        ForbiddenChar { character } => {
            format!("Il carattere «{}» non è ammesso nei nomi di file.", character)
        }
        ReservedName { name } => format!("«{}» è un nome riservato da Windows.", name),
        BadEnding => "Il nome non può finire con un punto o uno spazio.".to_string(),
        TooLong => "Il nome supera i 255 caratteri.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn creates_a_folder() {
        let dir = tempdir().unwrap();
        let created = create_folder(&dir.path().to_string_lossy(), "nuova").unwrap();

        assert!(Path::new(&created).is_dir());
        assert!(created.ends_with("nuova"));
    }

    #[test]
    fn does_not_create_an_existing_folder() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("esiste")).unwrap();

        let err = create_folder(&dir.path().to_string_lossy(), "esiste").unwrap_err();
        assert!(matches!(err, FsError::Io { .. }));
    }

    #[test]
    fn does_not_create_a_folder_with_an_invalid_name() {
        let dir = tempdir().unwrap();
        let err = create_folder(&dir.path().to_string_lossy(), "co:so").unwrap_err();

        match err {
            FsError::Io { message } => assert!(message.contains("non è ammesso")),
            other => panic!("unexpected error: {:?}", other),
        }
    }

    #[test]
    fn renames_a_file() {
        let dir = tempdir().unwrap();
        let origin = dir.path().join("vecchio.txt");
        fs::write(&origin, b"x").unwrap();

        let new = rename(&origin.to_string_lossy(), "nuovo.txt").unwrap();

        assert!(!origin.exists());
        assert!(Path::new(&new).exists());
        assert!(new.ends_with("nuovo.txt"));
    }

    #[test]
    fn renaming_to_the_same_name_does_nothing() {
        let dir = tempdir().unwrap();
        let origin = dir.path().join("uguale.txt");
        fs::write(&origin, b"contenuto").unwrap();

        rename(&origin.to_string_lossy(), "uguale.txt").unwrap();

        assert_eq!(fs::read_to_string(&origin).unwrap(), "contenuto");
    }

    #[test]
    fn does_not_rename_over_an_existing_file() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.txt");
        let b = dir.path().join("b.txt");
        fs::write(&a, b"aaa").unwrap();
        fs::write(&b, b"bbb").unwrap();

        let err = rename(&a.to_string_lossy(), "b.txt").unwrap_err();

        assert!(matches!(err, FsError::Io { .. }));
        // The destination file is intact: no silent overwrite.
        assert_eq!(fs::read_to_string(&b).unwrap(), "bbb");
        assert!(a.exists());
    }

    #[test]
    fn does_not_rename_to_a_reserved_name() {
        let dir = tempdir().unwrap();
        let origin = dir.path().join("file.txt");
        fs::write(&origin, b"x").unwrap();

        let err = rename(&origin.to_string_lossy(), "NUL").unwrap_err();

        match err {
            FsError::Io { message } => assert!(message.contains("riservato")),
            other => panic!("unexpected error: {:?}", other),
        }
        assert!(origin.exists());
    }

    #[test]
    fn deletes_files_and_folders_permanently() {
        let dir = tempdir().unwrap();
        let f = dir.path().join("f.txt");
        let c = dir.path().join("c");
        fs::write(&f, b"x").unwrap();
        fs::create_dir_all(c.join("dentro")).unwrap();

        delete_permanently(&[
            f.to_string_lossy().into_owned(),
            c.to_string_lossy().into_owned(),
        ])
        .unwrap();

        assert!(!f.exists());
        assert!(!c.exists());
    }

    #[test]
    fn preview_reads_text_and_refuses_binaries() {
        let dir = tempdir().unwrap();
        let t = dir.path().join("t.txt");
        let b = dir.path().join("b.bin");
        fs::write(&t, "ciao mondo").unwrap();
        fs::write(&b, [0u8, 1, 2]).unwrap();

        assert_eq!(text_preview(&t.to_string_lossy(), 4).unwrap(), Some("ciao".into()));
        assert_eq!(text_preview(&b.to_string_lossy(), 100).unwrap(), None);
    }

    #[test]
    fn the_bar_opens_folders_and_selects_files() {
        let dir = tempdir().unwrap();
        let f = dir.path().join("doc.txt");
        fs::write(&f, b"x").unwrap();
        let d = dir.path().to_string_lossy().into_owned();

        assert_eq!(resolve_input(&format!("\"{}\"", d)).unwrap().folder, d);

        let file = resolve_input(&f.to_string_lossy()).unwrap();
        assert_eq!(file.folder, d);
        assert_eq!(file.select, Some(f.to_string_lossy().into_owned()));
    }

    #[cfg(windows)]
    #[test]
    fn the_bar_expands_variables_and_understands_special_locations() {
        std::env::set_var("SPACE_TRAIN_PROVA", r"C:\");
        assert_eq!(resolve_input("%SPACE_TRAIN_PROVA%").unwrap().folder, r"C:\");
        assert_eq!(resolve_input("c:").unwrap().folder, r"c:\");
        assert_eq!(resolve_input("Cestino").unwrap().folder, "::cestino");
        assert_eq!(resolve_input("questo pc").unwrap().folder, "::pc");
        assert!(resolve_input(r"C:\non\esiste\proprio").is_err());
    }

    #[test]
    fn trash_with_empty_list_does_nothing() {
        assert_eq!(move_to_trash(&[]), Ok(()));
    }
}
