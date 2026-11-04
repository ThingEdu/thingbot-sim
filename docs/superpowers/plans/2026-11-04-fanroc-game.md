# ThingBot FanRoc Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biến trang `fanroc.html` thành **ThingBot FanRoc Game** — game mô phỏng độc lập (tải về máy; bản web cho sự kiện trên máy 201): màn chính kiểu game, Giải đấu đúng luật cho 1–2 bạn, Trận lẻ / Đấu tập lái bàn phím, Xưởng lập trình (chương trình mặc định theo hướng dẫn), 12 nhiệm vụ con rùa có vệt — trong bố cục kiểu VS Code.

**Architecture:** Thêm các lõi thuần kiểm bằng `node --test` (bàn phím → PS2 ảo, chia điểm Đỏ/Xanh, giải đấu, trận ngầm, lưu trữ, vệt + số đo, nhiệm vụ + bộ chấm). Tách vòng lặp trận khỏi `main.ts` thành `GameSession` (có tạm dừng / chạy từng khối). Giao diện mới trong `src/fanroc/ui/` thay thanh nút + cột HUD cũ; vật lý, luật, agent giữ nguyên.

**Tech Stack:** TypeScript 5.9, Vite 7, Three 0.180, Rapier 0.14, scratch-blocks / thingblock-sim từ `../thingblock-editor-sim` (alias sẵn), Playwright từ checkout ThingBlock cho `e2e:fanroc`. Không thêm phụ thuộc mới.

**Spec:** `docs/superpowers/specs/2026-11-03-fanroc-ui-nhiem-vu-design.md` (đọc cùng plan). Luật gốc: `/Users/tuanln/Downloads/FANROC 2026 - Luật thi đấu Bảng Robotics - Vòng cơ sở.docx` (mục E: cơ cấu giải). Bản phác: `.superpowers/brainstorm/74019-1793743813/content/layout-v4-game.html`, `.superpowers/brainstorm/16768-1793712920/content/layout-v3-vscode.html`.

## Global Constraints

- Nhánh `feat/fanroc`, worktree `~/Ai-Code/thingbot-sim-fanroc`. **Không push, không merge, không deploy.** Commit cục bộ theo từng task.
- **Không thêm khối mới vào ThingBlock.** Chỉ khối đã đăng ký trong `src/blocks.ts` + khối chuẩn scratch-blocks (điều khiển, toán, biến, procedures / "Khối của em"). `.tb` xuất ra vẫn nạp được vào ThingBot thật.
- `src/sim-worker.ts` dùng chung với bài học robot.edu.vn — **chỉ được thêm lệnh `pause` / `step` kiểu cộng thêm**. `src/sim-extra.ts` không sửa. `npm run smoke` phải xanh sau mọi task chạm hai tệp này.
- Không sửa lõi vật lý / luật / agent (`world.ts`, `robot.ts`, `match.ts`, `agent.ts`, `scoring.ts` phần tính điểm), trừ: tuỳ chọn sân không xả bóng (Task 10) và hàm chia điểm liên minh (Task 4).
- Tên sản phẩm: **ThingBot FanRoc Game** (tiêu đề trang `<title>ThingBot FanRoc Game</title>`, màn chính). Tên tệp `.tb` giữ `tbFileName` cũ.
- Mọi chữ giao diện tiếng Việt có dấu, giọng nói với học sinh. Không dùng emoji trên nút — biểu tượng SVG nét mảnh nhúng sẵn (không tải từ mạng).
- Chạy được 1920×1080 và 1366×768; < 900 px thì khung bên phủ lên sân. Không cuộn ngang ở 390×844.
- Luật trận: 10 s khởi động + 180 s, 4 đội nhận chung điểm trận; điểm đội = `teamScore(điểm trận, phạt)`. Bảng điểm **chia hai bên Đỏ | chung + đồng hồ | Xanh** (anh Tuấn chốt 04/11).
- Vệt robot **chỉ có trong nhiệm vụ con rùa**.
- Human Player luôn tự động (`HumanPlayer.auto`); bỏ `KEYMAP` Q/A/S/D–U/J/K/L.
- Có chương trình khối đang chạy thì tốc độ khoá ×1 (R24, `effectiveSpeed`).
- `localStorage`: mọi đọc/ghi bọc try/catch; hỏng / bị chặn ⇒ chạy với mặc định, không vỡ trang. Không xoá khoá ngoài tiền tố `fanroc.v1.`.
- Cổng 5190 thuộc checkout khác: không dùng. Lưới núi CAD (`assets/mountain-mesh.json`) không đăng/push.
- Mỗi phép thử phải chứng minh được là có thể hỏng: phá tạm phần mã nó bảo vệ, thấy đỏ, trả lại (ghi cách phá vào thông điệp commit).
- Ledger + quyết định: `.superpowers/sdd/<plan>/progress.md`; quyết định mới đánh số tiếp từ **R35** và chép vào `docs/fanroc/quyet-dinh.md` ở Task 16.

## Review Focus

1. **Phím kẹt khi cửa sổ mất focus** (bấm W rồi Alt-Tab / mở ⚙ / bấm vào vùng khối): robot phải dừng, không chạy mãi. Phép thử Task 3 (`blur ⇒ releaseAll`).
2. **`localStorage` hỏng, đầy hoặc bị chặn** (chế độ ẩn danh, JSON cũ sai dạng): trang vẫn mở với mặc định, giải đang dở hỏng thì báo "Không đọc được giải đang dở" và cho tạo giải mới. Phép thử Task 7.
3. **Tải lại trang giữa một trận của giải**: trận dở không được ghi nửa chừng; mở lại thì trận đó đấu lại từ đầu, các trận đã xong giữ nguyên. Phép thử Task 5.
4. **Tạm dừng giữa trận / nhiệm vụ**: đồng hồ trận, vật lý, agent và Human Player cùng đứng; chạy tiếp thì nối đúng chỗ; "chạy từng khối" qua khối `đợi 1 giây` thì sân chạy ≈ 1 s. Phép thử Task 2 và Task 10.
5. **Chương trình của em lưu cho robot loại A, rồi chọn robot loại B** (Xưởng / ghi danh giải): không được chạy chương trình sai cổng âm thầm — chương trình lưu theo loại robot + đế; loại khác chưa có thì dùng Mặc định và hiện nhãn "Mặc định". Phép thử Task 7.

---

## File Structure

