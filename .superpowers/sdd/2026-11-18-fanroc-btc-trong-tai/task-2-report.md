# Task 2 report: sinh lịch kiểu FTC

Status: DONE. Files: src/fanroc/btc/schedule.ts, src/fanroc/btc/schedule.test.ts.

## Algorithm (makeSchedule)
- Validate (8-120 đội, perTeam 3-10 nguyên, fields 1-4 nguyên) else Error. fieldsUsed = min(fields, floor(n/4)); note "Dùng N sân (ít đội)" khi giảm.
- Mỗi attempt (seed con = seed ^ imul(i+1, 0x9e3779b1), mulberry32): remaining[t] = max(0, perTeam - đã đấu trong fixed); số trận mới = ceil(Σremaining/4); đội đấu thêm chọn ngẫu nhiên (seeded) trong teamIds, extra = 4*M - Σremaining.
- Từng lượt: k = min(fieldsUsed, trận còn lại); pool = đội còn trận và KHÔNG đấu lượt trước (nếu thiếu mới kéo đội vừa đấu, bị phạt nghỉ); ưu tiên remaining giảm dần, hoà thì ngẫu nhiên; R=200 lần: lấy ngẫu nhiên từ bậc hoà + shuffle + chia trận, chấm 1000*đồngĐộiLặp + 100*đốiThủLặp + 10*lệchMàu^2 (phạt thêm khi số trận còn lại không đủ kéo lệch về <=1); giữ cách tốt nhất.
- Sau cả lịch: lật đỏ/xanh cả trận (leo đồi), rồi repairSides: đổi ghế đỏ-xanh trong cùng lượt (cùng trận hoặc sân khác) nếu bớt lệch mà không thêm lặp đáng kể; còn đội lệch>=2 thì bước đi ngẫu nhiên (seeded) chuyển phần lệch sang đội khác cùng lượt.
- Thử 5 seed con (tới 30 nếu chưa đạt: nghỉ>=1 và lệch<=1), giữ lịch có phạt thấp nhất (1000*lặpBạn + 100*lặpĐốiThủ + 10*lệch + 1e5 mỗi vi phạm cứng).
- fixed: giữ nguyên đầu mảng; trận mới từ slot (max fixed slot)+1; id tiếp sau n lớn nhất; đội đã rút bỏ qua; quality tính trên fixed+mới. Không phát ghế null.
- slotTime: cộng phút, mod 24h, "HH:MM".
- Không dùng Math.random/Date.

## Quality (seed 11 trong test; slots; minRest / repeatPartners / repeatOpponents / maxSideDiff / extra)
- (8,5,1): 10 slot; 1 / 8 / 28 / 1 / 0 (8 đội 1 sân: nghỉ>=1 buộc hai nửa luân phiên nên lặp bạn không tránh được)
- (12,5,2): 8 slot; 0 / 0 / 6 / 1 / 0 (n<8*fu nên minRest 0 được phép, không có note vì test đo minRest<1 => note)
- (30,5,1): 38 slot; 1 / 0 / 1 / 1 / 2
- (31,5,2): 20 slot; 1 / 0 / 0 / 1 / 1
- (90,5,3): 38 slot; 1 / 0 / 0 / 1 / 2
- (120,10,4): 75 slot; 1 / 3 / 35 / 0 / 0
Stress 20 seed x 10 cấu hình (thêm (9,3,4),(17,7,2),(64,6,4),(100,9,3)): 0 lịch vi phạm nghỉ>=1 (khi n>=8*fu) hoặc lệch<=1. Lặp bạn tệ nhất: (8,5,1)=8, (120,10,4)=5, (64,6,4)=2, còn lại 0.

## Timings
(90,5,3): ~77 ms. (120,10,4): ~240 ms (trước khi có repairSides ~1.3 s). Trung bình/seed: (100,9,3) 160 ms, (64,6,4) 62 ms.

## TDD
- RED: `node --test src/fanroc/btc/schedule.test.ts` trước khi có schedule.ts => ERR_MODULE_NOT_FOUND.
- GREEN: 14/14 pass; tsc --noEmit sạch; npm run test:unit: 600 tests, 599 pass, 0 fail (1 skip có sẵn).
- Phá 1: sed đổi `red: [pick[4 * i], ...]` thành `red: [pick[i ? 0 : 4 * i], ...]` (đội lặp trong cùng lượt) => FAIL schedule.test.ts:22 ("một trận 4 đội khác nhau") và :29, test fixed/ít đội cũng fail. Khôi phục.
- Phá 2: bỏ `&& last.get(t) !== slot - 1` ở pool => FAIL schedule.test.ts:41 (minRest>=1) cho (8,5,1),(30,5,1),(31,5,2),(90,5,3),(120,10,4) + fixed. Khôi phục (diff với bản tốt: giống hệt).
- Test dòng 34 ("không đội nào hai trận cùng slot") do cấu trúc thuật toán đảm bảo (pool distinct) nên phá 1 bị bắt sớm hơn ở dòng 22/29; kiểm tra 34 vẫn nằm trong test.

## Concerns
- Test (8,5,1) chấp nhận 8 lặp bạn (không tránh được); không assert về lặp bạn/đối thủ ngoài đo.
- Note "Có đội không được nghỉ giữa hai trận" xuất hiện cho (12,5,2) khi minRest=0 (đúng theo brief).
- repairSides có thể chấp nhận vài lặp đối thủ để cân màu (ưu tiên cân màu).
- Khi nhiều trận fixed làm một đội có remaining>0 không thể xếp (thiếu đội), có thể ném 'không xếp được lịch' (chưa gặp trong test).

## Fix round 1
Changes in schedule.ts: (1) random-walk repair only considers teams in teamIds that have a seat of the offending colour in NEW matches (no more `out[undefined]` TypeError); repairSides now takes teamIds. (2) makeSchedule adds note "Có đội lệch số lần Đỏ / Xanh do các trận đã đấu" when final maxSideDiff > 1 (no throw). (3) maxN only counts fixed ids starting with `${roundId}-`.
Tests added/changed in schedule.test.ts: removed dead `inFixed` assertions; new (a) imbalanced fixed (t1 red x3, 12 teams, 1 field): no throw, note present, ids/slots continue, no team twice per slot, counts 4-5; new (b) withdrawn team in fixed + fixed id `r0-9` from another round (numbering unaffected) + boundary checks (minRest>=1, maxSideDiff<=1, no slot collision).
RED proof: with the old schedule.ts (git checkout) `node --test src/fanroc/btc/schedule.test.ts` => test (a) "TypeError: Cannot read properties of undefined (reading 'slot')"; test (b) also failed (old code). After the fix: 16/16 pass.
Commands: node --test src/fanroc/btc/schedule.test.ts => pass 16 fail 0; npx tsc --noEmit => clean; npm run test:unit => tests 602, pass 601, fail 0.
Note: test (b) uses 1 field because n=15 < 8*fieldsUsed(2) would not require minRest>=1.
