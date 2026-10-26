use serde::Serialize;

/// Caratteri che Windows non ammette in un nome di file.
const VIETATI: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Nomi riservati dal sistema, validi anche con estensione (`CON.txt` è
/// altrettanto rifiutato di `CON`).
const RISERVATI: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Limite per singolo componente del path, non per il path intero.
const LUNGHEZZA_MAX: usize = 255;

#[derive(Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NameError {
    Vuoto,
    CarattereVietato { carattere: String },
    NomeRiservato { nome: String },
    FinisceMale,
    TroppoLungo,
}

/// Verifica che `nome` sia utilizzabile come nome di file o cartella.
///
/// Controlla il singolo componente, non un path: uno `\` qui è un errore,
/// non un separatore.
pub fn validate_name(nome: &str) -> Result<(), NameError> {
    if nome.trim().is_empty() {
        return Err(NameError::Vuoto);
    }

    if nome.chars().count() > LUNGHEZZA_MAX {
        return Err(NameError::TroppoLungo);
    }

    for c in nome.chars() {
        if VIETATI.contains(&c) || (c as u32) < 0x20 {
            return Err(NameError::CarattereVietato {
                carattere: c.to_string(),
            });
        }
    }

    // Windows tronca silenziosamente punti e spazi finali: un nome che li
    // contiene non è quello che l'utente crede di aver scritto.
    if nome.ends_with('.') || nome.ends_with(' ') {
        return Err(NameError::FinisceMale);
    }

    let base = nome.split('.').next().unwrap_or(nome).to_uppercase();
    if RISERVATI.contains(&base.as_str()) {
        return Err(NameError::NomeRiservato { nome: base });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accetta_i_nomi_normali() {
        assert_eq!(validate_name("appunti.txt"), Ok(()));
        assert_eq!(validate_name("Cartella nuova"), Ok(()));
        assert_eq!(validate_name("café–🚀.md"), Ok(()));
        assert_eq!(validate_name("archivio.tar.gz"), Ok(()));
    }

    #[test]
    fn rifiuta_il_nome_vuoto_o_di_soli_spazi() {
        assert_eq!(validate_name(""), Err(NameError::Vuoto));
        assert_eq!(validate_name("   "), Err(NameError::Vuoto));
    }

    #[test]
    fn rifiuta_i_caratteri_vietati() {
        for c in ['<', '>', ':', '"', '/', '\\', '|', '?', '*'] {
            let nome = format!("file{}nome.txt", c);
            assert!(
                matches!(validate_name(&nome), Err(NameError::CarattereVietato { .. })),
                "avrebbe dovuto rifiutare {}",
                c
            );
        }
    }

    #[test]
    fn rifiuta_i_caratteri_di_controllo() {
        assert!(matches!(
            validate_name("file\u{1}.txt"),
            Err(NameError::CarattereVietato { .. })
        ));
    }

    #[test]
    fn rifiuta_i_nomi_riservati_dal_sistema() {
        assert!(matches!(
            validate_name("CON"),
            Err(NameError::NomeRiservato { .. })
        ));
        assert!(matches!(
            validate_name("nul"),
            Err(NameError::NomeRiservato { .. })
        ));
        assert!(matches!(
            validate_name("COM1.txt"),
            Err(NameError::NomeRiservato { .. })
        ));
    }

    #[test]
    fn i_nomi_che_contengono_un_riservato_vanno_bene() {
        assert_eq!(validate_name("console.txt"), Ok(()));
        assert_eq!(validate_name("nullo.md"), Ok(()));
    }

    #[test]
    fn rifiuta_punti_e_spazi_finali() {
        assert_eq!(validate_name("appunti."), Err(NameError::FinisceMale));
        assert_eq!(validate_name("appunti "), Err(NameError::FinisceMale));
    }

    #[test]
    fn rifiuta_i_nomi_troppo_lunghi() {
        let lungo = "a".repeat(256);
        assert_eq!(validate_name(&lungo), Err(NameError::TroppoLungo));

        let limite = "a".repeat(255);
        assert_eq!(validate_name(&limite), Ok(()));
    }
}
