use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnownFolder {
    pub label: String,
    pub path: String,
    /// Chiave per la mappa icone del frontend.
    pub icon: String,
}

/// Cartelle note dell'utente. Si ricavano dalle variabili d'ambiente invece
/// che da SHGetKnownFolderPath: nessuna dipendenza COM, stesso risultato
/// nei casi che ci interessano. Le voci inesistenti vengono scartate.
pub fn list_known_folders() -> Vec<KnownFolder> {
    let Some(home) = crate::fs::paths::casa() else {
        return Vec::new();
    };
    #[cfg(not(windows))]
    let xdg = cartelle_xdg(&home);

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
    .map(|(label, sub, icon, _chiave)| {
        #[cfg(not(windows))]
        let path = if sub.is_empty() {
            home.clone()
        } else {
            xdg.get(*_chiave)
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
fn cartelle_xdg(home: &str) -> std::collections::HashMap<String, String> {
    let config = std::env::var("XDG_CONFIG_HOME")
        .ok()
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| format!("{}/.config", home));
    let testo = std::fs::read_to_string(format!("{}/user-dirs.dirs", config)).unwrap_or_default();
    leggi_user_dirs(&testo, home)
}

#[cfg(not(windows))]
fn leggi_user_dirs(testo: &str, home: &str) -> std::collections::HashMap<String, String> {
    testo
        .lines()
        .filter_map(|riga| {
            let riga = riga.trim();
            if riga.starts_with('#') {
                return None;
            }
            let (chiave, valore) = riga.split_once('=')?;
            let valore = valore.trim().trim_matches('"').replace("$HOME", home);
            // A folder set to the home itself means "disabled".
            let pulito = valore.trim_end_matches('/');
            if pulito.is_empty() || pulito == home.trim_end_matches('/') {
                return None;
            }
            Some((chiave.trim().to_string(), pulito.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(windows))]
    #[test]
    fn reads_localized_user_dirs() {
        let testo = "# comment\nXDG_DESKTOP_DIR=\"$HOME/Scrivania\"\nXDG_MUSIC_DIR=\"$HOME/\"\n";
        let m = leggi_user_dirs(testo, "/home/anna");
        assert_eq!(m.get("XDG_DESKTOP_DIR").map(String::as_str), Some("/home/anna/Scrivania"));
        assert!(!m.contains_key("XDG_MUSIC_DIR"));
    }

    #[test]
    fn le_cartelle_note_esistono_davvero() {
        let f = list_known_folders();
        assert!(!f.is_empty());
        for k in f {
            assert!(
                std::path::Path::new(&k.path).exists(),
                "cartella nota inesistente: {}",
                k.path
            );
        }
    }
}
