use crate::fs::error::{from_io, FsError};
use crate::fs::names::validate_name;
use crate::fs::paths;
use std::path::Path;

/// Crea una cartella dentro `parent` e restituisce il path creato.
///
/// Il nome viene validato prima di toccare il disco: un nome riservato o con
/// caratteri vietati produce un errore leggibile invece di un codice Win32.
pub fn create_folder(parent: &str, nome: &str) -> Result<String, FsError> {
    validate_name(nome).map_err(|e| FsError::Io {
        message: descrivi_nome(&e),
    })?;

    let destinazione = Path::new(parent).join(nome);

    if paths::extended(&destinazione).exists() {
        return Err(FsError::Io {
            message: format!("Esiste già un elemento con nome «{}».", nome),
        });
    }

    std::fs::create_dir(paths::extended(&destinazione)).map_err(|e| from_io(&e))?;
    Ok(paths::display(&destinazione))
}

/// Rinomina un elemento mantenendolo nella stessa cartella.
/// Restituisce il nuovo path.
pub fn rename(path: &str, nuovo_nome: &str) -> Result<String, FsError> {
    validate_name(nuovo_nome).map_err(|e| FsError::Io {
        message: descrivi_nome(&e),
    })?;

    let origine = Path::new(path);
    let parent = origine.parent().ok_or(FsError::NotFound)?;
    let destinazione = parent.join(nuovo_nome);

    if destinazione == origine {
        return Ok(paths::display(&destinazione));
    }

    // Su Windows rename sovrascrive silenziosamente il file di destinazione:
    // il controllo esplicito evita di distruggere un omonimo per sbaglio.
    if paths::extended(&destinazione).exists() {
        return Err(FsError::Io {
            message: format!("Esiste già un elemento con nome «{}».", nuovo_nome),
        });
    }

    std::fs::rename(paths::extended(origine), paths::extended(&destinazione))
        .map_err(|e| from_io(&e))?;

    Ok(paths::display(&destinazione))
}

/// Sposta gli elementi nel Cestino di Windows.
///
/// Passa dalla Shell API: gli elementi restano recuperabili. Nel codice non
/// esiste una cancellazione definitiva, per scelta.
pub fn move_to_trash(percorsi: &[String]) -> Result<(), FsError> {
    if percorsi.is_empty() {
        return Ok(());
    }

    trash::delete_all(percorsi).map_err(|e| FsError::Io {
        message: format!("Impossibile spostare nel Cestino: {}", e),
    })
}

/// Elimina senza passare dal Cestino. Non si annulla: il frontend chiede
/// una conferma esplicita prima di arrivare qui.
pub fn delete_permanently(percorsi: &[String]) -> Result<(), FsError> {
    for p in percorsi {
        crate::fs::copy::rimuovi(Path::new(p))?;
    }
    Ok(())
}

/// Primi byte di un file di testo, per il pannello d'anteprima.
/// `None` se il file sembra binario.
pub fn text_preview(path: &str, massimo: usize) -> Result<Option<String>, FsError> {
    use std::io::Read;
    let f = std::fs::File::open(paths::extended(Path::new(path))).map_err(|e| from_io(&e))?;
    let mut dati = Vec::new();
    f.take(massimo as u64)
        .read_to_end(&mut dati)
        .map_err(|e| from_io(&e))?;
    if dati.iter().take(8000).any(|b| *b == 0) {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&dati).into_owned()))
}

/// Dove portare l'utente dopo che ha scritto un percorso nella barra.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Destinazione {
    /// Cartella da aprire.
    pub cartella: String,
    /// Se l'utente ha scritto il path di un file: la voce da selezionare.
    pub seleziona: Option<String>,
}