```
fanroc.html                          khung trang mới: #app (shell) — tiêu đề ThingBot FanRoc Game
src/sim-worker.ts                    + lệnh pause / step (cộng thêm)
src/fanroc/
  link.ts                            + pause(), step(), state 'paused', block (khối vừa chạy), serial
  keys.ts            (mới)           bàn phím → tay PS2 ảo (solo / nửa trái / nửa phải), trộn với tay thật
  scoring.ts                         + allianceShare() chia phần Đỏ / Xanh
  tournament.ts      (mới)           giải: lịch bốc thăm, ghi kết quả, xếp hạng theo luật mục E, JSON
  quickmatch.ts      (mới)           trận ngầm toàn agent (dùng cho giải và agent.test)
  store.ts           (mới)           localStorage có tiền tố fanroc.v1.*, an toàn
  trail.ts           (mới)           vệt con rùa + số đo (m, độ, s)
  missions/types.ts  (mới)           kiểu Mission, RunRecord, GradeResult
  missions/data.ts   (mới)           12 nhiệm vụ (bảng 6.3 của spec)
  missions/grade.ts  (mới)           bộ chấm ⭐
  procedures.ts      (mới)           hộp thoại "Tạo khối của em" + chuyên mục hộp công cụ
  game.ts            (mới)           GameSession: dựng trận, bước vật lý, tạm dừng / từng khối, ghế lái
  main.ts                            chỉ còn: tải trang, router màn hình
  ui/icons.ts        (mới)           bộ biểu tượng SVG
  ui/shell.ts        (mới)           Activity Bar, Side Bar, Panel đáy, thanh chạy nổi, thanh trạng thái
  ui/scoreboard.ts   (mới)           bảng điểm Đỏ | chung | Xanh, đếm ngược, báo điểm nổi, màn kết quả, âm thanh
  ui/settings.ts     (mới)           khung ⚙ (camera, đồ hoạ, phím, chế độ, Nâng cao)
  ui/home.ts         (mới)           màn chính + chọn robot
  ui/workshop.ts     (mới)           Xưởng lập trình
  ui/missions.ts     (mới)           màn ① danh sách + màn ② làm nhiệm vụ
  ui/tournament.ts   (mới)           ghi danh, thử phím, Pit / bảng xếp hạng, bục trao giải
  view/scene.ts                      + vẽ vệt / đường gợi ý; camera mặc định theo màn
  view/hud.ts                        bỏ phần cột phải; giữ clockText, deadZoneLines (dùng lại)
  human.ts                           bỏ KEYMAP
scripts/fanroc-e2e.mjs               viết lại theo giao diện mới
```

---

### Task 1: Spike — Khối của em (procedures) chạy, xuất .tb, mở lại

Mục đích: chứng minh chặng 2 làm được trước khi xây giao diện. **Nếu bước 2 hoặc 4 không đạt sau khi đã thử hợp lý ⇒ dừng, báo controller (kế hoạch hỏng cho chặng 2).**

**Files:**
- Create: `src/fanroc/procedures.ts`, `src/fanroc/procedures.test.ts`
- Modify: `src/fanroc/programs.ts` (thêm chuyên mục vào `TOOLBOX` / `TOOLBOX_OPCODES`)

**Interfaces:**
- Consumes: `generate(state)` và `Session` từ `src/fanroc/headless.ts`; `toProject(state)` từ `tb.ts`.
- Produces:
  - `MY_BLOCKS_CATEGORY` — chuyên mục `{ kind: 'category', name: 'Khối của em', colour: '#FF6680', secondaryColour: '#FF4D6A', custom: 'PROCEDURE' }`, nối vào cuối `TOOLBOX.contents`; `TOOLBOX_OPCODES` thêm `procedures_definition`, `procedures_prototype`, `procedures_call`, `argument_reporter_string_number`.
  - `installMakeBlockDialog(workspace: WorkspaceSvg, open: (d: MakeBlockDraft) => Promise<MakeBlockDraft | null>): void` — gắn vào cơ chế "Make a Block…" của scratch-blocks (tìm callback ngoài của procedures trong `packages/scratch-blocks/src`; scratch-gui đặt nó cho hộp thoại riêng).
  - `type MakeBlockDraft = { name: string; params: string[] }` (chỉ tham số số).
  - `procedureState(name: string, params: string[], body: object[]): object` — dựng JSON workspace (định nghĩa + prototype) để phép thử và dữ liệu nhiệm vụ dùng.
  - `openMakeBlockDialog(host: HTMLElement): (d: MakeBlockDraft) => Promise<MakeBlockDraft | null>` — hộp thoại DOM tiếng Việt: ô "Tên khối", nút "+ Thêm ô số", danh sách tham số (đổi tên / xoá), "Tạo khối" / "Huỷ", Esc = Huỷ.

- [ ] **Step 1: Write the failing test** (`procedures.test.ts`)

```ts
test('khối của em có tham số số chạy trên bo ảo: tiến(1) đặt M1 = M2 = 60 rồi đợi 1 s', () => {
  const state = procedureState('tiến', ['mét'], /* thân: setMotor 1 fwd 60, setMotor 2 fwd 60, wait (mét) */ ...)
  // + chồng `event_whenarduinobegin` gọi procedures_call "tiến %n" với 1
  const { sim, error } = generate(state)
  assert.equal(error, undefined)
  const s = new Session(sim, { now: () => 0 })
  s.running = true
  const a = s.tick(500)            // 0,5 s: động cơ đang chạy
  assert.ok(decodePorts(a.pwm).M1 === 60 && decodePorts(a.pwm).M2 === 60)
})
test('khối của em xuất .tb và mở lại giữ nguyên định nghĩa + lời gọi', () => {
  const p = toProject(state)
  const blocks = Object.values(p.targets[1].blocks).map((b: any) => b.opcode)
  for (const op of ['procedures_definition', 'procedures_prototype', 'procedures_call']) assert.ok(blocks.includes(op), op)
})
test('TOOLBOX có chuyên mục Khối của em', () => {
  assert.ok(TOOLBOX.contents.some((c: any) => c.custom === 'PROCEDURE' && c.name === 'Khối của em'))
})
```
(Lưu ý: `tick` cần đồng hồ thật giả lập — dùng `now` tiêm vào nếu cần, xem `session.ts`.)

- [ ] **Step 2: Run test to verify it fails** — `node --test src/fanroc/procedures.test.ts` ⇒ FAIL (`procedureState` chưa có).
- [ ] **Step 3: Implement** `procedureState`, `MY_BLOCKS_CATEGORY`, `installMakeBlockDialog`, `openMakeBlockDialog`. Thử cả "mở lại": nạp JSON workspace có procedures vào `createBlocks` trên trang dev, bấm "Tạo khối", kéo khối vừa tạo ra, ▶ chạy, ⬇ tải `.tb` — ghi kết quả thủ công (ảnh chụp hoặc mô tả) vào báo cáo task.
- [ ] **Step 4: Run tests** — `npm run test:unit` + `npm run typecheck` ⇒ PASS.
- [ ] **Step 5: Commit** — `fanroc: khối của em (procedures) + hộp thoại tạo khối tiếng Việt`

### Task 2: Spike — Tạm dừng / chạy từng khối qua worker dùng chung

**Files:**
- Modify: `src/sim-worker.ts`, `src/fanroc/link.ts`
- Test: `src/fanroc/link.test.ts`, `src/fanroc/stepper.test.ts` (mới)

**Interfaces:**
- `Command` thêm `| { type: 'pause' } | { type: 'step' }`. Worker:
  - `pause`: dừng `setInterval`, giữ `session`, `session.running = false`, gửi một snapshot.
  - `step`: chạy tới khi `snapshot.block` khác khối lúc bắt đầu hoặc chương trình dừng, tối đa 5 s thời gian ảo; dùng `session.running = true` + `session.tick(…)` từng lát 16 ms giả (không chờ đồng hồ thật), rồi `running = false`, gửi snapshot. (`Session.step()` của thingblock-sim chạy một câu lệnh, với khối `đợi` nó không cho thời gian ảo trôi — vì vậy dùng vòng tick.)
  - `run` sau `pause` chạy tiếp (đã đúng: `timer ??= setInterval`).
  - Lệnh cũ giữ nguyên ngữ nghĩa.
