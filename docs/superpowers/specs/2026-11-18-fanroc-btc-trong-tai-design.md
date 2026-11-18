# TiFa cho Ban Tổ chức: danh sách đội, lịch thi, trọng tài chấm bằng điện thoại — thiết kế

Ngày 18/11/2026. Anh Tuấn mô tả trong chat; bản phác trang trọng tài + màn chiếu (trong-tai-v1) anh "ok". Luật V4
(chưa có V5). Chỗ ghi **(em chọn)** là quyết định của người viết, anh chưa duyệt riêng.

## Vì sao

Giải FANROC thật (vòng khu vực 20–30 đội, có nơi 50–90 đội; chung kết cùng thể thức) hiện chấm điểm bằng giấy và
bảng tính. BTC muốn dùng TiFa làm công cụ của giải: nhập danh sách đội từ Excel, tự sinh lịch, trọng tài bấm điểm trên
điện thoại theo đúng vị trí bóng trên sân thật, điểm lên màn chiếu ngay, cuối giải xuất Excel. Không cần internet.

## Người dùng và một trận điển hình

- **Máy BTC**: một laptop chạy app TiFa (Tauri). Là nơi giữ dữ liệu giải, điều khiển trận, phát trang web cho mọi máy khác
  trong cùng Wi-Fi.
- **Trọng tài Đỏ / Xanh** của mỗi sân: mỗi người một điện thoại, mở trang trọng tài bằng trình duyệt (quét QR trên máy BTC).
  Học FTC: mỗi liên minh một trọng tài sân.
- **Trọng tài chính** (em chọn: thao tác trên máy BTC): xem hai bản kiểm kê, chốt kết quả.
- **Màn chiếu**: trang web chỉ xem, mở trên bất kỳ máy / TV nào có trình duyệt trong mạng (máy BTC cũng mở được). Mỗi sân
  một màn chiếu (em chọn: là trang web để giải nhiều sân không cần nhiều máy TiFa).

Một trận (lời anh): trong lúc thi trọng tài bấm cộng dần để có **điểm tạm**; lỗi / thẻ bấm ngay trong trận; sau còi
trọng tài **kiểm kê lại bóng** trên sân, sửa số rồi **Gửi**. Trọng tài chính chốt ⇒ kết quả vào bảng xếp hạng.

## Mục tiêu

### 1. Danh sách đội từ Excel
- App có nút tải **file mẫu .xlsx**: mỗi dòng một đội — Mã đội, Tên đội, Trường, Tỉnh/Thành, Người hướng dẫn (em chọn
  các cột; không thu số điện thoại / thông tin cá nhân học sinh).
- Nhập file theo mẫu: báo lỗi theo dòng (thiếu tên, trùng mã), xem trước rồi mới nhận. Sửa / thêm / bớt đội trên app được.

### 2. Sinh lịch sơ loại (ghép ngẫu nhiên như FTC — anh chốt)
- BTC nhập **số trận mỗi đội** (mặc định 5) và **số sân chạy cùng lúc** (mặc định 1), **thời lượng một lượt** (mặc định
  7 phút gồm dọn sân, kiểm kê) và giờ bắt đầu. App sinh lịch theo **lượt**: mỗi lượt mỗi sân một trận, kèm giờ dự kiến.
- Mỗi trận 4 đội, 2 Đỏ 2 Xanh, ghép ngẫu nhiên lại từng trận. Ràng buộc (em chọn, thứ tự ưu tiên):
  1. một đội không đấu hai trận cùng lượt; giữa hai trận của một đội có ít nhất 1 lượt nghỉ (nới khi không thể);
  2. mỗi đội đấu đúng số trận đã chọn, trừ vài đội đấu thêm 1 trận khi tổng lượt đấu không chia hết cho 4;
  3. hạn chế gặp lại cùng đồng đội; rồi hạn chế gặp lại cùng đối thủ; số lần Đỏ / Xanh của mỗi đội lệch ≤ 1.
- Tìm lịch bằng thử ngẫu nhiên có seed (cùng seed ⇒ cùng lịch), chấm điểm theo ràng buộc, giữ lịch tốt nhất. App hiện các
  chỉ số chất lượng (số cặp đồng đội lặp, lượt nghỉ ngắn nhất) và nút "Sinh lại".
