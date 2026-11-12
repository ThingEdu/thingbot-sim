// Bảng điểm trận đấu kiểu game (spec §6.1 ③, anh Tuấn chốt 04/11): ô Đỏ trái | điểm trận CHUNG + đồng hồ + pha giữa |
// ô Xanh phải. 4 đội hợp tác, nhận chung một điểm trận; mỗi ô liên minh hiện 2 đội (tên, nhãn chương trình, phạt, điểm
// đội = teamScore(điểm chung, phạt)). Luật V4: dưới điểm chung là dòng nhỏ "205 × 1,55" (điểm nhiệm vụ × hệ số nhân leo
// Thang Cứu Hỏa), hệ số 1,00 thì ẩn. Kèm đếm ngược 3 · 2 · 1 · BẮT ĐẦU!, chữ báo điểm nổi 1,5 s, màn kết quả phủ sân.
// Phần thuần (scoreLine, scorePops, countdownCue, ScoreTicker, resultView) chạy được trong Node; createScoreboard dựng DOM.
import type { Match } from '../match.ts'
import type { RobotBody } from '../robot.ts'
import type { Skill } from '../agent.ts'
import { pctText, scoreTally, teamScore, type ScoreBreakdown } from '../scoring.ts'
import { CLIMB_PCT, type Climb } from '../ladder.ts'
import { penaltyPoints } from '../quickmatch.ts'
import { matchClock } from '../view/hud.ts'

/** Điểm trận tính lại tối đa chừng này lần mỗi giây (tally dò tia trên 300 bóng). */
export const SCORE_HZ = 4

export type ScorePhase = 'XẢ BÓNG' | 'ĐIỀU KHIỂN' | 'HẾT GIỜ' | 'LUYỆN TẬP'
/** Mỗi đội của một liên minh; `climb` = mức leo đã xét đúng thanh (như lúc chấm). */
export type AllianceLine = { teams: { name: string; score: number; penalty: number; program: string; climb: Climb }[] }
export interface ScoreLine {
  red: AllianceLine
  blue: AllianceLine
  total: number
  /** Dòng nhỏ dưới điểm chung: "205 × 1,55"; hệ số 1,00 ⇒ null (ẩn). */
  mult: string | null
  clock: string
  phase: ScorePhase
  /** Điểm trận từng mục (để báo điểm nổi và màn kết quả). */
  score: ScoreBreakdown
}

export { pctText }

/**
 * Dòng nhỏ dưới điểm chung: "{điểm nhiệm vụ} × {hệ số}", ví dụ "205 × 1,55"; hệ số 1,00 ⇒ null. Điểm nhiệm vụ ≤ 0 thì
 * scoring.ts không nhân hệ số: chỉ ghi "× 1,05" để em biết hệ số đang có.
 */
export function multText(s: ScoreBreakdown): string | null {
  if (s.multPct === 100) return null
  return s.mission > 0 ? `${s.mission} × ${pctText(s.multPct)}` : `× ${pctText(s.multPct)}`
}

const SKILL_NAME: Record<Skill, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }

/** Nhãn chương trình của một ghế: agent ⇒ "Máy Dễ|Vừa|Khó"; chương trình khối ⇒ nhãn người gọi truyền (Xưởng: "Của em vN"), mặc định "Mặc định". */
export function programLabel(d: { kind: 'agent'; skill: Skill } | { kind: 'program' }, label?: string): string {
  return d.kind === 'agent' ? `Máy ${SKILL_NAME[d.skill]}` : (label ?? 'Mặc định')
}

/** Pha trận theo chữ của bảng điểm. Luyện tập (và nhiệm vụ) luôn là LUYỆN TẬP. */
export function phaseOf(m: Match): ScorePhase {
  if (m.practice) return 'LUYỆN TẬP'
  if (m.phase === 'release') return 'XẢ BÓNG'
  if (m.phase === 'end') return 'HẾT GIỜ'
  return 'ĐIỀU KHIỂN'
}

