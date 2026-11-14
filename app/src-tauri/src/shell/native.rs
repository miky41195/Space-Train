//! Functions that go through the Windows Shell and the real window:
//! dragging towards other apps, system context menu, Properties,
//! «Apri con» and running as administrator.
//!
//! They all require the window's thread (STA, with the message
//! queue): whoever calls them sends them there with `on_window_thread`.

use crate::fs::error::FsError;
use serde::Serialize;

#[derive(Serialize, Debug, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub struct Modifiers {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
}

/// How the system menu ended.
#[derive(Serialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MenuOutcome {
    /// An item was chosen and run.
    pub executed: bool,
    /// «Apri percorso file»: the folder to open here, with the item to
    /// select. The app does it instead of Windows, see `system_menu`.
    pub open: Option<crate::fs::ops::Destination>,
}

/// The Shell verbs that open the folder containing an item: «Apri percorso
/// file» of shortcuts and search results.
pub fn opens_location(verb: &str) -> bool {
    ["openfilelocation", "opencontaining"]
        .iter()
        .any(|v| verb.eq_ignore_ascii_case(v))
}

/// Where to take the user to show them `target`: the folder that contains
/// it, with it selected. A drive root just opens.
pub fn destination_of(target: &str) -> crate::fs::ops::Destination {
    match crate::fs::paths::parent_of(target) {
        Some(folder) => crate::fs::ops::Destination {
            folder,
            select: Some(target.to_string()),
        },
        None => crate::fs::ops::Destination { folder: target.to_string(), select: None },
    }
}

#[cfg(windows)]
pub use win::*;

