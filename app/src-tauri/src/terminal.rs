//! Integrated terminal: a real shell in a pseudo-console (ConPTY on
//! Windows), drawn by xterm.js in the frontend.
//!
//! Output goes to the frontend through a channel as text; a UTF-8 character
//! split between two reads is held back until it is whole.

use crate::fs::error::FsError;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::ipc::Channel;

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TerminalEvent {
    Data { text: String },
    /// The shell ended (typed `exit`, or closed).
    Exit,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

static SESSIONS: Mutex<Option<HashMap<u32, Session>>> = Mutex::new(None);
static NEXT: AtomicU32 = AtomicU32::new(1);

fn io(e: impl std::fmt::Display) -> FsError {
    FsError::Io { message: format!("Terminale non disponibile: {}", e) }
}

/// The shell: PowerShell 7 if installed, else Windows PowerShell; `$SHELL` elsewhere.
fn shell() -> CommandBuilder {
    #[cfg(windows)]
    {
        let on_path = |exe: &str| {
            std::env::var_os("PATH")
                .map(|p| std::env::split_paths(&p).any(|d| d.join(exe).is_file()))
                .unwrap_or(false)
        };
        let mut c = CommandBuilder::new(if on_path("pwsh.exe") { "pwsh.exe" } else { "powershell.exe" });
        c.arg("-NoLogo");
        c
    }
    #[cfg(not(windows))]
    {
        CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into()))
    }
}

/// The longest prefix of `buf` that is whole UTF-8; the rest waits for more bytes.
pub fn take_text(buf: &mut Vec<u8>) -> String {
    let cut = match std::str::from_utf8(buf) {
        Ok(_) => buf.len(),
        // An invalid byte (not just a cut one) is shown as � and skipped.
        Err(e) if e.error_len().is_some() => buf.len(),
        Err(e) => e.valid_up_to(),
    };
    let rest = buf.split_off(cut);
    let text = String::from_utf8_lossy(buf).into_owned();
    *buf = rest;
    text
}

pub fn open(cwd: &str, cols: u16, rows: u16, events: Channel<TerminalEvent>) -> Result<u32, FsError> {
    let pty = native_pty_system()
        .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
        .map_err(io)?;
    let mut cmd = shell();
    if std::path::Path::new(cwd).is_dir() {
        cmd.cwd(cwd);
    }
    let child = pty.slave.spawn_command(cmd).map_err(io)?;
    drop(pty.slave);
    let mut reader = pty.master.try_clone_reader().map_err(io)?;
    let writer = pty.master.take_writer().map_err(io)?;
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    SESSIONS
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(id, Session { master: pty.master, writer, child });

    std::thread::spawn(move || {
        let mut chunk = [0u8; 8192];
        let mut pending = Vec::new();
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&chunk[..n]);
                    let text = take_text(&mut pending);
                    if !text.is_empty() && events.send(TerminalEvent::Data { text }).is_err() {
                        break;
                    }
                }
            }
        }
        let _ = events.send(TerminalEvent::Exit);
        close(id);
    });
    Ok(id)
}

fn with<T>(id: u32, f: impl FnOnce(&mut Session) -> Result<T, FsError>) -> Result<T, FsError> {
    let mut all = SESSIONS.lock().unwrap();
    let s = all.as_mut().and_then(|m| m.get_mut(&id)).ok_or(FsError::NotFound)?;
    f(s)
}

pub fn write(id: u32, data: &str) -> Result<(), FsError> {
    with(id, |s| {
        s.writer.write_all(data.as_bytes()).map_err(io)?;
        s.writer.flush().map_err(io)
    })
}

pub fn resize(id: u32, cols: u16, rows: u16) -> Result<(), FsError> {
    with(id, |s| {
        s.master
            .resize(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
            .map_err(io)
    })
}

/// Ends the shell; nothing if it already ended.
pub fn close(id: u32) {
    let session = SESSIONS.lock().unwrap().as_mut().and_then(|m| m.remove(&id));
    if let Some(mut s) = session {
        let _ = s.child.kill();
    }
}

#[cfg(test)]
mod test {
    use super::take_text;

    #[test]
    fn holds_back_a_character_cut_in_two() {
        let mut buf = "caffè".as_bytes().to_vec();
        let last = buf.pop().unwrap();
        assert_eq!(take_text(&mut buf), "caff");
        assert_eq!(buf.len(), 1);
        buf.push(last);
        assert_eq!(take_text(&mut buf), "è");
        assert!(buf.is_empty());
    }
}
