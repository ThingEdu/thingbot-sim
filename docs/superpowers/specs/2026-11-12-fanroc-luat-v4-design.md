# Cập nhật ThingBot FanRoc Challenge theo luật FANROC 2026 V4 — thiết kế

Ngày 12/11/2026. Nhánh `feat/fanroc`. Nguồn: tài liệu "FANROC 2026 - Luật thi đấu Bảng Robotics - V4" (Google Docs,
bản cập nhật 31/10 và 07/11). Game hiện theo bản 28/09. Không chép văn bản luật vào kho hay vào game (giữ quy tắc cũ);
chỉ lấy số đo và cách tính, viết lại bằng lời của game.

## Vì sao

Ban tổ chức đổi đề: bỏ Vùng Bảo Vệ Xanh và End Game, thêm nhiệm vụ Leo Thang Cứu Hỏa với Hệ số nhân. Học sinh dùng game
để tập trước giải, nên game phải tính điểm và bố trí sân đúng đề mới. Nếu sai, học sinh sẽ luyện theo chiến thuật cũ
(về đỗ cuối trận) và không biết leo xà.

## Thay đổi luật cần làm

| # | Luật V4 | Game hiện tại |
|---|---|---|
| L1 | Bỏ Vùng Bảo Vệ Xanh (điểm đỗ 5/10, thưởng 10) | Có đỗ, agent về đỗ, NV11 "Về Vùng Bảo Vệ" |
| L2 | Bỏ End Game (30 s cuối) | Báo "còn 30 giây", đỗ chỉ tính trong End Game |
| L3 | Thêm 2 thanh xà, mỗi liên minh một thanh, và ô vàng Khu vực Thang Cứu Hỏa 375×375 dưới đoạn Đất | Không có |
| L4 | Hệ số nhân = 1,0 + tổng mức của 4 robot (Chạm +0,05; treo Đất +0,10; treo Nước +0,20). Điểm trận = ⌈Điểm nhiệm vụ × Hệ số⌉ | Cộng điểm thẳng |
| L5 | Điểm đội = Điểm trận − phạt của đội; phạt không nhân hệ số; thấp nhất 0; thẻ đỏ = 0 | `teamScore` đã đúng phần này, chỉ đổi đầu vào |
| L6 | Bóng xanh ở tầng trang trí không được tính; bóng cam ở bất kỳ đâu trên núi (cả tầng trang trí) bị −3 | Tầng trang trí tính như Rãnh 1; cam chỉ bị trừ trên rãnh |
| L7 | Xếp hạng: hoà Điểm xếp hạng thì xét Tổng Hệ số nhân (các trận được tính), rồi điểm trận cao nhất, rồi ít phạt | Chưa có Tổng Hệ số nhân |

Không ảnh hưởng game: Human Player, kiểm tra robot 2 đợt, mạch Chung kết, bảng chỉ THCS.

## Sân: thanh xà (kích thước theo CAD sân mới 12/11, vị trí theo Hình 1)

Hình 1 của luật: mỗi thanh nối từ cột ở đầu Hộp Phân Phối, chạy chéo qua Khu Chữa Cháy và ô vàng, tới cột trên rào cạnh
của phía liên minh đó (thanh Đỏ bên x < 0, thanh Xanh bên x > 0, đối xứng).

Chốt (controller): kích thước lấy từ CAD "Full sân Fanroc" (các chi tiết rời, không có vị trí lắp); vị trí đặt theo Hình 1;
vạch = chỗ thanh cắt mép Khu Chữa Cháy (tính ra, không gõ tay). Số "khoảng 430 / 870 mm" trong luật chỉ để tham khảo.
Các số 1,300 / 0,650 / 0,43 / Ø25 cũ bị thay hết.