/**
 * Dòng bảng điểm của trận lúc này. `programs[i]`: nhãn chương trình của robot i (thiếu ⇒ "Mặc định"); `names[i]`: tên
 * đội của robot i. Không giả định đủ 4 robot (nhiệm vụ chỉ có Robot 1: bên Xanh rỗng). Có `names` thì chỉ một lần
 * tally (dò tia trên 300 bóng) cho cả dòng; thiếu `names` thì lấy tên từ `match.result()` (thêm một lần tally).
 * Người gọi vẫn giới hạn SCORE_HZ (ScoreTicker).
 */
export function scoreLine(match: Match, robots: RobotBody[], programs: string[] = [], names?: string[]): ScoreLine {
  const tally = match.tally()
  const score = scoreTally(tally)
  const total = score.total
  const teamNames = names ?? match.result().teams.map((t) => t.team)
  const side = (a: 'red' | 'blue'): AllianceLine => ({
    teams: robots.flatMap((r, i) =>
      r.alliance === a
        ? [{
            name: teamNames[i] ?? `Robot ${i + 1}`,
            score: teamScore(total, match.pens[i]),
            penalty: penaltyPoints(match.pens[i], total),
            program: programs[i] ?? 'Mặc định',
            climb: tally.climbs[a][r.slot] ?? 'none',
          }]
        : [],
    ),
  })
  return { red: side('red'), blue: side('blue'), total, mult: multText(score), clock: matchClock(match.t, match.practice), phase: phaseOf(match), score }
}

const ITEMS: [Exclude<keyof ScoreBreakdown, 'total' | 'mission' | 'multPct'>, string][] = [
  ['fire', 'Chữa Cháy'], ['r1', 'Rãnh 1'], ['r2', 'Rãnh 2'], ['r3', 'Rãnh 3'], ['flag', 'Cờ'], ['wrong', 'Bóng sai chỗ'],
]
/** Số có dấu kiểu bảng điểm: "+15", "−3" (dấu trừ U+2212). */
const signed = (v: number) => (v > 0 ? `+${v}` : `−${-v}`)

/** Tên mục hệ số nhân trong chữ báo nổi ("+0,05 · Hệ số nhân"). */
export const MULT_POP = 'Hệ số nhân'

/**
 * Chữ báo nổi cho mỗi mục điểm đã đổi: "+15 · Rãnh 3", "+5 · Chữa Cháy", "−3 · Bóng sai chỗ"; hệ số nhân đổi (robot
 * chạm / treo / rời xà) ⇒ "+0,05 · Hệ số nhân", đứng sau các mục điểm.
 */
export function scorePops(prev: ScoreBreakdown, next: ScoreBreakdown): string[] {
  const pops = ITEMS.flatMap(([k, name]) => {
    const d = next[k] - prev[k]
    return d === 0 ? [] : [`${signed(d)} · ${name}`]
  })
  const dm = next.multPct - prev.multPct
  if (dm !== 0) pops.push(`${pctText(dm, true)} · ${MULT_POP}`)
  return pops
}

/**
 * Đếm ngược ở 3 s cuối của 10 s xả bóng: thời điểm trận đi từ `prevT` (không kể) tới `t` qua mốc −3 / −2 / −1 / 0 ⇒
 * 3 / 2 / 1 / 0 (0 = "BẮT ĐẦU!"); qua nhiều mốc một lần (tốc độ ×40) lấy mốc sau cùng; không qua mốc ⇒ null.
 */
export function countdownCue(prevT: number, t: number): 3 | 2 | 1 | 0 | null {
  const TOL = 1e-6 // Match cộng dồn dt nên lúc sang thi đấu t ≈ −1e-13
  for (const k of [0, -1, -2, -3] as const) if (t >= k - TOL && prevT < k - TOL) return (0 - k) as 3 | 2 | 1 | 0
  return null
}

