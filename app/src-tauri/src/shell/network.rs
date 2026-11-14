//! Network locations: the visible computers and a server's shares.
//!
//! `\\server\share` is a normal path that read_dir can read.
//! `\\server` alone and the whole «Rete» instead cannot: WNet lists them.

use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;

pub const ROOT: &str = "::rete";

/// True for `\\server`, with no share after it.
pub fn is_server(path: &str) -> bool {
    let Some(rest) = path.strip_prefix(r"\\") else {
        return false;
    };
    let rest = rest.trim_end_matches('\\');
    !rest.is_empty() && !rest.contains('\\') && !rest.starts_with('?') && !rest.starts_with('.')
}

/// True for `\\server\share`, the root of a share.
pub fn is_share(path: &str) -> bool {
    let Some(rest) = path.strip_prefix(r"\\") else {
        return false;
    };
    let parts: Vec<&str> = rest.trim_end_matches('\\').split('\\').collect();
    parts.len() == 2 && !parts[0].starts_with('?') && parts.iter().all(|p| !p.is_empty())
}

/// The parent in the network locations: share → server → Network.
pub fn parent_of(path: &str) -> Option<String> {
    if is_share(path) {
        let rest = &path[2..];
        let server = rest.split('\\').next()?;
        return Some(format!(r"\\{}", server));
    }
    if is_server(path) {
        return Some(ROOT.to_string());
    }
    None
}

fn folder(name: String, path: String) -> Entry {
    Entry {
        name: name,
        path,
        kind: EntryKind::Dir,
        size: 0,
        modified: None,
        hidden: false,
        origin: None,
        free: None,
        total: None,
        own_icon: false,
        snippet: None,
    }
}

/// The computers of the local network.
pub fn computer() -> Result<Vec<Entry>, FsError> {
    let mut items: Vec<Entry> = enumerate_resources(None)
        .into_iter()
        .filter(|(name, _)| is_server(name))
        .map(|(remote, _)| {
            let name = remote.trim_start_matches('\\').to_string();
            folder(name, remote)
        })
        .collect();
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

/// The shares published by `\\server`.
pub fn shares(server: &str) -> Result<Vec<Entry>, FsError> {
    let server = server.trim_end_matches('\\');
    let found = enumerate_resources(Some(server));
    if found.is_empty() {
        return Err(FsError::NotFound);
    }
    let mut items: Vec<Entry> = found
        .into_iter()
        .map(|(remote, _)| {
            let name = remote.rsplit('\\').next().unwrap_or(&remote).to_string();
            folder(name, remote)
        })
        .collect();
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

#[cfg(windows)]
fn enumerate_resources(container: Option<&str>) -> Vec<(String, u32)> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, HANDLE, NO_ERROR};
    use windows::Win32::NetworkManagement::WNet::{
        WNetCloseEnum, WNetEnumResourceW, WNetOpenEnumW, NETRESOURCEW, RESOURCETYPE_DISK,
        RESOURCEUSAGE_ALL, RESOURCE_CONTEXT, RESOURCE_GLOBALNET,
    };

    let mut name: Vec<u16> = container
        .unwrap_or("")
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let root = NETRESOURCEW {
        lpRemoteName: PWSTR(name.as_mut_ptr()),
        ..Default::default()
    };

    let mut handle = HANDLE::default();
    let opened = unsafe {
        match container {
            Some(_) => WNetOpenEnumW(
                RESOURCE_GLOBALNET,
                RESOURCETYPE_DISK,
                RESOURCEUSAGE_ALL,
                Some(&root),
                &mut handle,
            ),
            None => WNetOpenEnumW(
                RESOURCE_CONTEXT,
                RESOURCETYPE_DISK,
                RESOURCEUSAGE_ALL,
                None,
                &mut handle,
            ),
        }
    };
    if opened != NO_ERROR {
        return Vec::new();
    }

    let mut out = Vec::new();
    // NETRESOURCEW holds pointers to strings that live in the same buffer:
    // it must be aligned, hence u64 instead of u8.
    let mut buffer = vec![0u64; 16 * 1024 / 8];
    loop {
        let mut count = u32::MAX;
        let mut size = (buffer.len() * 8) as u32;
        let outcome = unsafe {
            WNetEnumResourceW(
                handle,
                &mut count,
                buffer.as_mut_ptr() as *mut _,
                &mut size,
            )
        };
        if outcome == ERROR_NO_MORE_ITEMS || outcome != NO_ERROR {
            break;
        }
        let resources = unsafe {
            std::slice::from_raw_parts(buffer.as_ptr() as *const NETRESOURCEW, count as usize)
        };
        for r in resources {
            if r.lpRemoteName.is_null() {
                continue;
            }
            let remote = unsafe { r.lpRemoteName.to_string() }.unwrap_or_default();
            out.push((remote, r.dwDisplayType));
        }
    }
    unsafe {
        let _ = WNetCloseEnum(handle);
    }
    out
}

#[cfg(not(windows))]
fn enumerate_resources(_container: Option<&str>) -> Vec<(String, u32)> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_servers_and_shares() {
        assert!(is_server(r"\\nas"));
        assert!(is_server(r"\\nas\"));
        assert!(!is_server(r"\\nas\foto"));
        assert!(!is_server(r"\\?\C:\x"));
        assert!(!is_server(r"C:\"));

        assert!(is_share(r"\\nas\foto"));
        assert!(!is_share(r"\\nas\foto\2024"));
        assert!(!is_share(r"\\nas"));
    }

    #[test]
    fn going_up_from_a_share_leads_to_the_network() {
        assert_eq!(parent_of(r"\\nas\foto"), Some(r"\\nas".to_string()));
        assert_eq!(parent_of(r"\\nas"), Some(ROOT.to_string()));
        assert_eq!(parent_of(r"C:\x"), None);
    }

    #[test]
    fn listing_the_network_does_not_fail_even_if_empty() {
        assert!(computer().is_ok());
    }
}
