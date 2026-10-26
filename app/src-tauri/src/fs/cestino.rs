//! Il Cestino di Windows come cartella sfogliabile.
//!
//! Le voci hanno path `::cestino\<id>`: l'id è il nome con cui la Shell
//! conosce l'elemento dentro `$Recycle.Bin`, e serve a ritrovarlo per
//! ripristinarlo o eliminarlo. Il frontend non lo interpreta mai.

use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;
use std::collections::HashSet;
use std::ffi::OsString;
use trash::{TrashItem, TrashItemSize};

pub const RADICE: &str = "::cestino";

fn errore(e: trash::Error) -> FsError {
    let message = match e {
        trash::Error::RestoreCollision { path, .. } => format!(
            "Impossibile ripristinare: esiste già «{}».",
            path.to_string_lossy()
        ),
        altro => format!("Operazione sul Cestino non riuscita: {}", altro),
    };
    FsError::Io { message }
}

fn path_di(item: &TrashItem) -> String {
    format!("{}\\{}", RADICE, item.id.to_string_lossy())
}

fn id_da_path(path: &str) -> Option<OsString> {
    path.strip_prefix(RADICE)
        .and_then(|r| r.strip_prefix('\\'))
        .map(OsString::from)
}

pub fn elenca() -> Result<Vec<Entry>, FsError> {
    let voci = trash::os_limited::list().map_err(errore)?;

    let mut entries: Vec<Entry> = voci
        .iter()
        .map(|v| {
            let misura = trash::os_limited::metadata(v).ok().map(|m| m.size);
            let (kind, size) = match misura {
                Some(TrashItemSize::Entries(_)) => (EntryKind::Dir, 0),
                Some(TrashItemSize::Bytes(b)) => (EntryKind::File, b),
                None => (EntryKind::File, 0),
            };
            Entry {
                name: v.name.to_string_lossy().into_owned(),
                path: path_di(v),
                kind,
                size,
                modified: Some(v.time_deleted * 1000),
                hidden: false,
                origine: Some(v.original_parent.to_string_lossy().into_owned()),
                libero: None,
                totale: None,
                icona_propria: false,
            }
        })
        .collect();

    // I più recenti in cima: nel Cestino si cerca quasi sempre ciò che si
    // è appena buttato.
    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(entries)
}

fn scegli(paths: &[String]) -> Result<Vec<TrashItem>, FsError> {
    let ids: HashSet<OsString> = paths.iter().filter_map(|p| id_da_path(p)).collect();
    Ok(trash::os_limited::list()
        .map_err(errore)?
        .into_iter()
        .filter(|v| ids.contains(&v.id))
        .collect())
}

pub fn ripristina(paths: &[String]) -> Result<(), FsError> {
    let voci = scegli(paths)?;
    if voci.is_empty() {
        return Ok(());
    }
    trash::os_limited::restore_all(voci).map_err(errore)
}

pub fn elimina(paths: &[String]) -> Result<(), FsError> {
    let voci = scegli(paths)?;
    if voci.is_empty() {
        return Ok(());
    }
    trash::os_limited::purge_all(voci).map_err(errore)
}

pub fn svuota() -> Result<(), FsError> {
    let voci = trash::os_limited::list().map_err(errore)?;
    if voci.is_empty() {
        return Ok(());
    }
    trash::os_limited::purge_all(voci).map_err(errore)
}

/// Ripristina gli elementi eliminati da questi path originali.
///
/// Serve ad annullare un «Sposta nel Cestino»: se lo stesso path è stato
/// cestinato più volte, torna l'eliminazione più recente.
pub fn ripristina_originali(originali: &[String]) -> Result<(), FsError> {
    let voci = trash::os_limited::list().map_err(errore)?;
    let mut scelte: Vec<TrashItem> = Vec::new();

    for originale in originali {
        let bersaglio = std::path::Path::new(originale);
        let migliore = voci
            .iter()
            .filter(|v| v.original_path() == bersaglio)
            .max_by_key(|v| v.time_deleted);
        if let Some(v) = migliore {
            scelte.push(v.clone());
        }
    }

    if scelte.is_empty() {
        return Err(FsError::Io {
            message: "Gli elementi non sono più nel Cestino.".to_string(),
        });
    }
    trash::os_limited::restore_all(scelte).map_err(errore)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn l_id_si_ricava_dal_path_della_voce() {
        assert_eq!(
            id_da_path(r"::cestino\C:\$Recycle.Bin\S-1\$R1.txt"),
            Some(OsString::from(r"C:\$Recycle.Bin\S-1\$R1.txt"))
        );
        assert_eq!(id_da_path(r"C:\normale.txt"), None);
    }

    #[test]
    fn cestinare_e_ripristinare_riporta_il_file_al_suo_posto() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("da_ripristinare.txt");
        std::fs::write(&file, b"x").unwrap();
        let path = file.to_string_lossy().into_owned();

        trash::delete(&file).unwrap();
        assert!(!file.exists());

        ripristina_originali(&[path]).unwrap();
        assert!(file.exists());
    }
}
