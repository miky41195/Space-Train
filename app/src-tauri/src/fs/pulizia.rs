//! Disk cleanup: finds what takes space and can go, one category at a time.
//!
//! Nothing here deletes: the frontend shows what was found, the user picks,
//! and the deletion goes through `delete_items` like any other. What is
//! rebuilt by its program (caches, temp files, build folders) is deleted for
//! good there; what needs a look (models, old downloads) goes to the Trash.

use crate::fs::dimensione::{misura, ms};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// The scan in progress: closing the view starts a new one and the old
/// scans stop at their next check.
static GIRO: AtomicU64 = AtomicU64::new(0);

pub fn nuovo_giro(giro: u64) {
    GIRO.store(giro, Ordering::SeqCst);
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Trovato {
    pub path: String,
    pub size: u64,
    /// Last time it was used (newest change inside), in ms.
    pub used: u64,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Categoria {
    Temp,
    Cache,
    Progetti,
    Modelli,
    Download,
    Cestino,
}

const GIORNO_MS: u64 = 24 * 60 * 60 * 1000;

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
const DA_GUARDARE: &[&str] = &["exe", "msi", "msix", "zip", "7z", "rar", "iso", "tar", "gz"];
/// A download untouched for this long counts as old.
const VECCHIO_MS: u64 = 90 * GIORNO_MS;

/// What one category holds on `disco` (a drive root like `C:\`), biggest
/// first. `None` if a newer scan started meanwhile.
pub fn cerca(cat: Categoria, disco: &str, progetti: &[String], giro: u64) -> Option<Vec<Trovato>> {
    let fermo = || GIRO.load(Ordering::Relaxed) != giro;
    let casa = crate::fs::paths::casa().map(PathBuf::from);
    let adesso = ms(Ok(std::time::SystemTime::now()));

    let mut trovati = match cat {
        // The Trash is one for all drives, and is emptied whole.
        Categoria::Cestino => crate::fs::cestino::elenca()
            .unwrap_or_default()
            .into_iter()
            .map(|e| Trovato { path: e.path, size: e.size, used: e.modified.unwrap_or(0).max(0) as u64 })
            .collect(),
        Categoria::Download => vecchi_download(adesso),
        _ => {
            let candidati: Vec<PathBuf> = match cat {
                Categoria::Temp => figli(&std::env::temp_dir()),
                Categoria::Cache => casa.iter().flat_map(|c| CACHE.iter().map(move |r| c.join(r))).collect(),
                Categoria::Modelli => casa.as_deref().map(modelli).unwrap_or_default(),
                _ => {
                    let mut tutti = Vec::new();
                    for radice in progetti {
                        tutti.extend(trova_progetti(Path::new(radice), &fermo));
                    }
                    tutti
                }
            };
            let mut visti = HashSet::new();
            let mut out = Vec::new();
            for p in candidati {
                if !visti.insert(p.clone()) || !sul_disco(&p, disco) {
                    continue;
                }
                let Some(t) = pesa(&p, &fermo)? else {
                    continue;
                };
                // A temp file from the last day may belong to an install
                // still running: it stays.
                if cat == Categoria::Temp && t.used + GIORNO_MS > adesso {
                    continue;
                }
                out.push(t);
            }
            out
        }
    };
    if fermo() {
        return None;
    }
    trovati.retain(|t| t.size > 0 && (cat == Categoria::Cestino || sul_disco(Path::new(&t.path), disco)));
    trovati.sort_by(|a, b| b.size.cmp(&a.size));
    Some(trovati)
}

/// Size and last use of a file or folder. Outer `None` = stopped,
/// inner `None` = it does not exist.
fn pesa(p: &Path, fermo: &dyn Fn() -> bool) -> Option<Option<Trovato>> {
    let Ok(md) = std::fs::symlink_metadata(p) else {
        return Some(None);
    };
    let path = p.to_string_lossy().into_owned();
    if md.is_file() {
        return Some(Some(Trovato { path, size: md.len(), used: ms(md.modified()) }));
    }
    if !md.is_dir() {
        return Some(None);
    }
    let m = misura(p, fermo)?;
    Some(Some(Trovato { path, size: m.bytes, used: m.recente }))
}

fn sul_disco(p: &Path, disco: &str) -> bool {
    let p = p.to_string_lossy().to_lowercase();
    p.starts_with(&disco.to_lowercase())
}

fn figli(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map(|v| v.flatten().map(|e| e.path()).collect())
        .unwrap_or_default()
}

/// Downloaded AI models: Hugging Face per model, Ollama and LM Studio whole.
fn modelli(casa: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = figli(&casa.join(".cache").join("huggingface").join("hub"))
        .into_iter()
        .filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().contains("--")))
        .collect();
    out.push(casa.join(".ollama").join("models"));
    out.push(casa.join(".lmstudio").join("models"));
    out
}

