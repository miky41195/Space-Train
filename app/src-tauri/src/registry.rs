//! Space Train as the Windows default file manager.
//!
//! Overriding the folders' `open` verb is not enough: Windows merges the
//! user's keys with the system ones, and there `open` has a
//! `DelegateExecute` that sends everything back to Explorer. As alternative
//! file managers do, we register a verb of our own (`spacetrain`) and make it the
//! default for folders and drives. On top of that Win+E is intercepted.
//!
//! All in HKCU: no administrator privilege, effect limited
//! to the user. Before writing, how it was is saved, to be able to put it back.

use crate::fs::error::FsError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
use winreg::RegKey;

const VERB: &str = "spacetrain";
const CLASSES: &str = r"Software\Classes";
/// CLSID of the «File Explorer» folder: the only hook that intercepts Win+E,
/// which launches explorer.exe without going through the folders' verbs.
const CLSID_EXPLORE: &str = "{52205fd8-5dfb-447d-801a-d0b52f2e83e1}";
const TYPES: [&str; 2] = ["Directory", "Drive"];
/// The verbs of Explorer's CLSID: Win+E uses `open`, the taskbar's «New
/// window» uses `opennewwindow`. Both must be taken.
const EXPLORE_VERBS: [&str; 2] = ["open", "opennewwindow"];
/// The verbs many programs ask for by name instead of using the default
/// one: «Open folder» of a Steam game, a download in the browser. Without
/// them, those programs still opened Explorer.
const FOLDER_VERBS: [&str; 2] = ["open", "explore"];

/// How the keys were before we became the default.
#[derive(Serialize, Deserialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    /// Default verb of folders and drives before us (often none).
    pub directory: Option<String>,
    pub drive: Option<String>,
    /// The CLSID key already existed for the user before us.
    #[serde(rename = "clsidEsisteva")]
    pub clsid_existed: bool,
}

fn error(context: &str, e: std::io::Error) -> FsError {
    FsError::Io { message: format!("{}: {}", context, e) }
}

