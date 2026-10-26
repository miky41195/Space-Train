//! Space Train come file manager predefinito di Windows.
//!
//! Sovrascrivere il verbo `open` delle cartelle non basta: Windows unisce le
//! chiavi dell'utente con quelle di sistema, e lì `open` ha un
//! `DelegateExecute` che riporta tutto a Esplora. Come fanno i file manager
//! alternativi, si registra un verbo nostro (`spacetrain`) e lo si rende il
//! predefinito per cartelle e dischi. In più si intercetta Win+E.
//!
//! Tutto in HKCU: nessun privilegio d'amministratore, effetto limitato
//! all'utente. Prima di scrivere si salva com'era, per poterlo rimettere.

use crate::fs::error::FsError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
use winreg::RegKey;

const VERBO: &str = "spacetrain";
const CLASSI: &str = r"Software\Classes";
/// CLSID della cartella «Esplora file»: l'unico aggancio che intercetta Win+E,
/// che lancia explorer.exe senza passare dai verbi delle cartelle.
const CLSID_ESPLORA: &str = "{52205fd8-5dfb-447d-801a-d0b52f2e83e1}";
const TIPI: [&str; 2] = ["Directory", "Drive"];
/// I verbi del CLSID di Esplora: Win+E usa `open`, «Nuova finestra» della
/// barra delle applicazioni usa `opennewwindow`. Vanno presi entrambi.
const VERBI_ESPLORA: [&str; 2] = ["open", "opennewwindow"];

/// Com'erano le chiavi prima di diventare predefiniti.
#[derive(Serialize, Deserialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    /// Verbo predefinito di cartelle e dischi prima di noi (spesso nessuno).
    pub directory: Option<String>,
    pub drive: Option<String>,
    /// La chiave del CLSID esisteva già nell'utente prima di noi.
    pub clsid_esisteva: bool,
}

fn errore(contesto: &str, e: std::io::Error) -> FsError {
    FsError::Io { message: format!("{}: {}", contesto, e) }
}

