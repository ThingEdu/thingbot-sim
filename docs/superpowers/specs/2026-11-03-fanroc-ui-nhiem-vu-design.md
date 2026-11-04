# ThingBot FanRoc Game — giao diện mới: game kiểu FIFA, giải đấu, nhiệm vụ con rùa

Tên sản phẩm (anh Tuấn chốt 04/11): **ThingBot FanRoc Game** — dùng cho tiêu đề trang, màn chính, `.tb` xuất ra giữ tên cũ.

Ngày 03/11/2026 · nhánh `feat/fanroc` (worktree `~/Ai-Code/thingbot-sim-fanroc`) · nối tiếp
`docs/superpowers/specs/2026-11-03-fanroc-sim-design.md` (lõi mô phỏng đã xong 12/12 task).
Bản phác đã cho anh Tuấn xem: `.superpowers/brainstorm/16768-1793712920/content/layout-v2.html`.

## 1. Ý định

Bản mô phỏng hiện tại chạy đúng nhưng **trông như bảng điều khiển kỹ thuật**: sân 3D nhỏ, ba hàng nút
(Robot 1…4, ×1 ×4 ×40, Toàn sân, Đồ hoạ cao/thấp, chọn ghế), khung khối chiếm chỗ cố định. Anh Tuấn
so với UrSim (bản FTC chạy trên TV, con anh chơi say mê): **3D to, chiếm cả màn, bảng điểm to giữa
trên, lái bằng bàn phím, đấu với máy, hết trận hiện điểm** — "dễ cuốn hút hơn, to hơn".

Cách tổ chức học thì học **FTCSIM.org**: bài xếp theo khoá/nhiệm vụ có độ khó, khung code bên trái ẩn
được, mô phỏng bên phải. Nội dung nhiệm vụ học **cách Papert dạy trẻ điều khiển con rùa**: trẻ khám phá
trong một "thế giới nhỏ", nhìn vệt robot để tự thấy mình sai ở đâu, gỡ lỗi chứ không bị phạt.

Thành công = một học sinh lớp 4–9 ngồi trước TV/máy tính, tự đi hết chặng làm quen mà không cần thầy
giải thích giao diện, và muốn chơi tiếp tới trận đấu.

## 2. Mục tiêu

1. Mô phỏng 3D chiếm toàn bộ phần màn hình còn lại; khung khối bên trái **ẩn/hiện bằng một nút**.
2. Khung code **vẫn là khối Scratch (scratch-blocks) của ThingBlock**, không đổi sang kiểu khác.
3. **Cài đặt ẩn** sau một biểu tượng ⚙ nhỏ; không còn hàng nút cài đặt trên màn hình.
4. **Bảng điểm luôn hiện, to, giữa phía trên** (kiểu UrSim).
5. Trang chọn **nhiệm vụ theo chặng** (kiểu FTCSIM): thẻ có ảnh, một câu mục tiêu, thanh độ khó, dấu ✓.
6. Chặng đầu là **dự án tạo hàm**: từ 2 động cơ ⇒ tự làm khối "tiến (m)", "rẽ (độ)" ⇒ "con rùa robot".
7. **Trận đấu**: một học sinh lái robot của mình **bằng bàn phím**, 3 robot còn lại do agent; hết trận
   hiện màn kết quả.

## 3. Không làm (non-goals)

- **Không thêm khối mới vào ThingBlock.** Mọi nhiệm vụ chỉ dùng khối ThingBlock thật đã có trong hộp
  công cụ FANROC (+ khối chuẩn scratch-blocks: điều khiển, toán, biến, **khối của em / procedures**).
  `.tb` xuất ra vẫn nạp được vào ThingBot thật.
- Không thi đấu nhiều máy / mạng, không bảng xếp hạng, không tài khoản.
- Không "Tự tạo thử thách" (FTCSIM có World Builder) — chỉ để chỗ trong menu nếu rẻ, không bắt buộc.
- Không sửa lõi vật lý / luật / agent (đã duyệt ở spec trước), trừ chỗ mục 6 nêu.
- Không đẩy lên robot.edu.vn trong đợt này (spec trước §4.7: deploy phải hỏi anh Tuấn).

## 4. Không được xảy ra (anti-goals)

- Màn hình đầy nút như bản hiện tại — mỗi màn chỉ có thứ học sinh cần ngay lúc đó.
- Nhiệm vụ biến thành "điền đúng số rồi qua bài": học sinh phải **thử – nhìn vệt – sửa**.
- Báo lỗi kiểu phạt (đỏ, mất mạng, game over). Sai chỉ dẫn tới gợi ý gỡ lỗi.
- Khối/điều khiển chỉ có trong mô phỏng mà robot thật không làm được.

