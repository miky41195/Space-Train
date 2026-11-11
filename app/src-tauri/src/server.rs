//! Remote servers (SFTP, FTP, FTPS, WebDAV) browsed like folders.
//!
//! Paths are virtual: `::server\<id>\a\b` is `a/b` under the server's start
//! folder. Passwords are kept in the Windows Credential Manager when the
//! user asks to remember them, otherwise only in memory for the session.
//! An SFTP server's key is checked against the fingerprint the user
//! confirmed the first time; a different key stops everything.

use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use zeroize::Zeroizing;

pub const RADICE: &str = "::server";

/// The saved servers, for the commands that only get a path (list, rename, download…).
static SERVERS: std::sync::OnceLock<std::sync::Arc<Servers>> = std::sync::OnceLock::new();

pub fn install(s: std::sync::Arc<Servers>) {
    let _ = SERVERS.set(s);
}

pub fn servers() -> Result<&'static std::sync::Arc<Servers>, FsError> {
    SERVERS.get().ok_or(FsError::NotFound)
}

/// A path on a remote server (or the list of servers).
pub fn is_server(path: &str) -> bool {
    path == RADICE || path.starts_with(&format!("{RADICE}\\"))
}
const CHUNK: usize = 256 * 1024;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Sftp,
    Ftp,
    Ftps,
    Webdav,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub id: String,
    pub name: String,
    pub protocol: Protocol,
    /// Host name or address; for WebDAV `http://` in front means no TLS.
    pub host: String,
    pub port: u16,
    pub user: String,
    /// Start folder on the server, `/` by default.
    pub path: String,
    /// SHA256 fingerprint of the SFTP server key the user confirmed.
    #[serde(default)]
    pub fingerprint: Option<String>,
    /// The password is in the Credential Manager.
    #[serde(default)]
    pub remember: bool,
}

/// One item as the server lists it.
#[derive(Debug, Clone, PartialEq)]
pub struct RItem {
    pub name: String,
    pub dir: bool,
    pub size: u64,
    pub modified: Option<i64>,
}

