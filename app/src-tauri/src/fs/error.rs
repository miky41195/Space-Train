use serde::Serialize;

/// Codice Win32 ERROR_NOT_READY: unità senza supporto, rete non raggiungibile.
const ERROR_NOT_READY: i32 = 21;
/// Codice Win32 ERROR_DIRECTORY: il path esiste ma non è una directory.
const ERROR_DIRECTORY: i32 = 267;

#[derive(Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FsError {
    AccessDenied,
    NotFound,
    NotADirectory,
    DeviceNotReady,
    Io { message: String },
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
    fn mappa_gli_errori_io_noti() {
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
    fn gli_errori_sconosciuti_conservano_il_messaggio() {
        let e = from_io(&Error::new(ErrorKind::Other, "disco in fiamme"));
        match e {
            FsError::Io { message } => assert!(message.contains("disco in fiamme")),
            other => panic!("variante inattesa: {:?}", other),
        }
    }

    #[test]
    fn serializza_con_un_campo_kind() {
        let json = serde_json::to_string(&FsError::AccessDenied).unwrap();
        assert_eq!(json, r#"{"kind":"accessDenied"}"#);
    }
}
