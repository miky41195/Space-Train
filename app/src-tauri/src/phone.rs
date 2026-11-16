//! Files to and from a phone through its browser, with no app on the phone.
//!
//! While the «Invia al telefono» dialog is open a small HTTP server listens
//! on the local network. Its address carries a random 128-bit token, shown
//! only as the QR on screen: without it every request gets 404. The phone
//! downloads the chosen files and can upload its own; those wait in a
//! staging folder until the user keeps them (into the received folder,
//! through the antivirus like every file from the network) or throws them
//! away. Closing the dialog stops the server and throws away what was not
//! kept. Plain HTTP: the same trust as the lan sharing, documented.

use crate::fs::copy::unique_name;
use crate::fs::error::FsError;
use crate::fs::paths;
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::Channel;

const MAX_HEAD: usize = 16 * 1024;
const MAX_UPLOAD: u64 = 16 * 1024 * 1024 * 1024;
const MAX_UPLOADS: usize = 1000;
const MAX_CONNECTIONS: usize = 16;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PhoneEvent {
    /// The phone opened the page.
    Visit,
    Downloaded { name: String },
    /// A file arrived and waits for the user's choice.
    Upload { id: usize, name: String, size: u64 },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneLink {
    pub url: String,
    /// The QR of the address, as SVG.
    pub qr: String,
    /// The same page through Tailscale, reachable away from home, when it is on.
    pub remote_url: Option<String>,
    pub remote_qr: Option<String>,
}

struct Staged {
    name: String,
    path: PathBuf,
}

struct Shared {
    token: String,
    files: Vec<PathBuf>,
    texts: HashMap<String, String>,
    staging: PathBuf,
    staged: Mutex<HashMap<usize, Staged>>,
    next_id: AtomicUsize,
    connections: AtomicUsize,
    visited: AtomicBool,
    events: Box<dyn Fn(PhoneEvent) + Send + Sync>,
}

struct Session {
    stop: Arc<AtomicBool>,
    shared: Arc<Shared>,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

fn io(e: impl std::fmt::Display) -> FsError {
    FsError::Io { message: e.to_string() }
}

/// The address this PC uses on the local network: the interface a packet
/// to the outside would leave from. Nothing is sent.
fn lan_ip() -> Option<std::net::IpAddr> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("192.168.1.1:9").ok()?;
    let ip = s.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then_some(ip)
}

/// Tailscale's addresses: 100.64.0.0/10.
fn is_tailscale(ip: std::net::IpAddr) -> bool {
    matches!(ip, std::net::IpAddr::V4(v) if v.octets()[0] == 100 && v.octets()[1] & 0xC0 == 64)
}

/// This PC's Tailscale address, if Tailscale is on: the interface that
/// would reach Tailscale's own resolver. Without it the route goes through
/// the home router and the address is not a Tailscale one.
fn tailscale_ip() -> Option<std::net::IpAddr> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("100.100.100.100:53").ok()?;
    let ip = s.local_addr().ok()?.ip();
    is_tailscale(ip).then_some(ip)
}

fn token() -> String {
    use chacha20poly1305::aead::{rand_core::RngCore, OsRng};
    let mut b = [0u8; 16];
    OsRng.fill_bytes(&mut b);
    data_encoding::BASE32_NOPAD.encode(&b).to_lowercase()
}

/// Starts the server for `files`, stopping a previous one. `texts` are the
/// phone page's words, in the interface language.
pub fn start(
    files: Vec<String>,
    texts: HashMap<String, String>,
    events: Box<dyn Fn(PhoneEvent) + Send + Sync>,
) -> Result<PhoneLink, FsError> {
    stop();
    let ip = lan_ip().ok_or_else(|| io("Questo PC non è collegato a una rete locale."))?;
    let listener = TcpListener::bind(("0.0.0.0", 0)).map_err(io)?;
    listener.set_nonblocking(true).map_err(io)?;
    let port = listener.local_addr().map_err(io)?.port();
    let token = token();
    let staging = std::env::temp_dir().join("space-train-phone").join(&token);
    let shared = Arc::new(Shared {
        token: token.clone(),
        files: files.into_iter().map(PathBuf::from).collect(),
        texts,
        staging,
        staged: Mutex::new(HashMap::new()),
        next_id: AtomicUsize::new(1),
        connections: AtomicUsize::new(0),
        visited: AtomicBool::new(false),
        events,
    });
    let stop_flag = Arc::new(AtomicBool::new(false));
    {
        let (stop_flag, shared) = (stop_flag.clone(), shared.clone());
        std::thread::spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        if shared.connections.load(Ordering::Relaxed) >= MAX_CONNECTIONS {
                            continue;
                        }
                        shared.connections.fetch_add(1, Ordering::Relaxed);
                        let shared = shared.clone();
                        std::thread::spawn(move || {
                            let _ = serve(stream, &shared);
                            shared.connections.fetch_sub(1, Ordering::Relaxed);
                        });
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(100)),
                }
            }
        });
    }
    let url = format!("http://{}/{}/", std::net::SocketAddr::new(ip, port), token);
    let qr = crate::friends::qr(&url)?;
    let remote_url = tailscale_ip().filter(|t| *t != ip).map(|t| format!("http://{}/{}/", std::net::SocketAddr::new(t, port), token));
    let remote_qr = remote_url.as_deref().map(crate::friends::qr).transpose()?;
    *SESSION.lock().unwrap() = Some(Session { stop: stop_flag, shared });
    Ok(PhoneLink { url, qr, remote_url, remote_qr })
}