- Thanh (Part 38): ống Ø20 dày 2 mm, dài 1,400 m giữa tâm hai cột, trục cao 0,6575 m.
- Cột (Part 34): nhôm hộp 20×20, cao 0,638 m. Kẹp đầu cột (Part 37): trụ Ø35 cao 65 mm (y 0,608…0,673) đón ống.
- Đầu rào: (∓1,19; −0,198). Đầu Hộp Phân Phối: (∓0,202; −1,19), sát mép hộp. Dài 1,4001.
- Vạch: thanh cắt mép z = −0,6088 của Khu Chữa Cháy, cách đầu rào 0,580 m (x ≈ ∓0,781), trong Khu Chữa Cháy.
- Ô vàng `ZONES.ladder` (375×375): thanh đi qua tâm ô, lệch 9 mm.
- Cột và kẹp có va chạm (robot không đi xuyên); vẽ đúng hộp 20×20 và trụ Ø35.
- Vạch là một khoanh băng keo cùng màu liên minh.

Thanh xà vẽ trên bản đồ thẻ Luật chơi (SVG) và sân 3D.

## Leo xà (anh chọn: móc bám đơn giản)

Robot không mô phỏng khớp bằng vật lý. Leo là một trạng thái của robot do game điều khiển, kích hoạt bằng servo móc.

**Móc**: một tay móc gắn trên servo, vẽ bằng khối đơn giản (chưa có CAD).
- **Anh chốt 12/11: họ Maker bỏ cắm cờ, lấy cổng S2 (trước là "Kẹp cờ") làm "Móc leo xà".** Áp cho cả bốn mẫu Maker,
  Maker Nâng, Maker Hút, Maker Pro; vì vậy Maker Pro trên đế 4 bánh vẫn đủ 5 servo.
  - Bỏ `flag`, `rearGrip`, `flagFront` của họ Maker.
  - Móc đặt giữa thân xe, cho mọi mẫu giống nhau. Thanh răng M4 giữ nguyên hình CAD, nay không mang cờ nữa.
- Cổng và nút móc ghi rõ cho từng mẫu:
  - họ Maker: S2, nút □;
  - Xe Ủi: S2, nút □;
  - Xe Cắm Cờ: S4, nút R1 (□ vẫn là kẹp cờ);
  - Xe Phân Loại: S1, nút □.
  - Mẫu nào cũng không quá 5 servo.
- Giữ nút thì giơ móc; nhả nút thì hạ móc, tức kéo robot lên xà.
- Nhiệm vụ 10 "Cắm cờ" đổi robot sang Xe Cắm Cờ. Robot máy họ Maker không đi cắm cờ nữa.
- Bảng cổng và thẻ robot ghi cổng móc, ví dụ "S2: Móc leo xà".
- Góc servo ≥ 150° là móc giơ lên. Đầu móc khi giơ cao hơn thanh xà, robot nào gắn móc cũng không cao quá 850 mm.

**Trạng thái** (mỗi robot một trạng thái, tính mỗi bước):
- `floor`: bình thường.
- `contact`: móc đang giơ, đầu móc cách trục thanh ≤ 3 cm (nhìn từ trên), bánh vẫn trên sàn. Được +0,05.
- `hang`: robot treo. Vào `hang` khi đang `contact` mà hạ móc (góc ≤ 30°), giống tời kéo robot lên. Lúc vào, chỗ bám
  phải ở đoạn Đất. Nếu bám ở đoạn Nước thì robot không treo được mà rơi xuống (luật: phải bám từ Đất rồi mới sang Nước).
  Khi treo:
  - robot thành vật thể động học, lơ lửng, quay theo hướng thanh;
  - lệnh bánh tiến/lùi (trung bình hai bánh) đẩy robot trượt dọc thanh, tối đa 0,15 m/s;
  - chỗ bám dừng lại ở hai đầu thanh.
- Chỗ bám ở đoạn Đất (kể cả chạm vạch) cho +0,10. Đã qua hẳn vạch thì là Nước, +0,20.
- Rơi: đang treo mà giơ móc lại (≥ 150°) thì robot rơi xuống sàn và thành vật thể bình thường. Phải bám lại từ Đất.
- Mỗi thanh treo được tối đa 2 robot. Robot thứ ba không bám được: cứ ở `contact`, nhưng chỉ được tính nếu thanh đó đúng
  liên minh.
