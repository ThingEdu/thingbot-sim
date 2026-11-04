# FANROC Thanh Hỏa / ThingBot FanRoc Game — các điều đã tự quyết khi thi công (R1–R138)

Đợt 1 (R1–R34) thi công ngày 03/11/2026 theo kế hoạch `docs/superpowers/plans/2026-11-03-fanroc-sim.md`
và đặc tả `docs/superpowers/specs/2026-11-03-fanroc-sim-design.md`; đợt 2 — giao diện game "ThingBot FanRoc Game"
(R35–R124, sửa sau rà soát tổng R125–R133) — ngày 04/11/2026 theo kế hoạch `docs/superpowers/plans/2026-11-04-fanroc-game.md` và đặc tả
`docs/superpowers/specs/2026-11-03-fanroc-ui-nhiem-vu-design.md` (xem mục cuối). Nhánh `feat/fanroc`.
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
- Push nhánh `feat/fanroc` trước khi phát hành công khai, để đường dẫn mã nguồn AGPL trong game trỏ tới đúng mã đang chạy.
