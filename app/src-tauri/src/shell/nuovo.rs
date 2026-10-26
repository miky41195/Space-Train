//! Il menu «Nuovo» di Esplora: cartella e i tipi di file che i programmi
//! installati hanno registrato (documento di testo, Word, Excel, ZIP…).
//!
//! Windows li elenca leggendo le chiavi `ShellNew` nel registro: sotto
//! l'estensione stessa o sotto il suo ProgID. Ogni chiave dice come nasce
//! il file nuovo: vuoto (`NullFile`), copiato da un modello (`FileName`) o
//! con dei byte fissi (`Data`).

use crate::fs::copy::unique_name;
use crate::fs::error::{from_io, FsError};
use crate::fs::paths;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TipoNuovo {
    /// Estensione con il punto, es. ".txt".
    pub ext: String,
    /// Nome mostrato nel menu, es. "Documento di testo".
    pub nome: String,
}

#[derive(Debug, Clone)]
enum Contenuto {
    Vuoto,
    Modello(String),
    Dati(Vec<u8>),
}

#[derive(Debug, Clone)]
struct Voce {
    tipo: TipoNuovo,
    contenuto: Contenuto,
}

/// Il registro si legge una volta: sono migliaia di chiavi, e i tipi
/// installati non cambiano mentre l'app è aperta.
static TIPI: OnceLock<Vec<Voce>> = OnceLock::new();

fn tipi() -> &'static [Voce] {
    TIPI.get_or_init(|| {
        let mut v = leggi_registro();
        // Il documento di testo c'è sempre, anche se il registro non lo dice.
        if !v.iter().any(|x| x.tipo.ext == ".txt") {
            v.push(Voce {
                tipo: TipoNuovo { ext: ".txt".into(), nome: "Documento di testo".into() },
                contenuto: Contenuto::Vuoto,
            });
        }
        v.sort_by(|a, b| a.tipo.nome.to_lowercase().cmp(&b.tipo.nome.to_lowercase()));
        v
    })
}

pub fn elenca() -> Vec<TipoNuovo> {
    tipi().iter().map(|v| v.tipo.clone()).collect()
}

/// Crea dentro `parent` un file nuovo del tipo `ext`, col nome che gli
/// darebbe Esplora («Nuovo Documento di testo.txt», numerato se occupato).
pub fn crea(parent: &str, ext: &str) -> Result<String, FsError> {
    let voce = tipi()
        .iter()
        .find(|v| v.tipo.ext.eq_ignore_ascii_case(ext))
        .cloned()
        .unwrap_or(Voce {
            tipo: TipoNuovo { ext: ext.to_string(), nome: format!("File {}", ext.trim_start_matches('.').to_uppercase()) },
            contenuto: Contenuto::Vuoto,
        });

    let dir = Path::new(parent);
    let nome = unique_name(dir, &format!("Nuovo {}{}", voce.tipo.nome, voce.tipo.ext));
    let arrivo = dir.join(&nome);

    let dati: Vec<u8> = match &voce.contenuto {
        Contenuto::Vuoto => Vec::new(),
        Contenuto::Dati(d) => d.clone(),
        // Un modello introvabile non impedisce di creare il file: nasce vuoto.
        Contenuto::Modello(m) => trova_modello(m)
            .and_then(|p| std::fs::read(p).ok())
            .unwrap_or_default(),
    };

    std::fs::write(paths::extended(&arrivo), dati).map_err(|e| from_io(&e))?;
    Ok(paths::display(&arrivo))
}

/// I modelli con path relativo stanno in una delle cartelle «Templates».
fn trova_modello(nome: &str) -> Option<PathBuf> {
    let espanso = espandi(nome);
    let diretto = PathBuf::from(&espanso);
    if diretto.is_absolute() {
        return diretto.exists().then_some(diretto);
    }
    let cartelle = [
        std::env::var("WINDIR").ok().map(|w| format!(r"{}\ShellNew", w)),
        std::env::var("APPDATA").ok().map(|a| format!(r"{}\Microsoft\Windows\Templates", a)),
        std::env::var("ProgramData").ok().map(|p| format!(r"{}\Microsoft\Windows\Templates", p)),
    ];
    cartelle
        .into_iter()
        .flatten()
        .map(|c| Path::new(&c).join(&espanso))
        .find(|p| p.exists())
}

fn espandi(s: &str) -> String {
    let mut out = s.to_string();
    for (k, v) in std::env::vars() {
        out = out.replace(&format!("%{}%", k), &v);
        out = out.replace(&format!("%{}%", k.to_uppercase()), &v);
    }
    out
}

