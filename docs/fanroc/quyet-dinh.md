# FANROC Thanh Hỏa / ThingBot FanRoc Game — các điều đã tự quyết khi thi công (R1–R154)

Đợt 1 (R1–R34) thi công ngày 03/11/2026 theo kế hoạch `docs/superpowers/plans/2026-11-03-fanroc-sim.md`
và đặc tả `docs/superpowers/specs/2026-11-03-fanroc-sim-design.md`; đợt 2 — giao diện game "ThingBot FanRoc Game"
(R35–R124, sửa sau rà soát tổng R125–R133) — ngày 04/11/2026 theo kế hoạch `docs/superpowers/plans/2026-11-04-fanroc-game.md` và đặc tả
`docs/superpowers/specs/2026-11-03-fanroc-ui-nhiem-vu-design.md` (xem mục cuối); đợt 3 — luật V4 (R143–R154) ngày
12/11/2026 theo kế hoạch `docs/superpowers/plans/2026-11-12-fanroc-luat-v4.md` và đặc tả
`docs/superpowers/specs/2026-11-12-fanroc-luat-v4-design.md` (mục "Luật V4" gần cuối). Nhánh `feat/fanroc`.
Các mục cũ nói về Vùng Bảo Vệ / đỗ xe / End Game / Mẫu Maker cắm cờ (R2, R11, R19, R137…) là lịch sử: luật V4 đã bỏ.
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

---

## Giao diện game (đợt 2, 04/11/2026)

**Anh đã chốt (04/11):** khối của em có ô số — sửa trước trên mô phỏng (R37); game chạy độc lập (bản tải về máy,
bản web cho sự kiện ở máy 201); nhiều mùa giải về sau, đợt này một mùa (R42); bảng điểm chia hai bên
Đỏ | chung + đồng hồ | Xanh; Human Player luôn tự động (bỏ phím Q/A/S/D).

Mục nên xem trước: **R37, R57/R59, R96, R56, R83, R94, R103, R106, R115/R116, R122, R123**.

### Khối của em (khối tự tạo, có ô số)

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R37 | Khối của em có ô số chạy được trên mô phỏng bằng bộ sinh mã riêng trong `src/fanroc/procedures.ts` (không sửa ThingBlock, không sửa `sim-extra.ts`); tải `.tb` có khối kiểu này thì hiện lời nhắc "chưa nạp được ThingBot thật" | Mã Arduino của khối có ô số vẫn sai trên robot thật — cần sửa ở ThingBlock gốc |
| R38 | Sửa `headless.ts` cho sinh mã được khối của em khi chạy không giao diện; sửa `tb.ts` giữ đúng tên khối và ô số khi xuất `.tb` | — (cần dù sao) |
| R40 | Ô số của khối của em (khối tròn "mét", "độ") cắm được vào ô tốc độ động cơ / góc servo | ThingBlock gốc phải làm giống thế |
| R41 | Không có phép thử nạp lại `.tb` vào game (game không có nút mở `.tb`); chỉ kiểm cấu trúc tệp | Lỗi `.tb` chỉ lộ ra khi anh mở thử trong ThingBlock desktop |
| R124 | Lời nhắc "khối có ô số" (hiện khi tải `.tb`) được xoá khi nạp chương trình khác hoặc bấm Chạy | Em phải bấm tải lại mới thấy nhắc lần nữa |

### Tạm dừng, chạy từng khối, bo ảo

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R36, R43 | "Chạy từng khối" chạy tới khối kế tiếp, tối đa 5 s thời gian ảo (khối đợi dài hay vòng lặp rỗng không treo); hàm bước nằm ở `src/sim-step.ts`, bo ảo không phụ thuộc game | Dựa vào phần trong của Session, ThingBlock đổi thì phải sửa |
| R63 | Nhiều bo cùng chạy từng khối thì sân chạy theo bo cần lâu nhất (≤ 5 s) | Đổi sang ngắn nhất, sửa một dòng |
| R64 | Mỗi khung chạy vật lý có trần số bước và 45 ms; khung dài quá 100 ms bị cắt | Máy yếu thấy trận chậm hơn đồng hồ thật |
| R65 | Phiên trận có `setDriver` để đổi agent / chương trình mà không dựng lại trận | — |
| R66 | Khi bỏ phiên trận chỉ dừng các bo mà phiên đó còn giữ (bo thuộc về phiên cuối cùng nhận nó) | Một chương trình vừa bấm ▶ đúng lúc đổi phiên bị dừng, bấm lại |
| R69 | Thanh chạy: Chạy lúc đang tạm dừng = chạy tiếp; Tạm dừng dừng cả trận agent; Dừng chỉ bật khi thẻ đang mở có chương trình; Về chỗ cũ = trận mới; đang chạy từng khối thì khoá Chạy / Tạm dừng / Từng khối | Chỉ sửa phần xử lý nút |

### Bàn phím, tay cầm, hai bạn chơi

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R85 | Trận lẻ cho hai bạn chơi luôn: bật "Hai bạn chơi" thì bạn 2 ngồi ô đầu của liên minh kia, lái bằng nửa phải bàn phím + tay PS2 số 2 | Ẩn nút ở ⚙ |
| R86 | Ghế chọn theo người (Bạn 1, Bạn 2, Máy, Chép chương trình của bạn); mỗi bạn ngồi một ghế; rời ghế thì chương trình của bạn đó dừng | — |
| R89 | Nút "Hai bạn chơi" có ở ⚙ trên mọi màn | — |
| R93 | "Robot của em chạy" chỉ nhớ trong phiên, không lưu | Mở lại trang phải chọn lại |
| R107 | Thử phím ở giải đấu không chọn kiểu bàn phím: bạn 1 = nửa trái / tay 1, bạn 2 = nửa phải / tay 2 | — |
| R108 | Ghi danh giải đặt luôn "Hai bạn chơi" theo số bạn; đấu tiếp giải cũng đặt lại cho khớp | — |

### Giải đấu

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R44 | Có 7 đội máy (1 bạn chơi cần 7 đội máy cho đủ 8 đội) | — |
| R45 | Giữa giải, bảng xếp hạng = tổng điểm các trận đã đấu, ghi "tạm"; bỏ trận thấp nhất chỉ khi giải xong | Đổi cách hiện ở Pit |
| R46 | Trận ngầm toàn agent nhận thứ tự ghế tuỳ chọn; phép thử agent cũ giữ thứ tự cũ để điểm trung bình không đổi | — |
| R103 | Trong giải, bạn chơi bằng chương trình "Của em" nếu đã lưu cho robot đã ghi danh, không thì Mặc định; muốn về mặc định thì dùng "Về mặc định" ở Xưởng | Thêm nút chọn cho từng bạn |
| R104 | "Trận x/y" = lượt đấu / số trận mỗi đội | Chỉ đổi chữ |
| R105 | Thêm hai màn: trận giải của bạn và "Xem nhanh" (chỉ bảng điểm, không khối, để tua ×40 được) | — |
| R106 | Trận máy chạy lần lượt, chỉ từ Pit, trước trận kế của bạn; sân nền đứng yên lúc đó | Máy yếu chờ ~6 s mỗi trận máy |
| R109 | Xem nhanh dựng lại đúng hạt / agent / thứ tự ghế như trận đã ghi, nhưng không bao giờ đổi điểm đã ghi | Có thể khác chút với trận gốc |
| R110 | "Bỏ giải, ghi danh lại" bấm hai lần để xác nhận | — |
| R111 | Vào trận giải / Xưởng từ Pit thì robot của giải ghi đè robot đang chọn ở cài đặt | Em phải chọn lại robot sau giải |

