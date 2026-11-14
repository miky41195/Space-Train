use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Drive {
    /// Etichetta mostrata in sidebar, es. "Disco locale (C:)"
    pub label: String,
    /// Path radice, es. "C:\\"
    pub path: String,
    /// Bytes free for the current user. Missing if the volume does not
    /// respond (empty reader, disconnected network).
    pub free: Option<u64>,
    pub total: Option<u64>,
    /// "fixed", "removable", "network", "optical", "ram" o "unknown".
    pub kind: String,
}

/// Enumerates the volumes reading the bitmask returned by GetLogicalDrives.
#[cfg(windows)]
pub fn list_drives() -> Vec<Drive> {
    use windows::Win32::Storage::FileSystem::GetLogicalDrives;

    let mask = unsafe { GetLogicalDrives() };
    (0u32..26)
        .filter(|i| mask & (1 << i) != 0)
        .map(|i| {
            let letter = (b'A' + i as u8) as char;
            let path = format!("{}:\\", letter);
            let kind = kind_of(&path);
            let (free, total) = space(&path);
            let name = volume_name(&path).filter(|n| !n.is_empty()).unwrap_or_else(|| {
                match kind.as_str() {
                    "network" => "Unità di rete".to_string(),
                    "removable" => "Unità rimovibile".to_string(),
                    "optical" => "Unità DVD".to_string(),
                    _ => "Disco locale".to_string(),
                }
            });
            Drive {
                label: format!("{} ({}:)", name, letter),
                path,
                free,
                total,
                kind,
            }
        })
        .collect()
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn kind_of(path: &str) -> String {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDriveTypeW;

    let w = wide(path);
    // GetDriveTypeW values: 2 removable, 3 fixed, 4 network, 5 optical, 6 RAM.
    match unsafe { GetDriveTypeW(PCWSTR(w.as_ptr())) } {
        2 => "removable",
        3 => "fixed",
        4 => "network",
        5 => "optical",
        6 => "ram",
        _ => "unknown",
    }
    .to_string()
}

#[cfg(windows)]
fn space(path: &str) -> (Option<u64>, Option<u64>) {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let w = wide(path);
    let mut free = 0u64;
    let mut total = 0u64;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(w.as_ptr()),
            Some(&mut free),
            Some(&mut total),
            None,
        )
    };
    match ok {
        Ok(()) => (Some(free), Some(total)),
        Err(_) => (None, None),
    }
}

#[cfg(windows)]
fn volume_name(path: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetVolumeInformationW;

    let w = wide(path);
    let mut name = [0u16; 261];
    unsafe {
        GetVolumeInformationW(
            PCWSTR(w.as_ptr()),
            Some(&mut name),
            None,
            None,
            None,
            None,
        )
        .ok()?;
    }
    let end = name.iter().position(|c| *c == 0).unwrap_or(name.len());
    Some(String::from_utf16_lossy(&name[..end]))
}

/// The root plus every volume the user would think of as a disk: what is
/// mounted under `/media`, `/run/media` and `/mnt`, and network shares.
/// System mounts (`/proc`, `/sys`, snaps, `/boot`…) stay out.
#[cfg(not(windows))]
pub fn list_drives() -> Vec<Drive> {
    let text = std::fs::read_to_string("/proc/self/mounts").unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    let mut disks: Vec<Drive> = std::iter::once(("/".to_string(), String::new()))
        .chain(user_mounts(&text))
        .filter(|(path, _)| seen.insert(path.clone()))
        .map(|(path, fs)| {
            let kind = if matches!(fs.as_str(), "nfs" | "nfs4" | "cifs" | "smb3" | "fuse.sshfs") {
                "network"
            } else if path.starts_with("/media/") || path.starts_with("/run/media/") {
                "removable"
            } else {
                "fixed"
            };
            let (free, total) = space(&path);
            let label = if path == "/" {
                "File system".to_string()
            } else {
                crate::shell::name_of(&path)
            };
            Drive { label, path, free, total, kind: kind.into() }
        })
        .collect();
    // The root first, the rest in name order.
    disks[1..].sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    disks
}

/// `(mount point, filesystem)` of the user-facing mounts in `/proc/mounts`.
#[cfg(not(windows))]
fn user_mounts(text: &str) -> Vec<(String, String)> {
    text
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let _source = fields.next()?;
            let dot = decode_mount(fields.next()?);
            let fs = fields.next()?.to_string();
            let is_network = matches!(fs.as_str(), "nfs" | "nfs4" | "cifs" | "smb3" | "fuse.sshfs");
            let user_mount = ["/media/", "/run/media/", "/mnt/"]
                .iter()
                .any(|r| dot.starts_with(r));
            (user_mount || is_network).then_some((dot, fs))
        })
        .collect()
}

/// `/proc/mounts` writes spaces and tabs in octal: `\040`, `\011`.
#[cfg(not(windows))]
fn decode_mount(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('\\') {
        out.push_str(&rest[..i]);
        let code = rest.get(i + 1..i + 4).and_then(|c| u8::from_str_radix(c, 8).ok());
        match code {
            Some(b) => {
                out.push(b as char);
                rest = &rest[i + 4..];
            }
            None => {
                out.push('\\');
                rest = &rest[i + 1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Free and total bytes for the user, from `statvfs`.
#[cfg(not(windows))]
fn space(path: &str) -> (Option<u64>, Option<u64>) {
    let Ok(c) = std::ffi::CString::new(path) else {
        return (None, None);
    };
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut s) } != 0 {
        return (None, None);
    }
    let block_size = s.f_frsize as u64;
    (
        Some(s.f_bavail as u64 * block_size),
        Some(s.f_blocks as u64 * block_size),
    )
}

/// The volumes as entries of «Questo PC»: folders that open on the disk.
pub fn as_items() -> Vec<crate::fs::entry::Entry> {
    list_drives()
        .into_iter()
        .map(|d| crate::fs::entry::Entry {
            name: d.label,
            path: d.path,
            kind: crate::fs::entry::EntryKind::Dir,
            size: 0,
            modified: None,
            hidden: false,
            origin: None,
            free: d.free,
            total: d.total,
            // The drive's real icon: USB stick, reader, network drive.
            own_icon: true,
            snippet: None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(windows))]
    #[test]
    fn root_comes_first_with_space() {
        let d = list_drives();
        assert_eq!(d[0].path, "/");
        assert!(d[0].total.unwrap() > 0);
    }

    #[cfg(not(windows))]
    #[test]
    fn keeps_only_user_mounts_and_decodes_spaces() {
        let text = "proc /proc proc rw 0 0\n\
                     /dev/sdb1 /media/anna/Chiavetta\\040USB vfat rw 0 0\n\
                     //nas/foto /home/anna/nas cifs rw 0 0\n\
                     /dev/sda1 /boot ext4 rw 0 0\n";
        assert_eq!(
            user_mounts(text),
            vec![
                ("/media/anna/Chiavetta USB".to_string(), "vfat".to_string()),
                ("/home/anna/nas".to_string(), "cifs".to_string()),
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn finds_at_least_one_volume() {
        let d = list_drives();
        assert!(!d.is_empty(), "a Windows system always has at least C:");
        assert!(d.iter().any(|x| x.path.starts_with("C:")));
    }

    #[cfg(windows)]
    #[test]
    fn the_system_drive_has_space_and_name() {
        let c = list_drives().into_iter().find(|d| d.path == "C:\\").unwrap();
        assert!(c.total.unwrap() > 0);
        assert!(c.free.unwrap() <= c.total.unwrap());
        assert!(c.label.ends_with("(C:)"));
        assert_eq!(c.kind, "fixed");
    }
}
