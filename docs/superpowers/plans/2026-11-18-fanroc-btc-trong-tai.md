# TiFa cho Ban Tổ chức — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BTC dùng app TiFa trên một laptop để nhập đội từ Excel, sinh lịch kiểu FTC, điều hành trận; trọng tài Đỏ / Xanh chấm trên điện thoại, màn chiếu xem điểm trực tiếp, xuất Excel.

**Architecture:** Máy BTC (trang TiFa trong Tauri) là nguồn sự thật: giữ `EventState`, áp thao tác qua reducer thuần, phát "khung nhìn" cho điện thoại / màn chiếu. Phần Rust mở `0.0.0.0:47292`: phát tệp tĩnh (trang trọng tài, màn chiếu) và chuyển thư WebSocket ở `/ws` giữa trang BTC (kết nối loopback, vai "btc") và các khách; Rust lưu file giải. Logic giải đấu nằm hết ở TypeScript thuần trong `src/fanroc/btc/`.

**Tech Stack:** TypeScript (node:test), Vite (thêm 2 trang), Tauri 2 + tokio / tokio-tungstenite (đã có), jszip 3.10.1 (đã có), `qrcode-generator@1.4.4` (MIT, mới).

**Spec:** `docs/superpowers/specs/2026-11-18-fanroc-btc-trong-tai-design.md`

## Global Constraints

- src/sim-worker.ts chỉ thêm; không sửa src/sim-extra.ts, src/blocks.ts, src/main.ts gốc; không thêm khối ThingBlock; không sửa ../thingblock-editor-sim.
- Cổng dev 5191 (không dùng 5190); script luôn đặt SIM_URL / FANROC_URL. Không chạm 192.168.1.201.
- NOTICE / NGUON.md / credits.ts / THIRD_PARTY_LICENSES.txt: thêm mục cho qrcode-generator. Không chép nguyên văn luật FPT.
- localStorage chỉ trong tiền tố `fanroc.v1.`; khoá mới: `fanroc.v1.btc.event` (bản dự phòng trình duyệt), `fanroc.v1.btc.ref.<san>.<doi>` (hàng đợi trọng tài).
- Công thức điểm chỉ qua `scoreTally()`, `teamScore()`, `penaltyPoints()` có sẵn; xếp hạng theo logic mục E của `standings()` — giải mô phỏng cho kết quả y hệt.
- Mỗi test mới phải chứng minh fail bằng phá hỏng có chủ đích (ghi lệnh phá + dòng fail vào report).
- Không merge / push / phát hành khi chưa hỏi anh Tuấn. Không `git stash` trần.
- Chữ giao diện tiếng Việt tự nhiên; nút trên điện thoại ≥ 44 px.
- Cổng: BTC_PORT = 47292. Cỡ lịch: 8–120 đội, 3–10 trận / đội, 1–4 sân. Mặc định: 5 trận, 1 sân, 7 phút / lượt.

## Review Focus

1. Điện thoại gửi lại cùng thao tác sau khi mất mạng ⇒ không cộng hai lần (Task 7: test `op lặp seq bị bỏ`).
2. Laptop BTC tắt ngang giữa giải ⇒ mở lại đúng trạng thái, kể cả trận đang kiểm kê (Task 6 + Task 10: test lưu / nạp; reducer không giữ gì ngoài `EventState`).
3. File Excel thật của BTC: ô gộp, dòng trống ở giữa, mã đội là số, tên có dấu / ký tự `&<>` (Task 5: test các trường hợp này).
4. Hai người cùng nhận ghế Trọng tài Đỏ sân 1 ⇒ người sau chờ BTC cho thay, không âm thầm ghi đè (Task 7).
5. Sửa kết quả đã chốt ⇒ bảng xếp hạng + Excel đổi theo, nhật ký sửa giữ số cũ (Task 1 + Task 5).

---

### Task 1: Mô hình dữ liệu giải + reducer

**Files:**
- Create: `src/fanroc/btc/event.ts`, `src/fanroc/btc/event.test.ts`

