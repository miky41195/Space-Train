//! Vault: a folder `<name>.cassaforte` whose files are encrypted with a
//! password. Names, sizes and dates are encrypted too: from outside it is
//! a header, an encrypted index and blobs with random names.
//!
//! - `cassaforte.json`: format, Argon2id parameters and salt, and the vault
//!   key wrapped (XChaCha20-Poly1305) with the key derived from the password.
//! - `indice`: the list of items, encrypted with the vault key.
//! - `dati/<id>`: one blob per file, encrypted in 64 KiB chunks (STREAM),
//!   bound to its id so blobs cannot be swapped.
//!
//! Forgetting the password loses the files: there is no recovery key.

use crate::fs::archive_formats::ArchiveItem;
use crate::fs::error::FsError;
use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::stream::{DecryptorBE32, EncryptorBE32};
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use chacha20poly1305::aead::rand_core::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use zeroize::Zeroizing;

pub const EXT: &str = "cassaforte";
const HEADER: &str = "cassaforte.json";
const INDEX: &str = "indice";
const BLOBS: &str = "dati";
const FORMAT: u32 = 1;
const CHUNK: usize = 64 * 1024;
const TAG: usize = 16;
const AAD_KEY: &[u8] = b"space-train vault key v1";
const AAD_INDEX: &[u8] = b"space-train vault index v1";

#[derive(Serialize, Deserialize)]
struct Header {
    format: u32,
    /// Argon2id memory in KiB, iterations, lanes.
    m_kib: u32,
    t: u32,
    p: u32,
    salt: String,
    key_nonce: String,
    wrapped_key: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Index {
    items: Vec<Item>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Item {
    /// Inner path with `/`, no leading separator.
    path: String,
    dir: bool,
    size: u64,
    modified: Option<i64>,
    /// Blob id for files.
    blob: Option<String>,
}

struct Open {
    key: Zeroizing<[u8; 32]>,
    index: Index,
}

/// Unlocked vaults, by lowercase folder path. Keys live only here, in memory.
#[derive(Default)]
pub struct Vaults(Mutex<HashMap<String, Arc<Mutex<Open>>>>);

fn io(e: impl std::fmt::Display) -> FsError {
    FsError::Io { message: e.to_string() }
}

fn msg(m: &str) -> FsError {
    FsError::Io { message: m.to_string() }
}

fn key_of(path: &Path) -> String {
    path.to_string_lossy().trim_end_matches(['\\', '/']).to_lowercase()
}

fn random<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    OsRng.fill_bytes(&mut b);
    b
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn unhex(s: &str) -> Result<Vec<u8>, FsError> {
    if s.len() % 2 != 0 {
        return Err(msg("Cassaforte danneggiata."));
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| msg("Cassaforte danneggiata.")))
        .collect()
}

fn derive(password: &str, salt: &[u8], m_kib: u32, t: u32, p: u32) -> Result<Zeroizing<[u8; 32]>, FsError> {
    let params = Params::new(m_kib, t, p, Some(32)).map_err(io)?;
    let mut out = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, out.as_mut())
        .map_err(io)?;
    Ok(out)
}

fn seal(key: &[u8; 32], plain: &[u8], aad: &[u8]) -> Result<Vec<u8>, FsError> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ct = cipher.encrypt(&nonce, Payload { msg: plain, aad }).map_err(|_| msg("Cifratura non riuscita."))?;
    Ok([nonce.as_slice(), &ct].concat())
}

fn open_sealed(key: &[u8; 32], data: &[u8], aad: &[u8]) -> Option<Zeroizing<Vec<u8>>> {
    if data.len() < 24 + TAG {
        return None;
    }
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    cipher
        .decrypt(XNonce::from_slice(&data[..24]), Payload { msg: &data[24..], aad })
        .ok()
        .map(Zeroizing::new)
}

/// Writes next to the target and renames over it: a crash never leaves half a file.
fn write_atomic(path: &Path, data: &[u8]) -> Result<(), FsError> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data).map_err(|e| crate::fs::error::from_io(&e))?;
    fs::rename(&tmp, path).map_err(|e| crate::fs::error::from_io(&e))
}

