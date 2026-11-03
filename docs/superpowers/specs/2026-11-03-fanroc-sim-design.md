# Mô phỏng FANROC 2026 "Thanh Hỏa" trên ThingBlock thật

Ngày: 03/11/2026 · Người đặt hàng: Tuấn (ThingEdu) · Phát hành: Maker Việt × FPT Schools

## 1. Để làm gì

Học sinh tiểu học và THCS ở các CLB Làng Maker chuẩn bị cho FANROC 2026–2027 (Bảng Robotics, chủ đề "Cyan Flames – Thanh Hỏa"). Robot thật của giải bắt buộc dùng **mạch ThingBot** và **tay cầm PS2** (luật RE02–RE04). Bản mô phỏng cho các em:

- **tập lập trình bằng đúng khối ThingBlock thật**, chương trình viết trên mô phỏng nạp được vào robot thật mà không sửa;
- **tập tư duy chiến thuật** của một trò chơi hợp tác (4 đội chung một điểm trận, phạt tính riêng): chia việc, khi nào cắm cờ, khi nào về Vùng Bảo Vệ, chỗ nghẽn ở Human Player;
- **tự thấy chỗ cần cải tiến** sau khi thi đấu và chạy thử nhiều lần (không có màn hình "chấm lỗi" tự động).

Thành công là: một em lập trình TeleOp PS2 cho robot mẫu trong mô phỏng, chơi được trọn một trận 3 phút với đồng đội máy, rồi nạp đúng chương trình đó vào ThingBot thật và robot chạy như trên mô phỏng.

**Đường sang robot thật (user chốt):** nút "Tải về để nạp" xuất **file `.tb`** mở được bằng phần mềm ThingBlock, rồi nạp như bình thường. Định dạng phải đúng như file `.tb` của ThingBlock (mẫu: `thingblock-editor-examples/packages/thingblock-resource/src/examples/thingbot/sim-09-tay-cam-ps2.tb`); phép thử đầu-cuối phải mở lại được file đã xuất.

## 2. Mục tiêu, ngoài phạm vi, điều không được xảy ra

**Mục tiêu bản đầu**
- Một trang mới trong `thingbot-sim`: vùng khối ThingBlock + sân 3D FANROC + bảng điểm, tiếng Việt.
- Chạy trên **1 máy**: 1–2 em lái bằng tay cầm (mỗi tay cầm là "bộ thu PS2" của một robot), 1 bàn phím cho Human Player, các robot còn lại do **agent đồng đội** mức Dễ / Vừa / Khó lái.
- Trận đầy đủ theo luật: 10 giây xả bóng (robot đứng yên) → 3 phút thi đấu, 30 giây cuối là End Game; chấm điểm theo trạng thái sân lúc hết giờ; bảng điểm từng mục và điểm từng đội.
- Chế độ luyện tập không tính giờ.
- 4 robot mẫu (mục 5), mỗi robot có sẵn chương trình mẫu TeleOp PS2 và một chương trình chạy tự động theo thời gian, viết bằng khối thật.

**Ngoài phạm vi bản đầu** (để sau, nhưng thiết kế không được chặn đường): 4 máy chơi chung qua mạng; hệ thống giải (lịch, xếp hạng, playoff, màn hình chiếu, trang quản trị); bài học hướng dẫn từng bước kiểu ftcsim.org; nhập robot từ file STEP (đang chờ quyền xuất trên Onshape).

**Điều không được xảy ra (dù chạy được vẫn coi là hỏng)**
- Khối tự chế riêng cho FANROC, hoặc chương trình chỉ chạy được trong mô phỏng. Bài học từ nhánh `spike/ursim`: 15 khối FTC tự chế không mang sang ThingBlock thật được.
- **Màn hình cấu hình nút tay cầm.** Nút nào làm gì chỉ do chương trình khối quyết định, như trên robot thật.
- Robot mẫu sai luật mà không báo (kích thước, số động cơ, số servo).

## 3. Ràng buộc

