//! Disk cleanup: finds what takes space and can go, one category at a time.
//!
//! Nothing here deletes: the frontend shows what was found, the user picks,
//! and the deletion goes through `delete_items` like any other. What is
//! rebuilt by its program (caches, temp files, build folders) is deleted for
//! good there; what needs a look (models, old downloads) goes to the Trash.

use crate::fs::dir_size::{measure, ms};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// The scan in progress: closing the view starts a new one and the old
/// scans stop at their next check.
static ROUND: AtomicU64 = AtomicU64::new(0);

pub fn new_round(round: u64) {
    ROUND.store(round, Ordering::SeqCst);
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub path: String,
    pub size: u64,
    /// Last time it was used (newest change inside), in ms.
    pub used: u64,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    Temp,
    Cache,
    Projects,
    Models,
    Download,
    Trash,
}

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

/// Program caches, relative to the home folder. Each one is rebuilt or
/// downloaded again by its program when needed. Browser caches stay out:
/// a browser is nearly always open and holds them.
#[cfg(windows)]
const CACHE: &[&str] = &[
    r"AppData\Local\npm-cache",
    r"AppData\Local\pip\Cache",
    r"AppData\Local\Yarn\Cache",
    r".cargo\registry\cache",
    r".cargo\registry\src",
    r".nuget\packages",
    r".gradle\caches",
    r"AppData\Roaming\Code\Cache",
    r"AppData\Roaming\Code\CachedData",
    r"AppData\Roaming\Code\CachedExtensionVSIXs",
    r"AppData\Local\D3DSCache",
    r"AppData\Local\NVIDIA\DXCache",
    r"AppData\Local\NVIDIA\GLCache",
    r"AppData\Local\ms-playwright",
    r".cache\puppeteer",
];
#[cfg(not(windows))]
const CACHE: &[&str] = &[
    ".cache/pip",
    ".npm/_cacache",
    ".cache/yarn",
    ".cargo/registry/cache",
    ".cargo/registry/src",
    ".gradle/caches",
    ".config/Code/Cache",
    ".config/Code/CachedData",
    ".cache/ms-playwright",
    ".cache/puppeteer",
    ".cache/thumbnails",
];

/// Downloaded files worth a look once old: installers, archives, disk images.
const TO_INSPECT: &[&str] = &["exe", "msi", "msix", "zip", "7z", "rar", "iso", "tar", "gz"];
/// A download untouched for this long counts as old.
const OLD_MS: u64 = 90 * DAY_MS;

/// What one category holds on `drive` (a drive root like `C:\`), biggest
/// first. `None` if a newer scan started meanwhile.
pub fn scan(cat: Category, drive: &str, projects: &[String], round: u64) -> Option<Vec<Candidate>> {
    let stopped = || ROUND.load(Ordering::Relaxed) != round;
    let home = crate::fs::paths::home().map(PathBuf::from);
    let now = ms(Ok(std::time::SystemTime::now()));

    let mut found = match cat {
        // The Trash is one for all drives, and is emptied whole.
        Category::Trash => crate::fs::trash::list()
            .unwrap_or_default()
            .into_iter()
            .map(|e| Candidate { path: e.path, size: e.size, used: e.modified.unwrap_or(0).max(0) as u64 })
            .collect(),
        Category::Download => old_downloads(now),
        _ => {
            let candidates: Vec<PathBuf> = match cat {
                Category::Temp => children(&std::env::temp_dir()),
                Category::Cache => home.iter().flat_map(|c| CACHE.iter().map(move |r| c.join(r))).collect(),
                Category::Models => home.as_deref().map(models).unwrap_or_default(),
                _ => {
                    let mut all = Vec::new();
                    for root in projects {
                        all.extend(find_projects(Path::new(root), &stopped));
                    }
                    all
                }
            };
            let mut seen = HashSet::new();
            let mut out = Vec::new();
            for p in candidates {
                if !seen.insert(p.clone()) || !on_drive(&p, drive) {
                    continue;
                }
                let Some(t) = weigh(&p, &stopped)? else {
                    continue;
                };
                // A temp file from the last day may belong to an install
                // still running: it stays.
                if cat == Category::Temp && t.used + DAY_MS > now {
                    continue;
                }
                out.push(t);
            }
            out
        }
    };
    if stopped() {
        return None;
    }
    found.retain(|t| t.size > 0 && (cat == Category::Trash || on_drive(Path::new(&t.path), drive)));
    found.sort_by(|a, b| b.size.cmp(&a.size));
    Some(found)
}

/// Size and last use of a file or folder. Outer `None` = stopped,
/// inner `None` = it does not exist.
fn weigh(p: &Path, stopped: &dyn Fn() -> bool) -> Option<Option<Candidate>> {
    let Ok(md) = std::fs::symlink_metadata(p) else {
        return Some(None);
    };
    let path = p.to_string_lossy().into_owned();
    if md.is_file() {
        return Some(Some(Candidate { path, size: md.len(), used: ms(md.modified()) }));
    }
    if !md.is_dir() {
        return Some(None);
    }
    let m = measure(p, stopped)?;
    Some(Some(Candidate { path, size: m.bytes, used: m.recent }))
}

fn on_drive(p: &Path, drive: &str) -> bool {
    let p = p.to_string_lossy().to_lowercase();
    p.starts_with(&drive.to_lowercase())
}

fn children(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map(|v| v.flatten().map(|e| e.path()).collect())
        .unwrap_or_default()
}

