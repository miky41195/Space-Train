//! Image tools from the context menu: rotate in place, convert and resize
//! into new files beside the originals, and small thumbnails.

use crate::fs::copy::unique_name;
use crate::fs::error::FsError;
use crate::fs::paths;
use image::{DynamicImage, ImageFormat};
use serde::Deserialize;
use std::io::{BufWriter, Cursor};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

const JPEG_ROTATE_QUALITY: u8 = 92;

fn io(e: impl std::fmt::Display) -> FsError {
    FsError::Io { message: e.to_string() }
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    Jpg,
    Png,
    Webp,
    /// The source's own format, when it can be written (else JPG).
    Same,
}

impl Target {
    /// Extension of the new file made from `source`.
    fn ext_for(self, source: &Path) -> &'static str {
        match self {
            Target::Jpg => "jpg",
            Target::Png => "png",
            Target::Webp => "webp",
            Target::Same => match ext_of(source).as_str() {
                "png" => "png",
                "webp" => "webp",
                "gif" => "gif",
                "bmp" => "bmp",
                _ => "jpg",
            },
        }
    }
}

fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// Decodes and turns the pixels the way the camera's EXIF orientation says:
/// the new files carry no EXIF, so the turn must be in the pixels.
fn open(path: &Path) -> Result<DynamicImage, FsError> {
    use image::ImageDecoder;
    let read = || -> image::ImageResult<DynamicImage> {
        let mut decoder = image::ImageReader::open(paths::extended(path))?.with_guessed_format()?.into_decoder()?;
        let orientation = decoder.orientation()?;
        let mut img = DynamicImage::from_decoder(decoder)?;
        img.apply_orientation(orientation);
        Ok(img)
    };
    match read() {
        Ok(img) => Ok(img),
        // HEIC, AVIF, TIFF and the rest: the codecs installed in Windows.
        #[cfg(windows)]
        Err(_) if !matches!(ext_of(path).as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp") => open_with_windows(path),
        Err(e) => Err(FsError::Io { message: format!("Immagine non leggibile: {e}") }),
    }
}

#[cfg(windows)]
fn open_with_windows(path: &Path) -> Result<DynamicImage, FsError> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::GENERIC_READ;
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    let unreadable = |e: windows::core::Error| FsError::Io {
        message: format!("Immagine non leggibile (per HEIC serve l'estensione HEIF di Microsoft Store): {}", e.message()),
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).map_err(unreadable)?;
        let decoder = factory
            .CreateDecoderFromFilename(
                &HSTRING::from(paths::display(path)),
                None,
                GENERIC_READ,
                WICDecodeMetadataCacheOnDemand,
            )
            .map_err(unreadable)?;
        let frame = decoder.GetFrame(0).map_err(unreadable)?;
        let rgba = factory.CreateFormatConverter().map_err(unreadable)?;
        rgba.Initialize(&frame, &GUID_WICPixelFormat32bppRGBA, WICBitmapDitherTypeNone, None, 0.0, WICBitmapPaletteTypeCustom)
            .map_err(unreadable)?;
        let (mut w, mut h) = (0u32, 0u32);
        rgba.GetSize(&mut w, &mut h).map_err(unreadable)?;
        let mut pixels = vec![0u8; w as usize * h as usize * 4];
        rgba.CopyPixels(std::ptr::null(), w * 4, &mut pixels).map_err(unreadable)?;
        image::RgbaImage::from_raw(w, h, pixels)
            .map(DynamicImage::ImageRgba8)
            .ok_or_else(|| io("Immagine non leggibile"))
    }
}

/// True when the file's EXIF asks for no turn, so its bytes can be kept.
fn upright(path: &Path) -> bool {
    use image::ImageDecoder;
    image::ImageReader::open(paths::extended(path))
        .ok()
        .and_then(|r| r.with_guessed_format().ok())
        .and_then(|r| r.into_decoder().ok())
        .and_then(|mut d| d.orientation().ok())
        .is_some_and(|o| o == image::metadata::Orientation::NoTransforms)
}

/// A copy without GPS position, camera data and comments, pixels untouched.
/// `None` when the format has no lossless way here.
fn strip_metadata(bytes: &[u8], ext: &str) -> Option<Vec<u8>> {
    match ext {
        "jpg" | "jpeg" => strip_jpeg(bytes),
        "png" => strip_png(bytes),
        _ => None,
    }
}

