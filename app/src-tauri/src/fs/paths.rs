use std::path::{Path, PathBuf};

#[cfg(windows)]
const EXT_PREFIX: &str = r"\\?\";

/// Prefixes the path with `\\?\` to get past the 260-character limit.
/// UNC paths (`\\server\share`) and already prefixed ones stay unchanged.
/// Elsewhere paths have no such limit: they stay as they are.
#[cfg(windows)]
pub fn extended(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if s.starts_with(EXT_PREFIX) || s.starts_with(r"\\") || !path.is_absolute() {
        return path.to_path_buf();
    }
    PathBuf::from(format!("{}{}", EXT_PREFIX, s))
}

#[cfg(not(windows))]
pub fn extended(path: &Path) -> PathBuf {
    path.to_path_buf()
}

/// Removes the `\\?\` prefix: what the user sees.
#[cfg(windows)]
pub fn display(path: &Path) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(EXT_PREFIX).unwrap_or(&s).to_string()
}

#[cfg(not(windows))]
pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// The user's home folder: `%USERPROFILE%` on Windows, `$HOME` elsewhere.
pub fn home() -> Option<String> {
    let name = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var(name).ok().filter(|c| !c.is_empty())
}

/// Path of the parent folder. `None` if `path` is a root.
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

    #[cfg(windows)]
    #[test]
    fn adds_the_extended_prefix_to_absolute_paths() {
        let p = extended(Path::new(r"C:\Users\test"));
        assert_eq!(p.to_string_lossy(), r"\\?\C:\Users\test");
    }

    #[cfg(windows)]
    #[test]
    fn does_not_double_an_existing_prefix() {
        let p = extended(Path::new(r"\\?\C:\Users\test"));
        assert_eq!(p.to_string_lossy(), r"\\?\C:\Users\test");
    }

    #[cfg(windows)]
    #[test]
    fn display_removes_the_prefix() {
        assert_eq!(display(Path::new(r"\\?\C:\Users\test")), r"C:\Users\test");
        assert_eq!(display(Path::new(r"C:\Users\test")), r"C:\Users\test");
    }

    #[cfg(windows)]
    #[test]
    fn parent_goes_up_one_level() {
        assert_eq!(
            parent_of(r"C:\Users\test\file.txt"),
            Some(r"C:\Users\test".to_string())
        );
    }

    #[test]
    fn parent_of_root_is_none() {
        assert_eq!(parent_of(r"C:\"), None);
    }
}
