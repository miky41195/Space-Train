use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Drive {
    /// Etichetta mostrata in sidebar, es. "Disco locale (C:)"
    pub label: String,
    /// Path radice, es. "C:\\"
    pub path: String,
    /// Byte liberi per l'utente corrente. Assente se il volume non risponde
    /// (lettore vuoto, rete scollegata).
    pub libero: Option<u64>,
    pub totale: Option<u64>,
    /// "fisso", "rimovibile", "rete", "ottico", "ram" o "sconosciuto".
    pub tipo: String,
}

/// Enumera i volumi leggendo la bitmask restituita da GetLogicalDrives.
#[cfg(windows)]
pub fn list_drives() -> Vec<Drive> {
    use windows::Win32::Storage::FileSystem::GetLogicalDrives;

    let mask = unsafe { GetLogicalDrives() };
    (0u32..26)
        .filter(|i| mask & (1 << i) != 0)
        .map(|i| {
            let lettera = (b'A' + i as u8) as char;
            let path = format!("{}:\\", lettera);
            let tipo = tipo_di(&path);
            let (libero, totale) = spazio(&path);
            let nome = nome_volume(&path).filter(|n| !n.is_empty()).unwrap_or_else(|| {
                match tipo.as_str() {
                    "rete" => "Unità di rete".to_string(),
                    "rimovibile" => "Unità rimovibile".to_string(),
                    "ottico" => "Unità DVD".to_string(),
                    _ => "Disco locale".to_string(),
                }
            });
            Drive {
                label: format!("{} ({}:)", nome, lettera),
                path,
                libero,
                totale,
                tipo,
            }
        })
        .collect()
}

#[cfg(windows)]
fn larga(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn tipo_di(path: &str) -> String {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDriveTypeW;

    let w = larga(path);
    // Valori di GetDriveTypeW: 2 rimovibile, 3 fisso, 4 rete, 5 ottico, 6 RAM.
    match unsafe { GetDriveTypeW(PCWSTR(w.as_ptr())) } {
        2 => "rimovibile",
        3 => "fisso",
        4 => "rete",
        5 => "ottico",
        6 => "ram",
        _ => "sconosciuto",
    }
    .to_string()
}

#[cfg(windows)]
fn spazio(path: &str) -> (Option<u64>, Option<u64>) {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let w = larga(path);
    let mut libero = 0u64;
    let mut totale = 0u64;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            PCWSTR(w.as_ptr()),
            Some(&mut libero),
            Some(&mut totale),
            None,
        )
    };
    match ok {
        Ok(()) => (Some(libero), Some(totale)),
        Err(_) => (None, None),
    }
}

#[cfg(windows)]
fn nome_volume(path: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::GetVolumeInformationW;

    let w = larga(path);
    let mut nome = [0u16; 261];
    unsafe {
        GetVolumeInformationW(
            PCWSTR(w.as_ptr()),
            Some(&mut nome),
            None,
            None,
            None,
            None,
        )
        .ok()?;
    }
    let fine = nome.iter().position(|c| *c == 0).unwrap_or(nome.len());
    Some(String::from_utf16_lossy(&nome[..fine]))
}

/// The root plus every volume the user would think of as a disk: what is
/// mounted under `/media`, `/run/media` and `/mnt`, and network shares.
/// System mounts (`/proc`, `/sys`, snaps, `/boot`…) stay out.
#[cfg(not(windows))]
pub fn list_drives() -> Vec<Drive> {
    let testo = std::fs::read_to_string("/proc/self/mounts").unwrap_or_default();
    let mut visti = std::collections::HashSet::new();
    let mut dischi: Vec<Drive> = std::iter::once(("/".to_string(), String::new()))
        .chain(montaggi_utente(&testo))
        .filter(|(path, _)| visti.insert(path.clone()))
        .map(|(path, fs)| {
            let tipo = if matches!(fs.as_str(), "nfs" | "nfs4" | "cifs" | "smb3" | "fuse.sshfs") {
                "rete"
            } else if path.starts_with("/media/") || path.starts_with("/run/media/") {
                "rimovibile"
            } else {
                "fisso"
            };
            let (libero, totale) = spazio(&path);
            let label = if path == "/" {
                "File system".to_string()
            } else {
                crate::shell::nome_di(&path)
            };
            Drive { label, path, libero, totale, tipo: tipo.into() }
        })
        .collect();
    // The root first, the rest in name order.
    dischi[1..].sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
    dischi
}

