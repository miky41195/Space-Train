//! Reading archives of several formats: ZIP, 7z, RAR, TAR and TAR.GZ.
//!
//! Listing gives what a folder view needs; extraction writes chosen items
//! (or everything) under a destination folder. Names inside an archive are
//! never trusted: `..`, absolute paths and drive letters are refused, so a
//! crafted archive cannot write outside the destination.

use crate::fs::error::FsError;
use crate::fs::paths;
use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::AtomicBool;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Zip,
    SevenZ,
    Rar,
    Tar,
    TarGz,
}

/// The format from the file name, or `None` if it is not an archive we read.
pub fn format_of(path: &str) -> Option<Format> {
    let n = path.to_lowercase();
    if n.ends_with(".tar.gz") || n.ends_with(".tgz") {
        Some(Format::TarGz)
    } else if n.ends_with(".tar") {
        Some(Format::Tar)
    } else if n.ends_with(".zip") {
        Some(Format::Zip)
    } else if n.ends_with(".7z") {
        Some(Format::SevenZ)
    } else if n.ends_with(".rar") {
        Some(Format::Rar)
    } else {
        None
    }
}

/// One item inside an archive. `path` uses `/` and has no leading separator.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveItem {
    pub path: String,
    pub size: u64,
    pub dir: bool,
    /// Milliseconds since the Unix epoch, when the archive records it.
    pub modified: Option<i64>,
}

fn io(e: impl std::fmt::Display) -> FsError {
    FsError::Io { message: e.to_string() }
}

fn unreadable(e: impl std::fmt::Display) -> FsError {
    FsError::Io { message: format!("Archivio illeggibile o protetto da password: {e}") }
}

pub(super) fn zip_entry<'a>(
    z: &'a mut zip::ZipArchive<std::fs::File>,
    i: usize,
    password: Option<&str>,
) -> Result<zip::read::ZipFile<'a, std::fs::File>, FsError> {
    use zip::result::ZipError;
    match password {
        Some(p) => z.by_index_decrypt(i, p.as_bytes()),
        None => z.by_index(i),
    }
    .map_err(|e| match e {
        ZipError::InvalidPassword | ZipError::UnsupportedArchive(ZipError::PASSWORD_REQUIRED) => FsError::ArchivePassword,
        e => unreadable(e),
    })
}

/// A wrong 7z password has no check of its own: it decodes to garbage, so any decoding failure may be it.
fn sevenz_error(e: sevenz_rust2::Error, password: Option<&str>) -> FsError {
    use sevenz_rust2::Error as E;
    match e {
        E::PasswordRequired | E::MaybeBadPassword(_) => FsError::ArchivePassword,
        E::UnsupportedCompressionMethod(_) | E::Unsupported(_) | E::MaxMemLimited { .. } => unreadable(e),
        _ if password.is_some() => FsError::ArchivePassword,
        e => unreadable(e),
    }
}

fn open_7z(file_path: &Path, password: Option<&str>) -> Result<sevenz_rust2::ArchiveReader<std::fs::File>, FsError> {
    let f = std::fs::File::open(file_path).map_err(io)?;
    let key = password.map_or_else(sevenz_rust2::Password::empty, sevenz_rust2::Password::from);
    sevenz_rust2::ArchiveReader::new(f, key).map_err(|e| sevenz_error(e, password))
}

/// Old RAR formats only notice a wrong password from the checksum.
fn rar_error(e: unrar_ng::error::UnrarError, password: Option<&str>) -> FsError {
    use unrar_ng::error::Code;
    match e.code {
        Code::MissingPassword | Code::BadPassword => FsError::ArchivePassword,
        Code::BadData if password.is_some() => FsError::ArchivePassword,
        _ => unreadable(e),
    }
}

fn rar<'a>(file_path: &'a Path, password: Option<&'a str>) -> unrar_ng::Archive<'a> {
    match password {
        Some(p) => unrar_ng::Archive::with_password(file_path, p),
        None => unrar_ng::Archive::new(file_path),
    }
}

