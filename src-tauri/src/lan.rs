//! Thi hai máy qua LAN (docs/superpowers/specs/2026-11-18-fanroc-lan-design.md). Trang (WebView) chỉ nối WebSocket tới
//! 127.0.0.1; phần này lo mạng thật:
//!
//! - Hub (máy chủ): WebSocket server ở `HUB_PORT`. Kết nối đầu, từ chính máy này, là "host"; kết nối kế là "guest";
//!   thư (chữ và nhị phân) chuyển nguyên qua lại. Guest vào / ra thì host nhận `{"t":"peer","on":…}`; khách thứ hai
//!   nhận `{"t":"reject","reason":"full"}` rồi bị đóng.
//! - Đèn hiệu (máy chủ): UDP broadcast mỗi giây ở `BEACON_PORT`; dò phòng (máy khách) nghe cổng đó.
//! - Ống nối (máy khách): 127.0.0.1:cổng-ngẫu-nhiên → `ip:HUB_PORT` của máy chủ, chuyển thẳng byte TCP.

use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;

/// Việc nền chạy trên runtime của Tauri (đèn hiệu, dò phòng).
pub type BgTask = tauri::async_runtime::JoinHandle<()>;

pub const HUB_PORT: u16 = 47290;
pub const BEACON_PORT: u16 = 47291;
/// Phòng không phát đèn hiệu quá chừng này thì bỏ khỏi danh sách.
const ROOM_TTL: Duration = Duration::from_secs(3);

type Tx = UnboundedSender<Message>;

#[derive(Default)]
struct Slots {
    host: Option<(u64, Tx)>,
    guest: Option<(u64, Tx)>,
    next: u64,
}

/// Hub đang chạy; drop / `stop` thì ngừng nhận và đóng mọi kết nối.
pub struct Hub {
    pub addr: SocketAddr,
    task: JoinHandle<()>,
    slots: Arc<Mutex<Slots>>,
}

impl Hub {
    pub fn stop(&self) {
        self.task.abort();
        let mut s = self.slots.lock().unwrap();
        for (_, tx) in s.host.take().into_iter().chain(s.guest.take()) {
            let _ = tx.send(Message::Close(None));
        }
    }
}

impl Drop for Hub {
    fn drop(&mut self) {
        self.stop();
    }
}

fn note(t: &str, extra: &str) -> Message {
    Message::text(format!("{{\"t\":\"{t}\",{extra}}}"))
}

pub async fn start_hub(bind: SocketAddr) -> std::io::Result<Hub> {
    let listener = TcpListener::bind(bind).await?;
    let addr = listener.local_addr()?;
    let slots: Arc<Mutex<Slots>> = Arc::default();
    let s = slots.clone();
    let task = tokio::spawn(async move {
        while let Ok((stream, peer)) = listener.accept().await {
            tokio::spawn(serve(stream, peer, s.clone()));
        }
    });
    Ok(Hub { addr, task, slots })
}

async fn serve(stream: TcpStream, peer: SocketAddr, slots: Arc<Mutex<Slots>>) {
    let _ = stream.set_nodelay(true);
    let Ok(ws) = tokio_tungstenite::accept_async(stream).await else { return };
    let (mut sink, mut source) = ws.split();
    let (tx, mut rx) = unbounded_channel::<Message>();
    // Vai: host = kết nối đầu từ chính máy này; guest = kết nối kế (bất kỳ đâu); còn lại từ chối.
    let role = {
        let mut s = slots.lock().unwrap();
        s.next += 1;
        let id = s.next;
        if s.host.is_none() && peer.ip().is_loopback() {
            s.host = Some((id, tx.clone()));
            Some((true, id))
        } else if s.host.is_some() && s.guest.is_none() {
            s.guest = Some((id, tx.clone()));
            if let Some((_, h)) = &s.host {
                let _ = h.send(note("peer", "\"on\":true"));
            }
            Some((false, id))
        } else {
            None
        }
    };
    let Some((is_host, id)) = role else {
        let reason = if slots.lock().unwrap().host.is_none() { "nohost" } else { "full" };
        let _ = sink.send(note("reject", &format!("\"reason\":\"{reason}\""))).await;
        let _ = sink.close().await;
        return;
    };
    let writer = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            let close = matches!(m, Message::Close(_));
            if sink.send(m).await.is_err() || close {
                break;
            }
        }
        let _ = sink.close().await;
    });
    while let Some(Ok(m)) = source.next().await {
        if !(m.is_text() || m.is_binary()) {
            if m.is_close() {
                break;
            }
            continue;
        }
        let other = {
            let s = slots.lock().unwrap();
            if is_host { s.guest.as_ref().map(|g| g.1.clone()) } else { s.host.as_ref().map(|h| h.1.clone()) }
        };
        if let Some(o) = other {
            let _ = o.send(m);
        }
    }
    // Rời phòng: host đi ⇒ đóng cả khách; khách đi ⇒ báo host.
    {
        let mut s = slots.lock().unwrap();
        if is_host {
            if s.host.as_ref().is_some_and(|h| h.0 == id) {
                s.host = None;
                if let Some((_, g)) = s.guest.take() {
                    let _ = g.send(Message::Close(None));
                }
            }
        } else if s.guest.as_ref().is_some_and(|g| g.0 == id) {
            s.guest = None;
            if let Some((_, h)) = &s.host {
                let _ = h.send(note("peer", "\"on\":false"));
            }
        }
    }
    let _ = tx.send(Message::Close(None));
    let _ = writer.await;
}

