//! Lan between copies of Space Train: finding each other, exchanging files,
//! browsing the folder another PC decided to share.
//!
//! - Discovery: every visible copy announces itself over UDP broadcast and
//!   listens to the announcements of the others.
//! - Data: a TCP server answers three requests — list a shared
//!   folder, download from it, receive sent files. Receiving always asks
//!   for the user's consent; sharing is read-only.
//!
//! The traffic is not encrypted: it is meant for the home or office network,
//! not for public networks. No path that arrives from the network can leave
//! the shared folder or the received one.

use crate::fs::copy::unique_name;
use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;
use crate::fs::paths;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{IpAddr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::Emitter;

/// How the service notifies the frontend. In the app it is `AppHandle::emit`; in
/// tests any function, so the server runs without a window.
pub type Notifier = Arc<dyn Fn(&str, serde_json::Value) + Send + Sync>;

pub(crate) fn notify<T: Serialize>(notifier: &Notifier, name: &str, payload: T) {
    if let Ok(v) = serde_json::to_value(payload) {
        notifier(name, v);
    }
}

pub const ROOT: &str = "::lan";
pub const ANNOUNCE_PORT: u16 = 47820;
pub const DATA_PORT: u16 = 47821;

const EVERY: Duration = Duration::from_secs(3);
/// A PC that has not announced itself for this long is considered off.
const EXPIRY: Duration = Duration::from_secs(12);
/// How many PCs are remembered at once: a home or an office has far fewer.
const MAX_PEERS: usize = 64;
/// How long the sender waits for the other to accept or refuse.
const CONSENT_WAIT: Duration = Duration::from_secs(120);
const MAX_HEADER: usize = 16 * 1024 * 1024;

// ── Data shared with the frontend ───────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// This PC announces itself and answers the others.
    #[serde(rename = "visibile")]
    pub visible: bool,
    /// Folder the others can browse and copy from.
    #[serde(rename = "condivisa")]
    pub shared: Option<String>,
    /// Where received files end up. Missing = Download\Space Train.
    #[serde(rename = "ricevuti")]
    pub received: Option<String>,
    /// PCs to reach by address, besides those found at home: an IP
    /// or a name, like those of Tailscale or another VPN, which do not
    /// carry the announcements to the whole network.
    #[serde(default, rename = "indirizzi")]
    pub addresses: Vec<String>,
}

/// The same settings as the webview sees them: `Config` keeps the Italian
/// keys of `lan.json`.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LanSettings {
    pub visible: bool,
    pub shared: Option<String>,
    pub received: Option<String>,
    #[serde(default)]
    pub addresses: Vec<String>,
}

impl From<Config> for LanSettings {
    fn from(c: Config) -> Self {
        LanSettings { visible: c.visible, shared: c.shared, received: c.received, addresses: c.addresses }
    }
}

