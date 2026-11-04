// Màn chính kiểu game (spec §6.0, bản phác v4b) và màn "Trước trận" (chọn robot như chọn đội) của ThingBot FanRoc
// Game. Màn chính phủ lên sân 3D đang quay chậm (camera `orbit`): tên game, tên mùa, dòng "robot của em · chương
// trình: Mặc định / Của em vN", 4 ô chế độ — Giải đấu (to nhất, chọn sẵn, Enter vào), Trận lẻ · Đấu tập, Nhiệm vụ
// (x/12), Xưởng lập trình. Phím mũi tên đổi ô.
// Phần thuần (TILES, tileMove, programText, robotStats) chạy được trong Node (home.test.ts); create* dựng DOM.
import type { Skill } from '../agent.ts'
import type { Alliance } from '../layout.ts'
import { V_MAX } from '../robot.ts'
import { ROBOTS, type Drive, type RobotConfig, type RobotType } from '../robots.ts'
import { icon } from './icons.ts'

export type TileId = 'tournament' | 'match' | 'missions' | 'workshop'
/** Thứ tự ô (cũng là thứ tự Tab): Giải đấu trước, chọn sẵn. */
export const TILES: readonly TileId[] = ['tournament', 'match', 'missions', 'workshop']

/**
 * Lưới ô của màn chính (máy tính): Giải đấu chiếm cột trái hai hàng; hàng trên Trận lẻ · Đấu tập rồi Nhiệm vụ; hàng
 * dưới Xưởng lập trình trải hai cột. Phím mũi tên đi theo lưới đó; đi ra ngoài lưới thì đứng yên.
 */
const MOVES: Record<TileId, Partial<Record<'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', TileId>>> = {
  tournament: { ArrowRight: 'match' },
  match: { ArrowLeft: 'tournament', ArrowRight: 'missions', ArrowDown: 'workshop' },
  missions: { ArrowLeft: 'match', ArrowDown: 'workshop' },
  workshop: { ArrowUp: 'match', ArrowLeft: 'tournament' },
}

/** Ô kế tiếp khi bấm phím `key` ở ô `from` (phím khác ⇒ giữ nguyên). */
export function tileMove(from: TileId, key: string): TileId {
  return MOVES[from][key as keyof (typeof MOVES)[TileId]] ?? from
}

/** Nhãn chương trình của robot em: có bản lưu ở Xưởng và chọn chạy bản đó ⇒ "Của em vN", không thì "Mặc định". */
export function programText(saved: { version: number } | null, useMine = true): string {
  return saved && useMine ? `Của em v${saved.version}` : 'Mặc định'
}

/** Thang của thanh Tốc độ, m/s. */
const SPEED_SCALE = 0.6
/** Thang của thanh Chứa bóng (spec: `storage` / 10). */
const STORAGE_SCALE = 10
/** Tay vươn dài nhất của các robot mẫu, m (Xe Cắm Cờ): thanh Cắm cờ đầy. */
const REACH_SCALE = 0.14

export interface RobotStats {
  speed: number
  storage: number
  flag: number
  speedText: string
  storageText: string
  flagText: string
}

const DRIVE_NAME: Record<Drive, string> = { diff2: '2 bánh', omni: '4 bánh omni', mecanum: '4 bánh mecanum' }
const cm = (m: number) => `${Math.round(m * 100)} cm`
const num = (v: number) => String(v).replace('.', ',')

/** Tên robot kèm đế: "Mẫu Maker · 2 bánh". */
export function robotName(cfg: RobotConfig): string {
  return `${ROBOTS[cfg.type].name} · ${DRIVE_NAME[cfg.drive]}`
}

/**
 * Ba thanh của thẻ robot (0…1) lấy từ thông số thật: Tốc độ = V_MAX mặt bánh (mọi đế cùng động cơ TT; đế 4 bánh đi
 * ngang được), Chứa bóng = `storage` / 10 (kẹp 1), Cắm cờ = có kẹp cờ (nửa thanh) + tầm vươn `arm.reach`.
 */