fn save_index(dir: &Path, open: &Open) -> Result<(), FsError> {
    let json = Zeroizing::new(serde_json::to_vec(&open.index).map_err(io)?);
    write_atomic(&dir.join(INDEX), &seal(&open.key, &json, AAD_INDEX)?)
}

/// Encrypts `src` into `dst` in chunks; the blob id is the associated data.
fn encrypt_file(key: &[u8; 32], blob_id: &str, src: &Path, dst: &Path) -> Result<(), FsError> {
    let mut input = BufReader::new(File::open(src).map_err(|e| crate::fs::error::from_io(&e))?);
    let mut out = BufWriter::new(File::create(dst).map_err(|e| crate::fs::error::from_io(&e))?);
    let prefix: [u8; 19] = random();
    out.write_all(&prefix).map_err(io)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let mut enc = EncryptorBE32::from_aead(cipher, prefix.as_slice().into());
    let mut buf = Zeroizing::new(vec![0u8; CHUNK]);
    let mut n = read_full(&mut input, &mut buf)?;
    loop {
        let mut next = Zeroizing::new(vec![0u8; CHUNK]);
        let m = if n == CHUNK { read_full(&mut input, &mut next)? } else { 0 };
        let payload = Payload { msg: &buf[..n], aad: blob_id.as_bytes() };
        if m == 0 {
            let ct = enc.encrypt_last(payload).map_err(|_| msg("Cifratura non riuscita."))?;
            out.write_all(&ct).map_err(io)?;
            break;
        }
        let ct = enc.encrypt_next(payload).map_err(|_| msg("Cifratura non riuscita."))?;
        out.write_all(&ct).map_err(io)?;
        buf = next;
        n = m;
    }
    out.flush().map_err(io)
}

fn decrypt_file(key: &[u8; 32], blob_id: &str, src: &Path, dst: &Path) -> Result<(), FsError> {
    let damaged = || msg("Un file della cassaforte è danneggiato o è stato modificato.");
    let mut input = BufReader::new(File::open(src).map_err(|e| crate::fs::error::from_io(&e))?);
    let mut prefix = [0u8; 19];
    input.read_exact(&mut prefix).map_err(|_| damaged())?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let mut dec = DecryptorBE32::from_aead(cipher, prefix.as_slice().into());
    let tmp = dst.with_extension("parziale");
    let result = (|| {
        let mut out = BufWriter::new(File::create(&tmp).map_err(|e| crate::fs::error::from_io(&e))?);
        let mut buf = vec![0u8; CHUNK + TAG];
        let mut n = read_full(&mut input, &mut buf)?;
        loop {
            let mut next = vec![0u8; CHUNK + TAG];
            let m = if n == CHUNK + TAG { read_full(&mut input, &mut next)? } else { 0 };
            let payload = Payload { msg: &buf[..n], aad: blob_id.as_bytes() };
            if m == 0 {
                let pt = Zeroizing::new(dec.decrypt_last(payload).map_err(|_| damaged())?);
                out.write_all(&pt).map_err(io)?;
                break;
            }
            let pt = Zeroizing::new(dec.decrypt_next(payload).map_err(|_| damaged())?);
            out.write_all(&pt).map_err(io)?;
            buf = next;
            n = m;
        }
        out.flush().map_err(io)
    })();
    match result {
        Ok(()) => fs::rename(&tmp, dst).map_err(|e| crate::fs::error::from_io(&e)),
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            Err(e)
        }
    }
}

fn read_full(r: &mut impl Read, buf: &mut [u8]) -> Result<usize, FsError> {
    let mut n = 0;
    while n < buf.len() {
        match r.read(&mut buf[n..]) {
            Ok(0) => break,
            Ok(k) => n += k,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => return Err(crate::fs::error::from_io(&e)),
        }
    }
    Ok(n)
}