/// Drops APP1 (EXIF, XMP), APP13 (IPTC) and comments; keeps the colour profile.
fn strip_jpeg(b: &[u8]) -> Option<Vec<u8>> {
    if b.get(..2)? != [0xFF, 0xD8] {
        return None;
    }
    let mut out = vec![0xFF, 0xD8];
    let mut i = 2;
    loop {
        if *b.get(i)? != 0xFF {
            return None;
        }
        let marker = *b.get(i + 1)?;
        // Start of scan: the rest is image data.
        if marker == 0xDA {
            out.extend_from_slice(&b[i..]);
            return Some(out);
        }
        let len = u16::from_be_bytes([*b.get(i + 2)?, *b.get(i + 3)?]) as usize;
        let end = i + 2 + len;
        if len < 2 || end > b.len() {
            return None;
        }
        if !matches!(marker, 0xE1 | 0xED | 0xFE) {
            out.extend_from_slice(&b[i..end]);
        }
        i = end;
    }
}

/// Drops the eXIf, text and time chunks.
fn strip_png(b: &[u8]) -> Option<Vec<u8>> {
    const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    if b.get(..8)? != SIGNATURE {
        return None;
    }
    let mut out = SIGNATURE.to_vec();
    let mut i = 8;
    while i < b.len() {
        let len = u32::from_be_bytes(b.get(i..i + 4)?.try_into().ok()?) as usize;
        let end = i.checked_add(12)?.checked_add(len)?;
        let kind = b.get(i + 4..i + 8)?;
        if end > b.len() {
            return None;
        }
        if !matches!(kind, b"eXIf" | b"tEXt" | b"iTXt" | b"zTXt" | b"tIME") {
            out.extend_from_slice(&b[i..end]);
        }
        i = end;
    }
    Some(out)
}

fn save(img: &DynamicImage, to: &Path, format: ImageFormat, quality: u8) -> Result<(), FsError> {
    let file = std::fs::File::create(paths::extended(to)).map_err(io)?;
    let mut w = BufWriter::new(file);
    match format {
        // JPEG has no alpha: flatten first, or the encoder refuses RGBA.
        ImageFormat::Jpeg => image::codecs::jpeg::JpegEncoder::new_with_quality(&mut w, quality)
            .encode_image(&DynamicImage::ImageRgb8(img.to_rgb8()))
            .map_err(io),
        other => img.write_to(&mut w, other).map_err(io),
    }
}

/// Rotates the image a quarter turn and rewrites it in its own format.
pub fn rotate(path: &str, clockwise: bool) -> Result<(), FsError> {
    let p = Path::new(path);
    let format = ImageFormat::from_path(p).map_err(io)?;
    let img = open(p)?;
    let turned = if clockwise { img.rotate90() } else { img.rotate270() };
    // Written next to it first: a failure halfway never leaves a broken original.
    let tmp = p.with_extension(format!("{}.tmp", p.extension().and_then(|e| e.to_str()).unwrap_or("img")));
    save(&turned, &tmp, format, JPEG_ROTATE_QUALITY)?;
    std::fs::rename(paths::extended(&tmp), paths::extended(p)).map_err(io)
}

