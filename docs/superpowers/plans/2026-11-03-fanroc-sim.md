# FANROC "Thanh Hỏa" 3D × ThingBlock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang `fanroc.html` trong `thingbot-sim`: học sinh lập trình robot FANROC bằng khối ThingBlock thật, lái bằng tay cầm (bộ thu PS2), chơi trận 3 phút trên sân 3D có vật lý, đồng đội là agent, rồi tải file `.tb` để nạp ThingBot thật.

**Architecture:** Lõi thuần (bố cục sân, tính điểm, giải mã cổng, cấu hình robot, Human Player, trọng tài) không phụ thuộc trình duyệt, kiểm bằng `node --test`. Vật lý Rapier 3D (`world.ts`, `robot.ts`) chạy được cả headless trong Node để chạy trận không cần màn hình. Chương trình học sinh chạy trong `sim-worker.ts` sẵn có (mạch ThingBot ảo), trang đọc `snapshot.pwm[16]` → `decodePorts` → robot; agent sinh đúng kiểu `PortValues` đó. Three.js chỉ vẽ.

**Tech Stack:** TypeScript 5.9, Vite 7, Three.js 0.180 (đã có), `@dimforge/rapier3d-compat` 0.14.0 (như UrSim), `jszip` 3.10.1, scratch-blocks + thingblock-resource + thingblock-sim từ `../thingblock-editor-sim` (alias sẵn trong `vite.config.ts`), Playwright từ checkout ThingBlock (như `scripts/ftc-e2e.mjs` trên `spike/ursim`).

**Spec:** `docs/superpowers/specs/2026-11-03-fanroc-sim-design.md` (đọc cùng plan này). Mã bản thử để tham khảo: `docs/superpowers/specs/fanroc-spike/sim.js`, `fanroc-spike/san-3d.html`. Luật gốc: `/Users/tuanln/Downloads/FANROC 2026 - Luật thi đấu Bảng Robotics - Vòng cơ sở.docx`.

## Global Constraints

- Nhánh mới `feat/fanroc` tách từ `master` (dùng worktree, xem superpowers:using-git-worktrees). Không sửa nhánh `spike/ursim`, không sửa trang/lesson hiện có trừ `vite.config.ts`, `package.json`, `tsconfig.json`. Không push.
- Chỉ dùng khối ThingBlock thật đã đăng ký trong `src/blocks.ts` (thingbot-core, ps2, sim-extra) + khối chuẩn scratch-blocks. **Không định nghĩa khối mới.**
- Không có màn hình cấu hình nút tay cầm. Nút → hành động chỉ do chương trình khối.
- Mọi chữ giao diện tiếng Việt có dấu; chữ trên khối giữ nguyên như ThingBlock.
- Bảng kênh PCA9685 (đúng `thingbot-core/generator.ts`): M1 A=2 B=3, M2 A=4 B=5, M3 A=7 B=6, M4 A=1 B=0; SERVO_1..5 = kênh 12, 11, 10, 9, 8. Duty B>0 = tiến, A>0 = lùi; tốc độ = duty/4095×100. Servo: duty 102 (0°) … 512 (180°), duty 0 = thả servo.
- M1 và M2 cùng `forward` ⇒ xe đi thẳng tới trước (user chốt).
- Luật: trận 10 s xả bóng (robot đứng yên) + 180 s, End Game = 30 s cuối. Robot xuất phát ≤ 300 × 300 × 850 mm, mở rộng 1 chiều ≤ 500 mm, ≤ 4 động cơ TT, ≤ 5 servo.
- Điểm: cam trong Khu Chữa Cháy +5; Mầm Cây Rãnh 1 / 2 / 3 = +5 / +10 / +15; cờ +20, hoặc +40 khi cả 3 rãnh núi đó có ≥ 1 Mầm Cây; đỗ một phần +5, toàn phần +10, cả 2 robot liên minh toàn phần +10; bóng sai vị trí −3; bóng trong robot không tính. Đội = điểm trận − 5×lỗi − 10×thẻ vàng, thẻ đỏ = 0, không âm.
- Đơn vị trong lõi: mét, giây; toạ độ sân (x, z) mét với gốc ở tâm sân, +x sang phải nhìn từ Khu Điều Khiển, +z về phía Khu Điều Khiển, y lên trên (giống bản 3D thử: `P(x,y)` mm luật → `((x−1200)/1000, (1200−y)/1000)`).
- Mã chép từ UrSim (MIT) giữ dòng `Copyright (c) 2026 Khussein` ở đầu tệp; mã chép từ `tb-builder.mjs` ghi nguồn (ThingBlock, nhánh `feat/examples-library` commit `f728263`).
- Mỗi phép thử phải chứng minh được là có thể hỏng: khi viết xong, phá tạm phần mã nó bảo vệ, thấy đỏ, rồi trả lại (ghi lệnh đã dùng vào thông điệp commit).

## Review Focus