export function robotStats(cfg: RobotConfig): RobotStats {
  const def = ROBOTS[cfg.type]
  const reach = def.arm?.reach ?? 0
  return {
    speed: Math.min(1, V_MAX / SPEED_SCALE),
    storage: Math.min(1, def.storage / STORAGE_SCALE),
    flag: def.flag ? Math.min(1, 0.5 + (0.5 * reach) / REACH_SCALE) : 0,
    speedText: `${num(V_MAX)} m/s${cfg.drive === 'diff2' ? '' : ' · đi ngang được'}`,
    storageText: cfg.type === 'sort' ? `${def.storage} bóng (hai ngăn)` : `${def.storage} bóng`,
    flagText: !def.flag ? 'Không cắm cờ' : reach > 0 ? `Kẹp cờ · tay vươn ${cm(reach)}` : 'Kẹp cờ',
  }
}

// ---------- DOM ----------
const CSS = `
.hm { position: fixed; inset: 0; z-index: 40; overflow: auto; color: #eef2fa; font-family: var(--font); background: linear-gradient(160deg, #0b1440e6 0%, #18246ad0 45%, #3a1460b8 100%); }
.hm[hidden] { display: none; }
.hm-in { min-height: 100%; box-sizing: border-box; padding: 22px 26px 26px; display: flex; flex-direction: column; gap: 14px; }
.hm-top { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.hm-brand { flex: 1; min-width: 0; }
.hm-brand h1 { margin: 0; font-size: clamp(22px, 4vw, 34px); font-weight: 900; letter-spacing: 1px; }
.hm-brand h1 b { color: #ff7a1a; }
.hm-sub { margin-top: 4px; color: #c2cbea; font-size: 13.5px; line-height: 1.5; }
.hm-sub b { color: #ffcf5a; }
.hm-chip { display: flex; gap: 8px; align-items: center; background: #0007; border-radius: 30px; padding: 6px 14px 6px 6px; font-size: 13px; }
.hm-chip i { width: 30px; height: 30px; border-radius: 50%; background: #ff7a1a; display: grid; place-items: center; font-style: normal; font-weight: 800; }
.hm-chip svg { color: #ffcf5a; }
.hm-gear { width: 40px; height: 40px; border-radius: 50%; border: 1px solid #fff3; background: #0006; color: #eef2fa; display: grid; place-items: center; cursor: pointer; padding: 0; }
.hm-gear:hover, .hm-gear:focus-visible { background: #fff2; }
.hm-sp { flex: 1; }
.hm-tiles { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: 150px 150px; gap: 12px; max-width: 800px; }
.hm-tile { position: relative; overflow: hidden; text-align: left; border-radius: 12px; padding: 14px; color: #fff; border: 2px solid #fff2; box-shadow: 0 6px 18px #0007; cursor: pointer; font: inherit; }
.hm-tile h3 { margin: 0; font-size: 19px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; }
.hm-tile p { margin: 4px 0 0; font-size: 12.5px; color: #fffd; line-height: 1.4; }
.hm-tile p svg { vertical-align: -3px; }
.hm-tile[data-tile="tournament"] { grid-row: span 2; display: flex; flex-direction: column; justify-content: flex-end; background: linear-gradient(150deg, #e2384d, #9d1530); border-color: #fff8; }
.hm-tile[data-tile="tournament"] h3 { font-size: 26px; }
.hm-tile[data-tile="match"] { background: linear-gradient(150deg, #2463eb, #142f8a); }
.hm-tile[data-tile="missions"] { background: linear-gradient(150deg, #1fa860, #0d5e35); }
.hm-tile[data-tile="workshop"] { grid-column: span 2; background: linear-gradient(150deg, #f2a516, #a35f00); }
.hm-tile[aria-current="true"] { outline: 3px solid #ffcf5a; outline-offset: 2px; }
.hm-tile:hover { filter: brightness(1.08); }
.hm-tile .k { position: absolute; right: 12px; top: 10px; font-size: 11px; background: #0005; padding: 2px 8px; border-radius: 10px; }
.hm-tile:not([aria-current="true"]) .k { display: none; }
.hm-hint { color: #aab3c7; font-size: 12.5px; }
@media (max-width: 700px) {
  .hm-in { padding: 16px; }
  .hm-tiles { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; }
  .hm-tile[data-tile="tournament"], .hm-tile[data-tile="workshop"] { grid-row: auto; grid-column: auto; }
  .hm-tile[data-tile="tournament"] { min-height: 120px; }
}
/* Trước trận: chọn robot như chọn đội. */
.pk-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pk-row > b { min-width: 110px; font-size: 12.5px; color: #c2cbea; }
.pk-seg button { font: 700 13px var(--font); color: #eef2fa; background: #0006; border: 1px solid #fff3; border-radius: 8px; padding: 7px 12px; cursor: pointer; }
.pk-seg button[aria-pressed="true"] { background: #ffcf5a; color: #221; border-color: #ffcf5a; }
.pk-cards { display: flex; flex-wrap: wrap; gap: 10px; }
.pk-card { flex: 1 1 160px; max-width: 210px; box-sizing: border-box; text-align: left; background: #0008; color: #eef2fa; border-radius: 12px; padding: 12px; border: 2px solid #fff2; cursor: pointer; font: inherit; }
.pk-card[aria-pressed="true"] { border-color: #ffcf5a; box-shadow: 0 0 0 2px #ffcf5a55; }
.pk-card h4 { margin: 0 0 6px; font-size: 14px; }
.pk-bar { font-size: 11.5px; color: #ccd; margin: 5px 0; }
.pk-bar > span { display: block; height: 6px; border-radius: 3px; background: #333a55; margin-top: 3px; }
.pk-bar > span > i { display: block; height: 100%; border-radius: 3px; background: #ffcf5a; }
.pk-bar small { color: #aab3c7; }
.prog { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #556; color: #dde; font-weight: 700; margin-top: 6px; }
.prog[data-mine="true"] { background: #f2a516; color: #221; }
.pk-card select { font: 12px var(--font); margin-top: 6px; max-width: 100%; }
.pk-acts { display: flex; gap: 10px; flex-wrap: wrap; }
.pk-acts button { display: inline-flex; gap: 6px; align-items: center; font: 800 15px var(--font); border-radius: 10px; padding: 10px 18px; cursor: pointer; border: 1px solid #fff4; background: #0006; color: #eef2fa; }
.pk-acts button.main { background: #1fa860; border-color: #1fa860; color: #fff; }
.pk-note { font-size: 12.5px; color: #aab3c7; }
.pk-draft { background: #f2a51626; border: 1px solid #f2a51677; border-radius: 8px; padding: 6px 10px; }
.pk-draft .pk-note { color: #ffcf5a; font-weight: 700; }
.pk-draft button { font: 700 12.5px var(--font); color: #eef2fa; background: #0006; border: 1px solid #fff4; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.pk-note[data-ok="false"] { color: #ff8a7a; }
`