/// Interpreta ciò che l'utente ha digitato nella barra degli indirizzi.
///
/// Accetta virgolette attorno al path, variabili d'ambiente (`%USERPROFILE%`),
/// `~` per la cartella utente e i nomi delle posizioni speciali.
pub fn resolve_input(input: &str) -> Result<Destinazione, FsError> {
    let pulito = input.trim().trim_matches('"').trim();
    if pulito.is_empty() {
        return Err(FsError::NotFound);
    }

    let speciale = match pulito.to_lowercase().as_str() {
        "questo pc" | "computer" | "risorse del computer" | "this pc" => Some("::pc"),
        "rete" | "network" => Some("::rete"),
        "cestino" | "recycle bin" => Some(crate::fs::cestino::RADICE),
        _ => None,
    };
    if let Some(s) = speciale {
        return Ok(Destinazione { cartella: s.to_string(), seleziona: None });
    }
    if pulito.starts_with("::") {
        return Ok(Destinazione { cartella: pulito.to_string(), seleziona: None });
    }

    let mut espanso = espandi_variabili(pulito);
    if espanso == "~" || espanso.starts_with("~\\") || espanso.starts_with("~/") {
        if let Ok(casa) = std::env::var("USERPROFILE") {
            espanso = format!("{}{}", casa, &espanso[1..]);
        }
    }
    let espanso = espanso.replace('/', "\\");
    // «C:» da solo è la radice del disco, non la cartella corrente del disco.
    let espanso = if espanso.len() == 2 && espanso.ends_with(':') {
        format!("{}\\", espanso)
    } else {
        espanso
    };

    // Un server senza condivisione non è un path del filesystem: lo elenca
    // la Rete, non read_dir.
    if crate::shell::rete::e_server(&espanso) {
        return Ok(Destinazione { cartella: espanso, seleziona: None });
    }

    let p = Path::new(&espanso);
    let meta = std::fs::metadata(paths::extended(p)).map_err(|e| from_io(&e))?;
    if meta.is_dir() {
        Ok(Destinazione { cartella: paths::display(p), seleziona: None })
    } else {
        let genitore = paths::parent_of(&espanso).ok_or(FsError::NotFound)?;
        Ok(Destinazione { cartella: genitore, seleziona: Some(paths::display(p)) })
    }
}

fn espandi_variabili(s: &str) -> String {
    let mut out = String::new();
    let mut resto = s;
    while let Some(i) = resto.find('%') {
        out.push_str(&resto[..i]);
        let dopo = &resto[i + 1..];
        match dopo.find('%') {
            Some(j) => {
                let nome = &dopo[..j];
                match std::env::var(nome) {
                    Ok(v) if !nome.is_empty() => out.push_str(&v),
                    _ => {
                        out.push('%');
                        out.push_str(nome);
                        out.push('%');
                    }
                }
                resto = &dopo[j + 1..];
            }
            None => {
                out.push('%');
                resto = dopo;
            }
        }
    }
    out.push_str(resto);
    out
}