- Đặt logic "chạy tới khối kế" thành hàm thuần xuất từ tệp mới `src/fanroc/stepper.ts`: `stepToNextBlock(s: Session, maxVirtualMs = 5000, sliceMs = 16): Snapshot` — worker import nó (worker đã import thingblock-sim; import thêm một tệp fanroc là chấp nhận được vì Vite đóng gói chung; nếu không muốn worker phụ thuộc thư mục fanroc thì đặt `src/sim-step.ts` — implementer chọn, ghi ruling).
- `RobotLink`: `LinkState` thêm `'paused'`; `pause(): void` (chỉ khi `running`), `resume(): void` (`paused` → `running`, gửi `run`), `step(): void` (`running | paused | loaded` → gửi `step`, state `paused`); `block: string | undefined` (từ snapshot mới nhất); `serial: string` (cộng dồn `snapshot.serial`, cắt 20 000 ký tự cuối); `virtualT: number` (`snapshot.t` µs). `ports()` trả cổng thật khi `running` **hoặc** `paused` (robot giữ lệnh cuối; trang quyết định có chạy vật lý không).

- [ ] **Step 1: Failing tests**
  - `stepper.test.ts`: chương trình `M1 fwd 60; wait 1; M1 fwd 0` ⇒ `stepToNextBlock` lần 1 tới khối wait (t ≈ 0), lần 2 qua khối wait: `t` tăng 1 000 000 µs ± 20 000, lần 3: M1 = 0.
  - `link.test.ts`: `pause()` gửi `{type:'pause'}` và state `paused`; `resume()` gửi `run`; `step()` gửi `step`; `ports()` khi `paused` ≠ NEUTRAL nếu pwm có; snapshot cộng dồn `serial`; lệnh `pause` khi `idle` không gửi gì.
- [ ] **Step 2:** chạy ⇒ FAIL.
- [ ] **Step 3:** cài đặt.
- [ ] **Step 4:** `npm run test:unit`, `npm run typecheck`, **`npm run smoke`** ⇒ PASS (bài học robot.edu.vn không đổi).
- [ ] **Step 5: Commit** — `sim-worker: thêm lệnh pause/step (cộng thêm); RobotLink tạm dừng, từng khối, serial`

### Task 3: Bàn phím → tay PS2 ảo

**Files:** Create `src/fanroc/keys.ts`, `src/fanroc/keys.test.ts`

**Interfaces:**
- `type KeyLayout = 'solo' | 'left' | 'right'`
- `KEY_TABLE: Record<KeyLayout, { drive: Record<'up'|'down'|'left'|'right'|'strafeL'|'strafeR', string[]>; buttons: Record<string, string> }>` — `KeyboardEvent.code`, giá trị đúng spec:
  - solo: chạy `KeyW/ArrowUp`, `KeyS/ArrowDown`, `KeyA/ArrowLeft`, `KeyD/ArrowRight`; ngang `KeyQ`/`KeyE`; nút `KeyI`=TRIANGLE, `KeyK`=CROSS, `KeyJ`=SQUARE, `KeyL`=CIRCLE, `KeyU`=L1, `KeyO`=R1, `KeyY`=L2, `KeyP`=R2.
  - left: `KeyW/S/A/D`, ngang `KeyQ/KeyE`; `KeyR`=TRIANGLE, `KeyF`=CROSS, `KeyC`=SQUARE, `KeyV`=CIRCLE, `Digit1..4`=L1/R1/L2/R2.
  - right: mũi tên, ngang `Comma`/`Period`; `KeyI/K/J/L` như solo; `KeyU/O/Y/P` = L1/R1/L2/R2.
- `class KeyPad { constructor(layout: KeyLayout); down(code: string): boolean /* true nếu phím thuộc bảng */; up(code: string): void; releaseAll(): void; state(drive: Drive): Ps2State /* đủ mọi khoá như PS2_NEUTRAL */; active(): boolean }`
- `mergePad(real: Ps2State | null, virt: Ps2State): Ps2State` — tay thật thắng khi có cần ngoài 120…136 hoặc có nút = 1; ngược lại dùng `virt`.
- Ánh xạ trộn (spec §8.4): diff2 — W ⇒ LY = RY = 0; S ⇒ 255/255; A ⇒ LY = 255, RY = 0; D ⇒ LY = 0, RY = 255; W+A ⇒ LY = 128, RY = 0; W+D ⇒ LY = 0, RY = 128; S+A ⇒ LY = 255, RY = 128; S+D ⇒ LY = 128, RY = 255. omni/mecanum — W/S ⇒ LY 0/255, A/D ⇒ RX 0/255, Q/E ⇒ LX 0/255. Nhả = 128.

- [ ] **Step 1: Failing tests** — mỗi dòng ánh xạ trên một `assert.equal`; `releaseAll()` ⇒ `state()` deepEqual `PS2_NEUTRAL` (Review Focus 1); layout `left` không nhận `ArrowUp`, `right` không nhận `KeyW`; `mergePad` với tay thật trung tính (128, nút 0) ⇒ trả `virt`, tay thật LY = 0 ⇒ trả tay thật; nút ảo I ⇒ `ps2_PSB_TRIANGLE` = 1.
- [ ] **Step 2–4:** FAIL → cài → `npm run test:unit` PASS.
- [ ] **Step 5: Commit** — `fanroc: bàn phím làm tay PS2 ảo (một bạn / chia đôi bàn phím)`

### Task 4: Chia phần Đỏ / Xanh của điểm chung

**Files:** Modify `src/fanroc/scoring.ts`; Test `src/fanroc/scoring.test.ts`

**Interfaces:**
- `allianceShare(t: FieldTally): Record<Alliance, { park: number; bonus: number }>` — park = 5/10 mỗi robot (một phần / toàn phần), bonus = 10 khi cả 2 robot toàn phần. Tổng `park + bonus` hai bên = `scoreTally(t).park` (bất biến).
- `scoreTally` không đổi hành vi (có thể gọi `allianceShare` bên trong).

- [ ] **Step 1: Failing test** — ví dụ 2 của luật: Đỏ 2 robot toàn phần ⇒ `{park: 20, bonus: 10}`, Xanh không đỗ ⇒ `{0, 0}`; ví dụ 1: Đỏ full + partial ⇒ `{15, 0}`, Xanh full ⇒ `{10, 0}`; bất biến tổng bằng `scoreTally().park` trên cả hai ví dụ.
- [ ] **Step 2–4.** **Step 5: Commit** — `fanroc: chia phần đỗ xe Đỏ/Xanh cho bảng điểm`

### Task 5: Giải đấu (thuần)

**Files:** Create `src/fanroc/tournament.ts`, `src/fanroc/tournament.test.ts`

**Interfaces:**
```ts
export type Entrant = { id: string; name: string; kind: 'player' | 'machine'; robot: RobotConfig; skill?: Skill; player?: 0 | 1 }
export type Slot = { red: [string, string]; blue: [string, string] }      // id đội
export type Played = { teams: Record<string, { score: number; penalty: number }>; matchScore: number }
export interface TournamentState { version: 1; seed: number; perTeam: number; entrants: Entrant[]; schedule: Slot[]; results: (Played | null)[] }
export function createTournament(o: { players: Omit<Entrant, 'id' | 'kind'>[]; perTeam: number; seed: number }): TournamentState
export function nextMatch(s: TournamentState): number | null        // chỉ số trận đầu tiên chưa có kết quả
export function record(s: TournamentState, i: number, p: Played): TournamentState   // bất biến (trả bản mới)
export type Standing = { id: string; rank: number; total: number; best: number; penalty: number; counted: number[]; tieDraw: boolean }
export function standings(s: TournamentState): Standing[]
export const MACHINE_TEAMS: { name: string; skill: Skill; robot: RobotType }[]   // 6 đội máy có tên tiếng Việt, mức trộn Dễ/Vừa/Khó
```
- Tổng **8 đội** (1–2 người chơi + máy cho đủ). `perTeam` ∈ 4…10 (ngoài khoảng ⇒ throw). Lịch: mỗi đội đúng `perTeam` trận ⇒ `2·perTeam` trận; mỗi trận 4 đội khác nhau, chia ngẫu nhiên theo `mulberry32(seed)` vào Đỏ/Xanh. Hai người chơi có thể cùng hay khác liên minh, không ép.
- Xếp hạng (luật mục E): tổng điểm đội các trận (đã trừ phạt); số trận lệch ⇒ chuẩn = ít nhất, đội nhiều trận bỏ trận thấp nhất; bằng điểm xét `best` (trận cao nhất) rồi `penalty` ít hơn, rồi bốc thăm theo seed (`tieDraw = true` để giao diện ghi "bốc thăm").
- Review Focus 3: trận dở không bao giờ có trong `results` — chỉ `record` sau khi trận kết thúc; `nextMatch` trả lại trận đó sau khi tải lại.