function injectCss(): void {
  if (document.getElementById('hm-css')) return
  const s = document.createElement('style')
  s.id = 'hm-css'
  s.textContent = CSS
  document.head.append(s)
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const btn = (text: string, onClick: () => void, cls?: string): HTMLButtonElement => {
  const b = el('button', cls, text)
  b.type = 'button'
  b.onclick = onClick
  return b
}

/** Hàng nút chọn một (aria-pressed). */
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

const row = (title: string, ...items: HTMLElement[]) => {
  const r = el('div', 'pk-row')
  r.append(el('b', undefined, title), ...items)
  return r
}

export interface HomeInfo {
  season: string
  robot: string
  program: string
  player: string
  stars: number
  missions: { done: number; total: number }
}

export interface Home {
  readonly shown: boolean
  show(info: HomeInfo): void
  hide(): void
  /** Phím ở màn chính (mũi tên đổi ô, Enter vào ô đang chọn); true nếu đã dùng phím. */
  key(e: KeyboardEvent): boolean
}

const TILE_TEXT: Record<TileId, { title: string; text: (i: HomeInfo) => (string | Node)[] }> = {
  tournament: { title: 'Giải đấu', text: () => ['Đúng luật FANROC: vòng xếp hạng 4–10 trận, bốc thăm liên minh, 1–2 bạn chơi.'] },
  match: { title: 'Trận lẻ · Đấu tập', text: () => ['Một trận 10 s + 3 phút với 3 robot máy, hoặc sân tự do không tính giờ.'] },
  missions: { title: 'Nhiệm vụ', text: (i) => [`Con rùa robot · ${i.missions.total} nhiệm vụ · ${i.missions.done}/${i.missions.total} `, icon('check', 14)] },
  workshop: {
    title: 'Xưởng lập trình',
    text: () => ['Sửa, nâng cấp chương trình điều khiển robot của em — dùng luôn khi Trận lẻ / Đấu tập. Không sửa thì robot chạy chương trình mặc định.'],
  },
}

export function createHome(root: HTMLElement, on: { open(tile: TileId): void; settings(): void }): Home {
  injectCss()
  const box = el('section', 'hm')
  box.dataset.screen = 'home'
  box.setAttribute('aria-label', 'Màn chính')
  box.hidden = true
  const inner = el('div', 'hm-in')
  box.append(inner)
  root.append(box)

  let current: TileId = 'tournament'
  const tiles = {} as Record<TileId, HTMLButtonElement>
  const select = (t: TileId, focus: boolean) => {
    current = t
    for (const k of TILES) tiles[k]?.setAttribute('aria-current', String(k === t))
    if (focus) tiles[t]?.focus()
  }

  const render = (info: HomeInfo) => {
    const brand = el('div', 'hm-brand')
    const h1 = el('h1')
    h1.append('THINGBOT ', el('b', undefined, 'FANROC'), ' GAME')
    const sub = el('div', 'hm-sub')
    sub.dataset.role = 'robot-line'
    sub.append(`${info.season} · robot của em: ${info.robot} · chương trình: `, el('b', undefined, info.program))
    brand.append(h1, sub)
    const chip = el('div', 'hm-chip')
    chip.append(el('i', undefined, info.player.trim().charAt(0).toUpperCase() || 'B'), `${info.player} · `, icon('star', 14), String(info.stars))
    const gear = el('button', 'hm-gear')
    gear.type = 'button'
    gear.title = 'Cài đặt'
    gear.setAttribute('aria-label', 'Cài đặt')
    gear.append(icon('settings'))
    gear.onclick = (e) => {
      e.stopPropagation() // khung ⚙ đóng khi bấm ra ngoài: cú bấm mở không tính
      on.settings()
    }
    const top = el('div', 'hm-top')
    top.append(brand, chip, gear)

    const grid = el('div', 'hm-tiles')
    grid.setAttribute('role', 'group')
    grid.setAttribute('aria-label', 'Chế độ chơi')
    for (const t of TILES) {
      const b = el('button', 'hm-tile')
      b.type = 'button'
      b.dataset.tile = t
      const p = el('p')
      p.append(...TILE_TEXT[t].text(info))
      b.append(el('h3', undefined, TILE_TEXT[t].title), p)
      if (t === 'tournament') b.append(el('span', 'k', 'Enter'))
      b.onclick = () => {
        select(t, false)
        on.open(t)
      }
      b.onfocus = () => select(t, false)
      tiles[t] = b
      grid.append(b)
    }
    inner.replaceChildren(top, el('div', 'hm-sp'), grid, el('div', 'hm-hint', 'Phím mũi tên đổi ô · Enter để vào · nút Cài đặt góc trên có bảng phím'))
    select(current, false)
  }

  return {
    get shown() {
      return !box.hidden
    },
    show(info) {
      current = 'tournament'
      render(info)
      box.hidden = false
      tiles[current].focus()
    },
    hide() {
      box.hidden = true
    },
    key(e) {
      if (box.hidden) return false
      if (e.key.startsWith('Arrow')) {
        select(tileMove(current, e.key), true)
        return true
      }
      // Enter khi tiêu điểm ở ô: nút tự bấm (không mở hai lần); ngoài ô thì vào ô đang chọn.
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        on.open(current)
        return true
      }
      return false
    },
  }
}