impl From<LanSettings> for Config {
    fn from(s: LanSettings) -> Self {
        Config { visible: s.visible, shared: s.shared, received: s.received, addresses: s.addresses }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LanStatus {
    pub id: String,
    pub name: String,
    /// The actual received folder, even when it is the default one.
    pub received_folder: String,
    #[serde(flatten)]
    pub config: LanSettings,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    /// Name of the folder it shares, if it shares one.
    pub shared: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SendRequest {
    pub id: u64,
    pub from: String,
    pub count: usize,
    pub total: u64,
    /// The first names, to let the user understand what is arriving.
    pub names: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveProgress {
    pub id: u64,
    pub done: u64,
    pub total: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Received {
    pub id: u64,
    pub from: String,
    pub folder: String,
    pub count: usize,
    pub error: Option<String>,
    /// The receiver stopped it: not an error to report.
    pub cancelled: bool,
    /// Notice about the files stopped by the antivirus, if there are any.
    pub blocked: Option<String>,
}

// ── Protocollo ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct Announcement {
    app: String,
    v: u32,
    id: String,
    #[serde(rename = "nome")]
    name: String,
    #[serde(rename = "porta")]
    port: u16,
    #[serde(rename = "condivisa")]
    shared: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub(crate) enum Request {
    #[serde(rename = "elenca")]
    List { path: String },
    #[serde(rename = "scarica")]
    Download { path: String },
    #[serde(rename = "invia")]
    Send {
        #[serde(rename = "da")]
        from: String,
        #[serde(rename = "voci")]
        items: Vec<Item>,
        #[serde(rename = "totale")]
        total: u64,
    },
    /// Between friends: «are you there?», with the name one introduces oneself with.
    #[serde(rename = "ciao")]
    Hello {
        #[serde(rename = "nome")]
        name: String,
    },
    /// Between friends: asking for the friendship, or accepting it by asking in turn.
    #[serde(rename = "amicizia")]
    Friendship {
        #[serde(rename = "nome")]
        name: String,
    },
    /// Between friends: whoever sends it removed us from their friends.
    #[serde(rename = "rimuovi")]
    Remove,
    /// Between friends: what of our backup folder `folder` the friend holds.
    #[serde(rename = "backupElenco")]
    BackupList {
        #[serde(rename = "cartella")]
        folder: String,
    },
    /// Between friends: these files of the backup follow, replace older copies.
    Backup {
        #[serde(rename = "cartella")]
        folder: String,
        #[serde(rename = "voci")]
        items: Vec<crate::backup::BackupItem>,
    },
}

/// An item travelling. `rel` uses `/` as separator and starts from the
/// name of the chosen item, so the destination rebuilds the tree.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Item {
    pub(crate) rel: String,
    #[serde(rename = "dimensione")]
    pub(crate) size: u64,
    #[serde(rename = "cartella")]
    pub(crate) folder: bool,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteItem {
    #[serde(rename = "nome")]
    pub(crate) name: String,
    #[serde(rename = "cartella")]
    pub(crate) folder: bool,
    #[serde(rename = "dimensione")]
    pub(crate) size: u64,
    #[serde(rename = "modificato")]
    pub(crate) modified: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Response {
    pub(crate) ok: bool,
    #[serde(default, rename = "errore", skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
    #[serde(default, rename = "voci", skip_serializing_if = "Vec::is_empty")]
    pub(crate) items: Vec<RemoteItem>,
    #[serde(default, rename = "contenuto", skip_serializing_if = "Vec::is_empty")]
    pub(crate) content: Vec<Item>,
    /// Between friends: the name the responder introduces itself with.
    #[serde(default, rename = "nome", skip_serializing_if = "Option::is_none")]
    pub(crate) name: Option<String>,
    /// Between friends: the friendship is confirmed by both sides.
    #[serde(default, rename = "confermato", skip_serializing_if = "std::ops::Not::not")]
    pub(crate) confirmed: bool,
    /// Between friends: the files of a backup the friend already holds.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) backup: Vec<crate::backup::BackupItem>,
}

impl Response {
    pub(crate) fn error(msg: impl Into<String>) -> Self {
        Response { ok: false, error: Some(msg.into()), ..Default::default() }
    }
}

pub(crate) fn write_json<T: Serialize>(s: &mut impl Write, v: &T) -> io::Result<()> {
    let data = serde_json::to_vec(v).map_err(io::Error::other)?;
    s.write_all(&(data.len() as u32).to_be_bytes())?;
    s.write_all(&data)?;
    s.flush()
}

pub(crate) fn read_json<T: for<'de> Deserialize<'de>>(s: &mut impl Read) -> io::Result<T> {
    let mut length = [0u8; 4];
    s.read_exact(&mut length)?;
    let n = u32::from_be_bytes(length) as usize;
    if n > MAX_HEADER {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "intestazione troppo grande"));
    }
    // The length is declared by the other end: the buffer grows with the
    // bytes that actually arrive, instead of reserving 16 MiB on four bytes
    // of promise (a few connections were enough to exhaust the memory).
    let mut data = Vec::with_capacity(n.min(64 * 1024));
    s.take(n as u64).read_to_end(&mut data)?;
    if data.len() != n {
        return Err(io::ErrorKind::UnexpectedEof.into());
    }
    serde_json::from_slice(&data).map_err(io::Error::other)
}

/// A name Windows does not treat as an ordinary file: the devices (`CON`,
/// `NUL`, `COM1`…, also with an extension) and the names ending with a dot
/// or a space.
fn reserved(part: &str) -> bool {
    if part.ends_with(['.', ' ']) {
        return true;
    }
    let base = part.split('.').next().unwrap_or(part).trim_end().to_ascii_uppercase();
    matches!(base.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((base.starts_with("COM") || base.starts_with("LPT"))
            && base.len() == 4
            && base.as_bytes()[3].is_ascii_digit()
            && base.as_bytes()[3] != b'0')
}

/// A relative path arrived from the network, only if it cannot get out of
/// the folder it will be attached to: no `..`, roots or drive letters.
pub(crate) fn safe_rel(rel: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for part in rel.split(['/', '\\']).filter(|p| !p.is_empty()) {
        if part == "." || part == ".." || part.contains(':') || reserved(part) {
            return None;
        }
        let p = Path::new(part);
        if !matches!(p.components().next(), Some(Component::Normal(_))) || p.components().count() != 1 {
            return None;
        }
        out.push(part);
    }
    Some(out)
}

/// `rel` inside `root`, checked also after resolving the links.
fn inside(root: &Path, rel: &str) -> Option<PathBuf> {
    let joined = root.join(safe_rel(rel)?);
    let base = std::fs::canonicalize(paths::extended(root)).ok()?;
    let real = std::fs::canonicalize(paths::extended(&joined)).ok()?;
    real.starts_with(&base).then_some(joined)
}

/// Hidden or system: outside what is shared.
fn hidden(p: &Path) -> bool {
    std::fs::symlink_metadata(paths::extended(p)).is_ok_and(|m| crate::fs::entry::is_hidden(&m))
}

/// Like `inside`, but for what is given to the other PCs: no segment of the
/// path under the shared folder may be hidden. The listing already did not
/// show them; without this check whoever knew the path downloaded them.
fn shared_path(root: &Path, rel: &str) -> Option<PathBuf> {
    let p = inside(root, rel)?;
    let mut walked = root.to_path_buf();
    for part in safe_rel(rel)?.components() {
        walked.push(part);
        if hidden(&walked) {
            return None;
        }
    }
    Some(p)
}

/// The plan of what is downloaded from the shared folder, without the hidden ones.
fn shared_plan(source: &Path) -> Vec<Item> {
    plan_with(source, true)
}

pub(crate) fn io_error(e: io::Error) -> FsError {
    FsError::Io { message: format!("Rete locale: {}", e) }
}

// ── Service state ────────────────────────────────────────────────────

pub struct Lan {
    pub id: String,
    pub name: String,
    config: Mutex<Config>,
    file_config: PathBuf,
    peers: Mutex<HashMap<String, (Peer, Instant)>>,
    /// Who is waiting for consent: `None` is a refusal, otherwise where to save.
    requests: Mutex<HashMap<u64, mpsc::Sender<Option<PathBuf>>>>,
    next: AtomicU64,
    /// Who announced to us in person, not over broadcast: we answer them the
    /// same way, so it is enough for one of the two to add the other.
    replies: Mutex<HashMap<IpAddr, Instant>>,
    /// The receptions in progress, so they can be stopped from this side.
    receivings: Mutex<HashMap<u64, Arc<AtomicBool>>>,
}

#[derive(Serialize, Deserialize, Default)]
struct FileConfig {
    id: Option<String>,
    #[serde(flatten)]
    config: Config,
}

impl Lan {
    /// Loads identity and preferences and starts the network threads.
    pub fn start(app: tauri::AppHandle, data_dir: PathBuf) -> Arc<Lan> {
        let file_config = data_dir.join("lan.json");
        let saved: FileConfig = std::fs::read(&file_config)
            .ok()
            .and_then(|d| serde_json::from_slice(&d).ok())
            .unwrap_or_default();

        let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".to_string());
        // The id is readable — PC name plus a suffix — because it shows up
        // in the address bar when browsing the other PC.
        let id = saved.id.clone().unwrap_or_else(|| {
            let random = std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.subsec_nanos() ^ std::process::id())
                .unwrap_or(0);
            format!("{}-{:04x}", name.replace(['\\', '/', ' '], "-"), random & 0xffff)
        });

        let lan = Arc::new(Lan::new(id, name, saved.config, file_config));
        lan.save();

        let notifier = app_notifier(app);
        start_discovery(notifier.clone(), lan.clone());
        if let Ok(server) = TcpListener::bind(("0.0.0.0", DATA_PORT)) {
            start_server(notifier, lan.clone(), server);
        } else {
            eprintln!("Lan: port {} taken, server disabled", DATA_PORT);
        }
        lan
    }

    /// The name this PC introduces itself to the others with.
    pub fn name(&self) -> &str {
        &self.name
    }

    pub(crate) fn new(id: String, name: String, config: Config, file_config: PathBuf) -> Lan {
        Lan {
            id,
            name,
            config: Mutex::new(config),
            file_config,
            peers: Mutex::new(HashMap::new()),
            requests: Mutex::new(HashMap::new()),
            next: AtomicU64::new(1),
            replies: Mutex::new(HashMap::new()),
            receivings: Mutex::new(HashMap::new()),
        }
    }

    pub fn status(&self) -> LanStatus {
        LanStatus {
            id: self.id.clone(),
            name: self.name.clone(),
            received_folder: paths::display(&self.received_folder()),
            config: self.config().into(),
        }
    }

    pub fn config(&self) -> Config {
        self.config.lock().map(|c| c.clone()).unwrap_or_default()
    }

    pub fn set(&self, new: Config) {
        if let Ok(mut c) = self.config.lock() {
            *c = new;
        }
        self.save();
    }

    fn save(&self) {
        let f = FileConfig { id: Some(self.id.clone()), config: self.config() };
        if let Some(dir) = self.file_config.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(d) = serde_json::to_vec_pretty(&f) {
            let _ = std::fs::write(&self.file_config, d);
        }
    }

    /// A PC just announced. The first address it was heard from
    /// stays its own until it goes quiet: anyone on the network could announce itself with
    /// the id of another and take its folders and the files sent to it.
    /// Expired entries are removed, and the list has a cap.
    fn register(&self, p: Peer) {
        let Ok(mut m) = self.peers.lock() else { return };
        m.retain(|_, (_, seen)| seen.elapsed() < EXPIRY);
        match m.get(&p.id) {
            Some((known, _)) if known.ip != p.ip => {}
            Some(_) => {
                m.insert(p.id.clone(), (p, Instant::now()));
            }
            None if m.len() < MAX_PEERS => {
                m.insert(p.id.clone(), (p, Instant::now()));
            }
            None => {}
        }
    }

    /// The PCs heard recently, sorted by name.
    pub fn peers(&self) -> Vec<Peer> {
        let mut v: Vec<Peer> = self
            .peers
            .lock()
            .map(|m| {
                m.values()
                    .filter(|(_, seen)| seen.elapsed() < EXPIRY)
                    .map(|(p, _)| p.clone())
                    .collect()
            })
            .unwrap_or_default();
        v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        v
    }

    fn address(&self, id: &str) -> Result<SocketAddr, FsError> {
        self.peers()
            .into_iter()
            .find(|p| p.id == id)
            .and_then(|p| p.ip.parse::<IpAddr>().ok().map(|ip| SocketAddr::new(ip, p.port)))
            .ok_or_else(|| FsError::Io {
                message: "Questo PC non è più raggiungibile in rete locale.".to_string(),
            })
    }

    pub(crate) fn received_folder(&self) -> PathBuf {
        self.config()
            .received
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let home = crate::fs::paths::home().unwrap_or_else(|| ".".into());
                Path::new(&home).join("Downloads").join("Space Train")
            })
    }

    /// Stops a reception in progress. Returns false if it had already ended.
    pub fn cancel_receive(&self, id: u64) -> bool {
        match self.receivings.lock().ok().and_then(|m| m.get(&id).cloned()) {
            Some(f) => {
                f.store(true, Ordering::Relaxed);
                true
            }
            None => false,
        }
    }

    /// The user's answer to a send request, with the folder chosen to save
    /// in. A folder that is not an absolute path on disk (empty, virtual,
    /// relative) counts as no choice.
    pub fn respond(&self, id: u64, accept: bool, folder: Option<String>) {
        if let Some(tx) = self.requests.lock().ok().and_then(|mut m| m.remove(&id)) {
            let dest = accept.then(|| {
                folder
                    .map(PathBuf::from)
                    .filter(|c| c.is_absolute())
                    .unwrap_or_else(|| self.received_folder())
            });
            let _ = tx.send(dest);
        }
    }
}

/// How the network services notify the frontend. The consent and the
/// progress of a reception are shown in one window only, the last used;
/// the lists of PCs and friends apply to all of them.
pub fn app_notifier(app: tauri::AppHandle) -> Notifier {
    Arc::new(move |name: &str, payload: serde_json::Value| {
        if name == "lan-peers" || name == "friends" {
            let _ = app.emit(name, payload);
        } else {
            let w = crate::app_windows::last(&app);
            let _ = app.emit_to(w.label(), name, payload);
        }
    })
}

// ── Scoperta ─────────────────────────────────────────────────────────

fn start_discovery(notifier: Notifier, lan: Arc<Lan>) {
    let Ok(socket) = UdpSocket::bind(("0.0.0.0", ANNOUNCE_PORT)) else {
        eprintln!("Lan: port {} taken, discovery disabled", ANNOUNCE_PORT);
        return;
    };
    let _ = socket.set_broadcast(true);
    let _ = socket.set_read_timeout(Some(Duration::from_secs(1)));
    let Ok(sender) = socket.try_clone() else { return };

    // Periodic announcements, only if the user made this PC visible: to the
    // whole home network, and one by one to the PCs added by address.
    let lan_a = lan.clone();
    std::thread::Builder::new()
        .name("lan-announce".into())
        .spawn(move || loop {
            let c = lan_a.config();
            if c.visible {
                if let Ok(d) = serde_json::to_vec(&announcement(&lan_a, &c)) {
                    let _ = sender.send_to(&d, ("255.255.255.255", ANNOUNCE_PORT));
                    for destination in direct_destinations(&lan_a, &c) {
                        let _ = sender.send_to(&d, destination);
                    }
                }
            }
            std::thread::sleep(EVERY);
        })
        .ok();

    std::thread::Builder::new()
        .name("lan-listen".into())
        .spawn(move || {
            let mut buf = [0u8; 2048];
            let mut latest: Vec<Peer> = Vec::new();
            loop {
                if let Ok((n, from)) = socket.recv_from(&mut buf) {
                    if let Ok(a) = serde_json::from_slice::<Announcement>(&buf[..n]) {
                        if a.app == "space-train" && a.id != lan.id {
                            // We answer them in person as long as they make
                            // themselves heard: an announcement arrived from
                            // the VPN would not come back over broadcast.
                            if let Ok(mut r) = lan.replies.lock() {
                                r.retain(|_, seen| seen.elapsed() < EXPIRY);
                                if r.len() < MAX_PEERS || r.contains_key(&from.ip()) {
                                    r.insert(from.ip(), Instant::now());
                                }
                            }
                            lan.register(Peer {
                                id: a.id,
                                name: a.name,
                                ip: from.ip().to_string(),
                                port: a.port,
                                shared: a.shared,
                            });
                        }
                    }
                }
                // Notifies the frontend only when the list really changes.
                let now = lan.peers();
                if now != latest {
                    notify(&notifier, "lan-peers", &now);
                    latest = now;
                }
            }
        })
        .ok();
}

fn announcement(lan: &Lan, c: &Config) -> Announcement {
    Announcement {
        app: "space-train".into(),
        v: 1,
        id: lan.id.clone(),
        name: lan.name.clone(),
        port: DATA_PORT,
        shared: c.shared.as_deref().map(crate::shell::name_of),
    }
}

/// An address typed by the user in the form the announcement needs:
/// `100.64.0.2`, `home-pc` or `home-pc.tail1234.ts.net`, also with a port.
/// `None` if it does not resolve (unknown name, no network).
fn announce_address(text: &str) -> Option<SocketAddr> {
    use std::net::ToSocketAddrs;
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    if let Ok(a) = t.parse::<SocketAddr>() {
        return Some(SocketAddr::new(a.ip(), ANNOUNCE_PORT));
    }
    (t, ANNOUNCE_PORT)
        .to_socket_addrs()
        .ok()?
        .find(|a| a.is_ipv4())
}

/// Whom to send the announcement to in person: the PCs added by address and
/// those who recently announced to us from outside the home network.
fn direct_destinations(lan: &Lan, c: &Config) -> Vec<SocketAddr> {
    let mut out: Vec<SocketAddr> = c.addresses.iter().filter_map(|t| announce_address(t)).collect();
    if let Ok(mut r) = lan.replies.lock() {
        r.retain(|_, seen| seen.elapsed() < EXPIRY);
        out.extend(r.keys().map(|ip| SocketAddr::new(*ip, ANNOUNCE_PORT)));
    }
    out.sort();
    out.dedup();
    out
}

// ── Server ───────────────────────────────────────────────────────────

/// How many connections are served at once. Each has its own thread:
/// without a cap, anyone on the network could open thousands and stop the PC.
const MAX_CONNECTIONS: usize = 32;

/// A slot among the served connections; whoever drops it frees it.
struct Slot(Arc<std::sync::atomic::AtomicUsize>);

impl Slot {
    fn take_slot(in_use: &Arc<std::sync::atomic::AtomicUsize>) -> Option<Slot> {
        in_use
            .try_update(Ordering::AcqRel, Ordering::Acquire, |n| (n < MAX_CONNECTIONS).then_some(n + 1))
            .ok()
            .map(|_| Slot(in_use.clone()))
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

fn start_server(notifier: Notifier, lan: Arc<Lan>, server: TcpListener) {
    std::thread::Builder::new()
        .name("lan-server".into())
        .spawn(move || {
            let in_use = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            for conn in server.incoming().flatten() {
                // Full: the connection closes right away, whoever opened it will retry.
                let Some(slot) = Slot::take_slot(&in_use) else {
                    continue;
                };
                let notifier = notifier.clone();
                let lan = lan.clone();
                std::thread::spawn(move || {
                    let _slot = slot;
                    let _ = serve(notifier, lan, conn);
                });
            }
        })
        .ok();
}

fn serve(notifier: Notifier, lan: Arc<Lan>, mut s: TcpStream) -> io::Result<()> {
    let visible = lan.config().visible;
    // When invisible we wait briefly: reading the request is enough to say no.
    let _ = s.set_read_timeout(Some(Duration::from_secs(if visible { 60 } else { 5 })));
    let request: Request = read_json(&mut s)?;

    // A PC that is not visible answers nobody: truly invisible.
    if !visible {
        return write_json(&mut s, &Response::error("Questo PC non è visibile in rete locale."));
    }
    let outcome = match request {
        // The friends' requests do not go through the home network.
        Request::Hello { .. }
        | Request::Friendship { .. }
        | Request::Remove
        | Request::BackupList { .. }
        | Request::Backup { .. } => {
            write_json(&mut s, &Response::error("Richiesta non valida."))
        }
        r => serve_request(&notifier, &lan, &mut s, r, &Permissions { sharing: true, sender: None }),
    };
    // Closing the connection is how the sender learns about the cancellation.
    let _ = s.shutdown(std::net::Shutdown::Both);
    outcome
}

/// Who is asking, and what they can have.
pub(crate) struct Permissions {
    /// Can browse and download the shared folder.
    pub(crate) sharing: bool,
    /// The safe name of the requester (a friend, recognized by their key):
    /// it applies instead of the one declared in the request.
    pub(crate) sender: Option<String>,
}

/// Answers a shared folder or send request, on any connection: a socket of
/// the home network or an encrypted stream between friends.
pub(crate) fn serve_request<S: Read + Write>(
    notifier: &Notifier,
    lan: &Arc<Lan>,
    s: &mut S,
    request: Request,
    permissions: &Permissions,
) -> io::Result<()> {
    let config = lan.config();
    let shared = config.shared.as_deref().map(PathBuf::from).filter(|_| permissions.sharing);
    match request {
        Request::List { path } => {
            let Some(root) = shared else {
                return write_json(s, &Response::error("Questo PC non condivide nessuna cartella."));
            };
            let Some(folder) = shared_path(&root, &path) else {
                return write_json(s, &Response::error("Cartella non trovata."));
            };
            let items = list_local(&folder);
            write_json(s, &Response { ok: true, items, ..Default::default() })
        }
        Request::Download { path } => {
            let Some(root) = shared else {
                return write_json(s, &Response::error("Questo PC non condivide nessuna cartella."));
            };
            let Some(source) = shared_path(&root, &path) else {
                return write_json(s, &Response::error("Elemento non trovato."));
            };
            let content = shared_plan(&source);
            write_json(s, &Response { ok: true, content: content.clone(), ..Default::default() })?;
            let base = source.parent().unwrap_or(&source).to_path_buf();
            send_files(s, &base, &content, &AtomicBool::new(false), &mut |_| {})
        }
        Request::Send { from, items, total } => {
            let from = permissions.sender.clone().unwrap_or(from);
            receive(notifier.clone(), lan.clone(), s, from, items, total)
        }
        Request::Hello { .. }
        | Request::Friendship { .. }
        | Request::Remove
        | Request::BackupList { .. }
        | Request::Backup { .. } => {
            write_json(s, &Response::error("Richiesta non valida."))
        }
    }
}

fn list_local(folder: &Path) -> Vec<RemoteItem> {
    let Ok(rd) = std::fs::read_dir(paths::extended(folder)) else { return Vec::new() };
    rd.filter_map(|d| d.ok())
        .filter_map(|d| crate::fs::entry::entry_from_dir_entry(&d))
        .filter(|e| !e.hidden)
        .map(|e| RemoteItem {
            name: e.name,
            folder: e.kind == EntryKind::Dir,
            size: e.size,
            modified: e.modified,
        })
        .collect()
}

/// Everything to be sent for `source`: itself and, if it is a folder, its
/// content. The paths start from the name of `source`.
pub(crate) fn plan(source: &Path) -> Vec<Item> {
    plan_with(source, false)
}

fn plan_with(source: &Path, skip_hidden: bool) -> Vec<Item> {
    let base = source.parent().unwrap_or(source);
    let mut out = Vec::new();
    let mut stack = vec![source.to_path_buf()];
    while let Some(p) = stack.pop() {
        let Ok(meta) = std::fs::symlink_metadata(paths::extended(&p)) else { continue };
        if skip_hidden && crate::fs::entry::is_hidden(&meta) {
            continue;
        }
        let rel = p
            .strip_prefix(base)
            .map(|r| r.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if meta.is_dir() {
            out.push(Item { rel, size: 0, folder: true });
            if let Ok(rd) = std::fs::read_dir(paths::extended(&p)) {
                let mut children: Vec<PathBuf> = rd.filter_map(|d| d.ok()).map(|d| d.path()).collect();
                children.sort();
                for f in children.into_iter().rev() {
                    stack.push(PathBuf::from(paths::display(&f)));
                }
            }
        } else if meta.is_file() && readable(&p) {
            // A file the antivirus holds back here is not announced: it could
            // not be sent, and the transfer would stop halfway.
            out.push(Item { rel, size: meta.len(), folder: false });
        }
    }
    out
}

/// Sends the bytes of the plan's files, one after the other, in the same
/// size announced: the receiver reads exactly `size` bytes.
pub(crate) fn send_files(
    s: &mut impl Write,
    base: &Path,
    items: &[Item],
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> io::Result<()> {
    let mut done = 0u64;
    let mut buf = vec![0u8; 256 * 1024];
    for v in items.iter().filter(|v| !v.folder) {
        let path = base.join(safe_rel(&v.rel).unwrap_or_default());
        let mut f = std::fs::File::open(paths::extended(&path))?.take(v.size);
        let mut sent = 0u64;
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err(io::Error::new(io::ErrorKind::Interrupted, "annullato"));
            }
            let n = f.read(&mut buf)?;
            if n == 0 {
                break;
            }
            s.write_all(&buf[..n])?;
            sent += n as u64;
            done += n as u64;
            progress(done);
        }
        // A file shortened in the meantime: it is padded with zeros so as
        // not to shift all the ones that follow.
        // The zeros are generated while being written: a 4 GB file emptied
        // during the send does not ask for 4 GB of memory.
        if sent < v.size {
            io::copy(&mut io::repeat(0).take(v.size - sent), s)?;
        }
    }
    s.flush()
}

/// What arrived from another PC.
#[derive(Debug, Default)]
pub(crate) struct Arrival {
    /// The top-level paths created, already with the free name chosen.
    pub(crate) created: Vec<PathBuf>,
    /// The files (relative paths as announced) the antivirus stopped.
    pub(crate) blocked: Vec<String>,
}

/// The message for whoever downloaded files and had some of them stopped.
pub(crate) fn blocked_notice(blocked: &[String]) -> Option<String> {
    let first = blocked.first()?;
    let name = first.rsplit('/').next().unwrap_or(first);
    Some(match blocked.len() {
        1 => format!("L'antivirus di Windows ha fermato «{}»: non è stato salvato. Il resto è arrivato.", name),
        n => format!("L'antivirus di Windows ha fermato {} file (fra cui «{}»): non sono stati salvati. Il resto è arrivato.", n, name),
    })
}

/// Reads the announced bytes and writes them under `dest`.
///
/// Every arrived file goes through the antivirus and is marked as coming from
/// the internet (see `fs::origin`). A file the antivirus stops is skipped
/// while still reading its bytes, so the ones after it arrive anyway.
///
/// If it is interrupted (cancelled, network down) it removes what it had started
/// writing: a half file would look good and is not.
pub(crate) fn receive_files(
    s: &mut impl Read,
    dest: &Path,
    items: &[Item],
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
) -> io::Result<Arrival> {
    let mut arrival = Arrival::default();
    let outcome = receive_files_into(s, dest, items, cancel, progress, &mut arrival);
    if outcome.is_err() {
        for c in &arrival.created {
            let _ = crate::fs::copy::remove(c);
        }
    }
    // A single file stopped by the antivirus was not really created.
    arrival.created.retain(|c| paths::extended(c).exists());
    outcome.map(|_| arrival)
}

fn receive_files_into(
    s: &mut impl Read,
    dest: &Path,
    items: &[Item],
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64),
    outcome: &mut Arrival,
) -> io::Result<()> {
    use crate::fs::origin::{is_virus, scan, Scan};
    let created = &mut outcome.created;
    std::fs::create_dir_all(paths::extended(dest))?;
    // Every top-level item gets a free name at the destination; everything
    // below it follows the chosen name.
    let mut renames: HashMap<String, String> = HashMap::new();
    let mut done = 0u64;
    let mut buf = vec![0u8; 256 * 1024];

    for v in items {
        let rel = safe_rel(&v.rel)
            .filter(|r| r.components().count() > 0)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "path non valido"))?;
        let first = rel.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned()).unwrap_or_default();
        let chosen = renames.entry(first.clone()).or_insert_with(|| {
            let n = unique_name(dest, &first);
            created.push(dest.join(&n));
            n
        });
        let mut arrival = dest.join(chosen.as_str());
        for c in rel.components().skip(1) {
            arrival.push(c);
        }

        if v.folder {
            std::fs::create_dir_all(paths::extended(&arrival))?;
            continue;
        }
        if let Some(g) = arrival.parent() {
            std::fs::create_dir_all(paths::extended(g))?;
        }
        // Without an open file the bytes are read and thrown away: the
        // antivirus stopped this one, not the ones that come after in the stream.
        let mut out = match std::fs::File::create(paths::extended(&arrival)) {
            Ok(f) => Some(f),
            Err(e) if is_virus(&e) => None,
            Err(e) => return Err(e),
        };
        let mut rest = v.size;
        while rest > 0 {
            if cancel.load(Ordering::Relaxed) {
                return Err(io::Error::new(io::ErrorKind::Interrupted, "annullato"));
            }
            let chunk = (rest as usize).min(buf.len());
            s.read_exact(&mut buf[..chunk])?;
            if let Some(f) = out.as_mut() {
                match f.write_all(&buf[..chunk]) {
                    Ok(()) => {}
                    Err(e) if is_virus(&e) => {
                        out = None;
                        let _ = std::fs::remove_file(paths::extended(&arrival));
                    }
                    Err(e) => return Err(e),
                }
            }
            rest -= chunk as u64;
            done += chunk as u64;
            progress(done);
        }
        let written = out.take().is_some();
        if !written || scan(&arrival) == Scan::Blocked {
            let _ = std::fs::remove_file(paths::extended(&arrival));
            outcome.blocked.push(v.rel.clone());
        }
    }
    Ok(())
}

