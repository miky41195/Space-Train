//! Appunti di Windows per i file.
//!
//! Il formato è lo stesso di Esplora risorse: `CF_HDROP` con l'elenco dei
//! path, più «Preferred DropEffect» che dice se è una copia o un taglio.
//! Così copiare qui e incollare in Esplora (o viceversa) funziona.

use crate::fs::error::FsError;
use serde::Serialize;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContenutoAppunti {
    pub paths: Vec<String>,
    /// Vero se i file sono stati tagliati: incollarli li sposta.
    pub taglia: bool,
}

const DROPEFFECT_COPY: u32 = 1;
const DROPEFFECT_MOVE: u32 = 2;
const DROPEFFECT_LINK: u32 = 4;

#[cfg(windows)]
mod win {
    use super::*;
    use windows::core::w;
    use windows::Win32::Foundation::{HANDLE, HGLOBAL, POINT};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable,
        OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::UI::Shell::{DragQueryFileW, DROPFILES, HDROP};

    fn formato_effetto() -> u32 {
        unsafe { RegisterClipboardFormatW(w!("Preferred DropEffect")) }
    }

    /// Gli appunti sono una risorsa condivisa: un'altra app può tenerli
    /// aperti per qualche millisecondo. Si riprova invece di fallire.
    struct Aperti;

    impl Aperti {
        fn apri() -> Result<Self, FsError> {
            for _ in 0..20 {
                if unsafe { OpenClipboard(None) }.is_ok() {
                    return Ok(Aperti);
                }
                std::thread::sleep(std::time::Duration::from_millis(15));
            }
            Err(FsError::Io {
                message: "Gli appunti sono occupati da un'altra applicazione.".to_string(),
            })
        }
    }

    impl Drop for Aperti {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }

    fn globale(byte: &[u8]) -> Result<HGLOBAL, FsError> {
        let errore = |e: windows::core::Error| FsError::Io {
            message: format!("Memoria per gli appunti non disponibile: {}", e),
        };
        unsafe {
            let h = GlobalAlloc(GMEM_MOVEABLE, byte.len()).map_err(errore)?;
            let p = GlobalLock(h) as *mut u8;
            if p.is_null() {
                return Err(FsError::Io {
                    message: "Memoria per gli appunti non disponibile.".to_string(),
                });
            }
            std::ptr::copy_nonoverlapping(byte.as_ptr(), p, byte.len());
            let _ = GlobalUnlock(h);
            Ok(h)
        }
    }

    pub fn scrivi(paths: &[String], taglia: bool) -> Result<(), FsError> {
        // DROPFILES seguito dai path in UTF-16, separati da zero e chiusi
        // da un doppio zero.
        let intestazione = DROPFILES {
            pFiles: std::mem::size_of::<DROPFILES>() as u32,
            pt: POINT::default(),
            fNC: false.into(),
            fWide: true.into(),
        };
        let mut byte: Vec<u8> = unsafe {
            std::slice::from_raw_parts(
                &intestazione as *const DROPFILES as *const u8,
                std::mem::size_of::<DROPFILES>(),
            )
        }
        .to_vec();
        for p in paths {
            for u in p.encode_utf16().chain(std::iter::once(0)) {
                byte.extend_from_slice(&u.to_le_bytes());
            }
        }
        byte.extend_from_slice(&0u16.to_le_bytes());

        let effetto = if taglia {
            DROPEFFECT_MOVE
        } else {
            DROPEFFECT_COPY | DROPEFFECT_LINK
        };

        let _aperti = Aperti::apri()?;
        let errore = |e: windows::core::Error| FsError::Io {
            message: format!("Impossibile scrivere negli appunti: {}", e),
        };
        unsafe {
            EmptyClipboard().map_err(errore)?;
            let lista = globale(&byte)?;
            SetClipboardData(CF_HDROP.0 as u32, Some(HANDLE(lista.0))).map_err(errore)?;
            let eff = globale(&effetto.to_le_bytes())?;
            SetClipboardData(formato_effetto(), Some(HANDLE(eff.0))).map_err(errore)?;
        }
        Ok(())
    }

    pub fn leggi() -> Option<ContenutoAppunti> {
        unsafe {
            IsClipboardFormatAvailable(CF_HDROP.0 as u32).ok()?;
        }
        let _aperti = Aperti::apri().ok()?;

        unsafe {
            let h = GetClipboardData(CF_HDROP.0 as u32).ok()?;
            let drop = HDROP(h.0);
            let quanti = DragQueryFileW(drop, u32::MAX, None);
            let mut paths = Vec::with_capacity(quanti as usize);
            for i in 0..quanti {
                let lunghezza = DragQueryFileW(drop, i, None) as usize;
                let mut buf = vec![0u16; lunghezza + 1];
                let scritti = DragQueryFileW(drop, i, Some(&mut buf)) as usize;
                paths.push(String::from_utf16_lossy(&buf[..scritti]));
            }

            let mut taglia = false;
            if let Ok(e) = GetClipboardData(formato_effetto()) {
                let p = GlobalLock(HGLOBAL(e.0)) as *const u32;
                if !p.is_null() {
                    taglia = (*p & DROPEFFECT_MOVE) != 0 && (*p & DROPEFFECT_COPY) == 0;
                    let _ = GlobalUnlock(HGLOBAL(e.0));
                }
            }

            if paths.is_empty() {
                return None;
            }
            Some(ContenutoAppunti { paths, taglia })
        }
    }

    pub fn svuota() -> Result<(), FsError> {
        let _aperti = Aperti::apri()?;
        unsafe { EmptyClipboard() }.map_err(|e| FsError::Io {
            message: e.to_string(),
        })
    }
}

#[cfg(windows)]
pub use win::{leggi, scrivi, svuota};

#[cfg(not(windows))]
pub fn scrivi(_: &[String], _: bool) -> Result<(), FsError> {
    Ok(())
}
#[cfg(not(windows))]
pub fn leggi() -> Option<ContenutoAppunti> {
    None
}
#[cfg(not(windows))]
pub fn svuota() -> Result<(), FsError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un solo test tocca gli appunti veri: in parallelo si pesterebbero.
    #[test]
    fn copia_e_taglio_fanno_il_giro_degli_appunti() {
        let paths = vec![r"C:\Windows\notepad.exe".to_string(), r"C:\file con spazi.txt".to_string()];

        scrivi(&paths, false).unwrap();
        assert_eq!(
            leggi(),
            Some(ContenutoAppunti { paths: paths.clone(), taglia: false })
        );

        scrivi(&paths, true).unwrap();
        assert_eq!(leggi().unwrap().taglia, true);

        svuota().unwrap();
        assert_eq!(leggi(), None);
    }
}
