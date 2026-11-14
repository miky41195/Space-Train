pub mod drives;
#[cfg(windows)]
pub mod icons;
#[cfg(not(windows))]
#[path = "icons_other.rs"]
pub mod icons;
pub mod known;
pub mod media;
pub mod open;
pub mod programs;
pub mod clipboard;
pub mod native;
pub mod network;
pub mod new_file;
#[cfg(windows)]
pub mod pick;

/// Last segment of a path: the name of the folder or file.
pub fn name_of(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}