/// The file can be read to send it: the antivirus is not holding it back.
fn readable(path: &Path) -> bool {
    match std::fs::File::open(paths::extended(path)) {
        Ok(_) => true,
        Err(e) => !crate::fs::origin::is_virus(&e),
    }
}

/// How many send requests can wait for an answer at once.
const MAX_PENDING: usize = 8;

/// The top-level names (in order, without duplicates) and the total bytes
/// of what a send announces, counted by the receiver.
pub(crate) fn summary(items: &[Item]) -> (Vec<String>, u64) {
    let mut top_level: Vec<String> = Vec::new();
    for v in items {
        let first = safe_rel(&v.rel)
            .and_then(|r| r.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned()));
        if let Some(p) = first.filter(|p| !top_level.contains(p)) {
            top_level.push(p);
        }
    }
    let total = items.iter().filter(|v| !v.folder).fold(0u64, |t, v| t.saturating_add(v.size));
    (top_level, total)
}

fn receive<S: Read + Write>(
    notifier: Notifier,
    lan: Arc<Lan>,
    s: &mut S,
    from: String,
    items: Vec<Item>,
    // What the sender declares: it is not used, see `summary`.
    _declared: u64,
) -> io::Result<()> {
    // All the paths are checked before asking for consent.
    if items.iter().any(|v| safe_rel(&v.rel).is_none_or(|r| r.as_os_str().is_empty())) {
        return write_json(s, &Response::error("Richiesta non valida."));
    }

    // The name and the total are decided by the sender: the consent box
    // gets what really arrives, and a name without characters disguising it.
    let (first, total) = summary(&items);
    let from = crate::friends::safe_name(&from, "PC sconosciuto");

    let id = lan.next.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    // Every pending request holds a thread for two minutes: no more than a
    // few of them pile up.
    let accepted = lan.requests.lock().is_ok_and(|mut m| {
        (m.len() < MAX_PENDING).then(|| m.insert(id, tx)).is_some()
    });
    if !accepted {
        return write_json(s, &Response::error("Il destinatario ha già troppe richieste in attesa."));
    }
    notify(
        &notifier,
        "lan-request",
        SendRequest { id, from: from.clone(), count: first.len(), total, names: first.iter().take(8).cloned().collect() },
    );

    let choice = rx.recv_timeout(CONSENT_WAIT).ok().flatten();
    if let Ok(mut m) = lan.requests.lock() {
        m.remove(&id);
    }
    let Some(dest) = choice else {
        return write_json(s, &Response::error("Il destinatario ha rifiutato."));
    };
    write_json(s, &Response { ok: true, ..Default::default() })?;

    let mut last = Instant::now();
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut m) = lan.receivings.lock() {
        m.insert(id, cancel.clone());
    }
    let outcome = receive_files(s, &dest, &items, &cancel, &mut |done| {
        if last.elapsed() >= Duration::from_millis(100) {
            last = Instant::now();
            notify(&notifier, "lan-receiving", ReceiveProgress { id, done, total });
        }
    });

    notify(
        &notifier,
        "lan-received",
        Received {
            id,
            from,
            folder: paths::display(&dest),
            count: outcome.as_ref().map(|a| a.created.len()).unwrap_or(0),
            error: if cancel.load(Ordering::Relaxed) { None } else { outcome.as_ref().err().map(|e| e.to_string()) },
            cancelled: cancel.load(Ordering::Relaxed),
            blocked: outcome.as_ref().ok().and_then(|a| blocked_notice(&a.blocked)),
        },
    );
    if let Ok(mut m) = lan.receivings.lock() {
        m.remove(&id);
    }
    Ok(())
}

