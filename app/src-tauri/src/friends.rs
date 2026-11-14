//! Friends: exchanging files and folders with other PCs wherever they are,
//! without a VPN and without opening router ports.
//!
//! Every installation has an identity: a pair of cryptographic keys.
//! The public key, written in base32, is the **personal code** to give
//! to friends (also as a QR). Connections go through iroh: QUIC encrypted
//! end to end and authenticated with those keys, a direct connection
//! when the routers allow it, otherwise a relay server that only sees
//! encrypted data. Nobody can pretend to be a friend without their PC.
//!
//! A friendship counts only if confirmed by both. Whoever is not a confirmed
//! friend can only ask for the friendship: browsing the shared folder
//! and sending files stay reserved to friends, and every send must still be
//! accepted, as on the lan. The shared folder is opened friend by
//! friend.
//!
//! On top of the encrypted channel travel the same requests as on the lan
//! (`lan::Request`), served by the same code.

use crate::backup::{self, Backup, Consent, Guest};
use crate::fs::entry::{Entry, EntryKind};
use crate::fs::error::FsError;
use crate::fs::paths;
use crate::lan::{
    notify, check, io_error, read_json, send_files, plan, receive_files, write_json, serve_request,
    Notifier, Lan, Permissions, Request, Response,
};
use iroh::endpoint::{presets, Connection, RecvStream, SendStream};
use iroh::{Endpoint, EndpointId, SecretKey};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::runtime::Handle;
use tokio_util::io::SyncIoBridge;

pub const ALPN: &[u8] = b"space-train/amici/1";
pub const ROOT: &str = "::amici";
/// In front of a friend's code when they are chosen as the recipient
/// of a send, to tell them apart from a PC on the lan.
pub const SEND_PREFIX: &str = "@";

/// How often we check who is online, and retry the friendship
/// messages that have not arrived yet.
const ROUND: Duration = Duration::from_secs(20);
/// How many requests from other PCs are served at once (see `listen`).
const MAX_STREAMS: usize = 16;
/// A friend heard longer ago than this is considered offline.
const ONLINE: Duration = Duration::from_secs(50);
const CONNECT_WAIT: Duration = Duration::from_secs(15);
/// Pending friend requests accepted at most: beyond that they are ignored,
/// so nobody can fill the list by sending them in bursts.
const MAX_REQUESTS: usize = 20;

pub const EVENT: &str = "friends";
pub const REQUEST_EVENT: &str = "friend-request";
/// A friend asks to keep a backup on this PC.
pub const BACKUP_EVENT: &str = "friend-backup";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FriendState {
    /// Friends on both sides.
    #[serde(rename = "confermato")]
    Confirmed,
    /// We asked: waiting for the other to accept.
    #[serde(rename = "inviata")]
    Sent,
    /// The other asked: it is up to us to accept or refuse.
    #[serde(rename = "ricevuta")]
    Received,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    /// Their personal code.
    pub id: String,
    /// The name they introduce themselves with.
    #[serde(rename = "nome")]
    pub name: String,
    #[serde(rename = "stato")]
    pub status: FriendState,
    /// Can browse and download our shared folder.
    #[serde(default, rename = "condividi")]
    pub share: bool,
    /// The other already knows about our last step (request or confirmation).
    #[serde(default, rename = "consegnata")]
    pub delivered: bool,
    /// Our folder kept aligned on their PC.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backup: Option<Backup>,
    /// Their backup kept on our PC.
    #[serde(default, rename = "ospite", skip_serializing_if = "Option::is_none")]
    pub guest: Option<Guest>,
}

#[derive(Clone, Debug)]
pub struct FriendView {
    pub friend: Friend,
    pub online: bool,
}

impl Serialize for FriendView {
    /// The webview gets English names; `Friend`, `Backup` and `Guest` keep
    /// the Italian ones stored in `amici.json`.
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct View<'a> {
            id: &'a str,
            name: &'a str,
            status: &'static str,
            share: bool,
            delivered: bool,
            #[serde(skip_serializing_if = "Option::is_none")]
            backup: Option<BackupView<'a>>,
            #[serde(skip_serializing_if = "Option::is_none")]
            guest: Option<GuestView<'a>>,
            online: bool,
        }
        #[derive(Serialize)]
        struct BackupView<'a> {
            folder: &'a str,
            last: Option<i64>,
            attempted: Option<i64>,
            outcome: Option<&'a str>,
        }
        #[derive(Serialize)]
        struct GuestView<'a> {
            consent: &'static str,
            folder: Option<&'a str>,
            last: Option<i64>,
        }
        let f = &self.friend;
        View {
            id: &f.id,
            name: &f.name,
            status: match f.status {
                FriendState::Confirmed => "confirmed",
                FriendState::Sent => "sent",
                FriendState::Received => "received",
            },
            share: f.share,
            delivered: f.delivered,
            backup: f.backup.as_ref().map(|b| BackupView {
                folder: &b.folder,
                last: b.last,
                attempted: b.attempted,
                outcome: b.outcome.as_deref(),
            }),
            guest: f.guest.as_ref().map(|g| GuestView {
                consent: match g.consent {
                    Consent::Asked => "asked",
                    Consent::Yes => "yes",
                    Consent::No => "no",
                },
                folder: g.folder.as_deref(),
                last: g.last,
            }),
            online: self.online,
        }
        .serialize(s)
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FriendsStatus {
    /// Our personal code, to give to friends.
    pub code: String,
    /// The connection is ready: without it, friends cannot be reached.
    pub ready: bool,
    pub friends: Vec<FriendView>,
}

