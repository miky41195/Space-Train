//! The user's own commands run on the selected files.
//!
//! A template is split into words; a word holding a placeholder is quoted
//! whole for the shell (PowerShell on Windows, sh elsewhere), so a file name
//! is always data and never part of the command.

use crate::fs::error::FsError;
use std::path::Path;
use std::process::{Command, Stdio};

/// Windows' limit for one environment variable, where the command travels.
const MAX_COMMAND: usize = 30_000;

/// Placeholders, in Italian and in English.
const FILE: &[&str] = &["{file}"];
const FILES: &[&str] = &["{files}"];
const FOLDER: &[&str] = &["{cartella}", "{folder}"];
const NAME: &[&str] = &["{nome}", "{name}"];

fn refuse(message: &str) -> FsError {
    FsError::Io { message: message.to_string() }
}

fn has(text: &str, names: &[&str]) -> bool {
    names.iter().any(|n| text.contains(n))
}

fn has_any(text: &str) -> bool {
    [FILE, FILES, FOLDER, NAME].iter().any(|n| has(text, n))
}

/// One literal argument for the shell.
fn quote(value: &str, windows: bool) -> String {
    if !windows {
        return format!("'{}'", value.replace('\'', "'\\''"));
    }
    let mut out = String::from("'");
    for c in value.chars() {
        out.push(c);
        // PowerShell closes a single-quoted string on any of these.
        if matches!(c, '\'' | '\u{2018}' | '\u{2019}' | '\u{201a}' | '\u{201b}') {
            out.push(c);
        }
    }
    out.push('\'');
    out
}

/// Words and the blanks between them, as written; quotes keep blanks inside a word.
fn words(template: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut open: Option<char> = None;
    let mut blank = None;
    for c in template.chars() {
        let is_blank = open.is_none() && c.is_whitespace();
        if open == Some(c) {
            open = None;
        } else if open.is_none() && (c == '"' || c == '\'') {
            open = Some(c);
        }
        if blank != Some(is_blank) {
            out.push(String::new());
            blank = Some(is_blank);
        }
        if let Some(w) = out.last_mut() {
            w.push(c);
        }
    }
    out
}

fn fill(word: &str, path: &str) -> String {
    let p = Path::new(path);
    let folder = p.parent().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default();
    let stem = if p.is_dir() { p.file_name() } else { p.file_stem() };
    let name = stem.map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    // One pass: a placeholder inside a file name is not expanded again.
    let mut out = String::new();
    let mut rest = word;
    'scan: while !rest.is_empty() {
        for (names, value) in [(FILE, path), (FOLDER, folder.as_str()), (NAME, name.as_str())] {
            for n in names {
                if let Some(after) = rest.strip_prefix(n) {
                    out.push_str(value);
                    rest = after;
                    continue 'scan;
                }
            }
        }
        let mut chars = rest.chars();
        if let Some(c) = chars.next() {
            out.push(c);
        }
        rest = chars.as_str();
    }
    out
}

/// The word's user quotes go: the whole word is quoted again as one value.
fn unquoted(word: &str) -> String {
    let mut open: Option<char> = None;
    word.chars()
        .filter(|&c| {
            if open == Some(c) {
                open = None;
                return false;
            }
            if open.is_none() && (c == '"' || c == '\'') {
                open = Some(c);
                return false;
            }
            true
        })
        .collect()
}

/// `.cmd` and `.bat` programs re-read their arguments with cmd.exe, which runs `&` and expands `%`.
fn runs_batch(template: &str) -> bool {
    let paths = std::env::var_os("PATH").unwrap_or_default();
    words(template).iter().any(|w| {
        let w = unquoted(w).to_lowercase();
        let w = w.trim_matches(|c: char| !c.is_alphanumeric());
        if w.is_empty() || has_any(w) {
            return false;
        }
        if w.ends_with(".cmd") || w.ends_with(".bat") || matches!(w, "cmd" | "cmd.exe") || w.ends_with("\\cmd.exe") {
            return true;
        }
        std::env::split_paths(&paths).any(|d| ["cmd", "bat"].iter().any(|e| d.join(format!("{w}.{e}")).is_file()))
    })
}

/// cmd.exe would not read this argument as plain text.
fn unsafe_for_batch(value: &str) -> bool {
    value.contains('%') || (value.contains(['&', '|', '<', '>', '^']) && !value.contains(char::is_whitespace))
}

