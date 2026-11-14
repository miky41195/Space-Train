//! Extraction of icons and thumbnails from the Windows Shell.
//!
//! Two separate paths, with very different costs:
//! - icons are resolved by extension without touching the disk;
//! - thumbnails read the real file and must be asked only for what is
//!   actually on screen.

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

/// Image ready for the frontend: PNG in base64, inside a data URL.
pub type DataUrl = String;

/// Richiesta indirizzata al thread STA.
enum Request {
    Icon {
        ext: String,
        is_dir: bool,
        large: bool,
        reply: std::sync::mpsc::Sender<Option<DataUrl>>,
    },
    Thumbnail {
        path: String,
        side: u32,
        reply: std::sync::mpsc::Sender<Option<DataUrl>>,
    },
}

/// Channels to the STA threads, created at the first request.
///
/// Two threads, one for icons and one for thumbnails: a video slow to
/// decode must not keep in line the type icons, which cost little
/// and are needed right away for every opened folder.
static ICON_WORKER: std::sync::OnceLock<std::sync::mpsc::Sender<Request>> =
    std::sync::OnceLock::new();
static THUMB_WORKER: std::sync::OnceLock<std::sync::mpsc::Sender<Request>> =
    std::sync::OnceLock::new();

/// Past this wait the request is abandoned: better a fallback
/// icon than an item waiting forever behind a file that does not
/// let itself be read.
const MAX_WAIT: std::time::Duration = std::time::Duration::from_secs(8);

/// All extractions go through STA-initialized threads.
///
/// `SHGetFileInfoW` with `SHGFI_ICON` and `IShellItemImageFactory` invoke
/// Shell handlers that require a single-threaded apartment. Tauri
/// commands run on any pool thread: calling them from there
/// succeeds or fails depending on the thread at hand, and the symptom is an
/// intermittent failure that never reproduces in isolation.
fn start_worker(name: &str) -> std::sync::mpsc::Sender<Request> {
    let (tx, rx) = std::sync::mpsc::channel::<Request>();

    std::thread::Builder::new()
        .name(name.into())
        .spawn(move || {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            }

            while let Ok(request) = rx.recv() {
                match request {
                    Request::Icon {
                        ext,
                        is_dir,
                        large,
                        reply,
                    } => {
                        let _ = reply.send(icon_impl(&ext, is_dir, large));
                    }
                    Request::Thumbnail {
                        path,
                        side,
                        reply,
                    } => {
                        let _ = reply.send(thumbnail_impl(&path, side));
                    }
                }
            }
        })
        .expect("cannot start the icon thread");

    tx
}

fn ask(
    worker: &'static std::sync::OnceLock<std::sync::mpsc::Sender<Request>>,
    name: &str,
    request: impl FnOnce(std::sync::mpsc::Sender<Option<DataUrl>>) -> Request,
) -> Option<DataUrl> {
    let (tx, rx) = std::sync::mpsc::channel();
    worker
        .get_or_init(|| start_worker(name))
        .send(request(tx))
        .ok()?;
    rx.recv_timeout(MAX_WAIT).ok()?
}

/// Icon associated with an extension. See `icon_impl` for the details.
pub fn icon_for_extension(ext: &str, is_dir: bool, large: bool) -> Option<DataUrl> {
    ask(&ICON_WORKER, "shell-icons", |reply| Request::Icon {
        ext: ext.to_string(),
        is_dir,
        large,
        reply,
    })
}

/// Real thumbnail of the file. See `thumbnail_impl` for the details.
pub fn thumbnail(path: &str, side: u32) -> Option<DataUrl> {
    ask(&THUMB_WORKER, "shell-thumbs", |reply| Request::Thumbnail {
        path: path.to_string(),
        side,
        reply,
    })
}

fn a_utf16(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Icon associated with an extension, without reading any file from disk.
///
/// `SHGFI_USEFILEATTRIBUTES` makes the icon resolve on the name alone: it can be
/// asked once per type and reused for all the items of that type.
///
/// To be invoked only from the STA thread: see `worker`.
fn icon_impl(ext: &str, is_dir: bool, large: bool) -> Option<DataUrl> {
    // A fake name is enough: nothing gets opened.
    let fake = if is_dir {
        "cartella".to_string()
    } else if ext.is_empty() {
        "file".to_string()
    } else {
        format!("file.{}", ext.trim_start_matches('.'))
    };

    let attributes: FILE_FLAGS_AND_ATTRIBUTES = if is_dir {
        FILE_ATTRIBUTE_DIRECTORY
    } else {
        FILE_ATTRIBUTE_NORMAL
    };

    let mut info = SHFILEINFOW::default();
    let flag = SHGFI_ICON
        | SHGFI_USEFILEATTRIBUTES
        | if large { SHGFI_LARGEICON } else { SHGFI_SMALLICON };

    // The UTF-16 buffer must outlive the call: passing it inline as
    // `PCWSTR(to_utf16(..).as_ptr())` frees it before the Shell reads it,
    // and reading freed memory succeeds or fails at random.
    let wide = a_utf16(&fake);

    let ok = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            attributes,
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flag,
        )
    };

    if ok == 0 || info.hIcon.is_invalid() {
        return None;
    }

    let result = icon_to_png(info.hIcon);
    unsafe {
        let _ = DestroyIcon(info.hIcon);
    }

    result.map(in_data_url)
}