/// `(mount point, filesystem)` of the user-facing mounts in `/proc/mounts`.
#[cfg(not(windows))]
fn montaggi_utente(testo: &str) -> Vec<(String, String)> {
    testo
        .lines()
        .filter_map(|riga| {
            let mut campi = riga.split_whitespace();
            let _sorgente = campi.next()?;
            let punto = decodifica_mount(campi.next()?);
            let fs = campi.next()?.to_string();
            let di_rete = matches!(fs.as_str(), "nfs" | "nfs4" | "cifs" | "smb3" | "fuse.sshfs");
            let dell_utente = ["/media/", "/run/media/", "/mnt/"]
                .iter()
                .any(|r| punto.starts_with(r));
            (dell_utente || di_rete).then_some((punto, fs))
        })
        .collect()
}

/// `/proc/mounts` writes spaces and tabs in octal: `\040`, `\011`.
#[cfg(not(windows))]
fn decodifica_mount(s: &str) -> String {
    let mut out = String::new();
    let mut resto = s;
    while let Some(i) = resto.find('\\') {
        out.push_str(&resto[..i]);
        let codice = resto.get(i + 1..i + 4).and_then(|c| u8::from_str_radix(c, 8).ok());
        match codice {
            Some(b) => {
                out.push(b as char);
                resto = &resto[i + 4..];
            }
            None => {
                out.push('\\');
                resto = &resto[i + 1..];
            }
        }
    }
    out.push_str(resto);
    out
}

/// Free and total bytes for the user, from `statvfs`.
#[cfg(not(windows))]
fn spazio(path: &str) -> (Option<u64>, Option<u64>) {
    let Ok(c) = std::ffi::CString::new(path) else {
        return (None, None);
    };
    let mut s: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut s) } != 0 {
        return (None, None);
    }
    let blocco = s.f_frsize as u64;
    (
        Some(s.f_bavail as u64 * blocco),
        Some(s.f_blocks as u64 * blocco),
    )
}

/// I volumi come voci di «Questo PC»: cartelle che si aprono sul disco.
pub fn come_voci() -> Vec<crate::fs::entry::Entry> {
    list_drives()
        .into_iter()
        .map(|d| crate::fs::entry::Entry {
            name: d.label,
            path: d.path,
            kind: crate::fs::entry::EntryKind::Dir,
            size: 0,
            modified: None,
            hidden: false,
            origine: None,
            libero: d.libero,
            totale: d.totale,
            // L'icona vera del disco: chiavetta, lettore, unità di rete.
            icona_propria: true,
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
        assert!(d[0].totale.unwrap() > 0);
    }

    #[cfg(not(windows))]
    #[test]
    fn keeps_only_user_mounts_and_decodes_spaces() {
        let testo = "proc /proc proc rw 0 0\n\
                     /dev/sdb1 /media/anna/Chiavetta\\040USB vfat rw 0 0\n\
                     //nas/foto /home/anna/nas cifs rw 0 0\n\
                     /dev/sda1 /boot ext4 rw 0 0\n";
        assert_eq!(
            montaggi_utente(testo),
            vec![
                ("/media/anna/Chiavetta USB".to_string(), "vfat".to_string()),
                ("/home/anna/nas".to_string(), "cifs".to_string()),
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn trova_almeno_un_volume() {
        let d = list_drives();
        assert!(!d.is_empty(), "un sistema Windows ha sempre almeno C:");
        assert!(d.iter().any(|x| x.path.starts_with("C:")));
    }

    #[cfg(windows)]
    #[test]
    fn il_disco_di_sistema_ha_spazio_e_nome() {
        let c = list_drives().into_iter().find(|d| d.path == "C:\\").unwrap();
        assert!(c.totale.unwrap() > 0);
        assert!(c.libero.unwrap() <= c.totale.unwrap());
        assert!(c.label.ends_with("(C:)"));
        assert_eq!(c.tipo, "fisso");
    }
}