- Cỡ phải chạy được: 8 – 120 đội, 3 – 10 trận mỗi đội, 1 – 4 sân; sinh xong dưới vài giây trên laptop thường.
- Trận đấu thêm (đội đấu nhiều hơn): xử lý theo **luật V4 mục E** đã có trong `standings()` — số trận chuẩn = ít nhất, bỏ
  các trận thấp nhất (em chọn: dùng đúng luật thay cho cách "trận bù" của FTC).
- Đội rút lui giữa giải: các trận chưa đấu của đội đó thành **ghế trống** (trận vẫn diễn ra với 3 đội). Thêm đội muộn
  hoặc đổi số trận: chỉ sinh lại phần lịch **chưa đấu**, trận đã chốt giữ nguyên.
- **Chung kết**: cùng thể thức; BTC tạo một vòng mới từ danh sách đội đi tiếp (chọn tay từ bảng xếp hạng hoặc nhập
  Excel). Luật chọn đội đi tiếp để sau (anh: "chi tiết để sau, dùng ranking đã").

### 3. Trang trọng tài trên điện thoại (bản phác trong-tai-v1)
- Vào trang: chọn sân, chọn Đỏ / Xanh, nhập **mã sân 4 số** hiện trên máy BTC (em chọn: để học sinh trong mạng không chấm
  bừa). Một sân chỉ một trọng tài Đỏ và một Xanh; người mới vào thay người cũ khi BTC cho phép.
- Chia sân (em chọn, theo luật V4 điểm sân là của chung cả 4 đội): trọng tài **Đỏ đếm nửa trái** (x < 0: Núi A, Núi C,
  Khu Chữa Cháy trái, Thang Đỏ) và robot Đỏ; **Xanh đếm nửa phải** (Núi B, Núi D, Khu Chữa Cháy phải, Thang Xanh) và
  robot Xanh. Ghép hai nửa thành một `FieldTally` rồi tính bằng chính `scoreTally()` / `teamScore()` của game — không
  viết lại công thức.
- Ba thẻ:
  - **Trong trận**: bản đồ nửa sân (vẽ từ `layout.ts`, như bản phác) — chạm một rãnh / khu để chọn, nút − / + to cho
    bóng xanh, bóng cam sai chỗ; cờ trên núi; điểm tạm nửa mình ở cuối.
  - **Kiểm kê** (sau còi): cùng bản đồ với số đang có, sửa từng ô, thêm mức leo từng robot (Không / Chạm / Đất / Nước), nút
    **Gửi kiểm kê**. Gửi rồi vẫn sửa và gửi lại được cho tới khi trọng tài chính chốt.
  - **Lỗi / thẻ**: chọn đội (một trong hai đội liên minh mình) ⇒ Lỗi nhẹ −5 / Thẻ vàng / Thẻ đỏ / Cảnh cáo, kèm mã lỗi
    từ `FAULTS`; bấm nhầm thì xoá được. Bấm được cả trong trận.
- Mỗi lần bấm gửi ngay lên máy BTC. Mất Wi-Fi: trang giữ số trên máy (localStorage) và gửi lại khi nối lại; hiện rõ "chưa
  gửi được". Đồng hồ trận lấy từ máy BTC.

### 4. Máy BTC điều khiển trận
- Màn "Điều hành giải": danh sách lượt / sân, trận kế tiếp của từng sân, trạng thái hai trọng tài (đã nối, đang chấm,
  đã gửi kiểm kê).
- Mỗi sân: **Bắt đầu trận** (đồng hồ 10 s xả bóng + 180 s, có âm báo), **Dừng / hủy** (đấu lại), sau còi ⇒ chờ hai bản
  kiểm kê ⇒ trọng tài chính xem chi tiết hai nửa + phạt ⇒ **Chốt**. Chốt rồi vẫn **Sửa kết quả** được (ghi lại ai sửa,
  lúc nào, số cũ / mới).
- Bảng xếp hạng dùng `standings()` có sẵn (luật mục E: tổng điểm các trận được tính → tổng hệ số → trận cao nhất → ít phạt
  → bốc thăm). Giữa giải hiện bảng tạm.

