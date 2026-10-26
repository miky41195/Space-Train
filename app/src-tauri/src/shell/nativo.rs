//! Funzioni che passano dalla Shell di Windows e dalla finestra vera:
//! trascinamento verso altre app, menu contestuale di sistema, Proprietà,
//! «Apri con» ed esecuzione come amministratore.
//!
//! Tutte pretendono il thread della finestra (STA, con la coda dei
//! messaggi): chi le chiama le spedisce lì con `sul_thread_finestra`.

use crate::fs::error::FsError;
use serde::Serialize;

#[derive(Serialize, Debug, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub struct Modificatori {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
}

/// Com'è finito il menu di sistema.
#[derive(Serialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EsitoMenu {
    /// È stata scelta ed eseguita una voce.
    pub eseguito: bool,
    /// «Apri percorso file»: la cartella da aprire qui, con la voce da
    /// selezionare. Lo fa l'app invece di Windows, vedi `menu_di_sistema`.
    pub apri: Option<crate::fs::ops::Destinazione>,
}

/// I verbi della Shell che aprono la cartella che contiene un elemento:
/// «Apri percorso file» dei collegamenti e dei risultati di ricerca.
pub fn apre_percorso(verbo: &str) -> bool {
    ["openfilelocation", "opencontaining"]
        .iter()
        .any(|v| verbo.eq_ignore_ascii_case(v))
}

