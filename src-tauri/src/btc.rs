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
use std::collections::{BTreeMap, HashSet};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::{channel, Sender};
use tokio::sync::{watch, Notify, OwnedSemaphorePermit, Semaphore};
use tokio::task::JoinHandle;
use tokio::time::Instant;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message;

pub const BTC_PORT: u16 = 47292;
/// Số bản sao lưu giữ lại.
const BACKUPS: usize = 20;
/// Đầu yêu cầu HTTP dài quá chừng này thì bỏ.
const MAX_HEAD: usize = 16 * 1024;

/// Giới hạn thời gian / số lượng; mặc định cho bản thật, test dùng giá trị nhỏ.
#[derive(Clone)]
pub struct Config {
    /// Từ lúc nối tới khi đọc xong đầu yêu cầu, trả lời HTTP hoặc bắt tay WebSocket xong.
    pub head_timeout: Duration,
    /// Chu kỳ gửi ping cho mỗi kết nối WebSocket.
    pub ping_every: Duration,
    /// Kết nối WebSocket không có khung nào (kể cả pong) quá chừng này thì đóng.
    pub idle_timeout: Duration,
    /// Số kết nối đồng thời tối đa; kết nối thừa bị đóng ngay.
    pub max_conns: usize,
    /// Hàng đợi gửi của khách / của BTC; đầy thì kết nối đó bị bỏ.
    pub client_queue: usize,
    pub btc_queue: usize,
    /// Cỡ thư / khung WebSocket tối đa.
    pub max_message: usize,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            head_timeout: Duration::from_secs(10),
            ping_every: Duration::from_secs(10),
            idle_timeout: Duration::from_secs(30),
            max_conns: 256,
            client_queue: 512,
            btc_queue: 4096,
            max_message: 1 << 20,
        }
    }
}

/// Tra tệp theo đường dẫn tương đối (không `/` đầu) ⇒ (nội dung, kiểu MIME). App: `asset_resolver`; bin: thư mục.
pub type Files = Arc<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync>;

/// Đầu gửi của một kết nối; hàng đợi đầy (hoặc đã đóng) thì đánh thức kết nối để nó tự ngắt.
#[derive(Clone)]
struct Peer {
    tx: Sender<Message>,
    kick: Arc<Notify>,
}

impl Peer {
    fn push(&self, m: Message) {
        if self.tx.try_send(m).is_err() {
            self.kick.notify_one();
        }
    }
}