/// One path component that is safe to create on disk.
fn safe_component(c: &str) -> bool {
    !c.is_empty() && c != "." && c != ".." && crate::fs::names::validate_name(c).is_ok()
}

fn millis(t: std::io::Result<std::time::SystemTime>) -> Option<i64> {
    t.ok()?.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_millis() as i64)
}

/// A name free in `taken`, numbered like Windows: `nota (2).txt`.
fn free_name(taken: impl Fn(&str) -> bool, name: &str) -> String {
    if !taken(name) {
        return name.to_string();
    }
    let (base, ext) = match name.rfind('.').filter(|i| *i > 0) {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    (2..)
        .map(|n| format!("{base} ({n}){ext}"))
        .find(|c| !taken(c))
        .unwrap()
}

fn join_inner(dir: &str, name: &str) -> String {
    if dir.is_empty() { name.to_string() } else { format!("{dir}/{name}") }
}

impl Vaults {
    fn get(&self, path: &Path) -> Result<Arc<Mutex<Open>>, FsError> {
        self.0
            .lock()
            .unwrap()
            .get(&key_of(path))
            .cloned()
            .ok_or_else(|| msg("La cassaforte è chiusa: aprila di nuovo con la password."))
    }

    pub fn is_open(&self, path: &Path) -> bool {
        self.0.lock().unwrap().contains_key(&key_of(path))
    }

    /// Creates `<parent>/<name>.cassaforte` and leaves it open.
    pub fn create(&self, parent: &Path, name: &str, password: &str) -> Result<PathBuf, FsError> {
        let name = name.trim();
        let file_name = format!("{name}.{EXT}");
        if !safe_component(&file_name) {
            return Err(msg("Questo nome non si può usare."));
        }
        if password.chars().count() < 8 {
            return Err(msg("La password deve avere almeno 8 caratteri."));
        }
        let dir = parent.join(&file_name);
        if dir.exists() {
            return Err(msg("Esiste già un elemento con questo nome."));
        }
        fs::create_dir_all(dir.join(BLOBS)).map_err(|e| crate::fs::error::from_io(&e))?;
        let built = (|| {
            let (m_kib, t, p) = kdf_params();
            let salt: [u8; 16] = random();
            let kek = derive(password, &salt, m_kib, t, p)?;
            let key = Zeroizing::new(random::<32>());
            let wrapped = seal(&kek, key.as_ref(), AAD_KEY)?;
            let header = Header {
                format: FORMAT,
                m_kib,
                t,
                p,
                salt: hex(&salt),
                key_nonce: hex(&wrapped[..24]),
                wrapped_key: hex(&wrapped[24..]),
            };
            write_atomic(&dir.join(HEADER), &serde_json::to_vec_pretty(&header).map_err(io)?)?;
            let open = Open { key, index: Index::default() };
            save_index(&dir, &open)?;
            self.0.lock().unwrap().insert(key_of(&dir), Arc::new(Mutex::new(open)));
            Ok(())
        })();
        if let Err(e) = built {
            let _ = fs::remove_dir_all(&dir);
            return Err(e);
        }
        Ok(dir)
    }

    pub fn unlock(&self, dir: &Path, password: &str) -> Result<(), FsError> {
        let raw = fs::read(dir.join(HEADER)).map_err(|_| msg("Questa cartella non è una cassaforte."))?;
        let h: Header = serde_json::from_slice(&raw).map_err(|_| msg("Cassaforte danneggiata."))?;
        if h.format != FORMAT {
            return Err(msg("Cassaforte creata da una versione più nuova di Space Train."));
        }
        // Parameters come from the file: refuse values that would hang or exhaust memory.
        if !(8 * 1024..=1024 * 1024).contains(&h.m_kib) || !(1..=10).contains(&h.t) || !(1..=8).contains(&h.p) {
            return Err(msg("Cassaforte danneggiata."));
        }
        let kek = derive(password, &unhex(&h.salt)?, h.m_kib, h.t, h.p)?;
        let wrapped = [unhex(&h.key_nonce)?, unhex(&h.wrapped_key)?].concat();
        let plain = open_sealed(&kek, &wrapped, AAD_KEY).ok_or_else(|| msg("Password sbagliata."))?;
        if plain.len() != 32 {
            return Err(msg("Cassaforte danneggiata."));
        }
        let mut key = Zeroizing::new([0u8; 32]);
        key.copy_from_slice(&plain);
        let data = fs::read(dir.join(INDEX)).map_err(|e| crate::fs::error::from_io(&e))?;
        let json = open_sealed(&key, &data, AAD_INDEX).ok_or_else(|| msg("L'indice della cassaforte è danneggiato."))?;
        let index: Index = serde_json::from_slice(&json).map_err(|_| msg("L'indice della cassaforte è danneggiato."))?;
        self.0.lock().unwrap().insert(key_of(dir), Arc::new(Mutex::new(Open { key, index })));
        Ok(())
    }

    /// Forgets the key and removes the files opened from the vault.
    pub fn lock(&self, dir: &Path) {
        self.0.lock().unwrap().remove(&key_of(dir));
        let _ = fs::remove_dir_all(temp_dir_for(dir));
    }

    pub fn lock_all(&self) {
        let keys: Vec<String> = self.0.lock().unwrap().drain().map(|(k, _)| k).collect();
        for k in keys {
            let _ = fs::remove_dir_all(temp_dir_for(Path::new(&k)));
        }
    }

    pub fn list(&self, dir: &Path) -> Result<Vec<ArchiveItem>, FsError> {
        let open = self.get(dir)?;
        let open = open.lock().unwrap();
        Ok(open
            .index
            .items
            .iter()
            .map(|i| ArchiveItem { path: i.path.clone(), size: i.size, dir: i.dir, modified: i.modified })
            .collect())
    }

    /// Encrypts files and folders into the vault, under `inner` ('' = root).
    /// Originals are left where they are.
    pub fn add(&self, dir: &Path, sources: &[String], inner: &str) -> Result<usize, FsError> {
        let open = self.get(dir)?;
        let mut open = open.lock().unwrap();
        let mut added = 0;
        let result = (|| {
            for s in sources {
                let src = Path::new(s);
                let name = src.file_name().map(|n| n.to_string_lossy().into_owned()).ok_or_else(|| msg("Percorso non valido."))?;
                // The vault itself (or a folder holding it) cannot go inside the vault.
                if dir.starts_with(src) {
                    return Err(msg("La cassaforte non può contenere sé stessa."));
                }
                let free = {
                    let items = &open.index.items;
                    free_name(|c| items.iter().any(|i| i.path.eq_ignore_ascii_case(&join_inner(inner, c))), &name)
                };
                added += self.add_one(dir, &mut open, src, &join_inner(inner, &free))?;
            }
            Ok(())
        })();
        // Whatever made it in is recorded, even when a later file failed.
        save_index(dir, &open)?;
        result.map(|_| added)
    }

    fn add_one(&self, dir: &Path, open: &mut Open, src: &Path, inner: &str) -> Result<usize, FsError> {
        let meta = fs::metadata(src).map_err(|e| crate::fs::error::from_io(&e))?;
        if meta.is_dir() {
            open.index.items.push(Item { path: inner.to_string(), dir: true, size: 0, modified: millis(meta.modified()), blob: None });
            let mut n = 0;
            for e in fs::read_dir(src).map_err(|e| crate::fs::error::from_io(&e))? {
                let e = e.map_err(|e| crate::fs::error::from_io(&e))?;
                n += self.add_one(dir, open, &e.path(), &join_inner(inner, &e.file_name().to_string_lossy()))?;
            }
            return Ok(n);
        }
        let blob = hex(&random::<16>());
        let dst = dir.join(BLOBS).join(&blob);
        if let Err(e) = encrypt_file(&open.key, &blob, src, &dst) {
            let _ = fs::remove_file(&dst);
            return Err(e);
        }
        open.index.items.push(Item { path: inner.to_string(), dir: false, size: meta.len(), modified: millis(meta.modified()), blob: Some(blob) });
        Ok(1)
    }

    /// Decrypts items (folders with what they hold) into `dest`; a taken name gets a number.
    pub fn extract(&self, dir: &Path, items: &[String], dest: &Path) -> Result<Vec<String>, FsError> {
        let open = self.get(dir)?;
        let open = open.lock().unwrap();
        let mut out = Vec::new();
        for wanted in items {
            let top = open.index.items.iter().find(|i| &i.path == wanted).ok_or(FsError::NotFound)?;
            let base = wanted.rsplit('/').next().unwrap_or(wanted);
            if !safe_component(base) {
                return Err(msg("Nome non valido nella cassaforte."));
            }
            let root = dest.join(crate::fs::copy::unique_name(dest, base));
            out.push(root.to_string_lossy().into_owned());
            if !top.dir {
                decrypt_file(&open.key, top.blob.as_deref().unwrap_or(""), &dir.join(BLOBS).join(top.blob.as_deref().unwrap_or("")), &root)?;
                continue;
            }
            fs::create_dir_all(&root).map_err(|e| crate::fs::error::from_io(&e))?;
            let prefix = format!("{wanted}/");
            for i in open.index.items.iter().filter(|i| i.path.starts_with(&prefix)) {
                let rel = &i.path[prefix.len()..];
                if !rel.split('/').all(safe_component) {
                    return Err(msg("Nome non valido nella cassaforte."));
                }
                let target = rel.split('/').fold(root.clone(), |p, c| p.join(c));
                if i.dir {
                    fs::create_dir_all(&target).map_err(|e| crate::fs::error::from_io(&e))?;
                } else if let Some(blob) = &i.blob {
                    if let Some(parent) = target.parent() {
                        fs::create_dir_all(parent).map_err(|e| crate::fs::error::from_io(&e))?;
                    }
                    decrypt_file(&open.key, blob, &dir.join(BLOBS).join(blob), &target)?;
                }
            }
        }
        Ok(out)
    }

    /// Decrypts one file into a private temporary folder, to open it.
    pub fn open_item(&self, dir: &Path, item: &str) -> Result<String, FsError> {
        let tmp = temp_dir_for(dir);
        fs::create_dir_all(&tmp).map_err(|e| crate::fs::error::from_io(&e))?;
        let open = self.get(dir)?;
        let open = open.lock().unwrap();
        let i = open.index.items.iter().find(|i| i.path == item && !i.dir).ok_or(FsError::NotFound)?;
        let blob = i.blob.as_deref().unwrap_or("");
        let name = item.rsplit('/').next().unwrap_or(item);
        if !safe_component(name) {
            return Err(msg("Nome non valido nella cassaforte."));
        }
        let target = tmp.join(hex(&random::<4>())).join(name);
        fs::create_dir_all(target.parent().unwrap()).map_err(|e| crate::fs::error::from_io(&e))?;
        decrypt_file(&open.key, blob, &dir.join(BLOBS).join(blob), &target)?;
        Ok(target.to_string_lossy().into_owned())
    }

    /// Removes items (and what folders hold) from the vault, for good.
    pub fn delete(&self, dir: &Path, items: &[String]) -> Result<(), FsError> {
        let open = self.get(dir)?;
        let mut open = open.lock().unwrap();
        let gone = |p: &str| items.iter().any(|w| p == w || p.starts_with(&format!("{w}/")));
        let blobs: Vec<String> = open.index.items.iter().filter(|i| gone(&i.path)).filter_map(|i| i.blob.clone()).collect();
        open.index.items.retain(|i| !gone(&i.path));
        save_index(dir, &open)?;
        for b in blobs {
            let _ = fs::remove_file(dir.join(BLOBS).join(b));
        }
        Ok(())
    }
}

/// Argon2id cost: strong in the app, cheap in tests.
fn kdf_params() -> (u32, u32, u32) {
    if cfg!(test) { (8 * 1024, 1, 1) } else { (64 * 1024, 3, 1) }
}

fn temp_dir_for(dir: &Path) -> PathBuf {
    let h = blake3::hash(key_of(dir).as_bytes());
    std::env::temp_dir().join("space-train-cassaforte").join(&h.to_hex().as_str()[..16])
}

/// Is this folder a vault? Its name ends in `.cassaforte` and it has the header.
pub fn is_vault(path: &Path) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case(EXT)) && path.join(HEADER).is_file()
}