fn comando(exe: &str, argomento: bool) -> String {
    if argomento {
        format!(r#""{}" "%1""#, exe)
    } else {
        format!(r#""{}""#, exe)
    }
}

/// Le classi dell'utente. Nei test si passa una chiave di prova al loro
/// posto, così il registro vero non viene toccato.
pub fn classi_utente() -> Result<RegKey, FsError> {
    RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(CLASSI)
        .map(|(k, _)| k)
        .map_err(|e| errore("Registro non accessibile", e))
}

/// Legge com'è la situazione adesso, per il backup.
pub fn fotografa(classi: &RegKey) -> Backup {
    let verbo = |tipo: &str| {
        classi
            .open_subkey_with_flags(format!(r"{}\shell", tipo), KEY_READ)
            .ok()
            .and_then(|k| k.get_value::<String, _>("").ok())
            .filter(|v| v != VERBO)
    };
    Backup {
        directory: verbo("Directory"),
        drive: verbo("Drive"),
        clsid_esisteva: classi.open_subkey(format!(r"CLSID\{}", CLSID_ESPLORA)).is_ok(),
    }
}

/// Rende `exe` il file manager predefinito.
pub fn applica(classi: &RegKey, exe: &str) -> Result<(), FsError> {
    let scrivi = |e: std::io::Error| errore("Impossibile scrivere nel registro", e);

    for tipo in TIPI {
        let (shell, _) = classi.create_subkey(format!(r"{}\shell", tipo)).map_err(scrivi)?;
        let (verbo, _) = shell.create_subkey(VERBO).map_err(scrivi)?;
        verbo.set_value("", &"Apri con Space Train").map_err(scrivi)?;
        let (cmd, _) = verbo.create_subkey("command").map_err(scrivi)?;
        cmd.set_value("", &comando(exe, true)).map_err(scrivi)?;
        // Il verbo predefinito è ciò che Windows esegue al doppio clic.
        shell.set_value("", &VERBO).map_err(scrivi)?;
    }

    for verbo in VERBI_ESPLORA {
        let (cmd, _) = classi
            .create_subkey(format!(r"CLSID\{}\shell\{}\command", CLSID_ESPLORA, verbo))
            .map_err(scrivi)?;
        cmd.set_value("", &comando(exe, false)).map_err(scrivi)?;
        // Vuoto ma presente: nasconde quello di sistema, che riaprirebbe Esplora.
        cmd.set_value("DelegateExecute", &"").map_err(scrivi)?;
    }
    Ok(())
}

/// Rimette le cose come erano prima di `applica`.
pub fn ripristina(classi: &RegKey, backup: &Backup) -> Result<(), FsError> {
    let scrivi = |e: std::io::Error| errore("Impossibile scrivere nel registro", e);

    for (tipo, prima) in [("Directory", &backup.directory), ("Drive", &backup.drive)] {
        if let Ok(shell) = classi.open_subkey_with_flags(format!(r"{}\shell", tipo), KEY_READ | KEY_WRITE) {
            let _ = shell.delete_subkey_all(VERBO);
            match prima {
                Some(v) => shell.set_value("", v).map_err(scrivi)?,
                None => {
                    let _ = shell.delete_value("");
                }
            }
            // Il metodo delle versioni precedenti scriveva qui: se ne è
            // rimasto qualcosa di nostro, lo si toglie.
            if let Ok(cmd) = shell.open_subkey(r"open\command") {
                let v: String = cmd.get_value("").unwrap_or_default();
                if v.to_lowercase().contains("space train") || v.to_lowercase().contains("app.exe") {
                    let _ = shell.delete_subkey_all("open");
                }
            }
        }
    }

    if backup.clsid_esisteva {
        for verbo in VERBI_ESPLORA {
            let _ = classi.delete_subkey_all(format!(r"CLSID\{}\shell\{}", CLSID_ESPLORA, verbo));
        }
    } else {
        let _ = classi.delete_subkey_all(format!(r"CLSID\{}", CLSID_ESPLORA));
    }
    Ok(())
}

/// Vero se cartelle e dischi si aprono con questo `exe`.
pub fn e_predefinito(classi: &RegKey, exe: &str) -> bool {
    TIPI.iter().all(|tipo| {
        let verbo_ok = classi
            .open_subkey_with_flags(format!(r"{}\shell", tipo), KEY_READ)
            .and_then(|k| k.get_value::<String, _>(""))
            .map(|v| v == VERBO)
            .unwrap_or(false);
        let cmd_ok = classi
            .open_subkey_with_flags(format!(r"{}\shell\{}\command", tipo, VERBO), KEY_READ)
            .and_then(|k| k.get_value::<String, _>(""))
            .map(|v| v.to_lowercase().contains(&exe.to_lowercase()))
            .unwrap_or(false);
        verbo_ok && cmd_ok
    })
}

fn file_backup(dir: &Path) -> PathBuf {
    dir.join("predefinito-backup.json")
}

/// Salva il backup, senza sovrascriverne uno già esistente: se l'utente
/// imposta due volte, conta lo stato di prima della prima volta.
pub fn salva_backup(dir: &Path, b: &Backup) -> Result<PathBuf, FsError> {
    std::fs::create_dir_all(dir).map_err(|e| errore("Cartella del backup non creata", e))?;
    let f = file_backup(dir);
    if !f.exists() {
        let dati = serde_json::to_vec_pretty(b).map_err(|e| FsError::Io { message: e.to_string() })?;
        std::fs::write(&f, dati).map_err(|e| errore("Backup non salvato", e))?;
    }
    Ok(f)
}

pub fn leggi_backup(dir: &Path) -> Backup {
    std::fs::read(file_backup(dir))
        .ok()
        .and_then(|d| serde_json::from_slice(&d).ok())
        .unwrap_or_default()
}

pub fn elimina_backup(dir: &Path) {
    let _ = std::fs::remove_file(file_backup(dir));
}

/// Avvisa la Shell che le associazioni sono cambiate: senza, Esplora può
/// continuare a usare quelle che aveva in memoria.
pub fn avvisa_shell() {
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
    struct Prova {
        nome: String,
    }

    impl Prova {
        fn nuova(nome: &str) -> (Prova, RegKey) {
            let percorso = format!(r"Software\SpaceTrainTest\{}", nome);
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let _ = hkcu.delete_subkey_all(&percorso);
            let (k, _) = hkcu.create_subkey(&percorso).unwrap();
            (Prova { nome: percorso }, k)
        }
    }

    impl Drop for Prova {
        fn drop(&mut self) {
            let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&self.nome);
        }
    }

    const EXE: &str = r"C:\Users\x\AppData\Local\Space Train\Space Train.exe";

    #[test]
    fn applica_rende_predefinito_con_un_verbo_proprio() {
        let (_p, classi) = Prova::nuova("applica");
        assert!(!e_predefinito(&classi, EXE));

        applica(&classi, EXE).unwrap();
        assert!(e_predefinito(&classi, EXE));

        let shell = classi.open_subkey(r"Directory\shell").unwrap();
        assert_eq!(shell.get_value::<String, _>("").unwrap(), "spacetrain");
        let cmd: String = classi
            .open_subkey(r"Directory\shell\spacetrain\command")
            .unwrap()
            .get_value("")
            .unwrap();
        assert_eq!(cmd, format!(r#""{}" "%1""#, EXE));

        // Win+E: comando senza argomento e DelegateExecute vuoto.
        let clsid = classi
            .open_subkey(format!(r"CLSID\{}\shell\opennewwindow\command", CLSID_ESPLORA))
            .unwrap();
        assert_eq!(clsid.get_value::<String, _>("DelegateExecute").unwrap(), "");
        assert!(!e_predefinito(&classi, r"C:\altro\programma.exe"));
    }

    #[test]
    fn ripristina_rimette_com_era() {
        let (_p, classi) = Prova::nuova("ripristina");
        // Un altro programma aveva già un verbo predefinito per i dischi.
        let (shell, _) = classi.create_subkey(r"Drive\shell").unwrap();
        shell.set_value("", &"altroprogramma").unwrap();

        let prima = fotografa(&classi);
        assert_eq!(prima.drive.as_deref(), Some("altroprogramma"));
        assert_eq!(prima.directory, None);

        applica(&classi, EXE).unwrap();
        ripristina(&classi, &prima).unwrap();

        assert!(!e_predefinito(&classi, EXE));
        assert_eq!(
            classi.open_subkey(r"Drive\shell").unwrap().get_value::<String, _>("").unwrap(),
            "altroprogramma"
        );
        assert!(classi
            .open_subkey(r"Directory\shell")
            .unwrap()
            .get_value::<String, _>("")
            .is_err());
        assert!(classi.open_subkey(r"Directory\shell\spacetrain").is_err());
        assert!(classi.open_subkey(format!(r"CLSID\{}", CLSID_ESPLORA)).is_err());
    }

    #[test]
    fn fotografare_due_volte_non_scambia_noi_per_lo_stato_originale() {
        let (_p, classi) = Prova::nuova("doppio");
        applica(&classi, EXE).unwrap();
        // Se il backup venisse rifatto adesso, il verbo «spacetrain» non
        // deve risultare come quello originale da rimettere.
        assert_eq!(fotografa(&classi).directory, None);
    }

    #[test]
    fn il_backup_non_si_sovrascrive() {
        let d = tempfile::tempdir().unwrap();
        let primo = Backup { directory: Some("uno".into()), drive: None, clsid_esisteva: false };
        salva_backup(d.path(), &primo).unwrap();
        salva_backup(d.path(), &Backup::default()).unwrap();
        assert_eq!(leggi_backup(d.path()), primo);
        elimina_backup(d.path());
        assert_eq!(leggi_backup(d.path()), Backup::default());
    }
}