/// Writes `to` through a sibling file renamed at the end, so a wrong password
/// or a cancelled job never ruins a file already there. `write` says whether it finished.
fn replace_file(to: &Path, write: impl FnOnce(&Path) -> Result<bool, FsError>) -> Result<(), FsError> {
    let dir = to.parent().ok_or(FsError::NotFound)?;
    std::fs::create_dir_all(paths::extended(dir)).map_err(io)?;
    let part = dir.join(crate::fs::copy::unique_name(dir, ".space-train.part"));
    let outcome = write(&part).and_then(|finished| {
        if finished {
            std::fs::rename(paths::extended(&part), paths::extended(to)).map_err(io)?;
        }
        Ok(finished)
    });
    if !matches!(outcome, Ok(true)) {
        let _ = std::fs::remove_file(paths::extended(&part));
    }
    outcome.map(|_| ())
}

/// Normalised inner name: `/` separators, no leading or trailing slash.
fn normalise(name: &str) -> String {
    name.replace('\\', "/").trim_matches('/').to_string()
}

/// A relative path that stays inside the destination, or `None`.
fn safe_relative(name: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for part in name.split(['/', '\\']) {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains(':') {
            return None;
        }
        out.push(part);
    }
    match out.components().next() {
        Some(Component::Normal(_)) => Some(out),
        _ => None,
    }
}

/// Days from 1970-01-01 to a civil date (proleptic Gregorian), Howard Hinnant's algorithm.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_ms(y: i64, mo: i64, d: i64, h: i64, mi: i64, s: i64) -> i64 {
    ((days_from_civil(y, mo, d) * 24 + h) * 60 + mi) * 60_000 + s * 1000
}

/// MS-DOS date and time (RAR headers), read as UTC.
fn dos_time_ms(t: u32) -> Option<i64> {
    let (date, time) = ((t >> 16) as i64, (t & 0xffff) as i64);
    if date == 0 {
        return None;
    }
    Some(civil_ms(1980 + (date >> 9), (date >> 5) & 15, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2))
}

pub fn list(archive: &str, password: Option<&str>) -> Result<Vec<ArchiveItem>, FsError> {
    let format = format_of(archive).ok_or_else(|| io("Formato di archivio non riconosciuto"))?;
    let file_path = paths::extended(Path::new(archive));
    match format {
        Format::Zip => {
            let f = std::fs::File::open(&file_path).map_err(io)?;
            let mut z = zip::ZipArchive::new(f).map_err(unreadable)?;
            (0..z.len())
                .map(|i| {
                    let e = z.by_index_raw(i).map_err(unreadable)?;
                    let modified = e.last_modified().map(|t| {
                        civil_ms(t.year() as i64, t.month() as i64, t.day() as i64, t.hour() as i64, t.minute() as i64, t.second() as i64)
                    });
                    Ok(ArchiveItem { path: normalise(e.name()), size: e.size(), dir: e.is_dir(), modified })
                })
                .collect()
        }
        Format::SevenZ => {
            let r = open_7z(&file_path, password)?;
            Ok(r.archive()
                .files
                .iter()
                .map(|e| ArchiveItem {
                    path: normalise(e.name()),
                    size: e.size(),
                    dir: e.is_directory(),
                    modified: e.has_last_modified_date.then(|| {
                        std::time::SystemTime::from(e.last_modified_date)
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis() as i64)
                            .unwrap_or(0)
                    }),
                })
                .collect())
        }
        Format::Rar => {
            let listing = rar(&file_path, password).open_for_listing().map_err(|e| rar_error(e, password))?;
            listing
                .map(|h| {
                    let h = h.map_err(|e| rar_error(e, password))?;
                    Ok(ArchiveItem {
                        path: normalise(&h.filename.to_string_lossy()),
                        size: h.unpacked_size,
                        dir: h.is_directory(),
                        modified: dos_time_ms(h.file_time),
                    })
                })
                .collect()
        }
        Format::Tar | Format::TarGz => {
            let mut out = Vec::new();
            for_each_tar(&file_path, format, &mut |e| {
                let header = e.header();
                out.push(ArchiveItem {
                    path: normalise(&e.path().map_err(io)?.to_string_lossy()),
                    size: header.size().unwrap_or(0),
                    dir: header.entry_type().is_dir(),
                    modified: header.mtime().ok().map(|s| s as i64 * 1000),
                });
                Ok(true)
            })?;
            Ok(out)
        }
    }
}