// ── Lato client ──────────────────────────────────────────────────────

/// Separa `::lan\<id>\a\b` in id e path relativo `a/b`.
pub fn split(path: &str) -> Option<(String, String)> {
    let rest = path.strip_prefix(ROOT)?.strip_prefix('\\')?;
    let mut parts = rest.splitn(2, '\\');
    let id = parts.next().filter(|s| !s.is_empty())?.to_string();
    let rel = parts.next().unwrap_or("").replace('\\', "/");
    Some((id, rel))
}

/// The parent inside the lan: folder → PC → Lan.
pub fn parent_of(path: &str) -> Option<String> {
    let (id, rel) = split(path)?;
    if rel.is_empty() {
        return Some(ROOT.to_string());
    }
    match rel.rsplit_once('/') {
        Some((up, _)) => Some(format!("{}\\{}\\{}", ROOT, id, up.replace('/', "\\"))),
        None => Some(format!("{}\\{}", ROOT, id)),
    }
}

fn connect(lan: &Lan, id: &str) -> Result<TcpStream, FsError> {
    let address = lan.address(id)?;
    let s = TcpStream::connect_timeout(&address, Duration::from_secs(5)).map_err(io_error)?;
    let _ = s.set_read_timeout(Some(Duration::from_secs(30)));
    Ok(s)
}