**Interfaces:**
- Produces:
```ts
export type Team = { id: string; code: string; name: string; school: string; province: string; advisor: string; withdrawn: boolean }
export type Side = 'red' | 'blue'
export type Seat = string | null                       // team id; null = ghế trống
export type EMatch = { id: string; slot: number; field: number; red: [Seat, Seat]; blue: [Seat, Seat] }
export type Pens = { minor: number; yellow: number; red: boolean; warn: number }
export type HalfSheet = {                              // một trọng tài, một nửa sân
  fire: { o: number; g: number }
  mtn: [{ g: number; o: number }[], { g: number; o: number }[]]   // 2 núi của nửa này × 3 rãnh
  decorO: number
  flags: [boolean, boolean]
  climbs: [Climb, Climb]
  pens: [Pens, Pens]                                   // theo thứ tự đội trong liên minh của trọng tài
  faults: { team: 0 | 1; code: string; kind: 'warn' | 'minor' | 'yellow' | 'red'; at: number }[]
}
export type Result = { red: HalfSheet; blue: HalfSheet; committedAt: number }
export type Edit = { matchId: string; at: number; before: Result | null; after: Result }
export type Round = { id: string; name: string; teamIds: string[]; perTeam: number; fields: number; slotMin: number; startAt: string /* "08:00" */; seed: number; matches: EMatch[]; results: Record<string, Result>; edits: Edit[] }
export type Live = { matchId: string; phase: 'ready' | 'play' | 'inventory' | 'done'; startedAt: number | null; sheets: Partial<Record<Side, HalfSheet>>; submitted: Partial<Record<Side, boolean>> }
export interface EventState { version: 1; name: string; teams: Team[]; rounds: Round[]; live: Record<number /* field */, Live | null>; codes: Record<number, string> /* mã sân 4 số */ }
export const emptySheet: () => HalfSheet
export function newEvent(name: string, seed: number): EventState
export type Action =
  | { t: 'teams'; teams: Omit<Team, 'id' | 'withdrawn'>[] }          // thay cả danh sách (chỉ khi chưa có vòng nào có kết quả)
  | { t: 'team.add'; team: Omit<Team, 'id' | 'withdrawn'> } | { t: 'team.edit'; id: string; patch: Partial<Omit<Team, 'id'>> }
  | { t: 'team.withdraw'; id: string }
  | { t: 'round.add'; name: string; teamIds: string[]; perTeam: number; fields: number; slotMin: number; startAt: string; seed: number }
  | { t: 'round.schedule'; roundId: string; matches: EMatch[] }      // chỉ thay trận CHƯA có kết quả
  | { t: 'round.teams'; roundId: string; teamIds: string[]; perTeam: number; fields: number }   // thêm đội muộn / đổi số trận; màn BTC gọi tiếp makeSchedule({fixed}) + round.schedule
  | { t: 'live.start'; field: number; matchId: string; now: number } | { t: 'live.abort'; field: number }
  | { t: 'live.whistle'; field: number } | { t: 'live.sheet'; field: number; side: Side; sheet: HalfSheet; submit: boolean }
  | { t: 'live.commit'; field: number; now: number }
  | { t: 'result.edit'; roundId: string; matchId: string; result: Result; now: number }
  | { t: 'code.new'; field: number; code: string }
export function reduce(s: EventState, a: Action): EventState   // thuần, ném Error tiếng Việt khi không hợp lệ
export function roundOfMatch(s: EventState, matchId: string): Round | undefined
```
(`Climb` từ `../ladder.ts`.)

- [ ] **Step 1: Viết test** `event.test.ts`: `newEvent` có version 1, chưa có vòng; `team.withdraw` đổi `withdrawn` và các trận chưa đấu của đội đó có ghế thành `null` (trận đã có kết quả giữ nguyên); `round.schedule` giữ nguyên trận đã có `results[id]`; `live.commit` khi chưa đủ hai `submitted` ⇒ ném `'Chưa đủ hai bản kiểm kê'`; commit đủ ⇒ `results[matchId]` có `red`/`blue` đúng sheet, `live[field] = null`; `result.edit` thêm một `Edit` với `before` là kết quả cũ; `teams` khi đã có kết quả ⇒ ném. `reduce` không sửa đối tượng vào (so `structuredClone` trước / sau).
- [ ] **Step 2:** `node --test src/fanroc/btc/event.test.ts` ⇒ FAIL (module chưa có).
- [ ] **Step 3:** Viết `event.ts`. Id: đội `t<n>`, vòng `r<n>`, trận `<roundId>-<n>` (n tăng dần, không dùng ngẫu nhiên).
- [ ] **Step 4:** Test PASS; phá thử (bỏ dòng giữ trận có kết quả trong `round.schedule`) ⇒ FAIL, khôi phục.
- [ ] **Step 5:** Commit `fanroc(btc): mô hình dữ liệu giải + reducer`.

### Task 2: Sinh lịch kiểu FTC

**Files:**
- Create: `src/fanroc/btc/schedule.ts`, `src/fanroc/btc/schedule.test.ts`

