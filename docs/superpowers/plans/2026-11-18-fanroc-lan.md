# TiFa thi hai máy qua LAN — kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hai máy cùng LAN đấu một trận FANROC V4: máy chủ (Đỏ) chạy vật lý, máy khách (Xanh) gửi cổng và vẽ theo ảnh chụp.

**Architecture:** Rust trong app Tauri lo socket (hub WebSocket 47290, đèn hiệu UDP 47291, ống nối TCP); trang chỉ nối
`ws://127.0.0.1`. Phía TS: `src/fanroc/net/` gồm ảnh chụp (chụp / mã hóa / áp vào phiên gương), phòng (máy trạng thái
thuần, transport giả được), backend (Tauri hay trình duyệt). main.ts thêm màn 'lan' (phòng chờ) và 'lanmatch'.

**Tech Stack:** TypeScript (node --test), Rapier compat, three.js, Tauri 2 + tokio + tokio-tungstenite, Playwright e2e.

**Spec:** docs/superpowers/specs/2026-11-18-fanroc-lan-design.md

## Global Constraints

- src/sim-worker.ts chỉ thêm; không sửa src/sim-extra.ts, src/blocks.ts, src/main.ts gốc; không thêm khối ThingBlock; không sửa ../thingblock-editor-sim.
- Cổng dev 5191 (không 5190); luôn đặt FANROC_URL / SIM_URL cho script; không chạm 192.168.1.201.
- Mỗi test mới phải được chứng minh fail bằng phá hỏng có chủ đích (ghi vào báo cáo).
- NOTICE / mục Nguồn thêm crate mới.
- Cổng mạng: hub 47290 (TCP/WebSocket), đèn hiệu 47291 (UDP). Giao thức `proto: 1`.
- Máy chủ = Đỏ (ghế 0, 2), máy khách = Xanh (ghế 1, 3). Rớt khách: chờ nối lại 10 s; im lặng 2 s = rớt.

## Review Focus

1. Ảnh chụp tới khi phiên gương chưa dựng xong / của trận cũ (seed khác) ⇒ bỏ qua, không ném lỗi.
2. Khách đóng trang giữa trận ⇒ máy chủ không kẹt, robot Xanh đứng yên, trận chạy tới hết.
3. Bàn phím đang gõ ô IP ⇒ không lái robot (typing đã có, ô mới phải là input).
4. Hai máy khác phiên bản giao thức ⇒ lời báo rõ, không vào trận.
5. Bo ảo máy khách chạy trước pha 'play' (10 s xả bóng) ⇒ không được: chỉ start khi ảnh chụp báo 'play'.

---

### Task 1: Rust — hub, đèn hiệu, dò phòng, ống nối

**Files:** Create `src-tauri/src/lan.rs`, `src-tauri/src/bin/fanroc-lan-hub.rs`; Modify `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`.

- [ ] Test (cargo): `hub_relays_both_ways` — host nối 127.0.0.1, guest nối; chữ và nhị phân đi hai chiều. `hub_rejects_second_guest` — guest 2 nhận thư `{"t":"reject","reason":"full"}` rồi đóng. `proxy_pipes_bytes` — echo server qua ống nối.
- [ ] Cài: `Hub::start(port) -> Hub` (tokio), vai host = kết nối đầu từ loopback; khách mất thì host nhận `{"t":"peer","on":false}`, khách vào nhận `{"t":"peer","on":true}` gửi cho host. `beacon(name, port)` UDP broadcast 1 s; `rooms()` nghe 47291, giữ 3 s. `proxy(addr) -> local_port`.
- [ ] Lệnh Tauri `lan_host_start/lan_host_stop/lan_rooms/lan_connect/lan_disconnect`; bin `fanroc-lan-hub [port]`.
- [ ] Phá hỏng: bỏ chuyển nhị phân ⇒ test 1 fail. Commit.

### Task 2: Ảnh chụp và phiên gương

**Files:** Create `src/fanroc/net/snapshot.ts`, `snapshot.test.ts`; Modify `game.ts` (Driver 'remote', `startLoaded` công khai thành `gate()`), `match.ts` (`mirror(state)`), `world.ts` nếu cần.

