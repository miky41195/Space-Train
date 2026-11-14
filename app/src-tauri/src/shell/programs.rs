//! Installed programs, biggest first, and their official uninstaller.
//!
//! Read from the same registry keys as Settings → Apps. Space Train never
//! removes a working program itself: «Disinstalla» starts the program's own
//! uninstaller, which asks its own questions. Only a program whose
//! uninstaller is gone can have its leftovers removed here.

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
    /// Its uninstaller is no longer on disk: deleted by hand or half
    /// uninstalled. Only its leftovers can go.
    pub gone: bool,
}

/// An installed program as far as the leftover search cares: a folder that
/// matches one of these belongs to something still installed.
#[derive(Debug, Clone, Default)]
pub struct Owner {
    pub name: String,
    pub publisher: String,
    /// Install folder and the folders of its uninstaller and icon.
    pub paths: Vec<String>,
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

/// Words of a name, lowercase: `BlueStacks_nxt` → `bluestacks`, `nxt`.
fn words(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .collect()
}

fn letters(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
}

/// Lowercase, no quotes, no trailing separator: paths compare as text.
fn norm(p: &str) -> String {
    p.trim_matches('"').trim_end_matches(['\\', '/']).to_lowercase()
}

/// `inner` is strictly inside `outer` (both normalized).
fn inside(inner: &str, outer: &str) -> bool {
    inner.len() > outer.len() && inner.starts_with(outer) && inner[outer.len()..].starts_with(['\\', '/'])
}

/// Whether the folder `path` (named `name`) belongs to an installed program:
/// one of its paths is in it, or the name matches its name or publisher.
pub fn owned(name: &str, path: &str, owners: &[Owner]) -> bool {
    let folder = norm(path);
    let first = words(name).into_iter().next().unwrap_or_default();
    let all = letters(name);
    owners.iter().any(|o| {
        let by_path = o.paths.iter().map(|p| norm(p)).any(|p| p == folder || inside(&p, &folder) || inside(&folder, &p));
        let by_name = [&o.name, &o.publisher].iter().any(|n| {
            let l = letters(n);
            (!all.is_empty() && l == all)
                || (first.len() >= 3 && words(n).contains(&first))
                || (all.len() >= 3 && l.contains(&all))
                || (l.len() >= 4 && all.contains(&l))
        });
        by_path || by_name
    })
}

/// Whether a folder may go as a leftover. Inside one of the `containers`
/// (Program Files, ProgramData, AppData) any subfolder can; elsewhere only a
/// folder at least two levels deep and outside the `forbidden` ones
/// (Windows, the user folders). Never a container itself, nor a folder
/// holding another installed program (`others`).
pub fn safe_leftover(path: &str, containers: &[String], forbidden: &[String], others: &[String]) -> bool {
    let p = norm(path);
    let roots: Vec<String> = containers.iter().chain(forbidden).map(|r| norm(r)).collect();
    if p.is_empty() || roots.iter().any(|r| *r == p || inside(r, &p)) {
        return false;
    }
    let in_container = containers.iter().any(|c| inside(&p, &norm(c)));
    if !in_container {
        let depth = p.split(['\\', '/']).filter(|x| !x.is_empty()).count();
        if depth < 3 || forbidden.iter().any(|f| inside(&p, &norm(f))) {
            return false;
        }
    }
    !others.iter().any(|o| inside(&norm(o), &p))
}

/// A PowerShell single-quoted string.
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// PowerShell that sends folders to the Recycle Bin, stopping at the first error.
pub fn recycle_script(folders: &[String]) -> String {
    let list = folders.iter().map(|f| ps_quote(f)).collect::<Vec<_>>().join(",");
    format!(
        "$ErrorActionPreference='Stop'\nAdd-Type -AssemblyName Microsoft.VisualBasic\nforeach($p in @({})) {{ if (Test-Path -LiteralPath $p) {{ [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }} }}\n",
        list
    )
}

/// Runs a PowerShell script with no window and waits for it; `admin` asks
/// Windows for administrator rights first (the UAC prompt).
#[cfg(windows)]
pub fn powershell(script: &str, admin: bool) -> Result<(), FsError> {
    use base64::Engine;
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;
    let utf16: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let encoded = base64::engine::general_purpose::STANDARD.encode(utf16);
    let mut command = std::process::Command::new("powershell");
    command.args(["-NoProfile", "-NonInteractive"]).creation_flags(NO_WINDOW);
    if admin {
        command.args([
            "-Command",
            &format!(
                "try {{ $p = Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','{}'; exit $p.ExitCode }} catch {{ exit 1223 }}",
                encoded
            ),
        ]);
    } else {
        command.args(["-EncodedCommand", &encoded]);
    }
    let status = command.status().map_err(|e| FsError::Io { message: e.to_string() })?;
    match status.code() {
        Some(0) => Ok(()),
        // ERROR_CANCELLED: the UAC prompt was refused.
        Some(1223) => Err(FsError::Io { message: "Serve il permesso di amministratore: richiesta annullata.".into() }),
        _ => Err(FsError::Io { message: "Non è stato possibile togliere tutto: qualche file è in uso o protetto.".into() }),
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::collections::HashSet;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const ROOTS: [(winreg::HKEY, &str, &str); 3] = [
        (HKEY_LOCAL_MACHINE, "HKEY_LOCAL_MACHINE", r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, "HKEY_LOCAL_MACHINE", r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, "HKEY_CURRENT_USER", r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    fn parse_id(id: &str) -> Option<(usize, &str)> {
        let (root, subkey) = id.split_once(':')?;
        let root = root.parse::<usize>().ok().filter(|r| *r < ROOTS.len())?;
        (!subkey.contains('\\') && !subkey.is_empty()).then_some((root, subkey))
    }

    fn key(id: &str) -> Option<RegKey> {
        let (root, subkey) = parse_id(id)?;
        let (hkey, _, base) = ROOTS[root];
        RegKey::predef(hkey).open_subkey_with_flags(format!(r"{}\{}", base, subkey), KEY_READ).ok()
    }

    /// The uninstaller named by the command line is no longer on disk.
    fn is_gone(uninstaller: &str) -> bool {
        let (file, _) = split(uninstaller);
        let file = std::path::Path::new(&file);
        file.is_absolute() && !file.exists()
    }

    /// The `count` biggest programs installed on `drive` (a root like `C:\`),
    /// plus every broken one: those cannot be removed any other way.
    pub fn list(drive: &str, count: usize) -> Vec<Program> {
        let drive = drive.to_lowercase();
        let system_drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()).to_lowercase();
        let mut seen_names = HashSet::new();
        let mut out = Vec::new();
        for (i, (hkey, _, base)) in ROOTS.iter().enumerate() {
            let Ok(uninstall_key) = RegKey::predef(*hkey).open_subkey_with_flags(base, KEY_READ) else {
                continue;
            };
            for subkey in uninstall_key.enum_keys().flatten() {
                let Ok(k) = uninstall_key.open_subkey_with_flags(&subkey, KEY_READ) else {
                    continue;
                };
                let text = |v: &str| k.get_value::<String, _>(v).ok().filter(|s| !s.trim().is_empty());
                let (Some(name), Some(uninstaller)) = (text("DisplayName"), text("UninstallString")) else {
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
                let gone = is_gone(&uninstaller);
                if (size == 0 && !gone) || !seen_names.insert(name.to_lowercase()) {
                    continue;
                }
                out.push(Program { id: format!("{}:{}", i, subkey), name, publisher: text("Publisher"), size, gone });
            }
        }
        out.sort_by(|a, b| b.size.cmp(&a.size));
        let mut kept = 0;
        out.retain(|p| {
            kept += usize::from(!p.gone);
            p.gone || kept <= count
        });
        out
    }

    /// Every registered program, parts of Windows included.
    pub fn owners() -> Vec<Owner> {
        let mut out = Vec::new();
        for (hkey, _, base) in ROOTS.iter() {
            let Ok(uninstall_key) = RegKey::predef(*hkey).open_subkey_with_flags(base, KEY_READ) else {
                continue;
            };
            for subkey in uninstall_key.enum_keys().flatten() {
                let Ok(k) = uninstall_key.open_subkey_with_flags(&subkey, KEY_READ) else {
                    continue;
                };
                let text = |v: &str| k.get_value::<String, _>(v).unwrap_or_default();
                if text("DisplayName").is_empty() {
                    continue;
                }
                let folder = |p: String| crate::fs::paths::parent_of(&p).unwrap_or(p);
                let paths = [
                    text("InstallLocation").trim_matches('"').to_string(),
                    folder(split(&text("UninstallString")).0),
                    // `C:\x\app.exe,0`: the icon index goes.
                    folder(text("DisplayIcon").split(',').next().unwrap_or("").trim_matches('"').to_string()),
                ]
                .into_iter()
                .filter(|p| std::path::Path::new(p).is_absolute())
                .collect();
                out.push(Owner { name: text("DisplayName"), publisher: text("Publisher"), paths });
            }
        }
        out
    }

    fn env(names: &[&str]) -> Vec<String> {
        names.iter().filter_map(|n| std::env::var(n).ok()).filter(|v| !v.is_empty()).collect()
    }

    /// Where programs keep their files: leftovers are looked for in the first three.
    pub fn containers() -> Vec<String> {
        env(&["ProgramFiles", "ProgramFiles(x86)", "ProgramData", "LOCALAPPDATA", "APPDATA"])
    }

    /// Windows and the user folders.
    pub fn forbidden() -> Vec<String> {
        let mut v = env(&["SystemRoot", "USERPROFILE", "PUBLIC"]);
        if let Ok(d) = std::env::var("SystemDrive") {
            v.push(format!(r"{}\Users", d));
        }
        v
    }

    /// For a broken program: its install folder to the Recycle Bin and its
    /// entry out of the list of installed programs.
    pub fn remove_leftovers(id: &str) -> Result<(), FsError> {
        let (root, subkey) = parse_id(id).ok_or(FsError::NotFound)?;
        let k = key(id).ok_or(FsError::NotFound)?;
        let uninstaller: String = k.get_value("UninstallString").unwrap_or_default();
        // A program whose uninstaller is there goes through its uninstaller, never here.
        if !is_gone(&uninstaller) {
            return Err(FsError::Io { message: "Il programma è ancora installato: usa «Disinstalla».".into() });
        }
        let location = k.get_value::<String, _>("InstallLocation").unwrap_or_default().trim_matches('"').to_string();
        drop(k);
        let own = norm(&location);
        let others: Vec<String> = owners()
            .into_iter()
            .flat_map(|o| o.paths)
            .filter(|p| own.is_empty() || (norm(p) != own && !inside(&norm(p), &own)))
            .collect();
        let mut script = String::from("$ErrorActionPreference='Stop'\n");
        if !location.is_empty()
            && std::path::Path::new(&location).is_dir()
            && safe_leftover(&location, &containers(), &forbidden(), &others)
        {
            script = recycle_script(&[location]);
        }
        let (_, hive, base) = ROOTS[root];
        script.push_str(&format!(
            "Remove-Item -LiteralPath {} -Recurse\n",
            ps_quote(&format!(r"Registry::{}\{}\{}", hive, base, subkey))
        ));
        // The machine-wide list needs administrator rights, the user's own does not.
        powershell(&script, root < 2)
    }

    /// Leftover folders found by disk cleanup to the Recycle Bin, as
    /// administrator. Each one is checked again here: directly below Program
    /// Files or ProgramData and belonging to no installed program.
    pub fn recycle_leftovers(paths: &[String]) -> Result<(), FsError> {
        let roots: Vec<String> = containers().into_iter().take(3).map(|r| norm(&r)).collect();
        let owners = owners();
        for p in paths {
            let path = std::path::Path::new(p);
            let parent = path.parent().map(|x| norm(&x.to_string_lossy())).unwrap_or_default();
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            if !roots.contains(&parent) || name.is_empty() || owned(&name, p, &owners) {
                return Err(FsError::Io { message: format!("«{}» non è un resto di programma.", p) });
            }
        }
        powershell(&recycle_script(paths), true)
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
pub use windows_impl::{containers, forbidden, list, owners, recycle_leftovers, remove_leftovers, uninstall};

/// The program list is Windows only.
#[cfg(not(windows))]
pub fn list(_drive: &str, _count: usize) -> Vec<Program> {
    Vec::new()
}

#[cfg(not(windows))]
pub fn uninstall(_id: &str) -> Result<(), FsError> {
    Err(FsError::NotFound)
}

#[cfg(not(windows))]
pub fn remove_leftovers(_id: &str) -> Result<(), FsError> {
    Err(FsError::NotFound)
}

#[cfg(not(windows))]
pub fn recycle_leftovers(_paths: &[String]) -> Result<(), FsError> {
    Err(FsError::NotFound)
}

#[cfg(test)]
mod test {
    use super::*;

    fn owner(name: &str, publisher: &str, paths: &[&str]) -> Owner {
        Owner { name: name.into(), publisher: publisher.into(), paths: paths.iter().map(|p| p.to_string()).collect() }
    }

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

    #[test]
    fn a_folder_belongs_to_a_program_by_name_publisher_or_path() {
        let installed = [
            owner("BlueStacks 5", "now.gg, Inc.", &[]),
            owner("Mozilla Firefox (x64 it)", "Mozilla", &[r"C:\Program Files\Mozilla Firefox"]),
            owner("WinRAR 6.24 (64-bit)", "win.rar GmbH", &[]),
            owner("Tool", "Acme", &[r"C:\ProgramData\XyzData\bin"]),
        ];
        assert!(owned("BlueStacks_nxt", r"C:\ProgramData\BlueStacks_nxt", &installed));
        assert!(owned("Mozilla Maintenance Service", r"C:\Program Files (x86)\Mozilla Maintenance Service", &installed));
        assert!(owned("WinRAR", r"C:\Program Files\WinRAR", &installed));
        assert!(owned("XyzData", r"C:\ProgramData\XyzData", &installed));
        // Short names count only when they are the whole name.
        assert!(owned("EA", r"C:\Program Files\EA", &[owner("EA", "", &[])]));
        assert!(!owned("EA", r"C:\Program Files\EA", &[owner("Real Player", "", &[])]));
        // Uninstalled: nothing registered carries its name any more.
        assert!(!owned("BlueStacks_nxt", r"C:\ProgramData\BlueStacks_nxt", &installed[1..]));
        assert!(!owned("OldGame", r"C:\Program Files\OldGame", &installed));
    }

    #[test]
    fn leftovers_never_reach_system_folders_or_other_programs() {
        let containers = [r"C:\Program Files".to_string(), r"C:\ProgramData".to_string()];
        let forbidden = [r"C:\Windows".to_string(), r"C:\Users".to_string()];
        let others = [r"C:\Program Files\Suite\Other".to_string()];
        let safe = |p: &str| safe_leftover(p, &containers, &forbidden, &others);
        assert!(safe(r"C:\Program Files\BlueStacks_nxt"));
        assert!(safe(r"C:\ProgramData\BlueStacks_nxt\"));
        assert!(safe(r"D:\Giochi\Vecchio"));
        assert!(!safe(r"C:\Program Files"));
        assert!(!safe(r"C:\"));
        assert!(!safe(r"D:\Giochi"));
        assert!(!safe(r"C:\Windows\System32"));
        assert!(!safe(r"C:\Users\Someone\Documents"));
        assert!(!safe(r"C:\Program Files\Suite"));
        assert!(!safe(""));
    }

    #[test]
    fn the_recycle_script_quotes_paths() {
        let s = recycle_script(&[r"C:\Program Files\Dell'App".to_string()]);
        assert!(s.contains(r"'C:\Program Files\Dell''App'"));
        assert!(s.contains("SendToRecycleBin"));
    }
}