### Lưu trữ và mùa giải

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R42 | Có đối tượng Mùa (`season.ts`), khoá lưu trữ theo mùa (`fanroc.v1.`…); chưa làm bộ máy nhiều mùa | Sửa nhỏ khi thêm mùa sau |
| R47 | Mặc định: có âm thanh, máy mức Vừa, liên minh Đỏ, robot Mẫu Maker, một bạn chơi; tên "Bạn 1", "Bạn 2"; chưa có giải = chuỗi rỗng | Đổi mặc định |
| R90 | Cài đặt có thêm robot của bạn 2; robot lưu được kiểm lại với danh sách robot | — |
| R94 | Bản đang sửa ở Xưởng giữ trong phiên (mỗi bạn × robot), có nhãn "Chưa lưu"; Trước trận nhắc Lưu / Bỏ; trận luôn chạy bản đã lưu | Đổi cách nhắc |
| R102 | Số sao trên hồ sơ = tổng sao tốt nhất các nhiệm vụ, ghi lại sau mỗi lần lưu | — |
| R119 | Thẻ Luật chơi lấy từ `rules-data.ts`, chưa gắn vào đối tượng Mùa | Làm nhiều mùa thì chuyển vào gói mùa |

### Nhiệm vụ con rùa

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R35 | Phép thử nhiệm vụ không giao diện dùng sân thường, không bước trận (bóng nằm yên trong hộp) | Chậm hơn chút |
| R48 | Quãng đường cộng mọi bước (lọc 5 mm chỉ cho điểm vẽ vệt); góc quay lấy đường ngắn nhất | Rung nhẹ cộng thêm chút quãng |
| R49 | Thêm `layout.holeCentres()` dùng chung một nguồn với sân | — |
| R50 | Hình vuông nhiệm vụ 7 cạnh 0,72 m nghiêng −8° quanh Núi A; nhiệm vụ 8 cạnh 0,70 m quanh Núi D (hở chỉ ~2 cm) | Đổi điểm xuất phát / đường gợi ý |
| R51 | Nhiệm vụ 7, 8 không bắt "không chạm núi" (hở quá hẹp) | — |
| R52 | Thêm loại mục tiêu: rẽ, thời gian, khối có ô số, điểm trận, đỗ trọn, đo tối thiểu; trường sao 2/3 | — |
| R53 | Đứng yên không được sao: nhiệm vụ 7/8 còn đòi đi ≥ 2,4 / 2,3 m và quay ≥ 300° | — |
| R54 | Tên nhiệm vụ 1 là "Làm quen robot" | Một chuỗi chữ |
| R55 | Chấm cờ / hết giờ theo dòng chữ sự kiện của trận; đỗ xe đọc ô Đỏ 0; dọn Khu Chữa Cháy cần số đếm sân | Đổi chữ sự kiện thì phải sửa bộ chấm |
| R56 | Nhiệm vụ 12: ⭐⭐ khi điểm trận ≥ 350, ⭐⭐⭐ khi ≥ 450 (4 máy Dễ trung bình 417) | **Chưa thử thật** — chỉnh ngưỡng |
| R57 | Chấm khi: robot đứng yên 1 s sau khi đã chạy, hoặc em bấm Dừng / Chấm, hoặc hết thời gian tối đa; thời gian = từ ▶ tới lần chạy cuối | Chỉnh lại sao theo thời gian |
| R58 | "Đang chạy" = tâm dời ≥ 5 mm hoặc hướng đổi ≥ 2° (quay tại chỗ không bị tính là đứng yên) | Hai hằng số trong `trail.ts` |
| R59 | Luật đứng yên chỉ cho nhiệm vụ lập trình; nhiệm vụ lái tay chấm khi bấm, hết giờ, hoặc đứng yên ≥ 1 s mà đủ mục tiêu ⭐ | — |
| R60 | Nhiệm vụ có bóng xả hết ngay lúc bắt đầu (38–52 bóng xanh rơi vào Khu Chữa Cháy) | — |
| R61 | Nhiệm vụ dựng trận một robot (ghế 0, Đỏ) | Nhiệm vụ cần đối thủ phải đổi chế độ |
| R62 | Nhiệm vụ không có Human Player, không giới hạn giờ, không phạt | — |
| R95 | Không chấm "đứng yên" khi chương trình đang ở khối đợi (trừ khi vòng lặp rỗng) | Nhiệm vụ chỉ chấm khi bấm / hết giờ |
| R96 | Sân nhiệm vụ cố định hạt 2; nhiệm vụ 9 được ⭐ khi còn ≤ 28 bóng xanh (lúc đầu ~40); "0 bóng trong 90 s" không làm nổi | **Cần chơi thử bằng bàn phím** rồi chỉnh |
| R97 | Độ khó 12 nhiệm vụ: 1,1,2,2,3,3,4,4,3,3,4,5 | Chỉ là hình |
| R98 | Vệt vẽ bằng dải phẳng 1,4 cm (đường gợi ý nét đứt trắng) vì nét WebGL 1 px gần như không thấy | — |
| R99 | Bấm ▶ ở nhiệm vụ luôn làm lại từ đầu (robot về chỗ, xoá vệt); đang tạm dừng thì ▶ là chạy tiếp | Không "chạy tiếp từ đây" được |
| R100 | Thẻ thử thách tự tích ✓ trong lúc chạy; kết quả chính thức sau khi chấm | Mục "tới chỗ" có thể tích rồi bỏ tích |
| R101 | Nhiệm vụ 12 chỉ chấm lúc hết trận | — |