// ---------- Trước trận ----------
export interface PickState {
  practice: boolean
  players: 1 | 2
  /** Bạn đang chọn robot (0 / 1). */
  player: 0 | 1
  names: [string, string]
  cfg(p: 0 | 1): RobotConfig
  /** Phiên bản chương trình bạn p đã lưu ở Xưởng cho robot cfg (null = chưa lưu). */
  saved(p: 0 | 1, cfg: RobotConfig): number | null
  alliance: Alliance
  skill: Skill
  runMine: boolean
  /** Có bản nháp chưa lưu ở Xưởng cho (bạn p, robot cfg) không (R94). */
  draft(p: 0 | 1, cfg: RobotConfig): boolean
  /** Dòng báo sau khi bấm Lưu bản nháp (null = không có). */
  draftMsg: { text: string; ok: boolean } | null
}

export interface PickActions {
  saveDraft(p: 0 | 1, cfg: RobotConfig): void
  dropDraft(p: 0 | 1, cfg: RobotConfig): void
  setPlayer(p: 0 | 1): void
  setCfg(p: 0 | 1, cfg: RobotConfig): void
  setPractice(v: boolean): void
  setAlliance(a: Alliance): void
  setSkill(s: Skill): void
  setRunMine(v: boolean): void
  start(): void
  home(): void
}