- [ ] **Step 1: Failing tests**
  - lịch: 8 đội × perTeam 4 ⇒ 8 trận, mỗi đội xuất hiện đúng 4 lần, không trận nào trùng đội; cùng seed ⇒ cùng lịch.
  - ví dụ 1 luật: A 180+210+299+240 = 929 hạng 1; C 190+280+230+200 = 900 trên B 200+250+190+260 = 900 (best 280 > 260).
  - ví dụ 2 luật: D 5 trận 150,220,90,260,180, chuẩn 4 ⇒ 810 (bỏ 90).
  - bằng cả best ⇒ ít phạt hơn xếp trên.
  - `nextMatch` sau 3 `record` = 3; JSON.parse(JSON.stringify(s)) dùng lại được.
  - `perTeam` 3 hoặc 11 ⇒ throw.
- [ ] **Step 2–4.** **Step 5: Commit** — `fanroc: giải đấu — lịch bốc thăm, xếp hạng theo luật mục E`

### Task 6: Trận ngầm toàn agent

**Files:** Create `src/fanroc/quickmatch.ts`; Modify `src/fanroc/agent.test.ts` (dùng hàm mới thay `play` nội bộ); Test `src/fanroc/quickmatch.test.ts`

**Interfaces:**
- `playAgents(o: { cfgs: RobotConfig[4]; skills: Skill[4]; teams: string[4]; seed: number }): Promise<{ match: number; teams: { team: string; score: number; penalty: number }[]; tally: FieldTally }>` — thứ tự robot theo `SEATS` của trang: [Đỏ 0, Xanh 0, Đỏ 1, Xanh 1]. Giải phóng `world.rapier.free()` khi xong. `penalty` = `5·minor + 10·yellow` (đỏ ⇒ = điểm trận).
- [ ] **Step 1: Failing test** — cùng seed chạy 2 lần ra cùng `match`; `teams[i].score === teamScore(match, pens[i])`; trận xong dưới 60 s (đo, như R5).
- [ ] **Step 2–4** (`npm run test:unit` — agent.test vẫn xanh với số cũ 416,7 / 621,0 / 891,7 ± 0 vì cùng vòng lặp). **Step 5: Commit** — `fanroc: tách trận ngầm toàn agent dùng chung`

### Task 7: Lưu trữ an toàn

**Files:** Create `src/fanroc/store.ts`, `src/fanroc/store.test.ts`

**Interfaces:**
```ts
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const KEYS = { settings: 'fanroc.v1.settings', missions: 'fanroc.v1.missions', workshop: 'fanroc.v1.workshop', tournament: 'fanroc.v1.tournament', profile: 'fanroc.v1.profile' } as const
export function createStore(kv?: KV | null): Store   // mặc định globalThis.localStorage trong try/catch
export interface Store {
  settings(): Settings; saveSettings(s: Settings): void
  mission(id: string): MissionProgress; saveMission(id: string, p: MissionProgress): void
  program(player: 0 | 1, cfg: RobotConfig): { version: number; state: object } | null   // khoá theo `${type}/${drive}/${actuator}`
  saveProgram(player: 0 | 1, cfg: RobotConfig, state: object): number                     // trả version mới (1, 2, …)
  resetProgram(player: 0 | 1, cfg: RobotConfig): void
  tournament(): TournamentState | null | 'corrupt'; saveTournament(s: TournamentState | null): void
  profile(): { names: [string, string]; stars: number }; saveProfile(p): void
}
export type Settings = { quality?: Quality;   // camera không lưu (spec §8.7)
  sound: boolean; skill: Skill; alliance: Alliance; robot: RobotConfig; layout2p: boolean }
export type MissionProgress = { done: boolean; stars: 0 | 1 | 2 | 3; program: object | null }
```
- [ ] **Step 1: Failing tests** — KV ném lỗi ở mọi lệnh ⇒ mọi hàm trả mặc định, không ném (Review Focus 2); JSON sai dạng ⇒ mặc định, `tournament()` ⇒ `'corrupt'`; `saveProgram` hai lần ⇒ version 1 rồi 2; `program(0, {type:'ui',…})` khi chỉ lưu cho `maker` ⇒ `null` (Review Focus 5); người chơi 0 và 1 tách biệt.
- [ ] **Step 2–4.** **Step 5: Commit** — `fanroc: lưu tiến độ, chương trình, giải vào localStorage an toàn`

### Task 8: Vệt con rùa + số đo

**Files:** Create `src/fanroc/trail.ts`, `src/fanroc/trail.test.ts`

**Interfaces:**
- `class Trail { add(t: number, pose: Pose, ports: PortValues): void; clear(): void; readonly segments: { color: number; points: { x: number; z: number }[] }[]; readonly distance: number /* m, cộng dồn quãng tâm robot */; readonly turned: number /* độ, cộng dồn |Δyaw| */; readonly time: number /* s kể từ điểm đầu */ }`
- Đoạn mới khi bộ (M1, M2, M3, M4) khác bước trước; `color` = chỉ số xoay vòng 0…5 (`TRAIL_COLORS` 6 màu xuất ra để scene dùng). Bỏ điểm cách điểm trước < 5 mm (giữ vệt gọn).
- [ ] **Step 1: Failing tests** — đổi ports 3 lần ⇒ 4 đoạn, màu 0,1,2,3; đi 1 m thẳng ⇒ `distance` 1 ± 0,001; quay +π/2 rồi −π/2 ⇒ `turned` 180; **lặp lại (spec §8.2)**: headless `FanrocWorld` sân không bóng (Task 10 thêm cờ; ở task này dùng world bình thường trước khi xả bóng — `t < 0` không xả) + `RobotBody` Maker diff2, M1 = M2 = 60 trong 1 s, 5 lần ⇒ các `distance` lệch nhau ≤ 0,01 m. Nếu không đạt: ghi ruling, làm tròn số đo tới cm ở giao diện, gợi ý nhiệm vụ 4 thêm "đo vài lần".
- [ ] **Step 2–4.** **Step 5: Commit** — `fanroc: vệt con rùa và số đo quãng, góc, thời gian`

### Task 9: 12 nhiệm vụ + bộ chấm ⭐

**Files:** Create `src/fanroc/missions/types.ts`, `missions/data.ts`, `missions/grade.ts`, `missions/grade.test.ts`

