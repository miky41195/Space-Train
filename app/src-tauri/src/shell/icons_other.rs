//! Icons and thumbnails outside Windows. Images get a real thumbnail made
//! by the `image` crate; other icons fall back to the frontend's own drawings.

/// Image ready for the frontend: PNG in base64, inside a data URL.
pub type DataUrl = String;

pub fn icon_for_extension(_ext: &str, _is_dir: bool, _large: bool) -> Option<DataUrl> {
    None
}

pub fn thumbnail(path: &str, side: u32) -> Option<DataUrl> {
    crate::fs::images::thumbnail(path, side)
}