/// The commands to run: one per file, or one for all with `{files}`.
pub fn expand(template: &str, paths: &[String], windows: bool, batch: bool) -> Result<Vec<String>, FsError> {
    let template = template.trim();
    if template.is_empty() || template.contains(['\n', '\r']) {
        return Err(refuse("Il comando deve stare su una riga."));
    }
    if paths.iter().any(|p| p.contains(char::is_control)) {
        return Err(refuse("Il nome di un file contiene caratteri di controllo: l’azione non parte."));
    }
    let all = has(template, FILES);
    if all && (has(template, FILE) || has(template, NAME)) {
        return Err(refuse("{files} non si può usare insieme a {file} o {nome}."));
    }
    let each = has(template, FILE) || has(template, NAME);
    if paths.is_empty() && has_any(template) {
        return Err(refuse("Seleziona almeno un file."));
    }
    let parts = words(template);
    let one = |path: &str| -> Result<String, FsError> {
        let mut line = String::new();
        // At the start of a command PowerShell needs `&` to run a quoted program.
        let mut at_start = true;
        for w in &parts {
            if w.chars().all(char::is_whitespace) {
                line.push(' ');
                continue;
            }
            if !has_any(w) {
                line.push_str(w);
                at_start = w.ends_with([';', '|', '&']);
                continue;
            }
            let values: Vec<String> = if has(w, FILES) {
                if !FILES.contains(&unquoted(w).as_str()) {
                    return Err(refuse("{files} va scritto da solo, separato da spazi."));
                }
                paths.to_vec()
            } else {
                vec![fill(&unquoted(w), path)]
            };
            if batch && values.iter().any(|v| unsafe_for_batch(v)) {
                return Err(refuse("Il nome di un file contiene % o &: questo comando (.cmd o .bat) non lo leggerebbe come testo. Rinomina il file."));
            }
            if at_start && windows {
                line.push_str("& ");
            }
            line.push_str(&values.iter().map(|v| quote(v, windows)).collect::<Vec<_>>().join(" "));
            at_start = false;
        }
        if line.len() > MAX_COMMAND {
            return Err(refuse("Troppi file insieme: il comando diventa troppo lungo."));
        }
        Ok(line)
    };
    if each {
        paths.iter().map(|p| one(p)).collect()
    } else {
        Ok(vec![one(paths.first().map(String::as_str).unwrap_or(""))?])
    }
}

/// What an action would run on these files, for the preview and the terminal.
#[tauri::command]
pub fn action_lines(template: String, paths: Vec<String>) -> Result<Vec<String>, FsError> {
    expand(&template, &paths, cfg!(windows), cfg!(windows) && runs_batch(&template))
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub total: usize,
    pub failed: usize,
    /// Last words of the first failure.
    pub detail: String,
}

fn run_hidden(line: &str, cwd: &str) -> Result<(), String> {
    #[cfg(windows)]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut c = Command::new(crate::terminal::powershell());
        c.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
        c.arg("$ErrorActionPreference='Stop'; $global:LASTEXITCODE=0; try { Invoke-Expression $env:SPACE_TRAIN_ACTION } catch { [Console]::Error.WriteLine($_); exit 1 }; exit $LASTEXITCODE");
        c.creation_flags(CREATE_NO_WINDOW);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("/bin/sh");
        c.args(["-c", "eval \"$SPACE_TRAIN_ACTION\""]);
        c
    };
    if Path::new(cwd).is_dir() {
        cmd.current_dir(cwd);
    }
    // A file and not a pipe: a program left open by the command would keep a pipe open for ever.
    let log = std::env::temp_dir().join(format!("space-train-action-{:032x}.log", fresh_id()));
    let file = std::fs::OpenOptions::new().write(true).create_new(true).open(&log).map_err(|e| e.to_string())?;
    let status = cmd
        .env("SPACE_TRAIN_ACTION", line)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(file)
        .status()
        .map_err(|e| e.to_string());
    let said = std::fs::read(&log).map(|b| String::from_utf8_lossy(&b).trim().to_string()).unwrap_or_default();
    let _ = std::fs::remove_file(&log);
    let status = status?;
    if status.success() {
        return Ok(());
    }
    let last = said.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").chars().take(300).collect::<String>();
    Err(if last.is_empty() { format!("codice {}", status.code().unwrap_or(-1)) } else { last })
}

/// Unique enough for a log name; `create_new` refuses a taken one.
fn fresh_id() -> u128 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    t ^ ((std::process::id() as u128) << 64) ^ ((NEXT.fetch_add(1, Ordering::Relaxed) as u128) << 100)
}