### Giao diện

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R67 | Vỏ giao diện có thêm vài hàm nhỏ (màn đang xem, thẻ panel, khoá thanh chạy, nút cúp) | — |
| R68 | Khung ⚙ tạm và HUD cũ dùng tới Task 12/13 (đã thay hết) | — |
| R70 | Side Bar Khối đóng sẵn khi vào trận; Xưởng / nhiệm vụ tự mở | — |
| R71 | Màn hẹp ≤ 900 px: khung bên rộng mặc định `max(40 %, min(rộng − 48, 560))`; độ rộng em kéo được giữ | — |
| R72 | Serial hiện của thẻ đang mở; huy hiệu đếm dòng mới cả khi chạm trần 20 000 ký tự | — |
| R73 | Khối đang chạy sáng viền vàng 3 px (viền nổi mặc định của Blockly gần như không thấy) | — |
| R74 | Panel đáy mở cao 160 px | — |
| R75 | Dòng điểm nhận nhãn chương trình từng robot và trả cả bảng mục | — |
| R76 | Bảng điểm, đồng hồ cập nhật 4 lần/giây | Đồng hồ trễ ≤ 0,25 s |
| R77 | Báo điểm nổi chỉ trong lúc thi đấu (không lúc xả bóng); cả điểm giảm (xám); "ting" khi có điểm tăng | Lọc chỉ điểm tăng nếu rối |
| R78 | Kiểm tra theo luật, vùng chết, chi tiết phạt chuyển vào thẻ "Sự kiện trận"; điểm đội và phạt có ở màn kết quả | — |
| R79 | Nhiệm vụ ẩn bảng điểm trận | — |
| R80, R81 | "Về màn chính" / "Trận kế tiếp" nối khi có màn chính và giải; ghế hiện "Mặc định", "Của em vN", "Máy Dễ/Vừa/Khó" | — |
| R82 | Âm thanh đọc cài đặt mỗi lần phát | — |
| R84 | Thanh "Tốc độ" bằng nhau cho mọi robot (cùng động cơ TT); cắm cờ, chứa bóng tính từ thông số robot | Chỉnh công thức thanh |
| R87 | Sân Xưởng là đấu tập không bóng, 3 robot kia đứng yên | Đổi sang agent |
| R88 | Nền màn chính là trận tập 4 máy Vừa đang chơi, dựng lại mỗi lần về màn chính | — |
| R91 | Camera theo robot nâng lên 1,0 m, lùi 0,6 m (cũ thấp, bị rào che) | — |
| R92 | Phép thử trình duyệt tua qua 10 s xả bóng bằng cách lùi đồng hồ trận (×40 bị khoá khi có chương trình) | — |
| R113 | Hình thẻ Luật chơi là SVG vẽ từ số đo sân, không chụp sân 3D | Trông "vẽ" hơn ảnh thật |
| R114 | Robot mẫu dùng một khung vẽ 3D nhỏ riêng, tạo khi vào, giải phóng khi rời | — |
| R117 | Vùng khối Robot mẫu chỉ xem (không kéo được, không hộp công cụ) | Chép ~6 dòng màu từ `blocks.ts` |
| R118 | Luật chơi, Robot mẫu là màn của bộ chuyển màn; Esc về màn chính | — |
| R120 | "Mở trong Xưởng" mở cho bạn 1 | Bạn 2 phải đổi bạn ở thanh Xưởng |
| R121 | Mũi tên ↓ từ hàng ô xuống hai mục Luật chơi / Robot mẫu | — |
| R123 | Ở Luật chơi và Robot mẫu, sân nền tạm dừng (không chạy vật lý) và chỉ vẽ lại 2 lần/giây; về màn chính thì chạy tiếp. Robot mẫu không có WebGL thì báo một câu thay hình 3D | Nền đứng yên, camera quay giật nhẹ phía sau thẻ |

### Luật và robot mẫu

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R83 | Chưa hiện "cờ do robot liên minh nào cắm" (trận chưa ghi ai cắm); màn kết quả chỉ có tổng cờ chung | Thiếu một ý của đặc tả §6.1 |
| R115 | Số điểm trên thẻ Luật chơi dò lúc chạy bằng sân giả (phần tính điểm không có hằng xuất ra, không được sửa) | Phụ thuộc hình dạng bảng đếm |
| R116 | Ngưỡng chặn robot G15 (5 s) và danh sách lỗi trên thẻ được phép thử so với mã `match.ts` | Đổi cách viết `foul()` thì sửa phép thử |
| R122 | Thẻ lỗi ghi mã lỗi (P12, S02, P10, G15) và câu "thẻ đỏ do trọng tài người, game không tự rút" | — |

### Quy trình, đóng gói

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R39 | Bản tải về máy đóng gói bằng Tauri 2 như ThingBlock desktop | Đổi cách đóng gói ở Task 18 |
| R112 | Làm Task 17 (Luật chơi, Robot mẫu) trước Task 16 để phép thử đầu-cuối phủ cả hai màn | — |

