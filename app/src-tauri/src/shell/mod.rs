pub mod drives;
pub mod icons;
pub mod known;
pub mod open;
pub mod appunti;
pub mod nativo;
pub mod rete;
pub mod nuovo;

/// Ultimo tratto di un path: il nome della cartella o del file.
pub fn nome_di(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}
