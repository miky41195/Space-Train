//! Posizioni di rete: i computer visibili e le condivisioni di un server.
//!
//! `\\server\condivisione` è un path normale che read_dir sa leggere.
//! `\\server` da solo e la «Rete» intera invece no: li elenca WNet.

use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;

pub const RADICE: &str = "::rete";

/// Vero per `\\server`, senza condivisione dopo.
pub fn e_server(path: &str) -> bool {
    let Some(resto) = path.strip_prefix(r"\\") else {
        return false;
    };
    let resto = resto.trim_end_matches('\\');
    !resto.is_empty() && !resto.contains('\\') && !resto.starts_with('?') && !resto.starts_with('.')
}

/// Vero per `\\server\condivisione`, la radice di una condivisione.
pub fn e_condivisione(path: &str) -> bool {
    let Some(resto) = path.strip_prefix(r"\\") else {
        return false;
    };
    let parti: Vec<&str> = resto.trim_end_matches('\\').split('\\').collect();
    parti.len() == 2 && !parti[0].starts_with('?') && parti.iter().all(|p| !p.is_empty())
}

/// Il genitore nelle posizioni di rete: condivisione → server → Rete.
pub fn genitore(path: &str) -> Option<String> {
    if e_condivisione(path) {
        let resto = &path[2..];
        let server = resto.split('\\').next()?;
        return Some(format!(r"\\{}", server));
    }
    if e_server(path) {
        return Some(RADICE.to_string());
    }
    None
}

fn cartella(nome: String, path: String) -> Entry {
    Entry {
        name: nome,
        path,
        kind: EntryKind::Dir,
        size: 0,
        modified: None,
        hidden: false,
        origine: None,
        libero: None,
        totale: None,
        icona_propria: false,
    }
}

/// I computer della rete locale.
pub fn computer() -> Result<Vec<Entry>, FsError> {
    let mut voci: Vec<Entry> = enumera(None)
        .into_iter()
        .filter(|(nome, _)| e_server(nome))
        .map(|(remoto, _)| {
            let nome = remoto.trim_start_matches('\\').to_string();
            cartella(nome, remoto)
        })
        .collect();
    voci.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(voci)
}

/// Le condivisioni pubblicate da `\\server`.
pub fn condivisioni(server: &str) -> Result<Vec<Entry>, FsError> {
    let server = server.trim_end_matches('\\');
    let trovate = enumera(Some(server));
    if trovate.is_empty() {
        return Err(FsError::NotFound);
    }
    let mut voci: Vec<Entry> = trovate
        .into_iter()
        .map(|(remoto, _)| {
            let nome = remoto.rsplit('\\').next().unwrap_or(&remoto).to_string();
            cartella(nome, remoto)
        })
        .collect();
    voci.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(voci)
}

#[cfg(windows)]
fn enumera(contenitore: Option<&str>) -> Vec<(String, u32)> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, HANDLE, NO_ERROR};
    use windows::Win32::NetworkManagement::WNet::{
        WNetCloseEnum, WNetEnumResourceW, WNetOpenEnumW, NETRESOURCEW, RESOURCETYPE_DISK,
        RESOURCEUSAGE_ALL, RESOURCE_CONTEXT, RESOURCE_GLOBALNET,
    };

    let mut nome: Vec<u16> = contenitore
        .unwrap_or("")
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let radice = NETRESOURCEW {
        lpRemoteName: PWSTR(nome.as_mut_ptr()),
        ..Default::default()
    };

    let mut handle = HANDLE::default();
    let aperto = unsafe {
        match contenitore {
            Some(_) => WNetOpenEnumW(
                RESOURCE_GLOBALNET,
                RESOURCETYPE_DISK,
                RESOURCEUSAGE_ALL,
                Some(&radice),
                &mut handle,
            ),
            None => WNetOpenEnumW(
                RESOURCE_CONTEXT,
                RESOURCETYPE_DISK,
                RESOURCEUSAGE_ALL,
                None,
                &mut handle,
            ),
        }
    };
    if aperto != NO_ERROR {
        return Vec::new();
    }

    let mut out = Vec::new();
    // NETRESOURCEW contiene puntatori a stringhe che stanno nello stesso
    // buffer: va allineato, perciò u64 invece di u8.
    let mut buffer = vec![0u64; 16 * 1024 / 8];
    loop {
        let mut quanti = u32::MAX;
        let mut dimensione = (buffer.len() * 8) as u32;
        let esito = unsafe {
            WNetEnumResourceW(
                handle,
                &mut quanti,
                buffer.as_mut_ptr() as *mut _,
                &mut dimensione,
            )
        };
        if esito == ERROR_NO_MORE_ITEMS || esito != NO_ERROR {
            break;
        }
        let risorse = unsafe {
            std::slice::from_raw_parts(buffer.as_ptr() as *const NETRESOURCEW, quanti as usize)
        };
        for r in risorse {
            if r.lpRemoteName.is_null() {
                continue;
            }
            let remoto = unsafe { r.lpRemoteName.to_string() }.unwrap_or_default();
            out.push((remoto, r.dwDisplayType));
        }
    }
    unsafe {
        let _ = WNetCloseEnum(handle);
    }
    out
}

#[cfg(not(windows))]
fn enumera(_contenitore: Option<&str>) -> Vec<(String, u32)> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn riconosce_server_e_condivisioni() {
        assert!(e_server(r"\\nas"));
        assert!(e_server(r"\\nas\"));
        assert!(!e_server(r"\\nas\foto"));
        assert!(!e_server(r"\\?\C:\x"));
        assert!(!e_server(r"C:\"));

        assert!(e_condivisione(r"\\nas\foto"));
        assert!(!e_condivisione(r"\\nas\foto\2024"));
        assert!(!e_condivisione(r"\\nas"));
    }

    #[test]
    fn si_risale_dalla_condivisione_alla_rete() {
        assert_eq!(genitore(r"\\nas\foto"), Some(r"\\nas".to_string()));
        assert_eq!(genitore(r"\\nas"), Some(RADICE.to_string()));
        assert_eq!(genitore(r"C:\x"), None);
    }

    #[test]
    fn elencare_la_rete_non_fallisce_anche_se_vuota() {
        assert!(computer().is_ok());
    }
}
