//! Photo, video and music details (date taken, duration, size in pixels,
//! artist…) read from the Windows property system: the same values File
//! Explorer shows in its columns.

use serde::Serialize;

#[derive(Serialize, Default, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaProps {
    /// Date taken, in ms since the epoch (UTC).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub taken: Option<i64>,
    /// Duration in seconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    /// Bits per second.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u32>,
    /// Hz.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Track number on the album.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track: Option<u32>,
}

/// Hard cap per call: the frontend asks in batches for what it shows.
const MAX_PATHS: usize = 500;

/// Details for each path, `None` where nothing could be read.
#[tauri::command]
pub async fn media_props(paths: Vec<String>) -> Vec<Option<MediaProps>> {
    tauri::async_runtime::spawn_blocking(move || {
        imp::init();
        paths.iter().take(MAX_PATHS).map(|p| imp::read(p)).collect()
    })
    .await
    .unwrap_or_default()
}

/// FILETIME (100 ns since 1601) to ms since 1970.
#[cfg_attr(not(windows), allow(dead_code))]
fn filetime_to_ms(ft: u64) -> Option<i64> {
    const EPOCH_DIFF_100NS: u64 = 116_444_736_000_000_000;
    (ft > EPOCH_DIFF_100NS).then(|| ((ft - EPOCH_DIFF_100NS) / 10_000) as i64)
}

#[cfg(windows)]
mod imp {
    use super::{filetime_to_ms, MediaProps};
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::Storage::EnhancedStorage::*;
    use windows::Win32::System::Com::StructuredStorage::{
        PropVariantClear, PropVariantToFileTime, PropVariantToStringAlloc, PropVariantToUInt32,
        PropVariantToUInt64, PROPVARIANT,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoTaskMemFree, COINIT_MULTITHREADED};
    use windows::Win32::System::Variant::{PSTF_UTC, VT_EMPTY};
    use windows::Win32::UI::Shell::PropertiesSystem::{
        IPropertyStore, SHGetPropertyStoreFromParsingName, GPS_BESTEFFORT,
    };

    pub fn init() {
        // Already initialised on this thread is fine: the result is ignored.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    /// Owns a PROPVARIANT and clears it on drop.
    struct Value(PROPVARIANT);

    impl Drop for Value {
        fn drop(&mut self) {
            unsafe {
                let _ = PropVariantClear(&mut self.0);
            }
        }
    }

    fn get(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<Value> {
        let v = Value(unsafe { store.GetValue(key) }.ok()?);
        let vt = unsafe { v.0.Anonymous.Anonymous.vt };
        (vt != VT_EMPTY).then_some(v)
    }

    fn text(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<String> {
        let v = get(store, key)?;
        let p: PWSTR = unsafe { PropVariantToStringAlloc(&v.0) }.ok()?;
        let s = unsafe { p.to_string() }.ok();
        unsafe { CoTaskMemFree(Some(p.0 as _)) };
        s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    }

    fn u32_of(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<u32> {
        let v = get(store, key)?;
        unsafe { PropVariantToUInt32(&v.0) }.ok().filter(|n| *n > 0)
    }

    pub fn read(path: &str) -> Option<MediaProps> {
        let store: IPropertyStore =
            unsafe { SHGetPropertyStoreFromParsingName(&HSTRING::from(path), None, GPS_BESTEFFORT) }.ok()?;
        let taken = get(&store, &PKEY_Photo_DateTaken).and_then(|v| {
            let ft = unsafe { PropVariantToFileTime(&v.0, PSTF_UTC) }.ok()?;
            filetime_to_ms(((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64)
        });
        let duration = get(&store, &PKEY_Media_Duration)
            .and_then(|v| unsafe { PropVariantToUInt64(&v.0) }.ok())
            .filter(|d| *d > 0)
            .map(|d| d as f64 / 10_000_000.0);
        let width = u32_of(&store, &PKEY_Image_HorizontalSize).or_else(|| u32_of(&store, &PKEY_Video_FrameWidth));
        let height = u32_of(&store, &PKEY_Image_VerticalSize).or_else(|| u32_of(&store, &PKEY_Video_FrameHeight));
        let props = MediaProps {
            taken,
            duration,
            width,
            height,
            artist: text(&store, &PKEY_Music_Artist).or_else(|| text(&store, &PKEY_Music_AlbumArtist)),
            album: text(&store, &PKEY_Music_AlbumTitle),
            camera: text(&store, &PKEY_Photo_CameraModel),
            year: u32_of(&store, &PKEY_Media_Year),
            bitrate: u32_of(&store, &PKEY_Audio_EncodingBitrate),
            sample_rate: u32_of(&store, &PKEY_Audio_SampleRate),
            title: text(&store, &PKEY_Title),
            track: u32_of(&store, &PKEY_Music_TrackNumber),
        };
        (props != MediaProps::default()).then_some(props)
    }
}

/// shortcut: no media details off Windows yet; read EXIF/tags there when Linux users ask.
#[cfg(not(windows))]
mod imp {
    use super::MediaProps;
    pub fn init() {}
    pub fn read(_path: &str) -> Option<MediaProps> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filetime_converts_to_unix_ms() {
        // 2000-01-01T00:00:00Z
        assert_eq!(filetime_to_ms(125_911_584_000_000_000), Some(946_684_800_000));
        assert_eq!(filetime_to_ms(0), None);
    }

    #[cfg(windows)]
    #[test]
    fn reads_size_of_a_png() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.png");
        image::RgbImage::new(37, 21).save(&p).unwrap();
        let props = tauri::async_runtime::block_on(media_props(vec![p.to_string_lossy().into_owned()]));
        let got = props[0].clone().expect("properties for a png");
        assert_eq!((got.width, got.height), (Some(37), Some(21)));
    }
}
