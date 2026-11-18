// Màn Ban tổ chức (spec 2026-11-18-fanroc-btc-trong-tai-design.md §1, §2, §4, §6, §7): điều hành giải FANROC thật trên
// máy BTC — tên giải + sao lưu, danh sách đội (Excel), vòng + lịch, điều hành từng sân (trọng tài chấm bằng điện thoại
// qua máy chủ BTC trong app), kết quả + xếp hạng, địa chỉ / QR cho điện thoại và màn chiếu, xuất Excel.
// Nguồn sự thật là BtcHost (btc/host.ts) trên trang này; mỗi thay đổi lưu ngay (btc_save / localStorage).
// Phần thuần (scheduleRows, nextMatch, parseEvent, backupName…) chạy được trong Node (btc.test.ts); createBtcScreen dựng DOM.
import { emptySheet, newEvent, type Action, type EMatch, type EventState, type HalfSheet, type Live, type Round, type Side, type Team } from '../btc/event.ts'
import { makeSchedule, slotTime, type SchedQuality } from '../btc/schedule.ts'
import { halfScore, liveScore, teamPoints } from '../btc/sheet.ts'
import { roundStandings } from '../btc/rank.ts'
import { exportEvent, importTeams, templateXlsx, type ImportRow } from '../btc/excel.ts'
import { sanitizeSheet } from '../btc/validate.ts'
import { BtcHost } from '../btc/host.ts'
import { connectBtc, type BtcLink } from '../btc/link.ts'
import { btcBackend, serialSaver, type BtcBackend } from '../btc/backend.ts'
import { qrSvg } from '../btc/qr.ts'
import { MTN_NAME } from '../btc/halfmap.ts'
import type { Climb } from '../ladder.ts'
import { pctText } from '../scoring.ts'
import type { Sound } from './sound.ts'

// ---------- phần thuần ----------
export type ScheduleRow = { id: string; slot: number; time: string; field: number; red: [string, string]; blue: [string, string]; done: boolean }

/** Bảng lịch để vẽ: lượt và sân đếm từ 1, giờ theo slotTime, ghế trống "—", đội không còn trong danh sách ⇒ id. */
export function scheduleRows(round: Round, teams: Team[]): ScheduleRow[] {
  const name = (id: string | null) => (id === null ? '—' : teams.find((t) => t.id === id)?.name ?? id)
  return round.matches.map((m) => ({
    id: m.id, slot: m.slot + 1, time: slotTime(round.startAt, round.slotMin, m.slot), field: m.field + 1,
    red: [name(m.red[0]), name(m.red[1])], blue: [name(m.blue[0]), name(m.blue[1])], done: !!round.results[m.id],
  }))
}

/** Trận kế của sân: trận chưa có kết quả, không đang đấu (`busy`), lượt sớm nhất. */
export function nextMatch(round: Round, field: number, busy: Set<string>): EMatch | undefined {
  return round.matches.filter((m) => m.field === field && !round.results[m.id] && !busy.has(m.id)).sort((a, b) => a.slot - b.slot)[0]
}

/** Các sân có trận trong vòng (tăng dần). */
export const fieldsOf = (round: Round): number[] => [...new Set(round.matches.map((m) => m.field))].sort((a, b) => a - b)

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Đọc file giải (JSON) đã lưu / sao lưu; sai hình ⇒ null. */
export function parseEvent(json: string): EventState | null {
  let o: unknown
  try {
    o = JSON.parse(json)
  } catch {
    return null
  }
  if (!isObj(o) || o.version !== 1 || typeof o.name !== 'string' || !Array.isArray(o.teams) || !Array.isArray(o.rounds) || !isObj(o.live) || !isObj(o.codes)) return null
  if (!o.rounds.every((r) => isObj(r) && typeof r.id === 'string' && Array.isArray(r.matches) && isObj(r.results) && Array.isArray(r.edits))) return null
  if (!o.teams.every((t) => isObj(t) && typeof t.id === 'string' && typeof t.name === 'string')) return null
  return o as unknown as EventState
}