**Interfaces:**
- Consumes: `EMatch`, `Seat` (Task 1); `mulberry32` từ `../world.ts`.
- Produces:
```ts
export type SchedOpts = { teamIds: string[]; perTeam: number; fields: number; seed: number; roundId: string; fixed?: EMatch[] /* trận đã đấu, giữ nguyên, tính vào số trận */ }
export type SchedQuality = { fieldsUsed: number; minRest: number /* số lượt nghỉ ít nhất giữa hai trận của một đội */; repeatPartners: number; repeatOpponents: number; maxSideDiff: number; extra: string[] /* đội đấu thêm 1 trận */ }
export function makeSchedule(o: SchedOpts): { matches: EMatch[]; quality: SchedQuality; notes: string[] }
export function slotTime(startAt: string, slotMin: number, slot: number): string   // "08:00", 7, 3 ⇒ "08:21"
```
- Ném `Error` khi `teamIds.length < 8`, `> 120`, perTeam ngoài 3–10, fields ngoài 1–4. `fieldsUsed = min(fields, floor(n / 4))`, có note `"Dùng N sân (ít đội)"` khi giảm. Không đạt nghỉ ≥ 1 lượt ⇒ note `"Có đội không được nghỉ giữa hai trận"`.

- [ ] **Step 1: Test** (dùng `ids(n)`): với (n, perTeam, fields) ∈ {(8,5,1), (12,5,2), (30,5,1), (31,5,2), (90,5,3), (120,10,4)}: mỗi đội đấu `perTeam` hoặc `perTeam + 1` trận và số đội +1 = `quality.extra.length`, nhỏ nhất có thể (`ceil(n*perTeam/4)*4 - n*perTeam`); không đội nào hai trận cùng `slot`; mỗi slot ≤ fieldsUsed trận và field ∈ [0, fieldsUsed); `maxSideDiff ≤ 1`; `minRest ≥ 1` khi n ≥ 8 × fieldsUsed; cùng seed ⇒ `deepEqual`; khác seed ⇒ khác. `(90,5,3)` chạy < 3000 ms. `fixed` giữ nguyên và các đội đã đấu trong `fixed` được trừ số trận. (8,5,2) ⇒ fieldsUsed 2, có note. (7,5,1) ⇒ ném.
- [ ] **Step 2:** Chạy ⇒ FAIL.
- [ ] **Step 3:** Thuật toán (người làm chọn chi tiết): xếp theo lượt; mỗi lượt chọn 4·k đội ưu tiên đội còn thiếu trận nhiều nhất và nghỉ lâu nhất; chia Đỏ / Xanh cân số lần; thử `R = 200` cách ghép ngẫu nhiên cho mỗi lượt, chấm phạt `1000·đồngĐộiLặp + 100·đốiThủLặp + 10·lệchMàu`, giữ cách tốt nhất; cả lịch thử lại 5 seed con, giữ lịch có tổng phạt thấp nhất (tất định theo seed).
- [ ] **Step 4:** PASS; phá (bỏ điều kiện "không hai trận cùng slot") ⇒ FAIL.
- [ ] **Step 5:** Commit `fanroc(btc): sinh lịch sơ loại kiểu FTC`.

### Task 3: Xếp hạng cho giải thật (dùng chung lõi mục E)

**Files:**
- Modify: `src/fanroc/tournament.ts` (tách lõi), Create: `src/fanroc/btc/rank.ts`, `src/fanroc/btc/rank.test.ts`

**Interfaces:**
- Produces trong `tournament.ts`: `export function rankCore(seed: number, ids: string[], results: (Played | null)[], provisional: boolean): Standing[]` — `standings(s)` gọi `rankCore(s.seed, s.entrants.map(e=>e.id), s.results, s.results.some(r=>r===null))`, kết quả giữ nguyên từng bit.
- Produces trong `btc/rank.ts`:
```ts
export type EStanding = Standing & { withdrawn: boolean }
export function roundStandings(s: EventState, roundId: string): EStanding[]   // đội rút lui: không vào rankCore, nối cuối, rank = null-like 0, withdrawn = true
export function matchPlayed(r: Result, m: EMatch): Played                      // dùng sheet.ts (Task 4)
```
- Consumes: `Result`, `EMatch`, `EventState` (Task 1); `matchScore(r)` + `teamPoints(r, m)` (Task 4) — **Task 3 làm sau Task 4** (thứ tự thực hiện: 1, 2, 4, 3, …).

- [ ] **Step 1: Test** `tournament.test.ts` hiện có phải PASS không đổi (chạy trước khi tách). `rank.test.ts`: 8 đội, 1 đội rút lui sau 2 trận ⇒ số trận chuẩn của 7 đội còn lại không bị kéo về 2, đội rút lui đứng cuối `withdrawn: true`; trận có ghế null không tạo dòng cho null; vòng chưa xong ⇒ `provisional: true`.
- [ ] **Step 2:** FAIL. **Step 3:** Tách lõi + viết `rank.ts`. **Step 4:** PASS cả `tournament.test.ts`; phá (cho đội rút lui vào rankCore) ⇒ FAIL.
- [ ] **Step 5:** Commit `fanroc(btc): xếp hạng giải thật dùng lõi mục E`.

