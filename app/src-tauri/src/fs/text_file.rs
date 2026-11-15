//! Quick text editing: read a text file whole, save it back as it was.
//!
//! The editor gets the text with `\n` only; line endings and the UTF-8 BOM
//! are remembered here and put back on save, so a Windows file stays CRLF.
//! A file that is not UTF-8 is refused: saving it would damage it.

use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use serde::Serialize;
use std::path::Path;

/// Bigger files belong to a real editor.
pub const MAX: u64 = 5 * 1024 * 1024;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub text: String,
    pub crlf: bool,
    pub bom: bool,
    /// Last change on disk, in ms: saving checks nobody changed it meanwhile.
    pub modified: u64,
}

fn modified_ms(p: &Path) -> Result<u64, FsError> {
    let md = std::fs::metadata(p).map_err(|e| from_io(&e))?;
    Ok(crate::fs::dir_size::ms(md.modified()))
}

/// Splits raw bytes into text, line ending and BOM; `None` if not UTF-8 text.
pub fn decode(data: &[u8]) -> Option<(String, bool, bool)> {
    let (bom, body) = match data.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(rest) => (true, rest),
        None => (false, data),
    };
    if body.iter().take(8000).any(|b| *b == 0) {
        return None;
    }
    let text = std::str::from_utf8(body).ok()?;
    let crlf = text.contains("\r\n");
    Some((text.replace("\r\n", "\n"), crlf, bom))
}

/// The bytes to write for `text` with the file's own line ending and BOM.
pub fn encode(text: &str, crlf: bool, bom: bool) -> Vec<u8> {
    let body = if crlf { text.replace("\r\n", "\n").replace('\n', "\r\n") } else { text.to_string() };
    let mut out = Vec::with_capacity(body.len() + 3);
    if bom {
        out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    out.extend_from_slice(body.as_bytes());
    out
}

pub fn read(path: &str) -> Result<TextFile, FsError> {
    let p = paths::extended(Path::new(path));
    let md = std::fs::metadata(&p).map_err(|e| from_io(&e))?;
    if md.len() > MAX {
        return Err(FsError::Io { message: "Il file è troppo grande per la modifica veloce (oltre 5 MB).".into() });
    }
    let data = std::fs::read(&p).map_err(|e| from_io(&e))?;
    let (text, crlf, bom) = decode(&data).ok_or_else(|| FsError::Io {
        message: "Non è un file di testo UTF-8: Space Train non lo modifica per non rovinarlo.".into(),
    })?;
    Ok(TextFile { text, crlf, bom, modified: crate::fs::dir_size::ms(md.modified()) })
}

/// Saves `text`; refused if the file changed on disk after `expected`
/// (its modified time when it was read), unless `force`. Written to a file
/// next to it and then swapped in, so a crash never leaves half a file.
/// Returns the new modified time.
pub fn write(path: &str, text: &str, crlf: bool, bom: bool, expected: u64, force: bool) -> Result<u64, FsError> {
    let p = paths::extended(Path::new(path));
    if !force && modified_ms(&p)? != expected {
        return Err(FsError::Changed);
    }
    let name = p.file_name().ok_or(FsError::NotFound)?.to_string_lossy().into_owned();
    crate::versions::keep_before(Path::new(path), crate::versions::Reason::Edited);
    let temp = p.with_file_name(format!(".{}.space-train-save", name));
    std::fs::write(&temp, encode(text, crlf, bom)).map_err(|e| from_io(&e))?;
    if let Err(e) = std::fs::rename(&temp, &p) {
        let _ = std::fs::remove_file(&temp);
        return Err(from_io(&e));
    }
    modified_ms(&p)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn keeps_line_endings_and_bom() {
        let raw = b"\xEF\xBB\xBFuno\r\ndue\r\n";
        let (text, crlf, bom) = decode(raw).unwrap();
        assert_eq!((text.as_str(), crlf, bom), ("uno\ndue\n", true, true));
        assert_eq!(encode(&format!("{}tre\n", text), crlf, bom), b"\xEF\xBB\xBFuno\r\ndue\r\ntre\r\n");
        assert_eq!(encode("a\nb", false, false), b"a\nb");
    }

    #[test]
    fn refuses_what_is_not_utf8_text() {
        assert!(decode(b"caff\xE8").is_none());
        assert!(decode(b"a\0b").is_none());
    }

    #[test]
    fn saves_and_refuses_a_file_changed_meanwhile() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("note.txt");
        std::fs::write(&f, "uno\r\n").unwrap();
        let path = f.to_string_lossy().into_owned();
        let t = read(&path).unwrap();
        let after = write(&path, "uno\ndue\n", t.crlf, t.bom, t.modified, false).unwrap();
        assert_eq!(std::fs::read(&f).unwrap(), b"uno\r\ndue\r\n");
        assert!(write(&path, "x", false, false, after.wrapping_sub(5000), false).is_err());
        assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 1, "no temp file left behind");
    }
}