/// Ống nối của máy khách: nghe 127.0.0.1 cổng ngẫu nhiên, mỗi kết nối đến chuyển thẳng sang `remote`.
pub struct Proxy {
    pub port: u16,
    task: JoinHandle<()>,
}

impl Drop for Proxy {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub async fn start_proxy(remote: SocketAddr) -> std::io::Result<Proxy> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    let port = listener.local_addr()?.port();
    let task = tokio::spawn(async move {
        while let Ok((mut local, _)) = listener.accept().await {
            tokio::spawn(async move {
                let Ok(Ok(mut far)) = tokio::time::timeout(Duration::from_secs(3), TcpStream::connect(remote)).await else {
                    return;
                };
                let _ = local.set_nodelay(true);
                let _ = far.set_nodelay(true);
                let _ = tokio::io::copy_bidirectional(&mut local, &mut far).await;
            });
        }
    });
    Ok(Proxy { port, task })
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct Room {
    pub name: String,
    pub addr: String,
    pub proto: u32,
}

/// Nội dung đèn hiệu (JSON gọn, có khóa `tifa` để bỏ gói lạ).
pub fn beacon_payload(name: &str, port: u16, proto: u32) -> Vec<u8> {
    serde_json::json!({ "tifa": 1, "name": name, "port": port, "proto": proto }).to_string().into_bytes()
}

/// Đọc đèn hiệu nhận từ `from`; gói không phải của TiFa ⇒ None.
pub fn parse_beacon(data: &[u8], from: IpAddr) -> Option<Room> {
    let v: serde_json::Value = serde_json::from_slice(data).ok()?;
    if v.get("tifa")?.as_u64()? != 1 {
        return None;
    }
    let name: String = v.get("name")?.as_str()?.chars().take(40).collect();
    let port = u16::try_from(v.get("port")?.as_u64()?).ok()?;
    let proto = u32::try_from(v.get("proto")?.as_u64()?).ok()?;
    Some(Room { name, addr: SocketAddr::new(from, port).to_string(), proto })
}

/// Phát đèn hiệu mỗi giây tới mọi địa chỉ broadcast của các card mạng IPv4 (và 255.255.255.255).
/// Chạy trên runtime của Tauri (gọi được cả từ lệnh đồng bộ trên luồng chính, nơi không có runtime tokio).
pub fn start_beacon(name: String, port: u16, proto: u32) -> BgTask {
    tauri::async_runtime::spawn(async move {
        let Ok(sock) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).await else { return };
        let _ = sock.set_broadcast(true);
        let payload = beacon_payload(&name, port, proto);
        loop {
            let mut targets = vec![Ipv4Addr::BROADCAST];
            for i in if_addrs::get_if_addrs().unwrap_or_default() {
                if let if_addrs::IfAddr::V4(v4) = i.addr {
                    if let Some(b) = v4.broadcast {
                        if !v4.ip.is_loopback() && !targets.contains(&b) {
                            targets.push(b);
                        }
                    }
                }
            }
            for t in targets {
                let _ = sock.send_to(&payload, (t, BEACON_PORT)).await;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    })
}

/// Danh sách phòng nghe được, phòng nào im quá ROOM_TTL thì bỏ.
#[derive(Clone, Default)]
pub struct RoomList(Arc<Mutex<HashMap<String, (Room, Instant)>>>);

impl RoomList {
    pub fn seen(&self, r: Room) {
        self.0.lock().unwrap().insert(r.addr.clone(), (r, Instant::now()));
    }
    pub fn list(&self) -> Vec<Room> {
        let mut m = self.0.lock().unwrap();
        m.retain(|_, (_, at)| at.elapsed() < ROOM_TTL);
        let mut v: Vec<Room> = m.values().map(|(r, _)| r.clone()).collect();
        v.sort_by(|a, b| a.name.cmp(&b.name).then(a.addr.cmp(&b.addr)));
        v
    }
}

/// Như `start_beacon`: lan_rooms là lệnh đồng bộ, gọi tokio::spawn ở đó làm app sập (0.9.2).
pub fn start_listener(list: RoomList, port: u16) -> BgTask {
    tauri::async_runtime::spawn(async move {
        let Ok(sock) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, port)).await else { return };
        let mut buf = [0u8; 512];
        while let Ok((n, from)) = sock.recv_from(&mut buf).await {
            if let Some(r) = parse_beacon(&buf[..n], from.ip()) {
                list.seen(r);
            }
        }
    })
}