### Task 4: Phiếu trọng tài ⇒ điểm

**Files:**
- Create: `src/fanroc/btc/sheet.ts`, `src/fanroc/btc/sheet.test.ts`

**Interfaces:**
- Consumes: `HalfSheet`, `Result`, `EMatch`, `Pens` (Task 1); `FieldTally`, `scoreTally`, `teamScore` (`../scoring.ts`); `penaltyPoints` (`../quickmatch.ts`).
- Produces:
```ts
export const HALF_MTN: Record<Side, [number, number]> = { red: [0, 2], blue: [1, 3] }   // Núi A,C | B,D (layout.ts MOUNTAINS)
export function mergeTally(red: HalfSheet, blue: HalfSheet): FieldTally
export function liveScore(red?: HalfSheet, blue?: HalfSheet): ScoreBreakdown   // nửa thiếu = emptySheet()
export function teamPoints(r: Result, m: EMatch): { id: string; score: number; penalty: number; pens: Pens }[]   // bỏ ghế null; thứ tự red0, red1, blue0, blue1
export function halfScore(h: HalfSheet, side: Side): ScoreBreakdown            // "điểm tạm nửa mình" trên điện thoại (nửa kia rỗng)
```
- `fire`, `decorO` = tổng hai nửa; `mtn[HALF_MTN[side][k]] = h.mtn[k]`; `flags` tương tự; `climbs[side] = h.climbs`. Penalty theo đội = `penaltyPoints(pens, total)`, score = `teamScore(total, pens)`; cảnh cáo (`warn`) không ảnh hưởng.

- [ ] **Step 1: Test:** dựng hai nửa tái tạo đúng `CLIMB_EXAMPLE` (`rules-data.ts`: 13 cam chia 7 + 6, Núi A đủ 3 rãnh + cờ, Núi B 4 bóng Rãnh 3, Núi C 1 bóng Rãnh 2, leo Nước/Đất | Nước/Chạm) ⇒ `liveScore(...).total === CLIMB_EXAMPLE.total` (318); `teamPoints` với một thẻ đỏ ⇒ đội đó score 0, penalty = total; 1 lỗi nhẹ + 1 vàng ⇒ penalty 15; `warn: 3` ⇒ penalty 0.
- [ ] **Step 2–4:** FAIL ⇒ viết ⇒ PASS; phá (đảo `HALF_MTN.red` thành [0,1]) ⇒ FAIL.
- [ ] **Step 5:** Commit `fanroc(btc): phiếu hai nửa sân ⇒ điểm theo scoreTally`.

### Task 5: Excel — mẫu, nhập, xuất

**Files:**
- Create: `src/fanroc/btc/xlsx.ts` (đọc / ghi OOXML tối thiểu bằng jszip), `src/fanroc/btc/excel.ts` (mẫu, nhập đội, xuất giải), tests `xlsx.test.ts`, `excel.test.ts`

**Interfaces:**
```ts
// xlsx.ts
export type Cell = string | number | null
export async function writeXlsx(sheets: { name: string; rows: Cell[][] }[]): Promise<Uint8Array>   // sharedStrings hoặc inlineStr, cột rộng vừa
export async function readXlsx(data: Uint8Array): Promise<{ name: string; rows: Cell[][] }[]>        // hiểu sharedStrings, inlineStr, số; ô trống ⇒ null
// excel.ts
export const TEMPLATE_HEAD = ['Mã đội', 'Tên đội', 'Trường', 'Tỉnh/Thành', 'Người hướng dẫn'] as const
export function templateXlsx(): Promise<Uint8Array>
export type ImportRow = { line: number; team?: Omit<Team, 'id' | 'withdrawn'>; error?: string }
export async function importTeams(data: Uint8Array, fileName: string): Promise<ImportRow[]>   // .xlsx hoặc .csv (UTF-8, có / không BOM, dấu phẩy hoặc chấm phẩy)
export async function exportEvent(s: EventState, roundId: string): Promise<Uint8Array>        // sheets: 'Đội', 'Lịch thi', 'Kết quả', 'Xếp hạng', 'Nhật ký sửa'
```
- Nhập: tìm dòng tiêu đề theo tên cột (không phân biệt hoa thường / dấu cách thừa), bỏ dòng trống; lỗi: `'Thiếu tên đội'`, `'Trùng mã đội <mã>'`; mã số `12` ⇒ `'12'`; mã trống ⇒ tự đặt `D01…`.
- Kết quả: mỗi trận một dòng — Lượt, Giờ, Sân, Trận, 4 đội, Khu Chữa Cháy, R1, R2, R3, Cờ, Sai chỗ, Hệ số (dạng `1,55`), Điểm trận, rồi mỗi đội: lỗi nhẹ, thẻ vàng, thẻ đỏ, cảnh cáo, điểm trừ, điểm đội.

