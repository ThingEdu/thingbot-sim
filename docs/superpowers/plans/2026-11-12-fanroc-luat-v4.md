# Cập nhật theo luật FANROC V4 — kế hoạch thi công

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa game ThingBot FanRoc Challenge lên đúng luật V4: bỏ Vùng Bảo Vệ và End Game, thêm Leo Thang Cứu Hỏa với Hệ
số nhân, sửa cách tính tầng trang trí, sửa xếp hạng giải.

**Architecture:** Hình học thanh xà nằm trong `layout.ts`. Máy trạng thái leo là hàm thuần trong file mới `ladder.ts`.
`RobotBody` đọc servo móc rồi gọi máy trạng thái đó; khi treo thì đổi thân sang động học. Điểm vẫn tính bằng hàm thuần
trong `scoring.ts`, có thêm `multPct` (số nguyên). Mọi phần giao diện, robot máy, nhiệm vụ và giải chỉ đọc
`climbState` và `ScoreBreakdown` mới.

**Tech Stack:** TypeScript, three.js, Rapier (`@dimforge/rapier3d-compat`), node:test (`npm run test:unit`), e2e
`scripts/fanroc-e2e.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-12-fanroc-luat-v4-design.md`

## Global Constraints

- Không chép văn bản luật FPT vào kho/game; lời trong game viết lại.
- Không thêm khối ThingBlock mới; móc dùng khối servo có sẵn (`thingBotC3_setServo` qua helper `servo(n, deg)`).
- Không sửa `src/sim-extra.ts`, `src/blocks.ts`, `src/main.ts` gốc; `src/sim-worker.ts` chỉ được thêm.
- Không đổi tiền tố lưu trữ `fanroc.v1.`; chỉ xoá localStorage trong tiền tố đó.
- Cổng dev 5191 (`npx vite --port 5191 --strictPort`), không dùng 5190. Không kết nối 192.168.1.201.
- Không push / tag / phát hành / deploy khi chưa hỏi anh Tuấn.
- Mỗi test mới phải được chứng minh fail bằng phá hỏng có chủ đích trước khi coi là xong.
- Số đo (mét): thanh dài 1,300, cao 0,650, đoạn Đất 0,430, đầu rào (∓1,200; −0,317), đầu Hộp Phân Phối (∓0,246; −1,200).
- Mức hệ số (phần trăm): none 0, contact 5, ground 10, water 20; `multPct = 100 + Σ` (100…180).
- `total = mission > 0 ? ceil(mission × multPct / 100) : mission`, chỉ dùng số nguyên.
- Lời hiển thị tiếng Việt, gọi "Thang Cứu Hỏa", "Khu vực Đất", "Khu vực Nước", "Hệ số nhân".

## Review Focus

1. Robot đang treo khi hết giờ / tạm dừng / Làm lại: phải về sàn đúng khi đặt lại tư thế (`setPose`), không kẹt ở thể
   động học — Task 2 có test.
2. Hai robot cùng một thanh và robot thứ ba bám thanh đã đủ 2: không chồng lên nhau, không treo — Task 1 có test.
3. Robot liên minh kia bám nhầm thanh: treo được nhưng mức 0 trong điểm — Task 3 có test.
4. Điểm nhiệm vụ âm hoặc 0 với hệ số > 1: không nhân, không ra −0 — Task 3 có test.
5. Giải đã lưu bằng bản 0.8 (kết quả không có `multPct`): không lỗi, báo luật cũ — Task 8 có test.

---

### Task 1: Hình học thanh xà và máy trạng thái leo

**Files:**
- Modify: `src/fanroc/layout.ts` — thêm `LADDERS`, `LADDER`, đổi `ZONES.safe` → `ZONES.ladder` (giữ đúng số), thêm
  `TIER_DECOR` (xem Task 3 dùng).