/// The personal code: the public key in lowercase base32.
pub fn code_of(id: &EndpointId) -> String {
    data_encoding::BASE32_NOPAD.encode(id.as_bytes()).to_lowercase()
}

/// Reads a code typed or pasted by the user: spaces, dashes and upper case
/// do not matter.
pub fn parse_code(text: &str) -> Option<EndpointId> {
    let clean: String = text.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    clean.to_lowercase().parse::<EndpointId>().ok()
}

/// The secret key, created the first time and then read from the file. It
/// never leaves the PC: it is what proves to friends that we really are us.
fn key(data_dir: &Path) -> SecretKey {
    let file = data_dir.join("amici.key");
    if let Ok(data) = std::fs::read(&file) {
        if let Ok(byte) = <[u8; 32]>::try_from(data.as_slice()) {
            return SecretKey::from_bytes(&byte);
        }
    }
    let new = SecretKey::generate();
    let _ = std::fs::create_dir_all(data_dir);
    let _ = std::fs::write(&file, new.to_bytes());
    new
}

/// A QUIC stream seen as `Read + Write`, to reuse the lan code. Used only
/// from blocking threads.
struct Stream {
    r: SyncIoBridge<RecvStream>,
    w: SyncIoBridge<SendStream>,
}

impl Stream {
    fn new(rt: &Handle, send: SendStream, recv: RecvStream) -> Self {
        Stream {
            r: SyncIoBridge::new_with_handle(recv, rt.clone()),
            w: SyncIoBridge::new_with_handle(send, rt.clone()),
        }
    }

    /// Closes the outgoing direction: on the other side the read ends.
    fn close(mut self) {
        let _ = self.w.shutdown();
    }

    /// Closes our direction and waits for the other to close theirs: only
    /// then has it read everything. Closing the connection earlier, with
    /// QUIC, can lose the last data still travelling.
    fn close_and_wait(mut self) {
        let _ = self.w.shutdown();
        let mut leftover = [0u8; 4096];
        while matches!(self.r.read(&mut leftover), Ok(n) if n > 0) {}
    }
}

impl Read for Stream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.r.read(buf)
    }
}

impl Write for Stream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.w.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.w.flush()
    }
}

#[derive(Serialize, Deserialize, Default)]
struct FriendsFile {
    #[serde(default, rename = "amici")]
    friends: Vec<Friend>,
}

pub struct Friends {
    rt: Handle,
    code: String,
    endpoint: OnceLock<Endpoint>,
    roster: Mutex<Vec<Friend>>,
    file: PathBuf,
    heard: Mutex<HashMap<String, Instant>>,
    lan: Arc<Lan>,
    notifier: Notifier,
    /// Friends whose backup is running now: one at a time each.
    syncing: Mutex<std::collections::HashSet<String>>,
}

fn error(msg: impl Into<String>) -> FsError {
    FsError::Io { message: msg.into() }
}

