# TiFa cho Ban Tổ chức: hướng dẫn một ngày thi

Dành cho người điều hành giải FANROC thật bằng TiFa: nhập danh sách đội, sinh lịch, trọng tài chấm bằng điện thoại,
điểm lên màn chiếu, cuối ngày xuất Excel. Không cần internet, chỉ cần một Wi-Fi chung.

## 1. Trước ngày thi

1. **Máy BTC**: một laptop Windows hoặc macOS cài bản TiFa mới nhất. Cắm sạc, tắt chế độ ngủ.
2. **Wi-Fi**: mọi máy (máy BTC, điện thoại trọng tài, máy tính / TV chiếu) phải vào **cùng một mạng**. Đừng dùng Wi-Fi
   «khách» của trường hay của hội trường: nhiều nơi bật *cách ly thiết bị* (client isolation) nên điện thoại không thấy được
   máy BTC. Cách chắc ăn là mang theo một bộ phát Wi-Fi riêng (hoặc phát Wi-Fi từ chính laptop BTC) và để mọi máy nối vào đó.
3. **Cho phép mạng**: lần đầu mở màn Ban tổ chức, hệ điều hành hỏi cho phép TiFa nhận kết nối:
   - Windows: hộp «Windows Defender Firewall» ⇒ bấm **Cho phép truy cập** (tích cả mạng riêng tư).
   - macOS: hộp «Bạn có muốn ứng dụng nhận kết nối mạng đến?» ⇒ bấm **Cho phép**.
   Lỡ bấm từ chối thì vào cài đặt tường lửa của hệ điều hành, bật lại cho TiFa.
4. Thử trước một lần với một điện thoại: quét mã QR (mục 5) xem có vào được trang trọng tài.

## 2. Mở màn Ban tổ chức và nhập đội

1. Mở TiFa ⇒ **Giải đấu** ⇒ nút **Tổ chức giải thật (Ban tổ chức)**.
2. Mục **Giải**: đặt **Tên giải**. Mở lại app sau đó thì màn hỏi **Tiếp tục** giải cũ hay **Giải mới** (giải mới luôn tự
   sao lưu giải cũ ra file JSON trước).
3. Mục **Đội**: bấm **Tải file mẫu (.xlsx)**, điền mỗi dòng một đội (Mã đội, Tên đội, Trường, Tỉnh/Thành, Người hướng dẫn;
   không ghi số điện thoại hay thông tin cá nhân học sinh). Bấm **Nhập Excel / CSV…** chọn file: app báo lỗi theo dòng
   (thiếu tên, trùng mã) và cho xem trước; bấm **Nhận**, hoặc **Bỏ dòng lỗi và nhận**. Thêm / sửa / bớt đội ngay trên màn
   cũng được.

## 3. Tạo vòng và sinh lịch

Mục **Vòng** ⇒ **＋ Vòng mới**:

- chọn **Sơ loại** (hoặc **Chung kết**, xem mục 8), tích các đội tham gia (cần ít nhất 8 đội);
- **Trận mỗi đội** (3–10, mặc định 5), **Số sân** chạy cùng lúc (1–4), **Phút mỗi lượt** (mặc định 7, gồm dọn sân và kiểm
  kê), **Giờ bắt đầu**;
- bấm **Sinh lịch**. App hiện bảng trận (lượt, giờ, sân, hai đội Đỏ, hai đội Xanh) và chỉ số chất lượng. Chưa ưng thì
  **Sinh lại lịch (chưa đấu)**. Số đội ít thì app tự giảm số sân và báo «dùng N sân».

**In lịch**: mục **Xuất Excel** ⇒ bấm **Xuất Excel**, mở sheet «Lịch thi» và in từ Excel (xuất lúc nào cũng được, nên in
trước giờ thi).

## 4. Phát QR cho trọng tài, mở màn chiếu

Mục **Kết nối** hiện địa chỉ máy BTC và các mã QR:

- **Trọng tài**: quét QR bằng điện thoại ⇒ chọn **sân**, chọn **Đỏ** hoặc **Xanh**, nhập **mã sân 4 số** (hiện ở mục
  **Điều hành**, thẻ từng sân). Mỗi sân có đúng một trọng tài Đỏ (đếm nửa trái, Núi A, C) và một trọng tài Xanh (nửa phải,
  Núi B, D).
- **Màn chiếu**: mở địa chỉ `…/chieu?san=1` (sân 1), `…?san=2`… trên TV hoặc máy chiếu bất kỳ cùng mạng; máy BTC cũng mở
  được. Mỗi sân một màn chiếu, mở nhiều cái cùng lúc được. Khi sân rảnh, màn chiếu hiện trận kế tiếp và bảng xếp hạng.

Thẻ sân ở mục **Điều hành** báo «Trọng tài Đỏ: đã nối · Trọng tài Xanh: đã nối»; đủ hai bên rồi hãy bắt đầu.

## 5. Chạy một trận

1. Mục **Điều hành**, thẻ sân: **Bắt đầu trận** (10 giây xả bóng + 180 giây thi, có âm báo).
2. Hai trọng tài bấm cộng điểm theo bóng thật trên sân, bấm lỗi / thẻ khi cần. **Điểm tạm** hiện trên thẻ sân và màn
   chiếu trong vòng vài giây.
