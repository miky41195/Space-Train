use serde::Serialize;

/// Characters Windows does not allow in a file name.
const FORBIDDEN: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Names reserved by the system, also with an extension (`CON.txt` is
/// rejected just like `CON`).
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Limit for a single path component, not for the whole path.
const MAX_LENGTH: usize = 255;

#[derive(Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NameError {
    Empty,
    ForbiddenChar { character: String },
    ReservedName { name: String },
    BadEnding,
    TooLong,
}

/// Checks that `name` can be used as a file or folder name.
///
/// It checks the single component, not a path: a `\` here is an error,
/// not a separator.
pub fn validate_name(name: &str) -> Result<(), NameError> {
    if name.trim().is_empty() {
        return Err(NameError::Empty);
    }

    if name.chars().count() > MAX_LENGTH {
        return Err(NameError::TooLong);
    }

    for c in name.chars() {
        if FORBIDDEN.contains(&c) || (c as u32) < 0x20 {
            return Err(NameError::ForbiddenChar {
                character: c.to_string(),
            });
        }
    }

    // Windows silently trims trailing dots and spaces: a name that has
    // them is not what the user thinks they typed.
    if name.ends_with('.') || name.ends_with(' ') {
        return Err(NameError::BadEnding);
    }

    let base = name.split('.').next().unwrap_or(name).to_uppercase();
    if RESERVED.contains(&base.as_str()) {
        return Err(NameError::ReservedName { name: base });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_names() {
        assert_eq!(validate_name("appunti.txt"), Ok(()));
        assert_eq!(validate_name("Cartella nuova"), Ok(()));
        assert_eq!(validate_name("café–🚀.md"), Ok(()));
        assert_eq!(validate_name("archivio.tar.gz"), Ok(()));
    }

    #[test]
    fn refuses_an_empty_or_blank_name() {
        assert_eq!(validate_name(""), Err(NameError::Empty));
        assert_eq!(validate_name("   "), Err(NameError::Empty));
    }

    #[test]
    fn refuses_forbidden_characters() {
        for c in ['<', '>', ':', '"', '/', '\\', '|', '?', '*'] {
            let name = format!("file{}nome.txt", c);
            assert!(
                matches!(validate_name(&name), Err(NameError::ForbiddenChar { .. })),
                "should have refused {}",
                c
            );
        }
    }

    #[test]
    fn refuses_control_characters() {
        assert!(matches!(
            validate_name("file\u{1}.txt"),
            Err(NameError::ForbiddenChar { .. })
        ));
    }

    #[test]
    fn refuses_names_reserved_by_the_system() {
        assert!(matches!(
            validate_name("CON"),
            Err(NameError::ReservedName { .. })
        ));
        assert!(matches!(
            validate_name("nul"),
            Err(NameError::ReservedName { .. })
        ));
        assert!(matches!(
            validate_name("COM1.txt"),
            Err(NameError::ReservedName { .. })
        ));
    }

    #[test]
    fn names_containing_a_reserved_one_are_fine() {
        assert_eq!(validate_name("console.txt"), Ok(()));
        assert_eq!(validate_name("nullo.md"), Ok(()));
    }

    #[test]
    fn refuses_trailing_dots_and_spaces() {
        assert_eq!(validate_name("appunti."), Err(NameError::BadEnding));
        assert_eq!(validate_name("appunti "), Err(NameError::BadEnding));
    }

    #[test]
    fn refuses_names_too_long() {
        let long = "a".repeat(256);
        assert_eq!(validate_name(&long), Err(NameError::TooLong));

        let limit = "a".repeat(255);
        assert_eq!(validate_name(&limit), Ok(()));
    }
}