/**
 * Nhịp cập nhật bảng điểm: tính dòng tối đa SCORE_HZ lần/giây (ngay lập tức khi đổi trận hoặc đổi pha), báo nổi các
 * mục đã đổi kể từ lần trước — chỉ khi cả lần trước lẫn lần này đều trong lúc thi đấu (hoặc lần này vừa hết giờ): bóng
 * rơi lúc xả bóng và phần còn lăn ngay khi sang thi đấu không phải ghi điểm.
 */
export class ScoreTicker {
  private match: Match | null = null
  private last = -Infinity
  private prev: ScoreBreakdown | null = null
  private phase: ScorePhase | null = null

  tick(nowMs: number, match: Match, robots: RobotBody[], programs: string[] = [], names?: string[]): { line: ScoreLine; pops: string[] } | null {
    if (match !== this.match) {
      this.match = match
      this.prev = null
      this.phase = null
    } else if (phaseOf(match) === this.phase && nowMs - this.last < 1000 / SCORE_HZ) return null
    this.last = nowMs
    const line = scoreLine(match, robots, programs, names)
    // Mốc so sánh phải lấy trong lúc thi đấu: lần đầu sau xả bóng chỉ đặt mốc (bóng còn lăn từ lúc xả không phải ghi điểm).
    const playing = (p: ScorePhase | null) => p === 'ĐIỀU KHIỂN' || p === 'LUYỆN TẬP'
    const scoring = playing(this.phase) && (playing(line.phase) || line.phase === 'HẾT GIỜ')
    const pops = this.prev && scoring ? scorePops(this.prev, line.score) : []
    this.prev = line.score
    this.phase = line.phase
    return { line, pops }
  }
}

/** Tên mức leo trên màn kết quả. */
const CLIMB_NAME: Record<Climb, string> = { none: '—', contact: 'Chạm', ground: 'Đất', water: 'Nước' }

export interface ResultView {
  line: ScoreLine
  /** Bảng mục theo thứ tự của luật (chữ đã định dạng): Chữa Cháy, Rãnh 1–3, Sai vị trí, Cờ, Điểm nhiệm vụ, Hệ số nhân. */
  items: { label: string; value: string }[]
  /** Phép tính điểm trận "⌈205 × 1,55⌉ = 318"; hệ số 1,00 hoặc điểm nhiệm vụ ≤ 0 (không nhân) ⇒ null. */
  formula: string | null
  /** Leo xà từng robot (Đỏ rồi Xanh, như hai cột): tên đội, mức (Chạm / Đất / Nước / —), phần hệ số "+0,05"…"0". */
  climbs: { name: string; level: string; value: string }[]
}

/** Màn kết quả: lấy `match.result()` (đã chốt lúc hết giờ). */
export function resultView(match: Match, robots: RobotBody[], programs: string[] = [], names?: string[]): ResultView {
  const line = scoreLine(match, robots, programs, names)
  const s = line.score
  const pts = (v: number) => (v === 0 ? '0' : signed(v))
  return {
    line,
    items: [
      { label: 'Chữa Cháy', value: pts(s.fire) },
      { label: 'Rãnh 1', value: pts(s.r1) },
      { label: 'Rãnh 2', value: pts(s.r2) },
      { label: 'Rãnh 3', value: pts(s.r3) },
      { label: 'Sai vị trí', value: pts(s.wrong) },
      { label: 'Cờ', value: pts(s.flag) },
      { label: 'Điểm nhiệm vụ', value: s.mission < 0 ? signed(s.mission) : String(s.mission) },
      { label: 'Hệ số nhân', value: `× ${pctText(s.multPct)}` },
    ],
    formula: s.multPct !== 100 && s.mission > 0 ? `⌈${s.mission} × ${pctText(s.multPct)}⌉ = ${s.total}` : null,
    climbs: [...line.red.teams, ...line.blue.teams].map((t) => ({ name: t.name, level: CLIMB_NAME[t.climb], value: pctText(CLIMB_PCT[t.climb], true) })),
  }
}

// ---------- DOM ----------

