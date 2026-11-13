//! Installed programs, biggest first, and their official uninstaller.
//!
//! Read from the same registry keys as Settings → Apps. Space Train never
//! removes a program itself: «Disinstalla» starts the program's own
//! uninstaller, which asks its own questions.

use crate::fs::error::FsError;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Programma {
    /// Where it is in the registry; the uninstall command is read again from
    /// there, never taken from the frontend.
    pub id: String,
    pub name: String,
    pub publisher: Option<String>,
    pub size: u64,
}

/// Splits an uninstall command line into the program and its arguments:
/// `"C:\x\unins000.exe" /SILENT` or `MsiExec.exe /X{…}`.
pub fn dividi(riga: &str) -> (String, String) {
    let riga = riga.trim();
    if let Some(resto) = riga.strip_prefix('"') {
        if let Some(fine) = resto.find('"') {
            return (resto[..fine].to_string(), resto[fine + 1..].trim().to_string());
        }
    }
    match riga.to_lowercase().find(".exe") {
        Some(i) => (riga[..i + 4].to_string(), riga[i + 4..].trim().to_string()),
        None => (riga.to_string(), String::new()),
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::collections::HashSet;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const RADICI: [(winreg::HKEY, &str); 3] = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    fn chiave(id: &str) -> Option<RegKey> {
        let (radice, nome) = id.split_once(':')?;
        let (hkey, base) = RADICI.get(radice.parse::<usize>().ok()?)?;
        if nome.contains('\\') {
            return None;
        }
        RegKey::predef(*hkey).open_subkey_with_flags(format!(r"{}\{}", base, nome), KEY_READ).ok()
    }

    /// The `quanti` biggest programs installed on `disco` (a root like `C:\`).
    pub fn elenca(disco: &str, quanti: usize) -> Vec<Programma> {
        let disco = disco.to_lowercase();
        let sistema = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()).to_lowercase();
        let mut nomi_visti = HashSet::new();
        let mut out = Vec::new();
        for (i, (hkey, base)) in RADICI.iter().enumerate() {
            let Ok(elenco) = RegKey::predef(*hkey).open_subkey_with_flags(base, KEY_READ) else {
                continue;
            };
            for nome in elenco.enum_keys().flatten() {
                let Ok(k) = elenco.open_subkey_with_flags(&nome, KEY_READ) else {
                    continue;
                };
                let testo = |v: &str| k.get_value::<String, _>(v).ok().filter(|s| !s.trim().is_empty());
                let (Some(name), Some(_)) = (testo("DisplayName"), testo("UninstallString")) else {
                    continue;
                };
                // Updates and parts of Windows: Settings → Apps hides them too.
                if k.get_value::<u32, _>("SystemComponent").unwrap_or(0) == 1
                    || testo("ParentKeyName").is_some()
                    || testo("ReleaseType").is_some()
                {
                    continue;
                }
                let posto = testo("InstallLocation").map(|p| p.trim_matches('"').to_string());
                match &posto {
                    Some(p) if !p.to_lowercase().starts_with(&disco) => continue,
                    // Without a location: it is on the Windows drive.
                    None if !disco.starts_with(&sistema) => continue,
                    _ => {}
                }
                let stimata = k.get_value::<u32, _>("EstimatedSize").unwrap_or(0) as u64 * 1024;
                let size = match &posto {
                    Some(p) if stimata == 0 => crate::fs::dimensione::misura(std::path::Path::new(p), &|| false)
                        .map_or(0, |m| m.bytes),
                    _ => stimata,
                };
                if size == 0 || !nomi_visti.insert(name.to_lowercase()) {
                    continue;
                }
                out.push(Programma { id: format!("{}:{}", i, nome), name, publisher: testo("Publisher"), size });
            }
        }
        out.sort_by(|a, b| b.size.cmp(&a.size));
        out.truncate(quanti);
        out
    }

    /// Starts the official uninstaller of the program `id`.
    pub fn disinstalla(id: &str) -> Result<(), FsError> {
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let riga: String = chiave(id)
            .and_then(|k| k.get_value("UninstallString").ok())
            .ok_or(FsError::NotFound)?;
        let (file, argomenti) = dividi(&riga);
        let w = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let (file, argomenti) = (w(&file), w(&argomenti));
        let esito = unsafe {
            ShellExecuteW(
                None,
                PCWSTR::null(),
                PCWSTR(file.as_ptr()),
                PCWSTR(argomenti.as_ptr()),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        // ShellExecute signals success with a value above 32.
        if esito.0 as isize <= 32 {
            return Err(FsError::Io { message: "Il programma di disinstallazione non è partito.".into() });
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use windows_impl::{disinstalla, elenca};

/// The program list is Windows only.
#[cfg(not(windows))]
pub fn elenca(_disco: &str, _quanti: usize) -> Vec<Programma> {
    Vec::new()
}

#[cfg(not(windows))]
pub fn disinstalla(_id: &str) -> Result<(), FsError> {
    Err(FsError::NotFound)
}

#[cfg(test)]
mod test {
    use super::dividi;

    #[test]
    fn splits_uninstall_command_lines() {
        assert_eq!(
            dividi(r#""C:\Giochi\unins000.exe" /SILENT"#),
            (r"C:\Giochi\unins000.exe".into(), "/SILENT".into())
        );
        assert_eq!(dividi("MsiExec.exe /X{1234}"), ("MsiExec.exe".into(), "/X{1234}".into()));
        assert_eq!(
            dividi(r"C:\Program Files\App\uninstall.exe --force"),
            (r"C:\Program Files\App\uninstall.exe".into(), "--force".into())
        );
        assert_eq!(dividi(r#""C:\a b\x.exe""#), (r"C:\a b\x.exe".into(), String::new()));
    }
}
