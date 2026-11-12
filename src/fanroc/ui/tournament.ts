// Màn giải đấu của ThingBot FanRoc Game (spec §6.6, luật FANROC mục E): Ghi danh 1–2 bạn (tên, robot + đế, chương
// trình, số trận mỗi đội 4–10) → Thử phím (hai bạn) → Lịch bốc thăm → Pit giữa các trận (bảng xếp hạng, trận kế tiếp,
// Vào Xưởng, Vào trận ▶, kết quả các trận máy + Xem nhanh) → bục trao giải. Trận có người chơi do trang (main.ts) chạy
// bằng GameSession; trận toàn máy chạy ngầm bằng playAgents. Giải chỉ ghi kết quả khi một trận đã đấu xong: tải lại
// trang giữa trận thì trận đó đấu lại từ đầu (Review Focus 3).
// Phần thuần (newTournament, seatIds, standingRows, progressText…) chạy được trong Node (tournament.test.ts);
// createTournamentScreen dựng DOM.
import type { Skill } from '../agent.ts'
import { MACHINE_TEAMS, TEAM_COUNT, createTournament, nextMatch, standings, type Entrant, type Played, type Slot, type TournamentState } from '../tournament.ts'
import type { RobotConfig } from '../robots.ts'
import type { Store } from '../store.ts'
import { robotName } from './home.ts'
import { icon } from './icons.ts'

const SKILL_NAME: Record<Skill, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }

/** Đội máy của giải: đủ TEAM_COUNT đội cùng 1–2 bạn (1 bạn ⇒ 7 đội máy, 2 bạn ⇒ 6). */
export const machinesFor = (players: 1 | 2) => MACHINE_TEAMS.slice(0, TEAM_COUNT - players)

/** Giải mới cho 1–2 bạn: bạn p mang tên `names[p]`, robot `cfgs[p]` (bản sao, giữ suốt giải). */
export function newTournament(o: { names: readonly [string, string]; cfgs: readonly [RobotConfig, RobotConfig]; players: 1 | 2; perTeam: number; seed: number }): TournamentState {
  const players = ([0, 1] as const).slice(0, o.players).map((p) => ({ name: o.names[p], robot: { ...o.cfgs[p] }, player: p }))
  return createTournament({ players, perTeam: o.perTeam, seed: o.seed, machines: machinesFor(o.players) })
}

/** Id đội của trận theo thứ tự ghế của trang (SEATS): Đỏ 0, Xanh 0, Đỏ 1, Xanh 1. */
export const seatIds = (s: Slot): string[] => [s.red[0], s.blue[0], s.red[1], s.blue[1]]

/** Seed sân của trận i (cố định theo giải: đấu lại sau khi tải trang, Xem nhanh đều ra cùng sân). */
export const matchSeed = (s: TournamentState, i: number): number => ((s.seed >>> 0) * 31 + (i + 1) * 7919) % 2147483647

const entrant = (s: TournamentState, id: string): Entrant => s.entrants.find((e) => e.id === id)!

/** Bạn nào chơi trận i, ngồi ghế nào. */
export function playersIn(s: TournamentState, i: number): { player: 0 | 1; seat: number }[] {
  return seatIds(s.schedule[i]).flatMap((id, seat) => {
    const e = entrant(s, id)
    return e.kind === 'player' ? [{ player: e.player ?? 0, seat }] : []
  })
}

/** Kết quả một trận theo id đội (cùng thứ tự với `teams`). */
export function played(ids: string[], teams: { score: number; penalty: number }[], matchScore: number, multPct: number): Played {
  return { matchScore, multPct, teams: Object.fromEntries(ids.map((id, k) => [id, { score: teams[k].score, penalty: teams[k].penalty }])) }
}

/** Các trận toàn máy liền nhau từ trận kế tiếp (chạy ngầm trước khi tới trận có người chơi). */
export function pendingMachines(s: TournamentState): number[] {
  const out: number[] = []
  for (let i = nextMatch(s); i !== null && i < s.schedule.length && s.results[i] === null && !playersIn(s, i).length; i++) out.push(i)
  return out
}