- [ ] **Step 1: Test:** `readXlsx(await writeXlsx(x))` giữ nguyên chuỗi có dấu và `&<>"`, số, null; đọc được file mẫu `templateXlsx()`; `importTeams` trên file có dòng trống giữa, tiêu đề ở dòng 3, mã là số, một dòng thiếu tên, hai dòng trùng mã ⇒ đúng `line` và `error`; CSV chấm phẩy có BOM; `exportEvent` sau một `result.edit` ⇒ sheet 'Kết quả' có điểm mới, 'Nhật ký sửa' có số cũ; sheet 'Xếp hạng' theo `roundStandings`.
- [ ] **Step 2–4:** FAIL ⇒ viết ⇒ PASS; phá (bỏ thoát `&`) ⇒ FAIL.
- [ ] **Step 5:** Commit `fanroc(btc): Excel mẫu / nhập đội / xuất giải`.

### Task 6: Máy chủ BTC trong Rust

**Files:**
- Create: `src-tauri/src/btc.rs`, `src-tauri/src/bin/fanroc-btc-server.rs`
- Modify: `src-tauri/src/lib.rs` (mod + manage + lệnh), `src-tauri/Cargo.toml` (feature `btc-server` + `[[bin]] required-features`)

**Interfaces:**
- `pub const BTC_PORT: u16 = 47292;`
- `pub type Files = Arc<dyn Fn(&str) -> Option<(Vec<u8>, &'static str)> + Send + Sync>` — app: đọc từ `app.asset_resolver()`; bin: đọc từ thư mục tham số.
- `pub async fn start_server(bind: SocketAddr, files: Files) -> io::Result<Server>` (`Server { addr, task }`, drop ⇒ dừng). HTTP GET: `/` ⇒ `trong-tai.html`, `/chieu` ⇒ `man-chieu.html`, còn lại theo đường dẫn (chặn `..`); `GET /ws` nâng WebSocket.
- Chuyển thư: kết nối WS đầu tiên từ loopback gửi `{"t":"btc"}` là BTC (chỉ một). Thư từ khách ⇒ tới BTC bọc `{"from":<id>,"m":<thư gốc>}`; thư từ BTC dạng `{"to":<id>|"*","m":…}` ⇒ tới khách. Khách vào / ra ⇒ BTC nhận `{"peer":<id>,"on":bool}`. BTC chưa có ⇒ khách nhận `{"t":"nobtc"}` rồi đóng.
- Lệnh Tauri: `btc_start() -> { port, addrs: Vec<String> }` (dùng `lan::local_addrs`), `btc_stop()`, `btc_save(json: String)` (ghi `app_data_dir/giai/hien-tai.json` qua tệp tạm + rename; giữ 20 bản `sao-luu-<unix>.json` gần nhất), `btc_load() -> Option<String>`.

- [ ] **Step 1: cargo test** trong `btc.rs`: GET `/` trả nội dung `trong-tai.html` giả + `text/html`; `/../x` ⇒ 404; khách gửi thư ⇒ BTC nhận bọc `from`; BTC gửi `to:"*"` ⇒ hai khách nhận; kết nối BTC thứ hai bị từ chối; lưu rồi đọc lại (thư mục tạm) đúng chuỗi, bản sao lưu thứ 21 xoá bản cũ nhất.
- [ ] **Step 2–4:** FAIL ⇒ viết ⇒ `cargo test` PASS; phá (bỏ chặn `..`) ⇒ FAIL.
- [ ] **Step 5:** Bin: `cargo run --features btc-server --bin fanroc-btc-server -- <cổng> <thư mục>` in `btc <địa chỉ>`. `npx tauri build --debug` không gói bin này (kiểm `ls target/debug/bundle` không có). Commit `fanroc(btc): máy chủ HTTP + WebSocket cho trọng tài / màn chiếu`.

### Task 7: Giao thức + bộ điều hành BTC (TS)

**Files:**
- Create: `src/fanroc/btc/proto.ts`, `src/fanroc/btc/host.ts`, `src/fanroc/btc/host.test.ts`, `src/fanroc/btc/link.ts` (WS phía BTC / khách + `browserBtc(search)` đọc `?btc=ws://127.0.0.1:PORT/ws`)

