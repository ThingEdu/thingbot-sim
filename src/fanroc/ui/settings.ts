// Khung ⚙ Cài đặt (spec §6.2): khung nổi, Esc hoặc bấm ra ngoài thì đóng. Mọi màn: Camera, Đồ hoạ, Âm thanh, Hai bạn
// chơi, Phím điều khiển (bảng KEY_TABLE của bố cục đang dùng + nút đó làm gì với robot đang chọn). Ở trận / đấu tập
// thêm: Chế độ, Robot của em, Liên minh, Mức máy, Robot của em chạy (Của em / Mặc định), Tốc độ ×1 ×4 ×40 (R24), và
// mục Nâng cao thu gọn: ai lái từng Robot 1–4 (R27).
// Phần thuần (ghế, bảng phím) chạy được trong Node (settings.test.ts); createSettings dựng DOM.
import type { Skill } from '../agent.ts'
import type { Alliance } from '../layout.ts'
import type { Drive, RobotConfig } from '../robots.ts'
import { KEY_TABLE, type KeyLayout } from '../keys.ts'
import { teleopButtons, type Ps2Button } from '../programs.ts'
import type { CameraView, Quality } from '../view/scene.ts'
import { SPEED_NOTE } from '../pace.ts'
import type { Screen } from './router.ts'
import { robotName } from './home.ts'
import { SOURCE_URL } from './external.ts'
import { CREDITS } from '../credits.ts'

// ---------- Ghế ----------
/**
 * Ai lái một ghế: bạn 1 / bạn 2 (chương trình khối của bạn đó, tay PS2 ảo của bạn đó), máy (agent), hay chạy theo
 * chương trình của bạn 1 / 2 trên bo ảo riêng (đồng đội, tay cầm trung tính) — R27.
 */
export type SeatMode = 'player-0' | 'player-1' | `agent-${Skill}` | 'copy-0' | 'copy-1'

const SKILL_NAME: Record<Skill, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }

/**
 * Ghế của bạn `player` (thứ tự ghế [Đỏ 0, Xanh 0, Đỏ 1, Xanh 1]): bạn 1 ô trái của liên minh mình chọn; bạn 2 ô trái
 * của liên minh kia (mỗi bạn một robot riêng, spec §6.6).
 */
export function seatOf(player: 0 | 1, alliance: Alliance): number {
  const red = (player === 0) === (alliance === 'red')
  return red ? 0 : 1
}

/** Ghế mặc định của trận lẻ / đấu tập: robot của em (và của bạn 2) do người lái, 3 (2) ghế còn lại là máy. */
export function defaultSeats(alliance: Alliance, skill: Skill, players: 1 | 2): SeatMode[] {
  const modes: SeatMode[] = [0, 1, 2, 3].map(() => `agent-${skill}` as SeatMode)
  modes[seatOf(0, alliance)] = 'player-0'
  if (players === 2) modes[seatOf(1, alliance)] = 'player-1'
  return modes
}

/** Đặt ghế i; mỗi bạn chỉ lái một robot nên ghế khác đang là bạn đó chuyển sang máy `skill`. */
export function assignSeat(modes: readonly SeatMode[], i: number, m: SeatMode, skill: Skill): SeatMode[] {
  return modes.map((x, k) => (k === i ? m : m.startsWith('player-') && x === m ? (`agent-${skill}` as SeatMode) : x))
}

/** Ghế của bạn p theo bảng ghế (−1 = bạn đó không lái robot nào). */
export function playerSeat(modes: readonly SeatMode[], p: 0 | 1): number {
  return modes.indexOf(`player-${p}`)
}

/** Các lựa chọn của ô chọn ghế (Nâng cao). */
export function seatOptions(names: readonly [string, string], players: 1 | 2): [SeatMode, string][] {
  const out: [SeatMode, string][] = [['player-0', `${names[0]} lái`]]
  if (players === 2) out.push(['player-1', `${names[1]} lái`])
  for (const k of ['easy', 'medium', 'hard'] as Skill[]) out.push([`agent-${k}`, `Máy ${SKILL_NAME[k]}`])
  out.push(['copy-0', `Chương trình của ${names[0]}`])
  if (players === 2) out.push(['copy-1', `Chương trình của ${names[1]}`])
  return out
}