/** Số trận đã ghi kết quả. */
export const recorded = (s: TournamentState): number => s.results.filter((r) => r !== null).length

/** Vòng (trận thứ mấy của mỗi đội) của trận i: mỗi vòng 2 trận, 8 đội đều đấu. */
export const roundOf = (i: number): number => Math.floor(i / 2) + 1

/** Chữ trên ô Giải đấu của màn chính. */
export function progressText(s: TournamentState): string {
  const i = nextMatch(s)
  return i === null ? 'Giải đã xong · xem bục trao giải' : `Đấu tiếp · trận ${roundOf(i)}/${s.perTeam}`
}

/** "Tuấn (Mẫu Maker · 2 bánh, Của em v3)" / "Rùa Vàng (Máy Dễ)". */
export function entrantLabel(e: Entrant, program?: string): string {
  if (e.kind === 'machine') return `${e.name} (Máy ${SKILL_NAME[e.skill ?? 'medium']})`
  return `${e.name} (${robotName(e.robot)}${program ? `, ${program}` : ''})`
}

export type StandingRow = {
  id: string
  rank: number
  name: string
  label: string
  player: boolean
  /** Điểm các trận đã tính: "240 + 310"; chưa đấu "—". */
  scores: string
  total: number
  best: number
  /** Tổng Hệ số nhân các trận được tính, phần trăm (515 = 5,15). */
  multSum: number
  penalty: number
  /** Hoà hết tiêu chí (tổng, hệ số, trận cao nhất, phạt) với đội kề bên ⇒ thứ tự do bốc thăm. */
  tie: boolean
  provisional: boolean
}

/** Bảng xếp hạng để vẽ (standings: giữa giải tạm tính, R45). `program(e)` = nhãn chương trình của đội người chơi. */
export function standingRows(s: TournamentState, program: (e: Entrant) => string): StandingRow[] {
  return standings(s).map((r) => {
    const e = entrant(s, r.id)
    return {
      id: r.id, rank: r.rank, name: e.name, label: entrantLabel(e, e.kind === 'player' ? program(e) : undefined), player: e.kind === 'player',
      scores: r.counted.length ? r.counted.join(' + ') : '—', total: r.total, multSum: r.multSum, best: r.best, penalty: r.penalty, tie: r.tieDraw, provisional: r.provisional,
    }
  })
}

/** Một dòng lịch: tên hai liên minh, vòng, có người chơi không. */
export function matchLine(s: TournamentState, i: number): { red: string[]; blue: string[]; round: number; mine: boolean } {
  const slot = s.schedule[i]
  const name = (id: string) => entrant(s, id).name
  return { red: slot.red.map(name), blue: slot.blue.map(name), round: roundOf(i), mine: playersIn(s, i).length > 0 }
}

/**
 * Lưu giải rồi đọc lại: `saveTournament` im lặng khi localStorage chặn / đầy (Task 7), nên chỉ coi là đã lưu khi đọc
 * lại đúng y như vừa ghi.
 */
export function saveTournamentVerified(store: Pick<Store, 'saveTournament' | 'tournament'>, s: TournamentState | null): boolean {
  store.saveTournament(s)
  const back = store.tournament()
  return s === null ? back === null : back !== null && back !== 'corrupt' && JSON.stringify(back) === JSON.stringify(s)
}

export const SAVE_TOUR_FAILED = 'Không lưu được giải — tải lại trang sẽ mất tiến độ'
export const KEYS_NOTE = 'Một số bàn phím không nhận nhiều phím bấm cùng lúc'

// ---------- DOM ----------
export type TourView = 'register' | 'keytest' | 'schedule' | 'pit' | 'podium' | 'corrupt' | 'old'