export interface Pick {
  readonly shown: boolean
  show(): void
  hide(): void
  /** Vẽ lại theo trạng thái mới (sau mỗi lần chọn). */
  render(): void
}

const SKILLS: [Skill, string][] = [['easy', 'Dễ'], ['medium', 'Vừa'], ['hard', 'Khó']]

export function createPick(root: HTMLElement, get: () => PickState, act: PickActions): Pick {
  injectCss()
  const box = el('section', 'hm')
  box.dataset.screen = 'pick'
  box.setAttribute('aria-label', 'Trước trận: chọn robot')
  box.hidden = true
  const inner = el('div', 'hm-in')
  box.append(inner)
  root.append(box)

  const card = (p: 0 | 1, type: RobotType, chosen: RobotConfig) => {
    const def = ROBOTS[type]
    const on = chosen.type === type
    // Thẻ của robot đang chọn giữ đế đang chọn; thẻ khác: đế đầu tiên của robot đó (cơ cấu giữ nguyên).
    const cfg: RobotConfig = on ? chosen : { type, drive: def.drives[0], actuator: chosen.actuator }
    const st = robotStats(cfg)
    const c = el('button', 'pk-card')
    c.type = 'button'
    c.dataset.robot = type
    c.setAttribute('aria-pressed', String(on))
    c.onclick = () => act.setCfg(p, cfg)
    const bar = (name: string, v: number, text: string) => {
      const b = el('div', 'pk-bar')
      const track = el('span')
      const fill = el('i')
      fill.style.width = `${Math.round(v * 100)}%`
      track.append(fill)
      b.append(`${name} `, el('small', undefined, text), track)
      return b
    }
    const v = get().saved(p, cfg)
    const label = programText(v === null ? null : { version: v }, get().runMine)
    const prog = el('span', 'prog', label)
    prog.dataset.mine = String(label !== 'Mặc định')
    c.append(el('h4', undefined, def.name), bar('Tốc độ', st.speed, st.speedText), bar('Chứa bóng', st.storage, st.storageText), bar('Cắm cờ', st.flag, st.flagText), prog)
    if (on && def.drives.length > 1) {
      const s = el('select')
      s.setAttribute('aria-label', `Đế của ${def.name}`)
      for (const d of def.drives) s.append(Object.assign(el('option', undefined, DRIVE_NAME[d]), { value: d }))
      s.value = cfg.drive
      s.onclick = (e) => e.stopPropagation()
      s.onchange = () => act.setCfg(p, { ...cfg, drive: s.value as Drive })
      c.append(s)
    }
    return c
  }

  const render = () => {
    const s = get()
    const p = s.player
    const chosen = s.cfg(p)
    const head = el('div', 'hm-brand')
    const h1 = el('h1')
    h1.style.fontSize = 'clamp(18px, 3vw, 24px)'
    h1.append(`CHỌN ROBOT · LIÊN MINH `, el('b', undefined, s.alliance === 'red' ? 'ĐỎ' : 'XANH'))
    h1.querySelector('b')!.style.color = s.alliance === 'red' ? '#ff6b7d' : '#7aa6ff'
    head.append(h1)
    const rows: HTMLElement[] = [
      row('Chế độ', segment([['match', 'Trận lẻ · 10 s + 3 phút'], ['practice', 'Đấu tập · không tính giờ']], s.practice ? 'practice' : 'match', (v) => act.setPractice(v === 'practice'))),
    ]
    if (s.players === 2) rows.push(row('Chọn robot cho', segment([['0', s.names[0]], ['1', s.names[1]]], String(p), (v) => act.setPlayer(Number(v) as 0 | 1))))
    const cards = el('div', 'pk-cards')
    cards.setAttribute('aria-label', 'Robot của em')
    for (const t of Object.keys(ROBOTS) as RobotType[]) cards.append(card(p, t, chosen))
    rows.push(cards)
    rows.push(row('Liên minh của em', segment([['red', 'Đỏ'], ['blue', 'Xanh']], s.alliance, (v) => act.setAlliance(v))))
    rows.push(row('Mức máy', segment(SKILLS, s.skill, (v) => act.setSkill(v))))
    const v = s.saved(p, chosen)
    if (v !== null) {
      rows.push(row('Robot của em chạy', segment([['mine', `Của em v${v}`], ['default', 'Mặc định']], s.runMine ? 'mine' : 'default', (m) => act.setRunMine(m === 'mine'))))
    } else rows.push(el('div', 'pk-note', 'Robot của em chạy chương trình mặc định. Vào Xưởng lập trình để sửa và lưu chương trình của em.'))
    if (s.draft(p, chosen)) {
      // Trận chạy bản đã lưu (hoặc Mặc định); bản đang sửa ở Xưởng chỉ vào trận khi em lưu.
      const note = el('div', 'pk-row pk-draft')
      note.dataset.role = 'draft'
      note.append(el('span', 'pk-note', 'Chương trình đang sửa ở Xưởng chưa lưu'), btn('Lưu', () => act.saveDraft(p, chosen)), btn('Bỏ', () => act.dropDraft(p, chosen)))
      rows.push(note)
    }
    if (s.draftMsg) {
      const m = el('div', 'pk-note', s.draftMsg.text)
      m.dataset.role = 'draft-msg'
      m.dataset.ok = String(s.draftMsg.ok)
      m.setAttribute('role', 'status')
      rows.push(m)
    }
    const acts = el('div', 'pk-acts')
    const go = btn('', act.start, 'main')
    go.append(icon('play', 18), s.practice ? 'Vào đấu tập' : 'Vào trận')
    const back = btn('', act.home)
    back.append(icon('home', 18), 'Về màn chính')
    acts.append(go, back)
    inner.replaceChildren(head, ...rows, acts)
  }

  return {
    get shown() {
      return !box.hidden
    },
    show() {
      render()
      box.hidden = false
      box.querySelector<HTMLButtonElement>('.pk-acts .main')?.focus()
    },
    hide() {
      box.hidden = true
    },
    render() {
      if (!box.hidden) render()
    },
  }
}