**Interfaces:**
```ts
export interface Mission {
  id: string; stage: 1 | 2 | 3 | 4; n: number; title: string; goal: string
  robot: RobotConfig; start: Pose; balls: boolean
  toolbox: object; starter: object | null; guide: string[]          // các bước HƯỚNG DẪN
  path?: { x: number; z: number }[]                                  // đường gợi ý nét đứt
  kind: 'drive' | 'program' | 'match'
  goals: Goal[]
  hints: { when: HintWhen; text: string }[]
}
export type Goal =
  | { type: 'reach'; rect: Rect } | { type: 'return'; tol: number } | { type: 'noMountain' }
  | { type: 'measure'; what: 'distance' | 'turned' } | { type: 'uses'; opcodes: string[] }
  | { type: 'flag'; mountain: number } | { type: 'park' } | { type: 'fireClear'; max: number } | { type: 'matchEnd' }
export type RunRecord = { start: Pose; end: Pose; trail: { distance: number; turned: number; time: number }; touchedMountain: boolean; events: MatchEvent[]; tally?: FieldTally; program: object | null }
export type GradeResult = { done: boolean; stars: 0 | 1 | 2 | 3; goals: { text: string; ok: boolean }[]; hint: string | null }
export function grade(m: Mission, r: RunRecord): GradeResult
export const MISSIONS: Mission[]   // 12 phần tử, đúng bảng 6.3 spec (chặng 1 Hai bánh xe 1–4, chặng 2 Con rùa robot 5–8, chặng 3 Việc trên sân 9–11, chặng 4 Thi đấu 12)
```
- Sao (spec §8.3): nhiệm vụ "khép vòng" (7, 8): ⭐ sai số vị trí cuối ≤ 0,15 m, ⭐⭐ ≤ 0,07 m, ⭐⭐⭐ = ⭐⭐ + chương trình có `control_repeat` **và** `procedures_call` có ít nhất một tham số (đọc bằng `blockTypes` / duyệt JSON). Hướng cuối không chấm ở chặng 2. Nhiệm vụ khác: ⭐ đạt mọi goal, ⭐⭐ và ⭐⭐⭐ theo điều kiện riêng ghi trong `data.ts` (builder chọn, spec §9) — mỗi nhiệm vụ phải đạt được 3 sao.
- Nhiệm vụ 1–8: `balls: false`; robot Mẫu Maker 2 bánh (M1 trái, M2 phải). Nhiệm vụ 10 dùng `holeCentres()` và sự kiện cắm cờ của `match`. Nhiệm vụ 8 có `starter` là chương trình sai (vệt không khép).
- Gợi ý theo tình huống, ví dụ "Còn hụt {d} cm — thử tăng thời gian đợi?", "Robot quay quá — 90° cần ít thời gian hơn". Câu chữ có `{d}` được thay số.
- [ ] **Step 1: Failing tests** — `MISSIONS.length === 12`, id duy nhất, chặng đúng bảng; nhiệm vụ 7: end cách start 0,10 m ⇒ 1 sao, 0,05 m ⇒ 2 sao, 0,05 m + program có repeat + procedures_call(1 tham số) ⇒ 3 sao, 0,20 m ⇒ `done=false` và hint chứa "20 cm"; mọi `toolbox` chỉ chứa opcode trong `TOOLBOX_OPCODES` (không khối mới); mỗi `starter` sinh mã không lỗi (`generate`). Nhiệm vụ 7 có **lời giải mẫu** trong test chạy headless (Session + RobotBody, sân không bóng) và đạt ≥ 2 sao — chứng minh giải được.
- [ ] **Step 2–4.** **Step 5: Commit** — `fanroc: 12 nhiệm vụ con rùa và bộ chấm sao`

### Task 10: GameSession — vòng lặp trận tách khỏi main.ts

**Files:** Create `src/fanroc/game.ts`, `src/fanroc/game.test.ts`; Modify `src/fanroc/world.ts` (tuỳ chọn không xả bóng), `src/fanroc/main.ts`, `src/fanroc/human.ts` (bỏ `KEYMAP`), `src/fanroc/human.test.ts` (viết lại phần phím theo chế độ tự động, giữ P04–P07)

**Interfaces:**
- `FanrocWorld.create(seed: number, opts?: { balls?: boolean })` — `balls: false` ⇒ không có bóng, `release` không làm gì (ngoại lệ lõi được phép, spec §8.6).
```ts
export type Driver =
  | { kind: 'program'; link: RobotLink }                 // chương trình khối (Xưởng / nhiệm vụ / mặc định)
  | { kind: 'agent'; skill: Skill }
export type SeatSpec = { cfg: RobotConfig; team: string; driver: Driver }
export type GameMode = 'match' | 'practice' | 'mission'
export class GameSession {
  static create(o: { mode: GameMode; seats: SeatSpec[4]; seed: number; balls?: boolean; start?: Pose /* mission: ghế 0 */ }): Promise<GameSession>
  readonly world: FanrocWorld; readonly robots: RobotBody[]; readonly match: Match; readonly ports: PortValues[]
  paused: boolean
  /** Chạy vật lý theo thời gian thực `dtReal` × tốc độ; trả số bước đã chạy. Không chạy khi paused. */
  advance(dtReal: number, speed: number): number
  /** Chạy từng khối: gửi step cho mọi link 'program', rồi chạy vật lý đúng bằng thời gian ảo worker đã đi (Δ virtualT), tối đa 5 s. */
  stepBlock(): Promise<void>
  pause(): void; resume(): void
  onStep?: (g: GameSession) => void     // nhiệm vụ: ghi vệt
  dispose(): void                        // dừng link, free Rapier
}
```
- Thứ tự ghế: [Đỏ 0, Xanh 0, Đỏ 1, Xanh 1] như `SEATS` cũ. Mode `match`: chương trình chạy khi hết 10 s; `practice`: tua xả bóng (R31), không hết giờ; `mission`: không xả bóng (`balls: false` theo nhiệm vụ), ghế 1–3 trống — robot không được tạo (thêm `Match` chấp nhận ít hơn 4 robot, hoặc đặt 3 robot ngoài sân và loại khỏi va chạm — implementer chọn cách nhỏ nhất, ghi ruling).
- `pause()`: `paused = true`, `link.pause()` mọi link; Human Player / agent / đồng hồ trận đứng vì `advance` không gọi `match.step`.
- `main.ts` chỉ còn khởi tạo và router (Task 11 dựng shell); trong task này trang vẫn chạy được với giao diện cũ tối thiểu dùng `GameSession` (để `e2e` cũ E1–E6 còn chạy được tới Task 16 viết lại — nếu E5 Human Player phím hỏng do bỏ KEYMAP thì đánh dấu skip có ghi chú).
- [ ] **Step 1: Failing tests** (`game.test.ts`, headless, link giả trả pwm cố định)
  - mode `match`, 4 agent: `pause()` rồi `advance(1, 1)` ⇒ `match.t` không đổi, tư thế robot không đổi; `resume()` + `advance(1,1)` ⇒ `match.t` tăng 1 ± 1/60 (Review Focus 4).
  - mode `mission`, `balls: false` ⇒ `world.balls.length === 0`, robot ghế 0 ở `start`.
  - `stepBlock` với link giả báo Δ virtualT = 1 000 000 µs ⇒ vật lý chạy 60 bước ± 1.
  - `FanrocWorld.create(1, { balls: false })` rồi `release(20)` không ném.
- [ ] **Step 2–4** (`npm run test:unit`, `npm run typecheck`). **Step 5: Commit** — `fanroc: GameSession tách vòng lặp trận, tạm dừng, từng khối; sân không bóng; bỏ phím Human Player`

### Task 11: Vỏ kiểu VS Code + biểu tượng

**Files:** Create `src/fanroc/ui/icons.ts`, `src/fanroc/ui/shell.ts`; Modify `fanroc.html`, `src/fanroc/main.ts`, `src/fanroc/editor.ts` (tách thanh nút cũ khỏi thẻ: robot mẫu / đế / cơ cấu chuyển sang ⚙ và Xưởng; ▶ ■ chuyển lên thanh chạy nổi)

