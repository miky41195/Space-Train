//! Cartelle compresse: creare uno ZIP ed estrarlo.

use crate::fs::copy::unique_name;
use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use zip::write::SimpleFileOptions;

fn errore_zip(e: zip::result::ZipError) -> FsError {
    FsError::Io {
        message: format!("Archivio non valido o illeggibile: {}", e),
    }
}

/// Nome dell'archivio come lo sceglie Windows: quello dell'elemento se è
/// uno solo, altrimenti quello della cartella che li contiene.
pub fn nome_archivio(sorgenti: &[String], dest: &Path) -> String {
    let base = if sorgenti.len() == 1 {
        let p = Path::new(&sorgenti[0]);
        let nome = p.file_name().map(|n| n.to_string_lossy().into_owned());
        // Il nome di un file perde l'estensione: «nota.txt» diventa «nota.zip».
        match (nome, p.is_dir()) {
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

/// Comprime `sorgenti` in un nuovo ZIP dentro `dest`. Ritorna il path creato.
pub fn comprimi(
    sorgenti: &[String],
    dest: &str,
    annulla: &AtomicBool,
    avanzamento: &mut dyn FnMut(u64),
) -> Result<String, FsError> {
    let dest = Path::new(dest);
    let arrivo = dest.join(nome_archivio(sorgenti, dest));

    let file = std::fs::File::create(paths::extended(&arrivo)).map_err(|e| from_io(&e))?;
    let mut zip = zip::ZipWriter::new(file);
    let opzioni = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .large_file(true);
    let mut fatti = 0u64;

    let esito = (|| {
        for s in sorgenti {
            let origine = Path::new(s);
            let nome = origine
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            aggiungi(&mut zip, origine, &nome, opzioni, annulla, &mut fatti, avanzamento)?;
        }
        zip.finish().map_err(errore_zip)?;
        Ok(())
    })();

    // Un archivio a metà non serve a nessuno: annullato o fallito, sparisce.
    if esito.is_err() || annulla.load(Ordering::Relaxed) {
        let _ = std::fs::remove_file(paths::extended(&arrivo));
        esito?;
        return Err(FsError::Io {
            message: "Compressione annullata.".to_string(),
        });
    }

    Ok(paths::display(&arrivo))
}

fn aggiungi(
    zip: &mut zip::ZipWriter<std::fs::File>,
    origine: &Path,
    nome: &str,
    opzioni: SimpleFileOptions,
    annulla: &AtomicBool,
    fatti: &mut u64,
    avanzamento: &mut dyn FnMut(u64),
) -> Result<(), FsError> {
    if annulla.load(Ordering::Relaxed) {
        return Ok(());
    }
    let esteso = paths::extended(origine);
    let meta = std::fs::symlink_metadata(&esteso).map_err(|e| from_io(&e))?;

    if meta.is_dir() {
        zip.add_directory(format!("{}/", nome), opzioni)
            .map_err(errore_zip)?;
        let voci = std::fs::read_dir(&esteso).map_err(|e| from_io(&e))?;
        for v in voci.filter_map(|v| v.ok()) {
            let figlio = format!("{}/{}", nome, v.file_name().to_string_lossy());
            aggiungi(zip, &v.path(), &figlio, opzioni, annulla, fatti, avanzamento)?;
        }
        return Ok(());
    }

    zip.start_file(nome, opzioni).map_err(errore_zip)?;
    let mut f = std::fs::File::open(&esteso).map_err(|e| from_io(&e))?;
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        if annulla.load(Ordering::Relaxed) {
            return Ok(());
        }
        let n = f.read(&mut buf).map_err(|e| from_io(&e))?;
        if n == 0 {
            break;
        }
        zip.write_all(&buf[..n]).map_err(|e| from_io(&e))?;
        *fatti += n as u64;
        avanzamento(*fatti);
    }
    Ok(())
}

/// Byte non compressi dell'archivio, per la barra d'avanzamento.
pub fn peso_archivio(archivio: &str) -> u64 {
    let Ok(f) = std::fs::File::open(paths::extended(Path::new(archivio))) else {
        return 0;
    };
    let Ok(mut z) = zip::ZipArchive::new(f) else {
        return 0;
    };
    (0..z.len())
        .filter_map(|i| z.by_index(i).ok().map(|e| e.size()))
        .sum()
}

/// Estrae l'archivio in una nuova cartella accanto, col suo nome.
/// Ritorna il path della cartella creata.
pub fn estrai(
    archivio: &str,
    annulla: &AtomicBool,
    avanzamento: &mut dyn FnMut(u64),
) -> Result<String, FsError> {
    let sorgente = Path::new(archivio);
    let dir = sorgente.parent().ok_or(FsError::NotFound)?;
    let base = sorgente
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Estratti".to_string());
    let arrivo: PathBuf = dir.join(unique_name(dir, &base));

    let f = std::fs::File::open(paths::extended(sorgente)).map_err(|e| from_io(&e))?;
    let mut z = zip::ZipArchive::new(f).map_err(errore_zip)?;
    std::fs::create_dir_all(paths::extended(&arrivo)).map_err(|e| from_io(&e))?;

    let mut fatti = 0u64;
    for i in 0..z.len() {
        if annulla.load(Ordering::Relaxed) {
            break;
        }
        let mut voce = z.by_index(i).map_err(errore_zip)?;
        // `enclosed_name` rifiuta i nomi con `..` o assoluti: senza, un
        // archivio malevolo potrebbe scrivere fuori dalla cartella.
        let Some(relativo) = voce.enclosed_name() else {
            continue;
        };
        // Ricostruito per componenti: i nomi nello ZIP usano `/`, che col
        // prefisso `\\?\` Windows non converte più in separatore.
        let bersaglio: PathBuf = arrivo.join(relativo.components().collect::<PathBuf>());

        if voce.is_dir() {
            std::fs::create_dir_all(paths::extended(&bersaglio)).map_err(|e| from_io(&e))?;
            continue;
        }
        if let Some(genitore) = bersaglio.parent() {
            std::fs::create_dir_all(paths::extended(genitore)).map_err(|e| from_io(&e))?;
        }
        let mut out =
            std::fs::File::create(paths::extended(&bersaglio)).map_err(|e| from_io(&e))?;
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            let n = voce.read(&mut buf).map_err(|e| from_io(&e))?;
            if n == 0 {
                break;
            }
            out.write_all(&buf[..n]).map_err(|e| from_io(&e))?;
            fatti += n as u64;
            avanzamento(fatti);
        }
    }

    Ok(paths::display(&arrivo))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn comprime_ed_estrae_una_cartella_intatta() {
        let d = tempdir().unwrap();
        let src = d.path().join("progetto");
        fs::create_dir_all(src.join("sotto")).unwrap();
        fs::write(src.join("a.txt"), b"alfa").unwrap();
        fs::write(src.join("sotto").join("b.txt"), b"beta").unwrap();

        let no = AtomicBool::new(false);
        let zip = comprimi(
            &[src.to_string_lossy().into_owned()],
            &d.path().to_string_lossy(),
            &no,
            &mut |_| {},
        )
        .unwrap();
        assert!(zip.ends_with("progetto.zip"));

        let cartella = estrai(&zip, &no, &mut |_| {}).unwrap();
        // «progetto» esiste già: l'estrazione si numera invece di mescolarsi.
        assert!(cartella.ends_with("progetto (2)"));
        let dentro = Path::new(&cartella).join("progetto");
        assert_eq!(fs::read_to_string(dentro.join("a.txt")).unwrap(), "alfa");
        assert_eq!(fs::read_to_string(dentro.join("sotto").join("b.txt")).unwrap(), "beta");
    }

    #[test]
    fn il_nome_di_un_file_perde_l_estensione() {
        let d = tempdir().unwrap();
        let f = d.path().join("nota.txt");
        fs::write(&f, b"x").unwrap();
        assert_eq!(
            nome_archivio(&[f.to_string_lossy().into_owned()], d.path()),
            "nota.zip"
        );
    }

    #[test]
    fn un_archivio_corrotto_da_un_errore_leggibile() {
        let d = tempdir().unwrap();
        let f = d.path().join("rotto.zip");
        fs::write(&f, b"non sono uno zip").unwrap();
        let err = estrai(&f.to_string_lossy(), &AtomicBool::new(false), &mut |_| {}).unwrap_err();
        assert!(matches!(err, FsError::Io { .. }));
    }
}