### Sửa sau rà soát tổng (04/11)

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R125 | Chưa tách `src/fanroc/main.ts` (~1 330 dòng) thành các tệp nhỏ — để đợt sau, đợt này chỉ sửa lỗi rà soát | Tệp còn dài, khó đọc / khó rà |
| R126 | Về chỗ cũ / đổi màn: phiên cũ tạm dừng ngay khi bắt đầu dựng phiên mới; bảng điểm và việc ghi kết quả giải bỏ qua phiên đang bị thay. Bấm Về chỗ cũ ở 0,2 s cuối trận giải ⇒ trận bỏ, không ghi, không loé màn kết quả. Trên Chromium hiện tại phiên mới dựng xong trong cùng lượt (không có khung hình chen giữa) nên lỗi chỉ lộ khi dựng chậm — phép thử N9f chứng minh bằng cách làm chậm tạm 600 ms | Máy chậm mà vẫn lọt thì xem lại thứ tự trong `restart` |
| R127 | ⏭ Từng khối khi không có chương trình nào bước được (chưa nạp, đã dừng, cổng trận chưa mở) không làm gì — không tự tạm dừng phiên, ▶ không phải bấm hai lần | Em bấm ⏭ lúc chưa có chương trình thì không thấy gì đổi |
| R128 | Esc khi ⚙ đang mở chỉ đóng ⚙ (chặn hẳn sự kiện bằng `stopImmediatePropagation`), ở Luật chơi / Robot mẫu không về màn chính; Esc lần nữa mới về | — |
| R129 | Lời nhắc nhiệm vụ lái: "Bấm ▶, lái robot, rồi bấm Chấm." | — |
| R130 | Tên đội trên bảng điểm chỉ đổi khi phiên mới đã dựng xong | — |
| R131 | Xoá mã thừa: màn chờ `createPlaceholder` (màn thật đã có) và biểu tượng Giải đấu trên cột biểu tượng (`onTrophy`, không màn nào hiện) | Muốn biểu tượng Giải đấu thì thêm lại ở `router.ts` + `shell.ts` |
| R132 | Số bạn của giải chỉ áp khi đang ở màn của giải (Pit / ghi danh, trận giải, Xem nhanh, Xưởng mở từ Pit), không ghi vào ⚙ › Hai bạn chơi; rời màn giải thì bàn phím về đúng cài đặt của em. Khoá R85/R89 trong giải giữ nguyên | — |
| R133 | Trận máy chạy ngầm lỗi ⇒ dòng báo ở Pit kèm nút "Thử lại" (xoá lỗi, chạy lại hàng trận máy); lỗi còn hiện khi rời Pit rồi quay lại, tới khi Thử lại hoặc Giải mới | Lỗi lặp lại thì em bấm Thử lại mãi — chưa có lối báo "sân hỏng" |
| R134 | Màn chơi gọn (anh duyệt 04/11): màn chính, trận, giải, nhiệm vụ (danh sách), Luật chơi, Robot mẫu ẩn cột biểu tượng, khung Serial, thanh trạng thái; 🏠 ⚙ nổi góc phải trên (nằm trên màn phủ ⇒ hết lỗi ⚙ bị che). Xưởng và màn làm nhiệm vụ giữ đủ vỏ lập trình. ⚙ › Chế độ giáo viên (lưu trong cài đặt) bật lại đủ vỏ ở màn có khối (trận, trận giải). Thanh chạy và thẻ robot nhỏ vẫn giữ trong trận (cần để Chạy / Tạm dừng / đổi camera). Chữ trên ô màn chính rút còn một dòng ngắn; link AGPL ở ⚙ | Học sinh muốn xem Serial giữa trận phải bật Chế độ giáo viên |
| R135 | Camera Theo robot lùi xa (mức vừa: sau 0,95 m, cao 0,7 m), lăn chuột đổi 3 mức gần / vừa / xa; mức gần cao ≥ 0,54 m để rào Khu Điều Khiển không che robot. Robot mẫu: khung 3D vừa cỡ robot (cả phần vươn), nút "Thử cơ cấu" | Lăn chuột ở góc Theo robot không còn phóng to tự do như góc Toàn sân |
| R136 | Mẫu Maker dựng từ CAD Onshape "Bộ thingbot mới" của anh (assets/robot-maker.json, ~26k tam giác, 370 KB; công cụ scripts/cad/). Đế 4 bánh CAD dùng cho cả đế 2 bánh (hình), đế omni / mecanum thay bánh CAD bằng bánh đa hướng tự dựng cùng chỗ. Khớp tay vòng ước theo hình (cadModel.ts HOOP_PIVOT) | Khớp tay vòng có thể lệch so với robot thật — anh xem nút Thử cơ cấu |
| R137 | Anh chốt 05/11: Mẫu Maker cắm cờ bằng ĐUÔI — thanh răng lùi ra sau mang servo + giá cờ; thanh răng kéo dây nhấc tay vòng. Mô phỏng: giá cờ lúc thu 126,5 mm sau tâm (trên nóc), thanh răng lùi 0,2 m (CAD ~213 mm, trần luật 500 mm: 300 + 162 = 462 mm); robot máy lùi đuôi vào lỗ | Tay vòng nhấc theo M4 (hình); M3 vẫn là cổng "tay vòng xúc bóng" trong bảng cổng — robot thật có thể khác |
| R138 | Mẫu Maker không còn vươn điểm xả bóng tới trước ⇒ chỉ thả bóng ở rãnh mũi xe chạm (Rãnh 1); robot máy lập kế hoạch theo rãnh với tới. Thêm gỡ kẹt khi đi 3 s không lại gần đích. Điểm robot máy 4 Mẫu Maker: Dễ 238 / Vừa 393 / Khó 438 (cũ 417 / 621 / 892) | Trận với robot máy thấp điểm hơn trước; nếu robot thật đổ được Rãnh 2–3 thì cần số đo của anh |
| R139 | Anh chọn 05/11: Xe Ủi, Xe Cắm Cờ, Xe Phân Loại giữ cỡ và mô phỏng cũ, chỉ thay linh kiện bằng linh kiện CAD cùng bộ (assets/robot-parts.json: bánh D65, động cơ, bo ThingBot, servo SG90, khay pin); tấm khung vẫn dựng theo cỡ từng robot. Dải liên minh mọi robot thành hai dải mỏng hai bên | Khung ba robot này chưa phải CAD thật — khi anh có CAD riêng thì thay |
| R140 | Anh chốt 06/11: Mẫu Maker KHÔNG xúc bóng trên sân (bỏ M3 "tay vòng xúc bóng", hết R1 hút). Robot về Khu Tiếp Tế, Human Player bỏ bóng vào tay vòng — 4 bóng là đầy — rồi đổ vào Rãnh 1 (bậc thấp nhất). Anh chọn nguồn bóng: Human Player vẫn chỉ nhặt bóng trong Khu Xuất Phát, robot dùng thân xe ủi bóng về đó. Robot máy: ủi bóng xanh về Khu Xuất Phát, khay đủ 4 thì về nhận; mức Khó ủi thêm bóng cam vào Khu Chữa Cháy khi đường đẩy không vướng bóng xanh. Điểm 4 Mẫu Maker: Dễ 176 / Vừa 232 / Khó 246. Nhiệm vụ 12: ⭐⭐ ≥ 150, ⭐⭐⭐ ≥ 200 | Bóng xanh trong Khu Chữa Cháy (−3 mỗi quả) robot máy không gỡ được bằng thân xe (thử rồi: xe vào góc rào dồn thêm bóng vào khu) |
| R141 | Anh chốt 06/11: bóng của Mẫu Maker nằm trong lồng ống và đi theo đường cong của ống (ống đứng x 58 / z 43 cong xuống vòng cửa ra trước thân, cadModel.ts BALL_CHUTE); servo S3 là nút xả ở cửa ra; robot mẫu không có cơ cấu nâng hạ lồng nên chỉ tới Rãnh 1. Bóng xả ra ở vòng cửa ra (RobotDef.chute: 100 mm trước tâm, cao 93 mm) thay cho điểm xả cũ trên mũi thanh răng. Điểm 4 Mẫu Maker: Dễ 211 / Vừa 224 / Khó 246; Nhiệm vụ 12: ⭐⭐ ≥ 180, ⭐⭐⭐ ≥ 230 | Đường giữa ống em đo trên lưới CAD đã giản lược (ước ±10 mm) |
| R142 | Anh chọn 06/11: làm mẫu cải tiến Maker chỉ từ linh kiện trong CAD "Bộ thingbot mới", khắc phục cả 4 điểm yếu. Ba mẫu mới (robots.ts): **Maker Nâng** — servo MG996R ở S1 (thay "nâng tay") nâng vòng cửa ra từ cao 93 mm trong thân tới 210 mm, vượt mũi 130 mm (RobotDef.chuteLift) ⇒ Rãnh 1 / 2 / 3 ở S1 = 0 / 120 / 180°; **Maker Hút** — con lăn hút động cơ TT ở M3 trước mũi + ống lồng nối dài lên 350 mm (8 bóng); **Maker Pro** — cả hai, mặc định đế 4 bánh omni (M1–M4 bánh, con lăn S4 và thanh răng S5 servo 360, đủ 4 động cơ + 5 servo). Mẫu Maker gốc: vòng cửa ra đứng yên (bỏ "thanh răng kéo dây nhấc vòng" vì anh nói robot mẫu không có cơ cấu nâng hạ). Một trận Khó, 4 robot cùng mẫu, seed 1: Mẫu Maker 235 / Maker Nâng 451 / Maker Hút 421 / Maker Pro 637 | Phần cải tiến vẽ bằng khối đơn giản (servo, cần nâng, máng hai thanh, con lăn, ống nối dài), chưa có CAD thật; thanh răng lùi hết + cửa lồng nâng hết cùng lúc quá trần mở rộng 500 mm (bảng luật báo đỏ, robot máy không làm vậy) |

### Luật V4 — Thang Cứu Hỏa, Hệ số nhân (12/11)

Luật FANROC 2026–2027 bản V4 (cập nhật 07/11/2026): bỏ Vùng Bảo Vệ, đỗ xe và End Game; thêm Thang Cứu Hỏa (leo xà)
và Hệ số nhân; bóng cam ở tầng trang trí bị trừ. Anh chốt 12/11: họ Maker bỏ cắm cờ, cổng S2 thành móc leo xà.

