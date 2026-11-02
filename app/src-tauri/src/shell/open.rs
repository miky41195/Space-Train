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

/// Opens with the desktop's default application through `xdg-open`. The
/// path is one argument, never a shell line: no name can become a command.
#[cfg(not(windows))]
pub fn open_default(path: &str) -> Result<(), FsError> {
    if !std::path::Path::new(path).exists() {
        return Err(FsError::NotFound);
    }
    lancia(Command::new("xdg-open").arg(path))
}

/// Starts a helper program and reaps it in the background, so it does not
/// linger as a zombie process until the app quits.
#[cfg(not(windows))]
fn lancia(comando: &mut Command) -> Result<(), FsError> {
    let mut figlio = comando.spawn().map_err(|e| from_io(&e))?;
    std::thread::spawn(move || {
        let _ = figlio.wait();
    });
    Ok(())
}

/// Apre Esplora risorse selezionando il path indicato.
#[cfg(windows)]
pub fn reveal(path: &str) -> Result<(), FsError> {
    Command::new("explorer")
        .arg(format!("/select,{}", path))
        .spawn()
        .map(|_| ())
        .map_err(|e| from_io(&e))
}

/// Opens the folder that contains `path` in the desktop's file manager.
#[cfg(not(windows))]
pub fn reveal(path: &str) -> Result<(), FsError> {
    let cartella = crate::fs::paths::parent_of(path).unwrap_or_else(|| path.to_string());
    lancia(Command::new("xdg-open").arg(cartella))
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
    #[cfg(windows)]
    {
        if Command::new("wt.exe").args(["-d", "."]).current_dir(dir).spawn().is_ok() {
            return Ok(());
        }
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
    {
        // The desktop's own terminal first, then the common ones.
        let candidati = [
            "x-terminal-emulator",
            "gnome-terminal",
            "konsole",
            "xfce4-terminal",
            "kgx",
            "ptyxis",
            "tilix",
            "kitty",
            "alacritty",
            "foot",
            "xterm",
        ];
        for t in candidati {
            if lancia(Command::new(t).current_dir(dir)).is_ok() {
                return Ok(());
            }
        }
        Err(FsError::Io {
            message: "Nessun terminale trovato.".to_string(),
        })
    }
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