/** Thời gian một chữ báo điểm nổi, ms. */
export const POP_MS = 1500
/** Số chữ báo nổi tối đa cùng lúc (cũ nhất bị bỏ). */
const POP_MAX = 4

export interface Scoreboard {
  update(line: ScoreLine, pops: string[]): void
  /** 3 · 2 · 1; 0 = "BẮT ĐẦU!". */
  countdown(n: 3 | 2 | 1 | 0): void
  /** Màn kết quả. Giải đấu: không có Chơi lại (trận đã ghi), `next` = Trận kế tiếp / Về Pit (`nextLabel`). */
  result(r: ResultView, actions: { again?(): void; home(): void; next?(): void; nextLabel?: string }): void
  hideResult(): void
  /** Xoá chữ báo điểm nổi và chữ đếm ngược đang hiện (hiện màn kết quả, sang trận mới, rời màn trận). */
  clearFx(): void
  /** Ẩn / hiện cả bảng điểm (nhiệm vụ không dùng bảng điểm trận). */
  visible(v: boolean): void
}

const CSS = `
.sb { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 12; display: grid; grid-template-columns: minmax(0, 230px) auto minmax(0, 230px); max-width: calc(100% - 16px); border-radius: 10px; overflow: hidden; box-shadow: 0 4px 16px #0009; color: #fff; font-family: var(--font); pointer-events: none; user-select: none; }
.sb[hidden] { display: none; }
.sb-side { display: grid; align-content: center; gap: 2px; padding: 5px 10px; min-width: 0; }
.sb-side[data-side="red"] { background: linear-gradient(180deg, #ee4a5e, #c92a3f); }
.sb-side[data-side="blue"] { background: linear-gradient(180deg, #3a76f5, #1d52cf); }
.sb-hd { display: flex; gap: 6px; align-items: baseline; font: 900 12px/1.2 var(--font); letter-spacing: .6px; white-space: nowrap; }
.sb-hd span { font-weight: 600; letter-spacing: 0; opacity: .9; overflow: hidden; text-overflow: ellipsis; }
.sb-side[data-side="blue"] .sb-hd { flex-direction: row-reverse; }
.sb-team { display: flex; gap: 6px; align-items: baseline; font: 600 12px/1.25 var(--font); white-space: nowrap; min-width: 0; }
.sb-side[data-side="blue"] .sb-team { flex-direction: row-reverse; }
.sb-name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sb-prog { font-weight: 500; font-size: 11px; opacity: .8; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.sb-side[data-side="blue"] .sb-prog { text-align: right; }
.sb-pen { font-size: 11px; font-weight: 800; color: #ffe08a; }
.sb-ts { font: 900 14px/1 var(--font); font-variant-numeric: tabular-nums; flex: none; }
.sb-mid { display: grid; justify-items: center; align-content: center; padding: 4px 14px; background: #12141f; min-width: 92px; }
.sb-total { font: 900 30px/1 var(--font); font-variant-numeric: tabular-nums; }
.sb-mult { font: 700 11px/1.1 var(--font); font-variant-numeric: tabular-nums; color: #ffd23f; white-space: nowrap; }
.sb-mult[hidden] { display: none; }
.sb-sub { display: flex; gap: 6px; align-items: baseline; white-space: nowrap; }
.sb-clock { font: 700 15px/1.2 var(--mono); font-variant-numeric: tabular-nums; }
.sb-phase { font: 800 10px/1 var(--font); letter-spacing: .5px; padding: 2px 5px; border-radius: 4px; background: #ffffff1f; }
.sb-phase[data-p="HẾT GIỜ"] { background: #e2384d; }
.sb-pops { position: absolute; top: calc(var(--runbar-top, 72px) + 46px); left: 50%; transform: translateX(-50%); z-index: 11; display: grid; gap: 6px; justify-items: center; pointer-events: none; max-width: calc(100% - 16px); }
.sb-pop { background: linear-gradient(90deg, #e2384d, #ff7a1a); color: #fff; padding: 7px 18px; border-radius: 30px; font: 900 18px/1.2 var(--font); box-shadow: 0 4px 20px #0008; white-space: nowrap; animation: sb-pop ${POP_MS}ms ease-out forwards; }
.sb-pop[data-neg="true"] { background: linear-gradient(90deg, #5a5f73, #3a3e4f); }
@keyframes sb-pop { 0% { transform: scale(.6); opacity: 0 } 12% { transform: scale(1.08); opacity: 1 } 22% { transform: scale(1) } 80% { opacity: 1; transform: translateY(0) } 100% { opacity: 0; transform: translateY(-14px) } }
.sb-count { position: absolute; inset: 0; display: grid; place-items: center; z-index: 13; pointer-events: none; }
.sb-count b { font: 900 min(26vw, 160px)/1 var(--font); color: #fff; text-shadow: 0 6px 30px #000c, 0 0 2px #000; animation: sb-count 900ms ease-out forwards; }
.sb-count b[data-go="true"] { font-size: min(14vw, 96px); background: linear-gradient(90deg, #ffd23f, #ff7a1a); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; filter: drop-shadow(0 6px 20px #000c); animation-duration: 1200ms; }
@keyframes sb-count { 0% { transform: scale(1.6); opacity: 0 } 20% { transform: scale(1); opacity: 1 } 75% { opacity: 1 } 100% { transform: scale(.9); opacity: 0 } }
.sb-result { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; padding: 12px; background: #05060dcc; color: #fff; font-family: var(--font); overflow: auto; }
.sb-result[hidden] { display: none; }
.sb-card { width: min(760px, 100%); max-height: 100%; overflow: auto; display: grid; gap: 12px; padding: 18px; border-radius: 14px; background: #12141f; box-shadow: 0 10px 40px #000a; }
.sb-card h2 { margin: 0; text-align: center; font: 900 15px/1.2 var(--font); letter-spacing: 1.5px; color: #ffd23f; }
.sb-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr); gap: 10px; }
.sb-col { border-radius: 10px; padding: 10px 12px; display: grid; gap: 6px; align-content: start; min-width: 0; }
.sb-col[data-side="red"] { background: #c92a3f; }
.sb-col[data-side="blue"] { background: #1d52cf; }
.sb-col[data-side="total"] { background: #1c1f2e; text-align: center; }
.sb-col h3 { margin: 0; font: 900 13px/1.2 var(--font); letter-spacing: .8px; }
.sb-big { font: 900 64px/1 var(--font); font-variant-numeric: tabular-nums; background: linear-gradient(90deg, #ffd23f, #ff7a1a); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sb-note { font-size: 12px; opacity: .8; }
.sb-row { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.sb-row b { font-variant-numeric: tabular-nums; }
.sb-col[data-side="total"] .sb-row { text-align: left; }
.sb-row[data-key] { border-top: 1px solid #fff2; padding-top: 4px; font-weight: 800; }
.sb-col h4 { margin: 4px 0 0; font: 900 12px/1.2 var(--font); letter-spacing: .6px; color: #ffd23f; text-align: left; }
.sb-row small { opacity: .75; font-size: 12px; }
.sb-trow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 8px; padding: 6px 8px; border-radius: 6px; background: #0003; font-size: 13px; }
.sb-trow small { grid-column: 1 / -1; font-size: 11px; opacity: .85; }
.sb-trow b { font: 900 18px/1 var(--font); font-variant-numeric: tabular-nums; grid-row: span 1; }
.sb-acts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.sb-acts button { font: 800 14px var(--font); border: 0; border-radius: 22px; padding: 10px 20px; cursor: pointer; background: #2c3044; color: #fff; }
.sb-acts button.main { background: linear-gradient(90deg, #ff7a1a, #e2384d); }
.sb-acts button:hover, .sb-acts button:focus-visible { filter: brightness(1.15); }
@media (max-width: 700px) {
  .sb { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); width: calc(100% - 16px); }
  .sb-side { padding: 4px 6px; }
  .sb-prog, .sb-hd span { display: none; }
  .sb-mid { min-width: 0; padding: 3px 8px; }
  .sb-total { font-size: 24px; }
  .sb-pop { font-size: 15px; padding: 6px 14px; }
  .sb-cols { grid-template-columns: minmax(0, 1fr); }
  .sb-col[data-side="total"] { order: -1; }
  .sb-big { font-size: 52px; }
}
`

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const ALLIANCE_NAME = { red: 'ĐỎ', blue: 'XANH' } as const
const penText = (p: number) => (p ? `−${p}` : '')