/** Tên giải ⇒ phần tên tệp: bỏ dấu, chữ thường, gạch nối. */
export const slug = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'giai'

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`

/** Tên tệp sao lưu giải: `giai-<tên>-<ngày giờ>.json`. */
export function backupName(name: string, d: Date): string {
  const t = slug(name).replace(/^giai(-|$)/, '') // "Giải FANROC" ⇒ không lặp "giai-giai-"
  return `giai-${t ? `${t}-` : ''}${stamp(d)}.json`
}

/** Mã sân 4 chữ số ngẫu nhiên. */
export function randomCode(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  const n = c?.getRandomValues ? c.getRandomValues(new Uint32Array(1))[0] % 10000 : Math.floor(Math.random() * 10000)
  return String(n).padStart(4, '0')
}

const randomSeed = () => Math.floor(Math.random() * 0x7fffffff)
const msg = (e: unknown) => {
  const t = e instanceof Error ? e.message : String(e)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// ---------- DOM ----------
export interface BtcScreen {
  readonly shown: boolean
  /** Bộ điều hành của giải đang mở (null: chưa mở giải). */
  readonly host: BtcHost | null
  show(): Promise<void>
  hide(): void
}

export interface BtcDeps {
  home(): void
  tournament(): void
  sound: Sound
  backend?: BtcBackend
}

const BT_CSS = `
.bt-in { max-width: 1100px; }
.bt-in > .hm-brand { flex: 0 0 auto; }
.bt-in h1 { font-size: clamp(18px, 3vw, 26px) !important; margin: 0; }
.bt-nav { display: flex; flex-wrap: wrap; gap: 6px; position: sticky; top: 0; z-index: 2; padding: 6px 0; background: #101a50ee; }
.bt-nav button { font: 700 12.5px var(--font); color: #eef2fa; background: #0006; border: 1px solid #fff3; border-radius: 14px; padding: 5px 12px; cursor: pointer; }
.bt-box { background: #0007; border: 1px solid #fff2; border-radius: 12px; padding: 12px 14px; display: grid; gap: 10px; min-width: 0; scroll-margin-top: 48px; }
.bt-box h2 { margin: 0; font-size: 16px; color: #ffcf5a; letter-spacing: .4px; }
.bt-box h3 { margin: 0; font-size: 14px; color: #ffcf5a; }
.bt-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.bt-row > b { font-size: 12.5px; color: #c2cbea; }
.bt-box button { font: 700 13.5px var(--font); color: #eef2fa; background: #0006; border: 1px solid #fff4; border-radius: 8px; padding: 7px 12px; cursor: pointer; min-height: 34px; }
.bt-box button.main { background: #1fa860; border-color: #1fa860; color: #fff; }
.bt-box button.warn { background: #b3261e; border-color: #b3261e; color: #fff; }
.bt-box button[aria-pressed="true"] { background: #ffcf5a; color: #221; border-color: #ffcf5a; }
.bt-box button:disabled { opacity: .45; cursor: not-allowed; }
.bt-box input[type="text"], .bt-box input[type="number"], .bt-box input[type="time"], .bt-box select { font: 700 13.5px var(--font); padding: 5px 7px; border-radius: 6px; border: 1px solid #fff4; background: #fff; color: #222; box-sizing: border-box; max-width: 100%; }
.bt-box input[type="number"] { width: 70px; }
.bt-box input.wide { width: 280px; }
.bt-box input.mid { width: 150px; }
.bt-wrap { overflow: auto; max-width: 100%; max-height: 380px; }
.bt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.bt-table th { color: #aab6dd; text-align: left; font-weight: 700; padding: 4px 6px; white-space: nowrap; position: sticky; top: 0; background: #141c4a; }
.bt-table td { padding: 4px 6px; border-top: 1px solid #ffffff14; vertical-align: middle; }
.bt-table td.n { font-variant-numeric: tabular-nums; white-space: nowrap; }
.bt-table tr[data-bad="true"] td { background: #ff4d4d33; color: #ffd0d0; }
.bt-table tr[data-done="true"] td { color: #9fe6bd; }
.bt-table tr[data-out="true"] td { opacity: .55; }
.bt-table input[type="text"] { width: 120px; }
.bt-red { color: #ff8a98; font-weight: 800; }
.bt-blue { color: #8fb3ff; font-weight: 800; }
.bt-note { font-size: 13px; font-weight: 700; }
.bt-note[data-ok="true"] { color: #7be3a6; }
.bt-note[data-ok="false"] { color: #ff8a7a; }
.bt-cap { font-size: 12.5px; color: #aab3c7; line-height: 1.5; }
.bt-status { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; font-weight: 700; }
.bt-status [data-ok="true"] { color: #7be3a6; }
.bt-status [data-ok="false"] { color: #ff8a7a; }
.bt-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.bt-field { border: 2px solid #fff3; border-radius: 12px; padding: 10px 12px; display: grid; gap: 8px; align-content: start; background: #ffffff0a; min-width: 0; }
.bt-field[data-phase="play"] { border-color: #1fa860; }
.bt-field[data-phase="inventory"] { border-color: #ffcf5a; }
.bt-field h3 { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.bt-code { font: 900 20px var(--font); letter-spacing: 3px; color: #fff; }
.bt-clock { font: 900 26px var(--font); font-variant-numeric: tabular-nums; }
.bt-halves { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
.bt-half { border-radius: 8px; padding: 6px 8px; background: #0005; font-size: 12.5px; }
.bt-half[data-side="red"] { border-left: 4px solid #e2384d; }
.bt-half[data-side="blue"] { border-left: 4px solid #2463eb; }
.bt-half table { width: 100%; border-collapse: collapse; }
.bt-half td { padding: 2px 4px; border-top: 1px solid #ffffff12; }
.bt-half td:last-child { text-align: right; font-weight: 800; white-space: nowrap; }
.bt-half input[type="number"] { width: 58px; }
.bt-qrs { display: flex; flex-wrap: wrap; gap: 14px; }
.bt-qr { display: grid; gap: 6px; justify-items: start; max-width: 240px; }
.bt-qr .svg { width: 180px; height: 180px; background: #fff; border-radius: 6px; }
.bt-qr .svg svg { width: 100%; height: 100%; display: block; }
.bt-url { font: 800 15px var(--font); color: #fff; word-break: break-all; user-select: all; }
.bt-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 4px 12px; max-height: 260px; overflow: auto; font-size: 13px; }
.bt-checks label { display: flex; gap: 6px; align-items: center; }
.bt-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
@media (max-width: 700px) { .bt-table { font-size: 12px; } .bt-fields { grid-template-columns: 1fr; } }
`

type El = HTMLElement | string
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const box = (tag: keyof HTMLElementTagNameMap, cls: string | undefined, ...kids: El[]) => {
  const e = el(tag, cls)
  e.append(...kids)
  return e
}
const note = (text: string, ok: boolean) => {
  const n = el('div', 'bt-note', text)
  n.dataset.ok = String(ok)
  if (!ok) n.setAttribute('role', 'alert')
  return n
}
const table = (head: string[], rows: HTMLTableRowElement[], role?: string) => {
  const t = el('table', 'bt-table')
  if (role) t.dataset.role = role
  const hr = el('tr')
  for (const h of head) hr.append(el('th', undefined, h))
  t.append(hr, ...rows)
  return box('div', 'bt-wrap', t)
}
const tr = (...cells: (El | HTMLTableCellElement)[]) => {
  const r = el('tr')
  for (const c of cells) r.append(c instanceof HTMLTableCellElement ? c : box('td', undefined, c))
  return r
}
const td = (text: string, cls = 'n') => el('td', cls, text)

const SIDES: Side[] = ['red', 'blue']
const SIDE_NAME: Record<Side, string> = { red: 'Đỏ', blue: 'Xanh' }
const REF_TEXT = { off: 'chưa vào', on: 'đã nối', sent: 'đã gửi kiểm kê' } as const
const CLIMBS: [Climb, string][] = [['none', 'Không'], ['contact', 'Chạm'], ['ground', 'Đất'], ['water', 'Nước']]
const PHASE_TEXT: Record<Live['phase'], string> = { ready: 'Sắp vào trận', play: 'Đang đấu', inventory: 'Hết giờ — chờ kiểm kê', done: 'Xong' }
const clockText = (s: number | null) => (s === null ? '' : `${Math.floor(s / 60)}:${pad(s % 60)}`)
const timeNow = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

type Sec = 'status' | 'event' | 'teams' | 'rounds' | 'run' | 'results' | 'conn' | 'export'
const SECS: Sec[] = ['status', 'event', 'teams', 'rounds', 'run', 'results', 'conn', 'export']
const SEC_TITLE: Partial<Record<Sec, string>> = { event: 'Giải', teams: 'Đội', rounds: 'Vòng', run: 'Điều hành', results: 'Kết quả', conn: 'Kết nối', export: 'Xuất Excel' }
type TeamDraft = Omit<Team, 'id' | 'withdrawn'>
const blankTeam = (): TeamDraft => ({ code: '', name: '', school: '', province: '', advisor: '' })

export function createBtcScreen(root: HTMLElement, deps: BtcDeps): BtcScreen {
  if (!document.getElementById('bt-css')) {
    const s = el('style')
    s.id = 'bt-css'
    s.textContent = BT_CSS
    document.head.append(s)
  }
  const backend = deps.backend ?? btcBackend()
  const screen = el('section', 'hm')
  screen.dataset.screen = 'btc'
  screen.setAttribute('aria-label', 'Ban tổ chức')
  screen.hidden = true
  const inner = el('div', 'hm-in bt-in')
  screen.append(inner)
  root.append(screen)

  // ---- trạng thái màn (không lưu) ----
  let active = false
  let phase: 'loading' | 'ask' | 'main' = 'loading'
  let saved: EventState | null = null
  let host: BtcHost | null = null
  let link: BtcLink | null = null
  let server: { url: string; addrs: string[]; port: number } | null = null
  let connNote: string | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let saveNote: { ok: boolean; text: string } | null = null
  let eventNote: { ok: boolean; text: string } | null = null
  let teamNote: { ok: boolean; text: string } | null = null
  let roundNote: { ok: boolean; text: string } | null = null
  let resultNote: { ok: boolean; text: string } | null = null
  let exportNote: { ok: boolean; text: string } | null = null
  /** Nút hai bước đang chờ bấm lần nữa (Giải mới, Hủy trận, Rút lui…). */
  let armed: string | null = null
  const fieldErr = new Map<number, string>()
  let curRound: string | null = null
  let creating = false
  let preview: { rows: ImportRow[]; file: string } | null = null
  let teamEdit: { id: string; draft: TeamDraft } | null = null
  const teamAdd: TeamDraft = blankTeam()
  const rf = { touched: false, final: false, name: 'Sơ loại', from: null as string | null, sel: new Set<string>(), perTeam: 5, fields: 1, slotMin: 7, startAt: '08:00' }
  const quality = new Map<string, { quality: SchedQuality; notes: string[] }>()
  let late: { roundId: string; add: Set<string>; perTeam: number } | null = null
  let editor: { roundId: string; matchId: string; red: HalfSheet; blue: HalfSheet; committedAt: number } | null = null
  const lastPhase = new Map<number, Live['phase'] | null>()
  let runSig = ''
  const secs = new Map<Sec, HTMLElement>()

  const S = () => host!.state
  const round = (): Round | undefined => (host ? S().rounds.find((r) => r.id === curRound) ?? S().rounds.at(-1) : undefined)
  const teamName = (id: string | null) => (id === null ? '—' : S().teams.find((t) => t.id === id)?.name ?? id)
  const busy = () => new Set(Object.values(S().live).filter((l): l is Live => !!l).map((l) => l.matchId))

  // ---- lưu ----
  const saver = serialSaver((json) => backend.save(json), (e) => {
    const next = e ? { ok: false, text: `Không lưu được giải: ${msg(e)}` } : { ok: true, text: `Đã lưu ${timeNow()}` }
    saveNote = next
    renderSoon(['status'])
  })
  const persist = () => {
    if (host) void saver(JSON.stringify(host.state))
  }

  // ---- vẽ ----
  let pending = new Set<Sec>()
  let pointerHeld = false
  const deferred = new Set<Sec>()
  screen.addEventListener('pointerdown', () => void (pointerHeld = true), true)
  const release = () => {
    if (!pointerHeld) return
    pointerHeld = false
    // sau sự kiện click của lần nhả này
    setTimeout(() => {
      const w = [...deferred]
      deferred.clear()
      if (w.length) renderSoon(w)
    }, 0)
  }
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, release, true)
  let queued = false
  const renderSoon = (which: Sec[] = SECS) => {
    for (const s of which) pending.add(s)
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      const w = [...pending]
      pending = new Set()
      render(w)
    })
  }
  /** Bấm nút: bỏ nút hai bước đang chờ (trừ chính nó), làm việc, vẽ lại cả màn. */
  const run = (fn: () => unknown, key?: string) => () => {
    if (armed !== key) armed = null
    try {
      const p = fn()
      if (p instanceof Promise) void p.catch((e) => console.warn('BTC:', e)).finally(() => renderSoon())
    } finally {
      renderSoon()
    }
  }
  const btn = (text: string, onClick: () => void | Promise<void>, o: { cls?: string; key?: string; disabled?: boolean; role?: string } = {}) => {
    const b = el('button', o.cls, text)
    b.type = 'button'
    if (o.key) b.dataset.key = o.key
    if (o.role) b.dataset.role = o.role
    if (o.disabled) b.disabled = true
    b.onclick = run(onClick)
    return b
  }
  /** Nút hai bước: lần đầu đổi chữ thành lời hỏi lại, lần hai mới làm. */
  const btn2 = (key: string, text: string, again: string, onConfirm: () => void | Promise<void>, cls = 'warn') => {
    const on = armed === key
    const b = el('button', cls, on ? again : text)
    b.type = 'button'
    b.dataset.key = key
    b.onclick = run(() => {
      if (armed === key) {
        armed = null
        return onConfirm()
      }
      armed = key
    }, key)
    return b
  }
  const input = (key: string, value: string | number, set: (v: string) => void, o: { type?: string; cls?: string; label: string; change?: boolean; min?: number; max?: number }) => {
    const i = el('input', o.cls)
    i.type = o.type ?? 'text'
    i.value = String(value)
    i.dataset.key = key
    i.setAttribute('aria-label', o.label)
    if (o.min !== undefined) i.min = String(o.min)
    if (o.max !== undefined) i.max = String(o.max)
    if (o.change) i.onchange = run(() => set(i.value))
    else i.oninput = () => set(i.value)
    return i
  }
  const select = (key: string, items: [string, string][], value: string, set: (v: string) => void, label: string) => {
    const s = el('select')
    s.dataset.key = key
    s.setAttribute('aria-label', label)
    for (const [v, t] of items) s.append(Object.assign(el('option', undefined, t), { value: v }))
    s.value = value
    s.onchange = run(() => set(s.value))
    return s
  }
  const range = (a: number, b: number): [string, string][] => Array.from({ length: b - a + 1 }, (_, i) => [String(a + i), String(a + i)])

  /** Thao tác qua bộ điều hành: lỗi của reduce ⇒ dòng đỏ (của sân `field` nếu có). */
  const act = (a: Action, field?: number, set?: (n: { ok: boolean; text: string } | null) => void): boolean => {
    try {
      host!.dispatch(a)
      if (field !== undefined) fieldErr.delete(field)
      return true
    } catch (e) {
      if (field !== undefined) fieldErr.set(field, msg(e))
      else (set ?? ((n) => (eventNote = n)))({ ok: false, text: msg(e) })
      return false
    }
  }

  const render = (which: Sec[]) => {
    if (!active) return
    if (pointerHeld) {
      // đang nhấn chuột / chạm: vẽ lại sau khi nhả để cú bấm không rơi vào nút vừa bị thay
      for (const s of which) deferred.add(s)
      return
    }
    if (phase !== 'main' || !host) {
      renderGate()
      return
    }
    if (!secs.size) {
      buildFrame()
      which = SECS
    }
    for (const s of which) {
      const target = secs.get(s)!
      const a = document.activeElement as HTMLElement | null
      const key = a && target.contains(a) ? a.dataset.key : undefined
      const sel = a instanceof HTMLInputElement && (a.type === 'text' || a.type === 'number') ? [a.selectionStart, a.selectionEnd] : null
      target.replaceChildren(...SECTION[s]())
      if (key) {
        const f = target.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
        f?.focus()
        if (f instanceof HTMLInputElement && sel && sel[0] !== null) try { f.setSelectionRange(sel[0], sel[1]) } catch { /* number */ }
      }
    }
  }

  const header = () => {
    const h = el('div', 'hm-brand')
    h.append(el('h1', undefined, 'BAN TỔ CHỨC · ĐIỀU HÀNH GIẢI'), el('div', 'hm-sub', 'Giải FANROC thật: đội, lịch thi, trọng tài chấm bằng điện thoại, màn chiếu, xuất Excel. Không cần internet — điện thoại chỉ cần cùng mạng Wi-Fi với máy này.'))
    const acts = el('div', 'pk-acts')
    acts.append(btn('Về giải đấu', () => deps.tournament(), { key: 'back' }), btn('Về màn chính', () => deps.home(), { key: 'home' }))
    return [h, acts]
  }

  /** Màn chờ: đang mở / hỏi tiếp tục giải đã lưu. */
  const renderGate = () => {
    secs.clear()
    const b = el('div', 'bt-box')
    if (phase === 'loading') b.append(el('div', 'bt-cap', 'Đang mở giải đã lưu…'))
    else {
      b.dataset.role = 'resume'
      b.append(
        el('h2', undefined, `Tiếp tục giải «${saved?.name ?? ''}»?`),
        el('div', 'bt-cap', `${saved?.teams.length ?? 0} đội · ${saved?.rounds.length ?? 0} vòng. Giải mới: giải này được sao lưu ra file JSON trước.`),
        box('div', 'bt-row',
          btn('Tiếp tục', () => startEvent(saved!), { cls: 'main', key: 'resume' }),
          btn2('new-gate', 'Giải mới', 'Bấm lần nữa: sao lưu rồi tạo giải mới', () => newEventFlow(saved))),
      )
      if (eventNote) b.append(note(eventNote.text, eventNote.ok))
    }
    inner.replaceChildren(...header(), b)
  }

  const buildFrame = () => {
    const nav = el('div', 'bt-nav')
    for (const s of SECS) {
      const t = SEC_TITLE[s]
      if (!t) continue
      const b = el('button', undefined, t)
      b.type = 'button'
      b.onclick = () => secs.get(s)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      nav.append(b)
    }
    const nodes: HTMLElement[] = [...header(), nav]
    for (const s of SECS) {
      const e = el('section', s === 'status' ? 'bt-status' : 'bt-box')
      e.dataset.sec = s
      secs.set(s, e)
      nodes.push(e)
    }
    inner.replaceChildren(...nodes)
  }

  // ---------- Giải ----------
  /** Ô chọn tệp ẩn, tạo một lần (không nằm trong phần được vẽ lại, hộp chọn tệp đang mở không mất ô). */
  const fileInput = (role: string, accept: string, onFile: (f: File) => Promise<void>) => {
    const i = el('input', 'bt-file')
    i.type = 'file'
    i.accept = accept
    i.dataset.role = role
    i.tabIndex = -1
    i.setAttribute('aria-hidden', 'true')
    i.onchange = () => {
      const f = i.files?.[0]
      i.value = ''
      if (f) void onFile(f).catch((e) => console.warn('BTC:', e)).finally(() => renderSoon())
    }
    screen.append(i)
    return i
  }
  const backup = async (s: EventState): Promise<string> =>
    backend.saveFile(backupName(s.name, new Date()), new TextEncoder().encode(JSON.stringify(s, null, 1)))

  const secStatus = (): El[] => {
    const out: El[] = []
    const sv = el('span', undefined, saveNote ? saveNote.text : 'Chưa có thay đổi')
    sv.dataset.ok = String(saveNote?.ok ?? true)
    sv.dataset.role = 'save-status'
    const cn = el('span', undefined, link ? 'Máy chủ BTC: đang chạy' : connNote ? `Máy chủ BTC: ${connNote}` : 'Máy chủ BTC: đang nối…')
    cn.dataset.ok = String(!!link)
    cn.dataset.role = 'conn-status'
    out.push(sv, cn)
    return out
  }

  const openInput = fileInput('open-file', '.json,application/json', async (f) => {
    const ev = parseEvent(await f.text())
    if (!ev) {
      eventNote = { ok: false, text: `«${f.name}» không phải file giải TiFa` }
      return
    }
    try {
      await backup(S())
    } catch (e) {
      eventNote = { ok: false, text: `Không sao lưu được giải đang mở: ${msg(e)} — chưa mở file mới` }
      return
    }
    host!.state = ev
    curRound = null
    editor = null
    late = null
    persist()
    eventNote = { ok: true, text: `Đã mở «${ev.name}» (giải cũ đã sao lưu)` }
  })

  const secEvent = (): El[] => {
    const s = S()
    const out: El[] = [
      el('h2', undefined, 'Giải'),
      box('div', 'bt-row', el('b', undefined, 'Tên giải'), input('ev-name', s.name, (v) => void act({ t: 'event.name', name: v }), { cls: 'wide', label: 'Tên giải', change: true })),
      el('div', 'bt-cap', `${s.teams.length} đội · ${s.rounds.length} vòng. Giải tự lưu sau mỗi thay đổi${backend.desktop ? ' (thư mục dữ liệu của app, kèm 20 bản sao lưu gần nhất)' : ' (trình duyệt này)'}.`),
      box('div', 'bt-row',
        btn('Sao lưu file giải (JSON)', async () => {
          try {
            eventNote = { ok: true, text: `Đã lưu: ${await backup(S())}` }
          } catch (e) {
            eventNote = { ok: false, text: `Không lưu được: ${msg(e)}` }
          }
        }, { key: 'backup', role: 'backup' }),
        btn('Mở file giải…', () => openInput.click(), { key: 'open' }),
        btn2('new-main', 'Giải mới', 'Bấm lần nữa: sao lưu rồi tạo giải mới', () => newEventFlow(S()))),
    ]
    if (eventNote) out.push(note(eventNote.text, eventNote.ok))
    return out
  }

  // ---------- Đội ----------
  const autoCode = (taken: Set<string>) => {
    for (let n = 1; ; n++) {
      const c = `D${pad(n)}`
      if (!taken.has(c.toLowerCase())) return c
    }
  }
  /** Kiểm tra đội thêm / sửa: tên bắt buộc, mã không trùng (để trống ⇒ tự đặt). */
  const checkTeam = (d: TeamDraft, selfId: string | null): TeamDraft | string => {
    const name = d.name.trim()
    if (!name) return 'Thiếu tên đội'
    const taken = new Set(S().teams.filter((t) => t.id !== selfId).map((t) => t.code.trim().toLowerCase()))
    const code = d.code.trim() || autoCode(taken)
    if (taken.has(code.toLowerCase())) return `Mã đội ${code} đã có`
    return { code, name, school: d.school.trim(), province: d.province.trim(), advisor: d.advisor.trim() }
  }
  const teamInputs = (prefix: string, d: TeamDraft) => [
    input(`${prefix}-code`, d.code, (v) => (d.code = v), { label: 'Mã đội', cls: 'mid' }),
    input(`${prefix}-name`, d.name, (v) => (d.name = v), { label: 'Tên đội', cls: 'mid' }),
    input(`${prefix}-school`, d.school, (v) => (d.school = v), { label: 'Trường', cls: 'mid' }),
    input(`${prefix}-province`, d.province, (v) => (d.province = v), { label: 'Tỉnh/Thành', cls: 'mid' }),
    input(`${prefix}-advisor`, d.advisor, (v) => (d.advisor = v), { label: 'Người hướng dẫn', cls: 'mid' }),
  ]

  const importInput = fileInput('import-file', '.xlsx,.csv', async (f) => {
    try {
      preview = { rows: await importTeams(new Uint8Array(await f.arrayBuffer()), f.name), file: f.name }
      teamNote = null
    } catch (e) {
      preview = null
      teamNote = { ok: false, text: msg(e) }
    }
  })
  const secTeams = (): El[] => {
    const s = S()
    const out: El[] = [
      el('h2', undefined, 'Đội'),
      box('div', 'bt-row',
        btn('Tải file mẫu (.xlsx)', async () => {
          try {
            teamNote = { ok: true, text: `Đã lưu file mẫu: ${await backend.saveFile('mau-danh-sach-doi.xlsx', await templateXlsx())}` }
          } catch (e) {
            teamNote = { ok: false, text: msg(e) }
          }
        }, { key: 'template' }),
        btn('Nhập Excel / CSV…', () => importInput.click(), { key: 'import' })),
      el('div', 'bt-cap', 'Mỗi dòng một đội: Mã đội, Tên đội, Trường, Tỉnh/Thành, Người hướng dẫn. Không ghi số điện thoại hay thông tin cá nhân học sinh.'),
    ]
    if (preview) {
      const p = preview
      const bad = p.rows.filter((r) => r.error).length
      const ok = p.rows.filter((r) => r.team)
      const accept = (teams: TeamDraft[]) => {
        if (S().rounds.length) {
          teamNote = { ok: false, text: 'Đã có vòng thi — không thay cả danh sách được. Thêm từng đội ở dưới.' }
          return
        }
        if (act({ t: 'teams', teams }, undefined, (n) => (teamNote = n))) {
          preview = null
          teamNote = { ok: true, text: `Đã nhận ${teams.length} đội từ «${p.file}»` }
        }
      }
      const rows = p.rows.map((r) => {
        const t = r.team
        const row = tr(td(String(r.line)), t?.code ?? '', t?.name ?? '', t?.school ?? '', t?.province ?? '', t?.advisor ?? '', r.error ?? 'Được')
        row.dataset.bad = String(!!r.error)
        return row
      })
      out.push(
        el('h3', undefined, `Xem trước «${p.file}»: ${ok.length} đội hợp lệ${bad ? `, ${bad} dòng lỗi` : ''}`),
        table(['Dòng', 'Mã', 'Tên đội', 'Trường', 'Tỉnh/Thành', 'Người hướng dẫn', 'Kiểm tra'], rows, 'preview'),
        box('div', 'bt-row',
          btn('Nhận', () => accept(ok.map((r) => r.team!)), { cls: 'main', key: 'accept', disabled: bad > 0 || !ok.length, role: 'accept' }),
          ...(bad && ok.length ? [btn('Bỏ dòng lỗi và nhận', () => accept(ok.map((r) => r.team!)), { key: 'accept-ok', role: 'accept-ok' })] : []),
          btn('Thôi', () => void (preview = null), { key: 'preview-cancel' })),
      )
    }
    if (teamNote) out.push(note(teamNote.text, teamNote.ok))
    const rows = s.teams.map((t, i) => {
      if (teamEdit?.id === t.id) {
        const d = teamEdit.draft
        const save = () => {
          const v = checkTeam(d, t.id)
          if (typeof v === 'string') return void (teamNote = { ok: false, text: v })
          if (act({ t: 'team.edit', id: t.id, patch: v }, undefined, (n) => (teamNote = n))) ((teamEdit = null), (teamNote = null))
        }
        const ins = teamInputs(`edit-${t.id}`, d)
        return tr(td(String(i + 1)), ...ins, '', box('span', 'bt-row', btn('Lưu', save, { cls: 'main', key: `save-${t.id}` }), btn('Thôi', () => void (teamEdit = null), { key: `cancel-${t.id}` })))
      }
      const row = tr(td(String(i + 1)), t.code, t.name, t.school, t.province, t.advisor, t.withdrawn ? 'Rút lui' : '',
        t.withdrawn ? '' : box('span', 'bt-row',
          btn('Sửa', () => void (teamEdit = { id: t.id, draft: { code: t.code, name: t.name, school: t.school, province: t.province, advisor: t.advisor } }), { key: `edit-${t.id}` }),
          btn2(`wd-${t.id}`, 'Rút lui', 'Bấm lần nữa: rút lui', () => void act({ t: 'team.withdraw', id: t.id }, undefined, (n) => (teamNote = n)))))
      row.dataset.out = String(t.withdrawn)
      row.dataset.id = t.id
      return row
    })
    if (s.teams.length) out.push(table(['#', 'Mã', 'Tên đội', 'Trường', 'Tỉnh/Thành', 'Người hướng dẫn', 'Trạng thái', ''], rows, 'teams'))
    else out.push(el('div', 'bt-cap', 'Chưa có đội. Nhập file Excel / CSV theo mẫu, hoặc thêm từng đội.'))
    out.push(
      el('h3', undefined, 'Thêm đội'),
      box('div', 'bt-row', ...teamInputs('add', teamAdd), btn('Thêm đội', () => {
        const v = checkTeam(teamAdd, null)
        if (typeof v === 'string') return void (teamNote = { ok: false, text: v })
        if (act({ t: 'team.add', team: v }, undefined, (n) => (teamNote = n))) {
          Object.assign(teamAdd, blankTeam())
          teamNote = { ok: true, text: `Đã thêm đội ${v.name}. Đội vào giữa vòng: dùng «Thêm đội muộn» ở mục Vòng.` }
        }
      }, { key: 'add-team' })),
    )
    return out
  }

  // ---------- Vòng ----------
  const activeIds = (ids: string[]) => {
    const out = new Set(S().teams.filter((t) => t.withdrawn).map((t) => t.id))
    return ids.filter((id) => !out.has(id))
  }
  const openCreate = (final: boolean) => {
    creating = true
    late = null
    rf.final = final
    rf.name = final ? 'Chung kết' : S().rounds.length ? `Sơ loại ${S().rounds.length + 1}` : 'Sơ loại'
    rf.from = final ? (S().rounds.at(-1)?.id ?? null) : null
    rf.sel = new Set(final ? [] : activeIds(S().teams.map((t) => t.id)))
    rf.touched = false
    roundNote = null
  }
  const liveIn = (r: Round) => Object.values(S().live).some((l) => l && r.matches.some((m) => m.id === l.matchId))
  /** Đặt mã sân cho các sân chưa có mã (mã giữ cho cả giải). */
  const ensureCodes = (r: Round) => {
    for (const f of fieldsOf(r)) if (S().codes[f] === undefined) act({ t: 'code.new', field: f, code: randomCode() }, f)
  }
  const createRound = () => {
    const teamIds = [...rf.sel]
    const nextId = `r${S().rounds.reduce((m, r) => Math.max(m, Number(r.id.slice(1)) || 0), 0) + 1}`
    const seed = randomSeed()
    let sch: ReturnType<typeof makeSchedule>
    try {
      sch = makeSchedule({ teamIds, perTeam: rf.perTeam, fields: rf.fields, seed, roundId: nextId })
    } catch (e) {
      roundNote = { ok: false, text: `Không sinh được lịch: ${msg(e)}` }
      return
    }
    const set = (n: { ok: boolean; text: string } | null) => (roundNote = n)
    if (!act({ t: 'round.add', name: rf.name.trim() || 'Vòng', teamIds, perTeam: rf.perTeam, fields: rf.fields, slotMin: rf.slotMin, startAt: rf.startAt, seed }, undefined, set)) return
    const r = S().rounds.at(-1)!
    if (r.id !== nextId) sch = makeSchedule({ teamIds, perTeam: rf.perTeam, fields: rf.fields, seed, roundId: r.id })
    if (!act({ t: 'round.schedule', roundId: r.id, matches: sch.matches }, undefined, set)) return
    quality.set(r.id, { quality: sch.quality, notes: sch.notes })
    ensureCodes(S().rounds.at(-1)!)
    curRound = r.id
    creating = false
    roundNote = { ok: true, text: `Đã tạo vòng ${r.name}: ${sch.matches.length} trận` }
  }
  /** Sinh lại phần lịch chưa đấu (trận đã chốt giữ nguyên), có thể kèm đội thêm muộn / số trận mới. */
  const reschedule = (r: Round, add: string[], perTeam: number) => {
    const set = (n: { ok: boolean; text: string } | null) => (roundNote = n)
    if (liveIn(r)) return set({ ok: false, text: 'Vòng đang có trận đang đấu — chốt hoặc hủy trận trước' })
    const teamIds = [...r.teamIds, ...add.filter((id) => !r.teamIds.includes(id))]
    const fixed = r.matches.filter((m) => r.results[m.id])
    let sch: ReturnType<typeof makeSchedule>
    try {
      sch = makeSchedule({ teamIds: activeIds(teamIds), perTeam, fields: r.fields, seed: randomSeed(), roundId: r.id, fixed })
    } catch (e) {
      return set({ ok: false, text: `Không sinh được lịch: ${msg(e)}` })
    }
    if (add.length || perTeam !== r.perTeam) if (!act({ t: 'round.teams', roundId: r.id, teamIds, perTeam, fields: r.fields }, undefined, set)) return
    if (!act({ t: 'round.schedule', roundId: r.id, matches: sch.matches }, undefined, set)) return
    quality.set(r.id, { quality: sch.quality, notes: sch.notes })
    ensureCodes(S().rounds.find((x) => x.id === r.id)!)
    late = null
    set({ ok: true, text: `Đã sinh lại lịch ${r.name} (${fixed.length} trận đã đấu giữ nguyên)` })
  }

  const qualityLine = (q: SchedQuality) =>
    `Dùng ${q.fieldsUsed} sân · nghỉ ít nhất ${q.minRest} lượt · đồng đội gặp lại ${q.repeatPartners} · đối thủ gặp lại ${q.repeatOpponents} · lệch Đỏ/Xanh tối đa ${q.maxSideDiff}` +
    (q.extra.length ? ` · đấu thêm 1 trận: ${q.extra.map(teamName).join(', ')}` : '')

  const checks = (items: { id: string; label: string }[], sel: Set<string>, prefix: string, touch = () => {}) => {
    const c = el('div', 'bt-checks')
    c.dataset.role = `${prefix}-teams`
    for (const it of items) {
      const l = el('label')
      const i = el('input')
      i.type = 'checkbox'
      i.checked = sel.has(it.id)
      i.dataset.key = `${prefix}-${it.id}`
      i.onchange = () => {
        touch()
        if (i.checked) sel.add(it.id)
        else sel.delete(it.id)
        renderSoon(['rounds'])
      }
      l.append(i, it.label)
      c.append(l)
    }
    return c
  }

  const secRounds = (): El[] => {
    const s = S()
    const r = creating ? undefined : round()
    const tabs = box('div', 'bt-row', el('b', undefined, 'Vòng'))
    for (const x of s.rounds) {
      const b = btn(x.name, () => void ((curRound = x.id), (creating = false), (late = null), (editor = null)), { key: `round-${x.id}` })
      b.setAttribute('aria-pressed', String(!creating && r?.id === x.id))
      tabs.append(b)
    }
    const nb = btn('＋ Vòng mới', () => openCreate(false), { key: 'round-new', role: 'round-new' })
    nb.setAttribute('aria-pressed', String(creating || !s.rounds.length))
    tabs.append(nb)
    const out: El[] = [el('h2', undefined, 'Vòng'), tabs]
    if (creating || !s.rounds.length) {
      if (!creating) openCreate(false)
      const active = activeIds(s.teams.map((t) => t.id))
      const kind = box('div', 'bt-row', el('b', undefined, 'Loại vòng'))
      for (const [f, t] of [[false, 'Sơ loại'], [true, 'Chung kết']] as const) {
        const b = btn(t, () => openCreate(f), { key: `kind-${f}`, disabled: f && !s.rounds.length })
        b.setAttribute('aria-pressed', String(rf.final === f))
        kind.append(b)
      }
      let items: { id: string; label: string }[]
      const pick = box('div', 'bt-row', el('b', undefined, `Đội vào vòng (${rf.sel.size} đã chọn)`))
      if (rf.final) {
        const src = s.rounds.find((x) => x.id === rf.from) ?? s.rounds.at(-1)!
        pick.append(select('final-from', s.rounds.map((x) => [x.id, `Theo xếp hạng ${x.name}`]), src.id, (v) => ((rf.from = v), rf.sel.clear()), 'Vòng trước'))
        items = roundStandings(s, src.id).filter((x) => !x.withdrawn).map((x) => ({ id: x.id, label: `${x.rank}. ${teamName(x.id)} (${x.total})` }))
      } else {
        // Sơ loại chưa chọn tay: theo đủ danh sách đội hiện có (nhập đội sau khi mở form vẫn đúng)
        if (!rf.touched) rf.sel = new Set(active)
        items = active.map((id) => ({ id, label: teamName(id) }))
      }
      pick.append(
        btn('Chọn hết', () => ((rf.touched = true), items.forEach((x) => rf.sel.add(x.id))), { key: 'sel-all' }),
        btn('Bỏ hết', () => ((rf.touched = true), rf.sel.clear()), { key: 'sel-none' }))
      out.push(
        kind,
        box('div', 'bt-row', el('b', undefined, 'Tên vòng'), input('rf-name', rf.name, (v) => (rf.name = v), { label: 'Tên vòng', cls: 'mid' })),
        pick,
        checks(items, rf.sel, 'rf', () => (rf.touched = true)),
        box('div', 'bt-row',
          el('b', undefined, 'Số trận mỗi đội'), select('rf-per', range(3, 10), String(rf.perTeam), (v) => (rf.perTeam = Number(v)), 'Số trận mỗi đội'),
          el('b', undefined, 'Số sân'), select('rf-fields', range(1, 4), String(rf.fields), (v) => (rf.fields = Number(v)), 'Số sân'),
          el('b', undefined, 'Phút / lượt'), input('rf-slot', rf.slotMin, (v) => (rf.slotMin = Math.max(3, Math.min(60, Math.round(Number(v)) || 7))), { type: 'number', label: 'Phút mỗi lượt', min: 3, max: 60, change: true }),
          el('b', undefined, 'Giờ bắt đầu'), input('rf-start', rf.startAt, (v) => (rf.startAt = /^\d{2}:\d{2}$/.test(v) ? v : rf.startAt), { type: 'time', label: 'Giờ bắt đầu', change: true })),
        el('div', 'bt-cap', 'Mỗi lượt mỗi sân một trận 4 đội (2 Đỏ + 2 Xanh) ghép ngẫu nhiên; mỗi đội đấu đủ số trận, có lượt nghỉ giữa hai trận, hạn chế gặp lại đồng đội / đối thủ. Cần 8–120 đội.'),
        box('div', 'bt-row', btn('Sinh lịch', createRound, { cls: 'main', key: 'make', role: 'make-schedule', disabled: rf.sel.size < 8 }),
          ...(s.rounds.length ? [btn('Thôi', () => void (creating = false), { key: 'make-cancel' })] : [])),
      )
      if (roundNote) out.push(note(roundNote.text, roundNote.ok))
      return out
    }
    if (!r) return out
    const q = quality.get(r.id)
    out.push(el('div', 'bt-cap', `${r.name} · ${activeIds(r.teamIds).length} đội · ${r.perTeam} trận mỗi đội · ${r.fields} sân · ${r.slotMin} phút / lượt · bắt đầu ${r.startAt} · ${Object.keys(r.results).length}/${r.matches.length} trận đã chốt`))
    if (q) {
      out.push(el('div', 'bt-cap', `Chất lượng lịch: ${qualityLine(q.quality)}`))
      for (const n of q.notes) out.push(note(n, false))
    }
    out.push(box('div', 'bt-row',
      btn('Sinh lại lịch (chưa đấu)', () => void reschedule(r, [], r.perTeam), { key: 'regen', role: 'regen' }),
      btn('Thêm đội muộn / đổi số trận', () => void (late = late ? null : { roundId: r.id, add: new Set(), perTeam: r.perTeam }), { key: 'late' })))
    if (late && late.roundId === r.id) {
      const L = late
      const cand = activeIds(s.teams.map((t) => t.id)).filter((id) => !r.teamIds.includes(id)).map((id) => ({ id, label: teamName(id) }))
      out.push(box('div', 'bt-box',
        el('h3', undefined, 'Thêm đội muộn / đổi số trận'),
        cand.length ? checks(cand, L.add, 'late') : el('div', 'bt-cap', 'Mọi đội đã ở trong vòng. Thêm đội mới ở mục Đội trước.'),
        box('div', 'bt-row', el('b', undefined, 'Số trận mỗi đội'), select('late-per', range(3, 10), String(L.perTeam), (v) => (L.perTeam = Number(v)), 'Số trận mỗi đội'),
          btn('Áp dụng và sinh lại phần chưa đấu', () => void reschedule(r, [...L.add], L.perTeam), { cls: 'main', key: 'late-apply' })),
        el('div', 'bt-cap', 'Trận đã chốt giữ nguyên; chỉ các trận chưa đấu được xếp lại.')))
    }
    if (roundNote) out.push(note(roundNote.text, roundNote.ok))
    const live = busy()
    const rows = scheduleRows(r, s.teams).map((x) => {
      const res = r.results[x.id]
      const row = tr(td(String(x.slot)), td(x.time), td(`Sân ${x.field}`), td(x.id), box('span', 'bt-red', x.red.join(' + ')), box('span', 'bt-blue', x.blue.join(' + ')),
        td(res ? String(liveScore(res.red, res.blue).total) : live.has(x.id) ? 'đang đấu' : ''))
      row.dataset.done = String(x.done)
      return row
    })
    out.push(table(['Lượt', 'Giờ', 'Sân', 'Trận', 'Đỏ', 'Xanh', 'Điểm trận'], rows, 'schedule'))
    return out
  }

  // ---------- Điều hành ----------
  const halfBox = (sheet: HalfSheet | undefined, side: Side, names: string[], sent: boolean) => {
    const b = el('div', 'bt-half')
    b.dataset.side = side
    const sh = sheet ?? emptySheet()
    const sc = halfScore(sh, side)
    const rows: [string, string][] = [
      ['Khu Chữa Cháy: cam / xanh', `${sh.fire.o} / ${sh.fire.g}`],
      ...([0, 1] as const).map((k): [string, string] => [`${MTN_NAME(side, k)}: xanh R1 / R2 / R3`, sh.mtn[k].map((x) => x.g).join(' / ')]),
      ...([0, 1] as const).map((k): [string, string] => [`${MTN_NAME(side, k)}: cam sai chỗ`, String(sh.mtn[k].reduce((a, x) => a + x.o, 0))]),
      ['Cam trên tầng trang trí', String(sh.decorO)],
      ['Cờ', sh.flags.map((f) => (f ? 'có' : 'không')).join(' · ')],
      ['Leo thang', sh.climbs.map((c) => CLIMBS.find((x) => x[0] === c)![1]).join(' · ')],
      ...([0, 1] as const).map((k): [string, string] => {
        const p = sh.pens[k]
        return [`Phạt ${names[k] || `ghế ${k + 1} (trống)`}`, `nhẹ ${p.minor} · vàng ${p.yellow} · đỏ ${p.red ? 'có' : 'không'} · cảnh cáo ${p.warn}`]
      }),
      ['Điểm nửa sân', `${sc.mission} × ${pctText(sc.multPct)} = ${sc.total}`],
    ]
    const t = el('table')
    for (const [a, v] of rows) t.append(tr(a, v))
    b.append(el('b', side === 'red' ? 'bt-red' : 'bt-blue', `Nửa ${SIDE_NAME[side]} · ${sheet ? (sent ? 'đã gửi kiểm kê' : 'chưa gửi kiểm kê') : 'chưa có phiếu'}`), t)
    return b
  }

  const fieldCard = (f: number, r: Round | undefined): HTMLElement => {
    const s = S()
    const h = host!
    const l = s.live[f] ?? null
    const card = el('div', 'bt-field')
    card.dataset.field = String(f)
    card.dataset.phase = l?.phase ?? 'idle'
    const code = s.codes[f]
    const title = el('h3')
    title.append(`Sân ${f + 1}`, box('span', 'bt-row', 'Mã sân ', (() => {
      const c = el('span', 'bt-code', code ?? '—')
      c.dataset.role = 'code'
      return c
    })(), btn('Đổi mã', () => void act({ t: 'code.new', field: f, code: randomCode() }, f), { key: `code-${f}` })))
    card.append(title)
    const sv = h.screenView(f)
    card.append(el('div', 'bt-cap', `Trọng tài Đỏ: ${REF_TEXT[sv.refs.red]} · Trọng tài Xanh: ${REF_TEXT[sv.refs.blue]}`))
    for (const p of h.pending.filter((x) => x.field === f)) {
      card.append(box('div', 'bt-row', note(`Máy khác xin vào ghế trọng tài ${SIDE_NAME[p.side]}`, false),
        btn('Cho thay', () => h.allow(f, p.side), { cls: 'main', key: `allow-${f}-${p.side}`, role: 'allow' })))
    }
    card.append(box('div', 'bt-row', ...SIDES.map((side) => btn2(`rel-${f}-${side}`, `Giải phóng ghế ${SIDE_NAME[side]}`, `Bấm lần nữa: giải phóng ghế ${SIDE_NAME[side]}`, () => h.release(f, side), ''))))
    const m = l ? s.rounds.flatMap((x) => x.matches).find((x) => x.id === l.matchId) : undefined
    const matchLine = (mm: EMatch, rr: Round | undefined) => {
      const d = el('div')
      d.append(el('b', undefined, `Trận ${mm.id}${rr ? ` · lượt ${mm.slot + 1} · ${slotTime(rr.startAt, rr.slotMin, mm.slot)}` : ''}: `),
        el('span', 'bt-red', `ĐỎ ${mm.red.map(teamName).join(' + ')}`), ' · ', el('span', 'bt-blue', `XANH ${mm.blue.map(teamName).join(' + ')}`))
      return d
    }
    if (l && m) {
      const mr = s.rounds.find((x) => x.matches.includes(m))
      card.append(matchLine(m, mr))
      const clock = h.refView(f, 'red').clock
      const st = box('div', 'bt-row', el('b', undefined, PHASE_TEXT[l.phase]))
      if (l.phase === 'play') {
        const c = el('span', 'bt-clock', clockText(clock))
        c.dataset.role = 'clock'
        st.append(c)
      }
      st.append(el('span', undefined, `Điểm tạm ${liveScore(l.sheets.red, l.sheets.blue).total}`))
      card.append(st)
      if (l.phase === 'inventory') {
        const names = { red: m.red.map((x) => (x === null ? '' : teamName(x))), blue: m.blue.map((x) => (x === null ? '' : teamName(x))) }
        card.append(box('div', 'bt-halves', ...SIDES.map((side) => halfBox(l.sheets[side], side, names[side], !!l.submitted[side]))))
        const sc = liveScore(l.sheets.red, l.sheets.blue)
        card.append(el('div', undefined, `Điểm trận: ${sc.mission} × ${pctText(sc.multPct)} = ${sc.total}`))
        if (l.sheets.red || l.sheets.blue) {
          const pts = teamPoints({ red: l.sheets.red ?? emptySheet(), blue: l.sheets.blue ?? emptySheet(), committedAt: 0 }, m)
          card.append(el('div', 'bt-cap', `Điểm đội: ${pts.map((p) => `${teamName(p.id)} ${p.score}${p.penalty ? ` (trừ ${p.penalty})` : ''}`).join(' · ')}`))
        }
        const ready = !!(l.submitted.red && l.submitted.blue)
        card.append(box('div', 'bt-row',
          btn('Chốt kết quả', () => {
            if (act({ t: 'live.commit', field: f, now: Date.now() }, f)) renderSoon()
          }, { cls: 'main', key: `commit-${f}`, role: 'commit', disabled: !ready }),
          btn2(`abort-${f}`, 'Hủy trận', 'Bấm lần nữa: hủy, đấu lại', () => void act({ t: 'live.abort', field: f }, f))))
        if (!ready) card.append(el('div', 'bt-cap', 'Chờ hai trọng tài gửi kiểm kê rồi mới chốt.'))
      } else card.append(box('div', 'bt-row', btn2(`abort-${f}`, 'Hủy trận', 'Bấm lần nữa: hủy, đấu lại', () => void act({ t: 'live.abort', field: f }, f))))
    } else {
      const nm = r ? nextMatch(r, f, busy()) : undefined
      if (nm) {
        card.append(el('div', 'bt-cap', 'Trận kế'), matchLine(nm, r))
        card.append(box('div', 'bt-row', btn('Bắt đầu trận', () => {
          if (act({ t: 'live.start', field: f, matchId: nm.id, now: Date.now() }, f)) {
            lastPhase.set(f, 'play')
            deps.sound.whistle()
          }
        }, { cls: 'main', key: `start-${f}`, role: 'start' })))
      } else card.append(el('div', 'bt-cap', r ? 'Hết trận của vòng này trên sân.' : 'Chưa có vòng thi.'))
    }
    const err = fieldErr.get(f)
    if (err) card.append(note(err, false))
    return card
  }

  /** Sân hiện ở Điều hành: các sân của vòng đang xem + sân đang có trận. */
  const runFields = (r: Round | undefined) => {
    const fs = new Set(r ? fieldsOf(r) : [])
    for (const [f, l] of Object.entries(S().live)) if (l) fs.add(Number(f))
    return [...fs].sort((a, b) => a - b)
  }

  const secRun = (): El[] => {
    const r = round()
    const out: El[] = [el('h2', undefined, `Điều hành${r ? ` · ${r.name}` : ''}`)]
    const fs = runFields(r)
    if (!fs.length) out.push(el('div', 'bt-cap', 'Tạo vòng và sinh lịch ở mục Vòng để bắt đầu.'))
    else out.push(box('div', 'bt-fields', ...fs.map((f) => fieldCard(f, r))))
    return out
  }

  // ---------- Kết quả ----------
  const num = (key: string, v: number, set: (n: number) => void, label: string, max = 300) =>
    input(key, v, (x) => {
      set(Math.max(0, Math.min(max, Math.round(Number(x)) || 0)))
      updatePreview()
    }, { type: 'number', label, min: 0, max })
  let previewEl: HTMLElement | null = null
  const updatePreview = () => {
    if (!editor || !previewEl) return
    const sc = liveScore(editor.red, editor.blue)
    previewEl.textContent = `Điểm trận mới: ${sc.mission} × ${pctText(sc.multPct)} = ${sc.total}`
  }
  const editHalf = (side: Side, sh: HalfSheet, names: string[]) => {
    const k = (s: string) => `ed-${side}-${s}`
    const b = el('div', 'bt-half')
    b.dataset.side = side
    const t = el('table')
    const row = (label: string, ...c: El[]) => t.append(tr(label, box('span', 'bt-row', ...c)))
    row('Khu Chữa Cháy: cam đúng / xanh sai', num(k('fo'), sh.fire.o, (n) => (sh.fire.o = n), 'Khu Chữa Cháy cam'), num(k('fg'), sh.fire.g, (n) => (sh.fire.g = n), 'Khu Chữa Cháy xanh'))
    for (const m of [0, 1] as const) {
      row(`${MTN_NAME(side, m)}: xanh R1 / R2 / R3`, ...sh.mtn[m].map((x, i) => num(k(`g${m}${i}`), x.g, (n) => (x.g = n), `${MTN_NAME(side, m)} rãnh ${i + 1} xanh`)))
      row(`${MTN_NAME(side, m)}: cam sai R1 / R2 / R3`, ...sh.mtn[m].map((x, i) => num(k(`o${m}${i}`), x.o, (n) => (x.o = n), `${MTN_NAME(side, m)} rãnh ${i + 1} cam`)))
    }
    row('Cam trên tầng trang trí', num(k('decor'), sh.decorO, (n) => (sh.decorO = n), 'Cam trên tầng trang trí'))
    const check = (key: string, on: boolean, set: (v: boolean) => void, label: string) => {
      const i = el('input')
      i.type = 'checkbox'
      i.checked = on
      i.dataset.key = key
      i.setAttribute('aria-label', label)
      i.onchange = () => {
        set(i.checked)
        updatePreview()
      }
      return i
    }
    row('Cờ', ...([0, 1] as const).map((m) => box('label', undefined, check(k(`flag${m}`), sh.flags[m], (v) => (sh.flags[m] = v), `Cờ ${MTN_NAME(side, m)}`), MTN_NAME(side, m))))
    for (const i of [0, 1] as const) {
      const who = names[i] || `ghế ${i + 1} (trống)`
      const c = el('select')
      c.dataset.key = k(`climb${i}`)
      c.setAttribute('aria-label', `Leo thang ${who}`)
      for (const [v, n] of CLIMBS) c.append(Object.assign(el('option', undefined, n), { value: v }))
      c.value = sh.climbs[i]
      c.onchange = () => {
        sh.climbs[i] = c.value as Climb
        updatePreview()
      }
      row(`Leo thang ${who}`, c)
      const p = sh.pens[i]
      row(`Phạt ${who}: nhẹ / vàng / cảnh cáo / đỏ`, num(k(`pm${i}`), p.minor, (n) => (p.minor = n), 'Lỗi nhẹ', 20), num(k(`py${i}`), p.yellow, (n) => (p.yellow = n), 'Thẻ vàng', 20),
        num(k(`pw${i}`), p.warn, (n) => (p.warn = n), 'Cảnh cáo', 20), check(k(`pr${i}`), p.red, (v) => (p.red = v), 'Thẻ đỏ'))
    }
    b.append(el('b', side === 'red' ? 'bt-red' : 'bt-blue', `Nửa ${SIDE_NAME[side]}`), t)
    return b
  }

  const secResults = (): El[] => {
    const s = S()
    const r = round()
    const out: El[] = [el('h2', undefined, `Kết quả${r ? ` · ${r.name}` : ''}`)]
    if (!r) return [...out, el('div', 'bt-cap', 'Chưa có vòng thi.')]
    const st = roundStandings(s, r.id)
    const code = (id: string) => s.teams.find((t) => t.id === id)?.code ?? ''
    out.push(table(['Hạng', 'Mã', 'Tên đội', 'Tổng điểm', 'Các trận tính', 'Tổng hệ số', 'Trận cao nhất', 'Điểm trừ'], st.map((x) => {
      const row = tr(td(x.withdrawn ? 'Rút lui' : String(x.rank)), code(x.id), teamName(x.id), td(String(x.total)), td(x.counted.join(' + ') || '—'), td(pctText(x.multSum)), td(String(x.best)), td(String(x.penalty)))
      row.dataset.out = String(x.withdrawn)
      row.dataset.id = x.id
      return row
    }), 'standings'))
    if (st.some((x) => x.provisional)) out.push(el('div', 'bt-cap', 'Bảng tạm: vòng còn trận chưa đấu. Bằng điểm xét tổng hệ số, trận cao nhất, ít điểm trừ, rồi bốc thăm (luật mục E).'))
    const done = r.matches.filter((m) => r.results[m.id])
    out.push(el('h3', undefined, `Trận đã chốt (${done.length})`))
    const list = el('div')
    list.dataset.role = 'results'
    list.style.cssText = 'display:grid;gap:6px'
    for (const m of done) {
      const res = r.results[m.id]
      const sc = liveScore(res.red, res.blue)
      const edits = r.edits.filter((e) => e.matchId === m.id).length
      const line = box('div', 'bt-row', el('b', undefined, `Lượt ${m.slot + 1} · Sân ${m.field + 1} · ${m.id}`),
        el('span', 'bt-red', m.red.map(teamName).join(' + ')), 'vs', el('span', 'bt-blue', m.blue.map(teamName).join(' + ')),
        `· điểm trận ${sc.total} (× ${pctText(sc.multPct)})`,
        el('span', 'bt-cap', `· ${teamPoints(res, m).map((p) => `${teamName(p.id)} ${p.score}`).join(', ')}${edits ? ` · đã sửa ${edits} lần` : ''}`),
        btn('Sửa kết quả', () => void (editor = { roundId: r.id, matchId: m.id, red: structuredClone(res.red), blue: structuredClone(res.blue), committedAt: res.committedAt }), { key: `fix-${m.id}`, role: 'fix' }))
      line.dataset.match = m.id
      list.append(line)
      if (editor && editor.roundId === r.id && editor.matchId === m.id) {
        const E = editor
        previewEl = el('div', 'bt-note')
        const names = (side: Side) => m[side].map((x) => (x === null ? '' : teamName(x)))
        list.append(box('div', 'bt-box', el('h3', undefined, `Sửa kết quả trận ${m.id}`),
          box('div', 'bt-halves', editHalf('red', E.red, names('red')), editHalf('blue', E.blue, names('blue'))),
          previewEl,
          box('div', 'bt-row',
            btn('Lưu kết quả', () => {
              const red = sanitizeSheet(E.red), blue = sanitizeSheet(E.blue)
              if (!red || !blue) return void (resultNote = { ok: false, text: 'Số liệu không hợp lệ' })
              if (act({ t: 'result.edit', roundId: E.roundId, matchId: E.matchId, result: { red, blue, committedAt: E.committedAt }, now: Date.now() }, undefined, (n) => (resultNote = n))) {
                editor = null
                resultNote = { ok: true, text: `Đã sửa kết quả trận ${m.id} (ghi vào nhật ký sửa)` }
              }
            }, { cls: 'main', key: 'fix-save', role: 'fix-save' }),
            btn('Thôi', () => void (editor = null), { key: 'fix-cancel' }))))
        updatePreview()
      }
    }
    if (!done.length) list.append(el('div', 'bt-cap', 'Chưa có trận nào được chốt.'))
    out.push(list)
    if (resultNote) out.push(note(resultNote.text, resultNote.ok))
    return out
  }

  // ---------- Kết nối ----------
  const qrCache = new Map<string, string>()
  const qrBox = (url: string, label: string, role: string) => {
    const b = el('div', 'bt-qr')
    b.dataset.role = role
    const svg = el('div', 'svg')
    let s = qrCache.get(url)
    if (!s) qrCache.set(url, (s = qrSvg(url)))
    svg.innerHTML = s // SVG tự sinh từ qrcode-generator (chỉ path / rect), không có nội dung người dùng
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', `Mã QR: ${url}`)
    b.append(el('b', undefined, label), svg, el('span', 'bt-url', url))
    return b
  }
  const secConn = (): El[] => {
    const out: El[] = [el('h2', undefined, 'Kết nối')]
    if (!server) {
      out.push(el('div', 'bt-cap', connNote ? `Chưa mở được máy chủ BTC: ${connNote}. Đang thử lại…` : 'Đang mở máy chủ BTC…'))
      return out
    }
    const [ip, ...others] = server.addrs.length ? server.addrs : ['127.0.0.1']
    const base = (a: string) => `http://${a}:${server!.port}`
    out.push(
      box('div', 'bt-qrs',
        qrBox(`${base(ip)}/`, 'Trang trọng tài (điện thoại)', 'qr-ref'),
        ...runFields(round()).map((f) => qrBox(`${base(ip)}/chieu?san=${f + 1}`, `Màn chiếu Sân ${f + 1}`, `qr-screen-${f + 1}`))),
      el('div', 'bt-cap', 'Trọng tài quét QR (hoặc gõ địa chỉ) bằng trình duyệt điện thoại, chọn sân và bên, nhập mã sân ở mục Điều hành. Màn chiếu mở địa chỉ «chieu» trên TV / máy chiếu bất kỳ trong cùng mạng.'),
    )
    if (others.length) out.push(el('div', 'bt-cap', `Máy này còn các địa chỉ khác (nếu điện thoại không mở được, thử): ${others.map((a) => `${base(a)}/`).join(' · ')}`))
    if (!backend.desktop) out.push(el('div', 'bt-cap', 'Đang chạy trong trình duyệt (thử nghiệm): chỉ máy này mở được các địa chỉ trên.'))
    out.push(el('div', 'bt-cap', 'Lần đầu mở, máy có thể hỏi cho phép mạng. Windows: bấm «Cho phép truy cập» ở hộp thoại Tường lửa (chọn cả mạng riêng). macOS: bấm «Cho phép». Điện thoại phải vào cùng mạng Wi-Fi với máy này; Wi-Fi khách có «cách ly thiết bị» sẽ chặn kết nối.'))
    return out
  }

  // ---------- Xuất Excel ----------
  let exportRound: string | null = null
  const secExport = (): El[] => {
    const s = S()
    const out: El[] = [el('h2', undefined, 'Xuất Excel')]
    if (!s.rounds.length) return [...out, el('div', 'bt-cap', 'Chưa có vòng thi để xuất.')]
    const rid = s.rounds.some((r) => r.id === exportRound) ? exportRound! : (round()?.id ?? s.rounds[0].id)
    out.push(
      box('div', 'bt-row', el('b', undefined, 'Vòng'), select('export-round', s.rounds.map((r) => [r.id, r.name]), rid, (v) => (exportRound = v), 'Vòng xuất Excel'),
        btn('Xuất Excel', async () => {
          try {
            const r = S().rounds.find((x) => x.id === rid)!
            const path = await backend.saveFile(`${slug(S().name)}-${slug(r.name)}.xlsx`, await exportEvent(S(), rid))
            exportNote = { ok: true, text: backend.desktop ? `Đã lưu: ${path}` : `Đã tải về: ${path}` }
          } catch (e) {
            exportNote = { ok: false, text: `Không xuất được: ${msg(e)}` }
          }
        }, { cls: 'main', key: 'export', role: 'export' })),
      el('div', 'bt-cap', 'Một file gồm các trang Đội, Lịch thi, Kết quả, Xếp hạng, Nhật ký sửa. Xuất lúc nào cũng được — in lịch trước giờ thi.'),
    )
    if (exportNote) out.push(note(exportNote.text, exportNote.ok))
    return out
  }

  const SECTION: Record<Sec, () => El[]> = {
    status: secStatus, event: secEvent, teams: secTeams, rounds: secRounds, run: secRun, results: secResults, conn: secConn, export: secExport,
  }

  // ---------- vòng đời ----------
  const tick = () => {
    if (!host) return
    host.tick()
    const parts: string[] = []
    for (const [f, l] of Object.entries(host.state.live)) {
      const field = Number(f)
      const prev = lastPhase.get(field) ?? null
      const now = l?.phase ?? null
      if (prev === 'play' && now === 'inventory') deps.sound.whistle(true)
      lastPhase.set(field, now)
      if (!l) continue
      parts.push(`${f}:${l.matchId}:${l.phase}`)
      // đồng hồ đổi mỗi giây: sửa chữ tại chỗ, không vẽ lại thẻ sân (nút đang bấm không bị thay giữa chừng)
      const c = secs.get('run')?.querySelector(`[data-field="${field}"] [data-role="clock"]`)
      const text = clockText(host.refView(field, 'red').clock)
      if (c && c.textContent !== text) c.textContent = text
    }
    const sig = parts.join('|')
    if (sig !== runSig) {
      runSig = sig
      renderSoon(['run'])
    }
  }

  const retry = () => {
    if (!active || retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      void connect()
    }, 2000)
  }
  let connecting = false
  const connect = async () => {
    if (!active || link || connecting) return
    connecting = true
    try {
      server ??= await backend.start()
      const l = await connectBtc(server.url)
      if (!active) {
        l.close()
        return
      }
      link = l
      connNote = null
      l.onMessage = (from, m) => {
        host?.onMessage(from, m)
        renderSoon(['run'])
      }
      l.onPeer = (id, on) => {
        host?.onPeer(id, on)
        renderSoon(['run'])
      }
      l.onReject = () => void (connNote = 'đã có máy Ban tổ chức khác đang điều hành (chỉ một máy được điều hành)')
      l.onClose = () => {
        if (link !== l) return
        link = null
        connNote ??= 'mất kết nối, đang nối lại…'
        renderSoon(['status', 'conn'])
        retry()
      }
    } catch (e) {
      connNote = msg(e)
      retry()
    } finally {
      connecting = false
      renderSoon(['status', 'conn'])
    }
  }

  /** Mở giải `s` làm giải đang điều hành. */
  const startEvent = (s: EventState) => {
    host = new BtcHost(s, {
      send: (to, m) => link?.send(to, m),
      save: (st) => {
        void saver(JSON.stringify(st))
        renderSoon(['run'])
      },
      now: () => Date.now(),
    })
    phase = 'main'
    eventNote = null
    curRound = s.rounds.at(-1)?.id ?? null
    for (const [f, l] of Object.entries(s.live)) lastPhase.set(Number(f), l?.phase ?? null)
    persist()
    secs.clear()
    renderSoon()
  }
  /** Giải mới: sao lưu giải cũ ra file trước (lỗi ⇒ không tạo). */
  const newEventFlow = async (old: EventState | null) => {
    if (old) {
      try {
        await backup(old)
      } catch (e) {
        eventNote = { ok: false, text: `Không sao lưu được giải cũ: ${msg(e)} — chưa tạo giải mới` }
        return
      }
    }
    quality.clear()
    editor = null
    late = null
    preview = null
    creating = false
    startEvent(newEvent(`Giải FANROC ${new Date().getFullYear()}`, randomSeed()))
    eventNote = { ok: true, text: old ? `Đã sao lưu «${old.name}» và tạo giải mới` : 'Đã tạo giải mới' }
  }

  return {
    get shown() {
      return !screen.hidden
    },
    get host() {
      return host
    },
    async show() {
      active = true
      screen.hidden = false
      secs.clear()
      if (!host) {
        phase = 'loading'
        render(SECS)
        const raw = await backend.load().catch(() => null)
        if (!active) return
        const s = raw ? parseEvent(raw) : null
        if (s) {
          saved = s
          phase = 'ask'
          render(SECS)
        } else await newEventFlow(null)
      } else render(SECS)
      tickTimer ??= setInterval(tick, 250)
      void connect()
    },
    hide() {
      active = false
      screen.hidden = true
      armed = null
      if (tickTimer) clearInterval(tickTimer)
      tickTimer = null
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
      const l = link
      link = null
      l?.close()
      if (server) {
        server = null
        void backend.stop().catch(() => {})
      }
    },
  }
}
