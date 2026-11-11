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
}

impl Target {
    fn ext(self) -> &'static str {
        match self {
            Target::Jpg => "jpg",
            Target::Png => "png",
            Target::Webp => "webp",
        }
    }
}

fn open(path: &Path) -> Result<DynamicImage, FsError> {
    image::ImageReader::open(paths::extended(path))
        .map_err(io)?
        .with_guessed_format()
        .map_err(io)?
        .decode()
        .map_err(|e| FsError::Io { message: format!("Immagine non leggibile: {e}") })
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
/// Returns the new paths; stops between files when cancelled.
pub fn convert(
    sources: &[String],
    target: Target,
    max_side: Option<u32>,
    quality: u8,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> Result<Vec<String>, FsError> {
    let mut out = Vec::new();
    for (i, s) in sources.iter().enumerate() {
        if crate::fs::pausa::fermo(cancel) {
            break;
        }
        let p = Path::new(s);
        let mut img = open(p)?;
        if let Some(m) = max_side {
            if img.width() > m || img.height() > m {
                img = img.resize(m, m, image::imageops::FilterType::Lanczos3);
            }
        }
        let stem = p.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let base = match max_side {
            Some(m) => format!("{stem} ({m}).{}", target.ext()),
            None => format!("{stem}.{}", target.ext()),
        };
        let dir = p.parent().ok_or(FsError::NotFound)?;
        let to: PathBuf = dir.join(unique_name(dir, &base));
        let format = ImageFormat::from_extension(target.ext()).ok_or_else(|| io("formato"))?;
        save(&img, &to, format, quality.clamp(1, 100))?;
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
        let made = convert(&[p.to_string_lossy().into_owned()], Target::Jpg, Some(100), 80, &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert!(made[0].ends_with("big (100).jpg"));
        let small = image::open(&made[0]).unwrap();
        assert_eq!((small.width(), small.height()), (100, 50));
        assert!(p.exists());
    }

    #[test]
    fn thumbnails_are_png_data_urls() {
        let d = tempdir().unwrap();
        let p = d.path().join("t.png");
        sample(&p, 300, 300);
        assert!(thumbnail(&p.to_string_lossy(), 64).unwrap().starts_with("data:image/png;base64,"));
    }
}
