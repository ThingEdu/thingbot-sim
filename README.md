# ThingBot Sim — bài 2 (Đèn nhấp nháy) + bài 3 (Nút bấm)

Web mô phỏng mạch ThingBot theo bài học, kiểu Learn Arduino nhưng dùng **khối ThingBlock thật**. Bản này là spike S0 của spec `ThingBot-Sim-Web-Sample.md` v0.2, để kiểm câu hỏi "trẻ có nhìn ra dòng chảy dữ liệu từ khối hay không". Có hai bài, chọn trên thanh trên:

- **Bài 2 — Đèn nhấp nháy:** vòng lặp Arduino + `set led` + `đợi`. Chấm bằng đúng luật `kiểm: L1 nhấp nháy, chu kỳ …` của ThingBlock (chạy trong worker), có thêm dải *Nhịp đèn* (đèn sáng/tắt theo thời gian) và ô *Não* đếm số vòng.
- **Bài 3 — Nút bấm điều khiển đèn:** nút SW → IO3 → não → I2C → PCA9685 → L1.

Không nạp xuống mạch thật, không có tài khoản, không có backend.

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