1. **Tay cầm không chuẩn hoặc rút ra giữa trận** — robot của tay đó phải dừng (mọi `ps2_*` về trung tính: nút 0, cần 128) chứ không chạy mãi theo giá trị cuối. Phép thử ở Task 10.
2. **Chương trình lỗi hoặc dừng** (worker báo `error`, hoặc học sinh bấm Dừng giữa trận) — robot dừng, trận vẫn chạy tiếp, hiện lỗi tiếng Việt cạnh vùng khối. Phép thử ở Task 10.
3. **Vấp tốc độ 0–19%** — động cơ TT thật không quay dưới ~20%; học sinh sẽ thắc mắc "đặt 10 mà không chạy". Mô hình động cơ có vùng chết 20% và trang không giấu điều đó. Phép thử ở Task 5.
4. **Bóng kẹt / văng ra ngoài rào** — bóng có tâm ngoài sân hoặc y < −0.1 bị loại khỏi trận vĩnh viễn (luật P03/P08), không được tính, không làm vỡ vòng lặp vật lý. Phép thử ở Task 4.
5. **Máy yếu** — 300 bóng ở 60 Hz: trận headless 190 s phải xong dưới 60 s trên Mac mini (≈ 3× nhanh hơn thời gian thật), và trang phải có mức đồ hoạ "Thấp". Phép thử ở Task 4 và Task 12.

---

## File Structure

```
fanroc.html                         trang (vùng khối | sân 3D | bảng điểm)
src/fanroc/layout.ts                số đo sân, vùng, núi, Hộp Phân Phối, chỗ xuất phát (một chỗ duy nhất)
src/fanroc/scoring.ts               tính điểm thuần + điểm đội
src/fanroc/ports.ts                 PortValues, decodePorts(pwm), servo360, neutral
src/fanroc/robots.ts                4 robot mẫu, đế bánh, cổng cơ cấu, kiểm tra luật
src/fanroc/world.ts                 Rapier: sàn, rào, núi, 300 bóng, xả bóng, loại bóng ngoài sân
src/fanroc/robot.ts                 thân robot: lái, hút, xả, nâng, cờ — nhận PortValues
src/fanroc/human.ts                 Human Player: khay, nhặt, nạp, phím
src/fanroc/match.ts                 pha trận, chấm cuối trận từ world, trọng tài, phạt
src/fanroc/agent.ts                 agent Dễ/Vừa/Khó → PortValues
src/fanroc/gamepad.ts               Gamepad API → khoá ps2_* (theo thứ tự cắm)
src/fanroc/programs.ts              chương trình mẫu (scratch-blocks JSON) cho 4 robot
src/fanroc/tb.ts                    xuất .tb (project.json Scratch 3 + zip)
src/fanroc/editor.ts                thẻ Robot 1/2, hộp công cụ, 1 worker mỗi robot
src/fanroc/view/scene.ts            Three: sân, núi, hộp, bóng (instanced), cờ, camera, đồ hoạ Thấp/Cao
src/fanroc/view/robotModels.ts      hình 4 robot (theo bản thử), hoạt cảnh cơ cấu
src/fanroc/view/hud.ts              đồng hồ, pha, điểm từng mục, nhật ký, bảng đội, kiểm tra luật
src/fanroc/main.ts                  ghép tất cả
src/fanroc/*.test.ts                phép thử node --test
scripts/fanroc-e2e.mjs              Playwright
```

---

### Task 1: Nhánh, phụ thuộc, trang rỗng chạy được

**Files:** Create `fanroc.html`, `src/fanroc/main.ts`. Modify `vite.config.ts`, `package.json`, `tsconfig.json` (nếu cần cho `*.test.ts`).

**Interfaces:** Produces: URL dev `http://localhost:5190/mo-phong/fanroc.html`; script `npm run test:unit` = `node --test src/fanroc/`.

- [ ] **Step 1:** Worktree `../thingbot-sim-fanroc` nhánh `feat/fanroc` từ `master`; `npm i @dimforge/rapier3d-compat@0.14.0 jszip@3.10.1` (ghim đúng phiên bản).
- [ ] **Step 2:** `vite.config.ts`: `build.rollupOptions.input = { main: 'index.html', fanroc: 'fanroc.html' }`.
- [ ] **Step 3:** `fanroc.html` có `<title>FANROC Thanh Hỏa · ThingBot Sim</title>`, `lang="vi"`, ba vùng `#blocks`, `#arena`, `#hud`; `main.ts` khởi tạo Rapier (`await RAPIER.init()`) và hiện "Sân đang tải…" rồi "Sẵn sàng".
- [ ] **Step 4:** `package.json` thêm `"test:unit": "node --test src/fanroc/"`. Viết `src/fanroc/smoke.test.ts` kiểm `RAPIER.init()` chạy được trong Node và tạo được `World` (gia tốc −9.81).
- [ ] **Step 5:** Run `npm run test:unit && npm run typecheck && npm run build`. Expected: PASS, `dist/mo-phong/fanroc.html` tồn tại.
- [ ] **Step 6:** Commit `fanroc: trang rỗng, Rapier, jszip`.

### Task 2: Bố cục sân và tính điểm

**Files:** Create `src/fanroc/layout.ts`, `src/fanroc/scoring.ts`, `src/fanroc/scoring.test.ts`, `src/fanroc/layout.test.ts`.