**Interfaces:**
```ts
// proto.ts — thư khách ⇒ BTC
export type ClientMsg =
  | { t: 'join'; role: 'ref'; field: number; side: Side; code: string; device: string }
  | { t: 'join'; role: 'screen'; field: number }
  | { t: 'op'; device: string; seq: number; field: number; side: Side; sheet: HalfSheet; submit: boolean }
// BTC ⇒ khách
export type RefView = { t: 'ref'; field: number; side: Side; match: { id: string; teams: [string, string] /* tên đội liên minh mình */ } | null; phase: Live['phase'] | 'idle'; clock: number | null /* giây còn lại */; sheet: HalfSheet; ackSeq: number }
export type ScreenView = { t: 'screen'; field: number; teams: Record<Side, string[]>; phase: Live['phase'] | 'idle'; clock: number | null; score: ScoreBreakdown; pens: Record<Side, Pens[]>; refs: Record<Side, 'off' | 'on' | 'sent'>; official: { name: string; score: number }[] | null; next: { teams: Record<Side, string[]>; time: string } | null; ranking: { rank: number; name: string; total: number }[] }
export type Deny = { t: 'deny'; reason: 'code' | 'taken' | 'waiting' }
// host.ts
export interface HostDeps { send(to: string, m: RefView | ScreenView | Deny): void; save(s: EventState): void; now(): number }
export class BtcHost {
  constructor(s: EventState, deps: HostDeps)
  state: EventState
  onPeer(id: string, on: boolean): void
  onMessage(from: string, m: ClientMsg): void
  dispatch(a: Action): void                       // màn BTC gọi; reduce ⇒ save ⇒ phát lại khung nhìn
  pending: { field: number; side: Side; device: string; peer: string }[]   // yêu cầu thay trọng tài
  allow(field: number, side: Side): void          // Cho thay: người cũ nhận deny 'taken' rồi bị bỏ ghế
  release(field: number, side: Side): void        // Giải phóng ghế
  tick(): void                                    // mỗi 250 ms: đồng hồ; hết 10 + 180 s ⇒ dispatch live.whistle
}
```
- Thao tác `op` từ một `device` có `seq ≤ ackSeq` đã thấy ⇒ bỏ, chỉ trả lại khung nhìn (chống cộng hai lần). Sheet là **toàn bộ nửa sân** (không phải delta) nên gửi lại an toàn.
- Ghế đã có device khác đang nối ⇒ người mới nhận `deny 'waiting'`, vào `pending`. Cùng `device` nối lại ⇒ nhận lại ghế. Sai mã ⇒ `deny 'code'`.
- `op` khi phase 'done' / 'idle' hoặc ghế không phải của device ⇒ bỏ.

- [ ] **Step 1: Test** (deps giả ghi thư vào mảng, `now` điều khiển được): join sai mã ⇒ deny code; hai device cùng ghế ⇒ người sau `waiting`, `allow` ⇒ chuyển ghế, người cũ nhận `taken`; op seq 3 gửi hai lần ⇒ `save` gọi một lần cho seq đó; `tick` qua 190 s ⇒ phase 'inventory'; hai bên submit ⇒ BTC `dispatch(live.commit)` ⇒ khung nhìn màn chiếu có `official`; mỗi `dispatch` gọi `save` đúng một lần; khởi động lại `new BtcHost(stateĐãLưu)` khi phase 'inventory' ⇒ trọng tài nối lại thấy đúng sheet đã gửi.
- [ ] **Step 2–4:** FAIL ⇒ viết ⇒ PASS; phá (bỏ kiểm `seq`) ⇒ FAIL.
- [ ] **Step 5:** Commit `fanroc(btc): giao thức trọng tài / màn chiếu + bộ điều hành`.

### Task 8: Trang trọng tài (điện thoại)

**Files:**
- Create: `trong-tai.html`, `src/fanroc/btc/referee.ts` (vào trang + điều khiển), `src/fanroc/btc/referee-ui.ts` (DOM), `src/fanroc/btc/halfmap.ts` (SVG nửa sân từ `layout.ts`: 2 núi × 3 rãnh, Khu Chữa Cháy, thang; vùng chạm ≥ 44 px), `src/fanroc/btc/refqueue.ts` + `refqueue.test.ts`
- Modify: `vite.config.ts` và `vite.game.config.ts` (thêm input `trong-tai`), `src/fanroc/ui/brand.ts` không đổi (trang dùng `brandStrip(28)` ở màn vào)

