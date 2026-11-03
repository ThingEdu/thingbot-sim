# FANROC Thanh Hỏa — các điều đã tự quyết khi thi công (R1–R34)

Thi công ngày 03/11/2026 theo kế hoạch `docs/superpowers/plans/2026-11-03-fanroc-sim.md`
và đặc tả `docs/superpowers/specs/2026-11-03-fanroc-sim-design.md`, nhánh `feat/fanroc`.
Khi đặc tả và kế hoạch không trả lời, em tự quyết và ghi lại ở đây kèm cái giá nếu quyết sai,
để anh duyệt lại và đổi được.

**Anh đã chốt (03/11):** lỗ cờ sâu 30 mm theo CAD (luật ghi 45); Đỏ bên trái (x < 0), Xanh bên phải,
nhìn từ Khu Điều Khiển.

Mục nên xem trước: **R11, R16, R7/R25, R17, R8, R19, R23/R28, R24, R27, R31, R33**.

## Tính điểm và trọng tài

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R1 | `world.tally()` đếm bóng theo hình học (Chữa Cháy: bóng trên sàn, tâm cách mép vùng ≤ bán kính bóng; tầng núi theo vị trí tâm và độ cao); rãnh trang trí gộp vào Rãnh 1; `match.tally()` chỉ cộng thêm cờ và đỗ xe | Sửa nhỏ một chỗ |
| R2 | Mỗi bước, trận đấu tự tính robot đã đỗ: trong pha cuối có ≥ 1 góc robot nằm trong Vùng Bảo Vệ của mình | Kiểm tra "đã về Vùng Bảo Vệ" lệch |
| R15, R15a | Bóng thuộc tầng nào: bắn tia thẳng xuống, trúng núi và gần đáy rãnh nào thì tính rãnh đó (tia dài 0,034 m vì bóng kẹt rãnh trang trí nằm cao ~10 mm) | Tốn thêm thời gian tính mỗi bước |
| R16 | Lỗ cờ đang có bóng thì không cắm được cờ (lỗ Ø45, bóng Ø40), robot báo "Lỗ cờ đang có bóng" | Đổi sang "bóng bị đẩy ra" |
| R18 | 4 robot là 4 đội chung điểm liên minh; một lỗi chỉ tính lại sau khi hết vi phạm 1 s; chồng lấn P12 lấy mẫu theo hình chiếu robot | Trọng tài nghiêm/lỏng hơn mong muốn |
| R19 | Phạt "chặn robot" G15 chỉ khi hai robot khác liên minh, không phạt khi một robot đang ở Vùng Bảo Vệ/Tiếp Tế của mình, phạt robot lao vào, không rõ thì chỉ cảnh cáo | Trọng tài dễ hơn luật |
| R20 | S02 (xuất phát đúng ô) cho sai số 5 mm | Không đáng kể |

## Sân theo CAD

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R10 | Sửa bước 4 gộp luôn việc cập nhật sân theo file STEP anh gửi | Bước 5 bắt đầu muộn hơn |
| R11 | CAD thắng số trong luật khi khác nhau: đáy rãnh 0,005/0,040/0,080/0,110 m, đỉnh gờ 0,015/0,050/0,095/0,125, đỉnh núi 0,160, lỗ Ø45 sâu 0,030, tâm và góc xoay 4 núi theo CAD, Vùng Bảo Vệ z −0,5888…−0,2138, Chữa Cháy 0,6088…1,1969 | Đổi số trong một file `src/fanroc/layout.ts` |
| R12 | Va chạm núi là lưới tam giác lấy từ CAD, lưu ở `src/fanroc/assets/mountain-mesh.json` (cũng dùng để vẽ). **Lưới là của anh, phải hỏi anh trước khi push/đăng** | Gờ mỏng có thể cho bóng xuyên qua |
| R13 | Bóng ra ở cửa Hộp Phân Phối theo CAD (z −1,2005, cao ~0,446, x trong ±0,18), xanh trước cam sau; bản thân hộp không có va chạm | Cảnh xả bóng trông khác thật |
| R14 | Vị trí xuất phát = 4 robot giữ chỗ trong CAD; bỏ qua khung trên cao | Không có |
| R22 | Hộp Phân Phối vẽ ở cao 0,421…0,776 (đặt trên giá); số 0…0,355 em đưa lúc đầu là sai | — |
| R21 | Núi vẽ từ cùng lưới CAD; vòng lặp bước cố định, tối đa 4 bước con; `window.__fanroc` có ở mọi bản dựng | Nhỏ |

