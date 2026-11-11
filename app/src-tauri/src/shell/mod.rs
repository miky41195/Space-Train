pub mod drives;
#[cfg(windows)]
pub mod icons;
#[cfg(not(windows))]
#[path = "icons_altri.rs"]
pub mod icons;
pub mod known;
pub mod media;
pub mod open;
pub mod appunti;
pub mod nativo;
pub mod rete;
pub mod nuovo;
#[cfg(windows)]
pub mod scegli;

/// Ultimo tratto di un path: il nome della cartella o del file.
pub fn nome_di(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}