#[derive(Default)]
struct Relay {
    btc: Option<(u64, Peer)>,
    clients: BTreeMap<u64, Peer>,
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

impl Server {
    /// Dừng hẳn: huỷ vòng nhận và đợi nó kết thúc để cổng nghe được trả lại (dừng rồi bật lại ngay vẫn bind được).
    pub async fn shutdown(mut self) {
        self.task.abort();
        let _ = (&mut self.task).await;
    }
}

/// Khoá tệp của app, bỏ `/` đầu (resolver của Tauri liệt kê khoá dạng `/index.html`).
pub fn asset_keys<I: IntoIterator<Item = String>>(keys: I) -> HashSet<String> {
    keys.into_iter().map(|k| k.trim_start_matches('/').to_string()).collect()
}

/// `rel` có đúng là một tệp thật của app không. `AssetResolver::get` tự lùi về `x.html`, `x/index.html`, `index.html`
/// khi không có tệp, nên chỉ gọi nó với khoá có thật; còn lại là 404.
pub fn asset_known(keys: &HashSet<String>, rel: &str) -> bool {
    keys.contains(rel.trim_start_matches('/'))
}

pub async fn start_server(bind: SocketAddr, files: Files) -> std::io::Result<Server> {
    start_server_with(bind, files, Config::default()).await
}

pub async fn start_server_with(bind: SocketAddr, files: Files, cfg: Config) -> std::io::Result<Server> {
    let listener = TcpListener::bind(bind).await?;
    let addr = listener.local_addr()?;
    let relay: Arc<Mutex<Relay>> = Arc::default();
    let slots = Arc::new(Semaphore::new(cfg.max_conns));
    let (stop_tx, stop_rx) = watch::channel(false);
    let task = tokio::spawn(async move {
        loop {
            let (stream, peer) = match listener.accept().await {
                Ok(x) => x,
                Err(e) => {
                    // Lỗi nhận tạm thời (hết tệp mở, …) không được làm chết vòng nhận.
                    eprintln!("btc: accept lỗi: {e}");
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    continue;
                }
            };
            let Ok(permit) = slots.clone().try_acquire_owned() else {
                continue; // quá số kết nối: đóng ngay
            };
            let (relay, files, cfg, mut stop) = (relay.clone(), files.clone(), cfg.clone(), stop_rx.clone());
            tokio::spawn(async move {
                tokio::select! {
                    _ = serve(stream, peer, files, relay, cfg, permit) => {}
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

struct Head {
    method: String,
    path: String,
    /// (tên viết thường, giá trị đã cắt khoảng trắng)
    headers: Vec<(String, String)>,
}

impl Head {
    fn parse(head: &str) -> Option<Head> {
        let mut lines = head.split("\r\n");
        let mut first = lines.next()?.split_whitespace();
        let (method, target) = (first.next()?, first.next()?);
        let path = target.split(['?', '#']).next().unwrap_or("").to_string();
        let headers = lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string())).collect();
        Some(Head { method: method.to_string(), path, headers })
    }

    /// Có tiêu đề `name` mà giá trị (danh sách phân cách dấu phẩy) chứa `token` không phân biệt hoa thường.
    fn has_token(&self, name: &str, token: &str) -> bool {
        self.headers.iter().filter(|(k, _)| k == name).any(|(_, v)| v.split(',').any(|t| t.trim().eq_ignore_ascii_case(token)))
    }

    fn is_ws_upgrade(&self) -> bool {
        self.path == "/ws" && self.has_token("upgrade", "websocket") && self.has_token("connection", "upgrade")
    }
}

/// Nhìn trước (không tiêu thụ) cho tới khi đủ đầu yêu cầu; trả (độ dài đầu, đầu).
async fn peek_head(stream: &TcpStream) -> Option<(usize, String)> {
    let mut buf = vec![0u8; MAX_HEAD];
    loop {
        let n = stream.peek(&mut buf).await.ok()?;
        if n == 0 {
            return None;
        }
        if let Some(end) = find_head_end(&buf[..n]) {
            return Some((end, String::from_utf8_lossy(&buf[..end]).to_string()));
        }
        if n == MAX_HEAD {
            return None;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
}

async fn serve(stream: TcpStream, peer: SocketAddr, files: Files, relay: Arc<Mutex<Relay>>, cfg: Config, _permit: OwnedSemaphorePermit) {
    let _ = stream.set_nodelay(true);
    // Mọi bước trước khi biết đây là WebSocket đã bắt tay hay HTTP đã trả lời đều có hạn: ổ cắm rảnh không giữ chỗ mãi.
    let Ok(Some((head_len, head))) = tokio::time::timeout(cfg.head_timeout, peek_head(&stream)).await else { return };
    let Some(parsed) = Head::parse(&head) else { return };
    if parsed.is_ws_upgrade() {
        let ws_cfg = WebSocketConfig::default().max_message_size(Some(cfg.max_message)).max_frame_size(Some(cfg.max_message));
        let Ok(Ok(ws)) = tokio::time::timeout(cfg.head_timeout, tokio_tungstenite::accept_async_with_config(stream, Some(ws_cfg))).await else { return };
        serve_ws(ws, peer, relay, cfg).await;
    } else {
        let _ = tokio::time::timeout(cfg.head_timeout, serve_http(stream, head_len, parsed, files)).await;
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

async fn serve_http(mut stream: TcpStream, head_len: usize, head: Head, files: Files) {
    // Tiêu thụ đúng phần đầu đã nhìn thấy.
    let mut sink = vec![0u8; head_len];
    if stream.read_exact(&mut sink).await.is_err() {
        return;
    }
    if head.method != "GET" {
        return reply(&mut stream, "405 Method Not Allowed", "text/plain; charset=utf-8", "Allow: GET\r\n", "Chỉ hỗ trợ GET".as_bytes()).await;
    }
    let found = safe_rel(&head.path).and_then(|rel| files(&rel).map(|(body, _)| (body, rel)));
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
fn register_client(relay: &Mutex<Relay>, me: &Peer) -> u64 {
    let mut r = relay.lock().unwrap();
    r.next += 1;
    let id = r.next;
    r.clients.insert(id, me.clone());
    if let Some((_, b)) = &r.btc {
        b.push(text(format!("{{\"peer\":\"{}\",\"on\":true}}", client_name(id))));
    }
    id
}

/// Gửi thư của khách tới BTC (hoặc `nobtc` về khách). Không phải JSON ⇒ bỏ.
fn client_message(relay: &Mutex<Relay>, id: u64, me: &Peer, m: &Message) {
    let Message::Text(t) = m else { return };
    let Ok(raw) = serde_json::from_str::<Box<RawValue>>(t.as_str()) else { return };
    let r = relay.lock().unwrap();
    match &r.btc {
        Some((_, b)) => b.push(text(format!("{{\"from\":\"{}\",\"m\":{}}}", client_name(id), raw.get()))),
        None => me.push(text("{\"t\":\"nobtc\"}".into())),
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
        for p in r.clients.values() {
            p.push(text(env.m.get().to_string()));
        }
    } else if let Some(id) = env.to.strip_prefix('c').and_then(|n| n.parse::<u64>().ok()) {
        if let Some(p) = r.clients.get(&id) {
            p.push(text(env.m.get().to_string()));
        }
    }
}

async fn serve_ws<S>(ws: tokio_tungstenite::WebSocketStream<S>, peer: SocketAddr, relay: Arc<Mutex<Relay>>, cfg: Config)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut sink, mut source) = ws.split();
    // Kết nối không phải loopback không thể là BTC ⇒ khách ngay. Loopback: vai do thư đầu quyết định, bao lâu cũng đợi
    // (có ping / hạn rảnh): đúng `{"t":"btc"}` ⇒ xưng BTC; thư khác ⇒ khách, thư đó được chuyển như thường.
    let mut pending: Option<Message> = None;
    let mut claim = false;
    if peer.ip().is_loopback() {
        let mut last = Instant::now();
        let mut tick = tokio::time::interval(cfg.ping_every);
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                m = source.next() => match m {
                    Some(Ok(m)) => {
                        last = Instant::now();
                        if is_claim(&m) {
                            claim = true;
                            break;
                        } else if m.is_text() || m.is_binary() {
                            pending = Some(m);
                            break;
                        } else if m.is_close() {
                            return;
                        }
                    }
                    _ => return,
                },
                _ = tick.tick() => {
                    if last.elapsed() > cfg.idle_timeout || sink.send(Message::Ping(Default::default())).await.is_err() {
                        return;
                    }
                }
            }
        }
    }
    let kick = Arc::new(Notify::new());
    let (tx, mut rx) = channel::<Message>(if claim { cfg.btc_queue } else { cfg.client_queue }.max(1));
    let me = Peer { tx, kick: kick.clone() };
    let role = if claim {
        let claimed = {
            let mut r = relay.lock().unwrap();
            if r.btc.is_some() {
                None
            } else {
                r.btc_seq += 1;
                let id = r.btc_seq;
                r.btc = Some((id, me.clone()));
                // BTC mới biết ngay ai đang nối.
                for c in r.clients.keys() {
                    me.push(text(format!("{{\"peer\":\"{}\",\"on\":true}}", client_name(*c))));
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
        Role::Client(register_client(&relay, &me))
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
        client_message(&relay, *id, &me, m);
    }
    let mut last = Instant::now();
    let mut tick = tokio::time::interval(cfg.ping_every);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            m = source.next() => match m {
                Some(Ok(m)) => {
                    last = Instant::now();
                    if m.is_close() {
                        break;
                    }
                    match &role {
                        Role::Btc(_) => btc_message(&relay, &m),
                        Role::Client(id) => client_message(&relay, *id, &me, &m),
                    }
                }
                _ => break,
            },
            _ = tick.tick() => {
                if last.elapsed() > cfg.idle_timeout {
                    break;
                }
                me.push(Message::Ping(Default::default()));
            }
            _ = kick.notified() => break, // hàng đợi gửi đầy (khách chậm / chết)
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
                        c.push(text("{\"t\":\"nobtc\"}".into()));
                    }
                }
            }
            Role::Client(id) => {
                r.clients.remove(&id);
                if let Some((_, b)) = &r.btc {
                    b.push(text(format!("{{\"peer\":\"{}\",\"on\":false}}", client_name(id))));
                }
            }
        }
    }
    // Bỏ tác vụ ghi (hàng đợi có thể đang kẹt vì ổ cắm chậm): ổ cắm đóng khi `sink` rơi.
    writer.abort();
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
    /// Khoá tokio giữ suốt lúc bind/dừng ⇒ hai lệnh start đồng thời không tranh cổng, stop rồi start luôn được.
    server: tokio::sync::Mutex<Option<Server>>,
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
    let mut slot = state.server.lock().await;
    if let Some(s) = slot.as_ref() {
        return Ok(BtcInfo { port: s.addr.port(), addrs: crate::lan::local_addrs() });
    }
    let resolver = app.asset_resolver();
    // Chỉ phục vụ tệp có thật: resolver tự lùi về index.html cho đường dẫn lạ nên phải lọc trước.
    let keys = asset_keys(resolver.iter().map(|(k, _)| k.to_string()));
    let files: Files = Arc::new(move |rel: &str| {
        if !asset_known(&keys, rel) {
            return None;
        }
        resolver.get(rel.to_string()).map(|a| (a.bytes, a.mime_type))
    });
    let bind = SocketAddr::from(([0, 0, 0, 0], BTC_PORT));
    let mut tries = 0;
    let server = loop {
        match start_server(bind, files.clone()).await {
            Ok(s) => break s,
            // Cổng vừa được trả lại có thể chưa nhả hẳn: thử lại vài lần.
            Err(e) if e.kind() == std::io::ErrorKind::AddrInUse && tries < 10 => {
                tries += 1;
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(e) => return Err(format!("Không mở được cổng {BTC_PORT}: {e}")),
        }
    };
    let port = server.addr.port();
    *slot = Some(server);
    Ok(BtcInfo { port, addrs: crate::lan::local_addrs() })
}

#[tauri::command]
pub async fn btc_stop(state: tauri::State<'_, BtcState>) -> Result<(), String> {
    let server = state.server.lock().await.take();
    if let Some(s) = server {
        s.shutdown().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn btc_save(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = giai_dir(&app)?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
    tokio::task::spawn_blocking(move || save_at(&dir, &json, stamp)).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn btc_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = giai_dir(&app)?;
    tokio::task::spawn_blocking(move || load_json(&dir)).await.map_err(|e| e.to_string())
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

    fn small_cfg() -> Config {
        Config {
            head_timeout: Duration::from_millis(300),
            ping_every: Duration::from_millis(50),
            idle_timeout: Duration::from_millis(400),
            max_conns: 3,
            client_queue: 8,
            btc_queue: 64,
            max_message: 1 << 20,
        }
    }

    async fn start_cfg(cfg: Config) -> Server {
        start_server_with("127.0.0.1:0".parse().unwrap(), fake_files(), cfg).await.unwrap()
    }

    /// Đọc tới khi đóng (Ok(0) / lỗi) trong `secs`; trả về true nếu máy chủ đóng.
    async fn closed_within(s: &mut TcpStream, secs: u64) -> bool {
        let mut b = [0u8; 64];
        match tokio::time::timeout(Duration::from_secs(secs), s.read(&mut b)).await {
            Ok(Ok(0)) | Ok(Err(_)) => true,
            _ => false,
        }
    }

    #[tokio::test]
    async fn idle_socket_is_closed_by_timeout() {
        let srv = start_cfg(small_cfg()).await;
        let mut idle = TcpStream::connect(srv.addr).await.unwrap(); // không gửi gì
        assert!(closed_within(&mut idle, 3).await, "ổ cắm rảnh phải bị đóng sau head_timeout");
        // Đầu yêu cầu gửi dở cũng vậy.
        let mut half = TcpStream::connect(srv.addr).await.unwrap();
        half.write_all(b"GET / HTTP/1.1\r\nHost: x\r\n").await.unwrap();
        assert!(closed_within(&mut half, 3).await, "đầu yêu cầu dở phải bị đóng");
    }

    #[tokio::test]
    async fn connection_cap_closes_excess_immediately() {
        let srv = start_cfg(Config { head_timeout: Duration::from_secs(30), ..small_cfg() }).await;
        let mut held = Vec::new();
        for _ in 0..3 {
            held.push(TcpStream::connect(srv.addr).await.unwrap());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
        let mut extra = TcpStream::connect(srv.addr).await.unwrap();
        assert!(closed_within(&mut extra, 2).await, "kết nối thứ 4 phải bị đóng ngay");
        drop(held);
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(get(srv.addr, "/").await.starts_with("HTTP/1.1 200"), "giải phóng chỗ thì nhận lại được");
    }

    #[test]
    fn asset_lookup_only_real_files() {
        let keys = asset_keys(["/trong-tai.html".to_string(), "assets/a.js".to_string(), "/media/x.png".to_string()]);
        assert!(asset_known(&keys, "trong-tai.html"));
        assert!(asset_known(&keys, "assets/a.js"));
        assert!(asset_known(&keys, "media/x.png"));
        assert!(!asset_known(&keys, "khong-co"));
        assert!(!asset_known(&keys, "index.html"));
        assert!(!asset_known(&keys, "assets"));
    }

    #[tokio::test]
    async fn dead_client_is_dropped_by_heartbeat() {
        let srv = start_cfg(small_cfg()).await;
        let mut btc = new_btc(srv.addr).await;
        // Khách này gửi một thư rồi không đọc nữa ⇒ không trả pong ⇒ bị ngắt.
        let mut dead = ws(srv.addr).await;
        send(&mut dead, "{\"a\":1}").await;
        // Khách này liên tục đọc ⇒ vẫn sống.
        let mut live = ws(srv.addr).await;
        send(&mut live, "{\"b\":1}").await;
        let (mut live_tx, mut live_rx) = live.split();
        tokio::spawn(async move { while live_rx.next().await.is_some() {} });
        let mut got = Vec::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(4);
        while tokio::time::Instant::now() < deadline {
            let m = recv(&mut btc).await;
            got.push(m.clone());
            if m == "{\"peer\":\"c1\",\"on\":false}" {
                break;
            }
        }
        assert!(got.contains(&"{\"peer\":\"c1\",\"on\":false}".to_string()), "c1 phải bị ngắt: {got:?}");
        assert!(!got.contains(&"{\"peer\":\"c2\",\"on\":false}".to_string()), "c2 còn sống: {got:?}");
        live_tx.send(Message::text("{\"b\":2}")).await.unwrap();
        assert_eq!(recv(&mut btc).await, "{\"from\":\"c2\",\"m\":{\"b\":2}}");
        drop(dead);
    }

    #[tokio::test]
    async fn slow_client_with_full_queue_is_dropped() {
        let srv = start_cfg(Config { idle_timeout: Duration::from_secs(60), ping_every: Duration::from_secs(60), client_queue: 4, ..small_cfg() }).await;
        let mut btc = new_btc(srv.addr).await;
        let mut slow = ws(srv.addr).await;
        send(&mut slow, "{\"a\":1}").await;
        assert_eq!(recv(&mut btc).await, "{\"peer\":\"c1\",\"on\":true}");
        assert_eq!(recv(&mut btc).await, "{\"from\":\"c1\",\"m\":{\"a\":1}}");
        // BTC bơm thật nhiều thư vào khách không đọc: hàng đợi 4 đầy ⇒ khách bị bỏ.
        let big = "x".repeat(200_000);
        for _ in 0..400 {
            send(&mut btc, &format!("{{\"to\":\"c1\",\"m\":{{\"p\":\"{big}\"}}}}")).await;
        }
        let mut seen_off = false;
        for _ in 0..50 {
            if recv(&mut btc).await == "{\"peer\":\"c1\",\"on\":false}" {
                seen_off = true;
                break;
            }
        }
        assert!(seen_off, "khách chậm phải bị ngắt");
    }

    #[tokio::test]
    async fn oversized_message_closes_connection() {
        let srv = start().await;
        let mut c = ws(srv.addr).await;
        let huge = format!("{{\"p\":\"{}\"}}", "y".repeat(2 << 20));
        let _ = c.send(Message::text(huge)).await;
        let mut closed = false;
        for _ in 0..10 {
            match tokio::time::timeout(Duration::from_secs(3), c.next()).await {
                Ok(None) | Ok(Some(Err(_))) => {
                    closed = true;
                    break;
                }
                Err(_) => break,
                Ok(Some(Ok(m))) if m.is_close() => {
                    closed = true;
                    break;
                }
                _ => {}
            }
        }
        assert!(closed, "thư 2 MiB phải làm máy chủ đóng kết nối");
    }

    #[tokio::test]
    async fn loopback_role_waits_for_first_message_without_time_limit() {
        let srv = start().await;
        let mut slow_btc = ws(srv.addr).await;
        tokio::time::sleep(Duration::from_millis(700)).await; // lâu hơn khoảng 300 ms cũ
        send(&mut slow_btc, "{\"t\":\"btc\"}").await;
        let mut c = ws(srv.addr).await;
        send(&mut c, "{\"k\":1}").await;
        assert_eq!(recv(&mut slow_btc).await, "{\"peer\":\"c1\",\"on\":true}");
        assert_eq!(recv(&mut slow_btc).await, "{\"from\":\"c1\",\"m\":{\"k\":1}}");
    }

    async fn raw_handshake(addr: SocketAddr, req_parts: &[&str], gap_ms: u64) -> String {
        let mut s = TcpStream::connect(addr).await.unwrap();
        for p in req_parts {
            s.write_all(p.as_bytes()).await.unwrap();
            s.flush().await.unwrap();
            tokio::time::sleep(Duration::from_millis(gap_ms)).await;
        }
        let mut b = [0u8; 512];
        let n = tokio::time::timeout(Duration::from_secs(3), s.read(&mut b)).await.expect("hết giờ").unwrap();
        String::from_utf8_lossy(&b[..n]).into_owned()
    }

    #[tokio::test]
    async fn upgrade_header_parsing_is_lenient() {
        let srv = start().await;
        let req = "GET /ws HTTP/1.1\r\nhost: x\r\nUPGRADE:websocket\r\nconnection:keep-alive, Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
        let r = raw_handshake(srv.addr, &[req], 0).await;
        assert!(r.starts_with("HTTP/1.1 101"), "{r}");
    }

    #[tokio::test]
    async fn request_split_across_writes_still_upgrades() {
        let srv = start().await;
        let a = "GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConn";
        let b = "ection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
        let r = raw_handshake(srv.addr, &[a, b], 150).await;
        assert!(r.starts_with("HTTP/1.1 101"), "{r}");
    }

    #[tokio::test]
    async fn non_loopback_peer_cannot_claim_btc() {
        let Some(ip) = crate::lan::local_addrs().into_iter().next() else {
            println!("bỏ qua: máy không có địa chỉ LAN không-loopback");
            return;
        };
        let bind: SocketAddr = format!("{ip}:0").parse().unwrap();
        let srv = start_server_with(bind, fake_files(), Config::default()).await.unwrap();
        // Từ địa chỉ LAN, thư xưng BTC chỉ là thư của khách: chưa có BTC ⇒ nobtc.
        let mut fake = ws(srv.addr).await;
        send(&mut fake, "{\"t\":\"btc\"}").await;
        assert_eq!(recv(&mut fake).await, "{\"t\":\"nobtc\"}");
        // Nối tới địa chỉ LAN nhưng đó vẫn là IP không-loopback ⇒ không chiếm được chỗ BTC.
        let mut btc_from_lan = ws(srv.addr).await;
        send(&mut btc_from_lan, "{\"t\":\"btc\"}").await;
        assert_eq!(recv(&mut btc_from_lan).await, "{\"t\":\"nobtc\"}");
    }

    #[tokio::test]
    async fn stop_then_start_same_port() {
        let srv = start().await;
        let addr = srv.addr;
        srv.shutdown().await;
        let again = start_server_with(addr, fake_files(), Config::default()).await.expect("cổng phải được trả lại sau shutdown");
        assert!(get(again.addr, "/").await.starts_with("HTTP/1.1 200"));
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