/// Dove portare l'utente per mostrargli `bersaglio`: la cartella che lo
/// contiene, con lui selezionato. Una radice di disco si apre e basta.
pub fn destinazione_di(bersaglio: &str) -> crate::fs::ops::Destinazione {
    match crate::fs::paths::parent_of(bersaglio) {
        Some(cartella) => crate::fs::ops::Destinazione {
            cartella,
            seleziona: Some(bersaglio.to_string()),
        },
        None => crate::fs::ops::Destinazione { cartella: bersaglio.to_string(), seleziona: None },
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

    /// Manca nei binding: è lo stesso valore di SEE_MASK_UNICODE.
    const CMIC_MASK_UNICODE: u32 = 0x0000_4000;

    fn errore(contesto: &str, e: windows::core::Error) -> FsError {
        FsError::Io {
            message: format!("{}: {}", contesto, e.message()),
        }
    }

    fn larga(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// PIDL assoluti, liberati alla fine dell'uso.
    struct Pidl(Vec<*mut ITEMIDLIST>);

    impl Pidl {
        fn da(paths: &[String]) -> Result<Self, FsError> {
            let mut out = Pidl(Vec::with_capacity(paths.len()));
            for p in paths {
                let w = larga(p);
                let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
                unsafe { SHParseDisplayName(PCWSTR(w.as_ptr()), None, &mut pidl, 0, None) }
                    .map_err(|e| errore(&format!("Elemento non raggiungibile «{}»", p), e))?;
                out.0.push(pidl);
            }
            Ok(out)
        }

        fn costanti(&self) -> Vec<*const ITEMIDLIST> {
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

    fn oggetto_dati(paths: &[String]) -> Result<IDataObject, FsError> {
        let pidl = Pidl::da(paths)?;
        unsafe {
            let insieme: IShellItemArray = SHCreateShellItemArrayFromIDLists(&pidl.costanti())
                .map_err(|e| errore("Selezione non valida", e))?;
            insieme
                .BindToHandler(None, &BHID_DataObject)
                .map_err(|e| errore("Selezione non trasferibile", e))
        }
    }

    pub fn modificatori() -> Modificatori {
        let giu = |k: u16| unsafe { (GetAsyncKeyState(k as i32) as u16 & 0x8000) != 0 };
        Modificatori {
            ctrl: giu(VK_CONTROL.0),
            shift: giu(VK_SHIFT.0),
            alt: giu(VK_MENU.0),
        }
    }

    /// Avvia un trascinamento di sistema con questi file.
    ///
    /// Il pulsante del mouse è già premuto nella WebView: da qui in poi il
    /// giro lo guida OLE, che sa parlare con Esplora, il desktop e qualsiasi
    /// app che accetti file. Ritorna l'effetto scelto da chi ha ricevuto.
    pub fn trascina(hwnd: HWND, paths: &[String]) -> Result<String, FsError> {
        unsafe {
            let _ = OleInitialize(None);
        }
        let dati = oggetto_dati(paths)?;
        let consentiti: DROPEFFECT = DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK;
        let effetto = unsafe { SHDoDragDrop(Some(hwnd), &dati, None, consentiti) }
            .map_err(|e| errore("Trascinamento non riuscito", e))?;

        Ok(if effetto.contains(DROPEFFECT_MOVE) {
            "sposta"
        } else if effetto.contains(DROPEFFECT_COPY) {
            "copia"
        } else if effetto.contains(DROPEFFECT_LINK) {
            "collegamento"
        } else {
            "nessuno"
        }
        .to_string())
    }

    pub fn proprieta(hwnd: HWND, paths: &[String]) -> Result<(), FsError> {
        if paths.len() == 1 {
            let w = larga(&paths[0]);
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
        let dati = oggetto_dati(paths)?;
        unsafe { SHMultiFileProperties(&dati, 0) }
            .map_err(|e| errore("Proprietà non disponibili", e))
    }

    pub fn apri_con(hwnd: HWND, path: &str) -> Result<(), FsError> {
        let w = larga(path);
        let info = OPENASINFO {
            pcszFile: PCWSTR(w.as_ptr()),
            pcszClass: PCWSTR::null(),
            oaifInFlags: OAIF_ALLOW_REGISTRATION | OAIF_REGISTER_EXT | OAIF_EXEC,
        };
        // L'utente che chiude la finestra senza scegliere non è un errore.
        let _ = unsafe { SHOpenWithDialog(Some(hwnd), &info) };
        Ok(())
    }

    pub fn come_amministratore(hwnd: HWND, path: &str) -> Result<(), FsError> {
        let verbo = larga("runas");
        let file = larga(path);
        let cartella = crate::fs::paths::parent_of(path).map(|p| larga(&p));
        let esito = unsafe {
            ShellExecuteW(
                Some(hwnd),
                PCWSTR(verbo.as_ptr()),
                PCWSTR(file.as_ptr()),
                PCWSTR::null(),
                cartella
                    .as_ref()
                    .map(|c| PCWSTR(c.as_ptr()))
                    .unwrap_or(PCWSTR::null()),
                SW_SHOWNORMAL,
            )
        };
        // ShellExecute segnala il successo con un valore maggiore di 32.
        if esito.0 as isize <= 32 {
            return Err(FsError::Io {
                message: "Avvio come amministratore annullato o non riuscito.".to_string(),
            });
        }
        Ok(())
    }

    thread_local! {
        /// Il menu aperto in questo momento: riceve i messaggi che servono a
        /// riempire i sottomenu dinamici («Invia a», «Apri con», «Nuovo»).
        static MENU_APERTO: RefCell<Option<IContextMenu>> = const { RefCell::new(None) };
    }

    unsafe extern "system" fn sottoclasse(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _dati: usize,
    ) -> LRESULT {
        if matches!(msg, WM_INITMENUPOPUP | WM_DRAWITEM | WM_MEASUREITEM | WM_MENUCHAR) {
            let gestito = MENU_APERTO.with(|m| {
                let m = m.borrow();
                let menu = m.as_ref()?;
                if let Ok(m3) = menu.cast::<IContextMenu3>() {
                    let mut risultato = LRESULT(0);
                    if m3.HandleMenuMsg2(msg, wparam, lparam, Some(&mut risultato)).is_ok() {
                        return Some(risultato);
                    }
                }
                if let Ok(m2) = menu.cast::<IContextMenu2>() {
                    if m2.HandleMenuMsg(msg, wparam, lparam).is_ok() {
                        return Some(LRESULT(0));
                    }
                }
                None
            });
            if let Some(r) = gestito {
                return r;
            }
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    fn menu_per_elementi(hwnd: HWND, paths: &[String]) -> Result<IContextMenu, FsError> {
        let pidl = Pidl::da(paths)?;
        unsafe {
            let mut figli: Vec<*const ITEMIDLIST> = Vec::new();
            let mut cartella: Option<IShellFolder> = None;
            for p in &pidl.0 {
                let mut ultimo: *mut ITEMIDLIST = std::ptr::null_mut();
                let f: IShellFolder = SHBindToParent(*p, Some(&mut ultimo))
                    .map_err(|e| errore("Cartella non raggiungibile", e))?;
                figli.push(ultimo as *const _);
                if cartella.is_none() {
                    cartella = Some(f);
                }
            }
            let cartella = cartella.ok_or(FsError::NotFound)?;
            // I PIDL figli puntano dentro quelli assoluti: `pidl` deve vivere
            // fino a qui, ed è così perché esce di scope solo al ritorno.
            cartella
                .GetUIObjectOf::<IContextMenu>(hwnd, &figli, None)
                .map_err(|e| errore("Menu di sistema non disponibile", e))
        }
    }

    fn menu_per_sfondo(hwnd: HWND, cartella: &str) -> Result<IContextMenu, FsError> {
        let pidl = Pidl::da(&[cartella.to_string()])?;
        unsafe {
            let f: IShellFolder = SHBindToObject(None, pidl.0[0], None)
                .map_err(|e| errore("Cartella non raggiungibile", e))?;
            f.CreateViewObject(hwnd)
                .map_err(|e| errore("Menu di sistema non disponibile", e))
        }
    }

    /// Il nome indipendente dalla lingua della voce `id`, come «open» o
    /// «properties». Le voci dei programmi installati spesso non ne hanno.
    fn nome_verbo(menu: &IContextMenu, id: usize) -> Option<String> {
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

    /// Il file a cui punta un collegamento `.lnk`, se `path` lo è.
    pub fn bersaglio_collegamento(path: &str) -> Option<String> {
        if !path.to_lowercase().ends_with(".lnk") {
            return None;
        }
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
            let file: IPersistFile = link.cast().ok()?;
            let w = larga(path);
            file.Load(PCWSTR(w.as_ptr()), STGM_READ).ok()?;
            let mut buf = [0u16; 1024];
            link.GetPath(&mut buf, std::ptr::null_mut(), 0).ok()?;
            let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let bersaglio = String::from_utf16_lossy(&buf[..n]);
            (!bersaglio.is_empty()).then_some(bersaglio)
        }
    }

    /// Mostra il menu contestuale di Windows, quello con le voci aggiunte
    /// dai programmi installati, ed esegue la voce scelta.
    ///
    /// `paths` vuoto = menu dello sfondo della cartella `cartella`.
    ///
    /// «Apri percorso file» non si esegue: Windows aprirebbe la cartella
    /// passando dal file manager predefinito, cioè da noi, con una seconda
    /// copia che deve parlare a questa finestra — ferma qui dentro ad
    /// aspettare la fine del comando. Dopo qualche secondo la Shell
    /// rinunciava con «operazione terminata». La cartella la apre l'app.
    pub fn menu_di_sistema(
        hwnd: HWND,
        paths: &[String],
        cartella: &str,
        x: i32,
        y: i32,
    ) -> Result<EsitoMenu, FsError> {
        unsafe {
            let _ = OleInitialize(None);
        }
        let menu = if paths.is_empty() {
            menu_per_sfondo(hwnd, cartella)?
        } else {
            menu_per_elementi(hwnd, paths)?
        };

        unsafe {
            let popup = CreatePopupMenu().map_err(|e| errore("Menu non creato", e))?;
            menu.QueryContextMenu(popup, 0, 1, 0x7FFF, CMF_NORMAL | CMF_EXPLORE)
                .ok()
                .map_err(|e| errore("Menu di sistema non disponibile", e))?;

            MENU_APERTO.with(|m| *m.borrow_mut() = Some(menu.clone()));
            let _ = SetWindowSubclass(hwnd, Some(sottoclasse), 0x5354, 0);

            let scelta = TrackPopupMenuEx(popup, (TPM_RETURNCMD | TPM_RIGHTBUTTON).0, x, y, hwnd, None);

            let _ = RemoveWindowSubclass(hwnd, Some(sottoclasse), 0x5354);
            MENU_APERTO.with(|m| *m.borrow_mut() = None);

            let comando = scelta.0 as u32;
            let mut esito = EsitoMenu::default();
            if comando > 0 {
                let verbo = (comando - 1) as usize;
                if let (Some(nome), Some(primo)) = (nome_verbo(&menu, verbo), paths.first()) {
                    if apre_percorso(&nome) {
                        let _ = DestroyMenu(popup);
                        let bersaglio = bersaglio_collegamento(primo).unwrap_or_else(|| primo.clone());
                        return Ok(EsitoMenu { eseguito: true, apri: Some(destinazione_di(&bersaglio)) });
                    }
                }
                let mut info = CMINVOKECOMMANDINFOEX {
                    cbSize: std::mem::size_of::<CMINVOKECOMMANDINFOEX>() as u32,
                    fMask: CMIC_MASK_UNICODE | CMIC_MASK_PTINVOKE,
                    hwnd,
                    lpVerb: windows::core::PCSTR(verbo as *const u8),
                    lpVerbW: PCWSTR(verbo as *const u16),
                    nShow: SW_SHOWNORMAL.0,
                    ptInvoke: POINT { x, y },
                    ..Default::default()
                };
                let cartella_w = larga(cartella);
                if !cartella.is_empty() {
                    info.lpDirectoryW = PCWSTR(cartella_w.as_ptr());
                }
                let invocato = menu.InvokeCommand(&info as *const _ as *const CMINVOKECOMMANDINFO);
                let _ = DestroyMenu(popup);
                invocato.map_err(|e| errore("Comando non eseguito", e))?;
                esito.eseguito = true;
                return Ok(esito);
            }
            let _ = DestroyMenu(popup);
            Ok(esito)
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows::Win32::UI::WindowsAndMessaging::{GetMenuItemCount, GetMenuItemID};

        /// Le voci del menu di sistema di `path` con il loro verbo.
        fn verbi(path: &str) -> Vec<String> {
            unsafe {
                let _ = OleInitialize(None);
                let menu = menu_per_elementi(HWND::default(), &[path.to_string()]).unwrap();
                let popup = CreatePopupMenu().unwrap();
                menu.QueryContextMenu(popup, 0, 1, 0x7FFF, CMF_NORMAL | CMF_EXPLORE).ok().unwrap();
                let n = GetMenuItemCount(Some(popup));
                let mut out = Vec::new();
                for i in 0..n {
                    let id = GetMenuItemID(popup, i);
                    if id == u32::MAX || id == 0 {
                        continue;
                    }
                    if let Some(v) = nome_verbo(&menu, (id - 1) as usize) {
                        out.push(v);
                    }
                }
                let _ = DestroyMenu(popup);
                out
            }
        }

        fn crea_collegamento(lnk: &std::path::Path, bersaglio: &std::path::Path) {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
                let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
                let b = larga(&bersaglio.to_string_lossy());
                link.SetPath(PCWSTR(b.as_ptr())).unwrap();
                let file: IPersistFile = link.cast().unwrap();
                let l = larga(&lnk.to_string_lossy());
                file.Save(PCWSTR(l.as_ptr()), true).unwrap();
            }
        }

        #[test]
        fn il_menu_di_un_collegamento_offre_apri_percorso_file() {
            let d = tempfile::tempdir().unwrap();
            let bersaglio = d.path().join("nota.txt");
            std::fs::write(&bersaglio, b"x").unwrap();
            let lnk = d.path().join("nota.lnk");
            crea_collegamento(&lnk, &bersaglio);

            let v = verbi(&lnk.to_string_lossy());
            assert!(v.iter().any(|v| apre_percorso(v)), "verbi trovati: {:?}", v);
        }

        #[test]
        fn il_collegamento_si_risolve_nel_suo_bersaglio() {
            let d = tempfile::tempdir().unwrap();
            let bersaglio = d.path().join("nota.txt");
            std::fs::write(&bersaglio, b"x").unwrap();
            let lnk = d.path().join("nota.lnk");
            crea_collegamento(&lnk, &bersaglio);

            let trovato = bersaglio_collegamento(&lnk.to_string_lossy()).unwrap();
            assert!(trovato.eq_ignore_ascii_case(&bersaglio.to_string_lossy()), "{}", trovato);
            assert_eq!(bersaglio_collegamento(&bersaglio.to_string_lossy()), None);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apri_percorso_porta_alla_cartella_con_la_voce_selezionata() {
        let d = destinazione_di(r"C:\Dati\nota.txt");
        assert_eq!(d.cartella, r"C:\Dati");
        assert_eq!(d.seleziona.as_deref(), Some(r"C:\Dati\nota.txt"));
        assert_eq!(destinazione_di(r"D:\").cartella, r"D:\");
        assert!(apre_percorso("OpenFileLocation"));
        assert!(!apre_percorso("open"));
    }
}

#[cfg(not(windows))]
pub fn modificatori() -> Modificatori {
    Modificatori::default()
}
