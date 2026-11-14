//! Files that arrive from another PC: where they come from and what the
//! antivirus thinks of them.
//!
//! Everything that arrives from the network (lan or friends) is treated as a
//! download from the internet, as browsers and mail programs do:
//! - it goes through Windows Attachment Services (`IAttachmentExecute::Save`),
//!   which has the installed antivirus scan it. It is the intended path for
//!   programs that receive files: a dangerous file is stopped like a
//!   received attachment, and does not look like something Space Train
//!   produced by itself;
//! - it gets the «Mark of the Web» (`Zone.Identifier`, Internet zone): when
//!   it is opened Windows checks it with SmartScreen and, if it is a program,
//!   asks for confirmation before starting it.
//!
//! If the antivirus blocks a file, that file is missing on arrival and the others
//! arrive anyway: a false positive does not break the whole transfer.

use super::paths;
use std::io;
use std::path::Path;

/// ERROR_VIRUS_INFECTED: the antivirus prevented opening or writing the file.
const ERROR_VIRUS_INFECTED: i32 = 225;
/// ERROR_VIRUS_DELETED: the antivirus prevented the operation and removed the file.
const ERROR_VIRUS_DELETED: i32 = 226;

/// The error comes from the antivirus, not from the disk or the network.
pub fn is_virus(e: &io::Error) -> bool {
    matches!(e.raw_os_error(), Some(ERROR_VIRUS_INFECTED | ERROR_VIRUS_DELETED))
}

/// Extensions Windows runs on double click: programs, scripts, installers,
/// shortcuts.
const PROGRAMS: &[&str] = &[
    "exe", "com", "scr", "pif", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi",
    "msp", "msix", "msixbundle", "appx", "appxbundle", "appinstaller", "hta", "cpl", "lnk", "reg", "jar",
    "application", "scf", "url",
    // Less obvious, but they run code or mount it: compiled help, consoles,
    // components and macros, panels, disk images, troubleshooting packages.
    "chm", "msc", "gadget", "inf", "ins", "isp", "mst", "ws", "wsc", "sct", "psc1", "ps1xml", "psd1",
    "xll", "xlam", "ppam", "appref-ms", "settingcontent-ms", "library-ms", "search-ms", "searchconnector-ms",
    "website", "xbap", "diagcab", "iso", "img", "vhd", "vhdx", "mde", "ade", "adp", "accde",
];

/// The name's extension, without the trailing dots and spaces Windows
/// ignores («a.exe.» opens as «a.exe»).
fn extension(name: &str) -> Option<&str> {
    let name = name.trim_end_matches(['.', ' ', '\\', '/']);
    let last = name.rsplit(['\\', '/']).next().unwrap_or(name);
    last.rsplit_once('.').map(|(_, ext)| ext)
}

/// The name is of a file that, when opened, runs code.
pub fn is_program(name: &str) -> bool {
    extension(name).is_some_and(|ext| PROGRAMS.iter().any(|p| p.eq_ignore_ascii_case(ext)))
}