- Robot leo thanh của liên minh kia: vẫn treo được (vật lý), nhưng mức tính là 0.
- Hết giờ: robot đang treo giữ nguyên (động học), nên khoảng 5 s ổn định không đổi gì.

**Chấm leo** (`climbState(robot)` → `none | contact | ground | water`): dùng ở bảng điểm, màn kết quả, nhiệm vụ và agent.

## Tính điểm

`scoring.ts`:
- Bỏ `Park`, `parks`, `allianceShare`, `park` khỏi các bảng tách điểm.
- `FieldTally` thêm `climbs: Record<Alliance, Climb[]>`, trong đó `Climb = 'none' | 'contact' | 'ground' | 'water'`.
- Tầng trang trí: bóng xanh không tính. Bóng cam ở mọi tầng của núi (kể cả trang trí) bị −3. Vì vậy `TIER_GROOVE`
  không còn gộp tầng trang trí vào Rãnh 1. Tầng trang trí thành một vị trí riêng, chỉ dùng để trừ bóng cam.
- `ScoreBreakdown` có:
  - `mission`: tổng bóng, cờ và bóng sai, có thể âm;
  - `multPct`: hệ số tính theo phần trăm, 100…180, lưu số nguyên để không lệch số thực;
  - `total = ⌈mission × multPct / 100⌉`, chỉ dùng số nguyên.
  - Ví dụ của luật: 205 × 155 = 31775, chia 100 làm tròn lên ra 318. Dùng đúng ví dụ này làm test.
- Điểm nhiệm vụ âm: luật không nói. Em chọn chỉ nhân hệ số khi điểm nhiệm vụ > 0, còn âm thì giữ nguyên. Điểm đội vẫn
  thấp nhất là 0.
- `teamScore` giữ nguyên.

## Trận, bảng điểm, màn kết quả

- `match.ts`:
  - bỏ `ENDGAME_S`, `endgame`, `parked` và dòng báo End Game;
  - mỗi bước cập nhật trạng thái leo;
  - phạt "chặn robot" cũ được miễn khi robot ở Vùng Bảo Vệ của mình. Nay đổi miễn thành khi robot đang treo, vì robot
    treo không tránh được.
- Bảng điểm trên đầu:
  - ô giữa ghi điểm trận chung, dưới đó một dòng nhỏ dạng "205 × 1,55";
  - hai bên vẫn là Đỏ / Xanh, mỗi ô là điểm từng đội sau phạt.
  - Bảng hiện vẫn tách hai bên dù điểm là của chung (anh từng nhắc). Với luật mới, hai bên mang ý nghĩa thật: phạt
    riêng từng đội.
- Màn kết quả và thẻ "Sự kiện trận":
  - thêm hàng Leo xà, cho mỗi robot: Chạm / Đất / Nước / —, kèm mức +0,05…;
  - thêm hàng Hệ số nhân, hàng Điểm nhiệm vụ và phép nhân.
- Thông báo trôi (feed): "Robot Đỏ 1 treo ở Khu vực Nước (+0,20)" khi trạng thái leo đổi, có chờ ngắn để khỏi nháy.

## Robot máy (agent)

- Bỏ hẳn phần về đỗ (`PARK_*`, `forgetPark`, `parkEta`).
- Thêm việc `climb` cuối trận, dùng lại cách ước giờ về như về đỗ cũ:
  1. tới ô vàng của mình;
  2. quay theo thanh, giơ móc, hạ móc để treo;
  3. lái tiến sang Nước.
- Theo mức:
  - Dễ: chỉ Chạm;
  - Vừa: treo Đất;
  - Khó: sang Nước.
- Robot không có móc thì không leo, làm việc bóng tới hết giờ.
- Hai robot cùng liên minh dùng chung một thanh: robot tới sau chờ robot trước trượt sang Nước rồi mới bám.
- Đo lại điểm một trận Khó, 4 robot cùng mẫu, seed 1 (như R142), rồi ghi vào `quyet-dinh.md`.