export interface RegisterView {
  players: 1 | 2
  perTeam: number
  names: [string, string]
  cfg(p: 0 | 1): RobotConfig
  /** Nhãn chương trình bạn p sẽ chạy: "Của em vN" (có bản lưu ở Xưởng cho robot đó) / "Mặc định". */
  program(p: 0 | 1): string
  /** Ô chọn robot / đế / cơ cấu của bạn p (editor.configControls). */
  controls(p: 0 | 1): { el: HTMLElement; refresh(): void }
}

export interface PitView {
  state: TournamentState
  rows: StandingRow[]
  /** Trận kế tiếp (null: hết lịch). */
  next: number | null
  /** "Đang chơi các trận máy…" khi đang chạy ngầm. */
  busy: string | null
  /** Dòng báo (đã lưu chương trình / lỗi lưu giải / trận máy lỗi kèm nút "Thử lại"). */
  notes: { text: string; ok: boolean; retry?: { label: string; run: () => void } }[]
  /** Bạn của giải (nút Vào Xưởng). */
  players: { player: 0 | 1; name: string }[]
}

export interface TourActions {
  setPlayers(n: 1 | 2): void
  setName(p: 0 | 1, name: string): void
  setPerTeam(n: number): void
  /** Ghi danh xong: hai bạn ⇒ Thử phím, một bạn ⇒ bốc thăm. */
  register(): void
  /** Thử phím xong ⇒ bốc thăm. */
  keysDone(): void
  pit(): void
  schedule(): void
  workshop(p: 0 | 1): void
  play(): void
  replay(i: number): void
  newTour(): void
  home(): void
}

export interface TournamentScreen {
  readonly shown: boolean
  readonly view: TourView | null
  register(v: RegisterView): void
  keytest(names: [string, string], status: [string, string]): void
  /** Mỗi khung ở màn Thử phím: robot của bạn đang bấm nháy sáng; dòng tay cầm. */
  lit(on: [boolean, boolean], status: [string, string]): void
  schedule(s: TournamentState): void
  pit(v: PitView): void
  podium(s: TournamentState, rows: StandingRow[]): void
  corrupt(): void
  /** Giải lưu từ trước luật V4: chỉ báo, kèm nút giải mới. */
  old(): void
  hide(): void
}

