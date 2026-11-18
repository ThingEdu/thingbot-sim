//! Máy chủ BTC (ban tổ chức) trên laptop trọng tài: MỘT cổng `BTC_PORT` phục vụ cả trang tĩnh (HTTP/1.1 GET) lẫn
//! WebSocket `/ws`, nên điện thoại trọng tài / màn chiếu chỉ cần mở `http://<ip>:47292/` trong trình duyệt.
//!
//! - Phân loại kết nối bằng `TcpStream::peek` (chưa tiêu thụ byte): `/ws` có `Upgrade` ⇒ giao nguyên luồng cho
//!   tokio-tungstenite; còn lại ⇒ đọc một yêu cầu GET, trả lời, đóng (`Connection: close`).
//! - Chuyển thư: kết nối WS đầu tiên từ loopback gửi đúng `{"t":"btc"}` là BTC (chỉ một). Mọi kết nối khác là khách
//!   `c1`, `c2`, …. Khách ⇒ BTC: `{"from":"cN","m":<thư gốc>}`; BTC ⇒ khách: `{"to":"cN"|"*","m":…}` rồi khách nhận
//!   `m`. Khách vào / ra ⇒ BTC nhận `{"peer":"cN","on":bool}`. Chưa có BTC ⇒ khách nhận `{"t":"nobtc"}`.
//! - Lưu giải đấu: `hien-tai.json` (tệp tạm + rename) và tối đa 20 bản `sao-luu-<ms>.json`.

use futures_util::{SinkExt, StreamExt};
use serde_json::value::RawValue;
use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;

pub const BTC_PORT: u16 = 47292;
/// Số bản sao lưu giữ lại.
const BACKUPS: usize = 20;
/// Đầu yêu cầu HTTP dài quá chừng này thì bỏ.
const MAX_HEAD: usize = 16 * 1024;
/// Kết nối loopback chưa gửi gì sau chừng này thì coi là khách (BTC phải xưng ngay khi nối).
const CLAIM_WAIT: Duration = Duration::from_millis(300);

/// Tra tệp theo đường dẫn tương đối (không `/` đầu) ⇒ (nội dung, kiểu MIME). App: `asset_resolver`; bin: thư mục.
pub type Files = Arc<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync>;
type Tx = UnboundedSender<Message>;

#[derive(Default)]
struct Relay {
    btc: Option<(u64, Tx)>,
    clients: BTreeMap<u64, Tx>,
    next: u64,
    /// Số thứ tự các lần xưng BTC (tách khỏi id khách để khách luôn bắt đầu từ c1).
    btc_seq: u64,
}

fn text(s: String) -> Message {
    Message::text(s)
}

fn client_name(n: u64) -> String {
    format!("c{n}")
}

/// Máy chủ đang chạy; drop thì dừng nhận và đóng mọi kết nối.
pub struct Server {
    pub addr: SocketAddr,
    task: JoinHandle<()>,
    _stop: watch::Sender<bool>,
}

impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
        // `_stop` rơi theo ⇒ mọi kết nối đang chờ `stop` bị bỏ.
    }
}

pub async fn start_server(bind: SocketAddr, files: Files) -> std::io::Result<Server> {
    let listener = TcpListener::bind(bind).await?;
    let addr = listener.local_addr()?;
    let relay: Arc<Mutex<Relay>> = Arc::default();
    let (stop_tx, stop_rx) = watch::channel(false);
    let task = tokio::spawn(async move {
        while let Ok((stream, peer)) = listener.accept().await {
            let (relay, files, mut stop) = (relay.clone(), files.clone(), stop_rx.clone());
            tokio::spawn(async move {
                tokio::select! {
                    _ = serve(stream, peer, files, relay) => {}
                    _ = stop.wait_for(|s| *s) => {}
                }
            });
        }
    });
    Ok(Server { addr, task, _stop: stop_tx })
}