// ---------- Bảng phím ----------
const KEY_NAME: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Comma: ',', Period: '.' }
/** Tên phím để in: KeyW ⇒ "W", Digit1 ⇒ "1", ArrowUp ⇒ "↑". */
export function keyName(code: string): string {
  return KEY_NAME[code] ?? code.replace(/^Key|^Digit/, '')
}
const PS2_SYM: Record<Ps2Button, string> = { TRIANGLE: '△', CROSS: '✕', SQUARE: '□', CIRCLE: '○', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2' }
const DRIVE_ROWS: [keyof (typeof KEY_TABLE)['solo']['drive'], string][] = [
  ['up', 'Chạy tới'], ['down', 'Lùi'], ['left', 'Xoay trái'], ['right', 'Xoay phải'], ['strafeL', 'Đi ngang trái'], ['strafeR', 'Đi ngang phải'],
]

/**
 * Bảng phím của bố cục `layout` cho robot `cfg`: phím lái (đi ngang chỉ đế 4 bánh) rồi phím nút PS2 kèm chức năng
 * trong mẫu TeleOp của robot đó (`teleopButtons`); nút mẫu không dùng ghi "Mẫu chưa dùng — chương trình của em gán".
 */
export function keyRows(layout: KeyLayout, cfg: RobotConfig): { keys: string; action: string }[] {
  const t = KEY_TABLE[layout]
  const four = (cfg.drive as Drive) !== 'diff2'
  const roles = teleopButtons(cfg)
  const rows = DRIVE_ROWS.map(([d, action]) => ({
    keys: t.drive[d].map(keyName).join(' / '),
    action: d.startsWith('strafe') && !four ? `${action} (chỉ đế 4 bánh)` : action,
  }))
  // Một dòng mỗi nút PS2, gom mọi phím của nút đó: "I / 1 = △".
  const byButton = new Map<Ps2Button, string[]>()
  for (const [code, name] of Object.entries(t.buttons)) byButton.set(name as Ps2Button, [...(byButton.get(name as Ps2Button) ?? []), keyName(code)])
  for (const [name, codes] of byButton) {
    rows.push({ keys: `${codes.join(' / ')} = ${PS2_SYM[name]}`, action: roles[name] ?? 'Mẫu chưa dùng — chương trình của em gán' })
  }
  return rows
}

// ---------- DOM ----------
export interface SettingsCtx {
  screen: Screen
  camera: CameraView
  setCamera(v: CameraView): void
  quality: Quality
  setQuality(q: Quality): void
  sound: boolean
  setSound(v: boolean): void
  layout2p: boolean
  setLayout2p(v: boolean): void
  /** Tình trạng tay cầm của bạn 1, bạn 2 (chữ để hiện) và số tay đang nhận được. */
  pads: { lines: string[]; ready: number }
  /** Chế độ giáo viên: màn chơi cũng hiện đủ vỏ lập trình (khối, Serial, số đo cổng). */
  teacher: boolean
  setTeacher(v: boolean): void
  /** Có chữ ⇒ không đổi được số bạn (giải đấu: số bạn chốt lúc ghi danh), nút mờ, hiện chữ này. */
  layoutLocked?: string
  names: [string, string]
  cfg(p: 0 | 1): RobotConfig
  /** Chỉ ở trận / đấu tập. */
  match?: {
    practice: boolean
    setPractice(v: boolean): void
    /** Ô chọn robot / đế / cơ cấu (editor.configControls) cho từng bạn đang chơi. */
    robots: { label: string; el: HTMLElement; refresh(): void }[]
    alliance: Alliance
    setAlliance(a: Alliance): void
    skill: Skill
    setSkill(s: Skill): void
    runMine: boolean
    /** "Của em v2" khi bạn 1 có bản lưu cho robot đang chọn; null ⇒ chỉ Mặc định. */
    saved: string | null
    setRunMine(v: boolean): void
    speeds: number[]
    speed(): number
    locked(): boolean
    setSpeed(s: number): void
    seats: { modes: SeatMode[]; labels: string[]; options: [SeatMode, string][]; set(i: number, m: SeatMode): void }
  }
}

export interface SettingsPopover {
  readonly shown: boolean
  open(ctx: SettingsCtx): void
  close(): void
  toggle(ctx: SettingsCtx): void
  /** Gọi mỗi khung: nút tốc độ theo khoá R24. */
  update(): void
}

const CSS = `
html[data-chrome="game"] .st-pop { left: auto; right: 12px; top: 62px; bottom: auto; max-height: calc(100vh - 74px); }
.st-pop { position: fixed; left: 56px; bottom: 32px; z-index: 60; display: grid; gap: 10px; width: min(660px, calc(100vw - 64px)); max-height: calc(100vh - 48px); overflow: auto; box-sizing: border-box; padding: 14px; background: #fff; color: var(--ink); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px #0008; font: 13px var(--font); }
.st-pop[hidden] { display: none; }
.st-pop h3 { margin: 0; font-size: 15px; }
.st-pop h4 { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.st-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.st-row > b { font-size: 12px; color: var(--muted); min-width: 120px; }
.st-pop button { font: 600 13px var(--font); border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
.st-pop button[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }
.st-pop button:disabled { opacity: .4; cursor: default; }
.st-pop label { display: inline-flex; gap: 4px; align-items: center; }
.st-pop select { font: 13px var(--font); border: 1px solid var(--line); border-radius: 5px; padding: 2px 4px; background: #fff; max-width: 210px; }
.st-pop .st-pad { padding: 2px 8px; border-radius: 5px; background: #f1f3f2; }
.st-pop .fe-cfg label { border: 0; padding: 0; font-weight: 500; }
.st-note { font: 600 12px var(--font); color: var(--muted); }
.st-note[hidden] { display: none; }
.st-url { font: 12px var(--mono, monospace); color: var(--muted); user-select: all; -webkit-user-select: all; cursor: text; word-break: break-all; }
.st-credit { font-size: 12px; color: var(--muted); margin: 2px 0; user-select: text; -webkit-user-select: text; word-break: break-word; }
.st-keys { border-collapse: collapse; font-size: 12.5px; width: 100%; }
.st-keys td { padding: 2px 8px 2px 0; vertical-align: top; }
.st-keys td:first-child { white-space: nowrap; font-family: var(--mono); font-weight: 700; }
.st-tables { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.st-pop details summary { cursor: pointer; font-weight: 700; }
.st-pop details[open] summary { margin-bottom: 6px; }
@media (max-width: 900px) { .st-pop { left: 8px; right: 8px; width: auto; bottom: 30px; } }
`

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** Hàng nút chọn một: bấm ⇒ sáng nút đó rồi gọi `on`. */
function group<T>(items: [T, string][], value: T, on: (v: T) => void): HTMLButtonElement[] {
  const bs = items.map(([v, text]) => {
    const b = el('button', undefined, text)
    b.type = 'button'
    b.onclick = () => {
      bs.forEach((x, k) => x.setAttribute('aria-pressed', String(items[k][0] === v)))
      on(v)
    }
    b.setAttribute('aria-pressed', String(v === value))
    return b
  })
  return bs
}

const row = (title: string, ...items: HTMLElement[]) => {
  const r = el('div', 'st-row')
  r.append(el('b', undefined, title), ...items)
  return r
}

function keyTable(title: string, layout: KeyLayout, cfg: RobotConfig): HTMLElement {
  const box = el('div')
  const t = el('table', 'st-keys')
  t.dataset.layout = layout
  for (const r of keyRows(layout, cfg)) {
    const tr = el('tr')
    tr.append(el('td', undefined, r.keys), el('td', undefined, r.action))
    t.append(tr)
  }
  box.append(el('h4', undefined, title), t)
  return box
}

export function createSettings(): SettingsPopover {
  if (!document.getElementById('st-css')) {
    const s = el('style')
    s.id = 'st-css'
    s.textContent = CSS
    document.head.append(s)
  }
  const pop = el('div', 'st-pop')
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', 'Cài đặt')
  pop.hidden = true
  document.body.append(pop)
  let speedBtns: HTMLButtonElement[] = []
  let speedNote: HTMLElement | null = null
  let ctx: SettingsCtx | null = null
  let opener: Element | null = null
  /** Mục Nâng cao đang mở: giữ khi vẽ lại (đổi ghế ⇒ ô chọn khác đổi theo), thu lại khi đóng ⚙. */
  let advOpen = false

  const render = (c: SettingsCtx, redraw: boolean) => {
    // Vẽ lại khi đang mở: đọc thẳng trạng thái mục Nâng cao (sự kiện toggle đến chậm hơn một nhịp).
    const prev = redraw ? pop.querySelector<HTMLDetailsElement>('details[data-role="advanced"]') : null
    if (prev) advOpen = prev.open
    const parts: HTMLElement[] = [el('h3', undefined, 'Cài đặt')]
    const m = c.match
    if (m) {
      parts.push(row('Chế độ', ...group([[false, 'Trận lẻ'], [true, 'Đấu tập']], m.practice, m.setPractice)))
      for (const r of m.robots) {
        r.refresh()
        parts.push(row(r.label, r.el))
      }
      parts.push(row('Liên minh của em', ...group<Alliance>([['red', 'Đỏ'], ['blue', 'Xanh']], m.alliance, m.setAlliance)))
      parts.push(row('Mức máy', ...group<Skill>([['easy', 'Dễ'], ['medium', 'Vừa'], ['hard', 'Khó']], m.skill, m.setSkill)))
      if (m.saved) parts.push(row('Robot của em chạy', ...group([[true, m.saved], [false, 'Mặc định']], m.runMine, m.setRunMine)))
      else parts.push(row('Robot của em chạy', el('span', 'st-note', 'Mặc định — chưa lưu chương trình nào ở Xưởng lập trình')))
      speedBtns = group(m.speeds.map((s) => [s, `×${s}`] as [number, string]), m.speed(), (s) => m.setSpeed(s))
      speedNote = el('span', 'st-note', SPEED_NOTE)
      parts.push(row('Tốc độ', ...speedBtns, speedNote))
    } else {
      speedBtns = []
      speedNote = null
    }
    parts.push(row('Camera', ...group<CameraView>([['field', 'Toàn sân'], ['follow', 'Theo robot'], ['driver', 'Ghế lái']], c.camera, c.setCamera)))
    parts.push(row('Đồ hoạ', ...group<Quality>([['high', 'Cao'], ['low', 'Thấp']], c.quality, c.setQuality)))
    parts.push(row('Âm thanh', ...group([[true, 'Bật'], [false, 'Tắt']], c.sound, c.setSound)))
    const padRow = row('Tay cầm', ...c.pads.lines.map((t) => el('span', 'st-pad', t)))
    padRow.dataset.role = 'pads'
    parts.push(padRow)
    const two = group([[false, 'Một bạn'], [true, 'Hai bạn (mỗi bạn một tay / chia đôi bàn phím)']], c.layout2p, c.setLayout2p)
    if (c.layoutLocked) for (const b of two) b.disabled = true
    const hint = c.pads.ready >= 2 && !c.layout2p && !c.layoutLocked ? [el('span', 'st-note', 'Đã nhận 2 tay — chọn Hai bạn để cùng thi đấu trên một màn hình')] : []
    const twoRow = row('Hai bạn chơi', ...two, ...hint, ...(c.layoutLocked ? [el('span', 'st-note', c.layoutLocked)] : []))
    twoRow.dataset.role = 'layout2p'
    parts.push(twoRow)
    const tables = el('div', 'st-tables')
    if (c.layout2p) {
      tables.append(keyTable(`${c.names[0]} · nửa trái · ${robotName(c.cfg(0))}`, 'left', c.cfg(0)), keyTable(`${c.names[1]} · nửa phải · ${robotName(c.cfg(1))}`, 'right', c.cfg(1)))
    } else tables.append(keyTable(`Một bạn · ${robotName(c.cfg(0))}`, 'solo', c.cfg(0)))
    const keys = el('details')
    keys.open = true
    keys.append(el('summary', undefined, 'Phím điều khiển (bàn phím là tay PS2 ảo)'), tables)
    parts.push(keys)
    if (m) {
      const adv = el('details')
      adv.dataset.role = 'advanced'
      adv.open = advOpen
      adv.ontoggle = () => (advOpen = adv.open)
      adv.append(el('summary', undefined, 'Nâng cao: ai lái từng robot'))
      const seats = el('div', 'st-row')
      m.seats.modes.forEach((mode, i) => {
        const l = el('label', undefined, m.seats.labels[i])
        const s = el('select')
        s.dataset.seat = String(i)
        for (const [v, t] of m.seats.options) s.append(Object.assign(el('option', undefined, t), { value: v }))
        s.value = mode
        s.onchange = () => m.seats.set(i, s.value as SeatMode)
        l.append(s)
        seats.append(l)
      })
      adv.append(seats)
      parts.push(adv)
    }
    const teach = row('Chế độ giáo viên', ...group([[false, 'Tắt'], [true, 'Bật']], c.teacher, c.setTeacher), el('span', 'st-note', 'hiện khối, Serial, số đo cổng ở mọi màn'))
    teach.dataset.role = 'teacher'
    parts.push(teach)
    // Địa chỉ mã nguồn dạng chữ chọn / chép được (app desktop không mở được link thì vẫn còn chỗ này).
    const src = el('span', 'st-url', SOURCE_URL)
    src.dataset.role = 'source'
    parts.push(row('Mã nguồn (AGPL-3.0)', src))
    // Nguồn của mọi thứ game dùng lại (credits.ts, NGUON.md): thu gọn, chữ chọn / chép được.
    const credits = el('details')
    credits.dataset.role = 'credits'
    credits.append(el('summary', undefined, 'Nguồn (mã, khối, CAD, luật)'))
    for (const c of CREDITS) credits.append(el('div', 'st-credit', `${c.name} — ${c.from} — ${c.license}`))
    parts.push(credits)
    pop.replaceChildren(...parts)
    api.update()
  }

  const api: SettingsPopover = {
    get shown() {
      return !pop.hidden
    },
    open(c) {
      ctx = c
      const redraw = !pop.hidden
      if (!redraw) opener = document.activeElement
      pop.hidden = false // trước render: update() trong render chỉ chạy khi khung đang hiện
      render(c, redraw)
    },
    close() {
      if (pop.hidden) return
      pop.hidden = true
      ctx = null
      advOpen = false
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    },
    toggle(c) {
      if (pop.hidden) api.open(c)
      else api.close()
    },
    update() {
      const m = ctx?.match
      if (pop.hidden || !m) return
      const locked = m.locked()
      const eff = m.speed()
      speedBtns.forEach((b, k) => {
        const on = String(m.speeds[k] === eff)
        if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on)
        const off = locked && m.speeds[k] !== 1
        if (b.disabled !== off) b.disabled = off
      })
      if (speedNote) speedNote.hidden = !locked
    },
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) {
      // Esc chỉ đóng ⚙: chặn các bộ nghe keydown khác trên document (Luật chơi / Robot mẫu về màn chính, R128).
      e.preventDefault()
      e.stopImmediatePropagation()
      api.close()
    }
  })
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node)) api.close()
  })
  return api
}
