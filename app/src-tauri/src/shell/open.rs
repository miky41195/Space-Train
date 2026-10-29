use crate::fs::error::{from_io, FsError};
use std::process::Command;

/// Apre il path con l'applicazione predefinita, come il doppio click della
/// shell.
///
/// Va direttamente a ShellExecuteW e mai attraverso `cmd /C start`: cmd
/// interpreta `&`, `|` e `^` anche dentro un nome di file, e un file
/// chiamato `foto&calc.exe&.jpg` (arrivato da un altro PC) avrebbe fatto
/// partire un comando al primo clic.
#[cfg(windows)]
pub fn open_default(path: &str) -> Result<(), FsError> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let file: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let esito = unsafe {
        // Alcune estensioni della shell vogliono COM sul thread che apre;
        // dai thread di lavoro (`lan_apri`) non c'è ancora. Se c'è già, la
        // chiamata non cambia niente.
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        ShellExecuteW(
            None,
            PCWSTR::null(),
            PCWSTR(file.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    // ShellExecute segnala il successo con un valore maggiore di 32.
    if esito.0 as isize <= 32 {
        return Err(match esito.0 as isize {
            2 | 3 => FsError::NotFound,
            _ => FsError::Io {
                message: "Nessuna applicazione ha potuto aprire il file.".to_string(),
            },
        });
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn open_default(_path: &str) -> Result<(), FsError> {
    Err(FsError::NotFound)
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

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    /// Con `cmd /C start` la `&` spezzava il nome e il resto partiva come
    /// comando, e l'apertura risultava riuscita. Ora il nome è un nome: un
    /// file che non esiste è un errore, qualunque carattere contenga.
    #[test]
    fn un_nome_con_e_commerciale_non_diventa_un_comando() {
        let nome = std::env::temp_dir().join("non-esiste-&echo,INIETTATO&.txt");
        assert!(open_default(&nome.to_string_lossy()).is_err());
    }
}