/// Stops the server and throws away the files not kept.
pub fn stop() {
    if let Some(s) = SESSION.lock().unwrap().take() {
        s.stop.store(true, Ordering::Relaxed);
        let _ = std::fs::remove_dir_all(&s.shared.staging);
    }
}

fn take_staged(id: usize) -> Option<Staged> {
    SESSION.lock().unwrap().as_ref()?.shared.staged.lock().unwrap().remove(&id)
}

/// Moves an uploaded file into `dest`, through the antivirus. Returns where it went.
pub fn keep(id: usize, dest: &Path) -> Result<String, FsError> {
    let s = take_staged(id).ok_or(FsError::NotFound)?;
    std::fs::create_dir_all(paths::extended(dest)).map_err(io)?;
    let to = dest.join(unique_name(dest, &s.name));
    if std::fs::rename(&s.path, paths::extended(&to)).is_err() {
        std::fs::copy(&s.path, paths::extended(&to)).map_err(io)?;
        let _ = std::fs::remove_file(&s.path);
    }
    match crate::fs::origin::scan(&to) {
        crate::fs::origin::Scan::Clean => Ok(paths::display(&to)),
        crate::fs::origin::Scan::Blocked => Err(io(format!("L'antivirus ha bloccato «{}».", s.name))),
    }
}

pub fn discard(id: usize) {
    if let Some(s) = take_staged(id) {
        let _ = std::fs::remove_file(s.path);
    }
}