3. **Hết giờ**: còi vang, trận sang bước **kiểm kê**. Mỗi trọng tài đếm lại bóng thật trên sân, sửa số, chọn mức leo của
   robot, bấm **Gửi kiểm kê**. Gửi rồi vẫn sửa và gửi lại được cho tới khi BTC chốt.
4. Khi cả hai bên đã gửi, trọng tài chính xem chi tiết hai nửa sân và phạt trên máy BTC, bấm **Chốt kết quả**. Kết quả vào
   bảng xếp hạng và màn chiếu hiện điểm chính thức.
5. Trận sai (robot hỏng, bóng đổ…): **Hủy trận** (bấm hai lần để chắc) thì đấu lại.

Điện thoại mất Wi-Fi giữa trận: trang trọng tài giữ số đã bấm và tự gửi lại khi có mạng, không bị cộng đôi. Chữ trên đầu
trang báo «chưa gửi được» khi còn dữ liệu chờ.

## 6. Sửa kết quả

Mục **Kết quả**: cạnh trận đã chốt bấm **Sửa kết quả**, sửa số bóng, mức leo hoặc phạt rồi **Lưu kết quả**. Mỗi lần sửa
được ghi vào **nhật ký** (lúc nào, số cũ, số mới) và có trong sheet «Nhật ký sửa» khi xuất Excel. Bảng xếp hạng cập nhật ngay.

## 7. Đội đến muộn, rút lui, thay trọng tài

- **Đội rút lui**: mục **Đội**, dòng của đội ⇒ **Rút lui** (bấm hai lần). Các trận chưa đấu của đội thành ghế trống (trận
  vẫn diễn ra với 3 đội); đội đứng cuối bảng với nhãn «Rút lui».
- **Đội đến muộn / đổi số trận**: mục **Vòng** ⇒ **Thêm đội muộn / đổi số trận** ⇒ tích đội ⇒ **Áp dụng và sinh lại phần
  chưa đấu**. Chỉ phần lịch chưa đấu đổi, trận đã chốt giữ nguyên.
- **Đổi mã sân**: nút **Đổi mã** trên thẻ sân (khi nghi học sinh biết mã và vào chấm bừa). Điện thoại đang chấm cần nhập
  lại mã mới.
- **Thay trọng tài**: người mới nhập đúng mã và chọn cùng sân, cùng bên; thẻ sân hiện yêu cầu, BTC bấm **Cho thay** (người
  cũ bị ngắt). Mất điện thoại thì bấm **Giải phóng ghế Đỏ / Xanh** (hai lần), trọng tài mới vào được ngay.

## 8. Chung kết và vòng tiếp theo

Mục **Vòng** ⇒ **＋ Vòng mới** ⇒ chọn **Chung kết**, tích các đội đi tiếp (xem bảng xếp hạng vòng Sơ loại, hoặc nhập danh sách
bằng Excel). Mỗi vòng có lịch, kết quả và bảng xếp hạng riêng, **bắt đầu lại từ 0** (không cộng điểm vòng trước). Chọn đội
đi tiếp là quyết định của Ban tổ chức, TiFa không tự loại.

## 9. Xuất Excel

Mục **Xuất Excel** ⇒ **Xuất Excel**. File có các sheet Đội, Lịch thi, Kết quả (từng trận: chi tiết sân, hệ số, điểm trận, lỗi
nhẹ, thẻ vàng, thẻ đỏ, cảnh cáo, điểm bị trừ, điểm từng đội), Xếp hạng, Nhật ký sửa. Xuất lúc nào cũng được, cuối ngày
nên xuất một lần cho chắc.

## 10. Sao lưu: đừng để mất giải

- App ghi file giải mỗi khi có thay đổi và **giữ 20 bản sao lưu tự động mới nhất**; tắt máy hay app sập, mở lại sẽ hỏi
  **Tiếp tục** giải.
- Vẫn nên bấm **Sao lưu file giải (JSON)** (mục **Giải**) đều đặn, ví dụ sau mỗi vòng và cuối buổi, rồi chép file sang
  USB hoặc gửi mình qua email.
- **Mở file giải…** nạp lại một file sao lưu (giải đang mở được sao lưu trước). **Sau khi mở file giải, trọng tài phải nhập
  lại mã sân** trên điện thoại.
- Nếu app báo **file giải bị hỏng**, nó không tự ghi đè: bấm **Sao lưu file lỗi rồi tạo giải mới** để chép nguyên bản vào
  thư mục *Downloads* (tên `giai-loi-<ngày giờ>.json`), rồi mở file sao lưu gần nhất bằng **Mở file giải…**.
- Báo «lỗi đọc» (ổ đĩa bận): bấm **Thử lại**, không cần tạo giải mới.

## Bảng kiểm nhanh sáng thi

- [ ] Máy BTC cắm sạc, Wi-Fi riêng, mọi máy cùng mạng
- [ ] Đã bấm Cho phép trên hộp hỏi của hệ điều hành
- [ ] Đội nhập đủ, lịch đã sinh, đã in lịch
- [ ] Mỗi sân có hai điện thoại đã nối (thẻ sân báo «đã nối»), màn chiếu mở đúng sân
- [ ] Đã sao lưu file giải một lần trước khi bắt đầu