## 5. Các điều anh Tuấn đã chốt (03/11)

| Điều | Chốt |
|---|---|
| Khung code | Vẫn là khối Scratch kiểu ThingBlock, bên trái, ẩn được |
| Cài đặt | Ẩn đi, một nút ⚙ |
| Bảng điểm | Có, to, giữa trên |
| Nhiệm vụ | Cách Papert dạy con rùa; hướng dẫn như **một dự án tạo hàm** để học sinh làm quen điều khiển 2 động cơ dẫn tới con rùa robot |
| Khối mới | Không thêm — giữ khối ThingBlock thật, học sinh tự ghép "tốc độ + đợi" thành khối của em |
| Trận đấu | Lái bằng **bàn phím**, đấu với **máy**, hết trận **hiện điểm** |
| Phím | Bàn phím lái robot (W/A/S/D chạy, phím khác cho servo); **Human Player tự động nạp bóng**; tay PS2 cắm vào vẫn lái được |
| Tổng thể (04/11) | **Như một game kiểu FIFA** cuốn hút trẻ: các chế độ **Thi đấu**, **Đấu tập**, **Lập trình** (sửa, nâng cấp chương trình điều khiển robot); không lập trình thì robot dùng **chương trình mặc định theo hướng dẫn** |
| Khối của em có tham số (04/11) | ThingBlock hiện sinh khối tự tạo **không tham số** (cả mô phỏng lẫn Arduino). Anh Tuấn chốt: **sửa trước trên mô phỏng** (ghi đè bộ sinh mã mô phỏng ngay trong kho này, không sửa `thingblock-editor-sim`); `.tb` có khối của em có tham số **chưa nạp được ThingBot thật** cho tới khi ThingBlock gốc hỗ trợ — trang phải báo rõ khi tải `.tb` (ngoại lệ tạm thời của anti-goal "khối chỉ chạy trong mô phỏng") |
| Vệt robot (04/11) | **Chỉ có trong nhiệm vụ con rùa**, không có ở Thi đấu / Đấu tập |

Thay đổi so với spec trước: trước đây "bàn phím = Human Player, tay PS2 = lái". Nay bàn phím lái;
Human Player chạy chế độ tự động (`HumanPlayer.auto`, đã có) ở mọi chế độ của trang mới.

## 6. Thiết kế

### 6.0 Màn chính kiểu game (anh Tuấn chốt 04/11; chi tiết hình thức là đề xuất của Claude)

Bản phác: `.superpowers/brainstorm/74019-1793743813/content/layout-v4-game.html`. Mở trang là vào **màn chính**
như game bóng đá: nền là chính sân 3D quay chậm, tên giải, dòng "robot của em · chương trình: Mặc định / Của
em vN", và 4 ô chế độ to:

- **Giải đấu** (ô to nhất, chọn sẵn, Enter là vào): một giải đúng luật FANROC, 1–2 bạn chơi — xem 6.6.
- **Thi đấu**: một trận lẻ đúng luật, robot của em cùng 3 robot máy → màn ③.
- **Đấu tập**: chế độ Luyện tập sẵn có (R31), sân tự do không tính giờ → màn ③.
- **Nhiệm vụ**: danh sách chặng con rùa (màn ①) → màn ②.
- **Xưởng lập trình**: mở khung khối với **chương trình điều khiển của robot em** (lần đầu nạp TeleOp mẫu
  `programs.ts` = chương trình mặc định theo hướng dẫn). Em sửa / nâng cấp, chạy thử trên sân trống, bấm
  **Lưu cho robot của em** ⇒ Thi đấu và Đấu tập dùng bản này. Có nút **Về mặc định**. Lưu trong
  `localStorage` có số phiên bản (v1, v2…), xuất được `.tb`. Không vào Xưởng ⇒ robot luôn chạy mặc định.