const CSS = `
.tn-in { max-width: 980px; }
.tn-in h1 { font-size: clamp(18px, 3vw, 26px) !important; }
.tn-box { background: #0007; border: 1px solid #fff2; border-radius: 12px; padding: 12px 14px; display: grid; gap: 10px; min-width: 0; }
.tn-box h3 { margin: 0; font-size: 14px; color: #ffcf5a; letter-spacing: .4px; }
.tn-players { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.tn-box input[type="text"] { font: 700 14px var(--font); padding: 6px 8px; border-radius: 6px; border: 1px solid #fff4; background: #fff; color: #222; width: 100%; box-sizing: border-box; max-width: 260px; }
.tn-box select { font: 13px var(--font); padding: 4px; border-radius: 5px; max-width: 100%; }
.tn-box .fe-cfg { display: flex; flex-wrap: wrap; gap: 6px; color: #eef2fa; }
.tn-machines { display: flex; flex-wrap: wrap; gap: 6px; }
.tn-machines span { font-size: 12px; background: #ffffff1a; border-radius: 12px; padding: 3px 10px; }
.tn-wrap { overflow-x: auto; max-width: 100%; }
.tn-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tn-table th { color: #aab6dd; text-align: left; font-weight: 700; padding: 4px 6px; white-space: nowrap; }
.tn-table td { padding: 5px 6px; border-top: 1px solid #ffffff14; }
.tn-table tr[data-player="true"] td { background: #ffcf5a22; }
.tn-table td.n { font-variant-numeric: tabular-nums; white-space: nowrap; }
.tn-tie { font-size: 11px; color: #ffcf5a; margin-left: 4px; white-space: nowrap; }
.tn-cap { font-size: 12px; color: #aab3c7; }
.tn-next { font-size: 14px; line-height: 1.6; }
.tn-red { color: #ff8a98; font-weight: 800; }
.tn-blue { color: #8fb3ff; font-weight: 800; }
.tn-busy { font-weight: 700; color: #ffcf5a; }
.tn-note { font-size: 13px; font-weight: 700; }
.tn-note[data-ok="true"] { color: #7be3a6; }
.tn-note[data-ok="false"] { color: #ff8a7a; }
.tn-sched { display: grid; gap: 4px; font-size: 13px; }
.tn-sched div { padding: 4px 8px; border-radius: 6px; background: #ffffff0d; }
.tn-sched div[data-mine="true"] { background: #ffcf5a2e; border-left: 3px solid #ffcf5a; }
.tn-sched b.tag { font-size: 11px; background: #ffcf5a; color: #221; padding: 1px 6px; border-radius: 8px; margin-left: 6px; }
.tn-mres { display: grid; gap: 4px; font-size: 12.5px; }
.tn-mres > div { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tn-mres button { font: 700 12px var(--font); padding: 4px 10px; border-radius: 6px; color: #eef2fa; background: #0006; border: 1px solid #fff4; cursor: pointer; }
.tn-mres button:hover, .tn-mres button:focus-visible { background: #fff2; }
.pk-acts button[disabled] { opacity: .45; cursor: not-allowed; }
.tn-keys { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.tn-mini { width: 100%; max-width: 220px; height: auto; display: block; }
.tn-mini rect.bot { fill: #556; stroke: #fff6; transition: fill .08s; }
.tn-mini[data-lit="true"] rect.bot { fill: #ffcf5a; filter: drop-shadow(0 0 6px #ffcf5a); }
.tn-podium { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-items: end; max-width: 620px; }
.tn-step { text-align: center; border-radius: 10px 10px 0 0; padding: 10px 6px; display: grid; gap: 4px; min-width: 0; }
.tn-step b { font: 900 30px/1 var(--font); }
.tn-step span { font-weight: 800; overflow-wrap: anywhere; }
.tn-step small { opacity: .85; }
.tn-step[data-rank="1"] { background: linear-gradient(180deg, #ffd23f, #c98a00); color: #221; min-height: 170px; }
.tn-step[data-rank="2"] { background: linear-gradient(180deg, #e4e8f0, #8f97a8); color: #221; min-height: 130px; }
.tn-step[data-rank="3"] { background: linear-gradient(180deg, #f0a46a, #9a5524); color: #221; min-height: 100px; }
@media (max-width: 700px) { .tn-table { font-size: 12px; } .tn-table th, .tn-table td { padding: 4px 3px; } }
`

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const btn = (text: string, onClick: () => void, cls?: string, ic?: Parameters<typeof icon>[0]): HTMLButtonElement => {
  const b = el('button', cls)
  b.type = 'button'
  if (ic) b.append(icon(ic, 18))
  b.append(text)
  b.onclick = onClick
  return b
}
function segment<T extends string>(items: [T, string][], value: T, onPick: (v: T) => void): HTMLElement {
  const box = el('span', 'pk-seg pk-row')
  for (const [v, text] of items) {
    const b = btn(text, () => onPick(v))
    b.setAttribute('aria-pressed', String(v === value))
    b.dataset.value = v
    box.append(b)
  }
  return box
}
const row = (title: string, ...items: (HTMLElement | string)[]) => {
  const r = el('div', 'pk-row')
  r.append(el('b', undefined, title), ...items)
  return r
}
const head = (title: string, sub?: string) => {
  const h = el('div', 'hm-brand')
  h.append(el('h1', undefined, title))
  if (sub) h.append(el('div', 'hm-sub', sub))
  return h
}
const alliances = (l: { red: string[]; blue: string[] }) => {
  const f = document.createDocumentFragment()
  f.append(el('span', 'tn-red', `ĐỎ: ${l.red.join(' + ')}`), ' · ', el('span', 'tn-blue', `XANH: ${l.blue.join(' + ')}`))
  return f
}

/** Tổng hệ số nhân (phần trăm) ra chữ: 515 ⇒ "5,15" (dấu phẩy thập phân như phần còn lại của game). */
export const multText = (pct: number): string => (pct / 100).toFixed(2).replace('.', ',')

