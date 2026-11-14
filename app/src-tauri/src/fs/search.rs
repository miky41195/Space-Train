//! Search in subfolders, by name and optionally by content.
//!
//! Results come out in groups while the walk goes on: waiting for the
//! end on a whole disk would mean minutes of empty screen.

use crate::fs::entry::{entry_from_dir_entry, Entry, EntryKind, Snippet};
use crate::fs::paths;
use serde::Deserialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// Past this number the search stops: nobody scrolls through ten thousand
/// results, and an endless list does not help find anything.
pub const MAX_RESULTS: usize = 10_000;

/// Larger files are not read when searching in the content.
const MAX_CONTENT: u64 = 20 * 1024 * 1024;

const BATCH: usize = 64;
const INTERVAL: Duration = Duration::from_millis(150);

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchCriteria {
    pub text: String,
    /// Also look for the text inside the files, not only in the names.
    pub content: bool,
    pub hidden: bool,
    /// Smart folder filters. Any of them set limits the results to files.
    /// Lowercase extensions without the dot.
    #[serde(default)]
    pub extensions: Option<Vec<String>>,
    #[serde(default)]
    pub min_size: Option<u64>,
    /// Milliseconds since the Unix epoch.
    #[serde(default)]
    pub modified_after: Option<i64>,
    #[serde(default)]
    pub modified_before: Option<i64>,
}

impl SearchCriteria {
    fn has_filters(&self) -> bool {
        self.extensions.is_some() || self.min_size.is_some() || self.modified_after.is_some() || self.modified_before.is_some()
    }

    /// True if `e` passes the smart folder filters (always true without filters).
    fn passes(&self, e: &Entry) -> bool {
        if !self.has_filters() {
            return true;
        }
        if e.kind != EntryKind::File {
            return false;
        }
        if let Some(ext) = &self.extensions {
            let own = e.name.rsplit_once('.').map(|(_, x)| x.to_lowercase()).unwrap_or_default();
            if !ext.iter().any(|x| *x == own) {
                return false;
            }
        }
        let modified = e.modified.unwrap_or(0);
        self.min_size.map_or(true, |m| e.size >= m)
            && self.modified_after.map_or(true, |t| modified >= t)
            && self.modified_before.map_or(true, |t| modified < t)
    }
}

/// Walks `root` and delivers the results in batches. Returns how many it found.
pub fn search(
    root: &str,
    criteria: &SearchCriteria,
    cancel: &AtomicBool,
    deliver: &mut dyn FnMut(Vec<Entry>),
) -> usize {
    let text = criteria.text.trim().to_lowercase();
    if text.is_empty() && !criteria.has_filters() {
        return 0;
    }
    let matcher = Matcher::new(&text);

    let mut stack: Vec<PathBuf> = vec![PathBuf::from(root)];
    let mut batch: Vec<Entry> = Vec::new();
    let mut found = 0usize;
    let mut last = Instant::now();

    while let Some(dir) = stack.pop() {
        if cancel.load(Ordering::Relaxed) || found >= MAX_RESULTS {
            break;
        }

        // An unreadable folder is skipped: the search goes on elsewhere.
        let Ok(items) = std::fs::read_dir(paths::extended(&dir)) else {
            continue;
        };

        for de in items.filter_map(|v| v.ok()) {
            let Some(mut e) = entry_from_dir_entry(&de) else {
                continue;
            };
            if e.hidden && !criteria.hidden {
                continue;
            }

            // Links and junctions are not crossed: they can point to an
            // ancestor and close a loop.
            let symlink = de.file_type().map(|t| t.is_symlink()).unwrap_or(true);
            if e.kind == EntryKind::Dir && !symlink {
                stack.push(de.path());
            }

            if !criteria.passes(&e) {
                continue;
            }
            let name_ok = text.is_empty() || matcher.name(&e.name.to_lowercase());
            if !name_ok && criteria.content && e.kind == EntryKind::File && e.size <= MAX_CONTENT {
                e.snippet = find_in_content(&de.path(), &text);
            }

            if name_ok || e.snippet.is_some() {
                e.path = paths::display(Path::new(&e.path));
                batch.push(e);
                found += 1;
                if found >= MAX_RESULTS {
                    break;
                }
            }

            if batch.len() >= BATCH || (!batch.is_empty() && last.elapsed() >= INTERVAL) {
                deliver(std::mem::take(&mut batch));
                last = Instant::now();
            }
        }
    }

    if !batch.is_empty() {
        deliver(batch);
    }
    found
}