- Create: `src/fanroc/ladder.ts`
- Test: `src/fanroc/ladder.test.ts`, `src/fanroc/layout.test.ts`

**Interfaces:**
- Produces (layout.ts):
  - `export const LADDER = { y: 0.65, divider: 0.43, rodR: 0.0125, postR: 0.02 }`
  - `export const LADDERS: Record<Alliance, { a: { x: number; z: number }; b: { x: number; z: number } }>` —
    `a` đầu rào, `b` đầu Hộp Phân Phối; red a (−1.2, −0.317) b (−0.246, −1.2); blue đối xứng x.
  - `ZONES.ladder: Record<Alliance, Rect>` (số cũ của `safe`). Mọi chỗ dùng `ZONES.safe` đổi tên trong task này
    (`match.ts`, `robots.ts`, `view/scene.ts`) để build không vỡ; ý nghĩa đổi ở các task sau.
- Produces (ladder.ts):
  - `export type Climb = 'none' | 'contact' | 'ground' | 'water'`
  - `export const HOOK = { upDeg: 150, downDeg: 30, tol: 0.06, slideV: 0.15, gap: 0.3, end: 0.05, hangY: 0.12 }`
  - `export function ladderLen(al: Alliance): number`
  - `export function project(al: Alliance, x: number, z: number): { s: number; d: number }` — `s` khoảng cách dọc thanh
    tính từ đầu `a`, `d` khoảng cách vuông góc (nhìn từ trên).
  - `export function pointAt(al: Alliance, s: number): { x: number; z: number }`; `export function barYaw(al): number`
    (yaw three.js để mũi xe hướng từ `a` sang `b`).
  - `export interface ClimbState { mode: 'floor' | 'hang'; bar: Alliance | null; s: number }`
  - `export function stepClimb(st: ClimbState, inp: { hookDeg: number | null; lastHookDeg: number; x: number; z: number; drive: number; dt: number; others: { bar: Alliance; s: number }[] }): ClimbState`
    — `drive` −1…1 (trung bình bánh, dương = tiến); `others` = robot khác đang treo.
  - `export function climbOf(st: ClimbState, hookDeg: number, x: number, z: number): { level: Climb; bar: Alliance | null }`
  - `export const CLIMB_PCT: Record<Climb, number> = { none: 0, contact: 5, ground: 10, water: 20 }`

Quy tắc `stepClimb` (đúng spec):
- floor → hang khi móc chuyển từ ≥ `upDeg` xuống ≤ `downDeg` trong bước này, đang có thanh với `d ≤ tol`,
  `0 ≤ s ≤ divider`, và thanh đó có < 2 robot treo. Khi treo `s` giữ nguyên chỗ bám.
- hang: `s += drive × slideV × dt`, kẹp trong `[end, len − end]`; không tới gần robot cùng thanh hơn `gap`.
- hang → floor khi `hookDeg ≥ upDeg`.
- `climbOf`: hang ⇒ `s > divider + 0.01` thì `water`, ngược lại `ground`. Floor có móc ≥ `upDeg` và một thanh có
  `d ≤ tol` và `s ∈ [0, len]` ⇒ `contact`. Còn lại là `none`.

- [ ] **Step 1: Viết test** `layout.test.ts`:
  - `ladderLen('red')` ≈ 1.300 (±0.002);
  - chỗ thanh cắt z = −0.6088 (mép Khu Chữa Cháy) cách `a` 0.430 ±0.005 và có x trong `ZONES.fire[0]`;
  - hai thanh đối xứng qua x = 0;
  - `ZONES.ladder.red` vẫn rộng 0.375 và thanh đi qua phía trên ô (`project` của tâm ô có d < 0.19).

  `ladder.test.ts`:
  - giơ rồi hạ móc ở `s = 0.2` thì treo, `climbOf` = ground;
  - lái tiến 4 s thì `water`;
  - hạ móc ở `s = 0.7` (đoạn Nước) thì vẫn floor;
  - móc giơ, d = 0.05 thì contact; d = 0.08 thì none;
  - giơ móc khi treo thì floor;
  - thanh đã 2 robot treo: robot thứ 3 không treo;
  - hai robot cùng thanh không gần nhau hơn 0.3.