/// Các địa chỉ IPv4 LAN của máy này (hiện cho bạn máy khách nhập tay).
pub fn local_addrs() -> Vec<String> {
    let mut v: Vec<String> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|i| match i.addr {
            if_addrs::IfAddr::V4(a) if !a.ip.is_loopback() && !a.ip.is_link_local() => Some(a.ip.to_string()),
            _ => None,
        })
        .collect();
    v.sort();
    v.dedup();
    v
}

/// Địa chỉ nhập tay: "192.168.1.5" hoặc "192.168.1.5:47290".
pub fn parse_addr(s: &str) -> Option<SocketAddr> {
    let s = s.trim();
    s.parse::<SocketAddr>().ok().or_else(|| s.parse::<IpAddr>().ok().map(|ip| SocketAddr::new(ip, HUB_PORT)))
}

// ---------- Lệnh Tauri ----------

#[derive(Default)]
pub struct LanState {
    hub: Mutex<Option<Hub>>,
    beacon: Mutex<Option<BgTask>>,
    proxy: Mutex<Option<Proxy>>,
    listener: Mutex<Option<BgTask>>,
    rooms: RoomList,
}

#[derive(serde::Serialize)]
pub struct HostInfo {
    port: u16,
    addrs: Vec<String>,
}

fn stop_host(st: &LanState) {
    if let Some(h) = st.hub.lock().unwrap().take() {
        h.stop();
    }
    if let Some(b) = st.beacon.lock().unwrap().take() {
        b.abort();
    }
}

#[tauri::command]
pub async fn lan_host_start(state: tauri::State<'_, LanState>, name: String, proto: u32) -> Result<HostInfo, String> {
    stop_host(&state);
    let hub = start_hub(SocketAddr::from((Ipv4Addr::UNSPECIFIED, HUB_PORT)))
        .await
        .map_err(|e| format!("Không mở được cổng {HUB_PORT}: {e}"))?;
    let port = hub.addr.port();
    *state.hub.lock().unwrap() = Some(hub);
    *state.beacon.lock().unwrap() = Some(start_beacon(name, port, proto));
    Ok(HostInfo { port, addrs: local_addrs() })
}

#[tauri::command]
pub fn lan_host_stop(state: tauri::State<'_, LanState>) {
    stop_host(&state);
}

#[tauri::command]
pub fn lan_rooms(state: tauri::State<'_, LanState>) -> Vec<Room> {
    let mut l = state.listener.lock().unwrap();
    if l.is_none() {
        *l = Some(start_listener(state.rooms.clone(), BEACON_PORT));
    }
    state.rooms.list()
}

#[tauri::command]
pub async fn lan_connect(state: tauri::State<'_, LanState>, addr: String) -> Result<u16, String> {
    let remote = parse_addr(&addr).ok_or_else(|| format!("Địa chỉ không đúng: {addr}"))?;
    let proxy = start_proxy(remote).await.map_err(|e| e.to_string())?;
    let port = proxy.port;
    *state.proxy.lock().unwrap() = Some(proxy);
    Ok(port)
}

