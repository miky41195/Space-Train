use serde::Serialize;
use std::fs::DirEntry;
use std::time::UNIX_EPOCH;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Dir,
    File,
    Symlink,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
    pub size: u64,
    /// Milliseconds since the Unix epoch. `None` if the filesystem does not provide it.
    pub modified: Option<i64>,
    pub hidden: bool,
    /// Only in the Recycle Bin: where the item was before it was deleted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    /// Only for the volumes in «Questo PC»: free bytes and capacity.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    /// The item has an icon of its own, different from its type's one:
    /// a program, a shortcut, a folder with `desktop.ini`. It must be
    /// asked of the Shell on the real file, not on the extension.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub own_icon: bool,
    /// Only in content search results: where the text was found.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<Snippet>,
}

/// The first line of a file that contains the searched text.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    /// 1-based line number.
    pub line: usize,
    /// The line, trimmed around the match so it fits a list row.
    pub text: String,
    /// Where the match starts in `text` and how long it is, in characters.
    pub at: usize,
    pub len: usize,
    /// How many other lines contain the text.
    pub more: usize,
}

/// Extensions whose files carry an icon of their own.
const WITH_OWN_ICON: [&str; 9] = ["exe", "lnk", "ico", "url", "scr", "cpl", "msc", "appref-ms", "cur"];

fn has_own_icon(path: &std::path::Path, kind: EntryKind, meta: Option<&std::fs::Metadata>) -> bool {
    if kind == EntryKind::Dir {
        return meta.map(customizable_folder).unwrap_or(false) && path.join("desktop.ini").is_file();
    }
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| WITH_OWN_ICON.iter().any(|c| e.eq_ignore_ascii_case(c)))
        .unwrap_or(false)
}

/// Windows reads a folder's `desktop.ini` only if the folder has the
/// read-only or system attribute: without it there is no custom icon, and
/// we save looking for the file in every folder.
#[cfg(windows)]
fn customizable_folder(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_READONLY: u32 = 0x1;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    meta.file_attributes() & (FILE_ATTRIBUTE_READONLY | FILE_ATTRIBUTE_SYSTEM) != 0
}

#[cfg(not(windows))]
fn customizable_folder(_meta: &std::fs::Metadata) -> bool {
    false
}

/// Converts a directory entry into an `Entry`.
///
/// Returns `None` only if the name cannot be represented as UTF-8.
/// Unreadable metadata (permissions denied on the single file) does not make
/// the conversion fail: the entry goes in with size 0 and no date.
pub fn entry_from_dir_entry(de: &DirEntry) -> Option<Entry> {
    let name = de.file_name().into_string().ok()?;
    build(name, &de.path(), de.metadata().ok())
}

/// The entry for one path, found in its parent folder so the name keeps
/// its real case (colour labels store paths in lowercase). `None` if gone.
pub fn entry_from_path(path: &std::path::Path) -> Option<Entry> {
    let name = path.file_name()?.to_str()?.to_lowercase();
    let de = std::fs::read_dir(crate::fs::paths::extended(path.parent()?))
        .ok()?
        .filter_map(|d| d.ok())
        .find(|d| d.file_name().to_str().map(|n| n.to_lowercase() == name).unwrap_or(false))?;
    let mut e = entry_from_dir_entry(&de)?;
    e.path = crate::fs::paths::display(std::path::Path::new(&e.path));
    Some(e)
}

fn build(name: String, full: &std::path::Path, meta: Option<std::fs::Metadata>) -> Option<Entry> {
    let path = full.to_string_lossy().into_owned();

    let kind = match &meta {
        Some(m) if m.is_dir() => EntryKind::Dir,
        Some(m) if m.file_type().is_symlink() => EntryKind::Symlink,
        Some(_) => EntryKind::File,
        None => EntryKind::File,
    };

    let size = match &meta {
        Some(_) if kind == EntryKind::Dir => 0,
        Some(m) => m.len(),
        None => 0,
    };

    let modified = meta.as_ref().and_then(|m| m.modified().ok()).and_then(|t| {
        t.duration_since(UNIX_EPOCH)
            .ok()
            .map(|d| d.as_millis() as i64)
    });

    let hidden = meta.as_ref().map(is_hidden).unwrap_or(false);
    let own_icon = has_own_icon(full, kind, meta.as_ref());

    Some(Entry {
        name,
        path,
        kind,
        size,
        modified,
        hidden,
        origin: None,
        free: None,
        total: None,
        own_icon,
        snippet: None,
    })
}

#[cfg(windows)]
pub(crate) fn is_hidden(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    let attrs = meta.file_attributes();
    attrs & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM) != 0
}

#[cfg(not(windows))]
pub(crate) fn is_hidden(_meta: &std::fs::Metadata) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn entry_from_path_reads_one_item_and_skips_missing_ones() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("a.txt"), b"abc").unwrap();
        fs::write(d.path().join("Mixed.TXT"), b"abc").unwrap();
        let e = entry_from_path(&d.path().join("mixed.txt")).unwrap();
        assert_eq!((e.name.as_str(), e.size, e.kind), ("Mixed.TXT", 3, EntryKind::File));
        assert!(entry_from_path(&d.path().join("gone.txt")).is_none());
    }

    #[test]
    fn reads_a_normal_file() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("ciao.txt"), b"12345").unwrap();

        let de = fs::read_dir(dir.path()).unwrap().next().unwrap().unwrap();
        let entry = entry_from_dir_entry(&de).unwrap();

        assert_eq!(entry.name, "ciao.txt");
        assert_eq!(entry.kind, EntryKind::File);
        assert_eq!(entry.size, 5);
        assert!(!entry.hidden);
        assert!(entry.modified.is_some());
    }

    #[test]
    fn a_folder_has_size_zero() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();

        let de = fs::read_dir(dir.path()).unwrap().next().unwrap().unwrap();
        let entry = entry_from_dir_entry(&de).unwrap();

        assert_eq!(entry.kind, EntryKind::Dir);
        assert_eq!(entry.size, 0);
    }

    #[test]
    fn programs_and_shortcuts_have_their_own_icon() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("Gioco.EXE"), b"x").unwrap();
        fs::write(dir.path().join("nota.txt"), b"x").unwrap();
        fs::create_dir(dir.path().join("normale")).unwrap();

        let mut items: Vec<Entry> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|d| entry_from_dir_entry(&d.unwrap()))
            .collect();
        items.sort_by(|a, b| a.name.cmp(&b.name));
        let own: Vec<(&str, bool)> = items.iter().map(|e| (e.name.as_str(), e.own_icon)).collect();
        assert_eq!(own, vec![("Gioco.EXE", true), ("normale", false), ("nota.txt", false)]);
    }

    #[test]
    fn keeps_unicode_names() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("café–🚀.txt"), b"x").unwrap();

        let de = fs::read_dir(dir.path()).unwrap().next().unwrap().unwrap();
        let entry = entry_from_dir_entry(&de).unwrap();

        assert_eq!(entry.name, "café–🚀.txt");
    }
}