#[cfg(windows)]
mod win {
    use super::*;
    use std::cell::RefCell;
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, IDataObject, IPersistFile,
        CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
    };
    use windows::Win32::System::Ole::{
        OleInitialize, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_LINK, DROPEFFECT_MOVE,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_MENU, VK_SHIFT,
    };
    use windows::Win32::UI::Shell::Common::ITEMIDLIST;
    use windows::Win32::UI::Shell::{
        BHID_DataObject, DefSubclassProc, IContextMenu, IContextMenu2, IContextMenu3,
        IShellFolder, IShellItemArray, IShellLinkW, RemoveWindowSubclass, ShellLink, GCS_VERBW, SHBindToObject, SHBindToParent,
        SHCreateShellItemArrayFromIDLists, SHDoDragDrop, SHMultiFileProperties,
        SHObjectProperties, SHOpenWithDialog, SHParseDisplayName, SetWindowSubclass,
        ShellExecuteW, CMF_EXPLORE, CMF_NORMAL, CMINVOKECOMMANDINFO, CMINVOKECOMMANDINFOEX,
        CMIC_MASK_PTINVOKE, OAIF_ALLOW_REGISTRATION, OAIF_EXEC,
        OAIF_REGISTER_EXT, OPENASINFO, SHOP_FILEPATH,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreatePopupMenu, DestroyMenu, TrackPopupMenuEx, SW_SHOWNORMAL, TPM_RETURNCMD,
        TPM_RIGHTBUTTON, WM_DRAWITEM, WM_INITMENUPOPUP, WM_MEASUREITEM, WM_MENUCHAR,
    };

    /// Missing from the bindings: it is the same value as SEE_MASK_UNICODE.
    const CMIC_MASK_UNICODE: u32 = 0x0000_4000;

    fn error(context: &str, e: windows::core::Error) -> FsError {
        FsError::Io {
            message: format!("{}: {}", context, e.message()),
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// PIDL assoluti, liberati alla fine dell'uso.
    struct Pidl(Vec<*mut ITEMIDLIST>);

    impl Pidl {
        fn from(paths: &[String]) -> Result<Self, FsError> {
            let mut out = Pidl(Vec::with_capacity(paths.len()));
            for p in paths {
                let w = wide(p);
                let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
                unsafe { SHParseDisplayName(PCWSTR(w.as_ptr()), None, &mut pidl, 0, None) }
                    .map_err(|e| error(&format!("Elemento non raggiungibile «{}»", p), e))?;
                out.0.push(pidl);
            }
            Ok(out)
        }

        fn as_const(&self) -> Vec<*const ITEMIDLIST> {
            self.0.iter().map(|p| *p as *const _).collect()
        }
    }

    impl Drop for Pidl {
        fn drop(&mut self) {
            for p in &self.0 {
                unsafe { CoTaskMemFree(Some(*p as *const _)) };
            }
        }
    }

    fn data_object(paths: &[String]) -> Result<IDataObject, FsError> {
        let pidl = Pidl::from(paths)?;
        unsafe {
            let array: IShellItemArray = SHCreateShellItemArrayFromIDLists(&pidl.as_const())
                .map_err(|e| error("Selezione non valida", e))?;
            array
                .BindToHandler(None, &BHID_DataObject)
                .map_err(|e| error("Selezione non trasferibile", e))
        }
    }

    pub fn modifiers() -> Modifiers {
        let down = |k: u16| unsafe { (GetAsyncKeyState(k as i32) as u16 & 0x8000) != 0 };
        Modifiers {
            ctrl: down(VK_CONTROL.0),
            shift: down(VK_SHIFT.0),
            alt: down(VK_MENU.0),
        }
    }

    /// Starts a system drag with these files.
    ///
    /// The mouse button is already pressed in the WebView: from here on the
    /// round trip is driven by OLE, which can talk to Explorer, the desktop and any
    /// app that accepts files. Returns the effect chosen by the receiver.
    pub fn drag(hwnd: HWND, paths: &[String]) -> Result<String, FsError> {
        unsafe {
            let _ = OleInitialize(None);
        }
        let data = data_object(paths)?;
        let allowed: DROPEFFECT = DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK;
        let effect = unsafe { SHDoDragDrop(Some(hwnd), &data, None, allowed) }
            .map_err(|e| error("Trascinamento non riuscito", e))?;

        Ok(if effect.contains(DROPEFFECT_MOVE) {
            "move"
        } else if effect.contains(DROPEFFECT_COPY) {
            "copy"
        } else if effect.contains(DROPEFFECT_LINK) {
            "link"
        } else {
            "none"
        }
        .to_string())
    }

    pub fn properties(hwnd: HWND, paths: &[String]) -> Result<(), FsError> {
        if paths.len() == 1 {
            let w = wide(&paths[0]);
            let ok = unsafe {
                SHObjectProperties(Some(hwnd), SHOP_FILEPATH, PCWSTR(w.as_ptr()), PCWSTR::null())
            };
            if !ok.as_bool() {
                return Err(FsError::Io {
                    message: "Proprietà non disponibili per questo elemento.".to_string(),
                });
            }
            return Ok(());
        }
        let data = data_object(paths)?;
        unsafe { SHMultiFileProperties(&data, 0) }
            .map_err(|e| error("Proprietà non disponibili", e))
    }

    pub fn open_with(hwnd: HWND, path: &str) -> Result<(), FsError> {
        let w = wide(path);
        let info = OPENASINFO {
            pcszFile: PCWSTR(w.as_ptr()),
            pcszClass: PCWSTR::null(),
            oaifInFlags: OAIF_ALLOW_REGISTRATION | OAIF_REGISTER_EXT | OAIF_EXEC,
        };
        // The user closing the window without choosing is not an error.
        let _ = unsafe { SHOpenWithDialog(Some(hwnd), &info) };
        Ok(())
    }

    pub fn as_admin(hwnd: HWND, path: &str) -> Result<(), FsError> {
        let verb = wide("runas");
        let file = wide(path);
        let folder = crate::fs::paths::parent_of(path).map(|p| wide(&p));
        let outcome = unsafe {
            ShellExecuteW(
                Some(hwnd),
                PCWSTR(verb.as_ptr()),
                PCWSTR(file.as_ptr()),
                PCWSTR::null(),
                folder
                    .as_ref()
                    .map(|c| PCWSTR(c.as_ptr()))
                    .unwrap_or(PCWSTR::null()),
                SW_SHOWNORMAL,
            )
        };
        // ShellExecute signals success with a value greater than 32.
        if outcome.0 as isize <= 32 {
            return Err(FsError::Io {
                message: "Avvio come amministratore annullato o non riuscito.".to_string(),
            });
        }
        Ok(())
    }

    thread_local! {
        /// The menu open right now: it receives the messages needed to fill
        /// the dynamic submenus («Invia a», «Apri con», «Nuovo»).
        static OPEN_MENU: RefCell<Option<IContextMenu>> = const { RefCell::new(None) };
    }

    unsafe extern "system" fn subclass(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if matches!(msg, WM_INITMENUPOPUP | WM_DRAWITEM | WM_MEASUREITEM | WM_MENUCHAR) {
            let handled = OPEN_MENU.with(|m| {
                let m = m.borrow();
                let menu = m.as_ref()?;
                if let Ok(m3) = menu.cast::<IContextMenu3>() {
                    let mut result = LRESULT(0);
                    if m3.HandleMenuMsg2(msg, wparam, lparam, Some(&mut result)).is_ok() {
                        return Some(result);
                    }
                }
                if let Ok(m2) = menu.cast::<IContextMenu2>() {
                    if m2.HandleMenuMsg(msg, wparam, lparam).is_ok() {
                        return Some(LRESULT(0));
                    }
                }
                None
            });
            if let Some(r) = handled {
                return r;
            }
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    fn menu_for_items(hwnd: HWND, paths: &[String]) -> Result<IContextMenu, FsError> {
        let pidl = Pidl::from(paths)?;
        unsafe {
            let mut children: Vec<*const ITEMIDLIST> = Vec::new();
            let mut folder: Option<IShellFolder> = None;
            for p in &pidl.0 {
                let mut last: *mut ITEMIDLIST = std::ptr::null_mut();
                let f: IShellFolder = SHBindToParent(*p, Some(&mut last))
                    .map_err(|e| error("Cartella non raggiungibile", e))?;
                children.push(last as *const _);
                if folder.is_none() {
                    folder = Some(f);
                }
            }
            let folder = folder.ok_or(FsError::NotFound)?;
            // The child PIDLs point inside the absolute ones: `pidl` must live
            // until here, and it does because it only goes out of scope on return.
            folder
                .GetUIObjectOf::<IContextMenu>(hwnd, &children, None)
                .map_err(|e| error("Menu di sistema non disponibile", e))
        }
    }

    fn menu_for_background(hwnd: HWND, folder: &str) -> Result<IContextMenu, FsError> {
        let pidl = Pidl::from(&[folder.to_string()])?;
        unsafe {
            let f: IShellFolder = SHBindToObject(None, pidl.0[0], None)
                .map_err(|e| error("Cartella non raggiungibile", e))?;
            f.CreateViewObject(hwnd)
                .map_err(|e| error("Menu di sistema non disponibile", e))
        }
    }

    /// The language-independent name of item `id`, like «open» or
    /// «properties». Items from installed programs often have none.
    fn verb_name(menu: &IContextMenu, id: usize) -> Option<String> {
        let mut buf = [0u16; 256];
        unsafe {
            menu.GetCommandString(
                id,
                GCS_VERBW,
                None,
                windows::core::PSTR(buf.as_mut_ptr() as *mut u8),
                buf.len() as u32,
            )
        }
        .ok()?;
        let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..n]))
    }

    /// The file a `.lnk` shortcut points to, if `path` is one.
    pub fn shortcut_target(path: &str) -> Option<String> {
        if !path.to_lowercase().ends_with(".lnk") {
            return None;
        }
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
            let file: IPersistFile = link.cast().ok()?;
            let w = wide(path);
            file.Load(PCWSTR(w.as_ptr()), STGM_READ).ok()?;
            let mut buf = [0u16; 1024];
            link.GetPath(&mut buf, std::ptr::null_mut(), 0).ok()?;
            let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let target = String::from_utf16_lossy(&buf[..n]);
            (!target.is_empty()).then_some(target)
        }
    }

    /// Shows the Windows context menu, the one with the items added
    /// by installed programs, and runs the chosen item.
    ///
    /// Empty `paths` = background menu of the folder `folder`.
    ///
    /// «Apri percorso file» is not run: Windows would open the folder
    /// going through the default file manager, that is us, with a second
    /// copy that has to talk to this window — stuck in here
    /// waiting for the command to end. After a few seconds the Shell
    /// gave up with «operazione terminata». The app opens the folder itself.
    pub fn system_menu(
        hwnd: HWND,
        paths: &[String],
        folder: &str,
        x: i32,
        y: i32,
    ) -> Result<MenuOutcome, FsError> {
        unsafe {
            let _ = OleInitialize(None);
        }
        let menu = if paths.is_empty() {
            menu_for_background(hwnd, folder)?
        } else {
            menu_for_items(hwnd, paths)?
        };

        unsafe {
            let popup = CreatePopupMenu().map_err(|e| error("Menu non creato", e))?;
            menu.QueryContextMenu(popup, 0, 1, 0x7FFF, CMF_NORMAL | CMF_EXPLORE)
                .ok()
                .map_err(|e| error("Menu di sistema non disponibile", e))?;

            OPEN_MENU.with(|m| *m.borrow_mut() = Some(menu.clone()));
            let _ = SetWindowSubclass(hwnd, Some(subclass), 0x5354, 0);

            let choice = TrackPopupMenuEx(popup, (TPM_RETURNCMD | TPM_RIGHTBUTTON).0, x, y, hwnd, None);

            let _ = RemoveWindowSubclass(hwnd, Some(subclass), 0x5354);
            OPEN_MENU.with(|m| *m.borrow_mut() = None);

            let command = choice.0 as u32;
            let mut outcome = MenuOutcome::default();
            if command > 0 {
                let verb = (command - 1) as usize;
                if let (Some(name), Some(first)) = (verb_name(&menu, verb), paths.first()) {
                    if opens_location(&name) {
                        let _ = DestroyMenu(popup);
                        let target = shortcut_target(first).unwrap_or_else(|| first.clone());
                        return Ok(MenuOutcome { executed: true, open: Some(destination_of(&target)) });
                    }
                }
                let mut info = CMINVOKECOMMANDINFOEX {
                    cbSize: std::mem::size_of::<CMINVOKECOMMANDINFOEX>() as u32,
                    fMask: CMIC_MASK_UNICODE | CMIC_MASK_PTINVOKE,
                    hwnd,
                    lpVerb: windows::core::PCSTR(verb as *const u8),
                    lpVerbW: PCWSTR(verb as *const u16),
                    nShow: SW_SHOWNORMAL.0,
                    ptInvoke: POINT { x, y },
                    ..Default::default()
                };
                let folder_w = wide(folder);
                if !folder.is_empty() {
                    info.lpDirectoryW = PCWSTR(folder_w.as_ptr());
                }
                let invoked = menu.InvokeCommand(&info as *const _ as *const CMINVOKECOMMANDINFO);
                let _ = DestroyMenu(popup);
                invoked.map_err(|e| error("Comando non eseguito", e))?;
                outcome.executed = true;
                return Ok(outcome);
            }
            let _ = DestroyMenu(popup);
            Ok(outcome)
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows::Win32::UI::WindowsAndMessaging::{GetMenuItemCount, GetMenuItemID};

        /// The items of the system menu of `path` with their verb.
        fn verbs(path: &str) -> Vec<String> {
            unsafe {
                let _ = OleInitialize(None);
                let menu = menu_for_items(HWND::default(), &[path.to_string()]).unwrap();
                let popup = CreatePopupMenu().unwrap();
                menu.QueryContextMenu(popup, 0, 1, 0x7FFF, CMF_NORMAL | CMF_EXPLORE).ok().unwrap();
                let n = GetMenuItemCount(Some(popup));
                let mut out = Vec::new();
                for i in 0..n {
                    let id = GetMenuItemID(popup, i);
                    if id == u32::MAX || id == 0 {
                        continue;
                    }
                    if let Some(v) = verb_name(&menu, (id - 1) as usize) {
                        out.push(v);
                    }
                }
                let _ = DestroyMenu(popup);
                out
            }
        }

        fn create_shortcut(lnk: &std::path::Path, target: &std::path::Path) {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
                let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
                let b = wide(&target.to_string_lossy());
                link.SetPath(PCWSTR(b.as_ptr())).unwrap();
                let file: IPersistFile = link.cast().unwrap();
                let l = wide(&lnk.to_string_lossy());
                file.Save(PCWSTR(l.as_ptr()), true).unwrap();
            }
        }

        #[test]
        fn a_shortcut_menu_offers_open_file_location() {
            let d = tempfile::tempdir().unwrap();
            let target = d.path().join("nota.txt");
            std::fs::write(&target, b"x").unwrap();
            let lnk = d.path().join("nota.lnk");
            create_shortcut(&lnk, &target);

            let v = verbs(&lnk.to_string_lossy());
            assert!(v.iter().any(|v| opens_location(v)), "verbs found: {:?}", v);
        }

        #[test]
        fn a_shortcut_resolves_to_its_target() {
            let d = tempfile::tempdir().unwrap();
            let target = d.path().join("nota.txt");
            std::fs::write(&target, b"x").unwrap();
            let lnk = d.path().join("nota.lnk");
            create_shortcut(&lnk, &target);

            let found = shortcut_target(&lnk.to_string_lossy()).unwrap();
            assert!(found.eq_ignore_ascii_case(&target.to_string_lossy()), "{}", found);
            assert_eq!(shortcut_target(&target.to_string_lossy()), None);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(windows))]
    #[test]
    fn showing_a_linux_file_opens_its_folder() {
        let d = destination_of("/home/anna/nota.txt");
        assert_eq!(d.folder, "/home/anna");
        assert_eq!(d.select.as_deref(), Some("/home/anna/nota.txt"));
        assert_eq!(destination_of("/").folder, "/");
    }

    #[cfg(windows)]
    #[test]
    fn open_location_leads_to_the_folder_with_the_item_selected() {
        let d = destination_of(r"C:\Dati\nota.txt");
        assert_eq!(d.folder, r"C:\Dati");
        assert_eq!(d.select.as_deref(), Some(r"C:\Dati\nota.txt"));
        assert_eq!(destination_of(r"D:\").folder, r"D:\");
        assert!(opens_location("OpenFileLocation"));
        assert!(!opens_location("open"));
    }
}

#[cfg(not(windows))]
pub fn modifiers() -> Modifiers {
    Modifiers::default()
}