- [ ] **Step 2:** `npm run test:unit` → các test trên FAIL (thiếu export).
- [ ] **Step 3:** Viết `layout.ts`, `ladder.ts` theo Interfaces; đổi tên `ZONES.safe` ở các chỗ dùng.
- [ ] **Step 4:** `npm run test:unit` → PASS toàn bộ; phá `divider` thành 0.6 thì test vị trí vạch fail; phục hồi.
- [ ] **Step 5:** Commit `fanroc: thanh xà Thang Cứu Hỏa + máy trạng thái leo (luật V4)`.

### Task 2: Robot gắn móc, họ Maker bỏ cờ, vật lý treo

**Files:**
- Modify: `src/fanroc/robots.ts`, `src/fanroc/robot.ts`, `src/fanroc/world.ts`, `src/fanroc/programs.ts`,
  `src/fanroc/ui/robotcard.ts` (bảng cổng), `src/fanroc/view/scene.ts` (vẽ móc, thanh, cột)
- Test: `robots.test.ts`, `robot.test.ts`, `programs.test.ts`, `world.test.ts`

**Interfaces:**
- `RobotDef.hook: { port: 'S1' | 'S2' | 'S4'; button: Ps2Button }` (bắt buộc). Giá trị:
  - họ Maker (`maker`, `makerLift`, `makerIntake`, `makerPro`): `{ port: 'S2', button: 'SQUARE' }`;
  - `ui`: `{ port: 'S2', button: 'SQUARE' }`;
  - `co`: `{ port: 'S4', button: 'R1' }`;
  - `sort`: `{ port: 'S1', button: 'SQUARE' }`.
- Họ Maker:
  - `flag: false`;
  - bỏ `rearGrip`, `flagFront`;
  - `servos.S2 = 'Móc leo xà'`.
  - Robot khác: thêm nhãn móc vào `servos` khi cổng là S1/S2. Với `co` thì nhãn S4 đi qua bảng cổng của robotcard.
- `ruleChecks`:
  - đếm servo móc khi cổng móc không có trong `def.servos`;
  - dòng Xe Ủi đổi chữ "ô Vùng Bảo Vệ" → "ô Thang Cứu Hỏa".
- `RobotBody`:
  - `climb: ClimbState`;
  - `get climbLevel(): { level: Climb; bar: Alliance | null }`;
  - trong `apply()`: lấy góc móc, gọi `stepClimb` (`others` do `Match`/`world` cung cấp qua `RobotBody.peers`, mảng
    robot cùng trận, đặt từ `Match`);
  - vào hang: `body.setBodyType(KinematicPositionBased)`, đặt y = `HOOK.hangY`, yaw = `barYaw`;
  - mỗi bước khi treo: `setNextKinematicTranslation` theo `pointAt(bar, s)`;
  - ra floor: trả `Dynamic`;
  - `setPose()` luôn đưa về floor + `Dynamic`.
- `world.ts`: thêm collider cố định cho 2 thanh (capsule bán kính `rodR` ở y 0.65) và 4 cột (cylinder `postR`, cao 0.65).
- `programs.ts`:
  - `servoSetup` đặt góc móc 0;
  - `teleop` thêm `ifElse(btn('PSB_'+hook.button), servo(port, 180), servo(port, 0))`;
  - `teleopButtons[hook.button] = 'Giữ: giơ móc leo xà (nhả: kéo lên xà)'`;
  - bỏ phần cờ của họ Maker.
  - Helper `servo(n)` phải nhận 1/2/4. Nếu khối servo không có chân 4, dùng chân mà `portMap`/worker hiểu cho S4 và ghi
    lại cách chọn.