| # | Đã quyết | Nếu sai thì |
|---|---|---|
| R143 | *(Vị trí thay bởi R157.)* Thanh xà theo CAD "Full sân Fanroc" của ThingEdu (anh gửi 12/11): Part 38 ống Ø20 dài 1,400 m giữa tâm hai cột, trục cao 0,6575; Part 34 cột nhôm hộp 20×20 cao 0,638; Part 37 kẹp trụ Ø35 cao 65 mm (y 0,608…0,673). CAD là chi tiết rời không có vị trí lắp, nên đặt theo Hình 1 của luật: cột phía Hộp Phân Phối ở (∓0,202; −1,19), cột phía rào bên ở (∓1,19; −0,198). Vạch Đất / Nước đặt ở chỗ thanh cắt mép Khu Chữa Cháy (z −0,6088), cách đầu rào ≈ 0,580 m, vì luật nói vạch "ngay trên ranh giới Khu Chữa Cháy" và chỉ gọi 430 / 870 là số tham khảo. Thay cho số 1,300 / 0,430 em chọn lúc đầu | Đoạn Đất dài hơn số tham khảo (0,58 so với 0,43); đổi một hằng trong `layout.ts` |
| R144 | Thanh răng M4 của họ Maker vẫn là cơ cấu thật: phần răng trượt (không còn giá cờ) vẫn tính vào trần mở rộng, footprint và S02 như bản 0.8 — đặc tả giữ hình CAD và luật mở rộng 500 mm áp cho mọi phần trượt | Maker vẫn có thể bị S02 khi dùng thanh răng sai (như bản 0.8) |
| R145 | `RobotBody.peers` mặc định rỗng; trận đấu nối danh sách robot cùng thanh khi dựng trận | — |
| R146 | *(Thay bởi R157: về lại 28.)* Ngưỡng ⭐ nhiệm vụ 9 (bóng xanh còn trong Khu Chữa Cháy) 28 → 33: cột thanh xà mới làm bóng xả rơi khác với cùng seed (47 bóng xanh lúc đầu thay vì 38; một lượt quét còn 29 thay vì 24), giữ biên +4 như cũ | ⭐ nhiệm vụ 9 dễ hơn chút; một con số |
| R147 | Phép thử nhật ký leo trong `match.test` lái 3,5 s thay 2,5 s để vượt vạch mới ≈ 0,58 — do hình học đổi, không phải nới phép thử | — |
| R148 | *(Thay bởi R158.)* Robot máy leo cuối trận bám ở s = 0,565 / 0,265 (dọc thanh, tính từ đầu rào), không theo thứ tự cố định; thứ tự chỉ ép khi đang trượt. Khó trượt sang Nước (s 1,05 / 0,70), Vừa dừng ở 0,58 (vừa dưới vạch, Đất), Dễ chỉ chạm. Bám ở 0,15–0,2 bị thẻ vàng S02 ngay vì sát rào, và ép thứ tự bám thì hai robot chờ nhau mãi — kế hoạch ghi "Vừa cả hai ở 0,2" là không làm được vì hai robot cách nhau ≥ 0,3 | Chỉnh lại vài con số trong `agent.ts` |
| R149 | Robot máy lùi ở chỗ chật (hành lang giữa các núi) cho mọi việc, không chỉ lúc đi leo — giới hạn chỉ cho lúc leo làm Mẫu Maker Dễ kẹt giữa núi, seed 1 tụt từ 237 xuống −9 | Mọi trận có robot máy đổi điểm so với bản 0.8 |
| R150 | Auto mẫu của mọi robot phải leo tới Nước (không chấp nhận chỉ Đất), thời gian trượt tăng để qua vạch ≥ ~0,15 m mà chưa chạm cuối thanh — biên 0,06 m làm phép thử chặt hơn dễ gãy | Một con số trong `programs.ts` |
| R151 | Nhiệm vụ 11: "treo và đứng yên ≥ 1 s cũng tính là dừng hẳn" chỉ áp khi đã ở Nước (không tiến thêm được). Ở Đất thì theo luật dừng thường: chương trình còn chạy (còn «đợi») là chạy tiếp, để không cắt ngang lúc em đang chờ rồi mới trượt | Chương trình dừng ở Đất kèm «đợi» dài thì chấm muộn hơn (≤ maxTime 60 s) |
| R152 | Điểm âm: chỉ nhân hệ số khi điểm nhiệm vụ > 0; điểm đội thấp nhất vẫn là 0. Hệ số lưu số nguyên phần trăm (100…180), điểm = ⌈nhiệm vụ × % / 100⌉ | Luật không nói điểm âm nhân thế nào |
| R153 | Giải: hoà điểm xét Tổng Hệ số nhân các trận được tính, rồi trận cao nhất, ít phạt, bốc thăm. Giải lưu từ bản trước V4 (không có hệ số) báo "Giải này đấu theo luật cũ (trước V4)." và cho tạo giải mới, không chuyển đổi; giải cũ đã xong cũng mất bục trao giải | Mất giải đang đấu dở của bản 0.8 |
| R154 | Số đo robot máy sau luật V4 (commit 3faaf9c, headless, 4 robot cùng mẫu, seed 1–3; điểm = nhiệm vụ × hệ số). Mẫu Maker: Dễ 237 / 89 / 240 (TB 188,7; 6 seed 118,2), Vừa 89 / 189 / 261 (TB 179,7; 6 seed 151,2), Khó 290 (161 × 1,80) / 141 / 252 (TB 227,7; 6 seed 228,5). Maker Pro omni Khó 1331 (739 × 1,80) / 1316 / 1120. Leo đúng mức seed 1–3: Mẫu Maker 12/12 mỗi mức, Maker Pro 11/12 Nước. Nhiệm vụ 12: Dễ seed 1–12 TB 106 (từ 4 tới 238) ⇒ ⭐⭐ ≥ 90, ⭐⭐⭐ ≥ 120 (trước 180 / 230) | Ngưỡng nhiệm vụ 12 phụ thuộc seed sân nhiều; Vừa seed 5 cả 4 robot kẹt làn bên, không leo được |
| R155 | Thân robot đang treo không trượt xuyên rào / Hộp Phân Phối / cột: mỗi robot có đoạn chỗ bám [min, max] mà cả 4 góc thân (quay theo thanh, gồm phần đang vươn ra trước / sau như footprint) nằm trong mặt trong rào (`ladder.ts` `slideRange`, `RobotBody.slideRange`); Hộp Phân Phối ở ngoài sân và hai cột ở hai đầu thanh nên trong sân là đủ. Mẫu Maker / Nâng / Hút / Pro 0,256…1,145; Xe Ủi 0,196…1,205; Xe Cắm Cờ 0,219…1,182; Xe Phân Loại 0,236…1,165 (mọi mẫu đều qua vạch Nước 0,580). Đoạn tính lại mỗi bước theo phần đang vươn ra: robot vươn cơ cấu khi treo sát đầu thì đứng yên chỗ cũ (chỉ trượt vào trong được), không tự đẩy thân đi — vươn ra ngoài rào khi đó là S02 của chính robot. Bám từ sàn ở chỗ ngoài đoạn (đứng chéo sát rào) vẫn bám được, chỗ bám dời vào đầu gần nhất của đoạn | Rà soát cuối: trước đây chỉ chặn ở hai đầu thanh (0,05…1,35), Mẫu Maker giữ tiến khi treo trượt xuyên Hộp Phân Phối rồi bị thẻ vàng S02 |
| R156 | Chương trình lưu ở Xưởng có dấu luật `rules: 4` (khoá `fanroc.v1.` giữ nguyên, bản cũ vẫn đọc được). Chương trình họ Maker không có dấu (lưu từ 0.8, khi S2 là kẹp cờ và TeleOp mẫu để S2 = 180 lúc chờ) thì báo, **không tự đổi**: "Chương trình lưu theo luật cũ: S2 nay là móc leo xà (180° = giơ móc). Ở Xưởng lập trình bấm Về mặc định để lấy chương trình mẫu mới." — ở Xưởng, Trước trận (khi chạy bản của em), ghi danh giải và Pit. Lưu lại (kể cả chưa sửa) là có dấu, hết báo. Robot khác không đổi nghĩa cổng nào nên không báo. Cùng đợt: Mẫu Maker / Maker Hút bỏ "nâng tay" S1 (L1 / L2) vì không còn cờ để nâng | Anh chốt: dấu + báo, không chuyển đổi tự động |
| R157 | **Vị trí lắp thanh xà theo CAD một tệp "Lắp sân (1).step" (Onshape, anh gửi 12/11), thay R143 (Hình 1).** Toạ độ game x = x CAD, z = −y CAD, sàn CAD z = 0,0082. Tâm cột (Part 34, hộp 20×20, sàn → 0,638): Đỏ a (−1,2356; −0,2897) phía rào cạnh, b (−0,2895; −1,2358) phía Hộp Phân Phối; Xanh a (1,2355; −0,2898), b (0,2894; −1,2358) — cả bốn cột ngoài mặt trong rào, lấy nguyên số CAD (hai bên lệch 0,1 mm). Kẹp Part 37 ở đầu cột (tâm 0,6405). Ống Part 38 Ø20 dài 1,400 m, đúng 45°, trục cao 0,6574 (trước 0,6575). Tâm hai cột cách nhau 1,338 m; theo hai đầu ống CAD (Đỏ (−1,2482; −0,2772) → (−0,2582; −1,2671)) ống thò 0,018 phía cột a và 0,044 phía cột b (`LADDER.overhang`) — không chia đều 0,031 mỗi đầu như tóm tắt. s (chỗ bám) đo từ tâm cột a, `ladderLen` = 1,338. Vạch Đất / Nước vẫn = chỗ thanh cắt mép Khu Chữa Cháy (z −0,6088): ≈ 0,451 m từ tâm cột a, x ≈ −0,917 (băng keo CAD Part 39/40 ở x ≈ −0,899, lệch < 0,03 m dọc thanh). Vạch sàn không đổi; ô THANG lệch trục thanh ≈ 0,087 m (trước 9 mm). Hệ quả: đoạn trượt trong sân Mẫu Maker 0,320…1,017 (trước 0,256…1,145), Xe Ủi 0,260…1,077, Xe Cắm Cờ 0,283…1,055, Xe Phân Loại 0,300…1,037 — đoạn Đất bám được chỉ vừa **một** thân treo. Nhiệm vụ 9: cột ra ngoài sân nên bóng xả rơi lại như cũ, MISSION_SEED 40 bóng xanh, một lượt quét còn 24 ⇒ ngưỡng ⭐ về lại ≤ 28 (thay R146). Phép thử cột / kẹp bắn tia qua đúng tâm cột (tia lệch 5 mm qua mặt trụ kẹp ở chỗ mới bị Rapier báo trúng sớm ~4 mm) | Một hằng trong `layout.ts`; nếu băng keo CAD (x ≈ −0,899) mới là vạch thật thì đoạn Đất ngắn thêm ~0,025 |
| R158 | **Robot máy leo theo thanh CAD lắp sân (thay R148).** Chỗ bám chung `LADDER.divider − 0,06` ≈ 0,391 cho mọi robot treo. Khó: cả hai bám chung chỗ đó, lần lượt — ai bám trước trượt tới 0,98, robot sau dừng cách robot trước 0,32 (≈ 0,66), cả hai Nước; robot tới sau chờ ở điểm chờ tới khi chỗ bám trống (không ai đứng, không thân treo nào trong 0,32). Không ấn định thứ tự (chờ robot ở xa thì robot chờ đứng chắn lối dọc rào). ETA leo của cả hai cộng thêm thời gian chờ (6 s bám + 0,32 / 0,15 s trượt). Đang ở túi sau thanh của mình thì chờ trong túi; đang ở ngoài thì không đi xuyên túi của mình (lối từ túi tới chỗ bám hẹp, đồng đội treo là bịt). **Vừa: hai robot treo ở Đất là không thể (0,320 + 0,3 > vạch 0,451) ⇒ ô 0 treo Đất ở 0,391 (cách vạch 0,06), ô 1 đứng sàn chạm xà ở 0,80 ⇒ hệ số 130 % (không còn 140 %).** Dễ: chạm xà ở 0,80 / 0,391. Lối giữa góc Núi C / D và thanh chỉ còn ≈ 0,25 m (góc núi chiếu lên thanh ở s ≈ 0,68). Số đo (4 Mẫu Maker, thứ tự [Đỏ 0, Đỏ 1, Xanh 0, Xanh 1], seed 1–6): Dễ 128 / 165 / 22 / 76 / 172 / 56 (TB 103,2), Vừa 229 / 179 / 94 / 155 / 172 / 210 (TB 173,2), Khó 310 / 173 / 150 / 274 / 240 / 17 (TB 194,0) — Khó > Vừa > Dễ. Leo đúng mức seed 1–6: Khó 24/24, Vừa 22/24, Dễ 21/24; Maker Pro omni Khó 24/24 Nước. Khó seed 6 chỉ 17: sân seed 6 (bóng xả rơi khác vì cột ra ngoài) có 54 bóng cam trên núi ngay từ đầu và cả 4 robot đứng không việc gì 50…140 s — cả agent cũ cũng vậy trên sân mới | Vừa thấp hơn trước (130 % thay 140 %); thử 0,72 / 0,80 / 1,00 cho chỗ chạm: Vừa leo đúng 23 / 22 / 21 trên 24, Dễ 19 / 21 / 21, 0,72 trượt seed 1 |
| R159 | Auto mẫu theo thanh CAD lắp sân: `toLadder` 4,4 → 4,85 s (đi sâu thêm tới chỗ trục thanh cách rào trái đúng bằng chỗ xe lùi sau lần ép, z ≈ −0,55), `hookUp` 0,5 → 0,2 s (đoạn Đất ngắn). Đo 8 cấu hình: hạ móc ở s 0,352…0,393 (lệch trục ≤ 0,030), dừng ở s 0,800…0,842, quá vạch 0,349…0,391 m (phép thử đòi ≥ 0,15). Nhiệm vụ 11 dùng cùng số: 3 sao, chấm lúc 20,2 s, s 0,832 (đợi 2 s: 22,3 s, s 0,834); đường gợi ý tới chỗ bám ngay dưới thanh thay vì giữa ô vàng, gợi ý "đứng ngay dưới thanh xà (lệch về phía rào trái so với giữa ô)". Nhiệm vụ 12 đo lại (R141): Dễ seed 1–12 TB 94,4 (59…131) ⇒ ⭐⭐ ≥ 80, ⭐⭐⭐ ≥ 105 (trước 90 / 120) | Vài con số trong `programs.ts` / `missions/data.ts` |
| R160 | **Móc thu gọn trong thân lúc xuất phát** (anh Tuấn 12/11: "cơ cấu dư vi phạm thiết kế"). Móc vẽ là cần ống lồng thẳng đứng ở tâm nóc, đầu chữ J vươn 44 mm khỏi trục: 0° rút hết, đỉnh móc ngang nóc xe; giơ dần theo góc servo, từ 150° trở lên đỉnh móc cao hơn trục thanh 3 cm; đang treo cần dài đúng từ nóc thân tới trục thanh. Không bao giờ nằm ngang chĩa ra ngoài khung (bản trước: 0° là cần dài ~0,45 m nằm ngang chĩa ra trước). `hookTop()` (ladder.ts) dùng chung cho hình 3D và ô R01: R01 tính cả móc đã thu (mọi mẫu vẫn ≤ 300 × 300 × 850). Vật lý leo không đổi (chưa từng giả định móc nằm ngang). **Bổ sung cùng ngày (anh Tuấn): móc lò xo** — lúc xuất phát cần gập, cài chốt; servo tới 150° trở lên nhả chốt, lò xo bật móc lên nhanh (~0,15 s, chỉ hoạt cảnh); servo hạ là tời cuốn móc xuống theo góc (chậm hơn), về nóc với servo ≤ 30° thì cài chốt lại (`stepHook`). Lò xo chỉ nâng móc, robot lên xà do tời kéo — luật RC04 cấm lò xo bắn robot lên thanh; cổng ghi "Móc leo xà (lò xo bật móc)" | Chỉ là hình vẽ + kiểm tra kích thước |
| R161 | **Nhiệm vụ 5 thành «tiến (giây)»** (anh Tuấn 12/11: robot không có encoder nên hàm đi theo mét không thực tế). Khối của em «tiến (giây)»: M1 = M2 = 60, «đợi (giây)», dừng; học sinh tự tính số giây = mét ÷ quãng đi trong 1 giây đo ở nhiệm vụ 4 (1 m ⇒ 3,64 s). Đích, ⭐/⭐⭐/⭐⭐⭐ giữ nguyên (⭐⭐⭐ = hai lần gọi, vd «tiến (1.45)» + «tiến (2.18)»). Đo trên sân: hai lần gọi 1,45 + 2,18 s dừng ở x 0,099 (đích 0,100) 3 sao; một lần 3,64 s 2 sao. Giữ id `khoi-tien` và **giữ sao cũ** (đã đạt trên bản theo mét — cùng đích, cùng kỹ năng). Nhiệm vụ 7 / 8 dùng cùng khối: lời giải gọi «tiến (2.62)» (0,72 m) / «tiến (2.55)» (0,70 m); chương trình sai của nhiệm vụ 8 nay chỉ sai ở «rẽ trái» (chia 100). «rẽ trái (độ)» của nhiệm vụ 6 chưa đổi (chờ anh). Spec 03/11 giữ chữ cũ (tài liệu lịch sử) | Chạm chân Núi D ở nhiệm vụ 8 nhạy với số giây (2,50 / 2,54 / 2,55 chạm, 2,52 không) — không chấm nên không đổi sao |
| R162 | **Robot xuất phát đa dạng** (anh Tuấn 12/11). Đội hình mặc định theo ghế SEATS (`DEFAULT_LINEUP`, quickmatch.ts): Đỏ 1 (ghế của em) Mẫu Maker, Xanh 1 Chuồn Chuồn **Maker Hút**, Đỏ 2 Kiến Lửa **Xe Cắm Cờ**, Xanh 2 Ong Vàng **Maker Nâng** — mỗi mẫu một việc khác nhau (hút bóng trên sân, cắm cờ, đổ Rãnh 2–3), cả bốn đều ghi điểm và leo được. Dùng cho Trận lẻ, Đấu tập, sân nền màn chính và ghế đứng yên ở Xưởng; ghế do bạn lái (hay chép chương trình của bạn) vẫn là robot bạn chọn. Giải đấu không đổi: 7 đội máy đã trộn 4 mẫu (Mẫu Maker, Xe Ủi, Xe Cắm Cờ, Xe Phân Loại). Số đo (seed 1–6, 4 robot máy cùng mức): Dễ 252 / 276 / 135 / 156 / 167 / 178 (TB 194,0), Vừa 206 / 318 / 242 / 176 / 227 / 297 (TB 244,3), Khó 503 / 393 / 317 / 575 / 544 / 341 (TB 445,5) — Khó > Vừa > Dễ; Khó cả 4 treo Nước mọi seed, Vừa / Khó Xe Cắm Cờ cắm 1 cờ mỗi trận, Dễ mẫu nào cũng chạm xà. **Nhiệm vụ 12 giữ đội hình riêng 4 Mẫu Maker** (`Mission.lineup`; rà soát 12/11: em lái Mẫu Maker, ngưỡng sao R141 so em với robot máy CÙNG MẪU — bản đầu của R162 cho nhiệm vụ 12 theo đội hình đa dạng, TB Dễ seed 1–12 thành 160,9 và ngưỡng 135 / 175, đã bỏ). Đo lại R141 trên 4 Mẫu Maker sau R162–R165: 59 / 107 / 114 / 128 / 81 / 131 / 76 / 83 / 60 / 86 / 120 / 88, TB 94,4 — không đổi ⇒ giữ ⭐⭐ ≥ 80, ⭐⭐⭐ ≥ 105. Phép thử: dữ liệu nhiệm vụ 12 (4 Mẫu Maker, 80 / 105) và e2e N3c (vào nhiệm vụ 12 ⇒ 4 Mẫu Maker; Trận lẻ sau đó lại đa dạng) | Trận lẻ thường và nhiệm vụ 12 khác đội hình |
| R163 | Phép thử giới hạn giờ pha quay theo thanh (`CLIMB_ALIGN_MAX_S` = 2,5 s, rà soát 12/11: phép thử cũ không bao giờ kẹt, đổi thành 60 vẫn qua). Dò 8 chỗ đỗ robot sàn quanh chỗ bám, 15 thân treo ngay sau chỗ bám, 72 thế đứng lệch về phía rào: không thế nào kẹt thật (góc xe đẩy được robot sàn, sát rào vẫn quay được). Phép thử mới dựng kẹt ở chính robot: bánh không ăn lệnh ⇒ không tiến độ ⇒ phải bỏ pha quay sau 2,5 s (đo: đứng liền 2,0…3,0 s, ≥ 1 lần bỏ). Đổi 60 / bỏ điều kiện giờ / đổi 1 đều trượt | Phép thử dùng chỗ chặn ở `RobotBody.apply`, không phải cảnh trên sân |
| R164 | Móc cài chốt lại ở servo ≤ 30° (rà soát 12/11): `hookTop` đứng sàn trước tính `deg / upDeg` nên chỉ đúng 0° mới rút hết, `stepHook` cài chốt lại gần như chỉ ở 0° — lệch chữ R160 ("servo ≤ 30°") và vật lý leo (≤ `HOOK.downDeg` là hạ). Nay `frac = clamp((deg − downDeg) / (upDeg − downDeg))`: ≤ 30° cần rút hết, 30…150° duỗi dần, ≥ 150° giơ hết. Phép thử: 10 / 20 / 30° đỉnh móc ở nóc, 31° cao hơn; về 30° cài chốt, dừng 31° chưa cài (trả công thức cũ, hay đổi điều kiện cài thành 0°: trượt) | Chỉ hình vẽ; vật lý leo không đổi |
| R165 | `CLIMB_FAR` (0,98) / `CLIMB_TOUCH` (0,80) của robot máy kẹp theo hình học (rà soát 12/11): `fitClimbPlan` hạ chỗ bám / chỗ dừng phía Nước về `slideRange(thân mẫu).max − 0,03` khi số đo cho Mẫu Maker vượt đoạn trượt của mẫu (thân dài / rộng hơn, thanh ngắn hơn); không lùi qua chỗ bám ở Đất. Kẹp chứ không thay hẳn bằng `max − 0,03`: mọi mẫu hiện có max ≥ 1,017 nên hành vi và mọi số đo (R158, R162) giữ nguyên; 0,80 là số chọn bằng đo (R158), không phải hình học. Dùng thân tĩnh của mẫu (không tính cơ cấu đang vươn) để kế hoạch không đổi giữa trận | Mẫu mới ngắn đoạn trượt sẽ dừng sớm hơn 0,98 |
| R166 | **Lá cờ của Xe Cắm Cờ nằm trong khung lúc xuất phát** (anh Tuấn 12/11: "cơ cấu dư vi phạm thiết kế, không được để như vậy lúc xuất phát"; rà soát: ở S1 = 0 cờ vẽ ở mũi + 0,05, đế thò ~7 cm). Điểm kẹp cờ tách khỏi điểm xả bóng (`release.reach` vẫn là chỗ xả bóng): `flagGrip` = −0,025 (trong mũi 25 mm) lúc tay thu; tay S1 vươn `arm.reach` 0,14 → 0,215 nên duỗi hết điểm kẹp vẫn ở mũi + 0,19 như trước — cắm cờ không đổi (robot máy Vừa / Khó vẫn cắm 1 cờ mỗi trận, số đo R162 y nguyên). Gốc tay trên hình lùi vào thân (đầu tay z 125 mm < mũi 140). Mở rộng tính phần điểm kẹp nhô khỏi mũi (`armOverhang` = max(0, flagGrip + S1/180 × reach)): duỗi hết 280 + 190 = 470 mm (trước ghi 420 nhưng điểm kẹp thật ở 190). `FLAG_SHAPE` (đế Ø42 × 45, cột 135, lá 90 × 60) dùng chung cho hình và `flagEnvelope`; R01 tính cả đỉnh cột cờ (Xe Cắm Cờ cao 371 mm ≤ 850). Phép thử: mọi robot có cờ, tay thu (cả thùng nâng hết) thì hộp bao cờ trong khung; flagGrip 0,05 / −0,01, `localGripPoint` bỏ flagGrip, R01 bỏ cờ đều trượt **Bổ sung (rà soát 12/11, "cờ đứng trên sàn trước xe"):** đo trên trang lúc xuất phát, hình đang vẽ (thế giới) — đế z 0,917…0,959, cột 0,935…0,940, lá x −0,271…−0,181 — đều trong khung xe (z 0,913…1,193, x −0,273…−0,088); ảnh chụp thẳng từ trên xuống cũng vậy. Cái thấy "đứng trên sàn trước xe" là phối cảnh: cờ treo ở cao 0,19…0,37 m trên mũi, camera sau lưng nhìn chếch xuống nên chiếu ra trước, bóng đổ trên sàn, mà tay cờ vẽ lệch sang bên (x 70 mm, cao 80 mm) không nối với kẹp. Sửa hình: tay chạy thẳng cùng trục / cùng độ cao với kẹp, thêm cột đỡ từ tấm đế lên khớp tay — cờ nhìn là gắn trên đầu tay. Giữ đế cờ lúc kẹp: cờ thật FANROC có đế, đế là phần cắm xuống lỗ. e2e N3c đo hộp bao của hình cờ đang vẽ (`__fanroc.heldFlag`) phải trong khung (dời cờ trong hình 60 mm, hay flagGrip 0,05: trượt) | Thân dài thêm 0,05 khi duỗi hết tay (footprint / S02 tính đúng chỗ cờ) |