/// How a name is matched: all the words contained, or a pattern with `*`
/// and `?` if the user typed one.
enum Matcher {
    Words(Vec<String>),
    Pattern(Vec<char>),
}

impl Matcher {
    fn new(text: &str) -> Self {
        if text.contains('*') || text.contains('?') {
            Matcher::Pattern(text.chars().collect())
        } else {
            Matcher::Words(text.split_whitespace().map(String::from).collect())
        }
    }

    fn name(&self, name: &str) -> bool {
        match self {
            Matcher::Words(p) => p.iter().all(|w| name.contains(w.as_str())),
            Matcher::Pattern(m) => matches(m, &name.chars().collect::<Vec<_>>()),
        }
    }
}

/// Wildcard matching, iterative so it does not blow up on `*`.
fn matches(pattern: &[char], name: &[char]) -> bool {
    let (mut m, mut n) = (0usize, 0usize);
    let mut star: Option<usize> = None;
    let mut resume_at = 0usize;

    while n < name.len() {
        if m < pattern.len() && (pattern[m] == '?' || pattern[m] == name[n]) {
            m += 1;
            n += 1;
        } else if m < pattern.len() && pattern[m] == '*' {
            star = Some(m);
            resume_at = n;
            m += 1;
        } else if let Some(s) = star {
            m = s + 1;
            resume_at += 1;
            n = resume_at;
        } else {
            return false;
        }
    }
    while m < pattern.len() && pattern[m] == '*' {
        m += 1;
    }
    m == pattern.len()
}

/// Characters kept before the match in a snippet, and the snippet's maximum length.
const SNIPPET_LEAD: usize = 40;
const SNIPPET_MAX: usize = 160;

/// The first line of a text file that contains `text` (already lowercase), or None.
fn find_in_content(path: &Path, text: &str) -> Option<Snippet> {
    let mut f = std::fs::File::open(paths::extended(path)).ok()?;
    let mut data = Vec::new();
    f.by_ref().take(MAX_CONTENT).read_to_end(&mut data).ok()?;
    // A null byte at the start means a binary file: searching inside it
    // would only give false positives.
    if data.iter().take(8000).any(|b| *b == 0) {
        return None;
    }
    snippet_of(&String::from_utf8_lossy(&data), text)
}

fn snippet_of(text: &str, query: &str) -> Option<Snippet> {
    let mut first: Option<Snippet> = None;
    for (n, line) in text.lines().enumerate() {
        let lower = line.to_lowercase();
        let Some(byte) = lower.find(query) else { continue };
        match first.as_mut() {
            Some(s) => s.more += 1,
            None => {
                let (text, at) = excerpt(line, &lower, byte);
                let len = query.chars().count();
                first = Some(Snippet { line: n + 1, text, at, len, more: 0 });
            }
        }
    }
    first
}