### 5. Màn chiếu (bản phác trong-tai-v1, phần B)
- Trong trận: tên 4 đội theo liên minh, điểm tạm lớn (điểm nhiệm vụ × hệ số), đồng hồ, bảng chi tiết (Khu Chữa Cháy,
  Rãnh 1/2/3, bóng sai chỗ, leo, phạt từng đội), trạng thái trọng tài.
- Sau chốt: điểm chính thức từng đội. Giữa trận: trận kế tiếp của sân + bảng xếp hạng cuộn.
- Mở bằng địa chỉ `…/chieu?san=2`; nhiều màn chiếu cùng lúc được.

### 6. Xuất Excel
- Một file .xlsx: sheet **Đội**, **Lịch thi** (lượt, giờ, sân, Đỏ 1-2, Xanh 1-2), **Kết quả** (từng trận: chi tiết sân,
  hệ số, điểm trận, phạt và điểm từng đội), **Xếp hạng**. Xuất lúc nào cũng được; lịch in được trước giờ thi.

### 7. Dữ liệu an toàn
- Dữ liệu giải ghi ra file trong thư mục dữ liệu app (phần Rust) mỗi lần thay đổi; tắt máy / app sập mở lại vẫn còn. Nút
  sao lưu / mở lại file giải (JSON). (em chọn: không chỉ localStorage — một ngày thi không được mất.)

## Không làm (bản này)

Internet / cloud, nhiều máy BTC; dựng lại trận bằng sân 3D theo số trọng tài nhập (em chọn để sau); luật chọn đội đi
tiếp, vòng loại trực tiếp; in giấy chứng nhận, trao giải; tài khoản đăng nhập; lưu số điện thoại / ảnh học sinh; ghép
với trận mô phỏng (đây là công cụ cho trận robot thật).

## Cách làm (em chọn)

- **Mạng**: phần Rust của app mở một máy chủ HTTP + WebSocket trên `0.0.0.0:47292` (cạnh hub LAN 47290 / 47291), phát trang
  trọng tài và màn chiếu (tệp tĩnh build sẵn, gói trong app) và chuyển thư. Màn điều hành trong app nối qua 127.0.0.1 như
  thi LAN. Máy BTC hiện địa chỉ + QR. Lần đầu hệ điều hành hỏi cho phép mạng ⇒ hướng dẫn bấm Cho phép.
- **Nguồn sự thật** ở máy BTC (trang Tauri giữ trạng thái giải, Rust lưu file). Điện thoại và màn chiếu chỉ gửi thao tác /
  nhận trạng thái. Thao tác trọng tài có mã + số thứ tự để gửi lại không bị cộng hai lần.
- **Trang trọng tài / màn chiếu**: thêm entry Vite riêng, TypeScript thuần + CSS như phần UI hiện có, không framework;
  dùng chung `scoring.ts`, `layout.ts`, `rules-data.ts`. Trang phải dùng tốt trên điện thoại rẻ (Android Chrome, Safari
  iOS), nút to, chữ to.
- **Excel**: đọc / ghi .xlsx bằng `jszip` đã có + phần XML tối thiểu tự viết (em chọn: không thêm thư viện bảng tính).
  Nhận thêm .csv.
- **Trình duyệt dev / e2e**: chạy máy chủ bằng bin Rust gắn feature như `fanroc-lan-hub`, để Playwright mở trang BTC +
  hai "điện thoại" + màn chiếu.

## Ràng buộc giữ nguyên

src/sim-worker.ts chỉ thêm; không sửa src/sim-extra.ts, src/blocks.ts, src/main.ts gốc; không thêm khối ThingBlock;
không sửa ../thingblock-editor-sim; cổng dev 5191 (không dùng 5190); không chạm 192.168.1.201; NOTICE / Nguồn giữ và
thêm mục mới; không chép nguyên văn luật FPT vào repo; xoá localStorage chỉ trong tiền tố `fanroc.v1.`; test phải chứng minh
được bằng phá hỏng có chủ đích; không merge / push / phát hành khi chưa hỏi.

## Kiểm thử

