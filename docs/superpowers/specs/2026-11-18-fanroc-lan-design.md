# TiFa: thi hai máy qua mạng LAN (phương án A) — thiết kế

Ngày 18/11/2026. Anh Tuấn duyệt mô tả trong chat ("ok đã đủ bạn làm đi"); luật vẫn V4 (chưa có V5).

## Vì sao

Bản 0.9.1 cho hai bạn chơi chung một máy (chia đôi màn hình). Ở phòng máy trường và tại địa điểm thi, hai liên minh
muốn ngồi hai máy riêng và đấu cùng một sân, như trận thật: Đỏ một máy, Xanh một máy. Không cần internet.

## Mục tiêu

- Một trận đầy đủ luật V4 (10 s xả bóng + 180 s, trọng tài tự động, hệ số leo) giữa hai máy cùng mạng LAN / Wi-Fi.
- **Máy chủ** (bấm «Tạo phòng») chạy toàn bộ vật lý, đồng hồ, trọng tài, robot máy, Human Player. **Máy khách**
  (bấm «Vào phòng») gửi lệnh cổng của robot mình lên và vẽ lại sân theo ảnh chụp trạng thái máy chủ gửi về.
- Máy chủ = liên minh Đỏ (ghế 0, 2), máy khách = Xanh (ghế 1, 3). (Em chọn; anh không phản đối.)
- Mỗi máy 1 hoặc 2 bạn (bàn phím / tay cầm, hai bạn thì chia đôi màn hình như 0.9.1). Ghế trống: robot máy chạy trên
  máy chủ, mức máy theo ⚙ của máy sở hữu ghế đó.
- Mỗi đội dùng robot đã lắp và chương trình của mình ở Xưởng trên máy mình (Của em vN / Mặc định), như Trận lẻ.
- Hai bên cùng bấm «Sẵn sàng» → máy chủ đếm ngược 3 s → trận. Hết giờ hai máy hiện cùng bảng điểm (số của máy chủ).
- Rớt mạng: máy khách mất kết nối ⇒ robot Xanh đứng yên (cổng trung tính) trên máy chủ, hai máy báo; nối lại trong
  10 s thì trận chạy tiếp, quá 10 s robot Xanh tiếp tục đứng yên tới hết trận (không hủy). Máy chủ mất ⇒ máy khách báo
  "Trận bị hủy" và về phòng chờ.

## Không làm (bản này)

Thi qua internet / cloud; hơn hai máy; máy khán giả; tạm dừng hay tua nhanh trong trận mạng (luôn ×1, không ⏸ ⏭);
đổi người lái giữa trận; giải đấu nhiều trận qua mạng (chỉ trận lẻ).

## Cách làm (quyết định kỹ thuật — em chọn)

### Vì sao chương trình chạy ở máy của đội

Robot "lái tay" trong TiFa thật ra là chương trình TeleOp (khối ThingBlock) chạy trong bo ảo đọc tay PS2 ảo. Vậy máy
khách cứ chạy bo ảo của mình như Trận lẻ, mỗi khung đọc `link.ports()` (PortValues của ghế 1, 3) và gửi lên. Máy chủ
coi hai ghế đó là người lái kiểu mới `{ kind: 'remote' }` lấy cổng mới nhất đã nhận. Nhờ vậy chương trình khối của
học sinh chạy qua mạng mà không cần gì thêm. Bo ảo máy khách chỉ chạy khi pha (theo ảnh chụp) là 'play'.

### Đồng bộ: máy chủ là trọng tài duy nhất

Không chạy vật lý song song hai máy (Mac / Windows tính số thực khác nhau, sau vài giây lệch). Máy khách dựng một
GameSession "gương" cùng seed, cùng 4 robot, **không bao giờ advance**; mỗi ảnh chụp tới thì ghi đè trạng thái:

- Robot (mỗi robot là một rigid body): vị trí + quay, `stored`, `compartments`, `extend`, `armFrac`, `hasFlag`, cờ rơi
  (vị trí hoặc không), `climb`, `hookDeg`, `lastMessage`.
- Bóng (300): `st` từng quả; vị trí cho quả đang 'field'. Máy khách không tạo vật Rapier cho bóng — dùng vật giả chỉ có
  `translation()` (cảnh 3D chỉ đọc vậy).
- Trận: `t`, `phase`, `pens`, `flags`, sự kiện mới (theo số thứ tự), bảng tally + điểm của máy chủ. `Match` thêm chế độ
  gương: `tally()` / `result()` trả số máy chủ gửi, không tự tính từ thế giới.
- Human Player: khay (tray) hai liên minh.

Ảnh chụp gửi mỗi khung máy chủ (≤ 60 lần/s), mã nhị phân gọn (Float32 + byte trạng thái + một đoạn JSON nhỏ cho sự
kiện / điểm), cỡ vài KB. Máy khách vẽ ảnh mới nhất (chưa nội suy ở bản này; đo trên Wi-Fi thật rồi tính).

### Đường truyền

Trang (WebView) chỉ mở WebSocket tới **127.0.0.1** — chạy giống nhau trên trình duyệt (dev, e2e) và trong app, tránh
chuyện WKWebView chặn `ws://` ra IP khác. Phần Rust của app Tauri lo mạng thật:

- **Hub** (máy chủ): WebSocket server nghe `0.0.0.0:47290`. Kết nối đầu từ 127.0.0.1 là "host"; nhận một "guest" từ
  mạng; chuyển nguyên thư qua lại (chữ và nhị phân). Guest thứ hai bị từ chối "Phòng đã đủ".
- **Đèn hiệu** (máy chủ): UDP broadcast mỗi giây ở cổng 47291: tên phòng, cổng, phiên bản giao thức.
- **Dò phòng** (máy khách): nghe 47291, trả danh sách phòng thấy trong 3 s gần nhất. Wi-Fi trường chặn broadcast thì
  nhập tay địa chỉ IP máy chủ (màn hình máy chủ hiện IP to rõ).
- **Ống nối** (máy khách): mở 127.0.0.1:cổng-ngẫu-nhiên, chuyển thẳng TCP sang `ip:47290` của máy chủ.
- Lệnh Tauri: `lan_host_start(name) -> {port, addrs}`, `lan_host_stop()`, `lan_rooms() -> [{name, addr, proto}]`,
  `lan_connect(addr) -> localPort`, `lan_disconnect()`.
- Trình duyệt (dev / e2e): chạy hub bằng `cargo run --bin fanroc-lan-hub` (cùng mã Rust); trang nối thẳng
  `ws://127.0.0.1:47290`, không có dò phòng / ống nối (ô nhập địa chỉ bỏ qua).

### Giao thức (JSON, trừ ảnh chụp nhị phân)

`hello {proto, app, team, players, robots[2], skill}` (khách) → `welcome {seed}` hoặc `reject {reason}` (khác phiên
bản giao thức ⇒ "Hai máy phải cùng phiên bản TiFa") · `lobby {host, guest}` · `ready {on}` · `start {seed, seats}` ·
`loaded` · `go {at}` (đếm ngược) · `in {seq, ports: [PortValues, PortValues]}` (khách, mỗi khung) · ảnh chụp (nhị
phân) · `end {result}` · `bye`. Không thư nào từ khách quá 2 s ⇒ máy chủ coi là rớt; khách không nhận ảnh chụp 2 s ⇒
báo mất kết nối và thử nối lại tới 10 s.

### Giao diện

- Màn chính thêm ô **«Thi qua mạng LAN»**.
- Màn phòng chờ: hai nút Tạo phòng / Vào phòng; danh sách phòng tìm thấy + ô nhập IP; khi đã nối: hai cột Đỏ / Xanh
  (tên đội, robot, số bạn), nút Sẵn sàng mỗi bên, dòng trạng thái mạng (độ trễ ms). Máy chủ hiện IP của mình.
- Trận: dùng lại màn trận, chia đôi khi máy có 2 bạn; thanh trên thêm chấm mạng (xanh / vàng / đỏ + ms). Không ⏸ ⏭ ×2.
- Hết trận: bảng điểm như Trận lẻ, nút «Về phòng chờ» (đấu lại cùng đối thủ).

### Lời cho học sinh / thầy cô

Hướng dẫn học sinh thêm đoạn "Thi hai máy": cùng mạng, cùng phiên bản, lần đầu Windows / macOS hỏi cho phép kết nối
mạng thì bấm Cho phép, Wi-Fi chặn tìm phòng thì nhập IP.

## Ràng buộc giữ nguyên

src/sim-worker.ts chỉ thêm; không sửa src/sim-extra.ts, src/blocks.ts, src/main.ts gốc; không thêm khối ThingBlock;
không sửa ../thingblock-editor-sim; cổng dev 5191; không chạm 192.168.1.201; NOTICE / Nguồn giữ và thêm crate mới
(tokio-tungstenite, giấy phép MIT/Apache); test phải chứng minh được bằng phá hỏng có chủ đích.

## Kiểm thử

- Đơn vị: mã hóa / giải mã ảnh chụp; áp ảnh chụp vào phiên gương ⇒ mọi thứ cảnh 3D và bảng điểm đọc (vị trí robot,
  bóng, stored, leo, t, pha, điểm, phạt, cờ, sự kiện) bằng máy chủ sau một trận chạy thật vài giây; người lái 'remote'
  đổi cổng ⇒ robot trên máy chủ chạy theo; trạng thái phòng chờ (ready / start / rớt / nối lại 10 s).
- Rust (`cargo test`): hub chuyển thư hai chiều, từ chối khách thứ hai; ống nối chuyển byte.
- e2e (hai trang Chromium + hub Rust): tạo phòng, vào phòng, sẵn sàng, trận chạy; bấm W ở máy khách ⇒ robot Xanh chạy
  trên cả hai máy; tua giờ trận (móc thử) tới hết ⇒ hai trang cùng bảng điểm; đóng trang khách ⇒ máy chủ báo rớt,
  robot Xanh đứng yên.
- Thử thật hai máy (Mac + Windows) do anh làm với bản phát hành; em ghi các bước.

## Để người làm tự quyết

Bố cục chi tiết màn phòng chờ; mã nhị phân cụ thể; cách hiện độ trễ; tên tệp mới (gợi ý `src/fanroc/net/`).