**Interfaces:**
- `icons.ts`: `icon(name: IconName, size = 20): SVGSVGElement`, `IconName = 'blocks' | 'code' | 'serial' | 'missions' | 'trophy' | 'settings' | 'play' | 'pause' | 'stepOver' | 'stop' | 'reset' | 'download' | 'camera' | 'home' | 'sound' | 'mute' | 'keyboard' | 'gamepad' | 'star' | 'check'`. Đường SVG tự vẽ kiểu Lucide (stroke 2, round), không tải từ mạng.
- `shell.ts`:
```ts
export interface Shell {
  readonly stage: HTMLElement            // chỗ đặt sân 3D (luôn chiếm phần còn lại)
  readonly side: Record<'blocks' | 'code' | 'missions', HTMLElement>
  readonly panel: Record<'serial' | 'events', HTMLElement>
  open(view: 'blocks' | 'code' | 'missions' | null): void   // bấm lại biểu tượng đang sáng ⇒ null
  setPanel(open: boolean, tab?: 'serial' | 'events'): void
  badge(view: 'serial', n: number): void                    // số đỏ trên biểu tượng
  runbar(h: { run(): void; pause(): void; step(): void; stop(): void; reset(): void; download(): void; camera(): void }, state: LinkState | 'none'): void
  status(s: { robot: string; input: 'Bàn phím' | 'Tay PS2' | 'Chương trình' | 'Máy'; ports: PortValues; block: string | null; fps: number }): void
  activity(items: ('blocks' | 'code' | 'serial' | 'missions' | 'trophy')[]): void          // màn nào hiện biểu tượng nào
  onSettings(cb: () => void): void; onHome(cb: () => void): void
}
export function createShell(root: HTMLElement): Shell
```
- Kích thước: Activity Bar 48 px; Khối mặc định 40 % (kéo mép đổi, 280 px…70 %); Mã Arduino 24 %, chỉ xem, tô màu cú pháp tối thiểu (từ khoá / số / chú thích) bằng CSS; Panel đáy thu = 28 px, mở = 160 px. Thanh trạng thái 24 px màu `#007acc`. Thanh chạy nổi giữa trên sân, dưới bảng điểm; nút có `title` + `aria-label` tiếng Việt: "Chạy", "Tạm dừng", "Chạy từng khối", "Dừng", "Về chỗ cũ", "Tải .tb để nạp ThingBot", "Đổi góc camera". < 900 px: Side Bar phủ lên sân.
- Khối đang chạy: `blocks.highlight(link.block)` mỗi khung khi `running | paused`; thanh trạng thái `blocks.describe(link.block)`.
- Serial: nối `link.serial` vào Panel "Serial"; dòng mới khi panel đóng ⇒ `badge('serial', n)`.
- [ ] **Step 1:** thêm E-test mới vào `scripts/fanroc-e2e.mjs` (giữ cũ, đánh dấu cái nào hỏng vì giao diện): **N1** tiêu đề `ThingBot FanRoc Game`; bấm biểu tượng Khối ⇒ side Khối hiện, bấm lại ⇒ ẩn và `#stage` rộng ≥ 90 % cửa sổ trừ 48 px; panel đáy mặc định cao ≤ 30 px; không có emoji trong `button` (regex `\p{Extended_Pictographic}`).
- [ ] **Step 2:** `npm run e2e:fanroc -- N1` ⇒ FAIL.
- [ ] **Step 3:** cài đặt. **Step 4:** N1 PASS, `npm run typecheck`. **Step 5: Commit** — `fanroc: vỏ giao diện kiểu VS Code, bộ biểu tượng, thanh chạy nổi, tô sáng khối đang chạy`

### Task 12: Bảng điểm Đỏ | chung | Xanh, đếm ngược, báo điểm, màn kết quả, âm thanh

**Files:** Create `src/fanroc/ui/scoreboard.ts`, `src/fanroc/ui/scoreboard.test.ts` (phần thuần); Modify `src/fanroc/view/hud.ts` (giữ `clockText`, `deadZoneLines`, bỏ cột phải)

**Interfaces:**
- Thuần (test Node): `scoreLine(match: Match, robots: RobotBody[]): { red: AllianceLine; blue: AllianceLine; total: number; clock: string; phase: 'XẢ BÓNG' | 'ĐIỀU KHIỂN' | 'VỀ VÙNG BẢO VỆ' | 'HẾT GIỜ' | 'LUYỆN TẬP' }`, `AllianceLine = { teams: { name: string; score: number; penalty: number; program: string }[]; park: number; bonus: number }` (dùng `allianceShare`, `teamScore`; tính tối đa 4 lần/giây như `SCORE_HZ`). `scorePops(prev: ScoreBreakdown, next: ScoreBreakdown): string[]` — chữ báo nổi, ví dụ tăng `r3` 15 ⇒ `"+15 · Rãnh 3"`, tăng `fire` ⇒ `"+5 · Chữa Cháy"`, `wrong` giảm ⇒ `"−3 · Bóng sai chỗ"`.
- DOM: `createScoreboard(stage: HTMLElement): { update(line, pops): void; countdown(n: 3 | 2 | 1 | 0): void /* 0 = "BẮT ĐẦU!" */; result(r: ResultView, actions: { again(): void; home(): void; next?(): void }): void; hideResult(): void }`.
- Ô Đỏ trái, ô Xanh phải, giữa = điểm trận chung to + đồng hồ + pha. Mỗi ô liên minh: tên 2 đội + nhãn chương trình ("Mặc định" / "Của em v3" / "Máy Vừa"), điểm đỗ + thưởng, điểm phạt, điểm đội.
- Đếm ngược 3 · 2 · 1 · BẮT ĐẦU! ở 3 s cuối của 10 s khởi động (t = −3, −2, −1, 0). Mỗi lần ghi điểm báo nổi 1,5 s.
- Âm thanh: WebAudio tự tạo (không tệp): còi bắt đầu / hết giờ, "ting" khi ghi điểm; tắt/bật theo `settings.sound` (mặc định bật).
- Màn kết quả: điểm trận chung to giữa, hai cột Đỏ / Xanh (đội, điểm đội, phạt), bảng mục (Chữa Cháy, Rãnh 1–3, Sai vị trí, Cờ, Vùng Bảo Vệ — lấy `match.result()`), nút **Chơi lại** / **Về màn chính** (+ **Trận kế tiếp** trong giải).
- [ ] **Step 1: Failing tests** (Node) — `scorePops` ba trường hợp trên; `scoreLine` trên trận headless ngắn: `red.park + red.bonus + blue.park + blue.bonus === result().score.park`; điểm đội = `teamScore`.
- [ ] **Step 2–4** + E-test **N2**: trận ×40 4 agent ⇒ màn kết quả có 3 vùng `[data-side=red]`, `[data-side=total]`, `[data-side=blue]`; tổng điểm hiện bằng `__fanroc.match.result().score.total`. **Step 5: Commit** — `fanroc: bảng điểm Đỏ | chung | Xanh, đếm ngược, báo điểm nổi, màn kết quả, âm thanh`

### Task 13: Màn chính, ⚙ Cài đặt, lái bàn phím, Xưởng lập trình

**Files:** Create `src/fanroc/ui/home.ts`, `src/fanroc/ui/settings.ts`, `src/fanroc/ui/workshop.ts`; Modify `src/fanroc/main.ts` (router), `src/fanroc/view/scene.ts` (camera mặc định theo màn)