- [ ] **Step 1: Test**
  - `robots.test`: mọi mẫu × mọi đế có `ruleChecks` Servo ≤ 5 (Maker Pro omni = 5/5); họ Maker `flag === false`.
  - `programs.test`: mẫu TeleOp của mọi robot có nút móc đúng `hook.button` và khớp `teleopButtons` (theo kiểu test
    hiện có).
  - `robot.test` (headless Rapier như các test hiện có): Mẫu Maker đặt ở `pointAt('red', 0.2)`, yaw `barYaw`; giơ S2 180
    rồi 0 thì `climbLevel.level === 'ground'` và `body.translation().y ≈ 0.12`; M1 = M2 = 255 trong 5 s thì `water`;
    `setPose(START)` thì về sàn và thân Dynamic.
  - `world.test`: tia dọc từ trên xuống tại `pointAt('blue', 0.6)` trúng thanh ở y ≈ 0.65.
- [ ] **Step 2:** chạy → FAIL.
- [ ] **Step 3:** viết code theo Interfaces.
- [ ] **Step 4:** PASS; phá `hangY` → test y fail; phục hồi. Chạy e2e cũ để chắc không vỡ thứ khác (một số test về
  park/NV11 sẽ fail — ghi lại, sửa ở Task 3 và Task 7).
- [ ] **Step 5:** Commit `fanroc: móc leo xà (họ Maker bỏ cờ, S2), treo động học trên thanh`.

### Task 3: Tính điểm V4 và trận đấu

**Files:**
- Modify: `src/fanroc/scoring.ts`, `src/fanroc/world.ts` (tally tầng trang trí), `src/fanroc/layout.ts` (bỏ
  `ENDGAME_S`, `TIER_GROOVE` không gộp decor), `src/fanroc/match.ts`, `src/fanroc/human.ts`, `src/fanroc/game.ts`,
  `src/fanroc/quickmatch.ts`
- Test: `scoring.test.ts`, `match.test.ts`, `human.test.ts`, `world.test.ts`

**Interfaces:**
- `FieldTally`:
  - `{ fire: {o,g}; mtn: { g: number; o: number }[][]; decorO: number; flags: boolean[]; climbs: Record<Alliance, Climb[]> }`;
  - `mtn[m]` có đúng 3 rãnh (decor không vào);
  - `decorO` = tổng bóng cam ở tầng trang trí mọi núi;
  - bóng xanh ở decor bỏ qua.
- `ScoreBreakdown = { fire; r1; r2; r3; flag; wrong; mission; multPct; total }`.
- `climbs[al][slot]` là mức đã xét đúng thanh: robot bám thanh của liên minh kia thì `none`.
- Bỏ `Park`, `allianceShare`.
- `Match`:
  - bỏ `endgame`, `ENDGAME_S` và dòng log End Game;
  - `tally()` lấy `climbs` từ `r.climbLevel`;
  - miễn phạt chặn (`inOwnZone`) đổi thành: trong Khu Tiếp Tế của mình hoặc đang treo;
  - đặt `r.peers`.
  - Log khi mức leo của robot đổi và giữ ≥ 0,5 s: `Robot <Đỏ/Xanh> <n> chạm xà (+0,05)` / `treo ở Khu vực Đất (+0,10)`
    / `treo ở Khu vực Nước (+0,20)` / `rời xà`.
- `HpContext` bỏ `endgame`. Human Player bỏ nhánh "Robot đã về Vùng Bảo Vệ".
- `RobotBody.parked` bị xoá.

- [ ] **Step 1: Test** `scoring.test`:
  - ví dụ luật: mission 205 với climbs [water, water, ground, contact] ⇒ multPct 155, total 318;
  - mission 0 ⇒ total 0;
  - mission −6 với multPct 120 ⇒ −6;
  - decor: 2 xanh + 1 cam ở decor ⇒ r1 0, wrong −3;
  - cam ở rãnh 2 ⇒ −3;
  - `teamScore(318, {yellow:1})` = 308.

  `match.test`:
  - không còn log "End Game";
  - robot treo khi hết giờ được tính trong `score().multPct`;
  - robot Xanh treo thanh Đỏ ⇒ multPct 100.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** code.
