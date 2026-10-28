//! Il selettore di cartelle di Windows, quello di «Salva con nome».

use crate::fs::error::FsError;
use windows::core::{HSTRING, PWSTR};
use windows::Win32::Foundation::{ERROR_CANCELLED, HWND};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{
    FileOpenDialog, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName, FOS_FORCEFILESYSTEM,
    FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
};

/// Chiede all'utente una cartella, partendo da `iniziale` se esiste.
/// `None` se chiude senza scegliere.
pub fn cartella(hwnd: HWND, titolo: &str, iniziale: Option<&str>) -> Result<Option<String>, FsError> {
    let errore = |e: windows::core::Error| FsError::Io { message: format!("Selettore di cartelle non disponibile: {}", e) };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let d: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(errore)?;
        let opzioni = d.GetOptions().map_err(errore)?;
        d.SetOptions(opzioni | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST).map_err(errore)?;
        d.SetTitle(&HSTRING::from(titolo)).map_err(errore)?;
        if let Some(i) = iniziale.filter(|i| std::path::Path::new(i).is_dir()) {
            if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(i), None) {
                let _ = d.SetFolder(&item);
            }
        }
        if let Err(e) = d.Show(Some(hwnd)) {
            if e.code() == ERROR_CANCELLED.to_hresult() {
                return Ok(None);
            }
            return Err(errore(e));
        }
        let scelta = d.GetResult().map_err(errore)?;
        let p: PWSTR = scelta.GetDisplayName(SIGDN_FILESYSPATH).map_err(errore)?;
        let path = p.to_string().map_err(|e| FsError::Io { message: e.to_string() });
        CoTaskMemFree(Some(p.0 as *const _));
        path.map(Some)
    }
}