fn find_head_end(b: &[u8]) -> Option<usize> {
    b.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

/// Đường dẫn trong dòng yêu cầu, bỏ `?query` / `#hash`.
fn request_path(line: &str) -> Option<(&str, &str)> {
    let mut it = line.split_whitespace();
    let (method, target) = (it.next()?, it.next()?);
    let path = target.split(['?', '#']).next().unwrap_or("");
    Some((method, path))
}

async fn serve(stream: TcpStream, peer: SocketAddr, files: Files, relay: Arc<Mutex<Relay>>) {
    let _ = stream.set_nodelay(true);
    // Nhìn trước (không tiêu thụ) cho tới khi đủ đầu yêu cầu.
    let mut buf = vec![0u8; MAX_HEAD];
    let mut tries = 0;
    let head_len = loop {
        let Ok(n) = stream.peek(&mut buf).await else { return };
        if n == 0 {
            return;
        }
        if let Some(end) = find_head_end(&buf[..n]) {
            break end;
        }
        tries += 1;
        if n == MAX_HEAD || tries > 1000 {
            return;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    };
    let head = String::from_utf8_lossy(&buf[..head_len]).to_string();
    let lower = head.to_lowercase();
    let first = head.lines().next().unwrap_or("");
    let is_ws = matches!(request_path(first), Some((_, "/ws"))) && lower.contains("upgrade: websocket");
    if is_ws {
        serve_ws(stream, peer, relay).await;
    } else {
        serve_http(stream, head_len, first, files).await;
    }
}

// ---------- HTTP ----------

fn mime_of(path: &str) -> &'static str {
    match path.rsplit('.').next().map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("json") => "application/json",
        Some("wasm") => "application/wasm",
        Some("woff2") => "font/woff2",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// Giải `%xx`; `None` nếu sai định dạng hoặc không phải UTF-8.
fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Đường dẫn yêu cầu ⇒ tên tệp tương đối an toàn. `None` ⇒ 404 (có `..`, `\`, đường tuyệt đối, NUL …).
fn safe_rel(path: &str) -> Option<String> {
    let decoded = percent_decode(path)?;
    let rel = match decoded.as_str() {
        "/" => "trong-tai.html",
        "/chieu" => "man-chieu.html",
        p => p.strip_prefix('/')?,
    };
    if rel.is_empty() || rel.starts_with('/') || rel.contains('\\') || rel.contains('\0') || rel.split('/').any(|s| s == ".." || s == ".") {
        return None;
    }
    Some(rel.to_string())
}

async fn reply(stream: &mut TcpStream, status: &str, ctype: &str, extra: &str, body: &[u8]) {
    let head = format!("HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n", body.len());
    let _ = stream.write_all(head.as_bytes()).await;
    let _ = stream.write_all(body).await;
    let _ = stream.shutdown().await;
}

async fn serve_http(mut stream: TcpStream, head_len: usize, first: &str, files: Files) {
    // Tiêu thụ đúng phần đầu đã nhìn thấy.
    let mut sink = vec![0u8; head_len];
    if stream.read_exact(&mut sink).await.is_err() {
        return;
    }
    let Some((method, path)) = request_path(first) else {
        return reply(&mut stream, "400 Bad Request", "text/plain; charset=utf-8", "", "Yêu cầu không hợp lệ".as_bytes()).await;
    };
    if method != "GET" {
        return reply(&mut stream, "405 Method Not Allowed", "text/plain; charset=utf-8", "Allow: GET\r\n", "Chỉ hỗ trợ GET".as_bytes()).await;
    }
    let found = safe_rel(path).and_then(|rel| files(&rel).map(|(body, _)| (body, rel)));
    match found {
        Some((body, rel)) => {
            let ctype = mime_of(&rel);
            let extra = if ctype.starts_with("text/html") { "Cache-Control: no-cache\r\n" } else { "" };
            reply(&mut stream, "200 OK", ctype, extra, &body).await;
        }
        None => reply(&mut stream, "404 Not Found", "text/plain; charset=utf-8", "", "Không tìm thấy".as_bytes()).await,
    }
}

// ---------- WebSocket ----------

enum Role {
    Btc(u64),
    Client(u64),
}

fn is_claim(m: &Message) -> bool {
    matches!(m, Message::Text(t) if t.as_str() == "{\"t\":\"btc\"}")
}

/// Đăng ký khách: cấp id, báo BTC `peer on`.
fn register_client(relay: &Mutex<Relay>, tx: &Tx) -> u64 {
    let mut r = relay.lock().unwrap();
    r.next += 1;
    let id = r.next;
    r.clients.insert(id, tx.clone());
    if let Some((_, b)) = &r.btc {
        let _ = b.send(text(format!("{{\"peer\":\"{}\",\"on\":true}}", client_name(id))));
    }
    id
}

/// Gửi thư của khách tới BTC (hoặc `nobtc` về khách). Không phải JSON ⇒ bỏ.
fn client_message(relay: &Mutex<Relay>, id: u64, tx: &Tx, m: &Message) {
    let Message::Text(t) = m else { return };
    let Ok(raw) = serde_json::from_str::<Box<RawValue>>(t.as_str()) else { return };
    let r = relay.lock().unwrap();
    match &r.btc {
        Some((_, b)) => {
            let _ = b.send(text(format!("{{\"from\":\"{}\",\"m\":{}}}", client_name(id), raw.get())));
        }
        None => {
            let _ = tx.send(text("{\"t\":\"nobtc\"}".into()));
        }
    }
}

#[derive(serde::Deserialize)]
struct ToClient<'a> {
    to: &'a str,
    #[serde(borrow)]
    m: &'a RawValue,
}

fn btc_message(relay: &Mutex<Relay>, m: &Message) {
    let Message::Text(t) = m else { return };
    let Ok(env) = serde_json::from_str::<ToClient>(t.as_str()) else { return };
    let r = relay.lock().unwrap();
    if env.to == "*" {
        for tx in r.clients.values() {
            let _ = tx.send(text(env.m.get().to_string()));
        }
    } else if let Some(id) = env.to.strip_prefix('c').and_then(|n| n.parse::<u64>().ok()) {
        if let Some(tx) = r.clients.get(&id) {
            let _ = tx.send(text(env.m.get().to_string()));
        }
    }
}

async fn serve_ws(stream: TcpStream, peer: SocketAddr, relay: Arc<Mutex<Relay>>) {
    let Ok(ws) = tokio_tungstenite::accept_async(stream).await else { return };
    let (mut sink, mut source) = ws.split();
    let (tx, mut rx) = unbounded_channel::<Message>();
    // Kết nối không phải loopback không thể là BTC ⇒ khách ngay. Loopback: đợi thư đầu để biết có xưng BTC không.
    let mut pending: Option<Message> = None;
    let mut claim = false;
    if peer.ip().is_loopback() {
        match tokio::time::timeout(CLAIM_WAIT, source.next()).await {
            Ok(Some(Ok(m))) if is_claim(&m) => claim = true,
            Ok(Some(Ok(m))) => pending = Some(m),
            Ok(_) => return,
            Err(_) => {}
        }
    }
    let role = if claim {
        let claimed = {
            let mut r = relay.lock().unwrap();
            if r.btc.is_some() {
                None
            } else {
                r.btc_seq += 1;
                let id = r.btc_seq;
                r.btc = Some((id, tx.clone()));
                // BTC mới biết ngay ai đang nối.
                for c in r.clients.keys() {
                    let _ = tx.send(text(format!("{{\"peer\":\"{}\",\"on\":true}}", client_name(*c))));
                }
                Some(id)
            }
        };
        match claimed {
            Some(id) => Role::Btc(id),
            None => {
                let _ = sink.send(text("{\"t\":\"reject\",\"reason\":\"btc\"}".into())).await;
                let _ = sink.close().await;
                return;
            }
        }
    } else {
        Role::Client(register_client(&relay, &tx))
    };
    let writer = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            if sink.send(m).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });
    if let (Role::Client(id), Some(m)) = (&role, &pending) {
        client_message(&relay, *id, &tx, m);
    }
    while let Some(Ok(m)) = source.next().await {
        if m.is_close() {
            break;
        }
        match &role {
            Role::Btc(_) => btc_message(&relay, &m),
            Role::Client(id) => client_message(&relay, *id, &tx, &m),
        }
    }
    // Rời đi.
    {
        let mut r = relay.lock().unwrap();
        match role {
            Role::Btc(id) => {
                if r.btc.as_ref().is_some_and(|b| b.0 == id) {
                    r.btc = None;
                    for c in r.clients.values() {
                        let _ = c.send(text("{\"t\":\"nobtc\"}".into()));
                    }
                }
            }
            Role::Client(id) => {
                r.clients.remove(&id);
                if let Some((_, b)) = &r.btc {
                    let _ = b.send(text(format!("{{\"peer\":\"{}\",\"on\":false}}", client_name(id))));
                }
            }
        }
    }
    drop(tx);
    let _ = writer.await;
}

// ---------- Tệp tĩnh từ thư mục (bin e2e) ----------

/// Tra tệp trong thư mục `dir` (đường dẫn đã được `safe_rel` lọc). Thư mục dist: `trong-tai.html` … nằm ở gốc.
pub fn dir_files(dir: PathBuf) -> Files {
    Arc::new(move |rel: &str| {
        let body = std::fs::read(dir.join(rel)).ok()?;
        Some((body, mime_of(rel).to_string()))
    })
}

// ---------- Lưu giải đấu ----------

fn backup_stamp(name: &str) -> Option<u128> {
    name.strip_prefix("sao-luu-")?.strip_suffix(".json")?.parse().ok()
}

/// Ghi `hien-tai.json` (tệp tạm + rename) và bản `sao-luu-<stamp>.json`; chỉ giữ `BACKUPS` bản mới nhất.
pub fn save_at(dir: &Path, json: &str, stamp: u128) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join("hien-tai.json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, dir.join("hien-tai.json"))?;
    std::fs::write(dir.join(format!("sao-luu-{stamp}.json")), json)?;
    let mut all: Vec<(u128, PathBuf)> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .filter_map(|e| backup_stamp(e.file_name().to_str()?).map(|s| (s, e.path())))
        .collect();
    all.sort();
    let extra = all.len().saturating_sub(BACKUPS);
    for (_, p) in all.into_iter().take(extra) {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

pub fn load_json(dir: &Path) -> Option<String> {
    std::fs::read_to_string(dir.join("hien-tai.json")).ok()
}

// ---------- Lệnh Tauri ----------

#[derive(Default)]
pub struct BtcState {
    server: Mutex<Option<Server>>,
}

#[derive(serde::Serialize)]
pub struct BtcInfo {
    port: u16,
    addrs: Vec<String>,
}

fn giai_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("giai"))
}

#[tauri::command]
pub async fn btc_start(app: tauri::AppHandle, state: tauri::State<'_, BtcState>) -> Result<BtcInfo, String> {
    let port = {
        let s = state.server.lock().unwrap();
        s.as_ref().map(|s| s.addr.port())
    };
    if let Some(port) = port {
        return Ok(BtcInfo { port, addrs: crate::lan::local_addrs() });
    }
    let resolver = app.asset_resolver();
    let files: Files = Arc::new(move |rel: &str| resolver.get(rel.to_string()).map(|a| (a.bytes, a.mime_type)));
    let server = start_server(SocketAddr::from(([0, 0, 0, 0], BTC_PORT)), files)
        .await
        .map_err(|e| format!("Không mở được cổng {BTC_PORT}: {e}"))?;
    let port = server.addr.port();
    *state.server.lock().unwrap() = Some(server);
    Ok(BtcInfo { port, addrs: crate::lan::local_addrs() })
}

#[tauri::command]
pub fn btc_stop(state: tauri::State<'_, BtcState>) {
    state.server.lock().unwrap().take();
}

#[tauri::command]
pub fn btc_save(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    save_at(&giai_dir(&app)?, &json, stamp).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn btc_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(load_json(&giai_dir(&app)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::{SinkExt, StreamExt};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;
    use tokio_tungstenite::tungstenite::Message;
    use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

    type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

    fn fake_files() -> Files {
        Arc::new(|p: &str| match p {
            "trong-tai.html" => Some((b"<h1>trong tai</h1>".to_vec(), "text/html".to_string())),
            "man-chieu.html" => Some((b"<h1>chieu</h1>".to_vec(), "text/html".to_string())),
            "a.js" => Some((b"1".to_vec(), "text/javascript".to_string())),
            _ => None,
        })
    }

    async fn http(addr: SocketAddr, req: &str) -> String {
        let mut s = TcpStream::connect(addr).await.unwrap();
        s.write_all(req.as_bytes()).await.unwrap();
        let mut out = Vec::new();
        tokio::time::timeout(Duration::from_secs(3), s.read_to_end(&mut out)).await.expect("hết giờ").unwrap();
        String::from_utf8_lossy(&out).into_owned()
    }
    use std::time::Duration;

    async fn get(addr: SocketAddr, path: &str) -> String {
        http(addr, &format!("GET {path} HTTP/1.1\r\nHost: x\r\n\r\n")).await
    }

    async fn ws(addr: SocketAddr) -> Ws {
        connect_async(format!("ws://{addr}/ws")).await.unwrap().0
    }

    async fn recv(s: &mut Ws) -> String {
        loop {
            let m = tokio::time::timeout(Duration::from_secs(3), s.next()).await.expect("hết giờ").expect("đóng").unwrap();
            if m.is_text() {
                return m.into_text().unwrap().to_string();
            }
            if m.is_close() {
                return "<close>".into();
            }
        }
    }

    async fn send(s: &mut Ws, t: &str) {
        s.send(Message::text(t)).await.unwrap();
    }

    async fn new_btc(addr: SocketAddr) -> Ws {
        let mut b = ws(addr).await;
        send(&mut b, "{\"t\":\"btc\"}").await;
        b
    }

    async fn start() -> Server {
        start_server("127.0.0.1:0".parse().unwrap(), fake_files()).await.unwrap()
    }

    #[tokio::test]
    async fn http_serves_pages_and_assets() {
        let srv = start().await;
        let r = get(srv.addr, "/").await;
        assert!(r.starts_with("HTTP/1.1 200"), "{r}");
        assert!(r.contains("text/html"), "{r}");
        assert!(r.to_lowercase().contains("cache-control: no-cache"), "{r}");
        assert!(r.ends_with("<h1>trong tai</h1>"), "{r}");
        assert!(get(srv.addr, "/chieu").await.ends_with("<h1>chieu</h1>"));
        let js = get(srv.addr, "/a.js?v=3").await;
        assert!(js.contains("200") && js.contains("text/javascript") && !js.to_lowercase().contains("cache-control"), "{js}");
        assert!(get(srv.addr, "/khong-co.png").await.starts_with("HTTP/1.1 404"));
        assert!(http(srv.addr, "POST / HTTP/1.1\r\nHost: x\r\n\r\n").await.starts_with("HTTP/1.1 405"));
    }

    #[tokio::test]
    async fn http_blocks_path_traversal() {
        // Tệp giả trả về cho MỌI đường dẫn, nên chỉ việc chặn ở máy chủ mới cho 404.
        let files: Files = Arc::new(|_: &str| Some((b"bi-mat".to_vec(), "text/plain".to_string())));
        let srv = start_server("127.0.0.1:0".parse().unwrap(), files).await.unwrap();
        for p in ["/../x", "/a/../../x", "/%2e%2e/x", "/%2E%2E%2fx", "/a%5cb", "/a\\b", "//etc/passwd"] {
            let r = get(srv.addr, p).await;
            assert!(r.starts_with("HTTP/1.1 404"), "{p} => {r}");
            assert!(!r.contains("bi-mat"), "{p}");
        }
    }

    #[tokio::test]
    async fn client_message_reaches_btc_wrapped() {
        let srv = start().await;
        let mut btc = new_btc(srv.addr).await;
        let mut c = ws(srv.addr).await;
        send(&mut c, "{\"t\":\"hi\",\"n\":1}").await;
        assert_eq!(recv(&mut btc).await, "{\"peer\":\"c1\",\"on\":true}");
        assert_eq!(recv(&mut btc).await, "{\"from\":\"c1\",\"m\":{\"t\":\"hi\",\"n\":1}}");
        // Không phải JSON ⇒ bỏ; thư sau vẫn tới.
        send(&mut c, "khong phai json").await;
        send(&mut c, "{\"k\":2}").await;
        assert_eq!(recv(&mut btc).await, "{\"from\":\"c1\",\"m\":{\"k\":2}}");
        drop(c);
        assert_eq!(recv(&mut btc).await, "{\"peer\":\"c1\",\"on\":false}");
    }

    #[tokio::test]
    async fn btc_broadcast_and_direct() {
        let srv = start().await;
        let mut btc = new_btc(srv.addr).await;
        let mut a = ws(srv.addr).await;
        send(&mut a, "{\"x\":0}").await;
        let mut b = ws(srv.addr).await;
        send(&mut b, "{\"x\":0}").await;
        for _ in 0..4 {
            recv(&mut btc).await; // 2 peer on + 2 thư
        }
        send(&mut btc, "{\"to\":\"*\",\"m\":{\"t\":\"all\"}}").await;
        assert_eq!(recv(&mut a).await, "{\"t\":\"all\"}");
        assert_eq!(recv(&mut b).await, "{\"t\":\"all\"}");
        send(&mut btc, "{\"to\":\"c2\",\"m\":{\"t\":\"one\"}}").await;
        send(&mut btc, "{\"to\":\"*\",\"m\":{\"t\":\"end\"}}").await;
        assert_eq!(recv(&mut b).await, "{\"t\":\"one\"}");
        assert_eq!(recv(&mut b).await, "{\"t\":\"end\"}");
        assert_eq!(recv(&mut a).await, "{\"t\":\"end\"}"); // a không nhận thư gửi riêng c2
    }

    #[tokio::test]
    async fn second_btc_is_rejected() {
        let srv = start().await;
        let _btc = new_btc(srv.addr).await;
        let mut second = new_btc(srv.addr).await;
        assert_eq!(recv(&mut second).await, "{\"t\":\"reject\",\"reason\":\"btc\"}");
        assert_eq!(recv(&mut second).await, "<close>");
    }

    #[tokio::test]
    async fn no_btc_then_btc_leaves_and_returns() {
        let srv = start().await;
        let mut c = ws(srv.addr).await;
        send(&mut c, "{\"a\":1}").await;
        assert_eq!(recv(&mut c).await, "{\"t\":\"nobtc\"}");
        let btc = new_btc(srv.addr).await;
        send(&mut c, "{\"a\":2}").await;
        let mut btc = btc;
        // BTC vừa nhận khách đang kết nối, rồi thư.
        assert_eq!(recv(&mut btc).await, "{\"peer\":\"c1\",\"on\":true}");
        assert_eq!(recv(&mut btc).await, "{\"from\":\"c1\",\"m\":{\"a\":2}}");
        drop(btc);
        assert_eq!(recv(&mut c).await, "{\"t\":\"nobtc\"}");
        let mut again = new_btc(srv.addr).await; // BTC mới nhận lại được
        assert_eq!(recv(&mut again).await, "{\"peer\":\"c1\",\"on\":true}");
        send(&mut c, "{\"a\":3}").await;
        assert_eq!(recv(&mut again).await, "{\"from\":\"c1\",\"m\":{\"a\":3}}");
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("fanroc-btc-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn save_then_load_roundtrip() {
        let d = temp_dir("rt");
        assert_eq!(load_json(&d), None);
        save_at(&d, "{\"giai\":\"một\"}", 1).unwrap();
        save_at(&d, "{\"giai\":\"hai\"}", 2).unwrap();
        assert_eq!(load_json(&d).as_deref(), Some("{\"giai\":\"hai\"}"));
        assert!(!d.join("hien-tai.json.tmp").exists());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn backup_keeps_twenty_newest() {
        let d = temp_dir("bk");
        for i in 1..=21u128 {
            save_at(&d, &format!("{{\"i\":{i}}}"), i).unwrap();
        }
        let mut names: Vec<String> = std::fs::read_dir(&d).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).filter(|n| n.starts_with("sao-luu-")).collect();
        names.sort();
        assert_eq!(names.len(), 20);
        assert!(!names.contains(&"sao-luu-1.json".to_string()), "{names:?}");
        assert!(names.contains(&"sao-luu-2.json".to_string()) && names.contains(&"sao-luu-21.json".to_string()));
        assert_eq!(load_json(&d).as_deref(), Some("{\"i\":21}"));
        std::fs::remove_dir_all(&d).unwrap();
    }
}
