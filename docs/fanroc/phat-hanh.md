# Phát hành ThingBot FanRoc Game

Tài liệu cho người vận hành (anh Tuấn và đội sự kiện). Hai đường phát hành: **bản máy tính (desktop)** và **bản web sự kiện** chạy tĩnh trên máy 201.

> Hiện **chưa có bản Windows / Linux**. Chỉ có bản macOS (`npm run dist:game`).

## 1. Bản desktop (macOS)

Dựng: `npm run dist:game` (Tauri) — ra `src-tauri/target/release/bundle/macos/ThingBot FanRoc Game.app` (không dựng `.dmg`).

Cài và mở:

1. Kéo **ThingBot FanRoc Game** vào thư mục Applications.
2. Ứng dụng **chưa được ký** của Apple nên lần đầu macOS sẽ chặn. Bấm chuột phải vào ứng dụng, chọn **Mở (Open)**, rồi bấm **Mở** ở hộp thoại. Từ lần sau mở như thường.
3. Chương trình khối xuất ra là tệp `.tb`, được lưu vào thư mục **Downloads** (Tải về) của máy; nạp tệp này vào ThingBot thật như bình thường.

## 2. Bản web sự kiện (máy 201)

Bản web là tệp tĩnh (`dist-game/`, đường dẫn tương đối nên đặt ở thư mục con nào cũng chạy). Kịch bản `scripts/event-201.sh` đẩy bản này lên máy 201 và phục vụ trong mạng LAN.

Nguyên tắc an toàn của kịch bản:

- Chỉ dùng khoá SSH sẵn có (không lưu, không hỏi mật khẩu), không `sudo` (cổng 8090 > 1024).
- Chỉ ghi trong `~/fanroc-game/` trên máy 201; `rsync --delete` chỉ áp lên thư mục con `~/fanroc-game/site/`.
- `push` và `start` **từ chối chạy** nếu không có xác nhận rõ (`--yes` hoặc `CONFIRM=yes`) và luôn in lại checklist ở mục 3.
- `stop` chỉ tắt máy chủ do kịch bản bật (đọc pidfile `~/fanroc-game/server.pid`, kiểm tiến trình đúng là của thư mục này), không bao giờ tắt theo tên tiến trình.
- Thêm `DRY_RUN=1` vào bất kỳ lệnh nào để chỉ **in** lệnh sẽ chạy.

Lệnh:

```bash
scripts/event-201.sh build            # dựng dist-game/ trên máy này
scripts/event-201.sh push --yes       # rsync dist-game/ -> 201:~/fanroc-game/site/
scripts/event-201.sh start --yes      # bật máy chủ tĩnh, in địa chỉ LAN
scripts/event-201.sh status           # xem đang chạy không
scripts/event-201.sh stop             # tắt khi hết sự kiện
```

Biến tuỳ chọn: `HOST` (mặc định `192.168.1.201`), `SSH_USER`, `DIR` (mặc định `fanroc-game`, thư mục con của thư mục nhà), `PORT` (mặc định `8090`), `BIND` (mặc định `0.0.0.0`). Ví dụ: `PORT=8123 scripts/event-201.sh start --yes`.

Máy chủ dùng `python3 -m http.server --directory ~/fanroc-game/site`; nếu máy 201 có `caddy` thì dùng caddy với Caddyfile ghi trong `~/fanroc-game/`. Địa chỉ cho khách trong mạng LAN: `http://192.168.1.201:8090/`.

Mỗi lần chạy thật là quyết định của người vận hành; nên thử `DRY_RUN=1` trước để xem lệnh.

## 3. Checklist trước khi công khai

- [ ] **Lưới núi CAD** (`src/fanroc/assets/mountain-mesh.json`) là của anh Tuấn: cần anh đồng ý rõ trước bất kỳ sự kiện công khai nào. Không đăng / push tệp này.
- [ ] **Hình robot CAD** (`src/fanroc/assets/robot-maker.json`, dựng từ mẫu Onshape "Bộ thingbot mới") là của anh Tuấn: cần anh đồng ý rõ trước khi đăng công khai.
- [ ] **Tên và logo FANROC**: đã được ban tổ chức cho phép dùng.
- [ ] **Link mã nguồn AGPL** hiện rõ trong trang và bấm vào mở đúng kho mã.
- [ ] **Link ThingBlock**: hiện **chưa có** (`THINGBLOCK_URL` đang để `''`). Xác nhận đúng ý định, hoặc điền link khi sẵn sàng.
- [ ] **Câu chữ luật thi** đã được anh Tuấn rà.
- [ ] **Nhiệm vụ 9** đã chơi thử từ đầu đến cuối.
- [ ] Bản Windows / Linux chưa phát hành: thông báo rõ cho người tham dự nếu họ hỏi.