- [ ] **Step 4:** PASS; phá công thức (bỏ ceil) ⇒ 317,75/318 fail; phục hồi.
- [ ] **Step 5:** Commit `fanroc: tính điểm luật V4 (hệ số nhân, tầng trang trí, bỏ đỗ và End Game)`.

### Task 4: Bảng điểm, kết quả, thẻ Luật chơi, sân 3D

**Files:**
- Modify: `src/fanroc/ui/scoreboard.ts`, `src/fanroc/rules-data.ts`, `src/fanroc/ui/rules.ts`,
  `src/fanroc/view/scene.ts`, `src/fanroc/ui/feed.ts` (nếu cần cho dòng leo)
- Test: `scoreboard.test.ts`, `rules-data.test.ts`

**Interfaces:**
- `AllianceLine = { teams: {...}[] }` (bỏ `park`, `bonus`).
- Bảng điểm:
  - ô giữa hiện `total`, dưới đó dòng nhỏ `"{mission} × {multPct/100 với dấu phẩy}"`, ví dụ "205 × 1,55";
  - hệ số 1,00 thì ẩn dòng.
- Bảng tách điểm:
  - thay hàng Vùng Bảo Vệ bằng 'Điểm nhiệm vụ' và 'Hệ số nhân';
  - thêm phần "Leo xà" mỗi robot: tên robot, mức (Chạm / Đất / Nước / —), +0,05…
- `rules-data.ts`:
  - bỏ `parkBonus` và dòng đỗ;
  - thêm mục "Leo Thang Cứu Hỏa" (3 mức, công thức, ví dụ ⌈205 × 1,55⌉ = 318 lấy từ `scoreTally` thật, không gõ tay);
  - tầng trang trí: "không tính điểm; bóng cam ở bất kỳ đâu trên núi −3";
  - dòng thời gian bỏ End Game;
  - bản đồ SVG vẽ 2 thanh xà, vạch, ô vàng "THANG".
- `scene.ts`:
  - ô vàng (băng vàng, nhãn "THANG");
  - 2 thanh xà xám có khoanh vạch màu liên minh ở `divider`;
  - 4 cột;
  - móc trên robot: thanh mảnh màu vàng, xoay theo góc servo móc.

- [ ] **Step 1: Test**
  - `rules-data.test`: mục leo có 3 mức với đúng số; dòng ví dụ chứa "318"; không còn chữ "Vùng Bảo Vệ" hay
    "End Game" trong toàn bộ dữ liệu thẻ.
  - `scoreboard.test`: score có multPct 155 thì dòng nhỏ là "205 × 1,55"; 100 thì không có dòng.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** code.
- [ ] **Step 4:** PASS + phá thử; xem bằng mắt trên `http://localhost:5191/mo-phong/fanroc.html`: sân, thẻ Luật chơi,
  Trận lẻ có thanh xà; chụp màn hình.
- [ ] **Step 5:** Commit `fanroc: giao diện luật V4 (bảng điểm hệ số nhân, thẻ Leo Thang Cứu Hỏa, sân 3D)`.

### Task 5: Robot máy leo xà

**Files:**
- Modify: `src/fanroc/agent.ts`
- Test: `src/fanroc/agent.test.ts`

