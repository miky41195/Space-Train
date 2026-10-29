//! File che arrivano da un altro PC: da dove vengono e cosa ne pensa
//! l'antivirus.
//!
//! Tutto ciò che arriva dalla rete (rete locale o amici) si tratta come un
//! download da internet, come fanno i browser e i programmi di posta:
//! - passa per Attachment Services di Windows (`IAttachmentExecute::Save`),
//!   che lo fa esaminare all'antivirus installato. È la strada prevista per
//!   i programmi che ricevono file: un file pericoloso viene fermato come
//!   allegato ricevuto, e non sembra qualcosa che Space Train ha prodotto
//!   da sé;
//! - riceve il «Mark of the Web» (`Zone.Identifier`, zona Internet): quando
//!   lo si apre Windows lo controlla con SmartScreen e, se è un programma,
//!   chiede conferma prima di avviarlo.
//!
//! Se l'antivirus blocca un file, quel file manca all'arrivo e gli altri
//! arrivano lo stesso: un falso positivo non rompe tutto il trasferimento.

use super::paths;
use std::io;
use std::path::Path;

/// ERROR_VIRUS_INFECTED: l'antivirus ha impedito di aprire o scrivere il file.
const ERROR_VIRUS_INFECTED: i32 = 225;
/// ERROR_VIRUS_DELETED: l'antivirus ha impedito l'operazione e tolto il file.
const ERROR_VIRUS_DELETED: i32 = 226;

/// L'errore viene dall'antivirus, non dal disco o dalla rete.
pub fn e_virus(e: &io::Error) -> bool {
    matches!(e.raw_os_error(), Some(ERROR_VIRUS_INFECTED | ERROR_VIRUS_DELETED))
}

/// Estensioni che Windows esegue al doppio click: programmi, script,
/// installatori, collegamenti.
const PROGRAMMI: &[&str] = &[
    "exe", "com", "scr", "pif", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi",
    "msp", "msix", "msixbundle", "appx", "appxbundle", "appinstaller", "hta", "cpl", "lnk", "reg", "jar",
    "application", "scf", "url",
    // Meno ovvi, ma eseguono codice o lo montano: guide compilate, console,
    // componenti e macro, pannelli, immagini disco, pacchetti di diagnosi.
    "chm", "msc", "gadget", "inf", "ins", "isp", "mst", "ws", "wsc", "sct", "psc1", "ps1xml", "psd1",
    "xll", "xlam", "ppam", "appref-ms", "settingcontent-ms", "library-ms", "search-ms", "searchconnector-ms",
    "website", "xbap", "diagcab", "iso", "img", "vhd", "vhdx", "mde", "ade", "adp", "accde",
];

/// L'estensione del nome, senza i punti e gli spazi finali che Windows
/// ignora («a.exe.» si apre come «a.exe»).
fn estensione(nome: &str) -> Option<&str> {
    let nome = nome.trim_end_matches(['.', ' ', '\\', '/']);
    let ultimo = nome.rsplit(['\\', '/']).next().unwrap_or(nome);
    ultimo.rsplit_once('.').map(|(_, est)| est)
}

/// Il nome è di un file che, aperto, avvia codice.
pub fn e_programma(nome: &str) -> bool {
    estensione(nome).is_some_and(|est| PROGRAMMI.iter().any(|p| p.eq_ignore_ascii_case(est)))
}

