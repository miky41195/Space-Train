//! Checksums of a file, to compare with the value a download page publishes.

use crate::fs::error::FsError;
use crate::fs::paths;
use serde::Deserialize;
use sha2::Digest;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Algorithm {
    Sha256,
    Sha1,
    Md5,
}

fn digest<D: Digest>(mut file: std::fs::File, cancel: &AtomicBool) -> Result<Option<String>, FsError> {
    let mut hasher = D::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Ok(None);
        }
        let n = file.read(&mut buf).map_err(|e| FsError::Io { message: e.to_string() })?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(Some(data_encoding::HEXLOWER.encode(&hasher.finalize())))
}

/// Lowercase hex digest of the file, or `None` when cancelled.
pub fn checksum(path: &str, algo: Algorithm, cancel: &AtomicBool) -> Result<Option<String>, FsError> {
    let file = std::fs::File::open(paths::extended(Path::new(path))).map_err(|e| FsError::Io { message: e.to_string() })?;
    match algo {
        Algorithm::Sha256 => digest::<sha2::Sha256>(file, cancel),
        Algorithm::Sha1 => digest::<sha1::Sha1>(file, cancel),
        Algorithm::Md5 => digest::<md5::Md5>(file, cancel),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn known_digests_of_abc() {
        let d = tempdir().unwrap();
        let p = d.path().join("abc.txt");
        std::fs::write(&p, b"abc").unwrap();
        let p = p.to_string_lossy();
        let no = AtomicBool::new(false);
        assert_eq!(
            checksum(&p, Algorithm::Sha256, &no).unwrap().unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(checksum(&p, Algorithm::Sha1, &no).unwrap().unwrap(), "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(checksum(&p, Algorithm::Md5, &no).unwrap().unwrap(), "900150983cd24fb0d6963f7d28e17f72");
        assert!(checksum(&p, Algorithm::Sha256, &AtomicBool::new(true)).unwrap().is_none());
    }
}