**Interfaces:**
- Bỏ `PARK_*`, `forgetPark`, `parkMargin`, `parkEta`, bảng `park`, và việc cắm cờ của họ Maker (họ Maker đã `flag: false`).
- Thêm việc `climb`:
  - bắt đầu khi giờ còn lại ≤ ETA + `climbMargin`. ETA tính như ETA về đỗ cũ: tới điểm `pointAt(al, s0)`, cộng 6 s
    bám, cộng giờ trượt;
  - `Skill` thêm `climbTarget: Climb`, theo mức: easy `'contact'`, medium `'ground'`, hard `'water'`;
  - với thanh có 2 robot, robot slot 0 trượt tới `s = 1.05` (hard) và robot slot 1 tới `s = 0.70`. Medium dừng ở
    `s0 = 0.2` và slot 1 ở `0.2`, chờ slot 0 rời đi ≥ `gap` trước khi bám.
  - Robot chỉ ra lệnh qua PortValues (giơ / hạ móc bằng cổng `hook.port`, lái bánh).

- [ ] **Step 1: Test** (headless, seed 1, 4 robot Mẫu Maker cùng mức):
  - hard ⇒ hết trận cả 4 robot ở `water`, `multPct` 180;
  - medium ⇒ 4 ground, 140;
  - easy ⇒ ≥ 2 robot contact.
  - Không robot nào bị phạt vì leo.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** code.
- [ ] **Step 4:** PASS + phá (`climbTarget` hard → ground) ⇒ test fail. Đo điểm trung bình các mức (giống R141/R142),
  ghi kết quả vào báo cáo task.
- [ ] **Step 5:** Commit `fanroc: robot máy leo Thang Cứu Hỏa cuối trận (thay về đỗ)`.

### Task 6: Chương trình mẫu Auto leo xà

**Files:**
- Modify: `src/fanroc/programs.ts` (`AUTO_TIMES`, `auto()`)
- Test: `programs.test.ts`

**Interfaces:**
- Auto mẫu giữ phần đổ bóng vào núi. Phần cuối đổi từ "về Vùng Bảo Vệ" thành:
  1. đi tới ô Thang của liên minh, ép vào rào như cũ;
  2. quay theo thanh;
  3. giơ móc, tiến chạm thanh, hạ móc;
  4. tiến để trượt sang Nước.
- `AUTO_TIMES` đổi `toSafe` thành `toLadder` và thêm `align`, `hookUp`, `slide`, đo trên sân.
- Test hiện có "robot vào hẳn Vùng Bảo Vệ" đổi thành: chạy Auto mẫu của `maker` (diff2) và `makerPro` (omni) cho
  Robot 1, cuối 30 s `climbLevel` là `ground` hoặc `water`.

- [ ] Step 1 test → Step 2 FAIL → Step 3 code + đo giờ → Step 4 PASS + phá thử → Step 5 commit
  `fanroc: Auto mẫu leo xà`.

### Task 7: Nhiệm vụ 10, 11, 12

**Files:**
- Modify: `src/fanroc/missions/data.ts`, `types.ts`, `grade.ts`, `solutions.ts`
- Test: `grade.test.ts`, `ui/missions.test.ts`, `scripts/fanroc-e2e.mjs`

**Interfaces:**
- `Goal` bỏ `{ type: 'park' }`, thêm `{ type: 'climb'; min: Climb }`. Chữ của mục tiêu: "Chạm Thang Cứu Hỏa" / "Treo ở
  Khu vực Đất" / "Treo ở Khu vực Nước". `RunRecord.tally.climbs.red[0]` là mức của robot em.
- NV10 "Cắm cờ": `robot: defaultConfig('co')`, `starter` là TeleOp mẫu của `co`. Lời hướng dẫn nói Xe Cắm Cờ và nút
  thật của nó (`teleopButtons`).
- NV11:
  - `id: 'leo-thang'`, `title: 'Leo Thang Cứu Hỏa'`, `kind: 'program'`, robot `MAKER`, `start: ROBOT1`,
    `balls: false`, `maxTime: 60`;
  - goals `[{ type: 'climb', min: 'contact' }]`;
  - stars two `[{ type: 'climb', min: 'ground' }]`, three `[{ type: 'climb', min: 'water' }]`;
  - guide 5 bước như spec;
  - hint mỗi mức.