/// Fra i file scaricati per «apri» da un altro PC, quello da aprire.
///
/// È chi condivide a dire che cosa arriva, quindi non basta controllare il
/// nome chiesto: deve arrivare un file solo, con la stessa estensione di
/// quello chiesto, e non deve essere un programma. Altrimenti chiedere
/// «foto.jpg» poteva far aprire «foto.jpg.lnk».
pub fn file_da_aprire(chiesto: &str, coppie: &[[String; 2]]) -> Result<String, crate::fs::error::FsError> {
    let rifiuto = || crate::fs::error::FsError::Io {
        message: "Il PC che condivide ha mandato un file diverso da quello chiesto: non si apre.".into(),
    };
    let [[_, locale]] = coppie else {
        return Err(if coppie.is_empty() { crate::fs::error::FsError::NotFound } else { rifiuto() });
    };
    let stessa = match (estensione(chiesto), estensione(locale)) {
        (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
        (None, None) => true,
        _ => false,
    };
    if !stessa || e_programma(locale) {
        return Err(rifiuto());
    }
    Ok(locale.clone())
}

/// Com'è andato l'esame di un file appena ricevuto.
#[derive(Debug, PartialEq, Eq)]
pub enum Esame {
    Pulito,
    /// L'antivirus o i criteri di Windows l'hanno tolto.
    Bloccato,
}

/// Esamina un file appena ricevuto e lo segna come venuto da internet.
pub fn esamina(path: &Path) -> Esame {
    #[cfg(windows)]
    let _ = passa_dall_antivirus(path);
    if !paths::extended(path).exists() {
        return Esame::Bloccato;
    }
    let _ = segna_internet(path);
    Esame::Pulito
}

/// Scrive il «Mark of the Web»: zona Internet.
///
/// Attachment Services lo scrive già; lo si riscrive per avere sempre la
/// stessa zona, anche dove il servizio non c'è o non ha potuto farlo.
pub fn segna_internet(path: &Path) -> io::Result<()> {
    let mut ads = paths::extended(path).into_os_string();
    ads.push(":Zone.Identifier");
    std::fs::write(ads, "[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=about:internet\r\n")
}

/// Space Train per Attachment Services: ricorda le scelte fatte per i suoi file.
#[cfg(windows)]
const CLIENTE: windows::core::GUID = windows::core::GUID::from_u128(0x5b0c8f1e_7a4d_4c2e_9f3a_2d6e8b1c4a70);

#[cfg(windows)]
fn passa_dall_antivirus(path: &Path) -> windows::core::Result<()> {
    use windows::core::HSTRING;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{AttachmentServices, IAttachmentExecute};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let a: IAttachmentExecute = CoCreateInstance(&AttachmentServices, None, CLSCTX_INPROC_SERVER)?;
        a.SetClientGuid(&CLIENTE)?;
        a.SetClientTitle(&HSTRING::from("Space Train"))?;
        a.SetLocalPath(&HSTRING::from(paths::display(path)))?;
        a.SetSource(&HSTRING::from("about:internet"))?;
        a.Save()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn riconosce_gli_errori_dell_antivirus() {
        assert!(e_virus(&io::Error::from_raw_os_error(225)));
        assert!(e_virus(&io::Error::from_raw_os_error(226)));
        assert!(!e_virus(&io::Error::from_raw_os_error(5)));
        assert!(!e_virus(&io::Error::other("rete")));
    }

    #[test]
    fn riconosce_i_programmi() {
        assert!(e_programma("setup.exe"));
        assert!(e_programma("Avvia.BAT"));
        assert!(e_programma(r"::amici\X\cartella\script.ps1"));
        // Windows ignora punti e spazi finali: «a.exe.» si apre come «a.exe».
        assert!(e_programma("trucco.exe. "));
        assert!(!e_programma("foto.png"));
        assert!(!e_programma("leggimi"));
        assert!(!e_programma("exe"));
        // Anche guide compilate, console, immagini disco, componenti Office.
        for nome in ["aiuto.chm", "a.msc", "disco.iso", "disco.vhdx", "macro.xll", "x.settingcontent-ms", "x.diagcab"] {
            assert!(e_programma(nome), "{nome}");
        }
    }

    #[test]
    fn si_apre_solo_il_file_chiesto() {
        let coppia = |a: &str, b: &str| [a.to_string(), b.to_string()];
        let chiesto = r"::lan\PC\foto.jpg";
        // Il caso buono: un file, stessa estensione (anche col nome libero).
        assert_eq!(
            file_da_aprire(chiesto, &[coppia(chiesto, r"C:\T\foto (2).jpg")]).unwrap(),
            r"C:\T\foto (2).jpg"
        );
        // Chi condivide manda un altro tipo di file, o più file, o niente.
        assert!(file_da_aprire(chiesto, &[coppia(chiesto, r"C:\T\foto.jpg.lnk")]).is_err());
        assert!(file_da_aprire(chiesto, &[coppia(chiesto, r"C:\T\foto.exe")]).is_err());
        assert!(file_da_aprire(chiesto, &[coppia(chiesto, r"C:\T\foto.jpg"), coppia(chiesto, r"C:\T\x.jpg")]).is_err());
        assert!(file_da_aprire(chiesto, &[]).is_err());
    }

    #[test]
    fn un_file_ricevuto_resta_e_risulta_da_internet() {
        let d = tempdir().unwrap();
        let f = d.path().join("nota.txt");
        std::fs::write(&f, "ciao").unwrap();
        assert_eq!(esamina(&f), Esame::Pulito);
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "ciao");
        let mut ads = f.clone().into_os_string();
        ads.push(":Zone.Identifier");
        assert!(std::fs::read_to_string(ads).unwrap().contains("ZoneId=3"));
    }

    #[test]
    fn un_file_sparito_risulta_bloccato() {
        let d = tempdir().unwrap();
        let f = d.path().join("tolto.exe");
        assert_eq!(esamina(&f), Esame::Bloccato);
        // Segnarlo non deve ricrearlo vuoto.
        assert!(!f.exists());
    }
}
