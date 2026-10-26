//! Estrazione di icone e miniature dalla Shell di Windows.
//!
//! Due percorsi distinti, con costi molto diversi:
//! - le icone si risolvono per estensione senza toccare il disco;
//! - le miniature leggono il file vero e vanno chieste solo per ciò che è
//!   effettivamente a schermo.

use base64::Engine;
use windows::core::PCWSTR;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
};
use windows::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL, FILE_FLAGS_AND_ATTRIBUTES,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
    IShellItemImageFactory, SHCreateItemFromParsingName, SHGetFileInfoW, SHFILEINFOW,
    SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SMALLICON, SHGFI_USEFILEATTRIBUTES, SIIGBF_BIGGERSIZEOK,
};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

/// Immagine pronta per il frontend: PNG in base64, dentro una data URL.
pub type DataUrl = String;

/// Richiesta indirizzata al thread STA.
enum Richiesta {
    Icona {
        ext: String,
        is_dir: bool,
        large: bool,
        risposta: std::sync::mpsc::Sender<Option<DataUrl>>,
    },
    Miniatura {
        path: String,
        lato: u32,
        risposta: std::sync::mpsc::Sender<Option<DataUrl>>,
    },
}

/// Canali verso i thread STA, creati alla prima richiesta.
///
/// Due thread, uno per le icone e uno per le miniature: un video lento da
/// decodificare non deve tenere in fila le icone di tipo, che costano poco
/// e servono subito a ogni cartella aperta.
static SPORTELLO_ICONE: std::sync::OnceLock<std::sync::mpsc::Sender<Richiesta>> =
    std::sync::OnceLock::new();
static SPORTELLO_MINIATURE: std::sync::OnceLock<std::sync::mpsc::Sender<Richiesta>> =
    std::sync::OnceLock::new();

/// Oltre questa attesa la richiesta si abbandona: meglio un'icona di
/// ripiego che una voce in attesa per sempre dietro un file che non si
/// lascia leggere.
const ATTESA_MAX: std::time::Duration = std::time::Duration::from_secs(8);

/// Tutte le estrazioni passano da thread inizializzati STA.
///
/// `SHGetFileInfoW` con `SHGFI_ICON` e `IShellItemImageFactory` invocano
/// handler della Shell che pretendono un apartment a thread singolo. I
/// comandi Tauri girano su un pool di thread qualunque: chiamarli da lì
/// riesce o fallisce a seconda del thread che capita, e il sintomo è un
/// fallimento intermittente che non si riproduce mai isolato.
fn avvia_sportello(nome: &str) -> std::sync::mpsc::Sender<Richiesta> {
    let (invia, ricevi) = std::sync::mpsc::channel::<Richiesta>();

    std::thread::Builder::new()
        .name(nome.into())
        .spawn(move || {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            }

            while let Ok(richiesta) = ricevi.recv() {
                match richiesta {
                    Richiesta::Icona {
                        ext,
                        is_dir,
                        large,
                        risposta,
                    } => {
                        let _ = risposta.send(icona_impl(&ext, is_dir, large));
                    }
                    Richiesta::Miniatura {
                        path,
                        lato,
                        risposta,
                    } => {
                        let _ = risposta.send(miniatura_impl(&path, lato));
                    }
                }
            }
        })
        .expect("impossibile avviare il thread delle icone");

    invia
}

fn chiedi(
    sportello: &'static std::sync::OnceLock<std::sync::mpsc::Sender<Richiesta>>,
    nome: &str,
    richiesta: impl FnOnce(std::sync::mpsc::Sender<Option<DataUrl>>) -> Richiesta,
) -> Option<DataUrl> {
    let (invia, ricevi) = std::sync::mpsc::channel();
    sportello
        .get_or_init(|| avvia_sportello(nome))
        .send(richiesta(invia))
        .ok()?;
    ricevi.recv_timeout(ATTESA_MAX).ok()?
}