**Interfaces:**
- Produces `layout.ts`: `FIELD = 2.4`, `WALL_H = 0.3`, `BALL_R = 0.02`; `type Rect = { x0: number; x1: number; z0: number; z1: number }`; `ZONES: { fire: [Rect, Rect]; start: Record<Alliance, Rect>; load: Record<Alliance, Rect>; safe: Record<Alliance, Rect> }`; `MOUNTAINS: { x: number; z: number }[]` (A, B, C, D); `TIERS = [{ floor: 0.015 }, { floor: 0.05, decor: true }, { floor: 0.095 }, { floor: 0.13 }]`, `PEAK_Y = 0.16`, `HOLE = { r: 0.0225, depth: 0.045 }`; `DISPENSER: { x: number; z: number }`; `START_POSES: Record<Alliance, [Pose, Pose]>`; `type Alliance = 'red' | 'blue'`; `type Phase = 'release' | 'play' | 'end'`; `type Pose = { x: number; z: number; yaw: number }`. Giá trị mm luật lấy từ `fanroc-spike/sim.js` `ZONES/MOUNTAINS` đổi sang mét theo quy ước Global Constraints.
- Produces `scoring.ts`: `interface FieldTally { fire: { o: number; g: number }; mtn: { g: number; o: number }[][]; flags: boolean[]; parks: Record<Alliance, ('full' | 'partial' | null)[]> }`; `scoreTally(t: FieldTally): ScoreBreakdown` với `ScoreBreakdown = { fire; r1; r2; r3; flag; park; wrong; total }`; `teamScore(match: number, pen: { minor: number; yellow: number; red: boolean }): number`.

- [ ] **Step 1: Write failing tests** (port từ `check.js` của bản thử):
  - `scoreTally` ví dụ 1 luật = 175; ví dụ 2 = 299 (Núi A 6/3/2 + cờ → 40, Núi B 5/0/0 + cờ → 20, Đỏ 2 robot full → 30, 2 bóng xanh trong Chữa Cháy → −6).
  - `teamScore(200, …)` cho 0 lỗi / 1 lỗi / 1 vàng / đỏ = 200 / 195 / 190 / 0; `teamScore(3, {minor:1,…}) === 0`.
  - Bóng xanh tầng trang trí tính như Rãnh 1 (tally gộp vào `mtn[m][0]`).
  - `layout.test.ts`: Khu Chữa Cháy 0.6 × 0.6, Bảo Vệ và Tiếp Tế 0.375 × 0.375, Xuất Phát 0.7 × 0.3, mọi núi nằm trong Khu Rừng và cách nhau ≥ 0.4 m.
- [ ] **Step 2:** Run `npm run test:unit` → FAIL (module chưa có).
- [ ] **Step 3:** Implement `layout.ts`, `scoring.ts`.
- [ ] **Step 4:** Run → PASS. Phá thử (đổi 40 thành 20) → đỏ, trả lại.
- [ ] **Step 5:** Commit `fanroc: bố cục sân + tính điểm (3 ví dụ của luật)`.

### Task 3: Giải mã cổng ThingBot và robot mẫu

**Files:** Create `src/fanroc/ports.ts`, `src/fanroc/robots.ts`, `src/fanroc/ports.test.ts`, `src/fanroc/robots.test.ts`.

**Interfaces:**
- Produces `ports.ts`: `type PortValues = { M1: number; M2: number; M3: number; M4: number; S1: number | null; S2: number | null; S3: number | null; S4: number | null; S5: number | null }` (motor −100…100, servo độ 0…180 hoặc null khi thả); `NEUTRAL: PortValues` (motor 0, servo null); `decodePorts(pwm: readonly number[]): PortValues`; `servo360(angle: number | null): -1 | 0 | 1` (vùng chết 80…100° = 0, > 100 = 1, < 80 = −1).
- Produces `robots.ts`: `type RobotType = 'maker' | 'ui' | 'co' | 'sort'`; `type Drive = 'diff2' | 'omni' | 'mecanum'`; `type Actuator = 'tt' | 's360'`; `interface RobotDef { type; name; size: { w: number; l: number; h: number }; drives: Drive[]; mech: Partial<Record<'M3' | 'M4', string>>; servos: Partial<Record<'S1' | 'S2' | 'S3', string>>; storage: number; hpLoad: boolean; flag: boolean; release: { y: number; reach: number }; maxExtend: number }`; `ROBOTS: Record<RobotType, RobotDef>`; `interface RobotConfig { type: RobotType; drive: Drive; actuator: Actuator }`; `portMap(cfg): { wheels: Record<'L' | 'R' | 'FL' | 'FR' | 'RL' | 'RR', keyof PortValues | undefined>; intake?: keyof PortValues; lift?: keyof PortValues; liftKind?: 'motor' | 's360'; intakeKind?: 'motor' | 's360' }`; `ruleChecks(cfg, extendNow: number): { ok: boolean | 'note'; text: string }[]`.
- Giá trị robot (từ spec 4.3 và bản thử 3D): Maker 0.240 × 0.300 × 0.216, storage 6, release y 0.20 reach 0.05, maxExtend 0.13, flag; Xe Ủi 0.180 × 0.240 × 0.150, storage 15, không flag, chỉ `diff2`; Xe Cắm Cờ 0.185 × 0.280 × 0.250, storage 12, hpLoad, flag, M4 nâng 0.08; Xe Phân Loại 0.240 × 0.260 × 0.160, storage 5 + 5 (2 ngăn), S2 chọn ngăn (< 90° ngăn cam, ≥ 90° ngăn xanh), S3 cửa xả ngăn đang chọn.