**Interfaces:**
- `refqueue.ts`: `export class RefQueue { constructor(store: Pick<Storage,'getItem'|'setItem'>, key: string); push(sheet: HalfSheet, submit: boolean): { seq: number }; pending(): { seq: number; sheet: HalfSheet; submit: boolean } | null; ack(seq: number): void }` — chỉ giữ bản mới nhất chưa ack (sheet là toàn nửa sân), seq tăng và còn sau khi tải lại trang. Khoá `fanroc.v1.btc.ref.<field>.<side>`.
- Màn: (1) vào — chọn sân, Đỏ / Xanh, mã 4 số; (2) ba thẻ **Trong trận / Kiểm kê / Lỗi-thẻ** đúng bản phác `trong-tai-v1` (bộ đếm − / + cho ô đang chọn, cờ, mức leo trong Kiểm kê, nút **Gửi kiểm kê**, lỗi chọn đội + `FAULTS` + Lỗi nhẹ / Thẻ vàng / Thẻ đỏ / Cảnh cáo, xoá được); dải trên: liên minh, trận, đồng hồ, trạng thái "đã nối / chưa gửi được"; cuối: "Điểm tạm nửa mình" = `halfScore`.
- Địa chỉ WS: trong app = cùng máy chủ (`ws://<host>/ws` theo `location`), dev = `?btc=`.

- [ ] **Step 1: Test** `refqueue.test.ts`: push 3 lần không ack ⇒ `pending().seq === 3` và sheet mới nhất; ack(3) ⇒ null; tạo lại `RefQueue` trên cùng store ⇒ seq tiếp là 4; ack(2) khi pending 3 ⇒ vẫn pending 3.
- [ ] **Step 2–4:** FAIL ⇒ viết ⇒ PASS; phá (seq không lưu store) ⇒ FAIL.
- [ ] **Step 5:** Dựng UI; kiểm tay ở viewport 375 × 667 bằng Playwright chụp ảnh (lưu scratchpad). Commit `fanroc(btc): trang trọng tài trên điện thoại`.

### Task 9: Màn chiếu

**Files:**
- Create: `man-chieu.html`, `src/fanroc/btc/screen.ts`, `src/fanroc/btc/screen-ui.ts`; Modify: hai vite config (input `man-chieu`)

**Interfaces:** Consumes `ScreenView` (Task 7). Mở `…/chieu?san=<n>` (sân đánh số từ 1 trên giao diện, 0 trong dữ liệu). Bố cục theo phần B của bản phác: Đỏ | điểm lớn + đồng hồ | Xanh; bảng chi tiết; dòng trạng thái trọng tài; sau chốt hiện điểm chính thức từng đội; khi 'idle': trận kế + bảng xếp hạng (cuộn khi > 12 dòng). Chữ to đọc được ở 1920 × 1080 từ xa; tự nối lại mỗi 2 s khi mất.

- [ ] **Step 1:** Test thuần cho `screenLines(v: ScreenView): { label: string; value: string }[]` (Khu Chữa Cháy "12 → 60", Rãnh "9 / 6 / 3 → 150", Sai chỗ, Leo, phạt) trong `screen.test.ts`.
- [ ] **Step 2–4:** FAIL ⇒ viết ⇒ PASS; phá ⇒ FAIL. **Step 5:** Commit `fanroc(btc): màn chiếu điểm trực tiếp`.

### Task 10: Màn BTC trong app

**Files:**
- Create: `src/fanroc/ui/btc.ts` (màn), `src/fanroc/btc/qr.ts` (bọc `qrcode-generator` ⇒ SVG), `src/fanroc/btc/backend.ts` (Tauri invoke `btc_*` hoặc trình duyệt: `browserBtc` + `fanroc.v1.btc.event`)
- Modify: `src/fanroc/ui/router.ts` (Screen `'btc'`, chrome như 'tournament'), `src/fanroc/main.ts` (vào màn), `src/fanroc/ui/tournament.ts` (nút **"Tổ chức giải thật (Ban tổ chức)"** ở màn ghi danh), `package.json` (+ `qrcode-generator` 1.4.4), NOTICE / NGUON.md / credits.ts / THIRD_PARTY_LICENSES.txt

