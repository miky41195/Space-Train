//! The Windows folder picker, the one from «Save as».

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

/// Asks the user for a folder, starting from `initial` if it exists.
/// `None` if they close it without choosing.
pub fn folder(hwnd: HWND, title: &str, initial: Option<&str>) -> Result<Option<String>, FsError> {
    let error = |e: windows::core::Error| FsError::Io { message: format!("Selettore di cartelle non disponibile: {}", e) };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let d: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(error)?;
        let options = d.GetOptions().map_err(error)?;
        d.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST).map_err(error)?;
        d.SetTitle(&HSTRING::from(title)).map_err(error)?;
        if let Some(i) = initial.filter(|i| std::path::Path::new(i).is_dir()) {
            if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(i), None) {
                let _ = d.SetFolder(&item);
            }
        }
        if let Err(e) = d.Show(Some(hwnd)) {
            if e.code() == ERROR_CANCELLED.to_hresult() {
                return Ok(None);
            }
            return Err(error(e));
        }
        let choice = d.GetResult().map_err(error)?;
        let p: PWSTR = choice.GetDisplayName(SIGDN_FILESYSPATH).map_err(error)?;
        let path = p.to_string().map_err(|e| FsError::Io { message: e.to_string() });
        CoTaskMemFree(Some(p.0 as *const _));
        path.map(Some)
    }
}