// ---------- Màn chờ (nhiệm vụ / giải đấu dựng ở task sau) ----------
export interface Placeholder {
  show(screen: 'missions' | 'mission' | 'tournament'): void
  hide(): void
}

const PLACE_TEXT = {
  tournament: { title: 'Giải đấu · Ghi danh', text: 'Ghi danh 1–2 bạn, chọn robot và số trận, bốc thăm lịch đấu. Màn ghi danh đang được làm.' },
  missions: { title: 'Nhiệm vụ con rùa', text: 'Danh sách 12 nhiệm vụ theo 4 chặng. Màn nhiệm vụ đang được làm.' },
  mission: { title: 'Nhiệm vụ', text: 'Màn làm nhiệm vụ đang được làm.' },
}

export function createPlaceholder(root: HTMLElement, home: () => void): Placeholder {
  injectCss()
  const box = el('section', 'hm')
  box.hidden = true
  const inner = el('div', 'hm-in')
  box.append(inner)
  root.append(box)
  return {
    show(screen) {
      box.dataset.screen = screen
      box.setAttribute('aria-label', PLACE_TEXT[screen].title)
      const head = el('div', 'hm-brand')
      head.append(el('h1', undefined, PLACE_TEXT[screen].title), el('div', 'hm-sub', PLACE_TEXT[screen].text))
      const acts = el('div', 'pk-acts')
      const back = btn('', home)
      back.append(icon('home', 18), 'Về màn chính')
      acts.append(back)
      inner.replaceChildren(head, acts)
      box.hidden = false
      back.focus()
    },
    hide() {
      box.hidden = true
    },
  }
}