**Interfaces:** Consumes mọi thứ ở Task 1–7. Các phần của màn:
1. **Giải**: tên giải; Mở / Sao lưu file giải (JSON); khi mở app: `btc_load()` có dữ liệu ⇒ hỏi "Tiếp tục giải <tên>?".
2. **Đội**: Tải file mẫu, Nhập Excel / CSV (bảng xem trước, dòng lỗi tô đỏ, nút Nhận khi không còn lỗi hoặc "Bỏ dòng lỗi và nhận"), thêm / sửa / Rút lui.
3. **Vòng**: tạo vòng (Sơ loại / Chung kết; chọn đội — Chung kết chọn từ bảng xếp hạng vòng trước bằng ô tick); số trận, số sân, phút / lượt, giờ bắt đầu ⇒ **Sinh lịch** (hiện `quality` + `notes`, nút Sinh lại = seed mới), bảng lịch theo lượt / sân / giờ.
4. **Điều hành**: mỗi sân một thẻ — trận kế, trọng tài Đỏ / Xanh (tắt / đã nối / đã gửi), yêu cầu thay (Cho thay), Giải phóng ghế, mã sân + Đổi mã, **Bắt đầu trận**, Hủy trận, sau còi: xem hai nửa + điểm ⇒ **Chốt**. Âm báo bắt đầu / hết giờ dùng `ui/sound.ts`.
5. **Kết quả**: danh sách trận đã chốt, **Sửa kết quả** (form như Kiểm kê, cả hai nửa) ⇒ `result.edit`; bảng xếp hạng `roundStandings`.
6. **Kết nối**: địa chỉ `http://<ip>:47292/` + QR cho trọng tài, `…/chieu?san=n` + QR cho màn chiếu; lời dặn cho phép mạng (Windows: "Cho phép truy cập" ở hộp thoại Tường lửa; macOS: "Cho phép").
7. Móc thử: `__fanroc.btc = { host, setClock(giâyĐãChạy) }` (cho e2e tua đồng hồ trận, như `__fanroc.lan.setTime`).
8. **Xuất Excel**: chọn vòng ⇒ `exportEvent` ⇒ lưu (app: lệnh lưu tệp như `save_tb` nhưng đuôi `.xlsx` — thêm lệnh `save_file(name, data)` dùng lại `free_path`; trình duyệt: tải về).

- [ ] **Step 1: Test** `ui/btc.test.ts` cho phần thuần: `scheduleRows(round, teams)` (lượt, giờ `slotTime`, sân 1-based, tên đội, "—" cho ghế trống); `qrSvg('http://192.168.1.5:47292/')` trả `<svg` có `viewBox`. `home.test.ts`/router test thêm Screen 'btc'.
- [ ] **Step 2–4:** FAIL ⇒ viết ⇒ PASS; phá ⇒ FAIL.
- [ ] **Step 5:** Commit `fanroc(btc): màn Ban tổ chức trong app`.

### Task 11: e2e + tài liệu

**Files:**
- Modify: `scripts/fanroc-e2e.mjs` (bài B1–B3), `docs/fanroc/quyet-dinh.md` (R176…: các "em chọn" của spec), `docs/fanroc/huong-dan-hoc-sinh.md` không đổi; Create: `docs/fanroc/huong-dan-btc.md` (các bước một ngày thi: Wi-Fi, mở app, nhập đội, sinh lịch, phát QR, chấm, chốt, xuất Excel, sao lưu)

- [ ] **Step 1:** `startBtc()` chạy `src-tauri/target/debug/fanroc-btc-server` (cổng trống, thư mục rỗng — trang lấy từ vite 5191 với `?btc=`).
  - **B1**: trang BTC (`fanroc.html?btc=…`) vào màn BTC, nhập file 12 đội (tạo bằng `writeXlsx` trong script), sinh lịch 5 trận × 2 sân ⇒ bảng có 15 trận.
  - **B2**: hai trang điện thoại (viewport 375 × 667) vào sân 1 Đỏ / Xanh bằng mã đọc từ trang BTC; trang màn chiếu `man-chieu.html?san=1&btc=…`; BTC Bắt đầu; Đỏ bấm + 3 bóng Rãnh 1 Núi A ⇒ màn chiếu hiện điểm tạm 15 trong 2 s; tua đồng hồ (móc `__fanroc.btc.setClock`) tới hết ⇒ kiểm kê, hai bên gửi ⇒ Chốt ⇒ bảng xếp hạng có điểm.
  - **B3**: tắt mạng trang Đỏ (`context.setOffline(true)`), bấm 2 lần, bật lại ⇒ điểm trên BTC đúng (không cộng đôi); tải lại trang BTC (máy chủ vẫn chạy, dữ liệu nạp lại) ⇒ trận đã chốt còn; xuất Excel ⇒ `readXlsx` thấy sheet 'Kết quả' có trận đó.
- [ ] **Step 2:** Phá thử (tắt dedupe seq) ⇒ B3 FAIL; khôi phục ⇒ `FANROC_URL=http://localhost:5191/mo-phong/fanroc.html npm run e2e:fanroc` toàn bộ PASS (ghi số), `npm run test:unit`, `npx tsc --noEmit`, `cargo test` PASS.
- [ ] **Step 3:** Commit `fanroc(btc): e2e trọng tài + hướng dẫn BTC`.

**Thứ tự thực hiện:** 1 → 2 → 4 → 3 → 5 → 6 → 7 → 8 → 9 → 10 → 11.