- Chấm: robot treo và đứng yên ≥ 1 s cũng tính là "dừng hẳn".
- Lời giải `solutions.ts['leo-thang']` đạt 3 sao.
- Tiến độ lưu của id `ve-vung-bao-ve` bị bỏ qua.
- NV12:
  - bỏ dòng End Game và chữ "đỗ xe";
  - thêm câu về leo xà;
  - đo lại mốc `score` hai / ba sao như cách R141: điểm trung bình 4 robot máy Dễ, đặt two ≈ trung bình × 0,85, three ≈
    trung bình × 1,1, làm tròn tới 10;
  - ghi số đo vào chú thích.

- [ ] Step 1 test:
  - `grade.test` cho goal `climb`;
  - test lời giải NV11 đạt 3 sao (theo mẫu test lời giải hiện có);
  - e2e: NV11 mở đúng, có tiêu đề "Mục tiêu · Nhiệm vụ 11".
- [ ] Step 2 FAIL → Step 3 → Step 4 PASS + phá → Step 5 commit
  `fanroc: nhiệm vụ 11 Leo Thang Cứu Hỏa, NV10 dùng Xe Cắm Cờ, đo lại NV12`.

### Task 8: Giải đấu

**Files:**
- Modify: `src/fanroc/tournament.ts`, `src/fanroc/ui/tournament.ts`, chỗ ghi kết quả trận giải (`main.ts` của fanroc /
  `game.ts`)
- Test: `tournament.test.ts`, `ui/tournament.test.ts`

**Interfaces:**
- `Played` thêm `multPct: number`.
- `standings()` sắp theo `total`, rồi `multSum` (tổng `multPct` của các trận được tính), rồi `best`, rồi `penalty`, rồi
  thăm. `Standing` thêm `multSum`. `same()` xét cả `multSum`.
- Bảng xếp hạng hiện thêm cột "Hệ số" (multSum / 100, 2 số lẻ).
- Giải đã lưu có kết quả thiếu `multPct`:
  - `isOldRules(s): boolean`;
  - màn Giải hiện "Giải này đấu theo luật cũ (trước V4)." kèm nút tạo giải mới;
  - không đổi giải cũ.

- [ ] Step 1 test:
  - ví dụ luật: C 900 / 515 xếp trên B 900 / 480;
  - `isOldRules` đúng với dữ liệu kiểu 0.8.
- [ ] Step 2 FAIL → Step 3 → Step 4 PASS + phá → Step 5 commit `fanroc: xếp hạng giải theo Tổng Hệ số nhân (V4)`.

### Task 9: Tài liệu, e2e, kiểm tra toàn bộ

**Files:**
- Modify:
  - `docs/fanroc/huong-dan-hoc-sinh.md`: bảng nhiệm vụ, phím móc, "theo luật V4", bỏ End Game / Vùng Bảo Vệ;
  - `docs/fanroc/quyet-dinh.md`: các phán quyết mới, số đo agent;
  - `scripts/fanroc-e2e.mjs`: sửa chỗ dựa vào park / NV11;
  - memory `project_fanroc_sim.md`.
- [ ] `npm run test:unit` → 0 fail.
- [ ] e2e đủ, với `FANROC_URL=http://localhost:5191/mo-phong/fanroc.html`.
- [ ] `grep -rn "Vùng Bảo Vệ\|End Game\|parked" src/fanroc docs/fanroc/huong-dan-hoc-sinh.md` chỉ còn ở chỗ ghi
  lịch sử.
- [ ] Xem bằng mắt: một Trận lẻ mức Khó tới hết giờ thấy 4 robot treo, bảng điểm "× 1,80".
- [ ] Commit `fanroc: tài liệu theo luật V4`. Không bump version, không tag (hỏi anh trước khi làm bản 0.9).