- Đơn vị: lịch (mọi đội đúng số trận ±1, không trùng lượt, nghỉ ≥ 1 lượt, lệch Đỏ/Xanh ≤ 1, cùng seed cùng lịch, 90 đội
  × 5 trận × 3 sân xong < 3 s); đội rút lui / thêm đội chỉ đổi phần chưa đấu; hai nửa kiểm kê ⇒ `FieldTally` ⇒ điểm bằng
  tính tay trên ví dụ `CLIMB_EXAMPLE`; gửi lại thao tác không cộng hai lần; đọc lại file .xlsx mình xuất; nhập file mẫu
  có dòng lỗi.
- Rust: máy chủ phát tệp tĩnh, chuyển thư WebSocket, lưu / đọc file giải.
- e2e: BTC nhập 12 đội ⇒ sinh lịch ⇒ hai điện thoại (viewport điện thoại) vào sân 1 bằng mã ⇒ bắt đầu trận ⇒ bấm điểm
  ⇒ màn chiếu thấy điểm tạm ⇒ kiểm kê, gửi ⇒ chốt ⇒ xếp hạng đổi ⇒ xuất Excel đọc lại đúng.
- Thử thật: anh chạy thử với điện thoại thật trên Wi-Fi của giải.

## Chốt thêm sau khi soát (em chọn)

- **Kiểu dữ liệu mới** cho giải thật (đội: mã, tên, trường, tỉnh, người hướng dẫn; trận: 4 ghế, ghế có thể trống; lượt,
  sân). `TournamentState` của giải mô phỏng (8 đội, có robot) giữ nguyên, bản lưu `version: 1` cũ không đổi. Hàm xếp
  hạng dùng lại logic mục E của `standings()` (tách phần lõi nhận dữ liệu chung nếu cần, giữ nguyên kết quả cho giải mô
  phỏng — có test).
- **Một file giải chứa nhiều vòng** (Sơ loại, Chung kết…). Mỗi vòng có danh sách đội, lịch, kết quả, bảng xếp hạng riêng,
  **bắt đầu từ 0** (không cộng điểm vòng trước). Excel xuất có chọn vòng; sheet Đội chung.
- **Đội rút lui**: không tính vào số trận chuẩn của mục E, đứng cuối bảng với nhãn "Rút lui".
- **Phạt**: `penalty` là **số điểm bị trừ**, như giải mô phỏng (`penaltyPoints`). Thẻ đỏ ⇒ điểm đội trận đó = 0
  (`teamScore`). Cảnh cáo chỉ ghi lại, không trừ điểm, không xét hoà. Sheet Kết quả có: số lỗi nhẹ, thẻ vàng, thẻ đỏ, cảnh
  cáo, điểm bị trừ, điểm đội.
- **Chia nửa sân**: tầng trang trí — trọng tài Đỏ đếm bóng cam trên tầng trang trí của Núi A, C; Xanh của Núi B, D; cộng
  lại thành `decorO`. Khu Chữa Cháy mỗi bên một trọng tài, cộng lại thành `fire`. Robot treo nhầm thanh liên minh kia:
  trọng tài chọn "Không".
- **Lịch không thể**: số sân tự giảm khi số đội < 4 × số sân (báo rõ "dùng N sân"); nghỉ 1 lượt không được thì nới
  và báo; dưới 8 đội hoặc ngoài khoảng cho phép thì từ chối kèm lời giải thích.
- **Thay trọng tài**: mã sân cố định cho cả giải, BTC xem lại và **đổi mã** được. Ghế đang có người: người mới vào thì BTC
  thấy yêu cầu và bấm **Cho thay** (người cũ bị ngắt). Mất điện thoại ⇒ BTC bấm **Giải phóng ghế**.
- **Máy BTC**: Windows và macOS như bản phát hành TiFa hiện tại (cả hai có lời dặn cho phép mạng).

## Để người làm tự quyết

Chỗ đặt lối vào màn BTC trong app; bố cục chi tiết các màn; thuật toán tìm lịch cụ thể; định dạng thư; cách vẽ QR (thư
viện nhỏ có giấy phép MIT thì ghi Nguồn); chia nhỏ phát hành.