**Interfaces / hành vi:**
- Router: `type Screen = 'home' | 'match' | 'practice' | 'workshop' | 'missions' | 'mission' | 'tournament'`; `go(screen, arg?)`; mở trang ⇒ `home`.
- **Màn chính** (bản phác v4b): nền sân 3D quay chậm (camera quỹ đạo), dòng "robot của em · chương trình: Mặc định / Của em vN", 4 ô: **Giải đấu** (to nhất, chọn sẵn, Enter vào) · **Trận lẻ · Đấu tập** · **Nhiệm vụ** (x/12 ✓) · **Xưởng lập trình**. Phím mũi tên đổi ô.
- **Trước trận** (Trận lẻ / Đấu tập): thẻ robot như chọn đội — thanh Tốc độ (`V_MAX` theo đế), Chứa bóng (`storage`/10), Cắm cờ (`flag` + `arm.reach`) lấy từ `ROBOTS`; nhãn chương trình; chọn liên minh và mức máy; robot của em ghế [Đỏ 0] hoặc [Xanh 0], 3 ghế còn lại agent.
- **Lái**: robot của em dùng `Driver.program` với chương trình `store.program(0, cfg)` hoặc Mặc định `sample(cfg, 'teleop')`; tay PS2 ảo = `mergePad(pads[0], keypad.state(cfg.drive))` đưa vào `link.input`. Không nhận phím khi `typing(e.target)`; `blur` / `visibilitychange` ⇒ `keypad.releaseAll()`.
- **⚙ Cài đặt** (khung nổi, Esc / bấm ngoài đóng): Camera (Toàn sân / Theo robot / Ghế lái), Đồ hoạ (Cao / Thấp), Âm thanh, Phím điều khiển (bảng `KEY_TABLE` của bố cục hiện tại + tên chức năng nút với robot đang chọn), và ở trận: Chế độ, Robot của em, Liên minh, Mức máy, Robot của em chạy (Của em / Mặc định), Tốc độ ×1 ×4 ×40 (R24). Mục **Nâng cao** thu gọn: chọn ghế cho Robot 1–4 như R27 cũ (Chương trình / Agent / Chương trình của Robot N).
- **Xưởng lập trình**: Side Bar Khối mở sẵn với chương trình lưu (hoặc Mặc định = `sample(cfg,'teleop')`), sân Đấu tập trống bóng để thử (`practice`, `balls: false`), nút **Lưu cho robot của em** (`store.saveProgram` ⇒ hiện "Đã lưu v{n}"), **Về mặc định** (`resetProgram` + nạp mẫu), ⬇ `.tb`. Chọn người chơi 1 / 2 khi có 2 bạn. Đổi robot / đế ở đây (thanh của thẻ cũ chuyển vào).
- Camera mặc định: trận / đấu tập `follow`, nhiệm vụ `field`; camera không lưu (spec §8.7).
- [ ] **Step 1:** E-test **N3**: màn chính hiện 4 ô, Enter ⇒ vào Giải đấu (màn ghi danh); **N4**: Trận lẻ, giữ phím W 2 s (`page.keyboard.down`) ⇒ robot của em rời ô xuất phát ≥ 0,2 m (chương trình Mặc định); nhả ⇒ dừng trong 0,5 s; `window.dispatchEvent(new Event('blur'))` khi giữ W ⇒ dừng (Review Focus 1); **N5**: ⚙ mở / Esc đóng; **N6**: Xưởng: lưu ⇒ "Đã lưu v1", vào Trận lẻ nhãn "Của em v1"; Về mặc định ⇒ nhãn "Mặc định".
- [ ] **Step 2–4.** **Step 5: Commit** — `fanroc: màn chính kiểu game, cài đặt ⚙, lái bàn phím, Xưởng lập trình`

### Task 14: Màn nhiệm vụ con rùa

**Files:** Create `src/fanroc/ui/missions.ts`; Modify `src/fanroc/view/scene.ts` (vẽ `Trail` + `Mission.path` nét đứt trên sàn, chỉ khi được gọi)

**Interfaces:**
- `scene.trail(segments: Trail['segments'] | null, path?: {x:number;z:number}[]): void` — `null` xoá; vẽ `THREE.Line` sát mặt thảm (y = 0,002), màu `TRAIL_COLORS`, đường gợi ý trắng nét đứt. Màn khác không bao giờ gọi ⇒ không có vệt.
- **Màn ①**: chặng dạng danh sách thẻ (tên "N – …", một câu mục tiêu, thanh độ khó 5 ô, ✓, số ⭐ từ `store.mission`). Không khoá cứng.
- **Màn ②**: `GameSession` mode `mission`; Side Bar Khối mở với `mission.toolbox` + chương trình lưu hoặc `starter`; thẻ thử thách góc dưới trái (mục tiêu tự tích ✓ từ `grade`, gợi ý gỡ lỗi); ô số đo dưới phải (quãng m 2 chữ số, góc độ nguyên, thời gian s 1 chữ số) khi nhiệm vụ có goal `measure`; nút HƯỚNG DẪN mở các bước `guide` trượt từng bước; ↺ xoá vệt + đặt robot về `start`; chấm khi chương trình dừng (link `stopped` sau khi đã chạy) hoặc với `kind: 'drive'` khi bấm "Xong"; đạt ⇒ hiệu ứng sao + lưu `store.saveMission`. Nhiệm vụ 12 (`kind: 'match'`) chuyển sang Trận lẻ với agent Dễ, đạt khi `matchEnd`.
- Mọi chương trình đang làm lưu theo nhiệm vụ mỗi khi workspace đổi (debounce 1 s).
- [ ] **Step 1:** E-test **N7**: mở nhiệm vụ 2, nạp lời giải mẫu qua `__fanroc` (đặt JSON workspace), ▶ ⇒ trong 5 s mục tiêu đầu ✓, `__fanroc.trail.segments.length ≥ 1`; vào Trận lẻ ⇒ `__fanroc.trail` là `null` (không vệt ngoài nhiệm vụ); **N8**: nhiệm vụ 7 với lời giải mẫu đạt ≥ 2 sao, tải lại trang ⇒ thẻ nhiệm vụ 7 vẫn hiện ✓ và số sao.
- [ ] **Step 2–4.** **Step 5: Commit** — `fanroc: màn nhiệm vụ con rùa — vệt, số đo, chấm sao, lưu tiến độ`

### Task 15: Màn giải đấu

**Files:** Create `src/fanroc/ui/tournament.ts`