impl Friends {
    /// Loads identity and friends and starts the connection in the background: the
    /// app starts at once, friends become reachable as soon as it is ready.
    pub fn start(rt: Handle, data_dir: PathBuf, lan: Arc<Lan>, notifier: Notifier) -> Arc<Friends> {
        let secret = key(&data_dir);
        let file = data_dir.join("amici.json");
        let saved: FriendsFile = std::fs::read(&file)
            .ok()
            .and_then(|d| serde_json::from_slice(&d).ok())
            .unwrap_or_default();
        let friends = Arc::new(Friends {
            rt: rt.clone(),
            code: code_of(&secret.public()),
            endpoint: OnceLock::new(),
            roster: Mutex::new(saved.friends),
            file,
            heard: Mutex::new(HashMap::new()),
            lan,
            notifier,
            syncing: Mutex::new(Default::default()),
        });

        let a = friends.clone();
        rt.spawn(async move {
            let endpoint = match Endpoint::builder(presets::N0)
                .secret_key(secret)
                .alpns(vec![ALPN.to_vec()])
                .bind()
                .await
            {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("Friends: connection not started: {e}");
                    return;
                }
            };
            let _ = a.endpoint.set(endpoint.clone());
            a.announce();
            let listener = a.clone();
            tokio::spawn(async move { listener.listen(endpoint).await });
            loop {
                a.clone().round().await;
                tokio::time::sleep(ROUND).await;
            }
        });
        friends
    }

    pub fn status(&self) -> FriendsStatus {
        let heard = self.heard.lock().map(|s| s.clone()).unwrap_or_default();
        FriendsStatus {
            code: self.code.clone(),
            ready: self.endpoint.get().is_some(),
            friends: self
                .roster()
                .into_iter()
                .map(|friend| FriendView {
                    online: heard.get(&friend.id).is_some_and(|t| t.elapsed() < ONLINE),
                    friend,
                })
                .collect(),
        }
    }

    fn roster(&self) -> Vec<Friend> {
        self.roster.lock().map(|l| l.clone()).unwrap_or_default()
    }

    fn friend(&self, id: &str) -> Option<Friend> {
        self.roster().into_iter().find(|a| a.id == id)
    }

    /// Changes the list and, if something changed, saves it and notifies the
    /// windows: the periodic checks usually change nothing.
    fn modify(&self, f: impl FnOnce(&mut Vec<Friend>)) {
        let changed = match self.roster.lock() {
            Ok(mut l) => {
                let before = l.clone();
                f(&mut l);
                if *l != before {
                    let data = serde_json::to_vec_pretty(&FriendsFile { friends: l.clone() });
                    if let (Ok(d), Some(dir)) = (data, self.file.parent()) {
                        let _ = std::fs::create_dir_all(dir);
                        let _ = std::fs::write(&self.file, d);
                    }
                }
                *l != before
            }
            Err(_) => false,
        };
        if changed {
            self.announce();
        }
    }

    fn announce(&self) {
        notify(&self.notifier, EVENT, self.status());
    }

    fn heard(&self, id: &str) {
        if let Ok(mut s) = self.heard.lock() {
            s.insert(id.to_string(), Instant::now());
        }
    }

    // ── Who contacts us ───────────────────────────────────────────────

    async fn listen(self: Arc<Self>, endpoint: Endpoint) {
        // Every stream takes a thread of the blocking pool, the same as the
        // interface's commands: anyone who knew the code could open hundreds
        // and block the app. Past the cap the stream is closed.
        let slots = Arc::new(tokio::sync::Semaphore::new(MAX_STREAMS));
        while let Some(arrival) = endpoint.accept().await {
            let a = self.clone();
            let slots = slots.clone();
            tokio::spawn(async move {
                let Ok(conn) = arrival.await else { return };
                let who = code_of(&conn.remote_id());
                while let Ok((send, recv)) = conn.accept_bi().await {
                    let Ok(slot) = slots.clone().try_acquire_owned() else {
                        continue;
                    };
                    let a = a.clone();
                    let who = who.clone();
                    let rt = a.rt.clone();
                    tokio::task::spawn_blocking(move || {
                        let _slot = slot;
                        let mut s = Stream::new(&rt, send, recv);
                        if let Ok(r) = read_json::<Request>(&mut s) {
                            let _ = a.serve(&who, r, &mut s);
                        }
                        s.close();
                    });
                }
            });
        }
    }

    /// Answers a request arrived from `who`, already recognized by their
    /// key: nobody can pass themselves off as someone else.
    fn serve(&self, who: &str, request: Request, s: &mut Stream) -> io::Result<()> {
        let friend = self.friend(who);
        if friend.is_some() {
            self.heard(who);
        }
        let confirmed = friend.as_ref().is_some_and(|a| a.status == FriendState::Confirmed);
        match request {
            Request::Hello { name } => {
                if confirmed {
                    self.modify(|l| {
                        if let Some(a) = l.iter_mut().find(|a| a.id == who) {
                            a.name = safe_name(&name, &a.name);
                        }
                    });
                }
                // To someone who is not a friend we do not even say our name.
                write_json(
                    s,
                    &Response {
                        ok: true,
                        confirmed,
                        name: confirmed.then(|| self.lan.name().to_string()),
                        ..Default::default()
                    },
                )
            }
            Request::Friendship { name } => {
                let confirmed = self.receive_friendship(who, &name);
                write_json(
                    s,
                    &Response {
                        ok: true,
                        confirmed,
                        name: confirmed.then(|| self.lan.name().to_string()),
                        ..Default::default()
                    },
                )
            }
            Request::Remove => {
                self.modify(|l| l.retain(|a| a.id != who));
                write_json(s, &Response { ok: true, ..Default::default() })
            }
            Request::BackupList { folder } if confirmed => match self.host(who, &folder, &[]) {
                Ok(root) => write_json(
                    s,
                    &Response { ok: true, backup: backup::listing(&root.join(&folder)), ..Default::default() },
                ),
                Err(no) => write_json(s, &Response::error(no)),
            },
            Request::Backup { folder, items } if confirmed => {
                let root = match self.host(who, &folder, &items) {
                    Ok(r) => r,
                    Err(no) => return write_json(s, &Response::error(no)),
                };
                write_json(s, &Response { ok: true, ..Default::default() })?;
                backup::receive(s, &root, &items, &AtomicBool::new(false))?;
                self.modify(|l| {
                    if let Some(o) = l.iter_mut().find(|a| a.id == who).and_then(|a| a.guest.as_mut()) {
                        o.last = Some(backup::now());
                    }
                });
                Ok(())
            }
            other => {
                let Some(friend) = friend.filter(|_| confirmed) else {
                    return write_json(s, &Response::error("Non siete amici su Space Train."));
                };
                let permissions = Permissions { sharing: friend.share, sender: Some(friend.name.clone()) };
                serve_request(&self.notifier, &self.lan, s, other, &permissions)
            }
        }
    }

    /// Someone asks us for the friendship, or accepts ours by asking in
    /// turn. Returns true if the friendship is now confirmed.
    fn receive_friendship(&self, who: &str, name: &str) -> bool {
        let before = self.friend(who);
        match before.as_ref().map(|a| a.status) {
            Some(FriendState::Confirmed) => true,
            Some(FriendState::Sent) => {
                // We had asked: this is their confirmation.
                self.modify(|l| {
                    if let Some(a) = l.iter_mut().find(|a| a.id == who) {
                        a.status = FriendState::Confirmed;
                        a.name = safe_name(name, &a.name);
                        a.delivered = true;
                    }
                });
                true
            }
            Some(FriendState::Received) => false,
            None => {
                let pending = self.roster().iter().filter(|a| a.status == FriendState::Received).count();
                if pending >= MAX_REQUESTS {
                    return false;
                }
                let name = safe_name(name, "Sconosciuto");
                self.modify(|l| {
                    l.push(Friend {
                        id: who.to_string(),
                        name: name.clone(),
                        status: FriendState::Received,
                        share: false,
                        delivered: true,
                        backup: None,
                        guest: None,
                    })
                });
                notify(&self.notifier, REQUEST_EVENT, serde_json::json!({ "id": who, "name": name }));
                false
            }
        }
    }

    /// Where `who`'s backup goes, if we keep it. The first time they ask,
    /// the answer is «wait»: the user says yes or no from Friends.
    fn host(&self, who: &str, folder: &str, items: &[backup::BackupItem]) -> Result<PathBuf, String> {
        if !backup::valid_items(folder, items) {
            return Err("Richiesta non valida.".into());
        }
        let mine = self.lan.name().to_string();
        let guest = self.friend(who).and_then(|a| a.guest);
        match guest.as_ref().map(|o| o.consent) {
            Some(Consent::Yes) => guest
                .and_then(|o| o.folder)
                .map(PathBuf::from)
                .ok_or_else(|| "Cartella di backup non impostata.".into()),
            Some(Consent::No) => Err(format!("{mine} non tiene backup per te.")),
            Some(Consent::Asked) => Err(format!("In attesa che {mine} accetti il backup.")),
            None => {
                let name = self.friend(who).map(|a| a.name).unwrap_or_default();
                self.modify(|l| {
                    if let Some(a) = l.iter_mut().find(|a| a.id == who) {
                        a.guest = Some(Guest { consent: Consent::Asked, folder: None, last: None });
                    }
                });
                notify(&self.notifier, BACKUP_EVENT, serde_json::json!({ "id": who, "name": name }));
                Err(format!("In attesa che {mine} accetti il backup."))
            }
        }
    }

    /// Yes or no to a friend who wants to keep a backup here. Without a
    /// folder it goes to «Backup di <name>» in the received-files folder.
    pub fn answer_backup(&self, id: &str, yes: bool, folder: Option<String>) {
        let default_folder = self
            .friend(id)
            .map(|a| paths::display(&self.lan.received_folder().join(format!("Backup di {}", a.name))));
        self.modify(|l| {
            if let Some(a) = l.iter_mut().find(|a| a.id == id) {
                let last = a.guest.as_ref().and_then(|o| o.last);
                a.guest = Some(if yes {
                    Guest { consent: Consent::Yes, folder: folder.or(default_folder), last }
                } else {
                    Guest { consent: Consent::No, folder: None, last }
                });
            }
        });
    }

    /// Starts or stops keeping `folder` aligned on the friend's PC.
    pub fn set_backup(&self, id: &str, folder: Option<String>) {
        self.modify(|l| {
            if let Some(a) = l.iter_mut().find(|a| a.id == id) {
                a.backup = folder.map(|folder| Backup { folder, last: None, attempted: None, outcome: None });
            }
        });
    }

    /// Sends the friend what changed in our backup folder. What happened
    /// also stays on the friend, for the Friends window.
    pub fn sync(&self, id: &str) -> Result<String, FsError> {
        let Some(b) = self.friend(id).and_then(|a| a.backup) else {
            return Err(error("Nessun backup verso questo amico."));
        };
        if !self.syncing.lock().is_ok_and(|mut g| g.insert(id.to_string())) {
            return Err(error("Il backup è già in corso."));
        }
        let outcome = self.sync_now(id, &b.folder);
        if let Ok(mut g) = self.syncing.lock() {
            g.remove(id);
        }
        let now = backup::now();
        self.modify(|l| {
            if let Some(x) = l.iter_mut().find(|a| a.id == id).and_then(|a| a.backup.as_mut()) {
                x.attempted = Some(now);
                match &outcome {
                    Ok(m) => {
                        x.last = Some(now);
                        x.outcome = Some(m.clone());
                    }
                    Err(e) => x.outcome = Some(backup::text(e)),
                }
            }
        });
        outcome
    }

    fn sync_now(&self, id: &str, folder: &str) -> Result<String, FsError> {
        let root = PathBuf::from(folder);
        let name = root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .ok_or_else(|| error("Cartella di backup non valida."))?;
        if !paths::extended(&root).is_dir() {
            return Err(error(format!("La cartella «{name}» non esiste più.")));
        }
        let remote = self.with_stream(id, |s| {
            write_json(s, &Request::BackupList { folder: name.clone() }).map_err(io_error)?;
            check(read_json(s).map_err(io_error)?).map(|r| r.backup)
        })?;
        let items = backup::to_send(&backup::listing(&root), &remote);
        if items.is_empty() {
            return Ok("già allineata".into());
        }
        let base = root.parent().unwrap_or(&root).to_path_buf();
        self.with_stream(id, |s| {
            write_json(s, &Request::Backup { folder: name.clone(), items: items.clone() }).map_err(io_error)?;
            check(read_json(s).map_err(io_error)?)?;
            send_files(s, &base, &backup::as_items(&items), &AtomicBool::new(false), &mut |_| {}).map_err(io_error)
        })?;
        Ok(if items.len() == 1 { "1 file".into() } else { format!("{} file", items.len()) })
    }

    // ── Us contacting the others ──────────────────────────────────────

    async fn connect(&self, id: &str) -> Result<Connection, FsError> {
        let endpoint = self
            .endpoint
            .get()
            .ok_or_else(|| error("La connessione con gli amici non è ancora pronta: riprova fra poco."))?;
        let key = parse_code(id).ok_or_else(|| error("Codice non valido."))?;
        match tokio::time::timeout(CONNECT_WAIT, endpoint.connect(key, ALPN)).await {
            Ok(Ok(c)) => Ok(c),
            _ => Err(error("Amico non raggiungibile: forse ha Space Train chiuso o è offline.")),
        }
    }

    /// Opens a stream to a friend and runs `work` on it. To be called
    /// outside the runtime (from a blocking thread): it waits for the
    /// connection and then works with ordinary reads and writes.
    fn with_stream<T>(&self, id: &str, work: impl FnOnce(&mut Stream) -> Result<T, FsError>) -> Result<T, FsError> {
        let (conn, send, recv) = self.rt.block_on(async {
            let conn = self.connect(id).await?;
            let (send, recv) = conn
                .open_bi()
                .await
                .map_err(|e| error(format!("Collegamento interrotto: {e}")))?;
            Ok::<_, FsError>((conn, send, recv))
        })?;
        let mut s = Stream::new(&self.rt, send, recv);
        let outcome = work(&mut s);
        s.close_and_wait();
        drop(conn);
        if outcome.is_ok() {
            self.heard(id);
        }
        outcome
    }

    /// A short request with its response.
    fn ask(&self, id: &str, r: &Request) -> Result<Response, FsError> {
        self.with_stream(id, |s| {
            write_json(s, r).map_err(io_error)?;
            read_json(s).map_err(io_error)
        })
    }

    /// Adds a friend from their code and sends them the request. If they are
    /// not reachable now, it is sent again until it arrives.
    pub fn add(&self, code: &str) -> Result<(), FsError> {
        let id = parse_code(code)
            .map(|k| code_of(&k))
            .ok_or_else(|| error("Codice non valido: controlla di averlo copiato intero."))?;
        if id == self.code {
            return Err(error("Questo è il tuo codice: serve quello dell'amico."));
        }
        match self.friend(&id).map(|a| a.status) {
            Some(FriendState::Received) => return self.accept(&id),
            Some(_) => return Ok(()),
            None => {}
        }
        let placeholder = format!("Amico {}", &id[..6]);
        self.modify(|l| {
            l.push(Friend {
                id: id.clone(),
                name: placeholder,
                status: FriendState::Sent,
                share: false,
                delivered: false,
                backup: None,
                guest: None,
            })
        });
        let _ = self.deliver(&id);
        Ok(())
    }

    /// Accepts a received request.
    pub fn accept(&self, id: &str) -> Result<(), FsError> {
        self.modify(|l| {
            if let Some(a) = l.iter_mut().find(|a| a.id == id) {
                a.status = FriendState::Confirmed;
                a.delivered = false;
            }
        });
        let _ = self.deliver(id);
        Ok(())
    }

    /// Removes a friend, or refuses their request. They are told if they
    /// are reachable; otherwise for them it will stay pending, without being
    /// able to do anything.
    pub fn remove(&self, id: &str) -> Result<(), FsError> {
        self.modify(|l| l.retain(|a| a.id != id));
        let _ = self.ask(id, &Request::Remove);
        Ok(())
    }

    pub fn share(&self, id: &str, yes: bool) {
        self.modify(|l| {
            if let Some(a) = l.iter_mut().find(|a| a.id == id) {
                a.share = yes;
            }
        });
    }

    /// Lets the other know our request or our confirmation.
    fn deliver(&self, id: &str) -> Result<(), FsError> {
        let r = self.ask(id, &Request::Friendship { name: self.lan.name().to_string() })?;
        self.modify(|l| {
            if let Some(a) = l.iter_mut().find(|a| a.id == id) {
                a.delivered = true;
                if r.confirmed {
                    a.status = FriendState::Confirmed;
                }
                if let Some(n) = &r.name {
                    a.name = safe_name(n, &a.name);
                }
            }
        });
        Ok(())
    }

    /// A round over all the friends: who is online, and the requests or
    /// confirmations that had not arrived yet.
    async fn round(self: Arc<Self>) {
        let roster = self.roster();
        let mut jobs = Vec::new();
        for friend in roster.into_iter().filter(|a| a.status != FriendState::Received) {
            let a = self.clone();
            jobs.push(tokio::task::spawn_blocking(move || {
                if !friend.delivered {
                    let _ = a.deliver(&friend.id);
                    return;
                }
                let Ok(r) = a.ask(&friend.id, &Request::Hello { name: a.lan.name().to_string() }) else {
                    return;
                };
                a.modify(|l| {
                    if let Some(x) = l.iter_mut().find(|x| x.id == friend.id) {
                        if let Some(n) = &r.name {
                            x.name = safe_name(n, &x.name);
                        }
                        // To them we are no longer friends (they removed us while we were
                        // off): back to waiting for their confirmation.
                        if x.status == FriendState::Confirmed && !r.confirmed {
                            x.status = FriendState::Sent;
                        } else if x.status == FriendState::Sent && r.confirmed {
                            x.status = FriendState::Confirmed;
                        }
                    }
                });
                // Online and still a friend: time for the daily backup?
                if r.confirmed && friend.backup.as_ref().is_some_and(|b| backup::due(b, backup::now())) {
                    let _ = a.sync(&friend.id);
                }
            }));
        }
        for l in jobs {
            let _ = l.await;
        }
        self.announce();
    }

    // ── Shared folders and sends ──────────────────────────────────────

    /// The confirmed friends as entries of the «Amici» location.
    pub fn items(&self) -> Vec<Entry> {
        self.status()
            .friends
            .into_iter()
            .filter(|v| v.friend.status == FriendState::Confirmed)
            .map(|v| Entry {
                name: v.friend.name.clone(),
                path: format!("{}\\{}", ROOT, v.friend.id),
                kind: EntryKind::Dir,
                size: 0,
                modified: None,
                hidden: false,
                origin: Some(if v.online { "In linea".to_string() } else { "Non in linea".to_string() }),
                free: None,
                total: None,
                own_icon: false,
                snippet: None,
            })
            .collect()
    }

    /// The content of the folder a friend shares with us.
    pub fn list(&self, path: &str) -> Result<Vec<Entry>, FsError> {
        let (id, rel) = split(path).ok_or(FsError::NotFound)?;
        let r = self.with_stream(&id, |s| {
            write_json(s, &Request::List { path: rel }).map_err(io_error)?;
            check(read_json(s).map_err(io_error)?)
        })?;
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

    /// Downloads items of the folder shared by a friend into `dest`.
    pub fn download(
        &self,
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
            let (arrival, total) = self.with_stream(&id, |s| {
                write_json(s, &Request::Download { path: rel }).map_err(io_error)?;
                let r = check(read_json(s).map_err(io_error)?)?;
                // The sizes are sent by the other PC: the sum must not overflow.
                let total = crate::lan::summary(&r.content).1;
                let arrival = receive_files(s, Path::new(dest), &r.content, cancel, &mut |f| {
                    progress(already.saturating_add(f), already.saturating_add(total))
                })
                .map_err(io_error)?;
                Ok((arrival, total))
            })?;
            already = already.saturating_add(total);
            blocked.extend(arrival.blocked);
            if let Some(c) = arrival.created.first() {
                pairs.push([source.clone(), paths::display(c)]);
            }
        }
        match crate::lan::blocked_notice(&blocked) {
            Some(message) => Err(FsError::Io { message }),
            None => Ok(pairs),
        }
    }

    /// Sends files to a friend. Waits for them to accept, as on the lan.
    pub fn send(
        &self,
        id: &str,
        sources: &[String],
        cancel: &AtomicBool,
        progress: &mut dyn FnMut(u64, u64),
    ) -> Result<(), FsError> {
        let plans: Vec<(PathBuf, Vec<crate::lan::Item>)> = sources
            .iter()
            .map(|p| {
                let path = PathBuf::from(p);
                let base = path.parent().unwrap_or(&path).to_path_buf();
                (base, plan(&path))
            })
            .collect();
        let items: Vec<_> = plans.iter().flat_map(|(_, v)| v.clone()).collect();
        let total: u64 = items.iter().map(|v| v.size).sum();
        let name = self.lan.name().to_string();
        self.with_stream(id, |s| {
            write_json(s, &Request::Send { from: name, items, total }).map_err(io_error)?;
            check(read_json(s).map_err(io_error)?)?;
            let mut already = 0u64;
            for (base, items) in &plans {
                let part: u64 = items.iter().map(|v| v.size).sum();
                send_files(s, base, items, cancel, &mut |f| progress(already + f, total)).map_err(|e| {
                    use io::ErrorKind::*;
                    if matches!(e.kind(), BrokenPipe | ConnectionReset | ConnectionAborted) {
                        error("L'amico ha interrotto il trasferimento.")
                    } else {
                        io_error(e)
                    }
                })?;
                already += part;
            }
            s.flush().map_err(io_error)
        })
    }
}

