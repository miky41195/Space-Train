use crate::fs::error::{from_io, FsError};
use std::process::Command;

/// Opens the path with the default application, like the shell's
/// double click.
///
/// It goes straight to ShellExecuteW and never through `cmd /C start`: cmd
/// interprets `&`, `|` and `^` even inside a file name, and a file
/// called `foto&calc.exe&.jpg` (arrived from another PC) would have started
/// a command at the first click.
#[cfg(windows)]
pub fn open_default(path: &str) -> Result<(), FsError> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let file: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let outcome = unsafe {
        // Some shell extensions want COM on the opening thread; on the
        // worker threads (`lan_open`) it is not there yet. If it already is,
        // the call changes nothing.
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
    // ShellExecute signals success with a value greater than 32.
    if outcome.0 as isize <= 32 {
        return Err(match outcome.0 as isize {
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
    launch(Command::new("xdg-open").arg(path))
}

/// Starts a helper program and reaps it in the background, so it does not
/// linger as a zombie process until the app quits.
#[cfg(not(windows))]
fn launch(command: &mut Command) -> Result<(), FsError> {
    let mut child = command.spawn().map_err(|e| from_io(&e))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// Opens File Explorer selecting the given path.
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
    let folder = crate::fs::paths::parent_of(path).unwrap_or_else(|| path.to_string());
    launch(Command::new("xdg-open").arg(folder))
}

/// Opens a terminal in the folder `folder`.
///
/// Windows Terminal first, if present; otherwise PowerShell in its own console.
/// The folder goes as the process's working directory and not as an
/// argument: that way a root like `C:\` does not carry along the quoting
/// problems of the trailing backslash.
pub fn terminal(folder: &str) -> Result<(), FsError> {
    let dir = std::path::Path::new(folder);
    if !dir.is_dir() {
        return Err(FsError::NotADirectory);
    }
    #[cfg(windows)]
    {
        if Command::new("wt.exe").args(["-d", "."]).current_dir(dir).spawn().is_ok() {
            return Ok(());
        }
        use std::os::windows::process::CommandExt;
        /// The new console: the app has none to lend.
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
        let candidates = [
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
        for t in candidates {
            if launch(Command::new(t).current_dir(dir)).is_ok() {
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

    /// With `cmd /C start` the `&` split the name and the rest ran as a
    /// command, and the open looked successful. Now the name is a name: a
    /// file that does not exist is an error, whatever characters it holds.
    #[test]
    fn a_name_with_an_ampersand_does_not_become_a_command() {
        let name = std::env::temp_dir().join("non-esiste-&echo,INIETTATO&.txt");
        assert!(open_default(&name.to_string_lossy()).is_err());
    }
}