- [ ] Test: chạy phiên máy chủ 'match' với agent 6 s (qua xả bóng), `decode(encode(capture(host)))` áp vào phiên gương cùng seed/robot ⇒ bằng nhau: pose (±1e-4), y thân, stored, compartments, extend, armFrac, hasFlag, climb, hookDeg, mọi `balls[i].st` và vị trí bóng 'field', match t/phase/pens/flags/events, `tally()` và `result()`, khay Human Player.
- [ ] Test: Driver `{kind:'remote', ports: () => PortValues}` — đặt M1..M4 = 80 ⇒ robot ghế 1 đi khỏi chỗ xuất phát sau 1 s pha play.
- [ ] Test: ảnh chụp seed khác ⇒ `apply` trả false, không đổi gì.
- [ ] Phá hỏng: bỏ `stored` khỏi ảnh chụp ⇒ test fail. Commit.

### Task 3: Phòng (máy trạng thái thuần)

**Files:** Create `src/fanroc/net/room.ts`, `room.test.ts`, `src/fanroc/net/transport.ts`.

- [ ] Interface `Transport { send(data: string | ArrayBuffer): void; onMessage?: (d) => void; onClose?: () => void; close(): void }`.
- [ ] `HostRoom` / `GuestRoom`: hello/welcome/reject(proto), lobby, ready, start, loaded, go (đếm 3 s), in, end, bye; đồng hồ tiêm được (`now()`).
- [ ] Test với cặp transport giả: sẵn sàng hai bên ⇒ start; proto khác ⇒ reject với lời "Hai máy phải cùng phiên bản TiFa"; khách im 2 s ⇒ `guestLost`; nối lại trước 10 s ⇒ `guestBack`; máy chủ im 2 s ⇒ khách `hostLost`.
- [ ] Phá hỏng: đổi ngưỡng im lặng ⇒ test fail. Commit.

### Task 4: Backend mạng

**Files:** Create `src/fanroc/net/backend.ts` (+ test phần thuần).

- [ ] `lanBackend()`: có `window.__TAURI_INTERNALS__` ⇒ gọi lệnh Tauri; không ⇒ trình duyệt: host/guest nối `ws://127.0.0.1:47290` (hoặc `?lanhub=` cho e2e), `rooms()` rỗng.
- [ ] `wsTransport(url)` bọc WebSocket (binaryType arraybuffer). Commit.

### Task 5: Giao diện + nối vào main.ts

**Files:** Create `src/fanroc/ui/lan.ts` (+ test phần thuần); Modify `ui/home.ts` (ô «Thi qua mạng LAN»), `ui/router.ts` ('lan', 'lanmatch'), `main.ts`, `ui/shell.ts` (chấm mạng).

- [ ] Phòng chờ: Tạo phòng / Vào phòng, danh sách phòng, ô IP, hai cột Đỏ/Xanh, Sẵn sàng, dòng trạng thái.
- [ ] Máy chủ: phiên 'match' ghế 1, 3 driver 'remote' (hoặc agent khi khách 1 bạn); mỗi khung gửi ảnh chụp; `end` khi hết giờ.
- [ ] Máy khách: phiên gương, mỗi khung áp ảnh chụp mới nhất, gate bo ảo theo pha, gửi `in`; không ⏸ ⏭ ×2.
- [ ] `__fanroc.lan` cho e2e (trạng thái phòng, đặt giờ trận ở máy chủ). Commit.

### Task 6: e2e, tài liệu, NOTICE

- [ ] e2e L1 (tạo/vào/sẵn sàng/trận chạy, W ở khách ⇒ robot Xanh chạy trên hai trang), L2 (tua tới hết ⇒ cùng bảng điểm), L3 (đóng khách ⇒ máy chủ báo rớt, robot Xanh đứng yên), L4 (proto khác ⇒ báo).
- [ ] quyet-dinh.md R170+, hướng dẫn học sinh đoạn "Thi hai máy", NOTICE crate. Commit.
