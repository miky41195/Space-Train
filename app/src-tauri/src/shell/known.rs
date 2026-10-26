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
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    if home.is_empty() {
        return Vec::new();
    }

    [
        ("Home", "", "home"),
        ("Desktop", "Desktop", "desktop"),
        ("Documenti", "Documents", "documents"),
        ("Download", "Downloads", "downloads"),
        ("Immagini", "Pictures", "pictures"),
        ("Musica", "Music", "music"),
        ("Video", "Videos", "videos"),
    ]
    .iter()
    .map(|(label, sub, icon)| {
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

#[cfg(test)]
mod tests {
    use super::*;

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
