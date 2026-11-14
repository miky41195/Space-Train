//! What to open at startup, from the arguments Windows launches
//! the app with when it is the default file manager.
//!
//! The registry passes the folder as `"%1"`. Other programs talk to
//! Explorer with its options (`/select,`, `/e,`, `/root,`) or with the CLSID of
//! This PC: we understand them too, so whoever uses them finds the right folder.

use crate::fs::ops::{resolve_input, Destination};

/// CLSID of «Questo PC»: Win+E and some shortcuts use it.
const CLSID_THIS_PC: &str = "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}";

/// The raw request extracted from the arguments, before touching the disk.
#[derive(Debug, PartialEq)]
pub enum Request {
    /// A folder or a file to open.
    Path(String),
    /// Open the folder that contains the file and select it.
    Select(String),
    ThisPc,
}

/// Interprets the arguments (without the executable's name).
pub fn parse(args: &[String]) -> Option<Request> {
    // Explorer accepts the options separate or joined by commas, in any
    // order: «/e,/select,C:\x». They are joined and read again by comma.
    let text = args
        .iter()
        .map(|a| a.trim())
        .filter(|a| !a.is_empty())
        .collect::<Vec<_>>()
        .join(",");
    if text.is_empty() {
        return None;
    }

    let mut select = false;
    let mut location: Option<String> = None;
    for part in split_commas(&text) {
        let p = part.trim().trim_matches('"').trim();
        match p.to_lowercase().as_str() {
            "" => {}
            "/select" => select = true,
            "/e" | "/n" | "/root" | "/separate" => {}
            _ if p.eq_ignore_ascii_case(CLSID_THIS_PC) => return Some(Request::ThisPc),
            // Elsewhere a leading `/` is a path, not an Explorer option.
            _ if (cfg!(windows) && p.starts_with('/')) || p.starts_with('-') => {}
            _ => {
                // A path can contain commas: everything after the first
                // non-option part belongs to the path.
                let index = text.find(p).unwrap_or(0);
                location = Some(text[index..].trim().trim_matches('"').to_string());
                break;
            }
        }
    }

    let location = location?;
    Some(if select { Request::Select(location) } else { Request::Path(location) })
}

fn split_commas(s: &str) -> Vec<&str> {
    s.split(',').collect()
}

/// Where to take the user, checking that the path exists. A path that has
/// vanished in the meantime does not block the startup: we go back to the
/// normal behaviour.
pub fn destination(args: &[String]) -> Option<Destination> {
    match parse(args)? {
        Request::ThisPc => Some(Destination { folder: "::pc".into(), select: None }),
        Request::Path(p) | Request::Select(p) => resolve_input(&p).ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn a(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn without_arguments_nothing_special_opens() {
        assert_eq!(parse(&[]), None);
        assert_eq!(parse(&a(&[""])), None);
    }

    #[test]
    fn the_folder_passed_by_the_registry() {
        assert_eq!(parse(&a(&[r"C:\Utenti\Anna"])), Some(Request::Path(r"C:\Utenti\Anna".into())));
        assert_eq!(parse(&a(&[r#""D:\""#])), Some(Request::Path(r"D:\".into())));
    }

    #[test]
    fn explorer_options() {
        assert_eq!(
            parse(&a(&[r"/select,C:\Dati\nota.txt"])),
            Some(Request::Select(r"C:\Dati\nota.txt".into()))
        );
        assert_eq!(
            parse(&a(&["/e,", r"C:\Dati"])),
            Some(Request::Path(r"C:\Dati".into()))
        );
        assert_eq!(parse(&a(&[CLSID_THIS_PC])), Some(Request::ThisPc));
    }

    #[cfg(not(windows))]
    #[test]
    fn a_linux_path_is_a_path() {
        assert_eq!(
            parse(&a(&["/home/anna/Foto"])),
            Some(Request::Path("/home/anna/Foto".into()))
        );
    }

    #[test]
    fn a_path_with_a_comma_stays_whole() {
        assert_eq!(
            parse(&a(&[r"C:\Foto, mare e montagna"])),
            Some(Request::Path(r"C:\Foto, mare e montagna".into()))
        );
    }

    #[test]
    fn the_destination_checks_the_disk() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join("nota.txt");
        std::fs::write(&f, b"x").unwrap();
        let folder = d.path().to_string_lossy().into_owned();

        let dest = destination(&a(&[&folder])).unwrap();
        assert_eq!(dest.folder, folder);

        let sel = destination(&a(&[&format!("/select,{}", f.to_string_lossy())])).unwrap();
        assert_eq!(sel.folder, folder);
        assert_eq!(sel.select, Some(f.to_string_lossy().into_owned()));

        assert_eq!(destination(&a(&[r"C:\non\esiste\proprio"])), None);
        assert_eq!(destination(&a(&[CLSID_THIS_PC])).unwrap().folder, "::pc");
    }
}
