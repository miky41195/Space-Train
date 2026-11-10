//! Compares two folder trees: what is only on one side and what differs.
//!
//! Names match case-insensitively, like Windows. A folder missing on the
//! other side is reported once, not file by file.

use crate::fs::entry::{entry_from_dir_entry, Entry, EntryKind};
use crate::fs::error::FsError;
use crate::fs::paths;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// FAT and exFAT keep modification times to 2 seconds.
const TIME_SLACK_MS: i64 = 2000;

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub only_here: Vec<Entry>,
    pub only_there: Vec<Entry>,
    pub different: Vec<Different>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Different {
    pub here: Entry,
    pub there: Entry,
    /// The copy here was modified later than the one there.
    pub newer_here: bool,
}

pub struct Options {
    /// Read the files: equal size is not enough, the bytes must match.
    pub content: bool,
    pub hidden: bool,
}

pub fn compare(here: &str, there: &str, opts: &Options, cancel: &AtomicBool) -> Result<Comparison, FsError> {
    for p in [here, there] {
        if !paths::extended(Path::new(p)).is_dir() {
            return Err(FsError::Io { message: format!("Non è una cartella: {}", p) });
        }
    }
    let mut out = Comparison::default();
    walk(Path::new(here), Path::new(there), opts, cancel, &mut out);
    Ok(out)
}

fn list(dir: &Path, hidden: bool) -> HashMap<String, (PathBuf, Entry)> {
    let Ok(items) = std::fs::read_dir(paths::extended(dir)) else {
        return HashMap::new();
    };
    items
        .filter_map(|d| d.ok())
        // Links and junctions are not followed: they can loop back up the tree.
        .filter(|d| !d.file_type().map(|t| t.is_symlink()).unwrap_or(true))
        .filter_map(|d| {
            let mut e = entry_from_dir_entry(&d)?;
            if e.hidden && !hidden {
                return None;
            }
            e.path = paths::display(Path::new(&e.path));
            Some((e.name.to_lowercase(), (d.path(), e)))
        })
        .collect()
}

fn walk(here: &Path, there: &Path, opts: &Options, cancel: &AtomicBool, out: &mut Comparison) {
    if cancel.load(Ordering::Relaxed) {
        return;
    }
    let a = list(here, opts.hidden);
    let mut b = list(there, opts.hidden);

    let mut names: Vec<&String> = a.keys().collect();
    names.sort();
    for name in names {
        let (pa, ea) = &a[name];
        let Some((pb, eb)) = b.remove(name) else {
            out.only_here.push(ea.clone());
            continue;
        };
        match (ea.kind, eb.kind) {
            (EntryKind::Dir, EntryKind::Dir) => walk(pa, &pb, opts, cancel, out),
            _ if ea.kind != eb.kind || differ(pa, ea, &pb, &eb, opts, cancel) => {
                let newer_here = ea.modified.unwrap_or(0) > eb.modified.unwrap_or(0);
                out.different.push(Different { here: ea.clone(), there: eb, newer_here });
            }
            _ => {}
        }
    }
    let mut rest: Vec<Entry> = b.into_values().map(|(_, e)| e).collect();
    rest.sort_by(|x, y| x.name.to_lowercase().cmp(&y.name.to_lowercase()));
    out.only_there.extend(rest);
}

fn differ(pa: &Path, ea: &Entry, pb: &Path, eb: &Entry, opts: &Options, cancel: &AtomicBool) -> bool {
    if ea.size != eb.size {
        return true;
    }
    if opts.content {
        return crate::fs::duplicates::hash(pa, ea.size, cancel) != crate::fs::duplicates::hash(pb, eb.size, cancel);
    }
    match (ea.modified, eb.modified) {
        (Some(x), Some(y)) => (x - y).abs() > TIME_SLACK_MS,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn names(v: &[Entry]) -> Vec<&str> {
        v.iter().map(|e| e.name.as_str()).collect()
    }

    #[test]
    fn finds_missing_and_different_files() {
        let a = tempdir().unwrap();
        let b = tempdir().unwrap();
        fs::write(a.path().join("same.txt"), "x").unwrap();
        fs::write(b.path().join("SAME.txt"), "x").unwrap();
        fs::write(a.path().join("only-a.txt"), "x").unwrap();
        fs::write(b.path().join("only-b.txt"), "x").unwrap();
        fs::write(a.path().join("changed.txt"), "longer").unwrap();
        fs::write(b.path().join("changed.txt"), "short").unwrap();
        fs::create_dir_all(a.path().join("sub").join("deep")).unwrap();
        fs::create_dir_all(b.path().join("sub")).unwrap();
        fs::write(a.path().join("sub").join("deep").join("f.txt"), "x").unwrap();

        let opts = Options { content: false, hidden: false };
        let c = compare(&a.path().to_string_lossy(), &b.path().to_string_lossy(), &opts, &AtomicBool::new(false)).unwrap();
        assert_eq!(names(&c.only_here), vec!["only-a.txt", "deep"]);
        assert_eq!(names(&c.only_there), vec!["only-b.txt"]);
        assert_eq!(c.different.iter().map(|d| d.here.name.as_str()).collect::<Vec<_>>(), vec!["changed.txt"]);
    }

    #[test]
    fn content_mode_reads_the_bytes() {
        let a = tempdir().unwrap();
        let b = tempdir().unwrap();
        fs::write(a.path().join("f.txt"), "abc").unwrap();
        fs::write(b.path().join("f.txt"), "abd").unwrap();
        let (pa, pb) = (a.path().to_string_lossy(), b.path().to_string_lossy());
        let cancel = AtomicBool::new(false);
        // Same size, written at the same moment: only reading tells them apart.
        let quick = compare(&pa, &pb, &Options { content: false, hidden: false }, &cancel).unwrap();
        let deep = compare(&pa, &pb, &Options { content: true, hidden: false }, &cancel).unwrap();
        assert!(quick.different.is_empty());
        assert_eq!(deep.different.len(), 1);
    }

    #[test]
    fn a_file_is_not_a_folder() {
        let a = tempdir().unwrap();
        assert!(compare(&a.path().join("x").to_string_lossy(), &a.path().to_string_lossy(), &Options { content: false, hidden: false }, &AtomicBool::new(false)).is_err());
    }
}