pub(crate) fn check(r: Response) -> Result<Response, FsError> {
    if r.ok {
        Ok(r)
    } else {
        Err(FsError::Io { message: r.error.unwrap_or_else(|| "Richiesta rifiutata.".into()) })
    }
}

/// The PCs on the network as entries of the «Rete locale» location.
pub fn peer_entries(lan: &Lan) -> Vec<Entry> {
    lan.peers()
        .into_iter()
        .map(|p| Entry {
            name: p.name.clone(),
            path: format!("{}\\{}", ROOT, p.id),
            kind: EntryKind::Dir,
            size: 0,
            modified: None,
            hidden: false,
            origin: p.shared.map(|c| format!("condivide «{}»", c)),
            free: None,
            total: None,
            own_icon: false,
            snippet: None,
        })
        .collect()
}

/// The content of a folder shared by another PC.
pub fn list_remote(lan: &Lan, path: &str) -> Result<Vec<Entry>, FsError> {
    let (id, rel) = split(path).ok_or(FsError::NotFound)?;
    let mut s = connect(lan, &id)?;
    write_json(&mut s, &Request::List { path: rel }).map_err(io_error)?;
    let r = check(read_json(&mut s).map_err(io_error)?)?;
    let base = path.trim_end_matches('\\');
    Ok(r.items
        .into_iter()
        .map(|v| Entry {
            path: format!("{}\\{}", base, v.name),
            name: v.name,
            kind: if v.folder { EntryKind::Dir } else { EntryKind::File },
            size: v.size,
            modified: v.modified,
            hidden: false,
            origin: None,
            free: None,
            total: None,
            own_icon: false,
            snippet: None,
        })
        .collect())
}

