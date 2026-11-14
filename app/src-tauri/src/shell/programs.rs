//! Installed programs, biggest first, and their official uninstaller.
//!
//! Read from the same registry keys as Settings → Apps. Space Train never
//! removes a program itself: «Disinstalla» starts the program's own
//! uninstaller, which asks its own questions.

use crate::fs::error::FsError;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Program {
    /// Where it is in the registry; the uninstall command is read again from
    /// there, never taken from the frontend.
    pub id: String,
    pub name: String,
    pub publisher: Option<String>,
    pub size: u64,
}

/// Splits an uninstall command line into the program and its arguments:
/// `"C:\x\unins000.exe" /SILENT` or `MsiExec.exe /X{…}`.
pub fn split(line: &str) -> (String, String) {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return (rest[..end].to_string(), rest[end + 1..].trim().to_string());
        }
    }
    match line.to_lowercase().find(".exe") {
        Some(i) => (line[..i + 4].to_string(), line[i + 4..].trim().to_string()),
        None => (line.to_string(), String::new()),
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::collections::HashSet;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const ROOTS: [(winreg::HKEY, &str); 3] = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    fn key(id: &str) -> Option<RegKey> {
        let (root, subkey) = id.split_once(':')?;
        let (hkey, base) = ROOTS.get(root.parse::<usize>().ok()?)?;
        if subkey.contains('\\') {
            return None;
        }
        RegKey::predef(*hkey).open_subkey_with_flags(format!(r"{}\{}", base, subkey), KEY_READ).ok()
    }

    /// The `count` biggest programs installed on `drive` (a root like `C:\`).
    pub fn list(drive: &str, count: usize) -> Vec<Program> {
        let drive = drive.to_lowercase();
        let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()).to_lowercase();
        let mut seen_names = HashSet::new();
        let mut out = Vec::new();
        for (i, (hkey, base)) in ROOTS.iter().enumerate() {
            let Ok(uninstall_key) = RegKey::predef(*hkey).open_subkey_with_flags(base, KEY_READ) else {
                continue;
            };
            for subkey in uninstall_key.enum_keys().flatten() {
                let Ok(k) = uninstall_key.open_subkey_with_flags(&subkey, KEY_READ) else {
                    continue;
                };
                let text = |v: &str| k.get_value::<String, _>(v).ok().filter(|s| !s.trim().is_empty());
                let (Some(name), Some(_)) = (text("DisplayName"), text("UninstallString")) else {
                    continue;
                };
                // Updates and parts of Windows: Settings → Apps hides them too.
                if k.get_value::<u32, _>("SystemComponent").unwrap_or(0) == 1
                    || text("ParentKeyName").is_some()
                    || text("ReleaseType").is_some()
                {
                    continue;
                }
                let location = text("InstallLocation").map(|p| p.trim_matches('"').to_string());
                match &location {
                    Some(p) if !p.to_lowercase().starts_with(&drive) => continue,
                    // Without a location: it is on the Windows drive.
                    None if !drive.starts_with(&system_drive) => continue,
                    _ => {}
                }
                let estimated = k.get_value::<u32, _>("EstimatedSize").unwrap_or(0) as u64 * 1024;
                let size = match &location {
                    Some(p) if estimated == 0 => crate::fs::dir_size::measure(std::path::Path::new(p), &|| false)
                        .map_or(0, |m| m.bytes),
                    _ => estimated,
                };
                if size == 0 || !seen_names.insert(name.to_lowercase()) {
                    continue;
                }
                out.push(Program { id: format!("{}:{}", i, subkey), name, publisher: text("Publisher"), size });
            }
        }
        out.sort_by(|a, b| b.size.cmp(&a.size));
        out.truncate(count);
        out
    }

    /// Starts the official uninstaller of the program `id`.
    pub fn uninstall(id: &str) -> Result<(), FsError> {
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let line: String = key(id)
            .and_then(|k| k.get_value("UninstallString").ok())
            .ok_or(FsError::NotFound)?;
        let (file, args) = split(&line);
        let w = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let (file, args) = (w(&file), w(&args));
        let outcome = unsafe {
            ShellExecuteW(
                None,
                PCWSTR::null(),
                PCWSTR(file.as_ptr()),
                PCWSTR(args.as_ptr()),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        // ShellExecute signals success with a value above 32.
        if outcome.0 as isize <= 32 {
            return Err(FsError::Io { message: "Il programma di disinstallazione non è partito.".into() });
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use windows_impl::{uninstall, list};

/// The program list is Windows only.
#[cfg(not(windows))]
pub fn list(_drive: &str, _count: usize) -> Vec<Program> {
    Vec::new()
}

#[cfg(not(windows))]
pub fn uninstall(_id: &str) -> Result<(), FsError> {
    Err(FsError::NotFound)
}

#[cfg(test)]
mod test {
    use super::split;

    #[test]
    fn splits_uninstall_command_lines() {
        assert_eq!(
            split(r#""C:\Giochi\unins000.exe" /SILENT"#),
            (r"C:\Giochi\unins000.exe".into(), "/SILENT".into())
        );
        assert_eq!(split("MsiExec.exe /X{1234}"), ("MsiExec.exe".into(), "/X{1234}".into()));
        assert_eq!(
            split(r"C:\Program Files\App\uninstall.exe --force"),
            (r"C:\Program Files\App\uninstall.exe".into(), "--force".into())
        );
        assert_eq!(split(r#""C:\a b\x.exe""#), (r"C:\a b\x.exe".into(), String::new()));
    }
}