/// Icona associata a un'estensione. Vedi `icona_impl` per i dettagli.
pub fn icon_for_extension(ext: &str, is_dir: bool, large: bool) -> Option<DataUrl> {
    chiedi(&SPORTELLO_ICONE, "shell-icons", |risposta| Richiesta::Icona {
        ext: ext.to_string(),
        is_dir,
        large,
        risposta,
    })
}

/// Miniatura reale del file. Vedi `miniatura_impl` per i dettagli.
pub fn thumbnail(path: &str, lato: u32) -> Option<DataUrl> {
    chiedi(&SPORTELLO_MINIATURE, "shell-thumbs", |risposta| Richiesta::Miniatura {
        path: path.to_string(),
        lato,
        risposta,
    })
}

fn a_utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Icona associata a un'estensione, senza leggere alcun file dal disco.
///
/// `SHGFI_USEFILEATTRIBUTES` fa risolvere l'icona sul solo nome: si può
/// chiedere una volta per tipo e riusare per tutte le voci di quel tipo.
///
/// Da invocare solo dal thread STA: vedi `sportello`.
fn icona_impl(ext: &str, is_dir: bool, large: bool) -> Option<DataUrl> {
    // Un nome finto basta: nulla viene aperto.
    let finto = if is_dir {
        "cartella".to_string()
    } else if ext.is_empty() {
        "file".to_string()
    } else {
        format!("file.{}", ext.trim_start_matches('.'))
    };

    let attributi: FILE_FLAGS_AND_ATTRIBUTES = if is_dir {
        FILE_ATTRIBUTE_DIRECTORY
    } else {
        FILE_ATTRIBUTE_NORMAL
    };

    let mut info = SHFILEINFOW::default();
    let flag = SHGFI_ICON
        | SHGFI_USEFILEATTRIBUTES
        | if large { SHGFI_LARGEICON } else { SHGFI_SMALLICON };

    // Il buffer UTF-16 deve sopravvivere alla chiamata: passarlo inline come
    // `PCWSTR(a_utf16(..).as_ptr())` lo fa liberare prima che la Shell lo
    // legga, e la lettura di memoria liberata riesce o fallisce a caso.
    let wide = a_utf16(&finto);

    let ok = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            attributi,
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flag,
        )
    };

    if ok == 0 || info.hIcon.is_invalid() {
        return None;
    }

    let risultato = icona_in_png(info.hIcon);
    unsafe {
        let _ = DestroyIcon(info.hIcon);
    }

    risultato.map(in_data_url)
}

/// Miniatura reale del file: anteprima delle immagini, fotogramma dei video,
/// prima pagina dei PDF. Legge il file, quindi costa.
///
/// Da invocare solo dal thread STA: vedi `sportello`.
fn miniatura_impl(path: &str, lato: u32) -> Option<DataUrl> {
    let wide = a_utf16(path);

    let fabbrica: IShellItemImageFactory =
        unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()? };

    let dimensione = SIZE {
        cx: lato as i32,
        cy: lato as i32,
    };

    // SIIGBF_BIGGERSIZEOK accetta una sorgente più grande invece di
    // rifiutare: meglio ridurre noi che restare senza anteprima.
    let bitmap: HBITMAP = unsafe { fabbrica.GetImage(dimensione, SIIGBF_BIGGERSIZEOK).ok()? };

    let risultato = bitmap_in_png(bitmap);
    unsafe {
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
    }

    risultato.map(in_data_url)
}

fn in_data_url(png: Vec<u8>) -> DataUrl {
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    )
}

fn icona_in_png(icona: HICON) -> Option<Vec<u8>> {
    let mut info = ICONINFO::default();
    unsafe { GetIconInfo(icona, &mut info).ok()? };

    let risultato = bitmap_in_png(info.hbmColor);

    unsafe {
        let _ = DeleteObject(HGDIOBJ(info.hbmColor.0));
        let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
    }

    risultato
}