- [ ] **Step 1: Write failing tests:**
  - `decodePorts`: duty kênh 3 = 4095 → `M1 === 100`; kênh 2 = 2048 → `M1 ≈ -50` (±1); kênh 7 = 4095 → `M3 === -100`; kênh 1 > 0 → `M4 < 0`; kênh 12 = 102 → `S1 === 0`, = 512 → `S1 === 180`, = 0 → `S1 === null`; kênh 8 → `S5`.
  - `servo360(180) === 1`, `servo360(90) === 0`, `servo360(0) === -1`, `servo360(null) === 0`.
  - `portMap({maker, diff2, tt})`: L = M1, R = M2, intake = M3, lift = M4. `{maker, mecanum, tt}`: FL..RR = M1..M4, intake = S4 `s360`, lift = S5 `s360` (actuator bị ép).
  - `ruleChecks`: Maker 300 mm → R01 đạt; `extendNow 0.13` → 0.43 đạt; diff2 + TT → "Động cơ TT: 4 / 4" đạt; `ui` hai chiếc cạnh nhau `2 × 0.180 ≤ 0.375`.
- [ ] **Step 2–4:** FAIL → implement → PASS → phá thử (đổi kênh M3 A/B) → đỏ → trả lại.
- [ ] **Step 5:** Commit `fanroc: giải mã cổng PCA9685 + 4 robot mẫu + kiểm tra luật`.

### Task 4: Thế giới vật lý: sân, núi, bóng, xả bóng

**Files:** Create `src/fanroc/world.ts`, `src/fanroc/world.test.ts`.

**Interfaces:**
- Consumes `layout.ts`.
- Produces `class FanrocWorld { static async create(seed: number): Promise<FanrocWorld>; readonly rapier: RAPIER.World; readonly balls: BallState[]; step(dt: number): void; release(t: number): void; ballsIn(rect: Rect): number[]; removeBall(i: number): void; placeBall(i: number, pos: Vec3, vel?: Vec3): void; tally(robotsHolding: Set<number>): Omit<FieldTally, 'flags' | 'parks'> }` với `interface BallState { color: 'o' | 'g'; st: 'box' | 'field' | 'held' | 'tray' | 'out'; body: RAPIER.RigidBody | null }`; `PHYSICS_DT = 1 / 60`.
- Va chạm: sàn (ma sát 0.9), 4 rào cao 0.3, mỗi núi là các khối lồi xếp tầng theo `TIERS` (tầng là trụ lồi gần đúng hình bầu dục 0.40 / 0.30 / 0.216 / 0.136 m, mỗi tầng có gờ ngoài cao 12 mm để giữ bóng), trụ đỉnh có lỗ cờ (trụ rỗng = 8 khối nhỏ quanh lỗ). Bóng: cầu r 0.02, khối lượng 2.7 g, nảy 0.6, CCD bật, cho ngủ.
- `release(t)` gọi trong 10 s đầu: thả 300 bóng từ Hộp Phân Phối (cam 100 tầng trên, xanh 200 tầng dưới) theo lô, vận tốc ban đầu hướng vào sân có nhiễu theo `seed` — bóng lăn theo vật lý, không đặt sẵn chỗ.
- Bóng có tâm ngoài sân (|x| hoặc |z| > 1.2 + 0.05) hoặc y < −0.1 → `st = 'out'`, xoá body (luật P03/P08).

- [ ] **Step 1: Write failing tests:**
  - Sau `release` đủ 10 s và thêm 3 s vật lý: ≥ 280 bóng `st === 'field'`, không bóng nào `y < 0` mà vẫn `'field'`.
  - Đặt 1 bóng xanh đứng yên trên gờ Rãnh 2 của Núi A → sau 2 s vẫn ở Rãnh 2 và `tally().mtn[0][1].g === 1`.
  - Đặt bóng ngay trên đỉnh núi (không vào lỗ) → lăn xuống một rãnh thấp hơn hoặc sàn, không lơ lửng.
  - Bóng đặt ở (1.4, 0.05, 0) → `st === 'out'` sau 1 bước.
  - Hiệu năng: 190 s vật lý với 300 bóng chạy < 60 s thời gian máy (in số đo ra).
- [ ] **Step 2–4:** FAIL → implement → PASS → phá thử (bỏ gờ rãnh) → phép thử Rãnh 2 đỏ → trả lại.
- [ ] **Step 5:** Commit `fanroc: thế giới Rapier — sân, 4 Ngọn Núi, 300 bóng, xả bóng`.

### Task 5: Thân robot: lái và cơ cấu theo cổng

**Files:** Create `src/fanroc/robot.ts`, `src/fanroc/robot.test.ts`.

