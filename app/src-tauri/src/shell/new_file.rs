//! Explorer's «Nuovo» menu: folder and the file types that installed
//! programs registered (text document, Word, Excel, ZIP…).
//!
//! Windows lists them by reading the `ShellNew` keys in the registry: under
//! the extension itself or under its ProgID. Each key says how the new
//! file is born: empty (`NullFile`), copied from a template (`FileName`) or
//! with fixed bytes (`Data`).

use crate::fs::copy::unique_name;
use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewFileType {
    /// Extension with the dot, e.g. ".txt".
    pub ext: String,
    /// Name shown in the menu, e.g. "Documento di testo".
    pub name: String,
}

#[derive(Debug, Clone)]
enum Content {
    Empty,
    Pattern(String),
    Data(Vec<u8>),
}

#[derive(Debug, Clone)]
struct Item {
    kind: NewFileType,
    content: Content,
}

/// The registry is read once: it is thousands of keys, and the installed
/// types do not change while the app is open.
static TYPES: OnceLock<Vec<Item>> = OnceLock::new();

fn types() -> &'static [Item] {
    TYPES.get_or_init(|| {
        let mut v = read_registry();
        // The text document is always there, even if the registry does not say so.
        if !v.iter().any(|x| x.kind.ext == ".txt") {
            v.push(Item {
                kind: NewFileType { ext: ".txt".into(), name: "Documento di testo".into() },
                content: Content::Empty,
            });
        }
        v.sort_by(|a, b| a.kind.name.to_lowercase().cmp(&b.kind.name.to_lowercase()));
        v
    })
}

pub fn list() -> Vec<NewFileType> {
    types().iter().map(|v| v.kind.clone()).collect()
}

/// Creates a new file of type `ext` inside `parent`, with the name Explorer
/// would give it («Nuovo Documento di testo.txt», numbered if taken).
pub fn create(parent: &str, ext: &str) -> Result<String, FsError> {
    let item = types()
        .iter()
        .find(|v| v.kind.ext.eq_ignore_ascii_case(ext))
        .cloned()
        .unwrap_or(Item {
            kind: NewFileType { ext: ext.to_string(), name: format!("File {}", ext.trim_start_matches('.').to_uppercase()) },
            content: Content::Empty,
        });

    let dir = Path::new(parent);
    let name = unique_name(dir, &format!("Nuovo {}{}", item.kind.name, item.kind.ext));
    let arrival = dir.join(&name);

    let data: Vec<u8> = match &item.content {
        Content::Empty => Vec::new(),
        Content::Data(d) => d.clone(),
        // A template that cannot be found does not stop the file being created: it is born empty.
        Content::Pattern(m) => find_template(m)
            .and_then(|p| std::fs::read(p).ok())
            .unwrap_or_default(),
    };

    std::fs::write(paths::extended(&arrival), data).map_err(|e| from_io(&e))?;
    Ok(paths::display(&arrival))
}

/// Templates with a relative path live in one of the «Templates» folders.
fn find_template(name: &str) -> Option<PathBuf> {
    let expanded = expand(name);
    let direct = PathBuf::from(&expanded);
    if direct.is_absolute() {
        return direct.exists().then_some(direct);
    }
    let folders = [
        std::env::var("WINDIR").ok().map(|w| format!(r"{}\ShellNew", w)),
        std::env::var("APPDATA").ok().map(|a| format!(r"{}\Microsoft\Windows\Templates", a)),
        std::env::var("ProgramData").ok().map(|p| format!(r"{}\Microsoft\Windows\Templates", p)),
    ];
    folders
        .into_iter()
        .flatten()
        .map(|c| Path::new(&c).join(&expanded))
        .find(|p| p.exists())
}

fn expand(s: &str) -> String {
    let mut out = s.to_string();
    for (k, v) in std::env::vars() {
        out = out.replace(&format!("%{}%", k), &v);
        out = out.replace(&format!("%{}%", k.to_uppercase()), &v);
    }
    out
}