/// Downloaded AI models: Hugging Face per model, Ollama and LM Studio whole.
fn models(home: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = children(&home.join(".cache").join("huggingface").join("hub"))
        .into_iter()
        .filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().contains("--")))
        .collect();
    out.push(home.join(".ollama").join("models"));
    out.push(home.join(".lmstudio").join("models"));
    out
}

fn old_downloads(now: u64) -> Vec<Candidate> {
    let Some(folder) = crate::shell::known::list_known_folders().into_iter().find(|k| k.icon == "downloads") else {
        return Vec::new();
    };
    children(Path::new(&folder.path))
        .into_iter()
        .filter_map(|p| {
            let ext = p.extension()?.to_string_lossy().to_lowercase();
            if !TO_INSPECT.contains(&ext.as_str()) {
                return None;
            }
            let md = std::fs::metadata(&p).ok().filter(|m| m.is_file())?;
            let used = ms(md.modified()).max(ms(md.accessed()));
            (used + OLD_MS < now).then(|| Candidate { path: p.to_string_lossy().into_owned(), size: md.len(), used })
        })
        .collect()
}

/// Whether the folder `name` is a build output of the project whose files
/// are `siblings` (lowercase names next to it).
fn is_build_output(name: &str, siblings: &HashSet<String>) -> bool {
    let c = |f: &str| siblings.contains(f);
    match name {
        "node_modules" | ".svelte-kit" | ".next" | ".nuxt" => c("package.json"),
        "target" => c("cargo.toml"),
        "bin" | "obj" => siblings.iter().any(|f| f.ends_with("proj")),
        "build" | ".gradle" => c("build.gradle") || c("build.gradle.kts"),
        _ => false,
    }
}

/// How deep below a chosen folder projects are looked for.
const DEPTH: usize = 8;

/// Build folders of the projects under `root`. Does not enter them, nor
/// hidden folders, nor a `node_modules` that is not a build output.
fn find_projects(root: &Path, stopped: &dyn Fn() -> bool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut to_read = vec![(root.to_path_buf(), 0)];
    while let Some((dir, depth)) = to_read.pop() {
        if stopped() {
            break;
        }
        let Ok(items) = std::fs::read_dir(&dir) else {
            continue;
        };
        let items: Vec<_> = items.flatten().collect();
        let names: HashSet<String> = items.iter().map(|v| v.file_name().to_string_lossy().to_lowercase()).collect();
        for v in items {
            if !v.file_type().is_ok_and(|t| t.is_dir()) {
                continue;
            }
            let name = v.file_name().to_string_lossy().to_lowercase();
            if is_build_output(&name, &names) {
                out.push(v.path());
            } else if !name.starts_with('.') && name != "node_modules" && depth < DEPTH {
                to_read.push((v.path(), depth + 1));
            }
        }
    }
    out
}

#[cfg(test)]
mod test {
    use super::*;
    use std::fs;

    fn names(n: &[&str]) -> HashSet<String> {
        n.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_build_folder_needs_its_project_next_to_it() {
        assert!(is_build_output("node_modules", &names(&["package.json"])));
        assert!(!is_build_output("node_modules", &names(&["readme.md"])));
        assert!(is_build_output("target", &names(&["cargo.toml"])));
        assert!(!is_build_output("target", &names(&["package.json"])));
        assert!(is_build_output("obj", &names(&["gioco.csproj"])));
        assert!(!is_build_output("bin", &names(&[])));
        assert!(is_build_output("build", &names(&["build.gradle.kts"])));
        assert!(!is_build_output("documenti", &names(&["package.json"])));
    }

    #[test]
    fn finds_build_folders_without_entering_them() {
        let d = tempfile::tempdir().unwrap();
        let web = d.path().join("lavori").join("sito");
        fs::create_dir_all(web.join("node_modules").join("pkg").join("node_modules")).unwrap();
        fs::write(web.join("package.json"), "{}").unwrap();
        fs::write(web.join("node_modules").join("pkg").join("package.json"), "{}").unwrap();
        let rust = d.path().join("app");
        fs::create_dir_all(rust.join("target").join("debug")).unwrap();
        fs::write(rust.join("Cargo.toml"), "").unwrap();
        // A `target` without Cargo.toml is somebody's folder, not a build.
        fs::create_dir_all(d.path().join("foto").join("target")).unwrap();

        let mut found = find_projects(d.path(), &|| false);
        found.sort();
        assert_eq!(found, vec![rust.join("target"), web.join("node_modules")]);
    }
}

/// Manual look at the real disk: `cargo test --lib real_disk -- --ignored --nocapture`.
#[cfg(test)]
#[test]
#[ignore]
fn real_disk() {
    let home = crate::fs::paths::home().unwrap();
    let projects = [format!(r"{}\Desktop\Progetti", home)];
    for cat in [Category::Temp, Category::Cache, Category::Projects, Category::Models, Category::Download, Category::Trash] {
        let t = std::time::Instant::now();
        let v = scan(cat, "C:\\", &projects, 0).unwrap();
        let total_size: u64 = v.iter().map(|x| x.size).sum();
        println!("{:?}: {} items, {} MB, {:?}", cat, v.len(), total_size / 1_000_000, t.elapsed());
        for x in v.iter().take(5) {
            println!("    {} {} MB", x.path, x.size / 1_000_000);
        }
    }
    let t = std::time::Instant::now();
    for p in crate::shell::programs::list("C:\\", 12) {
        println!("  {} — {} MB", p.name, p.size / 1_000_000);
    }
    println!("programs {:?}", t.elapsed());
}