fn for_each_tar(
    file_path: &Path,
    format: Format,
    each: &mut dyn FnMut(&mut tar::Entry<'_, Box<dyn Read>>) -> Result<bool, FsError>,
) -> Result<(), FsError> {
    let f = std::fs::File::open(file_path).map_err(io)?;
    let reader: Box<dyn Read> = if format == Format::TarGz { Box::new(flate2::read::GzDecoder::new(f)) } else { Box::new(f) };
    let mut a = tar::Archive::new(reader);
    for e in a.entries().map_err(unreadable)? {
        let mut e = e.map_err(unreadable)?;
        if !each(&mut e)? {
            break;
        }
    }
    Ok(())
}

/// Where an inner item lands under `dest`: everything keeps its full inner
/// path, or, with `only`, its path from the parent of the chosen item that
/// contains it. `None` = not wanted or unsafe.
fn target(dest: &Path, inner: &str, only: Option<&[String]>) -> Option<PathBuf> {
    let rel = match only {
        None => inner.to_string(),
        Some(chosen) => {
            let c = chosen.iter().map(|c| normalise(c)).find(|c| inner == c || inner.starts_with(&format!("{c}/")))?;
            let parent_len = c.rfind('/').map(|i| i + 1).unwrap_or(0);
            inner[parent_len..].to_string()
        }
    };
    Some(dest.join(safe_relative(&rel)?))
}

/// `locked`: the data is being decrypted, so a read failure means a wrong password.
fn write_stream(
    reader: &mut dyn Read,
    to: &Path,
    locked: bool,
    cancel: &AtomicBool,
    done: &mut u64,
    progress: &mut dyn FnMut(u64),
) -> Result<(), FsError> {
    replace_file(to, |part| {
        let mut out = std::fs::File::create(paths::extended(part)).map_err(io)?;
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            if crate::fs::pause::stopped(cancel) {
                return Ok(false);
            }
            let n = reader.read(&mut buf).map_err(|e| if locked { FsError::ArchivePassword } else { io(e) })?;
            if n == 0 {
                return Ok(true);
            }
            out.write_all(&buf[..n]).map_err(io)?;
            *done += n as u64;
            progress(*done);
        }
    })
}