## Robot và cổng ThingBot

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R7, R25 | Xe Phân Loại: S2 chọn ngăn, S3 mở cửa xả ngăn đang chọn; khối L1 = ngăn cam, L2 = ngăn xanh | Đổi vai 2 servo trong `robots.ts` và chương trình mẫu |
| R8 | Điểm xả bóng của Xe Ủi/Cờ/Phân Loại là số tạm (cao 0,1/0,2/0,1, tầm 0,05); Xe Ủi và Phân Loại không có tay vươn | Chỉnh trong `robots.ts` |
| R17, R17a | Tay cờ chạy bằng S1 (góc/180): Xe Cắm Cờ vươn tới 0,14 m, Maker nâng 0,06 m; S1 rỗng thì giữ nguyên; hình chiếu robot tính cả tay | Chỉnh số khi có robot thật |
| R33 | Xe Ủi không có S3 nên Human Player không nạp bóng ("Robot không có cửa xả"); lệnh S3 chỉ có tác dụng với robot có S3 | Hẹp hơn quy tắc trong kế hoạch |
| R34 | Agent không đưa robot không có S3 về Khu Tiếp Tế (theo R33) | Chưa có phép thử riêng |

## Human Player, tay cầm, trang

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R3 | Nạp bóng thành công phát sự kiện bắt đầu bằng "nhận bóng" | Đổi tên sau |
| R4 | Trang mở `window.__fanroc` (trận, robot, sân, tốc độ) để phép thử trình duyệt đọc | Nhỏ |
| R23, R28 | Sửa tối thiểu file dùng chung `src/sim-extra.ts`: khi trang báo có tay PS2 thì đọc cần analog thô (đẩy hết cỡ = 0, trước đây bị đọc thành 128), thêm kiểu bool/int; bài học robot.edu.vn kiểm lại vẫn đạt | Chạm vào trang đang chạy thật |
| R24 | Có chương trình khối đang chạy thì khoá tốc độ ×1, tắt ×4/×40 kèm ghi chú | Không tua nhanh được trận của học sinh |
| R26 | Tay cầm gắn vào ghế theo thứ tự cắm lần đầu; rút ra thì ghế đó đứng yên, không xếp lại | Không có |
| R27 | Mỗi ghế chọn rõ: Chương trình / Agent mức độ / Chương trình của Robot N. Mặc định Robot 1 chạy chương trình, Robot 2–4 do agent lái | Muốn 2 người lái phải chọn tay cho Robot 2 |
| R29 | Bấm ▶ trên ghế agent thì ghế chuyển sang "Chương trình" (có hiện và ghi log) | — |
| R31 | Chế độ Luyện tập tua nhanh 10 s xả bóng lúc bắt đầu để chương trình chạy ngay | Mất cảnh xả bóng khi luyện tập |
| R32 | Thẻ robot báo "M1 = 10 % < 20 %: động cơ TT không quay" khi lệnh nằm trong vùng chết | Không có |

## Kiểm thử

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R5 | Phép thử agent (19 trận chạy ngầm) để trong `test:unit` | Chạy lâu (~150 s) |
| R6 | `test:unit` = `node --test "src/fanroc/**/*.test.ts"` (Node 25 không nhận dạng thư mục) | Không có |
| R9 | Sân có thêm `holeCentres()`, `inMountain(x,z)`; xả bóng dùng bộ sinh số ngẫu nhiên có hạt, 300 bóng ra hết trong ~8 s | Đổi giao diện nhỏ |
| R30 | Phép thử trình duyệt tự bật Vite ở cổng trống (hoặc biến `FANROC_URL`), không dùng cổng 5190 của bản checkout khác | Không có |

## Phát hiện về luật chơi (đáng báo ban tổ chức/học sinh)

- Mẫu Maker 2 bánh ở mức Vừa **không cắm được cờ Núi D**: lối đi 0,29 m, cần 0,38 m để quay ⇒ tối đa 3 cờ.
- Riêng pha xả bóng đầu trận làm mất ≈ **−156 điểm** (≈ 47 bóng xanh rơi vào Khu Chữa Cháy); con số phụ thuộc tốc độ bóng ra khỏi hộp mà em ước lượng.
- Vật cản trước ô xuất phát là chân Núi A (đúng theo CAD).
- Điểm trung bình của agent: Dễ 416,7 / Vừa 621,0 / Khó 891,7.

## Còn để lại (nhỏ, chưa làm)

- Tay vươn của Maker chưa có va chạm (xuyên tường/núi khi vươn).
- Bóng có thể kẹt trong rãnh trang trí 22 mm; ray nhôm 3,8 mm trên rào chưa dựng.
- Human Player tự động bỏ qua robot đầy bóng nhưng không thử robot kế tiếp.
- `agent.ts` dài ~1100 dòng, nên tách phần tìm đường.
- Logic chọn chế độ ghế trong `main.ts` chỉ được kiểm bằng phép thử trình duyệt.
- Chưa mở thử 4 file `.tb` xuất ra trong ThingBlock desktop.