**Interfaces:**
- Consumes `FanrocWorld`, `RobotConfig`, `portMap`, `PortValues`.
- Produces `class RobotBody { constructor(world: FanrocWorld, cfg: RobotConfig, alliance: Alliance, slot: 0 | 1); readonly pose: { x: number; z: number; yaw: number }; readonly stored: number[]; extend: number; hasFlag: boolean; parked: boolean; onFlag?: (mountain: number) => void; apply(ports: PortValues, dt: number): void; footprint(): Vec2[] }`.
- Mô hình động cơ TT: `|lệnh| < 20` → 0 (vùng chết), còn lại `v = sign × (|lệnh|−20)/80 × V_MAX`, `V_MAX = 0.55` m/s, gia tốc ≤ 2 m/s². `diff2`: v = (vL+vR)/2, ω = (vR−vL)/track. `omni` (chữ X) và `mecanum`: trộn ngược từ 4 bánh FL, FR, RL, RR. Robot là vật dynamic, đặt vận tốc mỗi bước như `UrSimulator/src/sim/RobotSim.ts`.
- Hút: miệng là hộp trước mũi xe (rộng = w − 0.02, sâu 0.05, cao 0.06); khi cổng intake ≥ 20 (motor) hoặc `servo360 === 1`, bóng `field` có tâm trong miệng được bỏ body và thêm vào `stored` nếu còn chỗ. Không quay ⇒ không hút.
- Xả: cổng S3 ≥ 90° ⇒ mỗi 0.25 s thả 1 bóng tại điểm (mũi + reach + extend, `release.y` + nâng) với vận tốc 0.2 m/s tới trước; bóng rơi theo vật lý.
- Nâng/vươn (lift): tích phân `extend` theo tốc độ (motor: ±0.08 m/s tại 100; s360: ±0.06 m/s), kẹp trong [0, maxExtend].
- Cờ: S2 ≥ 90° = kẹp đóng giữ cờ; mở (< 90°) khi đầu cờ cách tâm lỗ một núi ≤ 0.025 m ⇒ cờ được cắm (trả về id núi qua `onFlag`); mở chỗ khác ⇒ cờ rơi xuống sàn (vật dynamic), kẹp đóng lại gần cờ ⇒ nhặt lại.
- Xe Phân Loại: ngăn nhận theo S2 lúc hút; S3 mở thả ngăn đang chọn.

- [ ] **Step 1: Write failing tests:**
  - `{M1: 60, M2: 60}` trong 2 s ⇒ tiến ≈ (60−20)/80 × 0.55 × 2 ± 15 %, yaw đổi < 3°.
  - `{M1: 15, M2: 15}` ⇒ đứng yên (vùng chết).
  - `{M1: -50, M2: 50}` ⇒ quay tại chỗ, dịch chuyển tâm < 0.03 m.
  - Mecanum: FL = +60, FR = −60, RL = −60, RR = +60 ⇒ đi ngang, |Δz| < 0.05 m.
  - Bóng trước mũi + intake 0 trong 1 s ⇒ không hút; intake 80 ⇒ `stored.length === 1`.
  - Maker 6 bóng + S3 = 150 ⇒ sau 2 s `stored.length === 0`, 6 bóng `field`.
  - Cờ: đặt Maker để kẹp ngay trên lỗ Núi A, S2 từ 150 → 30 ⇒ `onFlag(0)` được gọi.
- [ ] **Step 2–4:** FAIL → implement → PASS → phá thử (bỏ vùng chết) → đỏ → trả lại.
- [ ] **Step 5:** Commit `fanroc: thân robot — động cơ TT, đế 2 bánh/omni/mecanum, hút, xả, vươn, cờ`.

### Task 6: Human Player

**Files:** Create `src/fanroc/human.ts`, `src/fanroc/human.test.ts`.

**Interfaces:**
- Produces `class HumanPlayer { constructor(alliance: Alliance); tray: { o: number; g: number }; color: 'o' | 'g'; press(action: HpAction, ctx: HpContext): string | null; auto(ctx: HpContext, dt: number): void }`; `type HpAction = 'pick' | 'orange' | 'green' | 'load'`; `HpContext = { world: FanrocWorld; robots: RobotBody[]; phase: Phase; endgame: boolean }`; `KEYMAP: Record<string, { hp: 0 | 1; action: HpAction }>` = trái `KeyQ` pick, `KeyA` orange, `KeyS` green, `KeyD` load; phải `KeyU` pick, `KeyJ` orange, `KeyK` green, `KeyL` load. (`hp 0` = Human Player liên minh của robot người lái 1, `hp 1` = của robot người lái 2.)
- `pick`: chuyển 1 bóng đang nằm trong `ZONES.start[alliance]` vào khay (`st = 'tray'`), mỗi lần bấm 1 bóng. `load`: chỉ khi có robot cùng liên minh có điểm footprint trong `ZONES.load[alliance]`, robot `hpLoad` hoặc có `storage`, còn chỗ, và không `parked` trong End Game ⇒ chuyển 1 bóng màu đang chọn vào `stored`. Trả lại lý do bằng tiếng Việt khi không nạp được ("Robot chưa vào Khu Tiếp Tế", "Khay hết bóng xanh", "Robot đã về Vùng Bảo Vệ").
- `auto` (máy 1 người): mỗi 0.8 s nhặt, mỗi 0.8 s nạp màu robot đang cần (robot có `hpLoad` ⇒ xanh trước).

- [ ] **Step 1: Write failing tests:** pick lấy đúng bóng trong Khu Xuất Phát (bóng ngoài vùng không bị lấy); load bị từ chối khi robot ngoài Khu Tiếp Tế; load được khi một góc robot chạm ô; End Game + robot `parked` ⇒ từ chối đúng câu; khay rỗng ⇒ từ chối.
- [ ] **Step 2–5:** FAIL → implement → PASS → phá thử → commit `fanroc: Human Player — khay, nhặt, nạp, phím`.