/// Extracts the archive (or only the `only` items, with their contents) under `dest`.
pub fn extract(
    archive: &str,
    dest: &Path,
    only: Option<&[String]>,
    password: Option<&str>,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<(), FsError> {
    let format = format_of(archive).ok_or_else(|| io("Formato di archivio non riconosciuto"))?;
    let file_path = paths::extended(Path::new(archive));
    std::fs::create_dir_all(paths::extended(dest)).map_err(io)?;
    let mut done = 0u64;
    match format {
        Format::Zip => {
            let f = std::fs::File::open(&file_path).map_err(io)?;
            let mut z = zip::ZipArchive::new(f).map_err(unreadable)?;
            for i in 0..z.len() {
                if crate::fs::pause::stopped(cancel) {
                    break;
                }
                let mut e = zip_entry(&mut z, i, password)?;
                let locked = e.encrypted();
                let Some(to) = target(dest, &normalise(e.name()), only) else { continue };
                if e.is_dir() {
                    std::fs::create_dir_all(paths::extended(&to)).map_err(io)?;
                } else {
                    write_stream(&mut e, &to, locked, cancel, &mut done, progress)?;
                }
            }
        }
        Format::SevenZ => {
            let mut r = open_7z(&file_path, password)?;
            let mut failure: Option<FsError> = None;
            r.for_each_entries_with_decision(|e, reader| {
                if crate::fs::pause::stopped(cancel) {
                    return Ok(sevenz_rust2::EntryDecision::Stop);
                }
                if let Some(to) = target(dest, &normalise(e.name()), only) {
                    let written = if e.is_directory() {
                        std::fs::create_dir_all(paths::extended(&to)).map_err(io)
                    } else {
                        write_stream(reader, &to, password.is_some(), cancel, &mut done, progress)
                    };
                    if let Err(err) = written {
                        failure = Some(err);
                        return Ok(sevenz_rust2::EntryDecision::Stop);
                    }
                }
                Ok(sevenz_rust2::EntryDecision::Continue)
            })
            .map_err(|e| sevenz_error(e, password))?;
            if let Some(err) = failure {
                return Err(err);
            }
        }
        Format::Rar => {
            let mut cursor = rar(&file_path, password).open_for_processing().map_err(|e| rar_error(e, password))?;
            while let Some(header) = cursor.read_header().map_err(|e| rar_error(e, password))? {
                if crate::fs::pause::stopped(cancel) {
                    break;
                }
                let entry = header.entry();
                let inner = normalise(&entry.filename.to_string_lossy());
                cursor = match target(dest, &inner, only) {
                    Some(to) if entry.is_directory() => {
                        std::fs::create_dir_all(paths::extended(&to)).map_err(io)?;
                        header.skip().map_err(|e| rar_error(e, password))?
                    }
                    Some(to) => {
                        let size = entry.unpacked_size;
                        let mut next = None;
                        replace_file(&to, |part| {
                            next = Some(header.extract_to(part).map_err(|e| rar_error(e, password))?);
                            Ok(true)
                        })?;
                        done += size;
                        progress(done);
                        match next {
                            Some(n) => n,
                            None => break,
                        }
                    }
                    None => header.skip().map_err(|e| rar_error(e, password))?,
                };
            }
        }
        Format::Tar | Format::TarGz => {
            for_each_tar(&file_path, format, &mut |e| {
                if crate::fs::pause::stopped(cancel) {
                    return Ok(false);
                }
                let inner = normalise(&e.path().map_err(io)?.to_string_lossy());
                let kind = e.header().entry_type();
                if let Some(to) = target(dest, &inner, only) {
                    if kind.is_dir() {
                        std::fs::create_dir_all(paths::extended(&to)).map_err(io)?;
                    } else if kind.is_file() {
                        write_stream(e, &to, false, cancel, &mut done, progress)?;
                    }
                    // Links and devices are skipped: they could point outside `dest`.
                }
                Ok(true)
            })?;
        }
    }
    Ok(())
}

/// Extracts the whole archive into a new folder beside it, named after it. Returns that folder.
pub fn extract_beside(
    archive: &str,
    password: Option<&str>,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<String, FsError> {
    let source = Path::new(archive);
    let dir = source.parent().ok_or(FsError::NotFound)?;
    let name = source.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let lower = name.to_lowercase();
    let cut = [".tar.gz", ".tgz", ".tar", ".zip", ".7z", ".rar"].iter().find(|e| lower.ends_with(*e)).map_or(0, |e| e.len());
    let base = if cut > 0 && cut < name.len() { name[..name.len() - cut].to_string() } else { "Estratti".to_string() };
    let dest = dir.join(crate::fs::copy::unique_name(dir, &base));
    let outcome = extract(archive, &dest, None, password, cancel, progress);
    super::archives::discard_if_locked(&dest, &outcome);
    outcome?;
    Ok(paths::display(&dest))
}

/// Total unpacked bytes, for the progress bar. 0 if the archive is unreadable.
pub fn unpacked_size(archive: &str, password: Option<&str>) -> u64 {
    list(archive, password).map(|v| v.iter().map(|i| i.size).sum()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn make_tar_gz(path: &Path) {
        let f = fs::File::create(path).unwrap();
        let gz = flate2::write::GzEncoder::new(f, flate2::Compression::default());
        let mut b = tar::Builder::new(gz);
        for (name, data) in [("src/a.txt", "alpha"), ("src/deep/b.txt", "beta"), ("README.md", "hi")] {
            let mut h = tar::Header::new_gnu();
            h.set_size(data.len() as u64);
            h.set_mode(0o644);
            h.set_mtime(1_700_000_000);
            h.set_cksum();
            b.append_data(&mut h, name, data.as_bytes()).unwrap();
        }
        b.into_inner().unwrap().finish().unwrap();
    }

    #[test]
    fn recognises_formats_by_name() {
        assert_eq!(format_of("a.TAR.GZ"), Some(Format::TarGz));
        assert_eq!(format_of("a.tgz"), Some(Format::TarGz));
        assert_eq!(format_of("a.7z"), Some(Format::SevenZ));
        assert_eq!(format_of("a.rar"), Some(Format::Rar));
        assert_eq!(format_of("a.txt"), None);
    }

    #[test]
    fn tar_gz_lists_and_extracts_a_chosen_folder() {
        let d = tempdir().unwrap();
        let arc = d.path().join("p.tar.gz");
        make_tar_gz(&arc);
        let arc = arc.to_string_lossy().to_string();

        let items = list(&arc, None).unwrap();
        assert_eq!(items.iter().map(|i| i.path.as_str()).collect::<Vec<_>>(), vec!["src/a.txt", "src/deep/b.txt", "README.md"]);
        assert_eq!(items[0].modified, Some(1_700_000_000_000));

        let out = d.path().join("out");
        extract(&arc, &out, Some(&["src".to_string()]), None, &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert_eq!(fs::read_to_string(out.join("src").join("deep").join("b.txt")).unwrap(), "beta");
        assert!(!out.join("README.md").exists());
    }

    #[test]
    fn seven_z_round_trip() {
        let d = tempdir().unwrap();
        let src = d.path().join("data");
        fs::create_dir_all(src.join("sub")).unwrap();
        fs::write(src.join("sub").join("x.txt"), "seven").unwrap();
        let arc = d.path().join("d.7z");
        sevenz_rust2::compress_to_path(&src, &arc).unwrap();
        let arc = arc.to_string_lossy().to_string();

        assert!(list(&arc, None).unwrap().iter().any(|i| i.path == "sub/x.txt" && i.size == 5));
        let out = d.path().join("out");
        extract(&arc, &out, None, None, &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert_eq!(fs::read_to_string(out.join("sub").join("x.txt")).unwrap(), "seven");
    }

    fn refuses_then_opens(arc: &str, dir: &Path, hidden_names: bool) {
        let no = AtomicBool::new(false);
        let out = dir.join("out");
        fs::create_dir_all(&out).unwrap();
        fs::write(out.join("x.txt"), "already here").unwrap();
        for wrong in [None, Some("sbagliata")] {
            if hidden_names {
                assert_eq!(list(arc, wrong).unwrap_err(), FsError::ArchivePassword);
            }
            assert_eq!(extract(arc, &out, None, wrong, &no, &mut |_| {}).unwrap_err(), FsError::ArchivePassword);
            assert_eq!(extract_beside(arc, wrong, &no, &mut |_| {}).unwrap_err(), FsError::ArchivePassword);
            // The file already there is intact, and no leftover stays.
            assert_eq!(fs::read_to_string(out.join("x.txt")).unwrap(), "already here");
            assert_eq!(fs::read_dir(&out).unwrap().count(), 1);
            assert!(!Path::new(&arc[..arc.rfind('.').unwrap()]).exists());
        }
        assert!(list(arc, Some("segreta")).unwrap().iter().any(|i| i.path == "x.txt"));
        extract(arc, &out, None, Some("segreta"), &no, &mut |_| {}).unwrap();
        assert_eq!(fs::read_to_string(out.join("x.txt")).unwrap(), "seven");
    }

    #[test]
    fn an_encrypted_7z_asks_for_the_password_and_opens_with_it() {
        let d = tempdir().unwrap();
        let src = d.path().join("data");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("x.txt"), "seven").unwrap();
        let arc = d.path().join("d.7z");
        sevenz_rust2::compress_to_path_encrypted(&src, &arc, "segreta".into()).unwrap();
        refuses_then_opens(&arc.to_string_lossy(), d.path(), false);
    }

    /// Needs WinRAR: `cargo test --lib encrypted_rar -- --ignored`
    #[test]
    #[ignore]
    fn an_encrypted_rar_asks_for_the_password_and_opens_with_it() {
        for (key, hidden) in [("-psegreta", false), ("-hpsegreta", true)] {
            let d = tempdir().unwrap();
            fs::write(d.path().join("x.txt"), "seven").unwrap();
            let made = std::process::Command::new("C:/Program Files/WinRAR/Rar.exe")
                .args(["a", key, "d.rar", "x.txt"])
                .current_dir(d.path())
                .output()
                .unwrap();
            assert!(made.status.success());
            refuses_then_opens(&d.path().join("d.rar").to_string_lossy(), d.path(), hidden);
        }
    }

    #[test]
    fn unsafe_names_never_leave_the_destination() {
        let dest = Path::new("C:/out");
        assert!(target(dest, "../evil.txt", None).is_none());
        assert!(target(dest, "C:/Windows/evil.txt", None).is_none());
        assert!(target(dest, "a/../../evil.txt", None).is_none());
        assert_eq!(target(dest, "a/b.txt", Some(&["a/b.txt".into()])).unwrap(), dest.join("b.txt"));
    }

    #[test]
    fn dos_and_civil_dates() {
        assert_eq!(civil_ms(1970, 1, 1, 0, 0, 0), 0);
        assert_eq!(civil_ms(2024, 2, 29, 12, 0, 0), 1_709_208_000_000);
        // 2024-02-29 12:00:00 in DOS format.
        let t = ((2024 - 1980) << 25) | (2 << 21) | (29 << 16) | (12 << 11);
        assert_eq!(dos_time_ms(t), Some(1_709_208_000_000));
    }
}
