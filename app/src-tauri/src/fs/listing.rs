use crate::fs::entry::{entry_from_dir_entry, Entry};
use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use crate::fs::sort::{sort_entries, SortSpec};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    /// Path normalizzato per la visualizzazione, senza prefisso `\\?\`.
    pub path: String,
    pub entries: Vec<Entry>,
}

pub fn list_dir(path: &str, spec: &SortSpec, show_hidden: bool) -> Result<Listing, FsError> {
    let raw = Path::new(path);

    // Distinzione esplicita: senza questo controllo un file passato come
    // directory darebbe un Io generico invece di NotADirectory.
    let meta = std::fs::metadata(paths::extended(raw)).map_err(|e| from_io(&e))?;
    if !meta.is_dir() {
        return Err(FsError::NotADirectory);
    }

    let read = std::fs::read_dir(paths::extended(raw)).map_err(|e| from_io(&e))?;

    // Una voce illeggibile viene saltata senza far fallire l'intero listing.
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
    fn una_cartella_vuota_da_zero_voci() {
        let dir = tempdir().unwrap();
        let r = list_dir(&dir.path().to_string_lossy(), &spec(), false).unwrap();
        assert_eq!(r.entries.len(), 0);
    }

    #[test]
    fn elenca_e_ordina_le_voci() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("b.txt"), b"x").unwrap();
        fs::write(dir.path().join("a.txt"), b"x").unwrap();
        fs::create_dir(dir.path().join("zsub")).unwrap();

        let r = list_dir(&dir.path().to_string_lossy(), &spec(), false).unwrap();

        let nomi: Vec<&str> = r.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(nomi, vec!["zsub", "a.txt", "b.txt"]);
    }

    #[test]
    fn un_path_inesistente_da_not_found() {
        let err = list_dir(r"C:\questo\non\esiste\davvero", &spec(), false).unwrap_err();
        assert_eq!(err, FsError::NotFound);
    }

    #[test]
    fn un_file_al_posto_di_una_cartella_da_not_a_directory() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("f.txt");
        fs::write(&file, b"x").unwrap();

        let err = list_dir(&file.to_string_lossy(), &spec(), false).unwrap_err();
        assert_eq!(err, FsError::NotADirectory);
    }

    #[test]
    fn gestisce_path_oltre_260_caratteri() {
        let dir = tempdir().unwrap();
        let mut p = dir.path().to_path_buf();
        for _ in 0..12 {
            p = p.join("cartella_con_nome_abbastanza_lungo_da_sforare");
        }
        // Il prefisso esteso serve anche al setup: senza, create_dir_all
        // fallirebbe prima ancora di arrivare al codice sotto test.
        fs::create_dir_all(paths::extended(&p)).unwrap();
        fs::write(paths::extended(&p).join("dentro.txt"), b"x").unwrap();

        assert!(
            p.to_string_lossy().len() > 260,
            "il path di test deve superare i 260 caratteri"
        );

        let r = list_dir(&p.to_string_lossy(), &spec(), false).unwrap();
        assert_eq!(r.entries.len(), 1);
        assert_eq!(r.entries[0].name, "dentro.txt");
    }

    #[test]
    fn il_path_restituito_non_ha_il_prefisso_esteso() {
        let dir = tempdir().unwrap();
        let r = list_dir(&dir.path().to_string_lossy(), &spec(), false).unwrap();
        assert!(!r.path.starts_with(r"\\?\"));
    }
}