### Task 7: Trận đấu, chấm cuối trận, trọng tài

**Files:** Create `src/fanroc/match.ts`, `src/fanroc/match.test.ts`.

**Interfaces:**
- Consumes world, robots, human, scoring.
- Consumes `Phase` từ `layout.ts`. Produces `class Match { constructor(world, robots: RobotBody[], teams: string[], opts: { practice?: boolean; seed: number }); t: number /* −10 … 180 */; phase: Phase; endgame: boolean; events: { t: number; robot: number | null; text: string }[]; pens: { minor: number; yellow: number; red: boolean }[]; step(dt: number, ports: PortValues[]): void; tally(): FieldTally; result(): { score: ScoreBreakdown; teams: { team: string; score: number }[] } }`.
- Pha `release`: robot bị ép `NEUTRAL`, world.release; hết 10 s sang `play`; `endgame` khi còn ≤ 30 s; t = 180 ⇒ `end`, đóng băng robot (G12), chấm một lần.
- `tally()`: Chữa Cháy = bóng `field`, y < 0.03, tâm cách mép vùng ≤ BALL_R (chạm vạch được tính); Núi = bóng `field` có tâm trong hình chiếu núi và y trong ±0.012 của `floor + BALL_R` từng tầng (tầng trang trí gộp Rãnh 1); cờ theo `onFlag`; đỗ theo footprint ∩ `ZONES.safe` của liên minh mình (mọi góc trong = full, ≥ 1 góc = partial).
- Trọng tài (chỉ ghi lỗi, mỗi lỗi một sự kiện tiếng Việt): leo núi P12 (footprint robot chồng hình chiếu núi > 30 % và thân robot cao hơn sàn > 0.03) ⇒ cảnh cáo rồi lỗi; vươn ra ngoài rào S02 (footprint ra ngoài sân) ⇒ thẻ vàng; cán cờ trên sàn P10 ⇒ cảnh cáo; chặn robot khác > 5 s G15 (khoảng cách thân < 0.02 và cả hai đứng yên) ⇒ thẻ vàng. `practice` ⇒ không đồng hồ, không phạt.

- [ ] **Step 1: Write failing tests:** đặt sẵn trạng thái sân giống ví dụ 2 của luật bằng `placeBall` + cờ + đỗ ⇒ `result().score.total === 299`; robot ra lệnh tiến trong pha `release` ⇒ không di chuyển; t = 180 ⇒ `phase === 'end'` và lệnh sau đó không làm robot đi; bóng đè vạch Chữa Cháy (tâm cách mép 0.015 ngoài vùng) ⇒ được tính; robot leo núi 2 lần ⇒ có 1 lỗi.
- [ ] **Step 2–5:** FAIL → implement → PASS → phá thử → commit `fanroc: trận đấu, chấm cuối trận, trọng tài`.

### Task 8: Agent đồng đội

**Files:** Create `src/fanroc/agent.ts`, `src/fanroc/agent.test.ts`.

**Interfaces:**
- Produces `type Skill = 'easy' | 'medium' | 'hard'`; `class Agent { constructor(robot: RobotBody, cfg: RobotConfig, skill: Skill, seed: number); update(view: AgentView, dt: number): PortValues }`; `AgentView = { world: FanrocWorld; robots: RobotBody[]; match: Match; humans: HumanPlayer[] }`.
- Agent chỉ ra lệnh qua `PortValues` (lái bằng M1/M2 hoặc 4 bánh, cơ cấu bằng cổng theo `portMap`) — cùng vật lý với học sinh. Chiến thuật theo bản thử `sim.js` `decide()`: cắm cờ trước, chọn rãnh theo giá trị kỳ vọng, gỡ bóng xanh khỏi Chữa Cháy (khó), về đỗ khi `thời gian còn ≤ quãng đường/vận tốc + 3 s` (khó), `+ 6 s` (vừa), dễ có 35 % quên. **Không nhận bóng ở Khu Tiếp Tế khi thời gian còn < thời gian đi giao + 5 s.** Mức dễ: tốc độ 60 %, lệch hướng ngẫu nhiên, hay để rơi.

- [ ] **Step 1: Write failing tests** (headless, seed cố định, 3 trận mỗi mức, 4 Mẫu Maker diff2): điểm trận trung bình khó > vừa > dễ; khó cắm ≥ 2 cờ mỗi trận; trong 10 trận "khó" không có sự kiện "nhận bóng" khi thời gian còn < 10 s.
- [ ] **Step 2–5:** FAIL → implement → PASS (ghi điểm trung bình vào thông điệp commit) → commit `fanroc: agent đồng đội Dễ/Vừa/Khó qua cổng M/S`.

### Task 9: Vẽ 3D

**Files:** Create `src/fanroc/view/scene.ts`, `src/fanroc/view/robotModels.ts`, `src/fanroc/view/hud.ts`.