#[cfg(windows)]
fn read_registry() -> Vec<Item> {
    use winreg::enums::HKEY_CLASSES_ROOT;
    use winreg::RegKey;

    let root = RegKey::predef(HKEY_CLASSES_ROOT);
    let mut out: Vec<Item> = Vec::new();

    // The shortcut is born from a wizard and the library is a Shell
    // feature: written as empty files they would be broken.
    const EXCLUDED: [&str; 2] = [".lnk", ".library-ms"];

    for ext in root
        .enum_keys()
        .filter_map(|k| k.ok())
        .filter(|k| k.starts_with('.') && !EXCLUDED.contains(&k.to_lowercase().as_str()))
    {
        let Ok(key) = root.open_subkey(&ext) else { continue };
        let progid: String = key.get_value("").unwrap_or_default();

        // ShellNew under the extension or under its ProgID, as Windows looks for it.
        let shellnew = key.open_subkey("ShellNew").ok().or_else(|| {
            (!progid.is_empty())
                .then(|| key.open_subkey(format!(r"{}\ShellNew", progid)).ok())
                .flatten()
        });
        let Some(sn) = shellnew else { continue };

        let content = if sn.get_raw_value("NullFile").is_ok() {
            Content::Empty
        } else if let Ok(m) = sn.get_value::<String, _>("FileName") {
            Content::Pattern(m)
        } else if let Ok(d) = sn.get_raw_value("Data") {
            Content::Data(d.bytes.to_vec())
        } else {
            // `Command` opens a wizard (the shortcut, for example): it is
            // not a file to write, we leave it to Windows.
            continue;
        };

        let Some(name) = type_name(&root, &progid, &sn) else { continue };
        if out.iter().any(|v| v.kind.name == name) {
            continue;
        }
        out.push(Item { kind: NewFileType { ext: ext.to_lowercase(), name }, content });
    }
    out
}

/// The readable name of the type, in Windows' language if there is one.
#[cfg(windows)]
fn type_name(root: &winreg::RegKey, progid: &str, shellnew: &winreg::RegKey) -> Option<String> {
    // ItemName and FriendlyTypeName often point to a translated resource
    // («@notepad.exe,-469»): SHLoadIndirectString resolves it.
    let candidates = [
        shellnew.get_value::<String, _>("ItemName").ok(),
        root
            .open_subkey(progid)
            .ok()
            .and_then(|k| k.get_value::<String, _>("FriendlyTypeName").ok()),
        root.open_subkey(progid).ok().and_then(|k| k.get_value::<String, _>("").ok()),
    ];
    candidates
        .into_iter()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .find_map(|s| if s.starts_with('@') { resolve_resource(&s) } else { Some(s) })
}

#[cfg(windows)]
fn resolve_resource(s: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::SHLoadIndirectString;

    let source: Vec<u16> = s.encode_utf16().chain(std::iter::once(0)).collect();
    let mut buf = [0u16; 260];
    unsafe { SHLoadIndirectString(PCWSTR(source.as_ptr()), &mut buf, None) }.ok()?;
    let end = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    let text = String::from_utf16_lossy(&buf[..end]);
    (!text.trim().is_empty()).then_some(text)
}

#[cfg(not(windows))]
fn read_registry() -> Vec<Item> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn the_text_document_is_always_there() {
        assert!(list().iter().any(|t| t.ext == ".txt"));
    }

    #[test]
    fn types_have_readable_unique_names() {
        let types = list();
        for t in &types {
            assert!(t.ext.starts_with('.'));
            assert!(!t.name.is_empty());
            assert!(!t.name.starts_with('@'), "unresolved resource: {}", t.name);
        }
        let mut names: Vec<_> = types.iter().map(|t| &t.name).collect();
        names.dedup();
        assert_eq!(names.len(), types.len());
    }

    #[test]
    fn creates_a_document_and_numbers_the_second() {
        let d = tempdir().unwrap();
        let dir = d.path().to_string_lossy().into_owned();

        let first = create(&dir, ".txt").unwrap();
        let second = create(&dir, ".txt").unwrap();

        assert!(first.ends_with(".txt"));
        assert!(Path::new(&first).exists());
        assert!(second.contains("(2)"));
    }

    #[test]
    fn a_new_zip_is_a_valid_archive_if_windows_offers_it() {
        if !list().iter().any(|t| t.ext == ".zip") {
            return;
        }
        let d = tempdir().unwrap();
        let zip = create(&d.path().to_string_lossy(), ".zip").unwrap();
        let f = std::fs::File::open(&zip).unwrap();
        assert!(::zip::ZipArchive::new(f).is_ok());
    }
}