- **Luật**: tệp `/Users/tuanln/Downloads/FANROC 2026 - Luật thi đấu Bảng Robotics - Vòng cơ sở.docx` (bản 28/09/2026, của FPT Schools; không chép vào kho vì kho công khai). Đây là nguồn duy nhất cho số đo sân, bảng điểm, phạt và luật Human Player. Sân 2.400 × 2.400 mm, rào 300 mm; 100 bóng cam + 200 bóng xanh Ø40; 4 Ngọn Núi; bảng điểm B.4.2; phạt D.5 (lỗi −5, thẻ vàng −10, thẻ đỏ = 0 điểm, điểm đội không âm). Robot xuất phát ≤ 300 × 300 × 850, mở rộng 1 chiều ≤ 500; tối đa 4 động cơ TT + 5 servo SG90/MG996R; chỉ PS2; bánh mecanum/omni được phép.
- **Khối ThingBlock thật** từ `thingblock-resource` (cùng cách `src/blocks.ts` đang làm, không chép, không định nghĩa lại): `event_whenarduinobegin`, `event_whenarduinoloop`, nhóm `thingbot-core` (`thingBotC3_init`, `thingBotC3_initPS2`, `thingBotC3_setMotor`, `thingBotC3_setServo`, `thingBotC3_setServoAngle`, `thingBotC3_moveServoAngle`…), nhóm `ps2` (`ps2_readData`, `ps2_getButton`, `ps2_GetJoystick`), điều khiển và toán tử chuẩn. Mã mô phỏng do generator `sim` của ThingBlock sinh, chạy trong worker `thingblock-sim` sẵn có; PS2 dùng `src/sim-extra.ts`.
- **Giao diện tiếng Việt**, trừ chữ trên khối (giữ nguyên như ThingBlock).
- Mã nguồn `thingbot-sim` theo AGPL-3.0. Nếu dùng lại mã UrSim (MIT) thì giữ dòng bản quyền Khussein. Không dùng mô hình robot/logo của URAN92, SWB.
- Máy học sinh yếu (CLB, laptop cũ): mô phỏng phải nhẹ — chấp nhận đơn giản hoá vật lý.

## 4. Những gì đã quyết

### 4.1 Đường đi của tín hiệu (giống robot thật)

```
tay cầm (Gamepad API) ──► ps2_* (analogRead của bảng ảo) ──► chương trình khối trong worker
                                                              │ pwm.setPWM(kênh, 0, duty)
                                                              ▼
                                             PCA9685 ảo: duty[16] (0…4095)
                                                              ▼
                       giải mã kênh ──► động cơ / servo của robot 3D
```

Bảng kênh lấy đúng `#define` của `thingbot-core`: M1 = 2/3, M2 = 4/5, M3 = 7/6, M4 = 1/0 (A/B, chân A có duty là lùi, chân B là tiến); SERVO_1…5 = kênh 12, 11, 10, 9, 8. Tốc độ khối 0…100 → duty 0…4095 (`mapToPulse`). **Chiều động cơ (user chốt):** trên robot Maker thật, M1 và M2 cùng `forward` thì xe đi thẳng tới trước; mô phỏng làm đúng như vậy. Chiều của từng bánh khi dùng đế 4 bánh đa hướng chưa đo, để ở một bảng cấu hình duy nhất để sửa khi có số đo.

### 4.2 Tay cầm và Human Player
- Tay cầm nối máy theo thứ tự cắm: tay 1 → robot 1, tay 2 → robot 2 (không có màn hình gán nút; chỉ hiện "tay cầm nào đang là bộ thu của robot nào").
- Nút đọc theo bố cục chuẩn của trình duyệt, quy về tên PS2 (`PSB_*`, cần `PSS_LX/LY/RX/RY` 0…255, giữa 128) — như `src/ftc/run.ts` đã làm.
- **Bàn phím = Human Player**, một bàn phím chia đôi cho 2 Human Player. Phím chỉ bấm-nhả, không giữ (bàn phím rẻ bị nuốt phím khi giữ nhiều phím). Việc của Human Player theo P04–P07: nhặt bóng nằm trong Khu Xuất Phát của liên minh vào khay (tự tách màu), chọn màu và số bóng, nạp khi robot có một phần trên Khu Tiếp Tế; không nạp cho robot đã về Vùng Bảo Vệ trong End Game. Máy chỉ có 1 người thì Human Player tự động.

### 4.3 Robot mẫu và bảng cổng chung
Bảng cổng chung cho đế 2 bánh: **M1 bánh trái, M2 bánh phải, M3 con lăn / cơ cấu hút, M4 cơ cấu nâng; S1 nâng tay, S2 kẹp, S3 cửa xả**.