**Interfaces:**
- Consumes world, robots, match.
- Produces `createScene(el: HTMLElement): FanrocScene` với `FanrocScene = { sync(world, robots, match): void; camera(view: 'field' | 'follow' | 'driver', robot?: number): void; quality(q: 'low' | 'high'): void; dispose(): void }`; `createHud(el): { update(match, robots, cfgs): void; log(text: string): void }`.
- Hình học sân, núi (bầu dục gợn, 4 tầng + đỉnh), Hộp Phân Phối (chân đế + hộp mica 2 tầng), cờ, và 4 robot (2 bánh + bánh omni bị động, mecanum, omni) lấy từ `fanroc-spike/san-3d.html` — chuyển sang module TS, Three 0.180. Bóng dùng 2 `InstancedMesh` (cam 100, xanh 200); bóng `tray` xếp ở 2 bên Khu Điều Khiển; bóng `held` chồng trên robot. Camera: `field` toàn sân, `follow` sau lưng robot, `driver` từ Khu Điều Khiển của liên minh. Mức `low`: không bóng đổ, pixelRatio 1, núi ít đỉnh.
- HUD tiếng Việt: đồng hồ (đếm 0:10 → 0:00 lúc xả bóng, rồi 3:00 → 0:00), pha ("Xả bóng · robot đứng yên" / "Thi đấu" / "End Game" đỏ / "Hết giờ"), điểm trận + từng mục, nhật ký, bảng đội cuối trận, ô kiểm tra luật robot đang chọn.

- [ ] **Step 1:** Implement; dùng `main.ts` tạm chạy trận 4 agent để nhìn.
- [ ] **Step 2:** Run `npm run dev`, mở trang, xem hết một trận ×4: bóng xả từ hộp, robot chạy, cờ lên núi, HUD đổi pha. Chụp 1 ảnh màn hình đính vào thông điệp commit (đường dẫn).
- [ ] **Step 3:** Commit `fanroc: vẽ 3D sân, núi, bóng, 4 robot, HUD`.

### Task 10: Tay cầm, vùng khối, worker, chương trình mẫu

**Files:** Create `src/fanroc/gamepad.ts`, `src/fanroc/editor.ts`, `src/fanroc/programs.ts`, `src/fanroc/programs.test.ts`. Modify `src/fanroc/main.ts`.

**Interfaces:**
- Consumes `createBlocks` (`src/blocks.ts`), `SimWorker` (`src/sim-worker.ts`, lệnh `load / run / stop / input`), `ps2Key`, `decodePorts`.
- Produces `gamepad.ts`: `readPads(): (Ps2State | null)[]` theo thứ tự cắm (lọc tay đã ngắt), `Ps2State = Record<string, number>` khoá đúng tên `ps2_PSB_*` (0/1) và `ps2_PSS_LX/LY/RX/RY` (0…255, giữa 128); nút theo bố cục chuẩn Gamepad như `src/ftc/run.ts` (nhánh `spike/ursim`) — chép hàm đó sang, sửa cho nhiều tay. Tay bị rút ⇒ `null` ⇒ trang gửi toàn bộ khoá về trung tính.
- Produces `editor.ts`: `createEditors(container, robots: { label: string; cfg: RobotConfig }[]): { active: number; program(i): object; load(i, state: object): void; run(i): void; stop(i): void; ports(i): PortValues; onError(cb: (i: number, msg: string) => void): void }`. Mỗi robot người lái có 1 workspace + 1 `SimWorker`; mỗi khung hình gửi `input` cho các khoá `ps2_*` đã đổi và lấy `snapshot.pwm` mới nhất → `decodePorts`. Worker `error` ⇒ `ports` trả `NEUTRAL`, hiện lỗi tiếng Việt cạnh vùng khối.
- Hộp công cụ: Sự kiện (`event_whenarduinobegin`, `event_whenarduinoloop`), Điều khiển (`control_wait`, `control_if`, `control_if_else`, `control_repeat`, `control_forever`), Toán tử (`operator_lt/gt/equals/and/or/not/add/subtract/multiply/divide`), ThingBot (`thingBotC3_init`, `thingBotC3_initPS2`, `thingBotC3_setMotor`, `thingBotC3_setServoAngle`, `thingBotC3_moveServoAngle`, `thingBotC3_releaseServo`), PS2 (`ps2_readData`, `ps2_getButton`, `ps2_GetJoystick`).
- Produces `programs.ts`: `SAMPLES: Record<RobotType, { teleop: object; auto: object }>` (scratch-blocks JSON). TeleOp: `khi Arduino khởi động` init ThingBot + init PS2; `vòng lặp Arduino` read PS2 receiver data; lái kiểu xe tăng (LY → M1, RY → M2, vùng giữa 120…136 = dừng, ngoài vùng `set motor … go forward/backward at (|v − 128| × 100 / 128)`); R1 → cơ cấu hút, △/✕ → nâng/hạ, ○ → mở cửa xả S3, □ → mở kẹp S2; cuối vòng đợi 0.02 s. Mẫu mecanum: trộn tiến/ngang/xoay (bảng trong spec 4.3). Auto: chuỗi `set motor` + `đợi` đi tới núi gần nhất, mở cửa xả, lùi về Vùng Bảo Vệ.

