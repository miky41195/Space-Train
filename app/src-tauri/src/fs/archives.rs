//! Compressed folders: creating a ZIP and extracting it.

use crate::fs::copy::unique_name;
use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use zip::write::SimpleFileOptions;

fn zip_error(e: zip::result::ZipError) -> FsError {
    FsError::Io {
        message: format!("Archivio non valido o illeggibile: {}", e),
    }
}

/// Archive name as Windows chooses it: the item's name if there is only
/// one, otherwise the name of the folder that contains them.
pub fn archive_name(sources: &[String], dest: &Path) -> String {
    let base = if sources.len() == 1 {
        let p = Path::new(&sources[0]);
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned());
        // A file's name loses its extension: «nota.txt» becomes «nota.zip».
        match (name, p.is_dir()) {
            (Some(n), true) => n,
            (Some(n), false) => Path::new(&n)
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or(n),
            (None, _) => "Archivio".to_string(),
        }
    } else {
        dest.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Archivio".to_string())
    };
    unique_name(dest, &format!("{}.zip", base))
}

/// Compresses `sources` into a new ZIP inside `dest`. Returns the created path.
pub fn compress(
    sources: &[String],
    dest: &str,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<String, FsError> {
    let dest = Path::new(dest);
    let arrival = dest.join(archive_name(sources, dest));

    let file = std::fs::File::create(paths::extended(&arrival)).map_err(|e| from_io(&e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    let mut done = 0u64;

    let outcome = (|| {
        for s in sources {
            let origin = Path::new(s);
            let name = origin
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            add(&mut zip, origin, &name, options, cancel, &mut done, progress)?;
        }
        zip.finish().map_err(zip_error)?;
        Ok(())
    })();

    // A half-written archive is no use to anyone: cancelled or failed, it goes away.
    if outcome.is_err() || crate::fs::pause::stopped(cancel) {
        let _ = std::fs::remove_file(paths::extended(&arrival));
        outcome?;
        return Err(FsError::Io {
            message: "Compressione annullata.".to_string(),
        });
    }

    Ok(paths::display(&arrival))
}

fn add(
    zip: &mut zip::ZipWriter<std::fs::File>,
    origin: &Path,
    name: &str,
    options: SimpleFileOptions,
    cancel: &AtomicBool,
    done: &mut u64,
    progress: &mut dyn FnMut(u64),
) -> Result<(), FsError> {
    if crate::fs::pause::stopped(cancel) {
        return Ok(());
    }
    let extended = paths::extended(origin);
    let meta = std::fs::symlink_metadata(&extended).map_err(|e| from_io(&e))?;

    if meta.is_dir() {
        zip.add_directory(format!("{}/", name), options)
            .map_err(zip_error)?;
        let items = std::fs::read_dir(&extended).map_err(|e| from_io(&e))?;
        for v in items.filter_map(|v| v.ok()) {
            let child = format!("{}/{}", name, v.file_name().to_string_lossy());
            add(zip, &v.path(), &child, options, cancel, done, progress)?;
        }
        return Ok(());
    }

    zip.start_file(name, options).map_err(zip_error)?;
    let mut f = std::fs::File::open(&extended).map_err(|e| from_io(&e))?;
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        if crate::fs::pause::stopped(cancel) {
            return Ok(());
        }
        let n = f.read(&mut buf).map_err(|e| from_io(&e))?;
        if n == 0 {
            break;
        }
        zip.write_all(&buf[..n]).map_err(|e| from_io(&e))?;
        *done += n as u64;
        progress(*done);
    }
    Ok(())
}

/// Extracts the archive into a new folder next to it, with its name.
/// Returns the path of the created folder.
pub fn extract(
    archive: &str,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<String, FsError> {
    let source = Path::new(archive);
    let dir = source.parent().ok_or(FsError::NotFound)?;
    let base = source
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Estratti".to_string());
    let arrival: PathBuf = dir.join(unique_name(dir, &base));

    let f = std::fs::File::open(paths::extended(source)).map_err(|e| from_io(&e))?;
    let mut z = zip::ZipArchive::new(f).map_err(zip_error)?;
    std::fs::create_dir_all(paths::extended(&arrival)).map_err(|e| from_io(&e))?;

    let mut done = 0u64;
    for i in 0..z.len() {
        if crate::fs::pause::stopped(cancel) {
            break;
        }
        let mut item = z.by_index(i).map_err(zip_error)?;
        // `enclosed_name` rejects names with `..` or absolute ones: without
        // it, a malicious archive could write outside the folder.
        let Some(relative) = item.enclosed_name() else {
            continue;
        };
        // Rebuilt component by component: names in the ZIP use `/`, which
        // Windows no longer turns into a separator with the `\\?\` prefix.
        let target: PathBuf = arrival.join(relative.components().collect::<PathBuf>());

        if item.is_dir() {
            std::fs::create_dir_all(paths::extended(&target)).map_err(|e| from_io(&e))?;
            continue;
        }
        if let Some(parent_of) = target.parent() {
            std::fs::create_dir_all(paths::extended(parent_of)).map_err(|e| from_io(&e))?;
        }
        let mut out =
            std::fs::File::create(paths::extended(&target)).map_err(|e| from_io(&e))?;
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            let n = item.read(&mut buf).map_err(|e| from_io(&e))?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| from_io(&e))?;
            done += n as u64;
            progress(done);
        }
    }

    Ok(paths::display(&arrival))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn compresses_and_extracts_a_folder_intact() {
        let d = tempdir().unwrap();
        let src = d.path().join("progetto");
        fs::create_dir_all(src.join("sotto")).unwrap();
        fs::write(src.join("a.txt"), b"alfa").unwrap();
        fs::write(src.join("sotto").join("b.txt"), b"beta").unwrap();

        let no = AtomicBool::new(false);
        let zip = compress(
            &[src.to_string_lossy().into_owned()],
            &d.path().to_string_lossy(),
            &no,
            &mut |_| {},
        )
        .unwrap();
        assert!(zip.ends_with("progetto.zip"));

        let folder = extract(&zip, &no, &mut |_| {}).unwrap();
        // «progetto» already exists: the extraction gets numbered instead of mixing in.
        assert!(folder.ends_with("progetto (2)"));
        let inside = Path::new(&folder).join("progetto");
        assert_eq!(fs::read_to_string(inside.join("a.txt")).unwrap(), "alfa");
        assert_eq!(fs::read_to_string(inside.join("sotto").join("b.txt")).unwrap(), "beta");
    }

    #[test]
    fn a_file_name_loses_its_extension() {
        let d = tempdir().unwrap();
        let f = d.path().join("nota.txt");
        fs::write(&f, b"x").unwrap();
        assert_eq!(
            archive_name(&[f.to_string_lossy().into_owned()], d.path()),
            "nota.zip"
        );
    }

    #[test]
    fn a_corrupt_archive_gives_a_readable_error() {
        let d = tempdir().unwrap();
        let f = d.path().join("rotto.zip");
        fs::write(&f, b"non sono uno zip").unwrap();
        let err = extract(&f.to_string_lossy(), &AtomicBool::new(false), &mut |_| {}).unwrap_err();
        assert!(matches!(err, FsError::Io { .. }));
    }
}