/** Dựng bảng điểm trên `stage`; đặt `--runbar-top` của stage để thanh chạy nằm ngay dưới bảng điểm. */
export function createScoreboard(stage: HTMLElement): Scoreboard {
  if (!document.getElementById('sb-css')) {
    const s = el('style')
    s.id = 'sb-css'
    s.textContent = CSS
    document.head.append(s)
  }
  // Không role="status": bảng đổi 4 lần/giây, trình đọc màn hình sẽ đọc liên tục. Chữ báo điểm nổi đã aria-live.
  const bar = el('div', 'sb')
  bar.setAttribute('aria-label', 'Bảng điểm')
  const mkSide = (a: 'red' | 'blue') => {
    const box = el('div', 'sb-side')
    box.dataset.side = a
    const hd = el('div', 'sb-hd')
    hd.append(el('b', undefined, ALLIANCE_NAME[a]))
    const rows = el('div')
    rows.style.display = 'contents'
    box.append(hd, rows)
    return { box, rows, key: '' }
  }
  const red = mkSide('red')
  const blue = mkSide('blue')
  const mid = el('div', 'sb-mid')
  mid.dataset.side = 'total'
  mid.title = 'Điểm trận chung: cả 4 đội cùng nhận'
  const total = el('b', 'sb-total', '0')
  const mult = el('span', 'sb-mult')
  mult.hidden = true
  mult.title = 'Điểm nhiệm vụ × hệ số nhân leo Thang Cứu Hỏa (làm tròn lên)'
  const sub = el('div', 'sb-sub')
  const clock = el('span', 'sb-clock', '0:10')
  const phase = el('span', 'sb-phase', 'XẢ BÓNG')
  sub.append(clock, phase)
  mid.append(total, mult, sub)
  bar.append(red.box, mid, blue.box)

  const pops = el('div', 'sb-pops')
  pops.setAttribute('aria-live', 'polite')
  const count = el('div', 'sb-count')
  const result = el('div', 'sb-result')
  result.hidden = true
  result.setAttribute('role', 'dialog')
  result.setAttribute('aria-label', 'Kết quả trận')
  stage.append(bar, pops, count, result)

  // Thanh chạy nổi (ui/shell.ts) đọc --runbar-top: đặt ngay dưới bảng điểm, đổi theo cỡ bảng (điện thoại / màn to).
  const placeRunbar = () => {
    const top = bar.hidden ? 12 : bar.offsetTop + bar.offsetHeight + 8
    stage.style.setProperty('--runbar-top', `${top}px`)
  }
  new ResizeObserver(placeRunbar).observe(bar)
  placeRunbar()

  const fillSide = (s: typeof red, a: AllianceLine) => {
    const key = a.teams.map((t) => `${t.name}|${t.program}|${t.penalty}|${t.score}`).join('/')
    if (key === s.key) return
    s.key = key
    s.rows.replaceChildren(
      ...a.teams.map((t) => {
        const row = el('div', 'sb-team')
        row.title = `${t.name} · ${t.program}${t.penalty ? ` · phạt ${t.penalty}` : ''} · điểm đội ${t.score}`
        row.append(el('span', 'sb-name', t.name), el('span', 'sb-prog', t.program), el('span', 'sb-pen', penText(t.penalty)), el('b', 'sb-ts', String(t.score)))
        return row
      }),
    )
  }

  let countTimer = 0
  const api: Scoreboard = {
    update(line, news) {
      total.textContent = String(line.total)
      mult.hidden = line.mult === null
      mult.textContent = line.mult ?? ''
      clock.textContent = line.clock
      phase.textContent = line.phase
      phase.dataset.p = line.phase
      fillSide(red, line.red)
      fillSide(blue, line.blue)
      for (const text of news) {
        const p = el('div', 'sb-pop', text)
        p.dataset.neg = String(text.startsWith('−'))
        pops.append(p)
        setTimeout(() => p.remove(), POP_MS)
      }
      while (pops.childElementCount > POP_MAX) pops.firstElementChild!.remove()
    },
    countdown(n) {
      const b = el('b', undefined, n === 0 ? 'BẮT ĐẦU!' : String(n))
      b.dataset.go = String(n === 0)
      count.replaceChildren(b)
      clearTimeout(countTimer)
      countTimer = window.setTimeout(() => count.replaceChildren(), n === 0 ? 1200 : 900)
    },
    result(r, actions) {
      api.clearFx()
      const col = (a: 'red' | 'blue') => {
        const line = r.line[a]
        const c = el('section', 'sb-col')
        c.dataset.side = a
        c.append(el('h3', undefined, `LIÊN MINH ${ALLIANCE_NAME[a]}`))
        for (const t of line.teams) {
          const row = el('div', 'sb-trow')
          row.append(el('span', undefined, t.name), el('b', undefined, String(t.score)))
          row.append(el('small', undefined, `${t.program} · ${t.penalty ? `phạt −${t.penalty}` : 'không bị phạt'}`))
          c.append(row)
        }
        return c
      }
      const mid = el('section', 'sb-col')
      mid.dataset.side = 'total'
      mid.append(el('h3', undefined, 'ĐIỂM TRẬN CHUNG'), el('div', 'sb-big', String(r.line.total)), el('div', 'sb-note', 'Cả 4 đội cùng nhận; điểm đội = điểm chung − phạt'))
      const row = (label: string, value: string, key = false) => {
        const x = el('div', 'sb-row')
        if (key) x.dataset.key = ''
        x.append(el('span', undefined, label), el('b', undefined, value))
        return x
      }
      for (const it of r.items) mid.append(row(it.label, it.value, it.label === 'Điểm nhiệm vụ'))
      if (r.formula) mid.append(row('Điểm trận', r.formula, true))
      if (r.climbs.length) {
        mid.append(el('h4', undefined, 'LEO XÀ'))
        for (const c of r.climbs) {
          const x = el('div', 'sb-row')
          const name = el('span', undefined, `${c.name} `)
          name.append(el('small', undefined, c.level))
          x.append(name, el('b', undefined, c.value))
          mid.append(x)
        }
      }
      const cols = el('div', 'sb-cols')
      cols.append(col('red'), mid, col('blue'))
      const acts = el('div', 'sb-acts')
      const btn = (text: string, on: () => void, main = false) => {
        const b = el('button', main ? 'main' : undefined, text)
        b.type = 'button'
        b.onclick = on
        return b
      }
      if (actions.again) acts.append(btn('Chơi lại', actions.again, !actions.next))
      if (actions.next) acts.append(btn(actions.nextLabel ?? 'Trận kế tiếp', actions.next, true))
      acts.append(btn('Về màn chính', actions.home))
      const card = el('div', 'sb-card')
      card.append(el('h2', undefined, 'HẾT GIỜ — KẾT QUẢ TRẬN'), cols, acts)
      result.replaceChildren(card)
      result.hidden = false
    },
    hideResult() {
      result.hidden = true
      result.replaceChildren()
    },
    clearFx() {
      pops.replaceChildren()
      clearTimeout(countTimer)
      count.replaceChildren()
    },
    visible(v) {
      bar.hidden = !v
      pops.hidden = !v
      placeRunbar()
    },
  }
  return api
}
