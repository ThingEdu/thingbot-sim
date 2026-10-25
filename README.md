# ThingBot Sim — 10 bài cơ bản

Web mô phỏng mạch ThingBot theo bài học, kiểu Learn Arduino nhưng dùng **khối ThingBlock thật**. Bản này là spike S0 của spec `ThingBot-Sim-Web-Sample.md` v0.2, để kiểm câu hỏi "trẻ có nhìn ra dòng chảy dữ liệu từ khối hay không". Có hai bài, chọn trên thanh trên:

| Bài | Nội dung | Trên màn hình | Chấm |
|---|---|---|---|
| 1 | Làm quen ThingBot (không code) | 13 bộ phận bấm được, nhìn xuyên Core, 2 câu đố | tự chấm |
| 2 | Đèn nhấp nháy | dải Nhịp đèn, đếm vòng lặp | luật `kiểm:` ThingBlock + ngưỡng sáng/tắt thấy được |
| 3 | Nút bấm điều khiển đèn | Nút SW → IO3 → não → I2C → PCA9685 → L1 | tự chấm |
| 4 | Màn hình OLED | màn OLED ở cổng I2C, vẽ đúng khung hình SSD1306 | luật `OLED hiện "…"` |
| 5 | Servo quét | servo S1 có cần quay, công tắc nguồn | luật `servo S1 ở … độ` + bước quét |
| 6 | Cảm biến khoảng cách | siêu âm (TRIG IO0, ECHO IO4) + thanh kéo vật cản | tự chấm |
| 7 | Động cơ DC | động cơ TT + bánh ở M1, IC động cơ, công tắc nguồn | tự chấm (chiều theo bộ sinh mã) |
| 8 | Xe đi thẳng – rẽ | sàn 3 m × 2 m, M1 trái / M2 phải, vệt đường đi | theo chuyển động xe |
| 9 | Tay cầm điều khiển | tay cầm PS2 ảo (▲▼◀▶ hoặc phím mũi tên) | theo chuyển động xe |
| 10 | Dự án: xe tránh vật cản | sàn có hộp, nón siêu âm, quán tính, đếm va chạm | đi 3 m không đâm |

Siêu âm và PS2 chưa có bản mô phỏng trong ThingBlock: `src/sim-extra.ts` tự sinh mã mô phỏng cho hai gói này.

Không nạp xuống mạch thật, không có tài khoản, không có backend.

## Chạy thử tự động

`npm run smoke` (cần `npm run dev` đang chạy): mở từng bài 2–10 trên Chromium không giao diện, nạp lời giải mẫu và làm thao tác của trẻ — bước đang mở phải ✓; rồi chạy khung trống — không bước nào được ✓.

## Chạy

Cần checkout `thingblock-editor` có gói `thingblock-sim` (nhánh `feat/sim-m0`, PR #25) nằm cạnh repo này và đã `npm ci`:

```
~/Ai-Code/thingblock-editor-sim   ← worktree feat/sim-m0
~/Ai-Code/thingbot-sim            ← repo này
```

```
npm install
npm run dev        # http://localhost:5190
npm run build      # trang tĩnh ở dist/ (Vercel: framework "Vite")
```

Checkout ở chỗ khác: `THINGBLOCK_EDITOR=/đường/dẫn npm run dev`.

## Mã ThingBlock được dùng thẳng (không chép)

| Từ ThingBlock | Dùng để |
|---|---|
| `scratch-blocks/src` | vùng khối, `SimGenerator`, `ArduinoGenerator`, chữ tiếng Việt của khối lõi |
| `thingblock-resource/.../thingbot-core/{blocks,generator,sim}.ts` | khối ThingBot, mã Arduino, mã mô phỏng |
| `thingblock-sim/src` | `Session`: đồng hồ ảo, PCA9685 ảo, chạy từng khối |
| `scratch-gui/.../color-mode/default` | bảng màu khối |

Phần của repo này chỉ là "vỏ": `scene.ts` (mạch 3D dựng từ ảnh chụp mạch thật), `lessons/` (mỗi bài một file: hộp khối, các bước, bộ chấm), `main.ts` (dải dòng chảy, dải nhịp đèn), `sim-worker.ts` (bọc Session của thingblock-sim, thêm hoạt động bus + chấm luật).

## Điều spike phát hiện

- **Snapshot của thingblock-sim thiếu hoạt động bus.** `sim-worker.ts` tạm bọc `$.digitalRead` và `pwm.setPWM` để đếm lần đọc IO3 / ghi kênh PCA giữa hai snapshot. Nên đưa trường `bus` này vào `Snapshot` chính thức.
- Số liệu thật có giá trị dạy học: chương trình mẫu hỏi nút ≈ 1 842 lần/giây khi mỗi vòng có ghi I2C, ≈ 500 000 lần/giây khi vòng không ghi gì — trẻ thấy "nói chuyện với chip PCA" tốn thời gian.
- Lỗi hay gặp "chỉ có lệnh bật" được bắt đúng: giữ nút → ✓ bước 2, nhả nút đèn vẫn sáng → không ✓ bước 3, hiện gợi ý dùng «nếu … thì … nếu không thì».
- Bố cục cổng trên mạch là **tạm**; chờ phần cứng gửi toạ độ đo từ STEP.
- Bản build ≈ 400 KB gzip (Blockly + Three.js), chưa thử trên NEO One.

## Giấy phép

AGPL-3.0 (theo `thingblock-sim`).
