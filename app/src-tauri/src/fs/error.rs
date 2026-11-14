use serde::Serialize;

/// Win32 code ERROR_NOT_READY: drive with no media, network unreachable.
const ERROR_NOT_READY: i32 = 21;
/// Win32 code ERROR_DIRECTORY: the path exists but is not a directory.
const ERROR_DIRECTORY: i32 = 267;

#[derive(Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FsError {
    AccessDenied,
    NotFound,
    NotADirectory,
    DeviceNotReady,
    Io { message: String },
    /// A remote server's key the user has not confirmed yet, or a key that changed.
    ServerKey { fingerprint: String, changed: bool },
    /// The remote server wants a password (none known, or the one known was refused).
    ServerPassword,
    /// The file changed on disk after it was read: saving would overwrite someone else's work.
    Changed,
}

pub fn from_io(e: &std::io::Error) -> FsError {
    use std::io::ErrorKind;

    if let Some(code) = e.raw_os_error() {
        match code {
            ERROR_NOT_READY => return FsError::DeviceNotReady,
            ERROR_DIRECTORY => return FsError::NotADirectory,
            _ => {}
        }
    }

    match e.kind() {
        ErrorKind::PermissionDenied => FsError::AccessDenied,
        ErrorKind::NotFound => FsError::NotFound,
        _ => FsError::Io {
            message: e.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Error, ErrorKind};

    #[test]
    fn maps_known_io_errors() {
        assert_eq!(
            from_io(&Error::new(ErrorKind::PermissionDenied, "x")),
            FsError::AccessDenied
        );
        assert_eq!(
            from_io(&Error::new(ErrorKind::NotFound, "x")),
            FsError::NotFound
        );
    }

    #[test]
    fn unknown_errors_keep_the_message() {
        let e = from_io(&Error::new(ErrorKind::Other, "disk on fire"));
        match e {
            FsError::Io { message } => assert!(message.contains("disk on fire")),
            other => panic!("unexpected variant: {:?}", other),
        }
    }

    #[test]
    fn serializes_with_a_kind_field() {
        let json = serde_json::to_string(&FsError::AccessDenied).unwrap();
        assert_eq!(json, r#"{"kind":"accessDenied"}"#);
    }
}
