//! Icons and thumbnails outside Windows: none from the system yet. The
//! frontend falls back to its own drawn icons when these answer `None`.

/// Immagine pronta per il frontend: PNG in base64, dentro una data URL.
pub type DataUrl = String;

pub fn icon_for_extension(_ext: &str, _is_dir: bool, _large: bool) -> Option<DataUrl> {
    None
}

pub fn thumbnail(_path: &str, _lato: u32) -> Option<DataUrl> {
    None
}