| Robot | Đế bánh chọn được | Cơ cấu |
|---|---|---|
| **Mẫu Maker** (mặc định, theo Onshape "Bộ thingbot mới" của Maker Việt) | 2 bánh động cơ sau + 2 bánh omni bị động trước; hoặc omni / mecanum 4 bánh | M3 tay vòng xúc bóng, M4 thanh trượt răng (rút ngắn còn 250 mm để robot dài 300 mm khi xuất phát, vươn tối đa 130 mm), S1 nâng tay, S2 kẹp cờ, S3 cửa xả trên đỉnh ống cong |
| Xe Ủi | 2 bánh + bi đỡ | S1 gàu hớt; nhỏ 180 × 240 để 2 robot cùng đỗ toàn phần trong ô 375 |
| Xe Cắm Cờ | 2 bánh, omni | M4 nâng thùng, S3 cửa thùng, S1 + S2 tay kẹp cờ |
| Xe Phân Loại | 2 bánh, mecanum, omni | M3 con lăn hút, S3 cánh gạt chia 2 ngăn do người lái bấm (chưa có cảm biến màu) |

- Cơ cấu M3/M4 chọn được **động cơ TT** hoặc **servo MG996R 360°** (chuyển sang cổng S4/S5; chỉ tiến / dừng / lùi ở một tốc độ, 180° tiến, 90° dừng, 0° lùi; muốn đổi tốc độ phải đổi tỉ số truyền).
- Đế 4 bánh đa hướng: M1–M4 là 4 bánh (trước trái, trước phải, sau trái, sau phải), cơ cấu buộc dùng servo 360 ở S4/S5.
- Mỗi robot có ô **kiểm tra theo luật**: kích thước xuất phát, mức mở rộng, số động cơ / 4, số servo / 5.
- Hình 3D dựng bằng khối đơn giản theo ảnh (bản dựng thử: https://claude.ai/artifact/SoEiSXhCDdabikTiHh5W9t). Khi có STEP thì thay phần hình, giữ nguyên cổng và cách chạy.

### 4.4 Sân
Theo luật mục B.2 và Hình 1, 7, 8, 11 (toạ độ vùng ước lượng theo Hình 1 cho tới khi có bản vẽ sân): 2 Khu Chữa Cháy 600² ở hai góc phía Hộp Phân Phối; Khu Rừng với 4 Ngọn Núi 400 × 400 (Rãnh 1 / tầng trang trí / Rãnh 2 / Rãnh 3 / đỉnh ở 15 / 50 / 95 / 130 / 160 mm, lỗ cờ Ø45 sâu 45); Vùng Bảo Vệ 375² hai bên; Khu Tiếp Tế 375² ở hai góc phía Khu Điều Khiển; mỗi liên minh một Khu Xuất Phát 700 × 300; Hộp Phân Phối 2 tầng đặt sau thành sân phía trên. Số đo không chắc chắn được gom vào một chỗ để thay khi có CAD.

### 4.5 Tính điểm
Dùng lại hàm tính điểm của bản thử 2D (`scoreSummary`, `teamScore`), đã khớp 3 ví dụ của luật (175, 299, 200/195/190/0). Bảng điểm: bóng cam trong Khu Chữa Cháy +5; Mầm Cây Rãnh 1 (hoặc tầng trang trí) / 2 / 3 = +5 / +10 / +15; cờ +20, hoặc +40 nếu cả 3 rãnh của núi đó có ít nhất 1 Mầm Cây; đỗ một phần / toàn phần +5 / +10 mỗi robot, +10 nếu cả 2 robot liên minh đỗ toàn phần; **bóng sai vị trí −3** (bóng xanh trong Khu Chữa Cháy, bóng cam trên rãnh núi); bóng còn trong robot không tính. Mỗi phép thử tính điểm phải bao gồm 3 ví dụ này.

### 4.6 Agent đồng đội
Ba mức Dễ / Vừa / Khó, đóng vai **đồng đội**, không cản phá. Mức khó biết: cắm cờ sớm, phủ đủ 3 rãnh để cờ lên 40, gỡ bóng xanh khỏi Khu Chữa Cháy, về đỗ sát giờ, không nhận bóng khi không còn đủ giờ đi giao (lỗi thấy ở trận thử 3D).

### 4.6b 3D như bản FTC (user chốt 03/11)
Sân, robot và bóng là **3D có vật lý thật như UrSim** (bản FTC): máy vật lý Rapier 3D (`@dimforge/rapier3d-compat`, cùng phiên bản UrSim đang dùng), robot là vật thể động điều khiển bằng vận tốc từ mô hình động cơ, 300 bóng là vật thể động, Ngọn Núi và rào có va chạm. Hiển thị Three.js với các góc camera như bản FTC (toàn sân, theo robot, góc người lái). Cách làm được học theo mã UrSim (MIT) — đoạn nào chép thì giữ dòng bản quyền.

### 4.7 Chương trình và trận đấu (lựa chọn của tôi, user chưa chốt)
- Mỗi robot do người lái có **một vùng khối riêng** (thẻ "Robot 1", "Robot 2"); một chương trình có thể gán cho robot đồng đội thay agent.
- FANROC không có giai đoạn tự động riêng: chương trình chạy tự động theo thời gian (RE04 cho phép robot tự động / bán tự động) chạy được cả ở chế độ luyện tập lẫn trong trận, bắt đầu khi hết 10 giây xả bóng.
- Xây trên **nhánh mới tách từ `master`**, chỉ mang sang phần đọc tay cầm của `src/ftc/run.ts`; nhánh `spike/ursim` và trang FTC giữ nguyên, không đụng. Việc đưa lên robot.edu.vn hỏi user khi xong.
- **Xe Phân Loại (user chốt):** ThingBlock chưa có khối cảm biến màu, nên **người lái tự phân loại**: nhìn bóng rồi bấm nút gạt S3 sang ngăn cam hoặc ngăn xanh (luật P09 cho phép). Bỏ cảm biến màu khỏi mẫu này; có khối cảm biến màu thì thêm sau.

## 5. Phần để người thi công tự quyết

- Mức chi tiết của va chạm núi và cơ cấu (hình gần đúng bằng nhiều khối lồi là được), miễn là 300 bóng chạy mượt trên laptop yếu và hành vi nhất quán với lệnh cổng (M3 không quay thì không hút được bóng).
- **Agent lái bằng gì**: nên lái qua đúng giao diện cổng M/S như chương trình của học sinh, để agent và học sinh chịu cùng một vật lý. (Lựa chọn của tôi, không phải user chốt.)
- Bố cục trang (vùng khối / sân / bảng điểm), cách thu gọn vùng khối trên điện thoại (đã có mẫu nút ☰ ở `ftc.html`).
- Trọng tài tự động bắt những lỗi máy thấy được (leo núi P12, vươn ra ngoài rào S02, đi trước giờ G11, nạp cho robot đã về Vùng Bảo Vệ P05, cán cờ P10, chặn > 5 giây G15); lỗi máy không thấy được thì bỏ.
- Bảng phím Human Player cụ thể (đề xuất trước đây: trái Q nhặt, A cam, S xanh, W/E số bóng, D nạp; phải U, J, K, I/O, L).
- Phép thử tự động: theo kiểu `scripts/ftc-e2e.mjs` (Playwright, tay cầm giả), phép thử nào cũng phải chứng minh được là có thể hỏng.

## 6. Chưa chắc chắn / chờ

- Bản vẽ sân hoặc CAD (vị trí các vùng, Hộp Phân Phối, hình núi). Luật tự mâu thuẫn ở chiều cao tầng núi (160 so với 205 mm), bóng ở tầng 5, Khu Xuất Phát 700 mm mỗi liên minh hay chung, Vùng Bảo Vệ bên nào của liên minh nào.
- STEP robot Maker: tài khoản Onshape của user chỉ có quyền Xem + Bình luận; chờ chủ tài liệu bật "Can export".
- Số đo robot thật để chỉnh tốc độ: thời gian nhặt 1 bóng, một vòng giao, tỉ lệ bóng trượt khỏi Rãnh 2–3.
- Tay cầm không phải chuẩn (ví dụ P4 Wired Gamepad 0c12:2e18 trên Mac mini) có thể lệch nút.

## 7. Tài liệu liên quan

- Bản thử 2D + 5.700 trận Monte Carlo: https://claude.ai/artifact/NcUGb1VGcioVaFCusrAzCY
- Bản dựng thử 3D + trận 4 agent: https://claude.ai/artifact/SoEiSXhCDdabikTiHh5W9t
- Mã bản thử (vứt đi được, chỉ để tham khảo): `docs/superpowers/specs/fanroc-spike/sim.js` (mô hình tác tử + tính điểm), `fanroc-spike/san-3d.html` (hình học sân và robot, Three.js 0.170).
- Trang FTC × ThingBlock cùng kho (`ftc.html`, `src/ftc/`) là mẫu cho cách đọc tay cầm và bố cục; không dùng lại khối tự chế của nó.