/// Among the files downloaded to «apri» from another PC, the one to open.
///
/// It is the sharing PC that says what arrives, so checking the requested
/// name is not enough: a single file must arrive, with the same extension as
/// the requested one, and it must not be a program. Otherwise asking for
/// «foto.jpg» could open «foto.jpg.lnk».
pub fn file_to_open(requested: &str, pairs: &[[String; 2]]) -> Result<String, crate::fs::error::FsError> {
    let refusal = || crate::fs::error::FsError::Io {
        message: "Il PC che condivide ha mandato un file diverso da quello chiesto: non si apre.".into(),
    };
    let [[_, local]] = pairs else {
        return Err(if pairs.is_empty() { crate::fs::error::FsError::NotFound } else { refusal() });
    };
    let same = match (extension(requested), extension(local)) {
        (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
        (None, None) => true,
        _ => false,
    };
    if !same || is_program(local) {
        return Err(refusal());
    }
    Ok(local.clone())
}

/// How the examination of a file just received went.
#[derive(Debug, PartialEq, Eq)]
pub enum Scan {
    Clean,
    /// The antivirus or the Windows policies removed it.
    Blocked,
}

/// Examines a file just received and marks it as coming from the internet.
pub fn scan(path: &Path) -> Scan {
    #[cfg(windows)]
    let _ = pass_through_antivirus(path);
    if !paths::extended(path).exists() {
        return Scan::Blocked;
    }
    let _ = mark_internet(path);
    Scan::Clean
}

/// Writes the «Mark of the Web»: Internet zone.
///
/// Attachment Services already writes it; it is written again to always have the
/// same zone, even where the service is missing or could not do it.
/// Only NTFS has alternate streams: elsewhere `file:Zone.Identifier` would
/// be a stray new file next to the real one, so nothing is written.
#[cfg(not(windows))]
pub fn mark_internet(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(windows)]
pub fn mark_internet(path: &Path) -> io::Result<()> {
    let mut ads = paths::extended(path).into_os_string();
    ads.push(":Zone.Identifier");
    std::fs::write(ads, "[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=about:internet\r\n")
}

/// Space Train for Attachment Services: it remembers the choices made for its files.
#[cfg(windows)]
const CLIENT: windows::core::GUID = windows::core::GUID::from_u128(0x5b0c8f1e_7a4d_4c2e_9f3a_2d6e8b1c4a70);

#[cfg(windows)]
fn pass_through_antivirus(path: &Path) -> windows::core::Result<()> {
    use windows::core::HSTRING;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{AttachmentServices, IAttachmentExecute};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let a: IAttachmentExecute = CoCreateInstance(&AttachmentServices, None, CLSCTX_INPROC_SERVER)?;
        a.SetClientGuid(&CLIENT)?;
        a.SetClientTitle(&HSTRING::from("Space Train"))?;
        a.SetLocalPath(&HSTRING::from(paths::display(path)))?;
        a.SetSource(&HSTRING::from("about:internet"))?;
        a.Save()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn recognises_antivirus_errors() {
        assert!(is_virus(&io::Error::from_raw_os_error(225)));
        assert!(is_virus(&io::Error::from_raw_os_error(226)));
        assert!(!is_virus(&io::Error::from_raw_os_error(5)));
        assert!(!is_virus(&io::Error::other("rete")));
    }

    #[test]
    fn recognises_programs() {
        assert!(is_program("setup.exe"));
        assert!(is_program("Avvia.BAT"));
        assert!(is_program(r"::amici\X\cartella\script.ps1"));
        // Windows ignores trailing dots and spaces: «a.exe.» opens as «a.exe».
        assert!(is_program("trucco.exe. "));
        assert!(!is_program("foto.png"));
        assert!(!is_program("leggimi"));
        assert!(!is_program("exe"));
        // Also compiled help, consoles, disk images, Office components.
        for name in ["aiuto.chm", "a.msc", "disco.iso", "disco.vhdx", "macro.xll", "x.settingcontent-ms", "x.diagcab"] {
            assert!(is_program(name), "{name}");
        }
    }

    #[test]
    fn only_the_requested_file_opens() {
        let pair = |a: &str, b: &str| [a.to_string(), b.to_string()];
        let requested = r"::lan\PC\foto.jpg";
        // The good case: one file, same extension (even with the free name).
        assert_eq!(
            file_to_open(requested, &[pair(requested, r"C:\T\foto (2).jpg")]).unwrap(),
            r"C:\T\foto (2).jpg"
        );
        // The sharer sends another type of file, or several files, or nothing.
        assert!(file_to_open(requested, &[pair(requested, r"C:\T\foto.jpg.lnk")]).is_err());
        assert!(file_to_open(requested, &[pair(requested, r"C:\T\foto.exe")]).is_err());
        assert!(file_to_open(requested, &[pair(requested, r"C:\T\foto.jpg"), pair(requested, r"C:\T\x.jpg")]).is_err());
        assert!(file_to_open(requested, &[]).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn a_received_file_stays_and_is_marked_from_internet() {
        let d = tempdir().unwrap();
        let f = d.path().join("nota.txt");
        std::fs::write(&f, "ciao").unwrap();
        assert_eq!(scan(&f), Scan::Clean);
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "ciao");
        let mut ads = f.clone().into_os_string();
        ads.push(":Zone.Identifier");
        assert!(std::fs::read_to_string(ads).unwrap().contains("ZoneId=3"));
    }

    #[test]
    fn a_vanished_file_counts_as_blocked() {
        let d = tempdir().unwrap();
        let f = d.path().join("tolto.exe");
        assert_eq!(scan(&f), Scan::Blocked);
        // Marking it must not recreate it empty.
        assert!(!f.exists());
    }
}