## Nhiệm vụ 11: Leo Thang Cứu Hỏa (thay "Về Vùng Bảo Vệ")

- id `leo-thang`, chặng 3, nhiệm vụ lập trình. Robot xuất phát trong Khu Xuất Phát; robot mẫu (Mẫu Maker) có móc ở S2.
- Ba sao:
  - ⭐ chạm xà;
  - ⭐⭐ treo ở Đất;
  - ⭐⭐⭐ treo ở Nước.
- Chấm khi robot dừng hẳn, hoặc khi đang treo mà đứng yên ≥ 1 s.
- Hướng dẫn từng bước:
  1. lái tới ô vàng;
  2. quay mặt theo thanh;
  3. đặt servo S2 = 180° (giơ móc), tiến cho chạm thanh;
  4. đặt S2 = 0° (kéo lên);
  5. chạy tiến để trượt qua vạch.
- Có lời giải mẫu trong `solutions.ts`, có test chạy lời giải đạt 3 sao.
- Tiến độ đã lưu của id cũ `ve-vung-bao-ve` bỏ qua, không lỗi.
- NV12 "Trận đầu tiên": đo lại mốc sao sau khi agent leo xà.

## Giải đấu

- Kết quả mỗi trận lưu thêm `multPct`.
- Xếp hạng khi hoà xét lần lượt:
  1. tổng `multPct` các trận được tính;
  2. trận cao nhất;
  3. ít phạt;
  4. bốc thăm (như hiện nay).
- Giải đã lưu theo luật cũ (không có `multPct`): mở lên báo "Giải này theo luật cũ" và cho tạo giải mới. Không cố chuyển
  đổi.

## Lời và tài liệu

- `rules-data.ts` / thẻ Luật chơi:
  - bỏ dòng đỗ và End Game;
  - thêm mục Leo Thang Cứu Hỏa (ba mức, công thức có ví dụ ⌈205 × 1,55⌉ = 318);
  - sửa dòng tầng trang trí và bóng cam;
  - vẽ dòng thời gian không còn End Game.
- `docs/fanroc/huong-dan-hoc-sinh.md`:
  - sửa bảng nhiệm vụ (11 Leo Thang Cứu Hỏa);
  - thêm phím móc trong bảng phím (nút có sẵn của tay cầm, chọn khi lên kế hoạch);
  - ghi rõ game theo luật V4.
- `docs/fanroc/quyet-dinh.md`: ghi các phán quyết mới (vị trí thanh tự giải, Ø 25, điểm âm không nhân, cổng móc).

## Không làm

- Không mô phỏng khớp, lực bám, robot đẩy nhau qua vạch, robot đỡ robot khác lên xà.
- Không thêm khối ThingBlock mới (móc dùng khối servo có sẵn).
- Không đổi khoá lưu trữ `fanroc.v1.` (giữ chương trình Xưởng của học sinh).
- Không phát hành, push hay tag khi chưa hỏi anh.

## Đã chốt / còn chờ

1. Đã chốt (12/11): họ Maker bỏ cờ, S2 làm móc (xem mục Leo xà).
2. **Đã thay bằng R143 (docs/fanroc/quyet-dinh.md):** thanh lấy theo CAD "Full sân Fanroc" (dài 1,400 m giữa tâm hai cột,
   vạch Đất/Nước tính từ hình học ≈ 0,580). Đoạn dưới đây (1,3 m / 0,43 / x = ±0,246) là đề xuất cũ, không còn dùng.
   ~~Chưa trả lời, tạm theo đề xuất: hướng thanh trong Hình 1 là của hình vẽ. Em giải số đo để đúng 1,3 m và đúng đoạn Đất 0,43 m. Vì vậy đầu phía Hộp
   Phân Phối nằm ở x = ±0,246, gần hộp hơn hình vẽ một chút. Anh xem có chấp nhận không.~~