/// Cuts `line` to a window around the match so the match is always visible.
/// Returns the excerpt and where the match starts in it (characters).
fn excerpt(line: &str, lower: &str, byte: usize) -> (String, usize) {
    let chars: Vec<char> = line.chars().collect();
    // Lowercasing can change the length of a few characters (İ): then the
    // position is unknown and the line is shown from its start.
    let pos = if lower.chars().count() == chars.len() { lower[..byte].chars().count() } else { 0 };
    let lead = chars[..pos].iter().take_while(|c| c.is_whitespace()).count();
    let start = pos.saturating_sub(SNIPPET_LEAD).max(lead);
    let end = (start + SNIPPET_MAX).min(chars.len());
    let mut out: String = chars[start..end].iter().collect();
    let mut at = pos - start;
    if start > lead {
        out.insert(0, '…');
        at += 1;
    }
    if end < chars.len() {
        out.push('…');
    }
    (out.trim_end().to_string(), at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn criteria(text: &str, content: bool) -> SearchCriteria {
        SearchCriteria {
            text: text.into(),
            content,
            hidden: false,
            extensions: None,
            min_size: None,
            modified_after: None,
            modified_before: None,
        }
    }

    fn names(root: &Path, c: &SearchCriteria) -> Vec<String> {
        let mut out = Vec::new();
        search(
            &root.to_string_lossy(),
            c,
            &AtomicBool::new(false),
            &mut |batch| out.extend(batch.into_iter().map(|e| e.name)),
        );
        out.sort();
        out
    }

    #[test]
    fn finds_in_subfolders() {
        let d = tempdir().unwrap();
        fs::create_dir_all(d.path().join("a").join("b")).unwrap();
        fs::write(d.path().join("a").join("b").join("relazione.txt"), b"x").unwrap();
        fs::write(d.path().join("altro.txt"), b"x").unwrap();

        assert_eq!(names(d.path(), &criteria("relaz", false)), vec!["relazione.txt"]);
    }

    #[test]
    fn ignores_case_and_requires_all_words() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("Fattura Marzo.pdf"), b"x").unwrap();
        fs::write(d.path().join("Fattura Aprile.pdf"), b"x").unwrap();

        assert_eq!(names(d.path(), &criteria("fattura marzo", false)), vec!["Fattura Marzo.pdf"]);
    }

    #[test]
    fn supports_wildcards() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("foto1.jpg"), b"x").unwrap();
        fs::write(d.path().join("foto2.png"), b"x").unwrap();

        assert_eq!(names(d.path(), &criteria("*.jpg", false)), vec!["foto1.jpg"]);
        assert_eq!(names(d.path(), &criteria("foto?.*", false)).len(), 2);
    }

    #[test]
    fn searches_content_only_when_asked() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("note.txt"), b"la parola segreta e qui").unwrap();

        assert!(names(d.path(), &criteria("segreta", false)).is_empty());
        assert_eq!(names(d.path(), &criteria("SEGRETA", true)), vec!["note.txt"]);
    }

    #[test]
    fn content_match_carries_first_line_and_count() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("note.txt"), "intro\n    la Parola segreta\nancora parola\nfine").unwrap();
        let mut out = Vec::new();
        search(&d.path().to_string_lossy(), &criteria("parola", true), &AtomicBool::new(false), &mut |l| out.extend(l));
        let s = out[0].snippet.clone().unwrap();
        assert_eq!((s.line, s.text.as_str(), s.more), (2, "la Parola segreta", 1));
        assert_eq!((s.at, s.len), (3, 6));
    }

    #[test]
    fn name_match_has_no_snippet() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("parola.txt"), "parola").unwrap();
        let mut out = Vec::new();
        search(&d.path().to_string_lossy(), &criteria("parola", true), &AtomicBool::new(false), &mut |l| out.extend(l));
        assert!(out[0].snippet.is_none());
    }

    #[test]
    fn long_lines_are_cut_around_the_match() {
        let line = format!("{}ago{}", "x".repeat(300), "y".repeat(300));
        let s = snippet_of(&line, "ago").unwrap();
        assert!(s.text.starts_with('…') && s.text.ends_with('…'));
        let shown: String = s.text.chars().skip(s.at).take(s.len).collect();
        assert_eq!(shown, "ago");
        assert_eq!(s.text.chars().count(), SNIPPET_MAX + 2);
    }

    #[test]
    fn filters_alone_find_files_by_type_and_size() {
        let d = tempdir().unwrap();
        fs::create_dir_all(d.path().join("sub")).unwrap();
        fs::write(d.path().join("sub").join("big.MP4"), vec![0u8; 2000]).unwrap();
        fs::write(d.path().join("small.mp4"), b"x").unwrap();
        fs::write(d.path().join("big.txt"), vec![b'x'; 2000]).unwrap();
        let mut c = criteria("", false);
        c.extensions = Some(vec!["mp4".into()]);
        c.min_size = Some(1000);
        assert_eq!(names(d.path(), &c), vec!["big.MP4"]);
    }

    #[test]
    fn date_filter_keeps_recent_files() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("new.txt"), b"x").unwrap();
        let mut c = criteria("new", false);
        c.modified_after = Some(0);
        assert_eq!(names(d.path(), &c), vec!["new.txt"]);
        c.modified_after = None;
        c.modified_before = Some(1);
        assert!(names(d.path(), &c).is_empty());
    }

    #[test]
    fn does_not_search_binary_files() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("dati.bin"), b"\0\0segreta").unwrap();
        assert!(names(d.path(), &criteria("segreta", true)).is_empty());
    }

    #[test]
    fn stops_when_cancelled() {
        let d = tempdir().unwrap();
        fs::write(d.path().join("uno.txt"), b"x").unwrap();
        let mut n = 0;
        search(
            &d.path().to_string_lossy(),
            &criteria("uno", false),
            &AtomicBool::new(true),
            &mut |l| n += l.len(),
        );
        assert_eq!(n, 0);
    }
}