- [ ] **Step 1: Write failing test `programs.test.ts`** (Node, headless scratch-blocks như `smoke-lessons.mjs` của master): mỗi mẫu sinh `simCode()` không lỗi; mã Arduino chứa `ps2x.read_gamepad` hoặc tương đương và `pwm.setPWM(M1_B`; mọi opcode thuộc danh sách hộp công cụ trên.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Ghép vào `main.ts`: thẻ "Robot 1 · <tên đội>", "Robot 2"; mỗi thẻ chọn robot mẫu, đế bánh, "Cơ cấu M3/M4 chạy bằng" (TT / servo 360) và nạp mẫu TeleOp hoặc Auto; nút ▶ Chạy / ■ Dừng; chọn mức agent; Trận / Luyện tập; robot không có người lái do agent lái, hoặc dùng chương trình của một thẻ ("Robot 3 chạy chương trình của Robot 1"). Trong Trận, worker được `run` khi pha chuyển sang `play` (sau 10 s xả bóng); trong Luyện tập chạy ngay. Hiện "Tay cầm 1 → Robot 1" (chỉ hiện, không cấu hình).
- [ ] **Step 6:** Commit `fanroc: vùng khối ThingBlock thật, worker mỗi robot, tay cầm PS2, chương trình mẫu`.

### Task 11: Xuất file .tb

**Files:** Create `src/fanroc/tb.ts`, `src/fanroc/tb.test.ts`. Modify `src/fanroc/main.ts` (nút "Tải về để nạp").

**Interfaces:**
- Produces `toProject(state: object): ProjectJson` và `toTb(state: object): Promise<Blob>`; port từ `../thingblock-editor-examples/packages/thingblock-resource/scripts/examples/tb-builder.mjs` (`toProject`, `toTb`): khối trong `Sprite1`, biến trên Stage, `extensions` suy từ opcode (`thingBotC3`, `ps2`), `board: { device: 'thingbot', peripherals: [] }`, `meta.semver '3.0.0'`, zip một tệp `project.json`. Tên tệp tải về `fanroc-<robot>-<yyyymmdd-hhmm>.tb`.

- [ ] **Step 1: Write failing test:** xuất mẫu TeleOp Maker → giải nén → `project.json` có `extensions` chứa `thingBotC3` và `ps2`, `board.device === 'thingbot'`, khối đầu có `opcode === 'event_whenarduinobegin'` và `topLevel`, số khối bằng số khối của workspace; so cấu trúc khoá cấp 1 với `sim-09-tay-cam-ps2.tb` (`targets, monitors, extensions, meta, board`).
- [ ] **Step 2–4:** FAIL → implement → PASS → phá thử (bỏ `board`) → đỏ → trả lại.
- [ ] **Step 5:** Kiểm tay: mở file vừa xuất bằng ThingBlock desktop (`/Applications/ThingBlock-0.3.3-preview.2.app`), thấy đủ khối; ghi kết quả vào thông điệp commit.
- [ ] **Step 6:** Commit `fanroc: xuất .tb để nạp ThingBot thật`.

### Task 12: Phép thử đầu-cuối

**Files:** Create `scripts/fanroc-e2e.mjs`. Modify `package.json` (`"e2e:fanroc": "node scripts/fanroc-e2e.mjs"`).

**Interfaces:** Consumes trang đang chạy ở `http://localhost:5190/mo-phong/fanroc.html`; tay cầm giả bằng `addInitScript` ghi đè `navigator.getGamepads` (như `FAKE_PAD` của `scripts/ftc-e2e.mjs` trên `spike/ursim`).

- [ ] **Step 1:** Viết các phép thử, mỗi cái có tên:
  - E1 Trang tải, không lỗi console, tiêu đề và chữ HUD tiếng Việt.
  - E2 Mẫu TeleOp Maker + tay giả đẩy cả 2 cần lên (LY = RY = 0) 2 s ⇒ Robot 1 tiến về phía núi (z giảm) > 0.3 m, yaw lệch < 10°.
  - E3 Thả tay (cần 128) ⇒ robot dừng trong 0.5 s; rút tay (`getGamepads` trả rỗng) giữa lúc đang đẩy ⇒ robot dừng (Review Focus 1).
  - E4 Chương trình lỗi (khối rời rạc gây lỗi worker) ⇒ robot dừng, có thông báo tiếng Việt, đồng hồ trận vẫn chạy (Review Focus 2).
  - E5 Bàn phím: robot trong Khu Tiếp Tế, khay có bóng xanh, bấm `KeyS` rồi `KeyD` ⇒ robot có 1 bóng.
  - E6 Trận ×40 tốc độ với 4 agent chạy hết ⇒ pha "Hết giờ", bảng đội có 4 dòng, điểm trận khớp tổng các mục.
  - E7 Nút "Tải về để nạp" tải được tệp đuôi `.tb` giải nén ra `project.json`.
  - E8 Điện thoại 390 × 844: không cuộn ngang, nút ☰ ẩn/hiện vùng khối, sân vẫn vẽ.
  - E9 Mức đồ hoạ Thấp: đo khung hình trung bình trong 5 s trận ≥ 30 fps trên Mac mini (in số đo) (Review Focus 5).
- [ ] **Step 2:** Run `npm run dev` (nền) rồi `npm run e2e:fanroc`. Expected: 9/9 PASS.
- [ ] **Step 3:** Phá thử từng nhóm: đổi kênh M1 trong `decodePorts` ⇒ E2 đỏ; bỏ xử lý tay rút ⇒ E3 đỏ; trả lại.
- [ ] **Step 4:** Commit `fanroc: phép thử đầu-cuối 9 tình huống`.