#[cfg(windows)]
fn leggi_registro() -> Vec<Voce> {
    use winreg::enums::HKEY_CLASSES_ROOT;
    use winreg::RegKey;

    let radice = RegKey::predef(HKEY_CLASSES_ROOT);
    let mut out: Vec<Voce> = Vec::new();

    // Il collegamento nasce da una procedura guidata e la raccolta è una
    // funzione della Shell: scritti come file vuoti sarebbero rotti.
    const ESCLUSI: [&str; 2] = [".lnk", ".library-ms"];

    for ext in radice
        .enum_keys()
        .filter_map(|k| k.ok())
        .filter(|k| k.starts_with('.') && !ESCLUSI.contains(&k.to_lowercase().as_str()))
    {
        let Ok(chiave) = radice.open_subkey(&ext) else { continue };
        let progid: String = chiave.get_value("").unwrap_or_default();

        // ShellNew sotto l'estensione o sotto il suo ProgID, come cerca Windows.
        let shellnew = chiave.open_subkey("ShellNew").ok().or_else(|| {
            (!progid.is_empty())
                .then(|| chiave.open_subkey(format!(r"{}\ShellNew", progid)).ok())
                .flatten()
        });
        let Some(sn) = shellnew else { continue };

        let contenuto = if sn.get_raw_value("NullFile").is_ok() {
            Contenuto::Vuoto
        } else if let Ok(m) = sn.get_value::<String, _>("FileName") {
            Contenuto::Modello(m)
        } else if let Ok(d) = sn.get_raw_value("Data") {
            Contenuto::Dati(d.bytes.to_vec())
        } else {
            // `Command` apre una procedura guidata (il collegamento, per
            // esempio): non è un file da scrivere, si lascia a Windows.
            continue;
        };

        let Some(nome) = nome_tipo(&radice, &progid, &sn) else { continue };
        if out.iter().any(|v| v.tipo.nome == nome) {
            continue;
        }
        out.push(Voce { tipo: TipoNuovo { ext: ext.to_lowercase(), nome }, contenuto });
    }
    out
}

/// Il nome leggibile del tipo, nella lingua di Windows se c'è.
#[cfg(windows)]
fn nome_tipo(radice: &winreg::RegKey, progid: &str, shellnew: &winreg::RegKey) -> Option<String> {
    // ItemName e FriendlyTypeName puntano spesso a una risorsa tradotta
    // («@notepad.exe,-469»): la risolve SHLoadIndirectString.
    let candidati = [
        shellnew.get_value::<String, _>("ItemName").ok(),
        radice
            .open_subkey(progid)
            .ok()
            .and_then(|k| k.get_value::<String, _>("FriendlyTypeName").ok()),
        radice.open_subkey(progid).ok().and_then(|k| k.get_value::<String, _>("").ok()),
    ];
    candidati
        .into_iter()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .find_map(|s| if s.starts_with('@') { risolvi_risorsa(&s) } else { Some(s) })
}

#[cfg(windows)]
fn risolvi_risorsa(s: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::SHLoadIndirectString;

    let sorgente: Vec<u16> = s.encode_utf16().chain(std::iter::once(0)).collect();
    let mut buf = [0u16; 260];
    unsafe { SHLoadIndirectString(PCWSTR(sorgente.as_ptr()), &mut buf, None) }.ok()?;
    let fine = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    let testo = String::from_utf16_lossy(&buf[..fine]);
    (!testo.trim().is_empty()).then_some(testo)
}

#[cfg(not(windows))]
fn leggi_registro() -> Vec<Voce> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn il_documento_di_testo_c_e_sempre() {
        assert!(elenca().iter().any(|t| t.ext == ".txt"));
    }

    #[test]
    fn i_tipi_hanno_nomi_leggibili_e_non_ripetuti() {
        let tipi = elenca();
        for t in &tipi {
            assert!(t.ext.starts_with('.'));
            assert!(!t.nome.is_empty());
            assert!(!t.nome.starts_with('@'), "risorsa non risolta: {}", t.nome);
        }
        let mut nomi: Vec<_> = tipi.iter().map(|t| &t.nome).collect();
        nomi.dedup();
        assert_eq!(nomi.len(), tipi.len());
    }

    #[test]
    fn crea_un_documento_e_numera_il_secondo() {
        let d = tempdir().unwrap();
        let dir = d.path().to_string_lossy().into_owned();

        let primo = crea(&dir, ".txt").unwrap();
        let secondo = crea(&dir, ".txt").unwrap();

        assert!(primo.ends_with(".txt"));
        assert!(Path::new(&primo).exists());
        assert!(secondo.contains("(2)"));
    }

    #[test]
    fn uno_zip_nuovo_e_un_archivio_valido_se_windows_lo_offre() {
        if !elenca().iter().any(|t| t.ext == ".zip") {
            return;
        }
        let d = tempdir().unwrap();
        let zip = crea(&d.path().to_string_lossy(), ".zip").unwrap();
        let f = std::fs::File::open(&zip).unwrap();
        assert!(::zip::ZipArchive::new(f).is_ok());
    }
}
