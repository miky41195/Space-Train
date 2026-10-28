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
];

/// Il nome è di un file che, aperto, avvia codice.
pub fn e_programma(nome: &str) -> bool {
    let nome = nome.trim_end_matches(['.', ' ', '\\', '/']);
    nome.rsplit_once('.')
        .is_some_and(|(_, est)| PROGRAMMI.iter().any(|p| p.eq_ignore_ascii_case(est)))
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