// ── Commands ────────────────────────────────────────────────────────

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, FsError> + Send + 'static) -> Result<T, FsError> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(io)?
}

#[tauri::command]
pub async fn vault_create(state: tauri::State<'_, Arc<Vaults>>, parent: String, name: String, password: String) -> Result<String, FsError> {
    let v = state.inner().clone();
    let password = Zeroizing::new(password);
    blocking(move || v.create(Path::new(&parent), &name, &password).map(|p| p.to_string_lossy().into_owned())).await
}

#[tauri::command]
pub async fn vault_unlock(state: tauri::State<'_, Arc<Vaults>>, path: String, password: String) -> Result<(), FsError> {
    let v = state.inner().clone();
    let password = Zeroizing::new(password);
    blocking(move || v.unlock(Path::new(&path), &password)).await
}

#[tauri::command]
pub fn vault_lock(state: tauri::State<'_, Arc<Vaults>>, path: String) {
    state.lock(Path::new(&path));
}

#[tauri::command]
pub fn vault_is_open(state: tauri::State<'_, Arc<Vaults>>, path: String) -> bool {
    state.is_open(Path::new(&path))
}

#[tauri::command]
pub async fn vault_list(state: tauri::State<'_, Arc<Vaults>>, path: String) -> Result<Vec<ArchiveItem>, FsError> {
    let v = state.inner().clone();
    blocking(move || v.list(Path::new(&path))).await
}