/// What every protocol knows how to do. Paths are absolute on the server, with `/`.
pub trait Remote {
    fn list(&mut self, dir: &str) -> Result<Vec<RItem>, FsError>;
    fn download(&mut self, path: &str, to: &mut dyn Write, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError>;
    fn upload(&mut self, path: &str, from: &mut dyn Read, size: u64, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError>;
    fn mkdir(&mut self, path: &str) -> Result<(), FsError>;
    fn rename(&mut self, from: &str, to: &str) -> Result<(), FsError>;
    fn remove(&mut self, path: &str, dir: bool) -> Result<(), FsError>;
}

pub fn io(e: impl std::fmt::Display) -> FsError {
    FsError::Io { message: e.to_string() }
}

fn cancelled() -> FsError {
    FsError::Io { message: "Operazione annullata.".into() }
}

/// Saved servers and the passwords of this session.
pub struct Servers {
    file: PathBuf,
    list: Mutex<Vec<Config>>,
    session: Mutex<HashMap<String, Zeroizing<String>>>,
}

impl Servers {
    pub fn load(file: PathBuf) -> Self {
        let list = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Servers { file, list: Mutex::new(list), session: Mutex::new(HashMap::new()) }
    }

    pub fn all(&self) -> Vec<Config> {
        self.list.lock().unwrap().clone()
    }

    fn get(&self, id: &str) -> Result<Config, FsError> {
        self.list.lock().unwrap().iter().find(|c| c.id == id).cloned().ok_or(FsError::NotFound)
    }

    fn save(&self, list: &[Config]) -> Result<(), FsError> {
        if let Some(dir) = self.file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let tmp = self.file.with_extension("tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(list).map_err(io)?).map_err(|e| crate::fs::error::from_io(&e))?;
        std::fs::rename(&tmp, &self.file).map_err(|e| crate::fs::error::from_io(&e))
    }

    /// Adds or replaces a server. A new address forgets the confirmed key.
    pub fn put(&self, mut c: Config, password: Option<String>) -> Result<Config, FsError> {
        c.name = c.name.trim().to_string();
        c.host = c.host.trim().to_string();
        c.user = c.user.trim().to_string();
        if c.host.is_empty() {
            return Err(io("Scrivi l'indirizzo del server."));
        }
        if c.name.is_empty() {
            c.name = c.host.clone();
        }
        if c.path.trim().is_empty() {
            c.path = "/".into();
        }
        if c.id.is_empty() {
            c.id = new_id();
        }
        let mut list = self.list.lock().unwrap();
        if let Some(old) = list.iter().find(|o| o.id == c.id) {
            if old.host != c.host || old.port != c.port || old.protocol != c.protocol {
                c.fingerprint = None;
            } else if c.fingerprint.is_none() {
                c.fingerprint = old.fingerprint.clone();
            }
        }
        if let Some(pw) = password {
            self.set_password(&c, &pw)?;
        }
        if !c.remember {
            creds::delete(&c.id);
        }
        list.retain(|o| o.id != c.id);
        list.push(c.clone());
        self.save(&list)?;
        Ok(c)
    }

    pub fn remove(&self, id: &str) -> Result<(), FsError> {
        let mut list = self.list.lock().unwrap();
        list.retain(|c| c.id != id);
        self.session.lock().unwrap().remove(id);
        creds::delete(id);
        self.save(&list)
    }

    /// The user confirmed this key: from now on only it is accepted.
    pub fn trust(&self, id: &str, fingerprint: &str) -> Result<(), FsError> {
        let mut list = self.list.lock().unwrap();
        let c = list.iter_mut().find(|c| c.id == id).ok_or(FsError::NotFound)?;
        c.fingerprint = Some(fingerprint.to_string());
        self.save(&list)
    }

    fn set_password(&self, c: &Config, pw: &str) -> Result<(), FsError> {
        self.session.lock().unwrap().insert(c.id.clone(), Zeroizing::new(pw.to_string()));
        if c.remember {
            creds::write(&c.id, &c.user, pw)?;
        }
        Ok(())
    }

    /// Stores a password typed when the server asked for one.
    pub fn password(&self, id: &str, pw: &str, remember: bool) -> Result<(), FsError> {
        let mut c = self.get(id)?;
        if c.remember != remember {
            c.remember = remember;
            self.put(c.clone(), None)?;
        }
        self.set_password(&c, pw)
    }

    fn password_of(&self, c: &Config) -> Option<Zeroizing<String>> {
        if let Some(p) = self.session.lock().unwrap().get(&c.id) {
            return Some(p.clone());
        }
        let p = if c.remember { creds::read(&c.id) } else { None }?;
        self.session.lock().unwrap().insert(c.id.clone(), p.clone());
        Some(p)
    }

    /// Opens a connection to the server of a virtual path.
    fn connect(&self, id: &str) -> Result<(Config, Box<dyn Remote>), FsError> {
        let c = self.get(id)?;
        let pw = match self.password_of(&c) {
            Some(p) => p,
            // Anonymous FTP needs no password.
            None if c.protocol != Protocol::Sftp && (c.user.is_empty() || c.user.eq_ignore_ascii_case("anonymous")) => {
                Zeroizing::new(String::new())
            }
            None => return Err(FsError::ServerPassword),
        };
        let remote: Box<dyn Remote> = match c.protocol {
            Protocol::Sftp => Box::new(sftp::Sftp::connect(&c, &pw)?),
            Protocol::Ftp | Protocol::Ftps => Box::new(ftp::Ftp::connect(&c, &pw)?),
            Protocol::Webdav => Box::new(dav::Dav::connect(&c, &pw)?),
        };
        Ok((c, remote))
    }

    /// The servers as entries, for `::server`.
    pub fn entries(&self) -> Vec<Entry> {
        self.all()
            .into_iter()
            .map(|c| entry(c.name.clone(), format!("{RADICE}\\{}", c.id), true, 0, None))
            .collect()
    }

    pub fn list(&self, path: &str) -> Result<Vec<Entry>, FsError> {
        let (id, rel) = split(path).ok_or(FsError::NotFound)?;
        let (c, mut r) = self.connect(&id)?;
        let items = r.list(&remote_path(&c, &rel))?;
        Ok(items
            .into_iter()
            .filter(|i| valid_name(&i.name))
            .map(|i| entry(i.name.clone(), format!("{path}\\{}", i.name), i.dir, i.size, i.modified))
            .collect())
    }

    /// Downloads items into a local folder; a taken name gets a number.
    pub fn download(&self, sources: &[String], dest: &str, cancel: &AtomicBool, progress: &mut dyn FnMut(u64, u64)) -> Result<Vec<[String; 2]>, FsError> {
        let Some((id, _)) = sources.first().and_then(|s| split(s)) else { return Ok(Vec::new()) };
        let (c, mut r) = self.connect(&id)?;
        download_from(&c, r.as_mut(), &id, sources, dest, cancel, progress)
    }

    /// Uploads local files and folders into a server folder; a taken name gets a number.
    pub fn upload(&self, sources: &[String], dest: &str, cancel: &AtomicBool, progress: &mut dyn FnMut(u64, u64)) -> Result<Vec<[String; 2]>, FsError> {
        let (id, _) = split(dest).ok_or(FsError::NotFound)?;
        let (c, mut r) = self.connect(&id)?;
        upload_to(&c, r.as_mut(), sources, dest, cancel, progress)
    }

    pub fn rename(&self, path: &str, name: &str) -> Result<String, FsError> {
        if !valid_name(name) {
            return Err(io("Nome non valido."));
        }
        let (id, rel) = split(path).ok_or(FsError::NotFound)?;
        let (c, mut r) = self.connect(&id)?;
        let parent = rel.rsplit_once('/').map(|p| p.0).unwrap_or("");
        r.rename(&remote_path(&c, &rel), &join(&remote_path(&c, parent), name))?;
        Ok(format!("{}\\{name}", genitore(path).unwrap_or_default()))
    }

    pub fn mkdir(&self, parent: &str, name: &str) -> Result<String, FsError> {
        if !valid_name(name) {
            return Err(io("Nome non valido."));
        }
        let (id, rel) = split(parent).ok_or(FsError::NotFound)?;
        let (c, mut r) = self.connect(&id)?;
        r.mkdir(&join(&remote_path(&c, &rel), name))?;
        Ok(format!("{parent}\\{name}"))
    }

    /// Deletes for good: servers have no Recycle Bin.
    pub fn delete(&self, paths: &[String]) -> Result<(), FsError> {
        let Some((id, _)) = paths.first().and_then(|s| split(s)) else { return Ok(()) };
        let (c, mut r) = self.connect(&id)?;
        for p in paths {
            let (_, rel) = split(p).ok_or(FsError::NotFound)?;
            if rel.is_empty() {
                return Err(io("Non si può eliminare la cartella iniziale del server."));
            }
            let name = rel.rsplit('/').next().unwrap_or_default();
            let parent = rel.rsplit_once('/').map(|p| p.0).unwrap_or("");
            let item = r.list(&remote_path(&c, parent))?.into_iter().find(|i| i.name == name).ok_or(FsError::NotFound)?;
            remove_tree(r.as_mut(), &remote_path(&c, &rel), item.dir)?;
        }
        Ok(())
    }
}

#[allow(clippy::too_many_arguments)]
fn download_from(
    c: &Config,
    r: &mut dyn Remote,
    id: &str,
    sources: &[String],
    dest: &str,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<Vec<[String; 2]>, FsError> {
    let dest = Path::new(dest);
    // What to fetch, folders walked first so the total is known.
    let mut plan: Vec<(String, PathBuf, bool, u64)> = Vec::new();
    let mut pairs = Vec::new();
    for s in sources {
        let (sid, rel) = split(s).ok_or(FsError::NotFound)?;
        if sid != id {
            return Err(io("Scarica da un server alla volta."));
        }
        let name = rel.rsplit('/').next().unwrap_or_default().to_string();
        if !valid_name(&name) {
            return Err(io("Nome non valido."));
        }
        let parent = rel.rsplit_once('/').map(|p| p.0).unwrap_or("");
        let item = r.list(&remote_path(c, parent))?.into_iter().find(|i| i.name == name).ok_or(FsError::NotFound)?;
        let local = dest.join(crate::fs::copy::unique_name(dest, &name));
        pairs.push([s.clone(), local.to_string_lossy().into_owned()]);
        let rp = remote_path(c, &rel);
        if item.dir {
            plan.push((rp.clone(), local.clone(), true, 0));
            walk(r, &rp, &local, &mut plan, cancel)?;
        } else {
            plan.push((rp, local, false, item.size));
        }
    }
    let total: u64 = plan.iter().map(|p| p.3).sum();
    let mut done = 0u64;
    for (rp, local, dir, _) in plan {
        if cancel.load(Ordering::Relaxed) {
            return Err(cancelled());
        }
        if dir {
            std::fs::create_dir_all(&local).map_err(|e| crate::fs::error::from_io(&e))?;
            continue;
        }
        let part = local.with_file_name(format!("{}.parziale", local.file_name().unwrap().to_string_lossy()));
        let res = (|| {
            let mut f = std::io::BufWriter::new(std::fs::File::create(&part).map_err(|e| crate::fs::error::from_io(&e))?);
            let base = done;
            r.download(&rp, &mut f, cancel, &mut |n| progress(base + n, total))?;
            f.flush().map_err(io)?;
            drop(f);
            std::fs::rename(&part, &local).map_err(|e| crate::fs::error::from_io(&e))
        })();
        if let Err(e) = res {
            let _ = std::fs::remove_file(&part);
            return Err(e);
        }
        done += std::fs::metadata(&local).map(|m| m.len()).unwrap_or(0);
        progress(done, total.max(done));
    }
    Ok(pairs)
}

fn upload_to(
    c: &Config,
    r: &mut dyn Remote,
    sources: &[String],
    dest: &str,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<Vec<[String; 2]>, FsError> {
    let (_, rel) = split(dest).ok_or(FsError::NotFound)?;
    let base = remote_path(c, &rel);
    let taken: Vec<String> = r.list(&base)?.into_iter().map(|i| i.name).collect();
    let total = crate::fs::copy::total_bytes(sources);
    let mut done = 0u64;
    let mut pairs = Vec::new();
    let mut used = taken.clone();
    for s in sources {
        let src = Path::new(s);
        let name = src.file_name().map(|n| n.to_string_lossy().into_owned()).ok_or(FsError::NotFound)?;
        let free = free_name(|n| used.iter().any(|t| t == n), &name);
        used.push(free.clone());
        pairs.push([s.clone(), format!("{dest}\\{free}")]);
        put_tree(r, src, &join(&base, &free), cancel, &mut |abs| progress(abs, total), &mut done)?;
    }
    Ok(pairs)
}

fn walk(r: &mut dyn Remote, dir: &str, local: &Path, plan: &mut Vec<(String, PathBuf, bool, u64)>, cancel: &AtomicBool) -> Result<(), FsError> {
    for i in r.list(dir)? {
        if cancel.load(Ordering::Relaxed) {
            return Err(cancelled());
        }
        if !valid_name(&i.name) {
            continue;
        }
        let rp = join(dir, &i.name);
        let lp = local.join(&i.name);
        if i.dir {
            plan.push((rp.clone(), lp.clone(), true, 0));
            walk(r, &rp, &lp, plan, cancel)?;
        } else {
            plan.push((rp, lp, false, i.size));
        }
    }
    Ok(())
}

/// Uploads a file or a folder tree; `on` gets the bytes sent so far in the whole operation.
fn put_tree(r: &mut dyn Remote, src: &Path, rp: &str, cancel: &AtomicBool, on: &mut dyn FnMut(u64), done: &mut u64) -> Result<(), FsError> {
    if cancel.load(Ordering::Relaxed) {
        return Err(cancelled());
    }
    let meta = std::fs::metadata(src).map_err(|e| crate::fs::error::from_io(&e))?;
    if meta.is_dir() {
        r.mkdir(rp)?;
        for e in std::fs::read_dir(src).map_err(|e| crate::fs::error::from_io(&e))? {
            let e = e.map_err(|e| crate::fs::error::from_io(&e))?;
            put_tree(r, &e.path(), &join(rp, &e.file_name().to_string_lossy()), cancel, on, done)?;
        }
        return Ok(());
    }
    let mut f = std::io::BufReader::new(std::fs::File::open(src).map_err(|e| crate::fs::error::from_io(&e))?);
    let base = *done;
    r.upload(rp, &mut f, meta.len(), cancel, &mut |n| on(base + n))?;
    *done += meta.len();
    Ok(())
}

fn remove_tree(r: &mut dyn Remote, rp: &str, dir: bool) -> Result<(), FsError> {
    if dir {
        for i in r.list(rp)? {
            remove_tree(r, &join(rp, &i.name), i.dir)?;
        }
    }
    r.remove(rp, dir)
}

fn entry(name: String, path: String, dir: bool, size: u64, modified: Option<i64>) -> Entry {
    Entry {
        hidden: name.starts_with('.'),
        name,
        path,
        kind: if dir { EntryKind::Dir } else { EntryKind::File },
        size,
        modified,
        origine: None,
        libero: None,
        totale: None,
        icona_propria: false,
        snippet: None,
    }
}

fn new_id() -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{:x}", t)
}

/// A name that is safe as one path component here and on the server.
fn valid_name(n: &str) -> bool {
    !n.is_empty() && n != "." && n != ".." && !n.contains(['/', '\\']) && crate::fs::names::validate_name(n).is_ok()
}

fn free_name(taken: impl Fn(&str) -> bool, name: &str) -> String {
    if !taken(name) {
        return name.to_string();
    }
    let (base, ext) = match name.rfind('.').filter(|i| *i > 0) {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    (2..).map(|n| format!("{base} ({n}){ext}")).find(|c| !taken(c)).unwrap()
}

pub fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('/') { format!("{dir}{name}") } else { format!("{dir}/{name}") }
}

fn remote_path(c: &Config, rel: &str) -> String {
    let start = if c.path.starts_with('/') { c.path.clone() } else { format!("/{}", c.path) };
    if rel.is_empty() { start } else { join(&start, rel) }
}

/// `::server\<id>\a\b` → (`id`, `a/b`). Refuses `..` and empty segments.
pub fn split(path: &str) -> Option<(String, String)> {
    let rest = path.strip_prefix(RADICE)?.strip_prefix('\\')?;
    let mut parts = rest.split('\\');
    let id = parts.next().filter(|s| !s.is_empty())?.to_string();
    let rel: Vec<&str> = parts.collect();
    if rel.iter().any(|s| s.is_empty() || *s == "." || *s == "..") {
        return None;
    }
    Some((id, rel.join("/")))
}

pub fn genitore(path: &str) -> Option<String> {
    if path == RADICE {
        return None;
    }
    let (_, rel) = split(path)?;
    let cut = path.rfind('\\')?;
    Some(if rel.is_empty() { RADICE.to_string() } else { path[..cut].to_string() })
}

/// Reads `from` into the server stream in chunks, counting and checking cancel.
pub fn pump(from: &mut dyn Read, to: &mut dyn Write, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<u64, FsError> {
    let mut buf = vec![0u8; CHUNK];
    let mut n = 0u64;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(cancelled());
        }
        let k = from.read(&mut buf).map_err(io)?;
        if k == 0 {
            return Ok(n);
        }
        to.write_all(&buf[..k]).map_err(io)?;
        n += k as u64;
        on(n);
    }
}

fn millis(t: std::time::SystemTime) -> Option<i64> {
    t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_millis() as i64)
}

// ── SFTP ────────────────────────────────────────────────────────────
mod sftp {
    use super::*;
    use russh::client;
    use russh::keys::{HashAlg, PublicKeyOrCertificate};
    use russh_sftp::client::SftpSession;
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    struct Check {
        expected: Option<String>,
        seen: Arc<Mutex<Option<String>>>,
    }

    impl client::Handler for Check {
        type Error = russh::Error;

        async fn check_server_key(&mut self, key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
            let fp = key.public_key().fingerprint(HashAlg::Sha256).to_string();
            *self.seen.lock().unwrap() = Some(fp.clone());
            Ok(self.expected.as_deref() == Some(fp.as_str()))
        }
    }

    pub struct Sftp {
        sftp: SftpSession,
        _session: client::Handle<Check>,
    }

    fn block<T>(f: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(f)
    }

    impl Sftp {
        pub fn connect(c: &Config, pw: &str) -> Result<Self, FsError> {
            let seen = Arc::new(Mutex::new(None));
            let check = Check { expected: c.fingerprint.clone(), seen: seen.clone() };
            let config = Arc::new(client::Config {
                inactivity_timeout: Some(std::time::Duration::from_secs(60)),
                ..Default::default()
            });
            let host = c.host.clone();
            let port = if c.port == 0 { 22 } else { c.port };
            let user = c.user.clone();
            let pw = pw.to_string();
            let expected = c.fingerprint.clone();
            block(async move {
                let connected = tokio::time::timeout(std::time::Duration::from_secs(15), client::connect(config, (host.as_str(), port), check)).await;
                let mut session = match connected {
                    Err(_) => return Err(io("Il server non risponde.")),
                    Ok(Ok(s)) => s,
                    Ok(Err(e)) => {
                        // The key was refused: unknown (first time) or different (danger).
                        let fp = seen.lock().unwrap().clone();
                        if let Some(fp) = fp.filter(|fp| expected.as_deref() != Some(fp.as_str())) {
                            return Err(FsError::ServerKey { fingerprint: fp, changed: expected.is_some() });
                        }
                        return Err(io(format!("Collegamento non riuscito: {e}")));
                    }
                };
                let ok = session.authenticate_password(user, pw).await.map_err(io)?;
                if !matches!(ok, russh::client::AuthResult::Success) {
                    return Err(FsError::ServerPassword);
                }
                let ch = session.channel_open_session().await.map_err(io)?;
                ch.request_subsystem(true, "sftp").await.map_err(io)?;
                let sftp = SftpSession::new(ch.into_stream()).await.map_err(io)?;
                Ok(Sftp { sftp, _session: session })
            })
        }
    }

    impl Remote for Sftp {
        fn list(&mut self, dir: &str) -> Result<Vec<RItem>, FsError> {
            let rd = block(self.sftp.read_dir(dir)).map_err(io)?;
            Ok(rd
                .map(|e| {
                    let m = e.metadata();
                    RItem { name: e.file_name(), dir: m.is_dir(), size: m.size.unwrap_or(0), modified: m.mtime.map(|t| t as i64 * 1000) }
                })
                .collect())
        }

        fn download(&mut self, path: &str, to: &mut dyn Write, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError> {
            block(async {
                let mut f = self.sftp.open(path).await.map_err(io)?;
                let mut buf = vec![0u8; CHUNK];
                let mut n = 0u64;
                loop {
                    if cancel.load(Ordering::Relaxed) {
                        return Err(cancelled());
                    }
                    let k = f.read(&mut buf).await.map_err(io)?;
                    if k == 0 {
                        return Ok(());
                    }
                    to.write_all(&buf[..k]).map_err(io)?;
                    n += k as u64;
                    on(n);
                }
            })
        }

        fn upload(&mut self, path: &str, from: &mut dyn Read, _size: u64, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError> {
            block(async {
                let mut f = self.sftp.create(path).await.map_err(io)?;
                let mut buf = vec![0u8; CHUNK];
                let mut n = 0u64;
                loop {
                    if cancel.load(Ordering::Relaxed) {
                        return Err(cancelled());
                    }
                    let k = from.read(&mut buf).map_err(io)?;
                    if k == 0 {
                        break;
                    }
                    f.write_all(&buf[..k]).await.map_err(io)?;
                    n += k as u64;
                    on(n);
                }
                f.shutdown().await.map_err(io)
            })
        }

        fn mkdir(&mut self, path: &str) -> Result<(), FsError> {
            block(self.sftp.create_dir(path)).map_err(io)
        }

        fn rename(&mut self, from: &str, to: &str) -> Result<(), FsError> {
            block(self.sftp.rename(from, to)).map_err(io)
        }

        fn remove(&mut self, path: &str, dir: bool) -> Result<(), FsError> {
            if dir { block(self.sftp.remove_dir(path)) } else { block(self.sftp.remove_file(path)) }.map_err(io)
        }
    }
}

// ── FTP / FTPS ──────────────────────────────────────────────────────
mod ftp {
    use super::*;
    use std::sync::Arc;
    use suppaftp::list::File as ListFile;
    use suppaftp::types::FileType;
    use suppaftp::{FtpStream, RustlsConnector, RustlsFtpStream};

    pub enum Ftp {
        Plain(FtpStream),
        Tls(RustlsFtpStream),
    }

    macro_rules! with {
        ($s:expr, $f:ident => $body:expr) => {
            match $s {
                Ftp::Plain($f) => $body,
                Ftp::Tls($f) => $body,
            }
        };
    }

    impl Ftp {
        pub fn connect(c: &Config, pw: &str) -> Result<Self, FsError> {
            let port = if c.port == 0 { 21 } else { c.port };
            let addr = std::net::ToSocketAddrs::to_socket_addrs(&(c.host.as_str(), port))
                .map_err(|_| io("Indirizzo del server non trovato."))?
                .next()
                .ok_or_else(|| io("Indirizzo del server non trovato."))?;
            let timeout = std::time::Duration::from_secs(15);
            let user = if c.user.is_empty() { "anonymous" } else { c.user.as_str() };
            let mut s = if c.protocol == Protocol::Ftps {
                let _ = rustls::crypto::ring::default_provider().install_default();
                let config = <rustls::ClientConfig as rustls_platform_verifier::ConfigVerifierExt>::with_platform_verifier().map_err(io)?;
                let stream = RustlsFtpStream::connect_timeout(addr, timeout).map_err(io)?;
                Ftp::Tls(
                    stream
                        .into_secure(RustlsConnector::from(Arc::new(config)), &c.host)
                        .map_err(|e| io(format!("Collegamento sicuro non riuscito: {e}")))?,
                )
            } else {
                Ftp::Plain(FtpStream::connect_timeout(addr, timeout).map_err(io)?)
            };
            with!(&mut s, f => {
                f.login(user, pw).map_err(|_| FsError::ServerPassword)?;
                f.transfer_type(FileType::Binary).map_err(io)?;
            });
            Ok(s)
        }
    }

    impl Remote for Ftp {
        fn list(&mut self, dir: &str) -> Result<Vec<RItem>, FsError> {
            let lines = with!(self, f => f.list(Some(dir)).map_err(io)?);
            Ok(lines
                .iter()
                .filter_map(|l| ListFile::try_from(l.as_str()).ok())
                .filter(|f| f.name() != "." && f.name() != "..")
                .map(|f| RItem { name: f.name().to_string(), dir: f.is_directory(), size: f.size() as u64, modified: millis(f.modified()) })
                .collect())
        }

        fn download(&mut self, path: &str, to: &mut dyn Write, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError> {
            with!(self, f => {
                let mut s = f.retr_as_stream(path).map_err(io)?;
                pump(&mut s, to, cancel, on)?;
                s.finish().map_err(io)
            })
        }

        fn upload(&mut self, path: &str, from: &mut dyn Read, _size: u64, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError> {
            struct Counting<'a> {
                inner: &'a mut dyn Read,
                cancel: &'a AtomicBool,
                on: &'a mut dyn FnMut(u64),
                n: u64,
            }
            impl Read for Counting<'_> {
                fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
                    if self.cancel.load(Ordering::Relaxed) {
                        return Err(std::io::Error::other("Operazione annullata."));
                    }
                    let k = self.inner.read(buf)?;
                    self.n += k as u64;
                    (self.on)(self.n);
                    Ok(k)
                }
            }
            let mut r = Counting { inner: from, cancel, on, n: 0 };
            with!(self, f => f.put_file(path, &mut r).map(|_| ()).map_err(io))
        }

        fn mkdir(&mut self, path: &str) -> Result<(), FsError> {
            with!(self, f => f.mkdir(path).map_err(io))
        }

        fn rename(&mut self, from: &str, to: &str) -> Result<(), FsError> {
            with!(self, f => f.rename(from, to).map_err(io))
        }

        fn remove(&mut self, path: &str, dir: bool) -> Result<(), FsError> {
            with!(self, f => if dir { f.rmdir(path) } else { f.rm(path) }.map_err(io))
        }
    }

    impl Drop for Ftp {
        fn drop(&mut self) {
            with!(self, f => { let _ = f.quit(); });
        }
    }
}

// ── WebDAV ──────────────────────────────────────────────────────────
mod dav {
    use super::*;
    use quick_xml::events::Event;
    use quick_xml::Reader;
    use reqwest::{Client, Method, StatusCode};

    pub struct Dav {
        client: Client,
        base: String,
        user: String,
        pw: Zeroizing<String>,
    }

    fn block<T>(f: impl std::future::Future<Output = T>) -> T {
        tauri::async_runtime::block_on(f)
    }

    impl Dav {
        pub fn connect(c: &Config, pw: &str) -> Result<Self, FsError> {
            let _ = rustls::crypto::ring::default_provider().install_default();
            let (scheme, host) = match c.host.strip_prefix("http://") {
                Some(h) => ("http", h),
                None => ("https", c.host.strip_prefix("https://").unwrap_or(&c.host)),
            };
            let host = host.trim_end_matches('/');
            let port = if c.port == 0 { String::new() } else { format!(":{}", c.port) };
            let client = Client::builder().timeout(std::time::Duration::from_secs(60)).build().map_err(io)?;
            let d = Dav { client, base: format!("{scheme}://{host}{port}"), user: c.user.clone(), pw: Zeroizing::new(pw.to_string()) };
            // A first look at the start folder checks address and password.
            d.propfind(&remote_path(c, ""))?;
            Ok(d)
        }

        fn url(&self, path: &str) -> String {
            let enc: Vec<String> = path.split('/').map(encode).collect();
            format!("{}{}", self.base, enc.join("/"))
        }

        fn send(&self, method: Method, path: &str, body: Option<reqwest::Body>, headers: &[(&str, String)]) -> Result<reqwest::Response, FsError> {
            let mut req = self.client.request(method, self.url(path)).basic_auth(&self.user, Some(self.pw.as_str()));
            for (k, v) in headers {
                req = req.header(*k, v);
            }
            if let Some(b) = body {
                req = req.body(b);
            }
            let res = block(req.send()).map_err(|e| io(format!("Il server non risponde: {e}")))?;
            match res.status() {
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(FsError::ServerPassword),
                StatusCode::NOT_FOUND => Err(FsError::NotFound),
                s if s.is_success() || s.as_u16() == 207 => Ok(res),
                s => Err(io(format!("Il server ha risposto {s}."))),
            }
        }

        fn propfind(&self, dir: &str) -> Result<Vec<RItem>, FsError> {
            let dir = if dir.ends_with('/') { dir.to_string() } else { format!("{dir}/") };
            let res = self.send(Method::from_bytes(b"PROPFIND").unwrap(), &dir, None, &[("Depth", "1".into())])?;
            let text = block(res.text()).map_err(io)?;
            Ok(parse_multistatus(&text, &self.url(&dir)))
        }
    }

    fn encode(seg: &str) -> String {
        seg.bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
                _ => format!("%{b:02X}"),
            })
            .collect()
    }

    fn decode(s: &str) -> String {
        let b = s.as_bytes();
        let mut out = Vec::with_capacity(b.len());
        let mut i = 0;
        while i < b.len() {
            if b[i] == b'%' && i + 2 < b.len() {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
            }
            out.push(b[i]);
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }

    /// Items of a PROPFIND Depth:1 answer, without the folder itself.
    pub fn parse_multistatus(xml: &str, self_url: &str) -> Vec<RItem> {
        let self_path = decode(self_url.splitn(4, '/').nth(3).map(|p| format!("/{p}")).as_deref().unwrap_or("/")).trim_end_matches('/').to_string();
        let mut r = Reader::from_str(xml);
        let mut out = Vec::new();
        let (mut href, mut dir, mut size, mut modified) = (String::new(), false, 0u64, None);
        let mut field = String::new();
        loop {
            match r.read_event() {
                Ok(Event::Start(e)) => {
                    let n = String::from_utf8_lossy(e.local_name().as_ref()).into_owned();
                    if n == "response" {
                        (href, dir, size, modified) = (String::new(), false, 0, None);
                    }
                    if n == "collection" {
                        dir = true;
                    }
                    field = n;
                }
                Ok(Event::Empty(e)) => {
                    if e.local_name().as_ref() == b"collection" {
                        dir = true;
                    }
                }
                Ok(Event::Text(t)) => {
                    let v = t.decode().map(|c| c.into_owned()).unwrap_or_default();
                    match field.as_str() {
                        "href" => href.push_str(v.trim()),
                        "getcontentlength" => size = v.trim().parse().unwrap_or(0),
                        "getlastmodified" => modified = httpdate(v.trim()),
                        _ => {}
                    }
                }
                Ok(Event::End(e)) => {
                    if e.local_name().as_ref() == b"response" {
                        let path = decode(href.split("://").nth(1).map(|h| h.find('/').map(|i| &h[i..]).unwrap_or("/")).unwrap_or(&href));
                        let trimmed = path.trim_end_matches('/');
                        if trimmed != self_path && !trimmed.is_empty() {
                            if let Some(name) = trimmed.rsplit('/').next() {
                                out.push(RItem { name: name.to_string(), dir, size, modified });
                            }
                        }
                    }
                    field.clear();
                }
                Ok(Event::Eof) | Err(_) => break,
                _ => {}
            }
        }
        out
    }

    /// `Sun, 06 Nov 1994 08:49:37 GMT` → ms since the epoch.
    fn httpdate(s: &str) -> Option<i64> {
        let p: Vec<&str> = s.split_whitespace().collect();
        if p.len() < 5 {
            return None;
        }
        let day: i64 = p[1].parse().ok()?;
        let month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].iter().position(|m| *m == p[2])? as i64 + 1;
        let year: i64 = p[3].parse().ok()?;
        let t: Vec<i64> = p[4].split(':').filter_map(|x| x.parse().ok()).collect();
        if t.len() != 3 {
            return None;
        }
        // Days from civil date (Howard Hinnant).
        let (y, m) = if month <= 2 { (year - 1, month + 9) } else { (year, month - 3) };
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let doy = (153 * m + 2) / 5 + day - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        let days = era * 146097 + doe - 719468;
        Some(((days * 86400) + t[0] * 3600 + t[1] * 60 + t[2]) * 1000)
    }

    impl Remote for Dav {
        fn list(&mut self, dir: &str) -> Result<Vec<RItem>, FsError> {
            self.propfind(dir)
        }

        fn download(&mut self, path: &str, to: &mut dyn Write, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError> {
            let mut res = self.send(Method::GET, path, None, &[])?;
            let mut n = 0u64;
            while let Some(chunk) = block(res.chunk()).map_err(io)? {
                if cancel.load(Ordering::Relaxed) {
                    return Err(cancelled());
                }
                to.write_all(&chunk).map_err(io)?;
                n += chunk.len() as u64;
                on(n);
            }
            Ok(())
        }

        fn upload(&mut self, path: &str, from: &mut dyn Read, size: u64, cancel: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError> {
            // shortcut: the whole file is read into memory before the PUT; stream it when large uploads matter.
            let mut data = Vec::with_capacity(size as usize);
            pump(from, &mut data, cancel, on)?;
            self.send(Method::PUT, path, Some(data.into()), &[]).map(|_| ())
        }

        fn mkdir(&mut self, path: &str) -> Result<(), FsError> {
            self.send(Method::from_bytes(b"MKCOL").unwrap(), path, None, &[]).map(|_| ())
        }

        fn rename(&mut self, from: &str, to: &str) -> Result<(), FsError> {
            let dest = self.url(to);
            self.send(Method::from_bytes(b"MOVE").unwrap(), from, None, &[("Destination", dest), ("Overwrite", "F".into())]).map(|_| ())
        }

        fn remove(&mut self, path: &str, dir: bool) -> Result<(), FsError> {
            let p = if dir && !path.ends_with('/') { format!("{path}/") } else { path.to_string() };
            self.send(Method::DELETE, &p, None, &[]).map(|_| ())
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn parses_a_propfind_answer() {
            let xml = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>/dav/Foto/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
 <d:response><d:href>/dav/Foto/mare%20blu.jpg</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>1234</d:getcontentlength><d:getlastmodified>Sun, 06 Nov 1994 08:49:37 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
 <d:response><d:href>https://nas.local/dav/Foto/Vacanze/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
</d:multistatus>"#;
            let items = parse_multistatus(xml, "https://nas.local/dav/Foto/");
            assert_eq!(
                items,
                vec![
                    RItem { name: "mare blu.jpg".into(), dir: false, size: 1234, modified: Some(784_111_777_000) },
                    RItem { name: "Vacanze".into(), dir: true, size: 0, modified: None },
                ]
            );
        }
    }
}

// ── Windows Credential Manager ──────────────────────────────────────
#[cfg(windows)]
mod creds {
    use super::*;
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    fn target(id: &str) -> HSTRING {
        HSTRING::from(format!("Space Train/server/{id}"))
    }

    pub fn write(id: &str, user: &str, pw: &str) -> Result<(), FsError> {
        let t = target(id);
        let u = HSTRING::from(user);
        let mut blob: Vec<u8> = pw.as_bytes().to_vec();
        let cred = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(t.as_ptr() as *mut _),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            UserName: PWSTR(u.as_ptr() as *mut _),
            ..Default::default()
        };
        let r = unsafe { CredWriteW(&cred, 0) };
        zeroize::Zeroize::zeroize(&mut blob);
        r.map_err(|e| io(format!("Password non salvata: {e}")))
    }

    pub fn read(id: &str) -> Option<Zeroizing<String>> {
        let t = target(id);
        let mut p: *mut CREDENTIALW = std::ptr::null_mut();
        unsafe { CredReadW(&t, CRED_TYPE_GENERIC, None, &mut p) }.ok()?;
        let out = unsafe {
            let c = &*p;
            let bytes = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize);
            let s = Zeroizing::new(String::from_utf8_lossy(bytes).into_owned());
            CredFree(p as *const _);
            s
        };
        Some(out)
    }

    pub fn delete(id: &str) {
        let _ = unsafe { CredDeleteW(&target(id), CRED_TYPE_GENERIC, None) };
    }
}

/// shortcut: no system keyring off Windows; passwords last for the session there.
#[cfg(not(windows))]
mod creds {
    use super::*;
    pub fn write(_id: &str, _user: &str, _pw: &str) -> Result<(), FsError> {
        Ok(())
    }
    pub fn read(_id: &str) -> Option<Zeroizing<String>> {
        None
    }
    pub fn delete(_id: &str) {}
}

// ── Commands ────────────────────────────────────────────────────────
use std::sync::Arc;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, FsError> + Send + 'static) -> Result<T, FsError> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(io)?
}

#[tauri::command]
pub fn server_list(state: tauri::State<'_, Arc<Servers>>) -> Vec<Config> {
    state.all()
}

#[tauri::command]
pub fn server_put(state: tauri::State<'_, Arc<Servers>>, config: Config, password: Option<String>) -> Result<Config, FsError> {
    state.put(config, password)
}

#[tauri::command]
pub fn server_remove(state: tauri::State<'_, Arc<Servers>>, id: String) -> Result<(), FsError> {
    state.remove(&id)
}

#[tauri::command]
pub fn server_trust(state: tauri::State<'_, Arc<Servers>>, id: String, fingerprint: String) -> Result<(), FsError> {
    state.trust(&id, &fingerprint)
}

#[tauri::command]
pub fn server_password(state: tauri::State<'_, Arc<Servers>>, id: String, password: String, remember: bool) -> Result<(), FsError> {
    state.password(&id, &Zeroizing::new(password), remember)
}

/// Tries the connection: nothing else, so the add dialog can say what is wrong.
#[tauri::command]
pub async fn server_test(state: tauri::State<'_, Arc<Servers>>, id: String) -> Result<(), FsError> {
    let s = state.inner().clone();
    blocking(move || s.connect(&id).map(|_| ())).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn virtual_paths() {
        assert_eq!(split(r"::server\abc\Foto\mare.jpg"), Some(("abc".into(), "Foto/mare.jpg".into())));
        assert_eq!(split(r"::server\abc"), Some(("abc".into(), "".into())));
        assert_eq!(split(r"::server\abc\..\x"), None);
        assert_eq!(split("::server"), None);
        assert_eq!(genitore(r"::server\abc\Foto"), Some(r"::server\abc".into()));
        assert_eq!(genitore(r"::server\abc"), Some("::server".into()));
        let c = Config { id: "a".into(), name: "".into(), protocol: Protocol::Sftp, host: "h".into(), port: 0, user: "u".into(), path: "/var/www".into(), fingerprint: None, remember: false };
        assert_eq!(remote_path(&c, "a/b"), "/var/www/a/b");
        assert_eq!(remote_path(&Config { path: "/".into(), ..c }, ""), "/");
    }

    /// A server in memory: path → Some(bytes) for files, None for folders.
    #[derive(Default)]
    struct Fake(std::collections::BTreeMap<String, Option<Vec<u8>>>);

    impl Remote for Fake {
        fn list(&mut self, dir: &str) -> Result<Vec<RItem>, FsError> {
            let pre = if dir.ends_with('/') { dir.to_string() } else { format!("{dir}/") };
            Ok(self
                .0
                .iter()
                .filter(|(k, _)| k.starts_with(&pre) && !k[pre.len()..].contains('/'))
                .map(|(k, v)| RItem { name: k[pre.len()..].into(), dir: v.is_none(), size: v.as_ref().map_or(0, |b| b.len() as u64), modified: None })
                .collect())
        }
        fn download(&mut self, path: &str, to: &mut dyn Write, _: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError> {
            let b = self.0.get(path).cloned().flatten().ok_or(FsError::NotFound)?;
            to.write_all(&b).map_err(io)?;
            on(b.len() as u64);
            Ok(())
        }
        fn upload(&mut self, path: &str, from: &mut dyn Read, _: u64, c: &AtomicBool, on: &mut dyn FnMut(u64)) -> Result<(), FsError> {
            let mut b = Vec::new();
            pump(from, &mut b, c, on)?;
            self.0.insert(path.into(), Some(b));
            Ok(())
        }
        fn mkdir(&mut self, path: &str) -> Result<(), FsError> {
            self.0.insert(path.into(), None);
            Ok(())
        }
        fn rename(&mut self, from: &str, to: &str) -> Result<(), FsError> {
            let v = self.0.remove(from).ok_or(FsError::NotFound)?;
            self.0.insert(to.into(), v);
            Ok(())
        }
        fn remove(&mut self, path: &str, dir: bool) -> Result<(), FsError> {
            if dir && self.0.keys().any(|k| k.starts_with(&format!("{path}/"))) {
                return Err(io("folder not empty"));
            }
            self.0.remove(path).map(|_| ()).ok_or(FsError::NotFound)
        }
    }

    fn cfg() -> Config {
        Config { id: "s".into(), name: "S".into(), protocol: Protocol::Sftp, host: "h".into(), port: 0, user: "u".into(), path: "/home".into(), fingerprint: None, remember: false }
    }

    #[test]
    fn upload_numbers_taken_names_and_download_brings_folders_back() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("Foto");
        std::fs::create_dir_all(src.join("Mare")).unwrap();
        std::fs::write(src.join("Mare").join("a.jpg"), b"aaaa").unwrap();
        std::fs::write(t.path().join("nota.txt"), b"ciao").unwrap();
        let mut r = Fake::default();
        r.0.insert("/home/nota.txt".into(), Some(b"vecchia".to_vec()));
        let no = AtomicBool::new(false);
        let mut last = (0, 0);
        let sources: Vec<String> = [src.clone(), t.path().join("nota.txt")].iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let pairs = upload_to(&cfg(), &mut r, &sources, r"::server\s", &no, &mut |a, b| last = (a, b)).unwrap();
        assert_eq!(pairs[1][1], r"::server\s\nota (2).txt");
        assert_eq!(r.0.get("/home/nota.txt").cloned().flatten().unwrap(), b"vecchia", "never overwritten");
        assert_eq!(r.0.get("/home/Foto/Mare/a.jpg").cloned().flatten().unwrap(), b"aaaa");
        assert_eq!(last, (8, 8));

        let out = t.path().join("out");
        std::fs::create_dir_all(&out).unwrap();
        download_from(&cfg(), &mut r, "s", &[r"::server\s\Foto".into()], &out.to_string_lossy(), &no, &mut |_, _| {}).unwrap();
        assert_eq!(std::fs::read(out.join("Foto").join("Mare").join("a.jpg")).unwrap(), b"aaaa");

        remove_tree(&mut r, "/home/Foto", true).unwrap();
        assert!(!r.0.keys().any(|k| k.starts_with("/home/Foto")));
    }

    #[test]
    fn saved_servers_keep_the_key_until_the_address_changes() {
        let dir = tempfile::tempdir().unwrap();
        let s = Servers::load(dir.path().join("server.json"));
        let c = s
            .put(Config { id: String::new(), name: " NAS ".into(), protocol: Protocol::Sftp, host: "nas.local".into(), port: 22, user: "io".into(), path: "".into(), fingerprint: None, remember: false }, None)
            .unwrap();
        assert_eq!((c.name.as_str(), c.path.as_str()), ("NAS", "/"));
        s.trust(&c.id, "SHA256:abc").unwrap();
        let again = Servers::load(dir.path().join("server.json"));
        assert_eq!(again.all()[0].fingerprint.as_deref(), Some("SHA256:abc"));
        let moved = again.put(Config { host: "altro.local".into(), ..again.all()[0].clone() }, None).unwrap();
        assert_eq!(moved.fingerprint, None);
        assert_eq!(again.list(&format!(r"::server\{}", c.id)).unwrap_err(), FsError::ServerPassword);
    }
}