/// Downloads items from another PC's shared folder into `dest`.
/// Returns the source → created path pairs.
pub fn download(
    lan: &Lan,
    sources: &[String],
    dest: &str,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<Vec<[String; 2]>, FsError> {
    let mut pairs = Vec::new();
    let mut blocked = Vec::new();
    let mut already = 0u64;
    for source in sources {
        let (id, rel) = split(source).ok_or(FsError::NotFound)?;
        let mut s = connect(lan, &id)?;
        write_json(&mut s, &Request::Download { path: rel }).map_err(io_error)?;
        let r = check(read_json(&mut s).map_err(io_error)?)?;
        let total = summary(&r.content).1;
        let arrival = receive_files(&mut s, Path::new(dest), &r.content, cancel, &mut |f| {
            progress(already.saturating_add(f), already.saturating_add(total))
        })
        .map_err(io_error)?;
        already = already.saturating_add(total);
        blocked.extend(arrival.blocked);
        if let Some(c) = arrival.created.first() {
            pairs.push([source.clone(), paths::display(c)]);
        }
    }
    match blocked_notice(&blocked) {
        Some(message) => Err(FsError::Io { message }),
        None => Ok(pairs),
    }
}

/// Sends local files to another PC. Waits for the other to accept.
pub fn send(
    lan: &Lan,
    id: &str,
    sources: &[String],
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<(), FsError> {
    let mut s = connect(lan, id)?;
    // Sources from different folders: each with its own base, in the same stream.
    let plans: Vec<(PathBuf, Vec<Item>)> = sources
        .iter()
        .map(|p| {
            let path = PathBuf::from(p);
            let base = path.parent().unwrap_or(&path).to_path_buf();
            (base, plan(&path))
        })
        .collect();
    let items: Vec<Item> = plans.iter().flat_map(|(_, v)| v.clone()).collect();
    let total: u64 = items.iter().map(|v| v.size).sum();

    write_json(&mut s, &Request::Send { from: lan.name.clone(), items, total }).map_err(io_error)?;
    // The recipient has time to read and decide.
    let _ = s.set_read_timeout(Some(CONSENT_WAIT + Duration::from_secs(5)));
    check(read_json(&mut s).map_err(io_error)?)?;

    let mut already = 0u64;
    for (base, items) in &plans {
        let part: u64 = items.iter().map(|v| v.size).sum();
        send_files(&mut s, base, items, cancel, &mut |f| progress(already + f, total)).map_err(|e| {
            use io::ErrorKind::*;
            if matches!(e.kind(), BrokenPipe | ConnectionReset | ConnectionAborted) {
                FsError::Io { message: "L'altro PC ha interrotto il trasferimento.".to_string() }
            } else {
                io_error(e)
            }
        })?;
        already += part;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn a_header_that_promises_much_and_sends_little_is_an_error() {
        // 16 MiB announced, ten bytes sent: error, without waiting or
        // setting the 16 MiB aside.
        let mut stream = (16u32 * 1024 * 1024).to_be_bytes().to_vec();
        stream.extend_from_slice(b"0123456789");
        let outcome: io::Result<Response> = read_json(&mut stream.as_slice());
        assert_eq!(outcome.unwrap_err().kind(), io::ErrorKind::UnexpectedEof);
    }

    #[test]
    fn the_consent_box_counts_what_actually_arrives() {
        let item = |rel: &str, size: u64, folder: bool| Item { rel: rel.into(), size, folder };
        // The sender declares «1 KB» and a single folder, but announces more:
        // also items with a backslash, which were not counted before.
        let items = vec![
            item("foto", 0, true),
            item("foto/a.jpg", 3_000_000, false),
            item("nascosto\\b.bin", 5_000_000_000, false),
            item("nota.txt", 10, false),
        ];
        let (first, total) = summary(&items);
        assert_eq!(first, vec!["foto", "nascosto", "nota.txt"]);
        assert_eq!(total, 5_003_000_010);
        // A sum that overflows stays at the maximum, without panicking.
        assert_eq!(summary(&[item("a", u64::MAX, false), item("b", 5, false)]).1, u64::MAX);
    }

    #[test]
    fn concurrent_connections_have_a_cap() {
        let counter = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let slots: Vec<_> = (0..MAX_CONNECTIONS).map(|_| Slot::take_slot(&counter).unwrap()).collect();
        assert!(Slot::take_slot(&counter).is_none());
        drop(slots);
        assert!(Slot::take_slot(&counter).is_some());
    }

    #[test]
    fn network_paths_do_not_leave_the_folder() {
        assert_eq!(safe_rel("a/b.txt"), Some(PathBuf::from("a").join("b.txt")));
        assert_eq!(safe_rel(""), Some(PathBuf::new()));
        assert_eq!(safe_rel("../segreto"), None);
        assert_eq!(safe_rel("a/../../x"), None);
        assert_eq!(safe_rel("C:/Windows"), None);
        assert_eq!(safe_rel("a\\..\\x"), None);
        // Names Windows reserves, and trailing dots or spaces: with the
        // \\?\ prefix they would really be created, and Explorer could not remove them.
        for bad in ["CON", "a/nul", "COM1.txt", "lpt9.log", "aux.", "x/nota.txt.", "spazio "] {
            assert_eq!(safe_rel(bad), None, "{bad}");
        }
        assert!(safe_rel("console.txt").is_some());
        assert!(safe_rel("COM10.txt").is_some());
    }

    #[test]
    fn inside_refuses_escape_attempts() {
        let d = tempdir().unwrap();
        let root = d.path().join("condivisa");
        fs::create_dir_all(root.join("sotto")).unwrap();
        fs::write(d.path().join("fuori.txt"), b"x").unwrap();

        assert!(inside(&root, "sotto").is_some());
        assert!(inside(&root, "").is_some());
        assert!(inside(&root, "../fuori.txt").is_none());
    }

    /// The hidden ones were not in the listing, but whoever knew their path
    /// downloaded them anyway (for example the Friends key in AppData).
    #[cfg(windows)]
    #[test]
    fn hidden_items_of_the_shared_folder_cannot_be_downloaded() {
        let d = tempdir().unwrap();
        let root = d.path().join("condivisa");
        let secret = root.join("AppData");
        fs::create_dir_all(&secret).unwrap();
        fs::write(secret.join("amici.key"), b"chiave").unwrap();
        fs::write(root.join("foto.jpg"), b"x").unwrap();
        let hide = std::process::Command::new("attrib").arg("+h").arg(&secret).status().unwrap();
        assert!(hide.success());

        assert!(shared_path(&root, "AppData/amici.key").is_none());
        assert!(shared_path(&root, "AppData").is_none());
        assert!(shared_path(&root, "foto.jpg").is_some());
        // Downloading the whole folder, the hidden one stays out.
        let items: Vec<String> = shared_plan(&root).into_iter().map(|v| v.rel).collect();
        assert!(items.iter().any(|r| r.ends_with("foto.jpg")));
        assert!(!items.iter().any(|r| r.contains("AppData")));
    }

    #[test]
    fn virtual_paths_split_and_go_up() {
        assert_eq!(split(r"::lan\PC-1\a\b"), Some(("PC-1".into(), "a/b".into())));
        assert_eq!(split(r"::lan\PC-1"), Some(("PC-1".into(), "".into())));
        assert_eq!(split(r"::lan"), None);
        assert_eq!(parent_of(r"::lan\PC-1\a\b"), Some(r"::lan\PC-1\a".into()));
        assert_eq!(parent_of(r"::lan\PC-1\a"), Some(r"::lan\PC-1".into()));
        assert_eq!(parent_of(r"::lan\PC-1"), Some("::lan".into()));
    }

    #[test]
    fn a_tree_round_trips_intact() {
        let d = tempdir().unwrap();
        let src = d.path().join("progetto");
        fs::create_dir_all(src.join("vuota")).unwrap();
        fs::create_dir_all(src.join("sotto")).unwrap();
        fs::write(src.join("a.txt"), b"alfa").unwrap();
        fs::write(src.join("sotto").join("b.bin"), vec![7u8; 300_000]).unwrap();

        let items = plan(&src);
        let mut stream = Vec::new();
        send_files(&mut stream, d.path(), &items, &AtomicBool::new(false), &mut |_| {}).unwrap();

        let dest = d.path().join("arrivo");
        // «progetto» does not exist at the destination: it keeps its name.
        let created = receive_files(&mut stream.as_slice(), &dest, &items, &AtomicBool::new(false), &mut |_| {}).unwrap().created;
        assert_eq!(created, vec![dest.join("progetto")]);
        assert_eq!(fs::read_to_string(dest.join("progetto").join("a.txt")).unwrap(), "alfa");
        assert_eq!(fs::read(dest.join("progetto").join("sotto").join("b.bin")).unwrap().len(), 300_000);
        assert!(dest.join("progetto").join("vuota").is_dir());

        // A second time the name is taken: it arrives numbered.
        let created = receive_files(&mut stream.as_slice(), &dest, &items, &AtomicBool::new(false), &mut |_| {}).unwrap().created;
        assert_eq!(created, vec![dest.join("progetto (2)")]);
    }

    #[test]
    fn an_interrupted_receive_leaves_no_half_files() {
        let d = tempdir().unwrap();
        let src = d.path().join("progetto");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("grande.bin"), vec![1u8; 600_000]).unwrap();
        let items = plan(&src);
        let mut stream = Vec::new();
        send_files(&mut stream, d.path(), &items, &AtomicBool::new(false), &mut |_| {}).unwrap();

        // Cancelled after the first block received.
        let dest = d.path().join("arrivo");
        let cancel = AtomicBool::new(false);
        let outcome = receive_files(&mut stream.as_slice(), &dest, &items, &cancel, &mut |_| cancel.store(true, Ordering::Relaxed));
        assert!(outcome.is_err());
        assert!(!dest.join("progetto").exists());
    }

    #[test]
    fn receiving_can_be_cancelled_by_the_receiver() {
        let dir = tempdir().unwrap();
        let lan = Lan::new("A".into(), "A".into(), Config::default(), dir.path().join("lan.json"));
        let flag = Arc::new(AtomicBool::new(false));
        lan.receivings.lock().unwrap().insert(7, flag.clone());
        assert!(lan.cancel_receive(7));
        assert!(flag.load(Ordering::Relaxed));
        assert!(!lan.cancel_receive(8));
    }

    #[test]
    fn accepting_chooses_where_to_save() {
        let dir = tempdir().unwrap();
        let received = dir.path().join("ricevuti");
        let config = Config { received: Some(received.to_string_lossy().into_owned()), ..Default::default() };
        let lan = Lan::new("A".into(), "A".into(), config, dir.path().join("lan.json"));
        let reply = |accept: bool, folder: Option<&str>| {
            let (tx, rx) = mpsc::channel();
            lan.requests.lock().unwrap().insert(1, tx);
            lan.respond(1, accept, folder.map(String::from));
            rx.recv().unwrap()
        };
        let choice = dir.path().join("eccezioni");
        assert_eq!(reply(true, Some(&choice.to_string_lossy())), Some(choice));
        // No choice, or one that is not a path on disk: the received folder.
        assert_eq!(reply(true, None), Some(received.clone()));
        assert_eq!(reply(true, Some("::amici")), Some(received.clone()));
        assert_eq!(reply(true, Some("relativa")), Some(received));
        assert_eq!(reply(false, Some(r"C:\qualsiasi")), None);
    }

    #[cfg(windows)]
    #[test]
    fn received_files_are_marked_from_internet() {
        let d = tempdir().unwrap();
        let src = d.path().join("doc.txt");
        fs::write(&src, b"testo").unwrap();
        let items = plan(&src);
        let mut stream = Vec::new();
        send_files(&mut stream, d.path(), &items, &AtomicBool::new(false), &mut |_| {}).unwrap();
        let dest = d.path().join("arrivo");
        let arrival = receive_files(&mut stream.as_slice(), &dest, &items, &AtomicBool::new(false), &mut |_| {}).unwrap();
        assert!(arrival.blocked.is_empty());
        let mut ads = dest.join("doc.txt").into_os_string();
        ads.push(":Zone.Identifier");
        assert!(fs::read_to_string(ads).unwrap().contains("ZoneId=3"));
    }

    #[test]
    fn the_blocked_notice_names_the_file() {
        assert_eq!(blocked_notice(&[]), None);
        assert!(blocked_notice(&["cartella/virus.exe".into()]).unwrap().contains("«virus.exe»"));
        assert!(blocked_notice(&["a.exe".into(), "b.exe".into()]).unwrap().contains("2 file"));
    }

    #[test]
    fn receiver_refuses_malicious_paths() {
        let d = tempdir().unwrap();
        let items = vec![Item { rel: "../evaso.txt".into(), size: 1, folder: false }];
        let error = receive_files(&mut [0u8].as_slice(), d.path(), &items, &AtomicBool::new(false), &mut |_| {});
        assert!(error.is_err());
        assert!(!d.path().parent().unwrap().join("evaso.txt").exists());
    }

    #[test]
    fn typed_addresses_go_to_the_announce_port() {
        assert_eq!(announce_address("100.64.0.2"), Some("100.64.0.2:47820".parse().unwrap()));
        assert_eq!(announce_address(" 100.64.0.2:9999 "), Some("100.64.0.2:47820".parse().unwrap()));
        assert_eq!(announce_address("localhost").map(|a| a.port()), Some(ANNOUNCE_PORT));
        assert_eq!(announce_address(""), None);
    }

    #[test]
    fn the_wire_format_keeps_its_italian_names() {
        let send = Request::Send { from: "A".into(), items: vec![Item { rel: "a".into(), size: 1, folder: false }], total: 1 };
        assert_eq!(
            serde_json::to_string(&send).unwrap(),
            r#"{"tipo":"invia","da":"A","voci":[{"rel":"a","dimensione":1,"cartella":false}],"totale":1}"#
        );
        let r = Response {
            ok: true,
            items: vec![RemoteItem { name: "n".into(), folder: true, size: 0, modified: None }],
            name: Some("B".into()),
            confirmed: true,
            ..Default::default()
        };
        assert_eq!(
            serde_json::to_string(&r).unwrap(),
            r#"{"ok":true,"voci":[{"nome":"n","cartella":true,"dimensione":0,"modificato":null}],"nome":"B","confermato":true}"#
        );
        let a = Announcement { app: "space-train".into(), v: 1, id: "i".into(), name: "N".into(), port: 2, shared: None };
        assert_eq!(
            serde_json::to_string(&a).unwrap(),
            r#"{"app":"space-train","v":1,"id":"i","nome":"N","porta":2,"condivisa":null}"#
        );
        let c = Config { visible: true, shared: None, received: None, addresses: vec![] };
        assert_eq!(serde_json::to_string(&c).unwrap(), r#"{"visibile":true,"condivisa":null,"ricevuti":null,"indirizzi":[]}"#);
    }

    #[test]
    fn a_lan_json_without_addresses_still_loads() {
        let c: Config = serde_json::from_str(r#"{"visibile":true,"condivisa":null,"ricevuti":null}"#).unwrap();
        assert!(c.addresses.is_empty());
    }

    #[test]
    fn who_announces_from_outside_gets_a_direct_reply() {
        let dir = tempdir().unwrap();
        let lan = Lan::new("A".into(), "A".into(), Config::default(), dir.path().join("lan.json"));
        lan.replies.lock().unwrap().insert("100.64.0.9".parse().unwrap(), Instant::now());
        let c = Config { addresses: vec!["100.64.0.2".into(), "100.64.0.2".into()], ..Default::default() };
        assert_eq!(
            direct_destinations(&lan, &c),
            vec!["100.64.0.2:47820".parse().unwrap(), "100.64.0.9:47820".parse().unwrap()]
        );
    }

    #[test]
    fn headers_travel_with_their_length() {
        let mut b = Vec::new();
        write_json(&mut b, &Request::List { path: "x/y".into() }).unwrap();
        let r: Request = read_json(&mut b.as_slice()).unwrap();
        assert!(matches!(r, Request::List { path } if path == "x/y"));
    }

    /// A complete «PC» inside the test: TCP server on a free port of
    /// 127.0.0.1, which accepts every send by itself if `accept` is true.
    fn test_pc(name: &str, config: Config, accept: bool) -> (Arc<Lan>, u16) {
        let dir = tempdir().unwrap().keep();
        let lan = Arc::new(Lan::new(name.into(), name.into(), config, dir.join("lan.json")));
        let for_notifier = lan.clone();
        let notifier: Notifier = Arc::new(move |event: &str, payload: serde_json::Value| {
            if event == "lan-request" {
                let id = payload["id"].as_u64().unwrap();
                let lan = for_notifier.clone();
                // Answers from another thread, as the user would.
                std::thread::spawn(move || lan.respond(id, accept, None));
            }
        });
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = server.local_addr().unwrap().port();
        start_server(notifier, lan.clone(), server);
        (lan, port)
    }

    /// Makes `who` know the PC `other`, as an announcement would have.
    fn introduce(who: &Lan, other: &Lan, port: u16) {
        let p = Peer { id: other.id.clone(), name: other.name.clone(), ip: "127.0.0.1".into(), port, shared: None };
        who.peers.lock().unwrap().insert(other.id.clone(), (p, Instant::now()));
    }

    #[test]
    fn an_announcement_does_not_steal_a_known_pc_identity() {
        let (lan, _) = test_pc("IO", Config::default(), true);
        let peers = |ip: &str| Peer { id: "SALOTTO".into(), name: "Salotto".into(), ip: ip.into(), port: 47821, shared: None };
        lan.register(peers("192.168.1.10"));
        // Another PC pretends to be «SALOTTO»: the real one stays.
        lan.register(peers("192.168.1.66"));
        assert_eq!(lan.peers()[0].ip, "192.168.1.10");
        // Announcements with ever new ids do not make the list grow without end.
        for i in 0..500 {
            lan.register(Peer { id: format!("finto{i}"), ..peers("10.0.0.1") });
        }
        assert!(lan.peers().len() <= MAX_PEERS);
    }

    #[test]
    fn two_pcs_browse_download_and_send_files() {
        let d = tempdir().unwrap();
        let shared = d.path().join("condivisa");
        fs::create_dir_all(shared.join("Foto")).unwrap();
        fs::write(shared.join("Foto").join("mare.jpg"), vec![9u8; 50_000]).unwrap();
        fs::write(shared.join("nota.txt"), b"ciao").unwrap();
        let received = d.path().join("ricevuti");

        let (server, port) = test_pc(
            "SERVER",
            Config {
                visible: true,
                shared: Some(shared.to_string_lossy().into_owned()),
                received: Some(received.to_string_lossy().into_owned()),
                ..Default::default()
            },
            true,
        );
        let (client, _) = test_pc("CLIENT", Config::default(), true);
        introduce(&client, &server, port);

        // Browses the shared root and a subfolder.
        let mut names: Vec<String> = list_remote(&client, r"::lan\SERVER")
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        names.sort();
        assert_eq!(names, vec!["Foto", "nota.txt"]);
        let photos = list_remote(&client, r"::lan\SERVER\Foto").unwrap();
        assert_eq!(photos[0].path, r"::lan\SERVER\Foto\mare.jpg");
        assert_eq!(photos[0].size, 50_000);

        // Downloads a whole folder.
        let here = d.path().join("qui");
        let pairs = download(
            &client,
            &[r"::lan\SERVER\Foto".to_string()],
            &here.to_string_lossy(),
            &AtomicBool::new(false),
            &mut |_, _| {},
        )
        .unwrap();
        assert_eq!(pairs.len(), 1);
        assert_eq!(fs::read(here.join("Foto").join("mare.jpg")).unwrap().len(), 50_000);

        // Getting out of the shared folder is not possible.
        assert!(list_remote(&client, r"::lan\SERVER\..").is_err());

        // Send: the server accepts and the files arrive in its received folder.
        let to_send = d.path().join("regalo.txt");
        fs::write(&to_send, b"per te").unwrap();
        send(
            &client,
            "SERVER",
            &[to_send.to_string_lossy().into_owned()],
            &AtomicBool::new(false),
            &mut |_, _| {},
        )
        .unwrap();
        // The receiver creates the file before writing it: wait for the
        // content, not just the name.
        let arrived = received.join("regalo.txt");
        let mut read_back = String::new();
        for _ in 0..250 {
            read_back = fs::read_to_string(&arrived).unwrap_or_default();
            if read_back == "per te" {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(read_back, "per te");
    }

    #[test]
    fn a_refused_send_leaves_nothing() {
        let d = tempdir().unwrap();
        let received = d.path().join("ricevuti");
        let (server, port) = test_pc(
            "RIFIUTA",
            Config { visible: true, received: Some(received.to_string_lossy().into_owned()), ..Default::default() },
            false,
        );
        let (client, _) = test_pc("MANDA", Config::default(), true);
        introduce(&client, &server, port);

        let f = d.path().join("x.txt");
        fs::write(&f, b"x").unwrap();
        let error = send(&client, "RIFIUTA", &[f.to_string_lossy().into_owned()], &AtomicBool::new(false), &mut |_, _| {});
        match error {
            Err(FsError::Io { message }) => assert!(message.contains("rifiutato")),
            other => panic!("should have been refused: {:?}", other),
        }
        assert!(!received.join("x.txt").exists());
    }

    #[test]
    fn a_hidden_pc_does_not_answer_and_without_a_share_cannot_be_browsed() {
        let (hidden, port_h) = test_pc("NASCOSTO", Config::default(), true);
        let (unshared, port_u) = test_pc("SENZA", Config { visible: true, ..Default::default() }, true);
        let (client, _) = test_pc("CHIEDE", Config::default(), true);
        introduce(&client, &hidden, port_h);
        introduce(&client, &unshared, port_u);

        let e = list_remote(&client, r"::lan\NASCOSTO").unwrap_err();
        assert!(format!("{:?}", e).contains("non è visibile"));
        let e = list_remote(&client, r"::lan\SENZA").unwrap_err();
        assert!(format!("{:?}", e).contains("non condivide"));
    }

    #[test]
    fn a_huge_header_is_refused() {
        let b = (u32::MAX).to_be_bytes();
        assert!(read_json::<Response>(&mut b.as_slice()).is_err());
    }
}