/** Bảng xếp hạng (Pit, bục trao giải). */
function table(rows: StandingRow[]): HTMLElement {
  const wrap = el('div', 'tn-wrap')
  const t = el('table', 'tn-table')
  t.dataset.role = 'standings'
  const hr = el('tr')
  for (const h of ['Hạng', 'Đội', 'Điểm các trận', 'Điểm xếp hạng', 'Hệ số', 'Trận cao nhất', 'Phạt']) hr.append(el('th', undefined, h))
  t.append(hr)
  /** Cùng nhóm hoà (tổng, trận cao nhất, phạt đều bằng) với dòng trên. */
  const sameAsPrev = (k: number) => k > 0 && rows[k - 1].total === rows[k].total && rows[k - 1].multSum === rows[k].multSum && rows[k - 1].best === rows[k].best && rows[k - 1].penalty === rows[k].penalty
  rows.forEach((r, k) => {
    const tr = el('tr')
    tr.dataset.player = String(r.player)
    tr.dataset.id = r.id
    const rank = el('td', 'n', String(r.rank))
    // "bốc thăm" một lần ở dòng đầu mỗi nhóm hoà (chưa đội nào có điểm thì không ghi).
    if (r.tie && r.total > 0 && !sameAsPrev(k)) {
      let n = 1
      while (k + n < rows.length && sameAsPrev(k + n)) n++
      const tag = el('span', 'tn-tie', `bốc thăm hạng ${r.rank}–${r.rank + n - 1}`)
      tag.dataset.role = 'tie'
      rank.append(tag)
    }
    const team = el('td')
    if (r.player) {
      const open = r.label.indexOf(' (')
      team.append(el('b', undefined, r.name), open >= 0 ? r.label.slice(open) : '')
    } else team.textContent = r.label
    const total = el('td', 'n')
    total.append(el('b', undefined, String(r.total)))
    tr.append(rank, team, el('td', 'n', r.scores), total, el('td', 'n', multText(r.multSum)), el('td', 'n', String(r.best)), el('td', 'n', r.penalty ? `−${r.penalty}` : '0'))
    t.append(tr)
  })
  wrap.append(t)
  return wrap
}

/** Sân nhỏ của màn Thử phím: robot của bạn đó nháy sáng khi bạn bấm. */
function mini(label: string): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 120 80')
  svg.setAttribute('class', 'tn-mini')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', label)
  svg.innerHTML =
    '<rect x="1" y="1" width="118" height="78" rx="6" fill="#5f6663" stroke="#eef0ee" stroke-width="2"/>' +
    '<rect x="44" y="14" width="32" height="22" rx="3" fill="#2f9e57" opacity=".8"/>' +
    '<rect class="bot" x="50" y="48" width="20" height="20" rx="4" stroke-width="1.5"/>'
  svg.dataset.lit = 'false'
  return svg
}