#[tauri::command]
pub async fn vault_add(state: tauri::State<'_, Arc<Vaults>>, path: String, sources: Vec<String>, inner: String) -> Result<usize, FsError> {
    let v = state.inner().clone();
    blocking(move || v.add(Path::new(&path), &sources, &inner)).await
}

#[tauri::command]
pub async fn vault_extract(state: tauri::State<'_, Arc<Vaults>>, path: String, items: Vec<String>, dest: String) -> Result<Vec<String>, FsError> {
    let v = state.inner().clone();
    blocking(move || v.extract(Path::new(&path), &items, Path::new(&dest))).await
}

#[tauri::command]
pub async fn vault_open_item(state: tauri::State<'_, Arc<Vaults>>, path: String, item: String) -> Result<String, FsError> {
    let v = state.inner().clone();
    blocking(move || v.open_item(Path::new(&path), &item)).await
}

#[tauri::command]
pub async fn vault_delete(state: tauri::State<'_, Arc<Vaults>>, path: String, items: Vec<String>) -> Result<(), FsError> {
    let v = state.inner().clone();
    blocking(move || v.delete(Path::new(&path), &items)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, Vaults, PathBuf) {
        let t = tempfile::tempdir().unwrap();
        let v = Vaults::default();
        let dir = v.create(t.path(), "Privato", "una password lunga").unwrap();
        (t, v, dir)
    }

    #[test]
    fn round_trip_of_files_and_folders_across_chunk_sizes() {
        let (t, v, dir) = setup();
        let src = t.path().join("src");
        fs::create_dir_all(src.join("Banca")).unwrap();
        let big: Vec<u8> = (0..(CHUNK * 2 + 123)).map(|i| (i % 251) as u8).collect();
        fs::write(src.join("Banca").join("estratto.pdf"), &big).unwrap();
        fs::write(src.join("vuoto.txt"), b"").unwrap();
        fs::write(src.join("esatto.bin"), vec![7u8; CHUNK]).unwrap();
        let sources: Vec<String> = ["Banca", "vuoto.txt", "esatto.bin"].iter().map(|n| src.join(n).to_string_lossy().into_owned()).collect();
        assert_eq!(v.add(&dir, &sources, "").unwrap(), 3);

        // Lock and unlock: the index came back from disk.
        v.lock(&dir);
        assert!(v.list(&dir).is_err());
        v.unlock(&dir, "una password lunga").unwrap();
        let mut paths: Vec<String> = v.list(&dir).unwrap().into_iter().map(|i| i.path).collect();
        paths.sort();
        assert_eq!(paths, ["Banca", "Banca/estratto.pdf", "esatto.bin", "vuoto.txt"]);

        let out = t.path().join("out");
        fs::create_dir_all(&out).unwrap();
        v.extract(&dir, &["Banca".into(), "vuoto.txt".into(), "esatto.bin".into()], &out).unwrap();
        assert_eq!(fs::read(out.join("Banca").join("estratto.pdf")).unwrap(), big);
        assert_eq!(fs::read(out.join("vuoto.txt")).unwrap(), b"");
        assert_eq!(fs::read(out.join("esatto.bin")).unwrap(), vec![7u8; CHUNK]);
    }

    #[test]
    fn nothing_readable_from_outside() {
        let (t, v, dir) = setup();
        let f = t.path().join("Segreto-nome.txt");
        fs::write(&f, b"contenuto riservato").unwrap();
        v.add(&dir, &[f.to_string_lossy().into_owned()], "").unwrap();
        for e in walk(&dir) {
            let bytes = fs::read(&e).unwrap();
            let text = String::from_utf8_lossy(&bytes);
            assert!(!text.contains("Segreto-nome") && !text.contains("riservato"), "leak in {e:?}");
        }
    }

    #[test]
    fn wrong_password_and_tampering_are_refused() {
        let (t, v, dir) = setup();
        v.lock(&dir);
        let e = v.unlock(&dir, "sbagliata!!").unwrap_err();
        assert!(matches!(e, FsError::Io { ref message } if message == "Password sbagliata."));

        v.unlock(&dir, "una password lunga").unwrap();
        let f = t.path().join("a.txt");
        fs::write(&f, b"ciao").unwrap();
        v.add(&dir, &[f.to_string_lossy().into_owned()], "").unwrap();
        let blob = fs::read_dir(dir.join(BLOBS)).unwrap().next().unwrap().unwrap().path();
        let mut bytes = fs::read(&blob).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        fs::write(&blob, bytes).unwrap();
        let out = t.path().join("out");
        fs::create_dir_all(&out).unwrap();
        assert!(v.extract(&dir, &["a.txt".into()], &out).is_err());
        assert!(!out.join("a.txt").exists());
    }

    #[test]
    fn names_collide_into_numbers_and_delete_removes_blobs() {
        let (t, v, dir) = setup();
        let f = t.path().join("nota.txt");
        fs::write(&f, b"1").unwrap();
        let s = vec![f.to_string_lossy().into_owned()];
        v.add(&dir, &s, "").unwrap();
        v.add(&dir, &s, "").unwrap();
        let mut paths: Vec<String> = v.list(&dir).unwrap().into_iter().map(|i| i.path).collect();
        paths.sort();
        assert_eq!(paths, ["nota (2).txt", "nota.txt"]);
        v.delete(&dir, &["nota.txt".into()]).unwrap();
        assert_eq!(fs::read_dir(dir.join(BLOBS)).unwrap().count(), 1);
        assert!(f.exists(), "the original stays where it was");
    }

    #[test]
    fn refuses_short_passwords_and_itself() {
        let t = tempfile::tempdir().unwrap();
        let v = Vaults::default();
        assert!(v.create(t.path(), "X", "corta").is_err());
        let dir = v.create(t.path(), "X", "abbastanza lunga").unwrap();
        assert!(is_vault(&dir));
        assert!(v.add(&dir, &[t.path().to_string_lossy().into_owned()], "").is_err());
    }

    fn walk(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() { out.extend(walk(&p)) } else { out.push(p) }
        }
        out
    }
}
