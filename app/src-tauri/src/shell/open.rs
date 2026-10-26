use crate::fs::error::{from_io, FsError};
use std::process::Command;

/// Apre il path con l'applicazione predefinita.
/// Usa il verbo `start` di cmd, che replica il doppio click della shell.
pub fn open_default(path: &str) -> Result<(), FsError> {
    Command::new("cmd")
        .args(["/C", "start", "", path])
        .spawn()
        .map(|_| ())
        .map_err(|e| from_io(&e))
}

/// Apre Esplora risorse selezionando il path indicato.
pub fn reveal(path: &str) -> Result<(), FsError> {
    Command::new("explorer")
        .arg(format!("/select,{}", path))
        .spawn()
        .map(|_| ())
        .map_err(|e| from_io(&e))
}

/// Apre un terminale nella cartella `cartella`.
///
/// Prima Windows Terminal, se c'è; altrimenti PowerShell in una console sua.
/// La cartella passa come cartella di lavoro del processo e non come
/// argomento: così una radice come `C:\` non si porta dietro i problemi
/// di virgolette della barra finale.
pub fn terminale(cartella: &str) -> Result<(), FsError> {
    let dir = std::path::Path::new(cartella);
    if !dir.is_dir() {
        return Err(FsError::NotADirectory);
    }
    if Command::new("wt.exe").args(["-d", "."]).current_dir(dir).spawn().is_ok() {
        return Ok(());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        /// La console nuova: l'app non ne ha una da prestare.
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        Command::new("powershell.exe")
            .arg("-NoExit")
            .current_dir(dir)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map(|_| ())
            .map_err(|e| from_io(&e))
    }
    #[cfg(not(windows))]
    Err(FsError::NotFound)
}
