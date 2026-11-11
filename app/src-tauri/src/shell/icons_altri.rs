//! Icons and thumbnails outside Windows. Images get a real thumbnail made
//! by the `image` crate; other icons fall back to the frontend's own drawings.

/// Immagine pronta per il frontend: PNG in base64, dentro una data URL.
pub type DataUrl = String;

pub fn icon_for_extension(_ext: &str, _is_dir: bool, _large: bool) -> Option<DataUrl> {
    None
}

pub fn thumbnail(path: &str, lato: u32) -> Option<DataUrl> {
    crate::fs::immagini::thumbnail(path, lato)
}
