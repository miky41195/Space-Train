use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnownFolder {
    pub label: String,
    pub path: String,
    /// Key for the frontend's icon map.
    pub icon: String,
}

/// The user's known folders. Derived from the environment variables instead
/// of SHGetKnownFolderPath: no COM dependency, same result in the cases we
/// care about. Entries that do not exist are dropped.
pub fn list_known_folders() -> Vec<KnownFolder> {
    let Some(home) = crate::fs::paths::home() else {
        return Vec::new();
    };
    #[cfg(not(windows))]
    let xdg = xdg_folders(&home);

    [
        ("Home", "", "home", ""),
        ("Desktop", "Desktop", "desktop", "XDG_DESKTOP_DIR"),
        ("Documenti", "Documents", "documents", "XDG_DOCUMENTS_DIR"),
        ("Download", "Downloads", "downloads", "XDG_DOWNLOAD_DIR"),
        ("Immagini", "Pictures", "pictures", "XDG_PICTURES_DIR"),
        ("Musica", "Music", "music", "XDG_MUSIC_DIR"),
        ("Video", "Videos", "videos", "XDG_VIDEOS_DIR"),
    ]
    .iter()
    .map(|(label, sub, icon, _key)| {
        #[cfg(not(windows))]
        let path = if sub.is_empty() {
            home.clone()
        } else {
            xdg.get(*_key)
                .cloned()
                .unwrap_or_else(|| format!("{}/{}", home, sub))
        };
        #[cfg(windows)]
        let path = if sub.is_empty() {
            home.clone()
        } else {
            format!("{}\\{}", home, sub)
        };
        KnownFolder {
            label: label.to_string(),
            path,
            icon: icon.to_string(),
        }
    })
    .filter(|k| std::path::Path::new(&k.path).exists())
    .collect()
}

/// The user folders as the desktop names them (`~/.config/user-dirs.dirs`):
/// on an Italian system Desktop is «Scrivania», Pictures «Immagini».
#[cfg(not(windows))]
fn xdg_folders(home: &str) -> std::collections::HashMap<String, String> {
    let config = std::env::var("XDG_CONFIG_HOME")
        .ok()
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| format!("{}/.config", home));
    let text = std::fs::read_to_string(format!("{}/user-dirs.dirs", config)).unwrap_or_default();
    read_user_dirs(&text, home)
}

#[cfg(not(windows))]
fn read_user_dirs(text: &str, home: &str) -> std::collections::HashMap<String, String> {
    text
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            let value = value.trim().trim_matches('"').replace("$HOME", home);
            // A folder set to the home itself means "disabled".
            let clean = value.trim_end_matches('/');
            if clean.is_empty() || clean == home.trim_end_matches('/') {
                return None;
            }
            Some((key.trim().to_string(), clean.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(windows))]
    #[test]
    fn reads_localized_user_dirs() {
        let text = "# comment\nXDG_DESKTOP_DIR=\"$HOME/Scrivania\"\nXDG_MUSIC_DIR=\"$HOME/\"\n";
        let m = read_user_dirs(text, "/home/anna");
        assert_eq!(m.get("XDG_DESKTOP_DIR").map(String::as_str), Some("/home/anna/Scrivania"));
        assert!(!m.contains_key("XDG_MUSIC_DIR"));
    }

    #[test]
    fn known_folders_really_exist() {
        let f = list_known_folders();
        assert!(!f.is_empty());
        for k in f {
            assert!(
                std::path::Path::new(&k.path).exists(),
                "missing known folder: {}",
                k.path
            );
        }
    }
}