export function createTournamentScreen(root: HTMLElement, act: TourActions): TournamentScreen {
  if (!document.getElementById('tn-css')) {
    const s = el('style')
    s.id = 'tn-css'
    s.textContent = CSS
    document.head.append(s)
  }
  const box = el('section', 'hm')
  box.dataset.screen = 'tournament'
  box.setAttribute('aria-label', 'Giải đấu')
  box.hidden = true
  const inner = el('div', 'hm-in tn-in')
  box.append(inner)
  root.append(box)
  let view: TourView | null = null
  let minis: SVGSVGElement[] = []
  let pads: HTMLElement[] = []
  /** Bấm Bỏ giải lần đầu chỉ hỏi lại (không dùng confirm của trình duyệt). */
  let confirmDrop = false

  const put = (v: TourView, ...nodes: HTMLElement[]) => {
    // Vẽ lại cùng màn (trận máy vừa ghi ⇒ Pit vẽ lại): giữ tiêu điểm ở nút có cùng data-key.
    const act = document.activeElement as HTMLElement | null
    const key = !box.hidden && view === v && act && box.contains(act) ? act.dataset.key : undefined
    if (view !== v) confirmDrop = false
    view = v
    box.dataset.view = v
    inner.replaceChildren(...nodes)
    box.hidden = false
    if (key) inner.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus()
  }
  const acts = (...b: HTMLButtonElement[]) => {
    const a = el('div', 'pk-acts')
    a.append(...b)
    return a
  }
  const homeBtn = () => btn('Về màn chính', act.home, undefined, 'home')

  return {
    get shown() {
      return !box.hidden
    },
    get view() {
      return box.hidden ? null : view
    },
    register(v) {
      const players = el('div', 'tn-players')
      for (const p of ([0, 1] as const).slice(0, v.players)) {
        const card = el('div', 'tn-box')
        card.dataset.player = String(p)
        const name = el('input')
        name.type = 'text'
        name.value = v.names[p]
        name.maxLength = 24
        name.setAttribute('aria-label', `Tên bạn ${p + 1}`)
        name.onchange = () => act.setName(p, name.value.trim() || `Bạn ${p + 1}`)
        const c = v.controls(p)
        c.refresh()
        const prog = el('span', 'prog', v.program(p))
        prog.dataset.mine = String(v.program(p) !== 'Mặc định')
        prog.dataset.role = 'program'
        card.append(el('h3', undefined, `Bạn ${p + 1}`), name, row('Robot', c.el), row('Chương trình', prog))
        if (v.program(p) === 'Mặc định') card.append(el('div', 'pk-note', 'Chưa lưu chương trình ở Xưởng cho robot này — robot chạy chương trình mặc định.'))
        players.append(card)
      }
      const per = el('select')
      per.setAttribute('aria-label', 'Số trận mỗi đội')
      per.dataset.role = 'per-team'
      for (let n = 4; n <= 10; n++) per.append(Object.assign(el('option', undefined, `${n} trận`), { value: String(n) }))
      per.value = String(v.perTeam)
      per.onchange = () => act.setPerTeam(Number(per.value))
      const machines = el('div', 'tn-machines')
      machines.dataset.role = 'machines'
      for (const m of machinesFor(v.players)) machines.append(el('span', undefined, `${m.name} · Máy ${SKILL_NAME[m.skill]}`))
      const rules = el('div', 'tn-box')
      rules.append(
        row('Số bạn chơi', segment([['1', '1 bạn'], ['2', '2 bạn']], String(v.players) as '1' | '2', (x) => act.setPlayers(Number(x) as 1 | 2))),
        row('Số trận mỗi đội', per),
        row(`${machinesFor(v.players).length} đội máy`, machines),
        el('div', 'pk-note', 'Mỗi trận 10 giây xả bóng + 3 phút; 4 đội chia hai liên minh, cùng nhận chung điểm trận. Điểm xếp hạng = tổng điểm đội các trận; bằng điểm xét trận cao nhất, rồi ít phạt hơn, rồi bốc thăm.'),
      )
      put(
        'register',
        head('GIẢI ĐẤU · GHI DANH', 'Ghi danh 1–2 bạn cho vòng xếp hạng 8 đội, bốc thăm liên minh mỗi trận. Mỗi bạn lái robot riêng, giữ robot suốt giải.'),
        rules,
        players,
        acts(btn(v.players === 2 ? 'Thử phím' : 'Bốc thăm lịch đấu', act.register, 'main', 'play'), homeBtn()),
      )
    },
    keytest(names, status) {
      const keys = el('div', 'tn-keys')
      minis = []
      pads = []
      const how = [
        'Bàn phím nửa trái: W A S D chạy, Q E đi ngang, R F C V là △ ✕ □ ○, 1 2 3 4 là L1 R1 L2 R2 — hoặc tay PS2 thứ nhất.',
        'Bàn phím nửa phải: mũi tên chạy, dấu phẩy / chấm đi ngang, I K J L là △ ✕ □ ○, U O Y P là L1 R1 L2 R2 — hoặc tay PS2 thứ hai.',
      ]
      for (const p of [0, 1] as const) {
        const card = el('div', 'tn-box')
        card.dataset.player = String(p)
        const m = mini(`Robot của ${names[p]}`)
        const pad = el('div', 'pk-note', status[p])
        minis.push(m)
        pads.push(pad)
        card.append(el('h3', undefined, names[p]), m, el('div', 'pk-note', how[p]), pad)
        keys.append(card)
      }
      put(
        'keytest',
        head('THỬ PHÍM', 'Mỗi bạn bấm thử phím của mình: robot của bạn nào sáng lên là đúng tay.'),
        keys,
        el('div', 'pk-note', `${KEYS_NOTE} — khi đó cắm thêm tay PS2.`),
        acts(btn('Bốc thăm lịch đấu', act.keysDone, 'main', 'play'), homeBtn()),
      )
    },
    lit(on, status) {
      minis.forEach((m, p) => {
        const v = String(on[p])
        if (m.dataset.lit !== v) m.dataset.lit = v
      })
      pads.forEach((d, p) => {
        if (d.textContent !== status[p]) d.textContent = status[p]
      })
    },
    schedule(s) {
      const list = el('div', 'tn-sched')
      list.dataset.role = 'schedule'
      s.schedule.forEach((_, i) => {
        const l = matchLine(s, i)
        const d = el('div')
        d.dataset.mine = String(l.mine)
        d.append(`Trận ${i + 1} · vòng ${l.round} · `, alliances(l))
        if (l.mine) d.append(el('b', 'tag', 'có em'))
        list.append(d)
      })
      const b = el('div', 'tn-box')
      b.append(el('h3', undefined, `Lịch đấu · ${s.schedule.length} trận · mỗi đội ${s.perTeam} trận`), list)
      put('schedule', head('LỊCH ĐẤU (BỐC THĂM)', 'Mỗi vòng 8 đội đều đấu một trận, liên minh bốc thăm lại mỗi vòng. Trận đánh dấu "có em" là trận em lái robot.'), b, acts(btn('Vào Pit', act.pit, 'main'), homeBtn()))
    },
    pit(v) {
      const s = v.state
      const done = s.results.filter((r) => r !== null).length
      const nodes: HTMLElement[] = []
      const round = v.next === null ? s.perTeam : roundOf(v.next)
      nodes.push(head(`GIẢI THỬ · VÒNG XẾP HẠNG · TRẬN ${round}/${s.perTeam}`, `Pit — xem bảng xếp hạng, sửa chương trình ở Xưởng rồi đấu tiếp. Đã đấu ${done}/${s.schedule.length} trận.`))
      for (const n of v.notes) {
        const d = el('div', 'tn-note', n.text)
        d.dataset.ok = String(n.ok)
        d.setAttribute('role', n.ok ? 'status' : 'alert')
        if (n.retry) {
          const r = btn(n.retry.label, n.retry.run)
          r.dataset.role = 'retry'
          d.append(' ', r)
        }
        nodes.push(d)
      }
      const st = el('div', 'tn-box')
      const cap = el('div', 'tn-cap', v.rows[0]?.provisional ? 'Xếp hạng tạm tính theo các trận đã đấu.' : 'Xếp hạng chung cuộc.')
      st.append(el('h3', undefined, 'Bảng xếp hạng'), table(v.rows), cap)
      nodes.push(st)
      const nx = el('div', 'tn-box')
      nx.dataset.role = 'next'
      if (v.next !== null) {
        const l = matchLine(s, v.next)
        const p = el('div', 'tn-next')
        p.append(`Trận kế tiếp · trận ${v.next + 1}/${s.schedule.length} (bốc thăm) · `, alliances(l))
        if (!l.mine) p.append(el('div', 'tn-cap', 'Trận này chỉ có đội máy — máy tự chơi ngầm.'))
        nx.append(el('h3', undefined, 'Trận kế tiếp'), p)
      }
      if (v.busy) {
        const b = el('div', 'tn-busy', v.busy)
        b.dataset.role = 'busy'
        b.setAttribute('role', 'status')
        nx.append(b)
      }
      const playable = v.next !== null && !v.busy && matchLine(s, v.next).mine
      const play = btn('Vào trận ▶', act.play, 'main')
      play.disabled = !playable
      play.dataset.role = 'play'
      play.dataset.key = 'play'
      const ws = v.players.map((x) => {
        const b = btn(v.players.length === 2 ? `Vào Xưởng sửa chương trình · ${x.name}` : 'Vào Xưởng sửa chương trình', () => act.workshop(x.player))
        b.dataset.key = `ws${x.player}`
        return b
      })
      const drop = btn(confirmDrop ? 'Bấm lần nữa để bỏ giải này' : 'Bỏ giải, ghi danh lại', () => {
        if (confirmDrop) return ((confirmDrop = false), act.newTour())
        confirmDrop = true
        drop.textContent = 'Bấm lần nữa để bỏ giải này'
      })
      drop.dataset.key = 'drop'
      drop.dataset.role = 'drop'
      const sched = btn('Xem lịch', act.schedule)
      sched.dataset.key = 'schedule'
      const home = homeBtn()
      home.dataset.key = 'home'
      nx.append(acts(play, ...ws), acts(sched, home, drop))
      nodes.push(nx)
      // Kết quả các trận toàn máy đã chơi ngầm, có nút Xem nhanh (chạy lại trận đó ×40 trên sân).
      const mres = el('div', 'tn-mres')
      mres.dataset.role = 'machine-results'
      s.results.forEach((r, i) => {
        if (!r || matchLine(s, i).mine) return
        const d = el('div')
        const see = btn('Xem nhanh', () => act.replay(i))
        see.dataset.key = `replay${i}`
        d.append(`Trận ${i + 1} · `, alliances(matchLine(s, i)), ` · điểm trận ${r.matchScore}`, see)
        mres.append(d)
      })
      if (mres.childElementCount) {
        const m = el('div', 'tn-box')
        m.append(el('h3', undefined, 'Các trận máy đã chơi'), mres)
        nodes.push(m)
      }
      put('pit', ...nodes)
    },
    podium(s, rows) {
      const pod = el('div', 'tn-podium')
      pod.dataset.role = 'podium'
      for (const rank of [2, 1, 3]) {
        const r = rows[rank - 1]
        if (!r) continue
        const step = el('div', 'tn-step')
        step.dataset.rank = String(rank)
        step.append(el('b', undefined, String(rank)), el('span', undefined, r.name), el('small', undefined, `${r.total} điểm`))
        pod.append(step)
      }
      const st = el('div', 'tn-box')
      st.append(el('h3', undefined, 'Bảng xếp hạng chung cuộc'), table(rows))
      put(
        'podium',
        head('BỤC TRAO GIẢI', `Hết vòng xếp hạng: mỗi đội ${s.perTeam} trận. Chúc mừng các đội!`),
        pod,
        st,
        acts(btn('Giải mới', act.newTour, 'main'), homeBtn()),
      )
    },
    corrupt() {
      put(
        'corrupt',
        head('GIẢI ĐẤU', 'Không đọc được giải đang dở — dữ liệu trong trình duyệt bị hỏng. Bắt đầu giải mới nhé.'),
        acts(btn('Giải mới', act.newTour, 'main'), homeBtn()),
      )
    },
    old() {
      const n = el('div', 'tn-note', 'Giải này đấu theo luật cũ (trước V4).')
      n.dataset.role = 'old-rules'
      put('old', head('GIẢI ĐẤU', 'Giải đang dở được lưu từ bản trước nên không xếp hạng được theo luật mới. Em bắt đầu giải mới nhé.'), n, acts(btn('Giải mới', act.newTour, 'main'), homeBtn()))
    },
    hide() {
      box.hidden = true
      confirmDrop = false
      minis = []
      pads = []
    },
  }
}