fn vecchi_download(adesso: u64) -> Vec<Trovato> {
    let Some(cartella) = crate::shell::known::list_known_folders().into_iter().find(|k| k.icon == "downloads") else {
        return Vec::new();
    };
    figli(Path::new(&cartella.path))
        .into_iter()
        .filter_map(|p| {
            let est = p.extension()?.to_string_lossy().to_lowercase();
            if !DA_GUARDARE.contains(&est.as_str()) {
                return None;
            }
            let md = std::fs::metadata(&p).ok().filter(|m| m.is_file())?;
            let used = ms(md.modified()).max(ms(md.accessed()));
            (used + VECCHIO_MS < adesso).then(|| Trovato { path: p.to_string_lossy().into_owned(), size: md.len(), used })
        })
        .collect()
}

/// Whether the folder `nome` is a build output of the project whose files
/// are `fratelli` (lowercase names next to it).
fn e_compilazione(nome: &str, fratelli: &HashSet<String>) -> bool {
    let c = |f: &str| fratelli.contains(f);
    match nome {
        "node_modules" | ".svelte-kit" | ".next" | ".nuxt" => c("package.json"),
        "target" => c("cargo.toml"),
        "bin" | "obj" => fratelli.iter().any(|f| f.ends_with("proj")),
        "build" | ".gradle" => c("build.gradle") || c("build.gradle.kts"),
        _ => false,
    }
}

/// How deep below a chosen folder projects are looked for.
const PROFONDITA: usize = 8;

/// Build folders of the projects under `radice`. Does not enter them, nor
/// hidden folders, nor a `node_modules` that is not a build output.
fn trova_progetti(radice: &Path, fermo: &dyn Fn() -> bool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut da_leggere = vec![(radice.to_path_buf(), 0)];
    while let Some((dir, prof)) = da_leggere.pop() {
        if fermo() {
            break;
        }
        let Ok(voci) = std::fs::read_dir(&dir) else {
            continue;
        };
        let voci: Vec<_> = voci.flatten().collect();
        let nomi: HashSet<String> = voci.iter().map(|v| v.file_name().to_string_lossy().to_lowercase()).collect();
        for v in voci {
            if !v.file_type().is_ok_and(|t| t.is_dir()) {
                continue;
            }
            let nome = v.file_name().to_string_lossy().to_lowercase();
            if e_compilazione(&nome, &nomi) {
                out.push(v.path());
            } else if !nome.starts_with('.') && nome != "node_modules" && prof < PROFONDITA {
                da_leggere.push((v.path(), prof + 1));
            }
        }
    }
    out
}

#[cfg(test)]
mod test {
    use super::*;
    use std::fs;

    fn nomi(n: &[&str]) -> HashSet<String> {
        n.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_build_folder_needs_its_project_next_to_it() {
        assert!(e_compilazione("node_modules", &nomi(&["package.json"])));
        assert!(!e_compilazione("node_modules", &nomi(&["readme.md"])));
        assert!(e_compilazione("target", &nomi(&["cargo.toml"])));
        assert!(!e_compilazione("target", &nomi(&["package.json"])));
        assert!(e_compilazione("obj", &nomi(&["gioco.csproj"])));
        assert!(!e_compilazione("bin", &nomi(&[])));
        assert!(e_compilazione("build", &nomi(&["build.gradle.kts"])));
        assert!(!e_compilazione("documenti", &nomi(&["package.json"])));
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

        let mut trovati = trova_progetti(d.path(), &|| false);
        trovati.sort();
        assert_eq!(trovati, vec![rust.join("target"), web.join("node_modules")]);
    }
}

/// Manual look at the real disk: `cargo test --lib real_disk -- --ignored --nocapture`.
#[cfg(test)]
#[test]
#[ignore]
fn real_disk() {
    let casa = crate::fs::paths::casa().unwrap();
    let progetti = [format!(r"{}\Desktop\Progetti", casa)];
    for cat in [Categoria::Temp, Categoria::Cache, Categoria::Progetti, Categoria::Modelli, Categoria::Download, Categoria::Cestino] {
        let t = std::time::Instant::now();
        let v = cerca(cat, "C:\\", &progetti, 0).unwrap();
        let tot: u64 = v.iter().map(|x| x.size).sum();
        println!("{:?}: {} items, {} MB, {:?}", cat, v.len(), tot / 1_000_000, t.elapsed());
        for x in v.iter().take(5) {
            println!("    {} {} MB", x.path, x.size / 1_000_000);
        }
    }
    let t = std::time::Instant::now();
    for p in crate::shell::programmi::elenca("C:\\", 12) {
        println!("  {} — {} MB", p.name, p.size / 1_000_000);
    }
    println!("programs {:?}", t.elapsed());
}