/// A file name sent by the phone, made safe: last component only, no
/// control or direction-flipping characters, a valid Windows name.
fn clean_name(raw: &str) -> String {
    let last = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let invisible = |c: &char| matches!(*c, '\u{200b}'..='\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' | '\u{061c}' | '\u{feff}');
    let name: String = last.chars().filter(|c| !c.is_control() && !invisible(c)).take(200).collect();
    let name = name.trim().trim_end_matches(['.', ' ']).to_string();
    if crate::fs::names::validate_name(&name).is_ok() {
        name
    } else {
        "file".into()
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push(h << 4 | l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn respond(s: &mut TcpStream, status: &str, kind: &str, body: &[u8]) -> std::io::Result<()> {
    write!(
        s,
        "HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    )?;
    s.write_all(body)
}

struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
}

fn read_head(r: &mut impl BufRead) -> Option<Request> {
    let mut head = String::new();
    let mut total = 0;
    let mut first = String::new();
    total += r.read_line(&mut first).ok()?;
    let mut parts = first.split_whitespace();
    let (method, path) = (parts.next()?.to_string(), parts.next()?.to_string());
    let mut headers = HashMap::new();
    loop {
        head.clear();
        let n = r.read_line(&mut head).ok()?;
        total += n;
        if n == 0 || total > MAX_HEAD {
            return None;
        }
        let line = head.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    Some(Request { method, path, headers })
}

fn serve(stream: TcpStream, sh: &Shared) -> std::io::Result<()> {
    stream.set_nonblocking(false)?;
    stream.set_read_timeout(Some(Duration::from_secs(30)))?;
    let mut out = stream.try_clone()?;
    let mut r = BufReader::new(stream);
    let Some(req) = read_head(&mut r) else {
        return respond(&mut out, "400 Bad Request", "text/plain", b"");
    };
    let prefix = format!("/{}/", sh.token);
    let rest = if req.path == prefix.trim_end_matches('/') { Some("") } else { req.path.strip_prefix(&prefix) };
    let Some(rest) = rest else {
        return respond(&mut out, "404 Not Found", "text/plain", b"");
    };

    match (req.method.as_str(), rest) {
        ("GET", "") => {
            if !sh.visited.swap(true, Ordering::Relaxed) {
                (sh.events)(PhoneEvent::Visit);
            }
            respond(&mut out, "200 OK", "text/html; charset=utf-8", page(sh).as_bytes())
        }
        ("GET", f) if f.starts_with("f/") => {
            let Some(path) = f[2..].parse::<usize>().ok().and_then(|i| sh.files.get(i)) else {
                return respond(&mut out, "404 Not Found", "text/plain", b"");
            };
            let mut file = std::fs::File::open(paths::extended(path))?;
            let len = file.metadata()?.len();
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let encoded: String = name.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect();
            write!(
                out,
                "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {len}\r\nContent-Disposition: attachment; filename*=UTF-8''{encoded}\r\nConnection: close\r\n\r\n"
            )?;
            std::io::copy(&mut file, &mut out)?;
            (sh.events)(PhoneEvent::Downloaded { name });
            Ok(())
        }
        ("POST", "up") => {
            let size: u64 = match req.headers.get("content-length").and_then(|v| v.parse().ok()) {
                Some(n) if n <= MAX_UPLOAD => n,
                _ => return respond(&mut out, "411 Length Required", "text/plain", b""),
            };
            if sh.staged.lock().unwrap().len() >= MAX_UPLOADS {
                return respond(&mut out, "429 Too Many Requests", "text/plain", b"");
            }
            let name = clean_name(&percent_decode(req.headers.get("x-name").map(String::as_str).unwrap_or("file")));
            let id = sh.next_id.fetch_add(1, Ordering::Relaxed);
            std::fs::create_dir_all(&sh.staging)?;
            let path = sh.staging.join(id.to_string());
            let copied = {
                let mut file = std::fs::File::create(&path)?;
                std::io::copy(&mut (&mut r).take(size), &mut file)?
            };
            if copied != size {
                let _ = std::fs::remove_file(&path);
                return respond(&mut out, "400 Bad Request", "text/plain", b"");
            }
            sh.staged.lock().unwrap().insert(id, Staged { name: name.clone(), path });
            (sh.events)(PhoneEvent::Upload { id, name, size });
            respond(&mut out, "200 OK", "text/plain", b"ok")
        }
        _ => respond(&mut out, "404 Not Found", "text/plain", b""),
    }
}

/// The page the phone sees: the files to download and a button to send.
fn page(sh: &Shared) -> String {
    let text = |k: &str| html_escape(sh.texts.get(k).map(String::as_str).unwrap_or(k));
    let mut list = String::new();
    for (i, f) in sh.files.iter().enumerate() {
        let name = f.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let size = std::fs::metadata(paths::extended(f)).map(|m| m.len()).unwrap_or(0);
        list.push_str(&format!(
            "<a class=\"f\" href=\"f/{i}\" download><span>{}</span><small>{:.1} MB</small></a>",
            html_escape(&name),
            size as f64 / 1_048_576.0
        ));
    }
    format!(
        r#"<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Space Train</title>
<style>
:root{{color-scheme:dark}}body{{margin:0;background:#0c0a13;color:#e9e6f0;font:16px/1.4 system-ui,sans-serif;padding:20px}}
h1{{font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#7cf5ff;margin:0 0 16px}}h2{{font-size:15px;margin:24px 0 8px;color:#948da8}}
.f{{display:flex;justify-content:space-between;gap:12px;padding:14px;margin:0 0 8px;background:#171420;border-radius:10px;color:inherit;text-decoration:none}}
.f span{{overflow-wrap:anywhere}}.f small{{color:#948da8;white-space:nowrap}}
label{{display:block;padding:16px;text-align:center;border-radius:10px;background:#8b5cf6;color:#fff;font-weight:600}}input{{display:none}}
#log div{{padding:8px 2px;color:#948da8;overflow-wrap:anywhere}}
</style></head><body><h1>Space Train</h1>
<h2>{t_dl}</h2>{list}
<h2>{t_up}</h2><label>{t_pick}<input id="p" type="file" multiple></label><div id="log"></div>
<script>
const log=document.getElementById('log');
document.getElementById('p').onchange=async e=>{{for(const f of e.target.files){{const d=document.createElement('div');d.textContent=f.name+' …';log.prepend(d);
await new Promise(ok=>{{const x=new XMLHttpRequest();x.open('POST','up');x.setRequestHeader('X-Name',encodeURIComponent(f.name));
x.upload.onprogress=p=>{{if(p.lengthComputable)d.textContent=f.name+' '+Math.round(p.loaded*100/p.total)+'%'}};
x.onload=()=>{{d.textContent=f.name+' — '+(x.status===200?'{t_sent}':'{t_failed}');ok()}};x.onerror=()=>{{d.textContent=f.name+' — {t_failed}';ok()}};x.send(f)}})}}e.target.value=''}};
</script></body></html>"#,
        t_dl = text("download"),
        t_up = text("upload"),
        t_pick = text("pick"),
        t_sent = text("sent").replace('\'', "’"),
        t_failed = text("failed").replace('\'', "’"),
        list = if list.is_empty() { format!("<p>{}</p>", text("none")) } else { list },
    )
}

#[tauri::command]
pub fn phone_start(files: Vec<String>, texts: HashMap<String, String>, on_event: Channel<PhoneEvent>) -> Result<PhoneLink, FsError> {
    start(files, texts, Box::new(move |e| {
        let _ = on_event.send(e);
    }))
}

#[tauri::command]
pub fn phone_stop() {
    stop();
}

#[tauri::command]
pub fn phone_keep(id: usize, dest: String) -> Result<String, FsError> {
    keep(id, Path::new(&dest))
}

#[tauri::command]
pub fn phone_discard(id: usize) {
    discard(id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tailscale_addresses_are_recognised() {
        assert!(is_tailscale("100.101.102.103".parse().unwrap()));
        assert!(is_tailscale("100.127.0.1".parse().unwrap()));
        assert!(!is_tailscale("100.128.0.1".parse().unwrap()));
        assert!(!is_tailscale("192.168.1.24".parse().unwrap()));
    }

    #[test]
    fn names_from_the_phone_are_made_safe() {
        assert_eq!(clean_name("IMG_2041.HEIC"), "IMG_2041.HEIC");
        assert_eq!(clean_name("../../Windows/evil.exe"), "evil.exe");
        assert_eq!(clean_name("foto\u{202e}gpj.exe"), "fotogpj.exe");
        assert_eq!(clean_name("con"), "file");
        assert_eq!(clean_name("a:b"), "file");
        assert_eq!(percent_decode("caf%C3%A8%20bar.jpg"), "cafè bar.jpg");
        assert_eq!(percent_decode("100%"), "100%");
    }

    /// One whole round over a real socket: wrong token, page, download, upload, keep.
    #[test]
    fn a_phone_downloads_and_uploads_only_with_the_token() {
        let d = tempfile::tempdir().unwrap();
        let shared_file = d.path().join("biglietto.pdf");
        std::fs::write(&shared_file, b"PDF").unwrap();
        let events = Arc::new(Mutex::new(Vec::new()));
        let seen = events.clone();
        let link = start(
            vec![shared_file.to_string_lossy().into_owned()],
            HashMap::new(),
            Box::new(move |e| seen.lock().unwrap().push(e)),
        );
        // No network in some build machines: nothing to check there.
        let Ok(link) = link else { return };
        let addr = link.url.trim_start_matches("http://").split('/').next().unwrap().to_string();
        let port = addr.rsplit(':').next().unwrap();
        let local = format!("127.0.0.1:{port}");
        let token = link.url.trim_end_matches('/').rsplit('/').next().unwrap().to_string();

        let ask = |raw: Vec<u8>| -> String {
            let mut s = TcpStream::connect(&local).unwrap();
            s.write_all(&raw).unwrap();
            let mut answer = String::new();
            s.read_to_string(&mut answer).unwrap();
            answer
        };
        assert!(ask(b"GET /wrong/ HTTP/1.1\r\n\r\n".to_vec()).starts_with("HTTP/1.1 404"));
        assert!(ask(format!("GET /{token}/ HTTP/1.1\r\n\r\n").into_bytes()).contains("biglietto.pdf"));
        assert!(ask(format!("GET /{token}/f/0 HTTP/1.1\r\n\r\n").into_bytes()).ends_with("\r\n\r\nPDF"));
        let up = ask(format!("POST /{token}/up HTTP/1.1\r\nX-Name: foto%201.jpg\r\nContent-Length: 4\r\n\r\nJPEG").into_bytes());
        assert!(up.starts_with("HTTP/1.1 200"), "{up}");

        let id = events
            .lock()
            .unwrap()
            .iter()
            .find_map(|e| match e {
                PhoneEvent::Upload { id, name, size } => {
                    assert_eq!((name.as_str(), *size), ("foto 1.jpg", 4));
                    Some(*id)
                }
                _ => None,
            })
            .unwrap();
        let dest = d.path().join("Ricevuti");
        let kept = keep(id, &dest).unwrap();
        assert_eq!(std::fs::read(&kept).unwrap(), b"JPEG");
        assert!(events.lock().unwrap().contains(&PhoneEvent::Visit));
        stop();
    }
}