#[tauri::command]
pub fn lan_disconnect(state: tauri::State<'_, LanState>) {
    state.proxy.lock().unwrap().take();
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio_tungstenite::connect_async;

    /// Lệnh Tauri đồng bộ (lan_rooms) chạy trên luồng chính, không có runtime tokio: dò phòng / đèn hiệu phải tự
    /// chạy trên runtime của Tauri, không được panic "no reactor running" (app 0.9.2 sập khi mở màn LAN).
    #[test]
    fn listener_and_beacon_start_outside_tokio_runtime() {
        start_listener(RoomList::default(), 0).abort();
        start_beacon("thử".into(), 1, 1).abort();
    }

    async fn next_data<S>(s: &mut S) -> Message
    where
        S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
    {
        loop {
            let m = tokio::time::timeout(Duration::from_secs(3), s.next()).await.expect("hết giờ").expect("đóng").unwrap();
            if m.is_text() || m.is_binary() || m.is_close() {
                return m;
            }
        }
    }

    #[tokio::test]
    async fn hub_relays_both_ways() {
        let hub = start_hub("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let url = format!("ws://{}", hub.addr);
        let (mut host, _) = connect_async(&url).await.unwrap();
        let (mut guest, _) = connect_async(&url).await.unwrap();
        assert_eq!(next_data(&mut host).await, note("peer", "\"on\":true"));
        guest.send(Message::text("{\"t\":\"hello\"}")).await.unwrap();
        assert_eq!(next_data(&mut host).await, Message::text("{\"t\":\"hello\"}"));
        host.send(Message::binary(vec![1u8, 2, 3])).await.unwrap();
        assert_eq!(next_data(&mut guest).await, Message::binary(vec![1u8, 2, 3]));
        guest.send(Message::binary(vec![9u8])).await.unwrap();
        assert_eq!(next_data(&mut host).await, Message::binary(vec![9u8]));
        drop(guest);
        assert_eq!(next_data(&mut host).await, note("peer", "\"on\":false"));
    }

    #[tokio::test]
    async fn hub_rejects_second_guest() {
        let hub = start_hub("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let url = format!("ws://{}", hub.addr);
        let (_host, _) = connect_async(&url).await.unwrap();
        let (_guest, _) = connect_async(&url).await.unwrap();
        let (mut third, _) = connect_async(&url).await.unwrap();
        assert_eq!(next_data(&mut third).await, note("reject", "\"reason\":\"full\""));
    }

    #[tokio::test]
    async fn hub_closes_guest_when_host_leaves() {
        let hub = start_hub("127.0.0.1:0".parse().unwrap()).await.unwrap();
        let url = format!("ws://{}", hub.addr);
        let (host, _) = connect_async(&url).await.unwrap();
        let (mut guest, _) = connect_async(&url).await.unwrap();
        drop(host);
        assert!(next_data(&mut guest).await.is_close());
    }

    #[tokio::test]
    async fn proxy_pipes_bytes() {
        let echo = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let far = echo.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut s, _) = echo.accept().await.unwrap();
            let mut b = [0u8; 5];
            s.read_exact(&mut b).await.unwrap();
            s.write_all(&b).await.unwrap();
        });
        let p = start_proxy(far).await.unwrap();
        let mut c = TcpStream::connect(("127.0.0.1", p.port)).await.unwrap();
        c.write_all(b"xin c").await.unwrap();
        let mut b = [0u8; 5];
        c.read_exact(&mut b).await.unwrap();
        assert_eq!(&b, b"xin c");
    }

    #[tokio::test]
    async fn beacon_roundtrip_and_room_ttl() {
        let r = parse_beacon(&beacon_payload("Đội Đỏ", 47290, 1), "192.168.1.9".parse().unwrap()).unwrap();
        assert_eq!(r, Room { name: "Đội Đỏ".into(), addr: "192.168.1.9:47290".into(), proto: 1 });
        assert!(parse_beacon(b"{\"x\":1}", "10.0.0.1".parse().unwrap()).is_none());
        // Đèn hiệu thật qua UDP loopback tới bộ nghe.
        let list = RoomList::default();
        let sock = std::net::UdpSocket::bind("127.0.0.1:0").unwrap();
        let port = sock.local_addr().unwrap().port();
        drop(sock);
        let _l = start_listener(list.clone(), port);
        tokio::time::sleep(Duration::from_millis(100)).await;
        let tx = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        tx.send_to(&beacon_payload("A", 47290, 1), ("127.0.0.1", port)).await.unwrap();
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(list.list().len(), 1);
    }

    #[test]
    fn parse_addr_defaults_port() {
        assert_eq!(parse_addr(" 192.168.1.5 "), Some("192.168.1.5:47290".parse().unwrap()));
        assert_eq!(parse_addr("10.0.0.2:5000"), Some("10.0.0.2:5000".parse().unwrap()));
        assert_eq!(parse_addr("abc"), None);
    }
}