**Hành vi:**
- **Ghi danh**: số bạn chơi 1 / 2; mỗi bạn: tên (mặc định "Bạn 1"/"Bạn 2", lưu `profile`), robot + đế, chương trình (Của em nếu `store.program(p, cfg)` có, không thì Mặc định — Review Focus 5); số trận mỗi đội 4–10 (mặc định 4). Hiện 6 đội máy (`MACHINE_TEAMS`).
- **Thử phím** (khi 2 bạn): bố cục `left` / `right` hoặc tay PS2 — mỗi bạn bấm, robot của mình nháy sáng trên sân nhỏ; ghi chú "Một số bàn phím không nhận nhiều phím bấm cùng lúc". Một bạn: bố cục `solo`.
- **Lịch** (bốc thăm): danh sách trận, đánh dấu trận có người chơi.
- **Pit** giữa các trận: bảng xếp hạng (`standings`: hạng, đội, điểm các trận, điểm xếp hạng, trận cao nhất; ghi "bốc thăm" khi `tieDraw`); trận kế tiếp với liên minh; nút **Vào Xưởng sửa chương trình** (quay lại Pit sau khi lưu) và **Vào trận ▶**.
- Trận có người chơi: `GameSession` mode `match`, ghế theo `Slot`, robot người chơi `Driver.program` (tay ảo theo bố cục), đội máy `agent`. Hết trận ⇒ màn kết quả (Task 12) có **Trận kế tiếp**, `record` + `saveTournament`.
- Trận toàn máy: `playAgents` chạy ngầm (hiện "Đang chơi các trận máy…"), ghi kết quả ngay; nút **Xem nhanh** chạy lại trận đó ×40 trên sân.
- Hết lịch ⇒ **bục trao giải** hạng 1–3 + bảng xếp hạng đầy đủ + **Giải mới**.
- Tải lại trang: `store.tournament()` có giải dở ⇒ màn chính ô Giải đấu ghi "Đấu tiếp · trận x/y"; `'corrupt'` ⇒ "Không đọc được giải đang dở" + Giải mới (Review Focus 2, 3).
- [ ] **Step 1:** E-test **N9**: giải 1 bạn perTeam 4, tua: các trận máy tự ghi; trận của người chơi chạy ×40 bằng Mặc định cho tới hết ⇒ Pit hiện 8 dòng xếp hạng; tải lại trang giữa trận kế ⇒ "Đấu tiếp", số trận đã ghi không đổi; **N10**: 2 bạn chia đôi bàn phím — giữ `KeyW` chỉ robot bạn 1 chạy, giữ `ArrowUp` chỉ robot bạn 2 chạy.
- [ ] **Step 2–4.** **Step 5: Commit** — `fanroc: giải đấu đúng luật cho 1–2 bạn — ghi danh, thử phím, Pit, bục trao giải`

### Task 16: Kiểm thử đầu-cuối, dọn dẹp, ghi quyết định

**Files:** Modify `scripts/fanroc-e2e.mjs`, `docs/fanroc/quyet-dinh.md`, `docs/superpowers/specs/2026-11-03-fanroc-ui-nhiem-vu-design.md` (chỉ sửa đường dẫn bản phác nếu cần)

- [ ] **Step 1:** Viết lại E1–E10 cũ theo giao diện mới, giữ ý (spec §8.7): trang tải không lỗi console; tay PS2 giả lái được + rút tay ⇒ dừng; chương trình lỗi ⇒ robot dừng, lỗi tiếng Việt ở Side Bar Khối, đồng hồ vẫn chạy; trận ×40 4 agent ⇒ màn kết quả; ⬇ `.tb` giải nén ra `project.json`; 390×844 không cuộn ngang, Side Bar phủ sân; đồ hoạ Thấp ≥ 30 fps; Đấu tập ▶ chạy ngay. Bỏ E5 Human Player phím (đã bỏ tính năng). Giữ N1–N10.
- [ ] **Step 2:** Chạy toàn bộ: `npm run typecheck && npm run test:unit && npm run smoke && npm run e2e:fanroc && npm run build` ⇒ tất cả PASS (dán số phép thử vào báo cáo).
- [ ] **Step 3:** Thêm các quyết định R35… của đợt này vào `docs/fanroc/quyet-dinh.md` (bảng mới "Giao diện game").
- [ ] **Step 4: Commit** — `fanroc: phép thử đầu-cuối giao diện mới, ghi quyết định R35+`

### Task 17: Màn Luật chơi + Robot mẫu

**Files:** Create `src/fanroc/ui/rules.ts`, `src/fanroc/ui/robots-gallery.ts`; Modify `src/fanroc/ui/home.ts`

- **Luật chơi** (spec §6.7): các thẻ ngắn, lời của game (không chép tài liệu luật): sân và các khu, thể thức trận
  (10 s + 3 phút, 4 đội cùng điểm, Đỏ/Xanh), bảng điểm (lấy số từ `scoring.ts` để không lệch), lỗi thường gặp
  (các lỗi trọng tài tự động đang bắt trong `match.ts`), cơ cấu giải (mục E). Mỗi thẻ có ảnh chụp từ chính sân 3D
  (camera đặt sẵn) hoặc minh hoạ SVG.
- **Robot mẫu**: 4 robot trong `ROBOTS`: xoay 3D (`view/robotModels.ts`), kích thước, cổng dùng làm gì (`portMap`),
  chương trình TeleOp mẫu (xem khối, chỉ đọc), nút "Mở trong Xưởng".
- [ ] E-test **N11**: màn chính có "Luật chơi" và "Robot mẫu"; bảng điểm trong Luật chơi có "+15" cho Rãnh 3 (đọc từ
  `scoring.ts`); Robot mẫu "Mở trong Xưởng" ⇒ Xưởng nạp đúng robot đó.
- [ ] Commit — `fanroc: màn Luật chơi và Robot mẫu`

### Task 18: Build game độc lập + gói desktop

**Files:** Create `vite.game.config.ts`, `src-tauri/` (theo mẫu `~/Ai-Code/thingblock-desktop/src-tauri`, chỉ phần cửa
sổ + tệp tĩnh, không sidecar), `scripts/game-config.ts` (hằng `THINGBLOCK_URL = ''`); Modify `package.json` (scripts
`build:game`, `dist:game`), `vite.config.ts` (bỏ `fanroc.html` khỏi build `/mo-phong/`)

- `build:game` ⇒ `dist-game/` với `base: './'`, chỉ `fanroc.html` (đổi tên đầu ra `index.html`), mở được qua một
  máy chủ tĩnh bất kỳ ở thư mục con bất kỳ.
- Không có `THINGBLOCK_URL` ⇒ không hiện nút "Tải ThingBlock đầy đủ".
- Tauri: `productName` "ThingBot FanRoc Game", `frontendDist: ../dist-game`, bundle id `vn.thingedu.fanrocgame`,
  biểu tượng tạm từ bộ biểu tượng game. Kiểm Rapier WASM + Worker chạy được trong WebView (macOS WKWebView).
- Tải lần đầu nhanh hơn: tách `three` + vật lý thành chunk tải sau màn chính (`import()`).
- [ ] Kiểm: `npm run build:game` rồi mở `dist-game/` bằng `npx vite preview --outDir dist-game` ⇒ `e2e:fanroc`
  chạy được với `FANROC_URL` trỏ vào đó; `npm run build` (bài học) không còn `fanroc.html`; `npm run dist:game`
  ra `.app` macOS mở được, chơi được một Trận lẻ.
- [ ] Commit — `fanroc: build game độc lập và gói desktop Tauri`

### Task 19: Kịch bản phục vụ bản web sự kiện trên máy 201

**Files:** Create `scripts/event-201.sh`, `docs/fanroc/phat-hanh.md`

- `scripts/event-201.sh build|push|start|stop|status`: build game, `rsync` `dist-game/` tới máy 201 (mặc định
  `HOST=192.168.1.201`, thư mục `~/fanroc-game/`), phục vụ tĩnh bằng `python3 -m http.server` hoặc caddy nếu có
  (cổng mặc định 8090), tắt khi hết sự kiện. Không lưu mật khẩu; dùng SSH key sẵn có.
- `docs/fanroc/phat-hanh.md`: cách tải về máy (desktop), cách mở bản web sự kiện, checklist trước khi công khai
  (lưới núi CAD, tên FANROC, link mã nguồn AGPL, có/không link ThingBlock).
- **Không chạy `push`/`start` thật trong task** — chỉ kiểm cú pháp (`bash -n`) và chế độ thử `DRY_RUN=1` in ra lệnh.
- [ ] Commit — `fanroc: kịch bản phục vụ bản web sự kiện trên máy 201`
