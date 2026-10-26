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

#[cfg(not(windows))]
pub fn list_drives() -> Vec<Drive> {
    vec![Drive {
        label: "/".into(),
        path: "/".into(),
        libero: None,
        totale: None,
        tipo: "fisso".into(),
    }]
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
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trova_almeno_un_volume() {
        let d = list_drives();
        assert!(!d.is_empty(), "un sistema Windows ha sempre almeno C:");
        assert!(d.iter().any(|x| x.path.starts_with("C:")));
    }

    #[test]
    fn il_disco_di_sistema_ha_spazio_e_nome() {
        let c = list_drives().into_iter().find(|d| d.path == "C:\\").unwrap();
        assert!(c.totale.unwrap() > 0);
        assert!(c.libero.unwrap() <= c.totale.unwrap());
        assert!(c.label.ends_with("(C:)"));
        assert_eq!(c.tipo, "fisso");
    }
}