Kiểu game (Claude đề xuất, builder chỉnh): trước trận chọn robot như chọn đội (thẻ robot có thanh Tốc độ /
Chứa bóng / Cắm cờ lấy từ thông số `robots.ts`, nhãn chương trình Mặc định / Của em), chọn liên minh và mức
máy; đầu trận đếm **3 · 2 · 1 · BẮT ĐẦU!** to giữa màn; khi ghi điểm hiện **báo điểm nổi** ngắn ("+30 · Rãnh 3
đúng màu!") từ sự kiện `match`; âm thanh ngắn (còi, ghi điểm) có nút tắt trong ⚙; hết trận màn kết quả như
6.1 ③. Không có tài khoản: tên người chơi và ⭐ tổng chỉ lưu ở trình duyệt.

### 6.1 Ba màn hình

**① Chọn nhiệm vụ** (mở từ ô Nhiệm vụ của màn chính). Cột trái: Nhiệm vụ · Luyện tập tự do · Trận đấu. Bên phải: các chặng,
mỗi chặng một danh sách thẻ nhiệm vụ (ảnh nhỏ, tên "N – …", một câu mục tiêu, thanh độ khó 5 ô, ✓ khi
đã đạt, số ⭐). Nhiệm vụ không khoá cứng (học sinh nhảy cóc được), chỉ gợi ý thứ tự.

**② Làm nhiệm vụ.** Thanh trên: tên trang · "Chặng X · Nhiệm vụ N · Tên" · nút HƯỚNG DẪN · ⚙.
Trái (~44 %, kéo được hoặc cố định — builder chọn): khung scratch-blocks như ThingBlock (cột chuyên mục
tròn màu, khay khối, vùng ghép), thanh dưới: ▶ Chạy · ■ Dừng · ↺ Về chỗ cũ · ⬇ .tb. Nút xanh ‹ ở mép
khung để ẩn (ẩn thì mô phỏng chiếm toàn bộ, nút thành ›). Phải: 3D với bảng điểm nhiệm vụ (⭐ đạt / tổng
+ đồng hồ), thẻ thử thách góc dưới trái (mục tiêu dạng danh sách tự tích ✓ + gợi ý gỡ lỗi), số đo góc
dưới phải khi nhiệm vụ cần (xem 6.3).

**③ Trận đấu / Luyện tập tự do.** Khung khối mặc định **ẩn**. 3D toàn màn, bảng điểm **điểm trận chung | đồng hồ +
pha** (luật: 4 đội hợp tác, nhận chung một điểm; Đỏ/Xanh chỉ là màu liên minh, không đối kháng). **Anh Tuấn chốt 04/11: vẫn chia hai bên Đỏ | Xanh**:
bảng điểm có ô Đỏ bên trái, ô Xanh bên phải, điểm trận chung + đồng hồ ở giữa. Mỗi ô liên minh hiện phần của
liên minh đó: 2 đội/robot (tên, nhãn chương trình), điểm đỗ Vùng Bảo Vệ + thưởng liên minh, cờ do robot liên
minh cắm, điểm phạt và **điểm đội** (= điểm chung − phạt của đội). Màn kết quả cũng chia Đỏ | chung | Xanh (pha: XẢ BÓNG / ĐIỀU KHIỂN / VỀ VÙNG BẢO VỆ). Góc dưới trái thẻ nhỏ robot của em (loại robot,
bóng đang chứa, tay cầm/bàn phím, cảnh báo vùng chết 20 % — đã có ở `hud.ts`, chuyển vào đây).
Hết trận: **màn kết quả** phủ lên sân — điểm trận chung thật to, điểm từng đội (= điểm chung − điểm phạt của đội, thấp nhất 0), bảng chi tiết từng mục
(Chữa Cháy, Rãnh 1–3 đúng/sai vị trí, cờ, Vùng Bảo Vệ, phạt — lấy từ `match` sẵn có), nút **Chơi lại**
và **Về nhiệm vụ**.

### 6.1b Bố cục kiểu Visual Studio Code (anh Tuấn chốt 03/11, thay chỗ "khung trái 44 %" ở 6.1)

Bản phác: `.superpowers/brainstorm/16768-1793712920/content/layout-v3-vscode.html`. Mục đích: **nhìn mô
phỏng rõ hơn**, mọi thứ khác thu gọn, cần mới mở.

- **Cột biểu tượng** hẹp (~48 px) sát mép trái, như Activity Bar của VS Code: Khối · Mã Arduino ·
  Serial · Nhiệm vụ · Trận đấu, và ⚙ Cài đặt ở đáy. Bấm một biểu tượng mở khung tương ứng; bấm lại biểu
  tượng đang sáng thì đóng khung. Không khung nào mở ⇒ mô phỏng chiếm toàn bộ phần còn lại.
- **Khung bên** (Side Bar): Khối (scratch-blocks, rộng ~40 %, kéo mép để đổi độ rộng); Mã Arduino (chỉ
  xem, mã C++ sinh từ khối, tô màu cú pháp, hẹp ~24 %); Nhiệm vụ (danh sách chặng như màn ①, thu gọn).
- **Khung đáy** (Panel) dưới mô phỏng: thẻ **Serial** và **Sự kiện trận**; mặc định thu thành một dòng
  tiêu đề, bấm mới mở (~120 px). Biểu tượng Serial có số đỏ khi có dòng mới chưa xem.
- **Thanh chạy nổi** trên mô phỏng, dưới bảng điểm (như thanh Debug của VS Code), toàn biểu tượng có chú
  thích khi rê chuột: ▶ Chạy (xanh) · ⏸ Tạm dừng · ⏭ Chạy từng khối · ■ Dừng (đỏ) | ↺ Về chỗ cũ · ⬇ Tải
  `.tb` · 🎥 Camera. Thay các nút chữ "▶ Chạy / ■ Dừng" cũ.
- **Thanh trạng thái** đáy màn (xanh như VS Code): robot đang lái, cách lái (bàn phím / tay PS2), giá trị
  M1–M4, "Đang chạy khối: …", fps.
- **Biểu tượng:** một bộ nét mảnh thống nhất (kiểu Lucide, SVG nhúng sẵn trong trang — không tải từ mạng),
  không dùng emoji cho nút.
- **Khối đang chạy sáng viền** trên vùng ghép: `Snapshot.block` của bộ mô phỏng ThingBlock đã báo khối vừa
  chạy (`thingblock-sim/src/session.ts`), worker dùng chung đã gửi snapshot — chỉ cần tô sáng ở trang.
- **Tạm dừng / chạy từng khối:** `Session` của ThingBlock đã có `pause` và `step()` (từng khối), nhưng
  `src/sim-worker.ts` dùng chung chưa nhận lệnh này. Claude quyết: thêm hai lệnh `pause`/`step` **kiểu cộng
  thêm** vào worker dùng chung (bài học robot.edu.vn không gửi nên không đổi; smoke bài học phải xanh),
  giống ngoại lệ R23. Khi tạm dừng, vật lý sân cũng dừng; chạy từng khối = chạy tới hết khối kế tiếp
  (khối `đợi 1 giây` thì sân chạy 1 giây). Đây là mục phải **thử sớm** cùng spike khối của em.

### 6.2 Nút ⚙ (mọi cài đặt)

Bấm ⚙ mở một khung nổi; bấm ra ngoài hoặc Esc thì đóng. Nội dung theo màn:
- Mọi màn: Camera (Toàn sân / Theo robot / Ghế lái), Đồ hoạ (Cao / Thấp), Phím điều khiển (bảng phím).
- Màn ③: Chế độ (Trận đấu / Luyện tập), Robot của em (loại + đế: Maker 2 bánh, …), Liên minh của em
  (Đỏ/Xanh), Mức agent (Dễ/Vừa/Khó), Robot của em chạy (Chương trình của em từ Xưởng / Mặc định), Tốc độ (×1 ×4
  ×40 — chỉ khi không có chương trình học sinh đang chạy, giữ quy tắc R24).
- Cấu hình nâng cao hiện nay (chọn ghế cho từng Robot 1–4, "Chương trình của Robot N") đưa vào một mục
  "Nâng cao" thu gọn trong ⚙, không bỏ.

### 6.3 Nhiệm vụ kiểu con rùa

**Vệt robot (bút của con rùa).** **Chỉ ở màn ② (nhiệm vụ con rùa)** — Thi đấu, Đấu tập và Xưởng lập trình
không vẽ vệt. Ở màn ②, robot để lại vệt trên mặt sân (đường nối tâm robot theo thời
gian). **Mỗi lần lệnh động cơ đổi thì vệt đổi màu** (xoay vòng vài màu), để học sinh nối được "đoạn vệt
này ↔ khối này". ↺ Về chỗ cũ xoá vệt và đặt robot về vị trí đầu nhiệm vụ. Một nhiệm vụ có thể có **đường
gợi ý nét đứt** (hình mục tiêu) vẽ trên sàn.

**Số đo.** Nhiệm vụ đo hiện ô nhỏ: quãng đã đi (m), góc đã quay (độ), thời gian chạy (s) kể từ ▶.

**Chấm nhiệm vụ.** Mỗi nhiệm vụ là dữ liệu: vị trí/hướng xuất phát, robot, hộp công cụ (tập con khối
hiện ra), chương trình ban đầu, mục tiêu (danh sách điều kiện kiểm trên trạng thái mô phỏng: tới vùng,
không chạm núi, khép vòng sai số ≤ X cm, dùng khối lặp, dùng khối của em có tham số…), số ⭐ (ví dụ ⭐ đạt
mục tiêu, ⭐⭐ sai số nhỏ, ⭐⭐⭐ dùng hàm/lặp), các gợi ý gỡ lỗi theo tình huống ("hụt 5 cm — thử tăng thời
gian đợi?", "robot quay quá — 90° cần ít thời gian hơn"). Tiến độ (✓, ⭐, chương trình đang làm của từng
nhiệm vụ) lưu trong `localStorage` của trình duyệt (bọc try/catch, mất thì làm lại được).

**Lộ trình (đề xuất của Claude — anh Tuấn duyệt nội dung khi đọc):**

| Chặng | Nhiệm vụ | Học sinh làm |
|---|---|---|
| 1 · Hai bánh xe | 1 Làm robot | Lái bằng bàn phím, xem vệt; "đi hình vuông bằng tay" |
| | 2 Đi thẳng | M1, M2 cùng tốc độ + đợi + dừng; dừng trước chân Núi A |
| | 3 Cong và xoay | Lệch tốc độ ⇒ đi cong; ngược chiều ⇒ xoay tại chỗ; vùng chết 20 % |
| | 4 Đo robot | Tốc độ 60 trong 1 s đi bao xa, xoay 1 s được bao nhiêu độ (đọc ô số đo) |
| 2 · Con rùa robot | 5 Khối "tiến (m)" | Tạo khối của em có tham số mét; thời gian đợi = mét ÷ tốc độ đo được |
| | 6 Khối "rẽ phải/trái (độ)" | Tương tự với góc |
| | 7 Hình vuông | Đi vòng quanh Núi A bằng `lặp lại 4` + khối của em, về đúng chỗ (sai số) |
| | 8 Gỡ lỗi | Chương trình có sẵn bị sai (vệt không khép) — tìm và sửa |
| 3 · Việc trên sân | 9 Dọn Khu Chữa Cháy | Đẩy bóng xanh ra khỏi Khu Chữa Cháy |
| | 10 Cắm cờ | Tới Núi A, vươn tay S1 cắm cờ |
| | 11 Về Vùng Bảo Vệ | Đỗ đúng vùng trong pha cuối |
| 4 · Thi đấu | 12 Trận đầu tiên | Trận đầy đủ với agent Dễ, lái bàn phím |

Robot nhiệm vụ mặc định: Mẫu Maker 2 bánh (M1 trái, M2 phải — đã chốt trước). Nhiệm vụ 1–8 có thể dùng
sân trống bóng (chỉ núi) để vệt rõ — builder quyết.

### 6.4 Bàn phím lái

**Bàn phím là "tay cầm PS2 ảo số 1"**: bấm phím ⇒ ghi các khoá `ps2_*` (nút 0/1, cần 0…255) đúng như tay
thật, nên **chương trình TeleOp của học sinh (đọc PS2) chạy y nguyên bằng bàn phím** và chạy được trên
robot thật với tay PS2. Không có chương trình thì ghế của em chạy **TeleOp mẫu** (`programs.ts` đã có).

- W/S/A/D (và mũi tên): chạy tới / lùi / xoay trái / xoay phải. Vì TeleOp mẫu đế 2 bánh lái kiểu tank
  (LY bánh trái, RY bánh phải) còn đế 4 bánh trộn LY/LX/RX, bộ chuyển phím ⇒ cần **trộn theo loại đế**
  của robot đang lái để W đi thẳng, A xoay trái đúng với TeleOp mẫu. Q/E: đi ngang (chỉ đế omni).
- Phím cho nút PS2 (servo, nạp, xả…): **lựa chọn của Claude** — I = △, K = ✕, J = □, L = ○, U = L1,
  O = R1, Y = L2, P = R2. ⚙ › Phím điều khiển hiện bảng này kèm chức năng của từng nút với robot đang chọn.
- Khi có 2 bạn chơi (6.6) bảng phím chuyển sang chia đôi bàn phím; một bạn thì dùng bảng ở trên.
- Ở màn ② khi đang gõ vào ô số trong khối thì bàn phím không lái (đã có `typing()`).
- Cắm tay PS2 thật: tay 1 lái robot của em (ưu tiên tay khi tay có tín hiệu, bàn phím vẫn dùng được);
  gắn ghế theo R26 như cũ.
- Bỏ bảng phím Human Player Q/A/S/D–U/J/K/L (`human.ts KEYMAP`); Human Player luôn tự động. Có thể giữ lại
  Human Player bấm tay như tuỳ chọn trong ⚙ › Nâng cao (builder quyết, không bắt buộc).

### 6.5 Camera

Màn ③ mặc định **Theo robot** (sau-trên robot của em, như ảnh UrSim); màn ② mặc định Toàn sân nghiêng
(thấy rõ vệt). Ba góc đã có trong `view/scene.ts` (`field | follow | driver`); chỉ đổi mặc định và chỗ chọn.

### 6.6 Giải đấu (anh Tuấn chốt 04/11: thử thi đấu một giải đúng luật, 1–2 bạn, đấu đủ các trận)

Theo luật FANROC 2026 mục E (Cơ cấu giải đấu) và A (thể thức trận):
- **Trận:** 10 s khởi động (Human Player mở Hộp Phân Phối, robot đứng yên) + 03 phút thi đấu, 4 đội chia Đỏ/Xanh
  mỗi bên 2 đội, cả 4 đội nhận chung điểm trận; điểm của đội = điểm trận − điểm phạt của đội, thấp nhất 0
  (`match.result().teams` đã tính đúng như vậy).
- **Vòng xếp hạng:** mỗi đội đấu **4–10 trận** (chọn khi tạo giải, mặc định 4). Mỗi trận bốc thăm ngẫu nhiên ghép
  đội thành liên minh. **Điểm xếp hạng = tổng điểm của đội** các trận. Bằng điểm thì xét: điểm trận cao nhất,
  rồi ít điểm phạt hơn, rồi (luật để Ban Tổ chức quyết) — trong game Claude quyết: bốc thăm, ghi rõ trên bảng.
  Số trận các đội lệch nhau thì lấy số trận ít nhất làm chuẩn, đội nhiều trận bỏ trận thấp nhất.
- **Bán kết/chung kết:** luật để Ban Tổ chức địa phương quyết. Claude quyết: giải trong game **chỉ có vòng xếp
  hạng**, kết thúc bằng bục trao giải hạng 1–3 và bảng xếp hạng đầy đủ.
- **Đội trong giải:** 1–2 đội người chơi + đội máy cho đủ (Claude quyết: tổng 8 đội, đội máy có tên và mức
  Dễ/Vừa/Khó trộn). Lịch bốc thăm hiện trước giải; mỗi trận người chơi thấy liên minh của mình và 3 đội còn lại.
  Trận chỉ có đội máy thì **mô phỏng ngầm** (như phép thử agent đã có), hiện ngay kết quả, có nút xem nhanh.
- **Hai bạn (anh Tuấn chốt 04/11): mỗi bạn lái một robot riêng, độc lập**, trên cùng một máy. Mỗi bạn là một
  đội riêng trong giải (tên, robot, chương trình, điểm xếp hạng riêng); bốc thăm có thể đưa hai bạn vào cùng hoặc
  khác liên minh. Cách lái (Claude quyết): bạn 1 = bàn phím hoặc tay PS2 thứ nhất, bạn 2 = tay PS2 thứ hai. Không
  có tay thứ hai thì chia đôi bàn phím: bạn 1 nửa trái (W/A/S/D chạy, Q/E ngang, R = △, F = ✕, C = □, V = ○,
  1–4 = L1/R1/L2/R2), bạn 2 nửa phải (mũi tên chạy, , . ngang, I = △, K = ✕, J = □, L = ○, U/O/Y/P = L1/R1/L2/R2).
  Mỗi bạn là một tay PS2 ảo riêng (bộ khoá `ps2_*` riêng cho robot của bạn đó). Trước giải có màn **thử phím**: mỗi bạn
  bấm thử, robot của mình nháy sáng. Bàn phím rẻ có thể không nhận quá nhiều phím cùng lúc — ghi chú trên màn thử phím.
- **Robot người chơi:** mỗi bạn chọn robot + chương trình (Mặc định / Của em từ Xưởng) lúc ghi danh, giữ suốt
  giải. Giữa các trận có màn **Pit**: xem bảng xếp hạng, vào Xưởng sửa chương trình rồi đấu tiếp (như luật cho
  sửa robot ở Pit).
- **Lưu:** giải đang dở lưu trong `localStorage` (lịch, kết quả, chương trình), tắt trình duyệt mở lại đấu tiếp.
- Trọng tài, phạt, Human Player tự động: dùng nguyên lõi trận hiện có.

### 6.7 Phát hành: game độc lập — bản tải về máy + bản web cho sự kiện (anh Tuấn chốt 04/11)

**ThingBot FanRoc Game là một game mô phỏng độc lập**, tách khỏi 10 bài học robot.edu.vn/mo-phong. Mục tiêu: học
sinh **làm quen ThingBlock, đề thi 2026–2027, robot mẫu và luật chơi** để hình dung trước khi làm robot thật.
`.tb` cùng chuẩn ThingBlock.

- **Bình thường: tải về máy** (không chạy online như 10 bài học, vì tài nguyên nặng — ~1,3 MB nén lần đầu, 3D +
  vật lý chạy ở PC). Claude quyết: gói **ứng dụng desktop Tauri 2** giống cách `thingblock-desktop` đóng gói
  (cùng công cụ đã có trên máy), mở trang game từ tệp trong gói — không cần mạng, không cần máy chủ. Bản macOS
  build trên máy anh; bản Windows / Linux build bằng CI hoặc trên máy 201 (Ubuntu) — chưa phát hành.
- **Bản web cho sự kiện:** cùng bản build tĩnh, đặt trên **máy 201** (192.168.1.201) phục vụ trong mạng / công khai
  theo từng sự kiện. Kịch bản đưa lên 201 và bật/tắt phục vụ có trong kho; **chạy thật thì hỏi anh Tuấn mỗi lần**.
- **Build riêng:** cấu hình Vite riêng cho game (đường dẫn tương đối `./`, chỉ trang game, không kèm bài học),
  thư mục ra `dist-game/`. Bản `/mo-phong/` của robot.edu.vn không chứa game.
- **Link "Tải ThingBlock đầy đủ": tạm thời chưa có link chính thức** — để một chỗ cấu hình (`THINGBLOCK_URL`
  rỗng ⇒ không hiện nút); không đoán link.
- **Làm quen đề thi:** màn chính thêm hai mục nhỏ: **Luật chơi** (tóm tắt bằng lời của game, hình minh hoạ từ sân
  3D: sân, thể thức trận, bảng điểm, lỗi thường gặp, cơ cấu giải — không chép tài liệu luật) và **Robot mẫu**
  (4 robot mẫu xoay 3D: kích thước, cổng M1–M4 / S1–S5 dùng làm gì, chương trình TeleOp mẫu, mở thẳng vào Xưởng).
- Trước khi công khai bản web sự kiện: hỏi anh Tuấn về lưới núi CAD, tên/biểu trưng FANROC (Ban Tổ chức), và có
  link mã nguồn AGPL trên trang.

## 7. Ràng buộc

- Giữ nguyên stack và cấu trúc: TypeScript, Vite (`/mo-phong/`), Three 0.180, Rapier 0.14, scratch-blocks
  của ThingBlock (`src/blocks.ts`, `src/fanroc/editor.ts`), bo ảo ThingBlock qua worker (`sim-worker.ts`
  dùng chung — chỉ được thêm lệnh `pause`/`step` theo 6.1b). Trang vẫn là `fanroc.html`.
- Toàn bộ chữ trên trang bằng tiếng Việt có dấu, giọng nói với học sinh.
- Phải chạy được trên TV/máy tính 1920×1080 và laptop 1366×768; màn hẹp (< 900 px) thì khung khối phủ
  lên sân thay vì chia đôi.
- Không làm hỏng: `npm run test:unit`, `npm run e2e:fanroc` (sửa E-test theo giao diện mới), smoke bài
  học robot.edu.vn (`src/sim-extra.ts` dùng chung).
- Lưới núi từ CAD của anh Tuấn: không push/đăng khi chưa hỏi.

## 8. Trả lời rà soát của người dựng (các mục ghi "Claude quyết" là lựa chọn của Claude, anh Tuấn chưa duyệt riêng)

1. **Khối của em (procedures) có chạy không?** Có: bộ sinh mã mô phỏng của scratch-blocks ThingBlock
   (`thingblock-editor-sim/packages/scratch-blocks/src/generators/sim/core.ts`, `procedures_call`) và
   `thingblock-sim/src/headless.ts` (coi `procedures_definition` là khối mũ) đã xử lý; `tb.ts` đã xuất
   được. Còn thiếu: hộp công cụ FANROC chưa có chuyên mục "Khối của em", và nút "Make a Block…" của
   scratch-blocks gọi một hộp thoại mà scratch-gui vẽ — trang này phải **tự làm hộp thoại tạo khối**
   (tên + tham số số) bằng tiếng Việt. Kế hoạch phải có một bước **thử sớm** (spike): tạo khối có tham số
   số, chạy trong worker, xuất `.tb`, mở lại — trước khi làm chặng 2. Khối của em không cần sửa `sim-worker.ts` (lệnh tạm dừng/từng khối: xem 6.1b).
2. **Vệt và số đo lấy từ đâu?** Từ tư thế robot trên luồng chính (Rapier, mét thật), mỗi bước vật lý.
   "Lệnh đổi" = giá trị cổng động cơ (`ports`, đã có ở luồng chính mỗi bước) khác bước trước — không cần
   biết khối nào đang chạy. Đồng hồ: chương trình học sinh chạy thì tốc độ khoá ×1 (R24), nên số đo theo
   giây thực. Kế hoạch phải có phép thử **lặp lại**: "M1 = M2 = 60 trong 1 s" chạy 5 lần, quãng đường lệch
   nhau ≤ 1 cm (nếu không đạt thì số đo nhiệm vụ 4 làm tròn tới cm và gợi ý nói rõ "đo vài lần").
3. **Sai số ⭐ (Claude quyết, chỉnh theo mô phỏng thật):** khép vòng chỉ xét vị trí cuối so với điểm đầu:
   ⭐ ≤ 15 cm, ⭐⭐ ≤ 7 cm; ⭐⭐⭐ = đạt ⭐⭐ và chương trình dùng `lặp lại` + khối của em có tham số (đọc từ
   workspace). Hướng cuối không chấm ở chặng 2.
4. **Phím ⇒ PS2 (Claude quyết):** cần nhận giá trị đầy đủ (0 hoặc 255, nhả = 128), không giảm. Đế 2 bánh
   (tank LY/RY): W ⇒ LY = RY = 0; S ⇒ 255/255; A ⇒ LY = 255, RY = 0; D ⇒ LY = 0, RY = 255; W+A ⇒ LY = 128,
   RY = 0 (cong trái). Đế 4 bánh: W/S ⇒ LY, A/D ⇒ RX (xoay), Q/E ⇒ LX. Ánh xạ **theo loại đế đang chọn
   trong ⚙**, vì đó là cách TeleOp mẫu đọc; TeleOp tự viết đọc khác thì bảng phím trong ⚙ vẫn cho thấy
   phím nào là nút/cần nào. Bàn phím + tay thật: tay thắng khi có cần nằm ngoài 120…136 hoặc có nút đang
   bấm; ngược lại dùng bàn phím.
5. **Trận đấu:** robot của em + 3 robot agent (học sinh chọn liên minh; cả 4 cùng một điểm chung). Bàn phím chỉ là tay ảo
   số 1. Cấu hình 4 ghế cũ (hai người lái, Chương trình của Robot N) vẫn còn trong ⚙ › Nâng cao. Được viết
   lại `human.test.ts` theo chế độ tự động (giữ các phép thử luật P04–P07; bỏ phần phím).
6. **Nhiệm vụ:** vị trí xuất phát, đường gợi ý, chương trình sai của nhiệm vụ 8 là dữ liệu nhiệm vụ —
   builder viết, chụp vệt thật để chỉnh. Sân không bóng: thêm tuỳ chọn tạo sân không xả bóng trong
   `world.ts`/`match.ts` (ngoại lệ nhỏ được phép với lõi) nếu chưa có; nhiệm vụ 10 dùng vị trí lỗ cờ sẵn
   có (`holeCentres()`), chấm bằng sự kiện cắm cờ của `match`.
7. **Lưu và kiểm thử:** lưu theo từng nhiệm vụ: chương trình (JSON workspace), ✓, ⭐; lưu chung: chế độ
   và cài đặt ⚙. Không lưu camera. `e2e:fanroc` vẫn là cổng bắt buộc: viết lại theo giao diện mới, giữ
   các ý cũ (lái bằng tay/bàn phím, chạy chương trình, xuất `.tb`, khung hình) và thêm: ẩn/hiện khung khối,
   ⚙ mở/đóng, đạt một nhiệm vụ chặng 1, màn kết quả trận.

## 9. Để builder quyết

Kéo giãn khung khối hay độ rộng cố định; đồ hoạ thẻ nhiệm vụ (ảnh chụp từ chính sân 3D là đủ); màu vệt;
cách hiện HƯỚNG DẪN (khung trượt từng bước như FTCSIM, nhân vật hay không); điều kiện ⭐ cụ thể và câu
gợi ý của từng nhiệm vụ (theo bảng 6.3); hiệu ứng khi đạt nhiệm vụ; cách tổ chức mã (nên tách `missions/`
theo mẫu `src/lessons/`, mỗi nhiệm vụ một tệp dữ liệu + bộ chấm).