/// A name received from outside, cleaned up: no control characters and no
/// exaggerated lengths. Empty, the previous one stays.
pub(crate) fn safe_name(name: &str, fallback: &str) -> String {
    // Also out: the invisible marks that flip the text direction (U+202E
    // and the like): with them «gpj.exe» reads «exe.jpg».
    let invisible = |c: &char| {
        matches!(*c, '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' | '\u{061c}' | '\u{feff}')
    };
    let clean: String = name.chars().filter(|c| !c.is_control() && !invisible(c)).take(40).collect();
    let clean = clean.trim();
    if clean.is_empty() {
        fallback.to_string()
    } else {
        clean.to_string()
    }
}

/// Splits `::amici\<code>\a\b` into the code and the relative path `a/b`.
pub fn split(path: &str) -> Option<(String, String)> {
    let rest = path.strip_prefix(ROOT)?.strip_prefix('\\')?;
    let mut parts = rest.splitn(2, '\\');
    let id = parts.next().filter(|s| !s.is_empty())?.to_string();
    let rel = parts.next().unwrap_or("").replace('\\', "/");
    Some((id, rel))
}

/// The parent among friends: folder → friend → Friends.
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

/// The QR code of the personal code, as an SVG to show.
pub fn qr(text: &str) -> Result<String, FsError> {
    let code = qrcode::QrCode::new(text.as_bytes()).map_err(|e| error(e.to_string()))?;
    Ok(code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(200, 200)
        .quiet_zone(true)
        .build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_code_is_read_even_when_badly_typed() {
        let k = SecretKey::generate().public();
        let c = code_of(&k);
        assert_eq!(c.len(), 52);
        assert_eq!(parse_code(&c), Some(k));
        // In groups, with spaces and upper case, as copied from a message.
        let grouped: String = c
            .to_uppercase()
            .chars()
            .collect::<Vec<_>>()
            .chunks(4)
            .map(|g| g.iter().collect::<String>())
            .collect::<Vec<_>>()
            .join(" - ");
        assert_eq!(parse_code(&grouped), Some(k));
        assert_eq!(parse_code("non è un codice"), None);
    }

    #[test]
    fn friend_paths_split_and_go_up() {
        assert_eq!(split(r"::amici\abc\Foto\mare"), Some(("abc".into(), "Foto/mare".into())));
        assert_eq!(parent_of(r"::amici\abc\Foto"), Some(r"::amici\abc".into()));
        assert_eq!(parent_of(r"::amici\abc"), Some("::amici".into()));
        assert_eq!(split("::amici"), None);
    }

    #[test]
    fn names_from_outside_are_cleaned() {
        assert_eq!(safe_name("  Anna\n\u{7}  ", "x"), "Anna");
        assert_eq!(safe_name("   ", "prima"), "prima");
        assert_eq!(safe_name(&"a".repeat(100), "x").len(), 40);
        assert_eq!(safe_name("Anna\u{202e}gpj.exe", "x"), "Annagpj.exe");
    }

    #[test]
    fn amici_json_keeps_its_italian_keys_and_the_webview_gets_english_ones() {
        let stored = r#"{"amici":[{"id":"x","nome":"Anna","stato":"confermato","condividi":true,"consegnata":false,"backup":{"cartella":"C:\\F","ultimo":1,"tentato":2,"esito":"ok"},"ospite":{"consenso":"si","cartella":null,"ultimo":null}}]}"#;
        let f: FriendsFile = serde_json::from_str(stored).unwrap();
        assert_eq!(serde_json::to_string(&f).unwrap(), stored);
        let view = FriendView { friend: f.friends[0].clone(), online: true };
        assert_eq!(
            serde_json::to_string(&view).unwrap(),
            r#"{"id":"x","name":"Anna","status":"confirmed","share":true,"delivered":false,"backup":{"folder":"C:\\F","last":1,"attempted":2,"outcome":"ok"},"guest":{"consent":"yes","folder":null,"last":null},"online":true}"#
        );
    }

    #[test]
    fn the_qr_code_is_an_svg() {
        let svg = qr("abcdefgh").unwrap();
        assert!(svg.starts_with("<?xml") || svg.contains("<svg"));
    }

    /// A PC with Space Train inside the test, which accepts every send by itself.
    fn test_pc(rt: &tokio::runtime::Runtime, name: &str, shared: Option<&Path>) -> (Arc<Friends>, PathBuf) {
        let dir = tempfile::tempdir().unwrap().keep();
        let config = crate::lan::Config {
            shared: shared.map(|p| p.to_string_lossy().into_owned()),
            received: Some(dir.join("ricevuti").to_string_lossy().into_owned()),
            ..Default::default()
        };
        let lan = Arc::new(Lan::new(name.into(), name.into(), config, dir.join("lan.json")));
        let for_notifier = lan.clone();
        let notifier: Notifier = Arc::new(move |event: &str, payload: serde_json::Value| {
            if event == "lan-request" {
                let id = payload["id"].as_u64().unwrap();
                let lan = for_notifier.clone();
                std::thread::spawn(move || lan.respond(id, true, None));
            }
        });
        let friends = Friends::start(rt.handle().clone(), dir.clone(), lan, notifier);
        (friends, dir.join("ricevuti"))
    }

    fn wait_for(what: &str, mut f: impl FnMut() -> bool) {
        let start = Instant::now();
        while !f() {
            assert!(start.elapsed() < Duration::from_secs(60), "waited too long for: {what}");
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    /// Two PCs become friends, browse each other, download and send files,
    /// then one removes the other. It really goes through the internet: run
    /// it by hand with `cargo test --lib friends -- --ignored`.
    #[test]
    #[ignore = "usa internet"]
    fn two_friends_over_the_internet() {
        let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        let d = tempfile::tempdir().unwrap();
        let shared = d.path().join("condivisa");
        std::fs::create_dir_all(shared.join("Foto")).unwrap();
        std::fs::write(shared.join("Foto").join("mare.jpg"), vec![7u8; 300_000]).unwrap();
        let (anna, received_anna) = test_pc(&rt, "Anna", Some(&shared));
        let (bruno, _) = test_pc(&rt, "Bruno", None);
        wait_for("connections ready", || anna.status().ready && bruno.status().ready);
        // Time to publish where we are, as at app startup.
        for a in [&anna, &bruno] {
            let e = a.endpoint.get().unwrap().clone();
            rt.block_on(async { tokio::time::timeout(Duration::from_secs(30), e.online()).await.unwrap() });
        }

        // Anna asks, Bruno sees the request and accepts.
        anna.add(&bruno.status().code).unwrap();
        let code_anna = anna.status().code;
        wait_for("request arrived", || bruno.friend(&code_anna).is_some_and(|a| a.status == FriendState::Received));
        assert_eq!(bruno.friend(&code_anna).unwrap().name, "Anna");
        // Before the confirmation, no folder and no sends.
        assert!(bruno.list(&format!("{ROOT}\\{code_anna}")).is_err());
        bruno.accept(&code_anna).unwrap();
        let code_bruno = bruno.status().code;
        assert_eq!(anna.friend(&code_bruno).unwrap().status, FriendState::Confirmed);
        assert_eq!(anna.friend(&code_bruno).unwrap().name, "Bruno");

        // The folder is visible only after Anna shares it with Bruno.
        let root = format!("{ROOT}\\{code_anna}");
        assert!(bruno.list(&root).is_err());
        anna.share(&code_bruno, true);
        let items = bruno.list(&root).unwrap();
        assert_eq!(items.iter().map(|v| v.name.as_str()).collect::<Vec<_>>(), ["Foto"]);
        let dest = d.path().join("scaricati");
        std::fs::create_dir_all(&dest).unwrap();
        bruno
            .download(&[format!("{root}\\Foto")], &dest.to_string_lossy(), &AtomicBool::new(false), &mut |_, _| {})
            .unwrap();
        assert_eq!(std::fs::read(dest.join("Foto").join("mare.jpg")).unwrap().len(), 300_000);

        // Bruno sends a file to Anna, who accepts it.
        let file = d.path().join("lettera.txt");
        std::fs::write(&file, b"ciao Anna").unwrap();
        bruno
            .send(&code_anna, &[file.to_string_lossy().into_owned()], &AtomicBool::new(false), &mut |_, _| {})
            .unwrap();
        assert_eq!(std::fs::read(received_anna.join("lettera.txt")).unwrap(), b"ciao Anna");

        // Backup: Anna keeps «Foto» on Bruno's PC. The first time Bruno is
        // asked; once he says yes, only what changed travels.
        let photos = shared.join("Foto").to_string_lossy().into_owned();
        anna.set_backup(&code_bruno, Some(photos));
        assert!(anna.sync(&code_bruno).unwrap_err() == error("In attesa che Bruno accetti il backup."));
        assert_eq!(bruno.friend(&code_anna).unwrap().guest.unwrap().consent, Consent::Asked);
        let copy = d.path().join("backup di anna");
        bruno.answer_backup(&code_anna, true, Some(copy.to_string_lossy().into_owned()));
        assert_eq!(anna.sync(&code_bruno).unwrap(), "1 file");
        assert_eq!(std::fs::read(copy.join("Foto").join("mare.jpg")).unwrap().len(), 300_000);
        assert_eq!(anna.sync(&code_bruno).unwrap(), "già allineata");
        std::fs::write(shared.join("Foto").join("monti.jpg"), b"nuova").unwrap();
        assert_eq!(anna.sync(&code_bruno).unwrap(), "1 file");
        assert_eq!(anna.friend(&code_bruno).unwrap().backup.unwrap().outcome.as_deref(), Some("1 file"));

        // Bruno removes Anna: she knows right away, and he no longer sees anything.
        bruno.remove(&code_anna).unwrap();
        assert!(anna.friend(&code_bruno).is_none());
        assert!(anna.send(&code_bruno, &[file.to_string_lossy().into_owned()], &AtomicBool::new(false), &mut |_, _| {}).is_err());
    }

    #[test]
    fn the_key_stays_the_same_across_restarts() {
        let d = tempfile::tempdir().unwrap();
        let before = key(d.path()).public();
        let after = key(d.path()).public();
        assert_eq!(before, after);
    }
}