/// Real thumbnail of the file: preview of images, frame of videos,
/// first page of PDFs. It reads the file, so it costs.
///
/// To be invoked only from the STA thread: see `worker`.
fn thumbnail_impl(path: &str, side: u32) -> Option<DataUrl> {
    let wide = a_utf16(path);

    let factory: IShellItemImageFactory =
        unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()? };

    let size = SIZE {
        cx: side as i32,
        cy: side as i32,
    };

    // SIIGBF_BIGGERSIZEOK accepts a larger source instead of refusing:
    // better for us to scale down than to be left without a preview.
    let bitmap: HBITMAP = unsafe { factory.GetImage(size, SIIGBF_BIGGERSIZEOK).ok()? };

    let result = bitmap_in_png(bitmap);
    unsafe {
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
    }

    result.map(in_data_url)
}

fn in_data_url(png: Vec<u8>) -> DataUrl {
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(png)
    )
}

fn icon_to_png(icon: HICON) -> Option<Vec<u8>> {
    let mut info = ICONINFO::default();
    unsafe { GetIconInfo(icon, &mut info).ok()? };

    let result = bitmap_in_png(info.hbmColor);

    unsafe {
        let _ = DeleteObject(HGDIOBJ(info.hbmColor.0));
        let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
    }

    result
}

/// Reads the pixels of an HBITMAP and encodes them as PNG.
///
/// GDI returns BGRA with the rows upside down; the conversion to RGBA
/// top to bottom happens here, because it is the only place that knows
/// GDI's format.
fn bitmap_in_png(bitmap: HBITMAP) -> Option<Vec<u8>> {
    if bitmap.is_invalid() {
        return None;
    }

    let mut bitmap_info = BITMAP::default();
    let read_bytes = unsafe {
        GetObjectW(
            HGDIOBJ(bitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bitmap_info as *mut _ as *mut std::ffi::c_void),
        )
    };
    if read_bytes == 0 {
        return None;
    }

    let width = bitmap_info.bmWidth;
    let height = bitmap_info.bmHeight;
    if width <= 0 || height <= 0 {
        return None;
    }

    let mut header = BITMAPINFO::default();
    header.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    header.bmiHeader.biWidth = width;
    // Negative = rows top to bottom, so there is no need to flip afterwards.
    header.bmiHeader.biHeight = -height;
    header.bmiHeader.biPlanes = 1;
    header.bmiHeader.biBitCount = 32;
    header.bmiHeader.biCompression = BI_RGB.0;

    let mut pixel = vec![0u8; (width * height * 4) as usize];

    let dc = unsafe { GetDC(None) };
    let lines = unsafe {
        GetDIBits(
            dc,
            bitmap,
            0,
            height as u32,
            Some(pixel.as_mut_ptr() as *mut std::ffi::c_void),
            &mut header,
            DIB_RGB_COLORS,
        )
    };
    unsafe {
        ReleaseDC(None, dc);
    }

    if lines == 0 {
        return None;
    }

    bgra_in_rgba(&mut pixel);
    encode_png(&pixel, width as u32, height as u32)
}

/// GDI uses BGRA, PNG wants RGBA: swaps the two channels in place.
fn bgra_in_rgba(pixel: &mut [u8]) {
    for p in pixel.chunks_exact_mut(4) {
        p.swap(0, 2);
    }
}

fn encode_png(rgba: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
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
    fn bgra_becomes_rgba() {
        let mut pixel = vec![1u8, 2, 3, 4, 10, 20, 30, 40];
        bgra_in_rgba(&mut pixel);

        // First and third byte swapped, alpha and green intact.
        assert_eq!(pixel, vec![3, 2, 1, 4, 30, 20, 10, 40]);
    }

    #[test]
    fn encodes_a_valid_png() {
        let rgba = vec![255u8; 2 * 2 * 4];
        let png = encode_png(&rgba, 2, 2).unwrap();

        // Firma PNG.
        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[test]
    fn the_icon_of_a_known_extension_exists() {
        let icon = icon_for_extension("txt", false, false).unwrap();
        assert!(icon.starts_with("data:image/png;base64,"));
        assert!(icon.len() > 100);
    }

    #[test]
    fn the_folder_icon_exists() {
        let icon = icon_for_extension("", true, false).unwrap();
        assert!(icon.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn different_extensions_give_different_icons() {
        let exe = icon_for_extension("exe", false, false).unwrap();
        let folder = icon_for_extension("", true, false).unwrap();

        assert_ne!(exe, folder);
    }

    #[test]
    fn a_made_up_extension_still_gives_the_generic_icon() {
        let icon = icon_for_extension("qwertyuiop", false, false);
        assert!(icon.is_some(), "Windows always has a fallback icon");
    }

    #[test]
    fn the_thumbnail_of_a_missing_path_is_none() {
        assert!(thumbnail(r"C:\questo\non\esiste\mai.png", 128).is_none());
    }
}
