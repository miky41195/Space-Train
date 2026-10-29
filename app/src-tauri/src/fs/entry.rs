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
    /// Millisecondi dall'epoch Unix. `None` se il filesystem non lo fornisce.
    pub modified: Option<i64>,
    pub hidden: bool,
    /// Solo nel Cestino: dove si trovava l'elemento prima di essere eliminato.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origine: Option<String>,
    /// Solo per i volumi in «Questo PC»: byte liberi e capacità.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub libero: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub totale: Option<u64>,
    /// L'elemento ha un'icona tutta sua, diversa da quella del suo tipo:
    /// un programma, un collegamento, una cartella con `desktop.ini`. Va
    /// chiesta alla Shell sul file vero, non sull'estensione.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub icona_propria: bool,
}

/// Estensioni i cui file portano un'icona propria.
const CON_ICONA_PROPRIA: [&str; 9] = ["exe", "lnk", "ico", "url", "scr", "cpl", "msc", "appref-ms", "cur"];

fn ha_icona_propria(path: &std::path::Path, kind: EntryKind, meta: Option<&std::fs::Metadata>) -> bool {
    if kind == EntryKind::Dir {
        return meta.map(cartella_personalizzabile).unwrap_or(false) && path.join("desktop.ini").is_file();
    }
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| CON_ICONA_PROPRIA.iter().any(|c| e.eq_ignore_ascii_case(c)))
        .unwrap_or(false)
}

/// Windows legge il `desktop.ini` di una cartella solo se lei ha l'attributo
/// sola lettura o di sistema: senza, non c'è icona personalizzata, e si
/// risparmia di cercare il file in ogni cartella.
#[cfg(windows)]
fn cartella_personalizzabile(meta: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_READONLY: u32 = 0x1;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    meta.file_attributes() & (FILE_ATTRIBUTE_READONLY | FILE_ATTRIBUTE_SYSTEM) != 0
}

#[cfg(not(windows))]
fn cartella_personalizzabile(_meta: &std::fs::Metadata) -> bool {
    false
}

/// Converte una voce di directory in `Entry`.
///
/// Restituisce `None` solo se il nome non è rappresentabile come UTF-8.
/// I metadati illeggibili (permessi negati sul singolo file) non fanno
/// fallire la conversione: la voce entra con dimensione 0 e data assente.
pub fn entry_from_dir_entry(de: &DirEntry) -> Option<Entry> {
    let name = de.file_name().into_string().ok()?;
    let path = de.path().to_string_lossy().into_owned();

    let meta = de.metadata().ok();

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
    let icona_propria = ha_icona_propria(&de.path(), kind, meta.as_ref());

    Some(Entry {
        name,
        path,
        kind,
        size,
        modified,
        hidden,
        origine: None,
        libero: None,
        totale: None,
        icona_propria,
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
    fn legge_un_file_normale() {
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
    fn una_cartella_ha_dimensione_zero() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();

        let de = fs::read_dir(dir.path()).unwrap().next().unwrap().unwrap();
        let entry = entry_from_dir_entry(&de).unwrap();

        assert_eq!(entry.kind, EntryKind::Dir);
        assert_eq!(entry.size, 0);
    }

    #[test]
    fn programmi_e_collegamenti_hanno_un_icona_propria() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("Gioco.EXE"), b"x").unwrap();
        fs::write(dir.path().join("nota.txt"), b"x").unwrap();
        fs::create_dir(dir.path().join("normale")).unwrap();

        let mut voci: Vec<Entry> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|d| entry_from_dir_entry(&d.unwrap()))
            .collect();
        voci.sort_by(|a, b| a.name.cmp(&b.name));
        let proprie: Vec<(&str, bool)> = voci.iter().map(|e| (e.name.as_str(), e.icona_propria)).collect();
        assert_eq!(proprie, vec![("Gioco.EXE", true), ("normale", false), ("nota.txt", false)]);
    }

    #[test]
    fn conserva_i_nomi_unicode() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("café–🚀.txt"), b"x").unwrap();

        let de = fs::read_dir(dir.path()).unwrap().next().unwrap().unwrap();
        let entry = entry_from_dir_entry(&de).unwrap();

        assert_eq!(entry.name, "café–🚀.txt");
    }
}