fn descrivi_nome(e: &crate::fs::names::NameError) -> String {
    use crate::fs::names::NameError::*;
    match e {
        Vuoto => "Il nome non può essere vuoto.".to_string(),
        CarattereVietato { carattere } => {
            format!("Il carattere «{}» non è ammesso nei nomi di file.", carattere)
        }
        NomeRiservato { nome } => format!("«{}» è un nome riservato da Windows.", nome),
        FinisceMale => "Il nome non può finire con un punto o uno spazio.".to_string(),
        TroppoLungo => "Il nome supera i 255 caratteri.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn crea_una_cartella() {
        let dir = tempdir().unwrap();
        let creata = create_folder(&dir.path().to_string_lossy(), "nuova").unwrap();

        assert!(Path::new(&creata).is_dir());
        assert!(creata.ends_with("nuova"));
    }

    #[test]
    fn non_crea_una_cartella_gia_esistente() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join("esiste")).unwrap();

        let err = create_folder(&dir.path().to_string_lossy(), "esiste").unwrap_err();
        assert!(matches!(err, FsError::Io { .. }));
    }

    #[test]
    fn non_crea_una_cartella_con_nome_invalido() {
        let dir = tempdir().unwrap();
        let err = create_folder(&dir.path().to_string_lossy(), "co:so").unwrap_err();

        match err {
            FsError::Io { message } => assert!(message.contains("non è ammesso")),
            altro => panic!("errore inatteso: {:?}", altro),
        }
    }

    #[test]
    fn rinomina_un_file() {
        let dir = tempdir().unwrap();
        let origine = dir.path().join("vecchio.txt");
        fs::write(&origine, b"x").unwrap();

        let nuovo = rename(&origine.to_string_lossy(), "nuovo.txt").unwrap();

        assert!(!origine.exists());
        assert!(Path::new(&nuovo).exists());
        assert!(nuovo.ends_with("nuovo.txt"));
    }

    #[test]
    fn rinominare_con_lo_stesso_nome_non_fa_niente() {
        let dir = tempdir().unwrap();
        let origine = dir.path().join("uguale.txt");
        fs::write(&origine, b"contenuto").unwrap();

        rename(&origine.to_string_lossy(), "uguale.txt").unwrap();

        assert_eq!(fs::read_to_string(&origine).unwrap(), "contenuto");
    }

    #[test]
    fn non_rinomina_sopra_un_file_esistente() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.txt");
        let b = dir.path().join("b.txt");
        fs::write(&a, b"aaa").unwrap();
        fs::write(&b, b"bbb").unwrap();

        let err = rename(&a.to_string_lossy(), "b.txt").unwrap_err();

        assert!(matches!(err, FsError::Io { .. }));
        // Il file di destinazione è intatto: nessuna sovrascrittura silenziosa.
        assert_eq!(fs::read_to_string(&b).unwrap(), "bbb");
        assert!(a.exists());
    }

    #[test]
    fn non_rinomina_con_nome_riservato() {
        let dir = tempdir().unwrap();
        let origine = dir.path().join("file.txt");
        fs::write(&origine, b"x").unwrap();

        let err = rename(&origine.to_string_lossy(), "NUL").unwrap_err();

        match err {
            FsError::Io { message } => assert!(message.contains("riservato")),
            altro => panic!("errore inatteso: {:?}", altro),
        }
        assert!(origine.exists());
    }

    #[test]
    fn elimina_definitivamente_file_e_cartelle() {
        let dir = tempdir().unwrap();
        let f = dir.path().join("f.txt");
        let c = dir.path().join("c");
        fs::write(&f, b"x").unwrap();
        fs::create_dir_all(c.join("dentro")).unwrap();

        delete_permanently(&[
            f.to_string_lossy().into_owned(),
            c.to_string_lossy().into_owned(),
        ])
        .unwrap();

        assert!(!f.exists());
        assert!(!c.exists());
    }

    #[test]
    fn l_anteprima_legge_il_testo_e_rifiuta_i_binari() {
        let dir = tempdir().unwrap();
        let t = dir.path().join("t.txt");
        let b = dir.path().join("b.bin");
        fs::write(&t, "ciao mondo").unwrap();
        fs::write(&b, [0u8, 1, 2]).unwrap();

        assert_eq!(text_preview(&t.to_string_lossy(), 4).unwrap(), Some("ciao".into()));
        assert_eq!(text_preview(&b.to_string_lossy(), 100).unwrap(), None);
    }

    #[test]
    fn la_barra_apre_cartelle_e_seleziona_i_file() {
        let dir = tempdir().unwrap();
        let f = dir.path().join("doc.txt");
        fs::write(&f, b"x").unwrap();
        let d = dir.path().to_string_lossy().into_owned();

        assert_eq!(resolve_input(&format!("\"{}\"", d)).unwrap().cartella, d);

        let file = resolve_input(&f.to_string_lossy()).unwrap();
        assert_eq!(file.cartella, d);
        assert_eq!(file.seleziona, Some(f.to_string_lossy().into_owned()));
    }

    #[test]
    fn la_barra_espande_le_variabili_e_capisce_le_posizioni_speciali() {
        std::env::set_var("SPACE_TRAIN_PROVA", r"C:\");
        assert_eq!(resolve_input("%SPACE_TRAIN_PROVA%").unwrap().cartella, r"C:\");
        assert_eq!(resolve_input("c:").unwrap().cartella, r"c:\");
        assert_eq!(resolve_input("Cestino").unwrap().cartella, "::cestino");
        assert_eq!(resolve_input("questo pc").unwrap().cartella, "::pc");
        assert!(resolve_input(r"C:\non\esiste\proprio").is_err());
    }

    #[test]
    fn il_cestino_con_lista_vuota_non_fa_niente() {
        assert_eq!(move_to_trash(&[]), Ok(()));
    }
}