/// Converts (and optionally shrinks) each image into a new file beside it.
/// The new files never carry GPS position or camera data: re-encoding drops
/// them, and a same-format copy without resizing has them cut out with the
/// pixels untouched. `tag` names that copy («stem (tag).ext»), since its
/// name would otherwise be the original's.
/// Returns the new paths; stops between files when cancelled.
pub fn convert(
    sources: &[String],
    target: Target,
    max_side: Option<u32>,
    quality: u8,
    tag: &str,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<Vec<String>, FsError> {
    let mut out = Vec::new();
    for (i, s) in sources.iter().enumerate() {
        if crate::fs::pause::stopped(cancel) {
            break;
        }
        let p = Path::new(s);
        let ext = target.ext_for(p);
        let stem = p.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let same_format = ext == ext_of(p) || (ext == "jpg" && ext_of(p) == "jpeg");
        let base = match max_side {
            Some(m) => format!("{stem} ({m}).{ext}"),
            None if same_format => format!("{stem} ({tag}).{ext}"),
            None => format!("{stem}.{ext}"),
        };
        let dir = p.parent().ok_or(FsError::NotFound)?;
        let to: PathBuf = dir.join(unique_name(dir, &base));

        let lossless = (max_side.is_none() && same_format && upright(p))
            .then(|| std::fs::read(paths::extended(p)).ok())
            .flatten()
            .and_then(|bytes| strip_metadata(&bytes, &ext_of(p)));
        match lossless {
            Some(clean) => std::fs::write(paths::extended(&to), clean).map_err(io)?,
            None => {
                let mut img = open(p)?;
                if let Some(m) = max_side {
                    if img.width() > m || img.height() > m {
                        img = img.resize(m, m, image::imageops::FilterType::Lanczos3);
                    }
                }
                let format = ImageFormat::from_extension(ext).ok_or_else(|| io("formato"))?;
                save(&img, &to, format, quality.clamp(1, 100))?;
            }
        }
        out.push(paths::display(&to));
        progress(i as u64 + 1);
    }
    Ok(out)
}

/// A small PNG thumbnail as a data URL, for systems without one of their own.
pub fn thumbnail(path: &str, side: u32) -> Option<String> {
    let img = open(Path::new(path)).ok()?.thumbnail(side, side);
    let mut png = Vec::new();
    img.write_to(&mut Cursor::new(&mut png), ImageFormat::Png).ok()?;
    use base64::Engine;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample(path: &Path, w: u32, h: u32) {
        let img = DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(w, h, image::Rgba([200, 30, 30, 255])));
        img.save(path).unwrap();
    }

    #[test]
    fn rotating_swaps_the_sides_and_keeps_one_file() {
        let d = tempdir().unwrap();
        let p = d.path().join("a.png");
        sample(&p, 40, 10);
        rotate(&p.to_string_lossy(), true).unwrap();
        let back = image::open(&p).unwrap();
        assert_eq!((back.width(), back.height()), (10, 40));
        assert_eq!(std::fs::read_dir(d.path()).unwrap().count(), 1);
    }

    #[test]
    fn converting_shrinks_into_a_new_file_and_leaves_the_original() {
        let d = tempdir().unwrap();
        let p = d.path().join("big.png");
        sample(&p, 400, 200);
        let made = convert(&[p.to_string_lossy().into_owned()], Target::Jpg, Some(100), 80, "x", &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert!(made[0].ends_with("big (100).jpg"));
        let small = image::open(&made[0]).unwrap();
        assert_eq!((small.width(), small.height()), (100, 50));
        assert!(p.exists());
    }

    #[test]
    fn a_same_format_copy_loses_gps_and_keeps_the_pixels() {
        let d = tempdir().unwrap();
        let p = d.path().join("foto.jpg");
        sample(&p, 32, 16);
        // An APP1 «Exif» segment right after SOI, as a camera writes it.
        let plain = std::fs::read(&p).unwrap();
        let app1: &[u8] = &[0xFF, 0xE1, 0x00, 0x0A, b'E', b'x', b'i', b'f', 0, 0, b'G', b'P'];
        let with_exif = [&plain[..2], app1, &plain[2..]].concat();
        std::fs::write(&p, &with_exif).unwrap();

        let made = convert(&[p.to_string_lossy().into_owned()], Target::Same, None, 85, "senza dati", &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert!(made[0].ends_with("foto (senza dati).jpg"));
        assert_eq!(std::fs::read(&made[0]).unwrap(), plain, "only the EXIF segment goes");
        assert_eq!(std::fs::read(&p).unwrap(), with_exif, "the original stays");
    }

    #[test]
    fn png_text_chunks_go_and_the_rest_stays() {
        let d = tempdir().unwrap();
        let p = d.path().join("a.png");
        sample(&p, 8, 8);
        let plain = std::fs::read(&p).unwrap();
        // A tEXt chunk after IHDR (signature 8 + IHDR 25 bytes); the CRC is not checked here.
        let text: &[u8] = &[0, 0, 0, 3, b't', b'E', b'X', b't', b'a', 0, b'b', 0, 0, 0, 0];
        let with_text = [&plain[..33], text, &plain[33..]].concat();
        assert_eq!(strip_png(&with_text).unwrap(), plain);
    }

    #[test]
    fn thumbnails_are_png_data_urls() {
        let d = tempdir().unwrap();
        let p = d.path().join("t.png");
        sample(&p, 300, 300);
        assert!(thumbnail(&p.to_string_lossy(), 64).unwrap().starts_with("data:image/png;base64,"));
    }
}