/// Legge i pixel di una HBITMAP e li codifica in PNG.
///
/// GDI restituisce BGRA con le righe capovolte; la conversione a RGBA
/// dall'alto in basso avviene qui, perché è l'unico punto che conosce il
/// formato di GDI.
fn bitmap_in_png(bitmap: HBITMAP) -> Option<Vec<u8>> {
    if bitmap.is_invalid() {
        return None;
    }

    let mut descrizione = BITMAP::default();
    let letti = unsafe {
        GetObjectW(
            HGDIOBJ(bitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut descrizione as *mut _ as *mut std::ffi::c_void),
        )
    };
    if letti == 0 {
        return None;
    }

    let larghezza = descrizione.bmWidth;
    let altezza = descrizione.bmHeight;
    if larghezza <= 0 || altezza <= 0 {
        return None;
    }

    let mut intestazione = BITMAPINFO::default();
    intestazione.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    intestazione.bmiHeader.biWidth = larghezza;
    // Negativo = righe dall'alto in basso, così non serve capovolgere dopo.
    intestazione.bmiHeader.biHeight = -altezza;
    intestazione.bmiHeader.biPlanes = 1;
    intestazione.bmiHeader.biBitCount = 32;
    intestazione.bmiHeader.biCompression = BI_RGB.0;

    let mut pixel = vec![0u8; (larghezza * altezza * 4) as usize];

    let dc = unsafe { GetDC(None) };
    let righe = unsafe {
        GetDIBits(
            dc,
            bitmap,
            0,
            altezza as u32,
            Some(pixel.as_mut_ptr() as *mut std::ffi::c_void),
            &mut intestazione,
            DIB_RGB_COLORS,
        )
    };
    unsafe {
        ReleaseDC(None, dc);
    }

    if righe == 0 {
        return None;
    }

    bgra_in_rgba(&mut pixel);
    codifica_png(&pixel, larghezza as u32, altezza as u32)
}

/// GDI usa BGRA, PNG vuole RGBA: scambia i due canali sul posto.
fn bgra_in_rgba(pixel: &mut [u8]) {
    for p in pixel.chunks_exact_mut(4) {
        p.swap(0, 2);
    }
}

fn codifica_png(rgba: &[u8], larghezza: u32, altezza: u32) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, larghezza, altezza);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bgra_diventa_rgba() {
        let mut pixel = vec![1u8, 2, 3, 4, 10, 20, 30, 40];
        bgra_in_rgba(&mut pixel);

        // Primo e terzo byte scambiati, alfa e verde intatti.
        assert_eq!(pixel, vec![3, 2, 1, 4, 30, 20, 10, 40]);
    }

    #[test]
    fn codifica_un_png_valido() {
        let rgba = vec![255u8; 2 * 2 * 4];
        let png = codifica_png(&rgba, 2, 2).unwrap();

        // Firma PNG.
        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[test]
    fn l_icona_di_un_estensione_nota_esiste() {
        let icona = icon_for_extension("txt", false, false).unwrap();
        assert!(icona.starts_with("data:image/png;base64,"));
        assert!(icona.len() > 100);
    }

    #[test]
    fn l_icona_delle_cartelle_esiste() {
        let icona = icon_for_extension("", true, false).unwrap();
        assert!(icona.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn estensioni_diverse_danno_icone_diverse() {
        let exe = icon_for_extension("exe", false, false).unwrap();
        let cartella = icon_for_extension("", true, false).unwrap();

        assert_ne!(exe, cartella);
    }

    #[test]
    fn un_estensione_inventata_da_comunque_l_icona_generica() {
        let icona = icon_for_extension("qwertyuiop", false, false);
        assert!(icona.is_some(), "Windows ha sempre un'icona di ripiego");
    }

    #[test]
    fn la_miniatura_di_un_path_inesistente_e_none() {
        assert!(thumbnail(r"C:\questo\non\esiste\mai.png", 128).is_none());
    }
}
