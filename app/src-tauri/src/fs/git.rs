//! Git status of a folder's items, read with the `git` program the user
//! already has. Read-only: nothing here changes the repository.

use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum Mark {
    Ignored,
    New,
    Modified,
    Conflict,
}

#[derive(Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// Branch name, or a short commit id when detached.
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    /// Direct children of the folder (by name) that have a mark.
    pub items: HashMap<String, Mark>,
}

/// The status of `folder`'s items, or `None` outside a repository, without
/// git installed, or when git fails.
#[tauri::command]
pub async fn git_status(folder: String) -> Option<GitStatus> {
    tauri::async_runtime::spawn_blocking(move || status(Path::new(&folder)))
        .await
        .ok()
        .flatten()
}

fn status(folder: &Path) -> Option<GitStatus> {
    // Cheap check before starting a process: is there a .git above?
    folder.ancestors().find(|a| a.join(".git").exists())?;
    let prefix = git(folder, &["rev-parse", "--show-prefix"])?;
    let out = git(
        folder,
        &["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal", "--ignored=matching"],
    )?;
    Some(parse(&out, prefix.trim_end_matches(['\r', '\n'])))
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(dir).args(args).env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Parses `git status --porcelain=v2 --branch -z` run anywhere in the repo;
/// `prefix` is the folder's path from the repo root ("" or "src/lib/").
fn parse(out: &str, prefix: &str) -> GitStatus {
    let mut st = GitStatus::default();
    let mut oid = String::new();
    let mut records = out.split('\0');
    while let Some(rec) = records.next() {
        if let Some(h) = rec.strip_prefix("# branch.head ") {
            st.branch = h.to_string();
        } else if let Some(o) = rec.strip_prefix("# branch.oid ") {
            oid = o.chars().take(7).collect();
        } else if let Some(ab) = rec.strip_prefix("# branch.ab ") {
            for part in ab.split(' ') {
                if let Some(n) = part.strip_prefix('+') {
                    st.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    st.behind = n.parse().unwrap_or(0);
                }
            }
        } else if let Some(rest) = rec.strip_prefix("1 ") {
            let xy = rest.get(..2).unwrap_or("");
            let mark = if xy.starts_with('A') { Mark::New } else { Mark::Modified };
            mark_path(&mut st, prefix, nth_field(rest, 7), mark, false);
        } else if let Some(rest) = rec.strip_prefix("2 ") {
            mark_path(&mut st, prefix, nth_field(rest, 8), Mark::Modified, false);
            records.next(); // the original path of a rename
        } else if let Some(rest) = rec.strip_prefix("u ") {
            mark_path(&mut st, prefix, nth_field(rest, 9), Mark::Conflict, false);
        } else if let Some(p) = rec.strip_prefix("? ") {
            mark_path(&mut st, prefix, p, Mark::New, false);
        } else if let Some(p) = rec.strip_prefix("! ") {
            mark_path(&mut st, prefix, p, Mark::Ignored, true);
        }
    }
    if st.branch == "(detached)" {
        st.branch = oid;
    }
    st
}

/// The path is the last field and may contain spaces: skip `n` fields.
fn nth_field(rest: &str, n: usize) -> &str {
    rest.splitn(n + 1, ' ').nth(n).unwrap_or("")
}

/// Marks the folder's child that holds `path`. An ignored path only marks a
/// child it is exactly (an ignored file deep inside does not grey out its folder).
fn mark_path(st: &mut GitStatus, prefix: &str, path: &str, mark: Mark, exact: bool) {
    let Some(rel) = path.strip_prefix(prefix) else { return };
    let trimmed = rel.trim_end_matches('/');
    let Some(child) = trimmed.split('/').next().filter(|c| !c.is_empty()) else { return };
    if exact && child != trimmed {
        return;
    }
    let slot = st.items.entry(child.to_string()).or_insert(mark);
    // A folder shows its strongest mark: conflict > modified > new > ignored.
    if mark > *slot {
        *slot = mark;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = concat!(
        "# branch.oid 1c7b3bc0000000000000000000000000000000\0",
        "# branch.head main\0",
        "# branch.upstream origin/main\0",
        "# branch.ab +2 -1\0",
        "1 .M N... 100644 100644 100644 aaa bbb src/lib/a file.ts\0",
        "1 A. N... 000000 100644 100644 aaa bbb src/new.ts\0",
        "2 R. N... 100644 100644 100644 aaa bbb R100 src/moved.ts\0src/old.ts\0",
        "u UU N... 100644 100644 100644 100644 aaa bbb ccc src/clash.ts\0",
        "? src/untracked/\0",
        "! node_modules/\0",
        "! src/lib/cache.tmp\0",
        "1 .M N... 100644 100644 100644 aaa bbb README.md\0",
    );

    #[test]
    fn root_marks_children_and_reads_branch() {
        let st = parse(SAMPLE, "");
        assert_eq!(st.branch, "main");
        assert_eq!((st.ahead, st.behind), (2, 1));
        assert_eq!(st.items.get("src"), Some(&Mark::Conflict));
        assert_eq!(st.items.get("README.md"), Some(&Mark::Modified));
        assert_eq!(st.items.get("node_modules"), Some(&Mark::Ignored));
    }

    #[test]
    fn subfolder_sees_only_its_children() {
        let st = parse(SAMPLE, "src/");
        assert_eq!(st.items.get("lib"), Some(&Mark::Modified));
        assert_eq!(st.items.get("new.ts"), Some(&Mark::New));
        assert_eq!(st.items.get("moved.ts"), Some(&Mark::Modified));
        assert_eq!(st.items.get("old.ts"), None);
        assert_eq!(st.items.get("clash.ts"), Some(&Mark::Conflict));
        assert_eq!(st.items.get("untracked"), Some(&Mark::New));
        assert!(!st.items.contains_key("README.md"));

        let lib = parse(SAMPLE, "src/lib/");
        assert_eq!(lib.items.get("a file.ts"), Some(&Mark::Modified));
        assert_eq!(lib.items.get("cache.tmp"), Some(&Mark::Ignored));
    }

    #[test]
    fn detached_head_shows_short_commit() {
        let st = parse("# branch.oid 1c7b3bc999\0# branch.head (detached)\0", "");
        assert_eq!(st.branch, "1c7b3bc");
    }

    #[test]
    fn reads_this_repository_when_git_is_installed() {
        if Command::new("git").arg("--version").output().is_err() {
            return;
        }
        let st = status(Path::new(env!("CARGO_MANIFEST_DIR"))).expect("status of the project repo");
        assert!(!st.branch.is_empty());
    }

    #[test]
    fn outside_a_repo_is_none() {
        let dir = tempfile::tempdir().unwrap();
        // tempdir is not under any repo on a normal machine; if git is missing it is None anyway.
        if dir.path().ancestors().all(|a| !a.join(".git").exists()) {
            assert_eq!(status(dir.path()), None);
        }
    }
}
