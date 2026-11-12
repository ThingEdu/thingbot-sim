# Hướng dẫn cho học sinh — ThingBot FanRoc Challenge (bộ cài TiFa)

ThingBot FanRoc Challenge là sân FANROC ảo: em lái robot ThingBot thi đấu, học lập trình robot bằng khối ThingBlock qua
từng nhiệm vụ, rồi tải chương trình của mình về dạng tệp `.tb` để chia sẻ và nạp lên ThingBot thật.

Hành trình gợi ý gồm 4 bước:

1. **Chơi thi đấu**: lái robot bằng bàn phím, hiểu luật và cách ghi điểm.
2. **Nhiệm vụ con rùa**: lập trình robot qua 12 nhiệm vụ, từ đi thẳng tới đấu trọn một trận.
3. **Xưởng lập trình**: viết chương trình cho robot của em và mang vào trận.
4. **Chia sẻ tệp .tb**: tải chương trình về, gửi cho bạn và thầy cô, nạp lên ThingBot thật.

## 0. Cài đặt

Tải bộ cài ở trang [Releases](https://github.com/ThingEdu/thingbot-sim/releases) (các bản có tên `TiFa — ThingBot FanRoc Challenge`).

- **macOS**: tải tệp `.dmg`, kéo TiFa vào Applications. Ứng dụng chưa ký với Apple nên lần đầu mở: bấm chuột phải vào
  TiFa › Mở (Open) › Mở.
- **Windows**: tải `-setup.exe` hoặc `.msi`. Nếu SmartScreen chặn, bấm "More info" › "Run anyway".

Mở app sẽ thấy **màn chính** có 4 ô: **Giải đấu**, **Trận lẻ · Đấu tập**, **Nhiệm vụ**, **Xưởng lập trình**. Bên dưới
có hai mục **Luật chơi** và **Robot mẫu**. Dùng chuột hoặc phím mũi tên để chọn ô, Enter để vào. Nút ⚙ ở góc phải mở cài đặt.

## 1. Chơi thi đấu

Game theo luật FANROC 2026–2027 **bản V4 (cập nhật 07/11/2026)**. Bắt đầu từ **Luật chơi** để biết sân có gì (Khu
Chữa Cháy, bốn núi, cờ, Thang Cứu Hỏa) và cách ghi điểm. Mở **Robot mẫu** để xem các mẫu robot và cơ cấu của chúng.

Rồi vào **Trận lẻ · Đấu tập**:

- **Trận lẻ**: một trận 3 phút đúng luật, hai liên minh Đỏ và Xanh, mỗi bên 2 robot. Robot không do em lái thì máy lái.
  Robot máy mỗi ghế một mẫu: Maker Hút (Chuồn Chuồn), Xe Cắm Cờ (Kiến Lửa), Maker Nâng (Ong Vàng); ghế của em là robot
  em chọn (mặc định Mẫu Maker).
- **Đấu tập**: sân tự do, không giới hạn giờ, robot chạy được ngay, lỗi chỉ nhắc chứ không bị phạt — để tập lái.

Bàn phím là tay cầm PS2 ảo. Bảng đầy đủ nằm ở ⚙ › Phím điều khiển, chỉ rõ từng nút làm gì với robot đang chọn.

| Phím | Việc |
|---|---|
| W A S D hoặc mũi tên | tiến, lùi, quay trái, quay phải |
| Q / E | đi ngang (chỉ đế 4 bánh omni / mecanum) |
| I J K L (hoặc 1 2 3 4) | nút △ □ ✕ ○ — hút, xả, nâng, cắm cờ… tuỳ robot |
| U O Y P | nút L1 R1 L2 R2 |
| giữ J (□), nhả ra | móc leo xà: giữ là giơ móc, nhả là kéo robot lên xà. Xe Cắm Cờ dùng O (R1) vì □ là kẹp cờ |

Có tay cầm thật (gamepad) thì cắm vào máy là dùng được. Hai bạn chơi chung một máy: bật ⚙ › Hai bạn chơi, bàn phím
chia đôi, mỗi bạn một nửa.

Trong trận:

- Bảng điểm ở trên. Mỗi lần được cộng, bị trừ điểm hay bị trọng tài phạt, góc phải dưới hiện **một dòng báo kèm lý do**,
  các dòng trôi lần lượt để em kịp đọc.
- Thẻ robot bên trái nhắc khi robot sắp phạm luật (vươn ra ngoài rào, leo núi…).

**Leo Thang Cứu Hỏa.** Mỗi liên minh có một thanh xà trên ô vàng ở góc sân, hai cột đứng ngoài rào. Vạch màu chia thanh
làm hai đoạn: **Khu vực Đất** (gần rào, khoảng 45 cm tính từ cột) và **Khu vực Nước** (gần Khu Chữa Cháy). Thanh không
đi qua giữa ô vàng mà lệch về phía rào chừng 9 cm: lái robot vào ô vàng, đứng ngay dưới thanh, quay theo thanh, giữ nút
móc cho móc chạm thanh rồi nhả ra: robot được kéo lên và treo. Lúc xuất phát móc gập, cài chốt trong thân (không thò ra ngoài
khung); giữ nút là nhả chốt, lò xo bật móc lên cao hơn thanh; nhả nút là tời cuốn móc xuống, kéo robot lên (lò xo chỉ
bật móc, không bắn robot lên thanh — luật cấm). Đang treo thì đẩy cần tiến / lùi để trượt dọc thanh; tới gần
rào hay Hộp Phân Phối thì robot dừng lại (thân treo không trượt ra ngoài sân). Phải bám ở đoạn Đất trước rồi mới trượt
sang Nước; giơ móc lần nữa là robot rơi xuống. Đoạn Đất ngắn, chỉ vừa một robot treo: robot thứ hai chờ bạn kia trượt
sang Nước rồi mới bám. Mỗi thanh treo được 2 robot; leo thanh của liên minh kia không được tính.

Leo không cộng điểm thẳng mà tăng **Hệ số nhân** của cả trận (hai liên minh chung điểm). Hệ số bắt đầu từ 1, lúc
hết giờ mỗi robot cộng thêm: chạm thanh +0,05, treo ở Đất +0,10, treo ở Nước +0,20 — cả 4 robot treo ở Nước là × 1,80.
Điểm nhiệm vụ là điểm bóng và cờ (trừ bóng sai). Điểm trận = **điểm nhiệm vụ × hệ số, làm tròn lên**, tức
⌈điểm nhiệm vụ × hệ số⌉. Ví dụ 205 điểm nhiệm vụ, hệ số 1,55: 205 × 1,55 = 317,75, làm tròn lên thành 318. Bảng điểm
ghi dạng "205 × 1,55" dưới điểm trận. Không còn đỗ xe hay pha cuối trận riêng: hết giờ robot đang treo ở đâu thì tính ở đó.

Lái quen rồi thì thử **Giải đấu**: 8 đội, đúng luật FANROC, 1–2 bạn chơi. Giữa các trận em ở **Pit**, xem bảng xếp
hạng, xem nhanh trận của máy, hoặc vào Xưởng sửa chương trình. Hai đội bằng điểm thì đội có **Tổng Hệ số nhân** (cột
"Hệ số") cao hơn xếp trên. Giải tự lưu, tắt app mở lại vẫn đấu tiếp được. Giải lưu từ bản cũ (trước luật V4) không đấu
tiếp được — game báo và cho tạo giải mới.

## 2. Nhiệm vụ con rùa: lập trình robot từng bước

Vào ô **Nhiệm vụ**. Robot để lại vệt trên sân như bút của con rùa, nên em thấy ngay robot đã đi đường nào. Có 12 nhiệm
vụ chia 4 chặng. Làm theo thứ tự hay nhảy cóc đều được.

| Chặng | Nhiệm vụ |
|---|---|
| 1 · Hai bánh xe | 1 Làm quen robot · 2 Đi thẳng · 3 Cong và xoay · 4 Đo robot |
| 2 · Con rùa robot | 5 Khối "tiến (giây)" · 6 Khối "rẽ phải/trái (giây)" · 7 Hình vuông · 8 Gỡ lỗi |
| 3 · Việc trên sân | 9 Dọn Khu Chữa Cháy · 10 Cắm cờ (Xe Cắm Cờ) · 11 Leo Thang Cứu Hỏa |
| 4 · Thi đấu | 12 Trận đầu tiên |

Mỗi nhiệm vụ diễn ra như sau:

1. **Đọc mục tiêu.** Vào nhiệm vụ là bảng hướng dẫn tự mở ở trang **Mục tiêu**. Bấm **Tiếp** để xem từng bước gợi ý,
   **Đóng** để cất đi; nút **HƯỚNG DẪN** trên đầu mở lại.
2. **Xem thẻ THỬ THÁCH** ở góc trên phải: các điều kiện để được ⭐, ⭐⭐, ⭐⭐⭐. Bấm vào tiêu đề để thu gọn thẻ.
3. **Ghép khối** ở khung **Khối** bên trái. Chương trình nằm dưới «khi Arduino khởi động» (chạy một lần) hoặc
   «vòng lặp Arduino» (chạy lặp mãi).
4. **Bấm ▶ Chạy.** Robot về chỗ xuất phát rồi chạy chương trình. Các điều kiện trên thẻ THỬ THÁCH tự tích ✓ khi đạt.
5. **Chấm.** Robot dừng hẳn thì game tự chấm, hoặc em bấm **Chấm**. Màn kết quả cho biết số sao và gợi ý sửa (ví dụ
   "Còn hụt 4 cm — thử tăng thời gian đợi?"). Chương trình **dừng vì lỗi** (như chia cho 0) thì tính là chưa đạt.
6. Bấm **Xem lại vệt** để xem đường robot đã đi, **Làm lại** để thử tiếp, hoặc **Nhiệm vụ tiếp**.

Tiến độ, số sao tốt nhất và chương trình của từng nhiệm vụ đều tự lưu.

**Tạo khối của em** (nhiệm vụ 5 và 6):

1. Bấm mục **Khối của em** (chấm hồng), rồi bấm nút **Tạo một khối**.
2. Đặt tên khối, bấm **+ Thêm ô số** nếu khối cần một số (ví dụ "giây"), rồi bấm **Tạo khối**.
3. Vùng khối hiện khối hồng «định nghĩa …». Kéo các khối vào ngay dưới khối hồng đó. Cần dùng số trong ô thì kéo ô
   tròn trên khối hồng xuống.
4. Khối mới có trong mục Khối của em, kéo ra dùng như mọi khối khác.

Robot không đếm được bánh đã quay bao nhiêu vòng, nên khối «tiến» của nhiệm vụ 5 đi thẳng theo **số giây**: thân khối là
M1 = M2 = 60, «đợi (giây)», rồi dừng. Muốn đi 1 mét, em tính số giây = 1 ÷ (số mét robot đi được trong 1 giây, đo ở
nhiệm vụ 4). Hụt thì tăng số giây một chút, quá thì giảm.

## 3. Xưởng lập trình: robot của em

Ô **Xưởng lập trình** là nơi viết chương trình cho robot của em để mang vào trận:

- Chọn mẫu robot và đế ngay trong Xưởng. Bấm **Về mặc định** để xoá bản đã lưu và quay về chương trình mẫu.
- Viết chương trình lái tay cầm hoặc tự chạy, bấm ▶ để thử ngay trên sân.
- Bấm **Lưu**. Mỗi lần lưu là một bản mới ("Đã lưu v1", "v2"…).
- Vào **Trận lẻ** hay **Giải đấu**, robot của em chạy bản đã lưu. Nhãn chương trình ghi "Của em v…".
- Chương trình họ Maker lưu từ bản cũ (trước luật V4) được báo "Chương trình lưu theo luật cũ": khi đó S2 là kẹp cờ, nay
  S2 là móc leo xà (180° = giơ móc) nên robot sẽ giơ / hạ móc ngược. Bấm **Về mặc định** để lấy chương trình mẫu mới
  (hoặc tự sửa S2 rồi Lưu lại). Mẫu Maker không còn nút L1 / L2 "nâng tay".

## 4. Chia sẻ tệp .tb

Tệp `.tb` là tệp chương trình của ThingBlock, mở được bằng ThingBlock để nạp lên ThingBot thật.

- Trong **Xưởng**, bấm **Tải .tb**. Ở các màn có khung Khối, bấm nút tải trên thanh chạy.
- Bản app (TiFa) lưu tệp vào thư mục **Downloads** và báo đường dẫn. Bản chạy trên trình duyệt thì tải xuống như mọi tệp.
- Tên tệp có dạng `fanroc-<mẫu robot>-<ngày>-<giờ>.tb`. Tải nhiều lần không bị ghi đè tệp cũ.

Sau khi tải, em có thể:

- **Gửi cho bạn hoặc thầy cô** qua tin nhắn, email, Drive… để cùng xem và góp ý.
- **Nạp lên ThingBot thật**: mở tệp bằng ThingBlock trên máy tính, cắm ThingBot và nạp như mọi chương trình ThingBlock.

Lưu ý:

- Chương trình có **khối của em có ô số** (như «tiến (giây)») vẫn tải được, nhưng **chưa nạp được lên ThingBot thật**.
  Game sẽ báo khi em tải. Muốn nạp robot thật thì dùng khối của em không có ô số, hoặc ghép thẳng các khối.
- Game hiện **chỉ tải ra** tệp .tb, chưa mở lại được tệp .tb. Chương trình trong game vẫn tự lưu trên máy em.

## Nguồn và giấy phép

Mã nguồn của game theo giấy phép AGPL-3.0, ở kho này (nhánh `feat/fanroc`). Các phần dùng lại (ThingBlock, three.js,
Rapier, JSZip, UrSimulator, CAD sân và robot của ThingEdu…) được ghi ở [`NGUON.md`](../../NGUON.md) và trong game ở
⚙ › Nguồn.
