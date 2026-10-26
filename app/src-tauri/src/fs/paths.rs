use std::path::{Path, PathBuf};

const EXT_PREFIX: &str = r"\\?\";

/// Prefissa il path con `\\?\` per superare il limite dei 260 caratteri.
/// I path UNC (`\\server\share`) e quelli già prefissati restano invariati.
pub fn extended(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if s.starts_with(EXT_PREFIX) || s.starts_with(r"\\") || !path.is_absolute() {
        return path.to_path_buf();
    }
    PathBuf::from(format!("{}{}", EXT_PREFIX, s))
}

/// Rimuove il prefisso `\\?\`: quello che vede l'utente.
pub fn display(path: &Path) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(EXT_PREFIX).unwrap_or(&s).to_string()
}

/// Path della cartella superiore. `None` se `path` è una radice.
pub fn parent_of(path: &str) -> Option<String> {
    let p = Path::new(path);
    let parent = p.parent()?;
    if parent.as_os_str().is_empty() {
        return None;
    }
    Some(display(parent))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn aggiunge_il_prefisso_esteso_ai_path_assoluti() {
        let p = extended(Path::new(r"C:\Users\test"));
        assert_eq!(p.to_string_lossy(), r"\\?\C:\Users\test");
    }

    #[test]
    fn non_raddoppia_un_prefisso_gia_presente() {
        let p = extended(Path::new(r"\\?\C:\Users\test"));
        assert_eq!(p.to_string_lossy(), r"\\?\C:\Users\test");
    }

    #[test]
    fn display_rimuove_il_prefisso() {
        assert_eq!(display(Path::new(r"\\?\C:\Users\test")), r"C:\Users\test");
        assert_eq!(display(Path::new(r"C:\Users\test")), r"C:\Users\test");
    }

    #[test]
    fn parent_risale_di_un_livello() {
        assert_eq!(
            parent_of(r"C:\Users\test\file.txt"),
            Some(r"C:\Users\test".to_string())
        );
    }

    #[test]
    fn parent_della_radice_e_none() {
        assert_eq!(parent_of(r"C:\"), None);
    }
}