### Việc còn chờ anh

- Mở thử 4 tệp `.tb` xuất ra trong ThingBlock desktop (kiểm bằng mắt, R41).
- Chơi thử nhiệm vụ 9 bằng bàn phím xem ngưỡng ≤ 28 bóng có vừa sức không (R96).
- Ngưỡng sao nhiệm vụ 12 (350 / 450 điểm) chưa thử thật (R56).
- Đọc lại lời thẻ Luật chơi trước khi đem ra sự kiện công khai.
- Xin phép ban tổ chức dùng tên FANROC trước khi công khai.
- Hỏi anh trước khi đăng / push lưới núi CAD (`assets/mountain-mesh.json`, R12).
- Chưa hiện cờ theo liên minh (R83).
- Lỗi chung ở `src/blocks.ts` (`setToolbox` dùng lại khối cũ của khay khối khi đổi hộp công cụ) ảnh hưởng bài học robot.edu.vn — game đã tự tránh trong `editor.ts`, tệp chung chưa sửa.
- Mã Arduino của khối của em có ô số chưa đúng trên ThingBot thật (R37) — cần sửa ở ThingBlock gốc.
- Luật V4: ngưỡng sao nhiệm vụ 12 (80 / 105, R159, R162) lệ thuộc seed sân (Dễ 59…131) — anh xem có cần cố định seed (R154).
- Luật V4: robot máy Vừa đôi khi kẹt cả 4 ở làn bên rào nên không leo (seed 5), chưa sửa (R154).
- Thanh theo CAD lắp sân chỉ vừa một robot treo ở Đất: robot máy Vừa nay 1 Đất + 1 Chạm (130 %) — anh xem có muốn khác (R158).
- Băng keo CAD ở x ≈ −0,899 lệch vạch tính (mép Khu Chữa Cháy, x ≈ −0,917) ~0,025 m dọc thanh; đang theo mép Khu (R157).
- Push nhánh `feat/fanroc` trước khi phát hành công khai, để đường dẫn mã nguồn AGPL trong game trỏ tới đúng mã đang chạy.
