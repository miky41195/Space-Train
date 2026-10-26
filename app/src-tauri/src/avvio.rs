//! Cosa aprire all'avvio, a partire dagli argomenti con cui Windows lancia
//! l'app quando è il file manager predefinito.
//!
//! Il registro passa la cartella come `"%1"`. Altri programmi parlano a
//! Esplora con le sue opzioni (`/select,`, `/e,`, `/root,`) o con il CLSID di
//! Questo PC: le capiamo anche noi, così chi le usa trova la cartella giusta.

use crate::fs::ops::{resolve_input, Destinazione};

/// CLSID di «Questo PC»: lo usano Win+E e alcuni collegamenti.
const CLSID_QUESTO_PC: &str = "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}";

/// La richiesta grezza estratta dagli argomenti, prima di toccare il disco.
#[derive(Debug, PartialEq)]
pub enum Richiesta {
    /// Una cartella o un file da aprire.
    Percorso(String),
    /// Aprire la cartella che contiene il file e selezionarlo.
    Seleziona(String),
    QuestoPc,
}

/// Interpreta gli argomenti (senza il nome dell'eseguibile).
pub fn interpreta(argomenti: &[String]) -> Option<Richiesta> {
    // Esplora accetta le opzioni separate o unite da virgole, in qualsiasi
    // ordine: «/e,/select,C:\x». Si uniscono e si rileggono per virgola.
    let testo = argomenti
        .iter()
        .map(|a| a.trim())
        .filter(|a| !a.is_empty())
        .collect::<Vec<_>>()
        .join(",");
    if testo.is_empty() {
        return None;
    }

    let mut seleziona = false;
    let mut percorso: Option<String> = None;
    for parte in dividi_virgole(&testo) {
        let p = parte.trim().trim_matches('"').trim();
        match p.to_lowercase().as_str() {
            "" => {}
            "/select" => seleziona = true,
            "/e" | "/n" | "/root" | "/separate" => {}
            _ if p.eq_ignore_ascii_case(CLSID_QUESTO_PC) => return Some(Richiesta::QuestoPc),
            _ if p.starts_with('/') || p.starts_with('-') => {}
            _ => {
                // Un path può contenere virgole: tutto ciò che segue la prima
                // parte non-opzione appartiene al path.
                let indice = testo.find(p).unwrap_or(0);
                percorso = Some(testo[indice..].trim().trim_matches('"').to_string());
                break;
            }
        }
    }

    let percorso = percorso?;
    Some(if seleziona { Richiesta::Seleziona(percorso) } else { Richiesta::Percorso(percorso) })
}

fn dividi_virgole(s: &str) -> Vec<&str> {
    s.split(',').collect()
}

/// Dove portare l'utente, verificando che il percorso esista. Un percorso
/// sparito nel frattempo non blocca l'avvio: si torna al comportamento
/// normale.
pub fn destinazione(argomenti: &[String]) -> Option<Destinazione> {
    match interpreta(argomenti)? {
        Richiesta::QuestoPc => Some(Destinazione { cartella: "::pc".into(), seleziona: None }),
        Richiesta::Percorso(p) | Richiesta::Seleziona(p) => resolve_input(&p).ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn senza_argomenti_non_si_apre_niente_di_speciale() {
        assert_eq!(interpreta(&[]), None);
        assert_eq!(interpreta(&a(&[""])), None);
    }

    #[test]
    fn la_cartella_passata_dal_registro() {
        assert_eq!(interpreta(&a(&[r"C:\Utenti\Anna"])), Some(Richiesta::Percorso(r"C:\Utenti\Anna".into())));
        assert_eq!(interpreta(&a(&[r#""D:\""#])), Some(Richiesta::Percorso(r"D:\".into())));
    }

    #[test]
    fn le_opzioni_di_esplora() {
        assert_eq!(
            interpreta(&a(&[r"/select,C:\Dati\nota.txt"])),
            Some(Richiesta::Seleziona(r"C:\Dati\nota.txt".into()))
        );
        assert_eq!(
            interpreta(&a(&["/e,", r"C:\Dati"])),
            Some(Richiesta::Percorso(r"C:\Dati".into()))
        );
        assert_eq!(interpreta(&a(&[CLSID_QUESTO_PC])), Some(Richiesta::QuestoPc));
    }

    #[test]
    fn un_path_con_la_virgola_resta_intero() {
        assert_eq!(
            interpreta(&a(&[r"C:\Foto, mare e montagna"])),
            Some(Richiesta::Percorso(r"C:\Foto, mare e montagna".into()))
        );
    }

    #[test]
    fn la_destinazione_verifica_il_disco() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("nota.txt");
        std::fs::write(&f, b"x").unwrap();
        let cartella = d.path().to_string_lossy().into_owned();

        let dest = destinazione(&a(&[&cartella])).unwrap();
        assert_eq!(dest.cartella, cartella);

        let sel = destinazione(&a(&[&format!("/select,{}", f.to_string_lossy())])).unwrap();
        assert_eq!(sel.cartella, cartella);
        assert_eq!(sel.seleziona, Some(f.to_string_lossy().into_owned()));

        assert_eq!(destinazione(&a(&[r"C:\non\esiste\proprio"])), None);
        assert_eq!(destinazione(&a(&[CLSID_QUESTO_PC])).unwrap().cartella, "::pc");
    }
}