fn command(exe: &str, arg: bool) -> String {
    if arg {
        format!(r#""{}" "%1""#, exe)
    } else {
        format!(r#""{}""#, exe)
    }
}

/// The user's classes. Tests pass a test key in their place, so the real
/// registry is not touched.
pub fn user_classes() -> Result<RegKey, FsError> {
    RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(CLASSES)
        .map(|(k, _)| k)
        .map_err(|e| error("Registro non accessibile", e))
}

/// Reads how things are now, for the backup.
pub fn snapshot(classes: &RegKey) -> Backup {
    let verb = |kind: &str| {
        classes
            .open_subkey_with_flags(format!(r"{}\shell", kind), KEY_READ)
            .ok()
            .and_then(|k| k.get_value::<String, _>("").ok())
            .filter(|v| v != VERB)
    };
    Backup {
        directory: verb("Directory"),
        drive: verb("Drive"),
        clsid_existed: classes.open_subkey(format!(r"CLSID\{}", CLSID_EXPLORE)).is_ok(),
    }
}

/// Makes `exe` the default file manager.
pub fn apply(classes: &RegKey, exe: &str) -> Result<(), FsError> {
    let write = |e: std::io::Error| error("Impossibile scrivere nel registro", e);

    for kind in TYPES {
        let (shell, _) = classes.create_subkey(format!(r"{}\shell", kind)).map_err(write)?;
        let (verb, _) = shell.create_subkey(VERB).map_err(write)?;
        verb.set_value("", &"Apri con Space Train").map_err(write)?;
        let (cmd, _) = verb.create_subkey("command").map_err(write)?;
        cmd.set_value("", &command(exe, true)).map_err(write)?;
        // The default verb is what Windows runs on double click.
        shell.set_value("", &VERB).map_err(write)?;

        for name in FOLDER_VERBS {
            let (cmd, _) = shell.create_subkey(format!(r"{}\command", name)).map_err(write)?;
            cmd.set_value("", &command(exe, true)).map_err(write)?;
            // Empty but present, as for Win+E: it covers the system one.
            cmd.set_value("DelegateExecute", &"").map_err(write)?;
        }
    }

    for verb in EXPLORE_VERBS {
        let (cmd, _) = classes
            .create_subkey(format!(r"CLSID\{}\shell\{}\command", CLSID_EXPLORE, verb))
            .map_err(write)?;
        cmd.set_value("", &command(exe, false)).map_err(write)?;
        // Empty but present: it hides the system one, which would reopen Explorer.
        cmd.set_value("DelegateExecute", &"").map_err(write)?;
    }
    Ok(())
}

/// Puts things back as they were before `apply`.
pub fn restore(classes: &RegKey, backup: &Backup) -> Result<(), FsError> {
    let write = |e: std::io::Error| error("Impossibile scrivere nel registro", e);

    for (kind, before) in [("Directory", &backup.directory), ("Drive", &backup.drive)] {
        if let Ok(shell) = classes.open_subkey_with_flags(format!(r"{}\shell", kind), KEY_READ | KEY_WRITE) {
            let _ = shell.delete_subkey_all(VERB);
            match before {
                Some(v) => shell.set_value("", v).map_err(write)?,
                None => {
                    let _ = shell.delete_value("");
                }
            }
            // The verbs by name are removed only if they are ours: another
            // program could have written one of its own.
            for name in FOLDER_VERBS {
                if let Ok(cmd) = shell.open_subkey(format!(r"{}\command", name)) {
                    let v: String = cmd.get_value("").unwrap_or_default();
                    if v.to_lowercase().contains("space train") || v.to_lowercase().contains("app.exe") {
                        let _ = shell.delete_subkey_all(name);
                    }
                }
            }
        }
    }

    if backup.clsid_existed {
        for verb in EXPLORE_VERBS {
            let _ = classes.delete_subkey_all(format!(r"CLSID\{}\shell\{}", CLSID_EXPLORE, verb));
        }
    } else {
        let _ = classes.delete_subkey_all(format!(r"CLSID\{}", CLSID_EXPLORE));
    }
    Ok(())
}

/// If Space Train is already the default, rewrites the keys with the current
/// executable. After an update or a reinstall the path can change, and new
/// versions can add verbs: that way whoever had chosen Space Train finds it
/// again without redoing it. Returns true if it wrote.
pub fn realign(classes: &RegKey, exe: &str) -> Result<bool, FsError> {
    let ours = classes
        .open_subkey_with_flags(r"Directory\shell", KEY_READ)
        .and_then(|k| k.get_value::<String, _>(""))
        .map(|v| v == VERB)
        .unwrap_or(false);
    if !ours {
        return Ok(false);
    }
    apply(classes, exe)?;
    Ok(true)
}

/// True if folders and drives open with this `exe`.
pub fn is_default(classes: &RegKey, exe: &str) -> bool {
    TYPES.iter().all(|kind| {
        let verb_ok = classes
            .open_subkey_with_flags(format!(r"{}\shell", kind), KEY_READ)
            .and_then(|k| k.get_value::<String, _>(""))
            .map(|v| v == VERB)
            .unwrap_or(false);
        let cmd_ok = classes
            .open_subkey_with_flags(format!(r"{}\shell\{}\command", kind, VERB), KEY_READ)
            .and_then(|k| k.get_value::<String, _>(""))
            .map(|v| v.to_lowercase().contains(&exe.to_lowercase()))
            .unwrap_or(false);
        verb_ok && cmd_ok
    })
}

fn file_backup(dir: &Path) -> PathBuf {
    dir.join("predefinito-backup.json")
}

/// Saves the backup, without overwriting an existing one: if the user sets
/// it twice, what counts is the state before the first time.
pub fn save_backup(dir: &Path, b: &Backup) -> Result<PathBuf, FsError> {
    std::fs::create_dir_all(dir).map_err(|e| error("Cartella del backup non creata", e))?;
    let f = file_backup(dir);
    if !f.exists() {
        let data = serde_json::to_vec_pretty(b).map_err(|e| FsError::Io { message: e.to_string() })?;
        std::fs::write(&f, data).map_err(|e| error("Backup non salvato", e))?;
    }
    Ok(f)
}

pub fn read_backup(dir: &Path) -> Backup {
    std::fs::read(file_backup(dir))
        .ok()
        .and_then(|d| serde_json::from_slice(&d).ok())
        .unwrap_or_default()
}

pub fn delete_backup(dir: &Path) {
    let _ = std::fs::remove_file(file_backup(dir));
}

/// Tells the Shell the associations have changed: without it, Explorer can
/// keep using the ones it had in memory.
pub fn notify_shell() {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_IDLIST};
        SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Classi finte dentro HKCU\Software\SpaceTrainTest, cancellate alla fine.
    struct Fixture {
        name: String,
    }

    impl Fixture {
        fn new(name: &str) -> (Fixture, RegKey) {
            let location = format!(r"Software\SpaceTrainTest\{}", name);
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let _ = hkcu.delete_subkey_all(&location);
            let (k, _) = hkcu.create_subkey(&location).unwrap();
            (Fixture { name: location }, k)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&self.name);
        }
    }

    const EXE: &str = r"C:\Users\x\AppData\Local\Space Train\Space Train.exe";

    #[test]
    fn apply_makes_default_with_its_own_verb() {
        let (_p, classes) = Fixture::new("applica");
        assert!(!is_default(&classes, EXE));

        apply(&classes, EXE).unwrap();
        assert!(is_default(&classes, EXE));

        let shell = classes.open_subkey(r"Directory\shell").unwrap();
        assert_eq!(shell.get_value::<String, _>("").unwrap(), "spacetrain");
        let cmd: String = classes
            .open_subkey(r"Directory\shell\spacetrain\command")
            .unwrap()
            .get_value("")
            .unwrap();
        assert_eq!(cmd, format!(r#""{}" "%1""#, EXE));

        // Win+E: command without argument and empty DelegateExecute.
        let clsid = classes
            .open_subkey(format!(r"CLSID\{}\shell\opennewwindow\command", CLSID_EXPLORE))
            .unwrap();
        assert_eq!(clsid.get_value::<String, _>("DelegateExecute").unwrap(), "");
        assert!(!is_default(&classes, r"C:\altro\programma.exe"));
    }

    #[test]
    fn verbs_asked_by_name_also_open_space_train() {
        let (_p, classes) = Fixture::new("verbi");
        apply(&classes, EXE).unwrap();
        for verb in ["open", "explore"] {
            let cmd = classes.open_subkey(format!(r"Directory\shell\{}\command", verb)).unwrap();
            assert_eq!(cmd.get_value::<String, _>("").unwrap(), format!(r#""{}" "%1""#, EXE));
            assert_eq!(cmd.get_value::<String, _>("DelegateExecute").unwrap(), "");
        }
        restore(&classes, &Backup::default()).unwrap();
        assert!(classes.open_subkey(r"Directory\shell\open").is_err());
        assert!(classes.open_subkey(r"Drive\shell\explore").is_err());
    }

    #[test]
    fn realign_updates_the_path_only_if_already_default() {
        let (_p, classes) = Fixture::new("riallinea");
        assert!(!realign(&classes, EXE).unwrap());
        assert!(!is_default(&classes, EXE));

        apply(&classes, r"C:\vecchio\app.exe").unwrap();
        assert!(realign(&classes, EXE).unwrap());
        assert!(is_default(&classes, EXE));
    }

    #[test]
    fn restore_puts_back_as_it_was() {
        let (_p, classes) = Fixture::new("ripristina");
        // Another program already had a default verb for drives.
        let (shell, _) = classes.create_subkey(r"Drive\shell").unwrap();
        shell.set_value("", &"altroprogramma").unwrap();

        let before = snapshot(&classes);
        assert_eq!(before.drive.as_deref(), Some("altroprogramma"));
        assert_eq!(before.directory, None);

        apply(&classes, EXE).unwrap();
        restore(&classes, &before).unwrap();

        assert!(!is_default(&classes, EXE));
        assert_eq!(
            classes.open_subkey(r"Drive\shell").unwrap().get_value::<String, _>("").unwrap(),
            "altroprogramma"
        );
        assert!(classes
            .open_subkey(r"Directory\shell")
            .unwrap()
            .get_value::<String, _>("")
            .is_err());
        assert!(classes.open_subkey(r"Directory\shell\spacetrain").is_err());
        assert!(classes.open_subkey(format!(r"CLSID\{}", CLSID_EXPLORE)).is_err());
    }

    #[test]
    fn snapshotting_twice_does_not_mistake_us_for_the_original_state() {
        let (_p, classes) = Fixture::new("doppio");
        apply(&classes, EXE).unwrap();
        // If the backup were redone now, the «spacetrain» verb must not
        // show up as the original one to put back.
        assert_eq!(snapshot(&classes).directory, None);
    }

    #[test]
    fn the_backup_is_not_overwritten() {
        let d = tempfile::tempdir().unwrap();
        let first = Backup { directory: Some("uno".into()), drive: None, clsid_existed: false };
        save_backup(d.path(), &first).unwrap();
        save_backup(d.path(), &Backup::default()).unwrap();
        assert_eq!(read_backup(d.path()), first);
        delete_backup(d.path());
        assert_eq!(read_backup(d.path()), Backup::default());
    }
}