/// Runs an action with no window, one command after the other.
// shortcut: cannot be stopped once started, add it to the job queue if long actions become common
#[tauri::command]
pub async fn action_run(template: String, paths: Vec<String>, cwd: String) -> Result<Outcome, FsError> {
    tauri::async_runtime::spawn_blocking(move || {
        let lines = action_lines(template, paths)?;
        let mut outcome = Outcome { total: lines.len(), failed: 0, detail: String::new() };
        for line in &lines {
            if let Err(e) = run_hidden(line, &cwd) {
                outcome.failed += 1;
                if outcome.detail.is_empty() {
                    outcome.detail = e;
                }
            }
        }
        Ok(outcome)
    })
    .await
    .map_err(|e| FsError::Io { message: e.to_string() })?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(template: &str, paths: &[&str]) -> Result<Vec<String>, FsError> {
        expand(template, &paths.iter().map(|p| p.to_string()).collect::<Vec<_>>(), true, false)
    }

    #[cfg(windows)]
    #[test]
    fn one_command_per_file_or_one_for_all() {
        assert_eq!(win("ffmpeg -i {file} x", &["D:\\a b.mp4", "D:\\c.mp4"]).unwrap(), ["ffmpeg -i 'D:\\a b.mp4' x", "ffmpeg -i 'D:\\c.mp4' x"]);
        assert_eq!(win("code {files}", &["D:\\a", "D:\\b"]).unwrap(), ["code 'D:\\a' 'D:\\b'"]);
        assert_eq!(win("git status", &[]).unwrap(), ["git status"]);
        // The word is one argument, its own quotes included.
        assert_eq!(win("x \"{cartella}\\{nome} small.mp4\"", &["D:\\v\\it's.mp4"]).unwrap(), ["x 'D:\\v\\it''s small.mp4'"]);
        assert_eq!(win("{file} /s", &["D:\\a.exe"]).unwrap(), ["& 'D:\\a.exe' /s"]);
    }

    #[test]
    fn a_name_never_becomes_a_command() {
        assert_eq!(win("x {file}", &["D:\\a'; Remove-Item x.mp4"]).unwrap(), ["x 'D:\\a''; Remove-Item x.mp4'"]);
        assert_eq!(win("x {file}", &["D:\\a\u{2019}; calc"]).unwrap(), ["x 'D:\\a\u{2019}\u{2019}; calc'"]);
        assert_eq!(win("x {file}", &["D:\\$(calc)"]).unwrap(), ["x 'D:\\$(calc)'"]);
        let sh = expand("x {file}", &["/a'; rm x $(id)".to_string()], false, false).unwrap();
        assert_eq!(sh, ["x '/a'\\''; rm x $(id)'"]);
        // A placeholder in the name stays text.
        assert_eq!(expand("x {file}", &["/{nome}".to_string()], false, false).unwrap(), ["x '/{nome}'"]);
        assert!(expand("x {file}", &["/a\nrm x".to_string()], false, false).is_err());
    }

    #[test]
    fn batch_programs_refuse_names_cmd_would_run() {
        let run = |p: &str| expand("code {files}", &[p.to_string()], true, true);
        assert!(run("D:\\a&calc.txt").is_err());
        assert!(run("D:\\%CMDCMDLINE:~-1%.txt").is_err());
        assert!(run("D:\\Foto & Video\\a.txt").is_ok());
    }

    #[test]
    fn mixed_placeholders_are_refused() {
        assert!(win("x {files} {file}", &["D:\\a"]).is_err());
        assert!(win("x --in={files}", &["D:\\a"]).is_err());
        assert!(win("x {file}", &[]).is_err());
    }

    /// The real shell: hostile names reach the program as plain text.
    #[test]
    fn hostile_names_survive_the_real_shell() {
        let d = tempfile::tempdir().unwrap();
        let names = ["a'; New-Item pwned.txt; '.mp4", "$(New-Item pwned.txt).mp4", "q\u{2019}; New-Item pwned.txt; \u{2019}.mp4"];
        for n in names {
            std::fs::write(d.path().join(n), "data").unwrap();
        }
        let paths: Vec<String> = names.iter().map(|n| d.path().join(n).to_string_lossy().into_owned()).collect();
        let template = if cfg!(windows) { "Copy-Item -LiteralPath {file} -Destination {file}.copy" } else { "cp {file} {file}.copy" };
        for line in expand(template, &paths, cfg!(windows), false).unwrap() {
            run_hidden(&line, &d.path().to_string_lossy()).unwrap();
        }
        assert!(!d.path().join("pwned.txt").exists());
        for n in names {
            assert!(d.path().join(format!("{n}.copy")).exists(), "{n}");
        }
        assert!(run_hidden("exit 3", "").is_err());
        assert!(run_hidden("this-program-does-not-exist-st", "").is_err());
    }
}
