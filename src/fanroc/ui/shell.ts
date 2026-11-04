// Vỏ giao diện kiểu Visual Studio Code của ThingBot FanRoc Game (spec §6.1b): cột biểu tượng (Activity Bar) 48 px bên
// trái, khung bên (Side Bar: Khối / Mã Arduino / Nhiệm vụ) mở khi bấm biểu tượng, sân 3D chiếm phần còn lại, khung đáy
// (Panel: Serial / Sự kiện trận) thu gọn một dòng, thanh trạng thái xanh 24 px, và thanh chạy nổi giữa trên sân.
//
// Vỏ chỉ dựng khung và báo bấm; các màn (trận, Xưởng, nhiệm vụ, giải đấu) tự đặt nội dung vào `side.*`, `panel.*`,
// `stage`. Phần thuần (tô màu mã, đếm dòng Serial, chữ thanh trạng thái, độ rộng khung bên) không đụng DOM, có phép
// thử Node (shell.test.ts).
import type { LinkState } from '../link.ts'
import type { PortValues } from '../ports.ts'
import { SOURCE_URL, wireExternal } from './external.ts'
import { icon, type IconName } from './icons.ts'

export type SideView = 'blocks' | 'code' | 'missions'
export type PanelTab = 'serial' | 'events'
export type Activity = 'blocks' | 'code' | 'serial' | 'missions' | 'trophy'
export type InputKind = 'Bàn phím' | 'Tay PS2' | 'Chương trình' | 'Máy'
export interface StatusInfo {
  robot: string
  input: InputKind
  ports: PortValues
  block: string | null
  fps: number
}
export interface RunHandlers {
  run(): void
  pause(): void
  step(): void
  stop(): void
  reset(): void
  download(): void
  camera(): void
}

export interface Shell {
  /** Chỗ đặt sân 3D (luôn chiếm phần còn lại). */
  readonly stage: HTMLElement
  readonly side: Record<SideView, HTMLElement>
  readonly panel: Record<PanelTab, HTMLElement>
  /** Khung bên đang mở (null = không mở). */
  readonly view: SideView | null
  /** Thẻ khung đáy đang mở (null = khung đáy đang thu gọn). */
  readonly panelTab: PanelTab | null
  /** Mở khung bên; bấm lại biểu tượng đang sáng ⇒ null. */
  open(view: SideView | null): void
  setPanel(open: boolean, tab?: PanelTab): void
  /** Số đỏ trên biểu tượng (0 = ẩn). */
  badge(view: 'serial', n: number): void
  /**
   * Nối nút của thanh chạy và tô theo trạng thái bo ảo của thẻ đang mở ('none' = không có chương trình) và phiên
   * (`runState`). Gọi mỗi khung được (chỉ đổi DOM khi khác).
   */
  runbar(h: RunHandlers, state: LinkState | 'none', opts?: RunOpts): void
  /** Ẩn / hiện thanh chạy nổi (màn chính, ghi danh giải: ẩn). */
  runbarVisible(v: boolean): void
  status(s: StatusInfo): void
  /** Màn nào hiện biểu tượng nào (⚙ luôn có). */
  activity(items: Activity[]): void
  onSettings(cb: () => void): void
  /** Biểu tượng Màn chính chỉ hiện khi có người nghe. */
  onHome(cb: () => void): void
  /** Biểu tượng Giải đấu (màn giải đấu nối sau). */
  onTrophy(cb: () => void): void
}

// ---------- Kích thước (brief Task 11) ----------
export const ACT_W = 48
export const STATUS_H = 24
export const PANEL_CLOSED = 28
export const PANEL_OPEN = 160
export const SIDE_MIN = 280
export const SIDE_MAX = 0.7
/** Độ rộng mặc định của từng khung bên, phần của cửa sổ trừ cột biểu tượng. */
const SIDE_DEFAULT: Record<SideView, number> = { blocks: 0.4, code: 0.24, missions: 0.24 }

/** Độ rộng mặc định; cửa sổ ≤ 900 px khung bên phủ lên sân nên rộng hơn (tối đa 560 px, không quá cửa sổ). */
export function defaultSide(v: SideView, winW: number): number {
  const w = Math.round(SIDE_DEFAULT[v] * (winW - ACT_W))
  return winW <= 900 ? Math.max(w, Math.min(winW - ACT_W, 560)) : w
}

/** Độ rộng khung bên khi kéo mép: 280 px … 70 % (cửa sổ hẹp: 70 % thắng, không tràn). */
export function clampSide(px: number, winW: number): number {
  const max = Math.round(SIDE_MAX * (winW - ACT_W))
  return Math.min(max, Math.max(SIDE_MIN, Math.round(px)))
}

// ---------- Tô màu mã Arduino (tối thiểu: từ khoá / số / chú thích / chuỗi) ----------
const KEYWORDS = new Set(
  ('void int long float double bool boolean char byte short unsigned signed const static volatile return if else for while do ' +
    'switch case break continue default true false HIGH LOW INPUT OUTPUT INPUT_PULLUP struct class new delete sizeof uint8_t ' +
    'uint16_t uint32_t int8_t int16_t int32_t String').split(' '),
)
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(#\s*[a-z]+)|([A-Za-z_]\w*)|(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*)/g
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** HTML đã thoát của mã C++, bọc `<span class="k|n|c|s">` quanh từ khoá, số, chú thích, chuỗi. */
export function highlightCpp(code: string): string {
  let out = ''
  let last = 0
  for (const m of code.matchAll(TOKEN)) {
    const i = m.index ?? 0
    out += esc(code.slice(last, i))
    last = i + m[0].length
    const [t, comment, str, pre, word, num] = m
    if (comment) out += `<span class="c">${esc(t)}</span>`
    else if (str) out += `<span class="s">${esc(t)}</span>`
    else if (pre) out += `<span class="k">${esc(t)}</span>`
    else if (word) out += KEYWORDS.has(word) ? `<span class="k">${t}</span>` : esc(t)
    else if (num) out += `<span class="n">${t}</span>`
    else out += esc(t)
  }
  return out + esc(code.slice(last))
}

// ---------- Serial ----------
/** Một lần đọc Serial của RobotLink: lần nạp (`loads`), tổng ký tự / dòng đã nhận (`serialChars` / `serialLines`, không
 *  bị trần cắt) và độ dài chuỗi `serial` đang giữ. */
export interface SerialMark {
  loads: number
  chars: number
  lines: number
  len: number
}

/** Số dòng Serial mới giữa hai lần đọc: hiệu bộ đếm (chuỗi đã chạm trần SERIAL_MAX có thể giống hệt nhau); nạp lại ⇒
 *  đếm từ đầu lần nạp mới. */
export function serialNews(prev: SerialMark, next: SerialMark): number {
  return prev.loads !== next.loads ? next.lines : Math.max(0, next.lines - prev.lines)
}

/**
 * Cách vẽ khung Serial từ lần vẽ trước `prev` tới `next`: 'same' (không đổi), số n = nối n ký tự cuối, 'full' = vẽ lại
 * cả chuỗi (chưa vẽ lần nào, nạp lại, hay trần cắt đầu chuỗi).
 */
export function serialPatch(prev: SerialMark | null, next: SerialMark): 'same' | 'full' | number {
  if (!prev || prev.loads !== next.loads) return 'full'
  const d = next.chars - prev.chars
  if (d === 0) return 'same'
  return d > 0 && next.len === prev.len + d ? d : 'full'
}

// ---------- Thanh chạy ----------
export interface RunOpts {
  /** Đang chạy từng khối: khoá Chạy / Tạm dừng / Chạy từng khối tới khi khối chạy xong. */
  busy?: boolean
  /** Phiên đang tạm dừng (có thể không có chương trình nào). */
  paused?: boolean
  /** Có ghế nào do chương trình khối lái không (không ⇒ Chạy từng khối không có gì để chạy). */
  canStep?: boolean
}
/** Nút nào khoá (true = disabled) và nút nào sáng, theo bo ảo của thẻ đang mở và phiên. */
export function runState(state: LinkState | 'none', o: RunOpts) {
  const busy = o.busy ?? false
  const paused = o.paused ?? state === 'paused'
  const live = state === 'loaded' || state === 'running' || state === 'paused'
  return {
    run: busy,
    pause: busy || paused,
    step: busy || o.canStep === false,
    stop: !live,
    runOn: state === 'running' && !paused,
    pauseOn: paused,
  }
}

// ---------- Thanh trạng thái ----------
const MOTORS = ['M1', 'M2', 'M3', 'M4'] as const
const num = (v: number) => String(Math.round(v) || 0).replace('-', '−')

/** Chữ các ô của thanh trạng thái: robot · cách lái · M1–M4 · khối đang chạy · khung hình/giây. */
export function statusText(s: StatusInfo): [string, string, string, string, string] {
  const p = s.ports
  return [
    s.robot,
    s.input,
    MOTORS.map((m) => `${m} ${num(p?.[m] ?? 0)}`).join(' · '),
    s.block ? `Đang chạy khối: ${s.block}` : '',
    `${Math.round(s.fps)} khung/giây`,
  ]
}

// ---------- Giao diện ----------
const ACT: Record<Activity, { icon: IconName; label: string }> = {
  blocks: { icon: 'blocks', label: 'Khối' },
  code: { icon: 'code', label: 'Mã Arduino' },
  serial: { icon: 'serial', label: 'Serial' },
  missions: { icon: 'missions', label: 'Nhiệm vụ' },
  trophy: { icon: 'trophy', label: 'Giải đấu' },
}
const SIDE_TITLE: Record<SideView, string> = { blocks: 'Khối', code: 'Mã Arduino', missions: 'Nhiệm vụ' }
const PANEL_TITLE: Record<PanelTab, string> = { serial: 'Serial', events: 'Sự kiện trận' }
const INPUT_ICON: Partial<Record<InputKind, IconName>> = { 'Bàn phím': 'keyboard', 'Tay PS2': 'gamepad', 'Chương trình': 'blocks' }
/** Mã nguồn của trang (AGPL-3.0) — hằng ở external.ts cùng danh sách link app desktop được mở. */
export { SOURCE_URL } from './external.ts'

/** Nút "Tải ThingBlock đầy đủ" ở thanh trạng thái: chưa có link chính thức (rỗng) ⇒ không có nút (spec §6.7). */
export function thingblockLink(url: string): { href: string; label: string } | null {
  const href = url.trim()
  return href ? { href, label: 'Tải ThingBlock đầy đủ' } : null
}

const RUN_BUTTONS: { key: keyof RunHandlers; icon: IconName; label: string; cls?: string }[] = [
  { key: 'run', icon: 'play', label: 'Chạy', cls: 'go' },
  { key: 'pause', icon: 'pause', label: 'Tạm dừng' },
  { key: 'step', icon: 'stepOver', label: 'Chạy từng khối' },
  { key: 'stop', icon: 'stop', label: 'Dừng', cls: 'st' },
  { key: 'reset', icon: 'reset', label: 'Về chỗ cũ' },
  { key: 'download', icon: 'download', label: 'Tải .tb để nạp ThingBot' },
  { key: 'camera', icon: 'camera', label: 'Đổi góc camera' },
]

const CSS = `
.sh { position: fixed; inset: 0; display: grid; grid-template-columns: ${ACT_W}px auto minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) ${STATUS_H}px; background: #1e1e1e; color: #ccc; font-family: var(--font); overflow: hidden; }
.sh button { font: inherit; }
.sh-act { grid-row: 1; grid-column: 1; display: flex; flex-direction: column; align-items: center; background: #333; padding-top: 4px; z-index: 30; }
.sh-act button { position: relative; width: ${ACT_W}px; height: 46px; display: grid; place-items: center; border: 0; background: transparent; color: #858585; cursor: pointer; padding: 0; }
.sh-act button:hover, .sh-act button:focus-visible { color: #fff; }
.sh-act button[aria-pressed="true"] { color: #fff; }
.sh-act button[aria-pressed="true"]::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; background: #fff; }
.sh-act .sp { flex: 1; }
.sh-badge { position: absolute; right: 6px; bottom: 8px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: #e2473b; color: #fff; font: 700 10px/16px var(--font); text-align: center; }
.sh-side { grid-row: 1; grid-column: 2; position: relative; display: flex; flex-direction: column; min-height: 0; background: #252526; border-right: 1px solid #3c3c3c; z-index: 20; }
.sh-side-hd { height: 32px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 6px 0 12px; font: 600 11px/1 var(--font); letter-spacing: .8px; text-transform: uppercase; color: #bbb; }
.sh-side-hd span { flex: 1; }
.sh-side-hd button { border: 0; background: transparent; color: #bbb; cursor: pointer; width: 26px; height: 26px; border-radius: 4px; font-size: 18px; line-height: 1; }
.sh-side-hd button:hover { background: #ffffff1a; color: #fff; }
.sh-view { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.sh-sash { position: absolute; top: 0; bottom: 0; right: -3px; width: 6px; cursor: col-resize; z-index: 5; touch-action: none; }
.sh-sash:hover, .sh-sash.drag { background: #007acc; }
.sh-center { grid-row: 1; grid-column: 3; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
#stage { flex: 1; position: relative; min-height: 0; min-width: 0; overflow: hidden; background: #0c0e1e; }
.sh-panel { height: ${PANEL_CLOSED}px; flex: none; display: flex; flex-direction: column; background: #1e1e1e; border-top: 1px solid #3c3c3c; }
.sh-panel[data-open="true"] { height: ${PANEL_OPEN}px; }
.sh-tabs { height: ${PANEL_CLOSED - 1}px; flex: none; display: flex; align-items: center; gap: 4px; padding: 0 8px; }
.sh-tabs button { border: 0; background: transparent; color: #969696; cursor: pointer; height: 22px; padding: 0 8px; font: 600 11px/1 var(--font); letter-spacing: .6px; text-transform: uppercase; position: relative; }
.sh-tabs button[aria-selected="true"] { color: #fff; box-shadow: inset 0 -1px #fff; }
.sh-tabs .sp { flex: 1; }
.sh-tabs .sh-fold { display: grid; place-items: center; width: 26px; padding: 0; text-transform: none; }
.sh-panel[data-open="true"] .sh-fold svg { transform: rotate(180deg); }
.sh-pbody { flex: 1; min-height: 0; overflow: auto; padding: 4px 12px; font: 12px/1.5 var(--mono); color: #9cdcfe; }
.sh-panel[data-open="false"] .sh-pbody { display: none; }
.sh-status { grid-row: 2; grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; padding: 0 10px; background: #007acc; color: #fff; font: 12px/1 var(--font); white-space: nowrap; overflow: hidden; z-index: 30; }
.sh-status span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.sh-status .sp { flex: 1; }
.sh-status .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.sh-status a { color: #fff; text-decoration: none; opacity: .9; }
.sh-status a:hover { text-decoration: underline; opacity: 1; }
.sh-run { position: absolute; top: var(--runbar-top, 12px); left: 50%; transform: translateX(-50%); display: flex; gap: 2px; align-items: center; padding: 3px; background: #333333ee; border: 1px solid #555; border-radius: 6px; box-shadow: 0 4px 14px #0008; z-index: 10; }
.sh-run[hidden] { display: none; }
.sh-run button { width: 34px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 4px; background: transparent; color: #ddd; cursor: pointer; padding: 0; }
.sh-run button:hover:not(:disabled) { background: #ffffff1f; }
.sh-run button.go { color: #4ec96b; }
.sh-run button.st { color: #f14c4c; }
.sh-run button[aria-pressed="true"] { background: #ffffff2a; }
.sh-run button:disabled { opacity: .35; cursor: default; }
.sh-run .sep { width: 1px; align-self: stretch; background: #555; margin: 4px 2px; }
.sh-code-view { flex: 1; min-height: 0; overflow: auto; margin: 0; padding: 8px 10px; background: #1e1e1e; color: #d4d4d4; font: 12px/1.6 var(--mono); white-space: pre; tab-size: 2; }
.sh-code-view .k { color: #569cd6; } .sh-code-view .n { color: #b5cea8; } .sh-code-view .c { color: #6a9955; } .sh-code-view .s { color: #ce9178; }
@media (max-width: 900px) {
  .sh-side { grid-row: auto; grid-column: auto; position: absolute; left: ${ACT_W}px; top: 0; bottom: ${STATUS_H}px; max-width: calc(100vw - ${ACT_W}px); box-shadow: 6px 0 18px #0009; }
  .sh-status .sh-opt { display: none; }
}
`

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function iconButton(name: IconName, label: string, cls?: string): HTMLButtonElement {
  const b = el('button', cls)
  b.type = 'button'
  b.title = label
  b.setAttribute('aria-label', label)
  b.append(icon(name))
  return b
}

/** Mũi tên gập / mở khung đáy (nét tự vẽ, không thuộc bộ biểu tượng chung). */
function chevron(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = '<polyline points="6 15 12 9 18 15"/>'
  return svg
}

/** `thingblockUrl`: link tải ThingBlock đầy đủ (`scripts/game-config.ts`); rỗng ⇒ không hiện nút. */
export function createShell(root: HTMLElement, opts: { thingblockUrl?: string } = {}): Shell {
  if (!document.getElementById('sh-css')) {
    const style = el('style')
    style.id = 'sh-css'
    style.textContent = CSS
    document.head.append(style)
  }
  const shell = el('div', 'sh')
  root.replaceChildren(shell)

  // Cột biểu tượng.
  const act = el('nav', 'sh-act')
  act.setAttribute('aria-label', 'Thanh biểu tượng')
  const actBtn = {} as Record<Activity, HTMLButtonElement>
  for (const k of Object.keys(ACT) as Activity[]) {
    const b = iconButton(ACT[k].icon, ACT[k].label)
    b.dataset.view = k
    b.setAttribute('aria-pressed', 'false')
    actBtn[k] = b
    act.append(b)
  }
  const serialBadge = el('span', 'sh-badge')
  serialBadge.hidden = true
  actBtn.serial.append(serialBadge)
  const homeBtn = iconButton('home', 'Màn chính')
  homeBtn.hidden = true
  const gearBtn = iconButton('settings', 'Cài đặt')
  gearBtn.dataset.view = 'settings'
  act.append(el('div', 'sp'), homeBtn, gearBtn)

  // Khung bên.
  const sideEl = el('aside', 'sh-side')
  sideEl.hidden = true
  const sideHd = el('div', 'sh-side-hd')
  const sideTitle = el('span')
  const closeBtn = el('button', undefined, '×')
  closeBtn.type = 'button'
  closeBtn.title = 'Đóng khung'
  closeBtn.setAttribute('aria-label', 'Đóng khung')
  sideHd.append(sideTitle, closeBtn)
  const side = {} as Record<SideView, HTMLElement>
  for (const v of Object.keys(SIDE_TITLE) as SideView[]) {
    const s = el('section', 'sh-view')
    s.dataset.side = v
    s.setAttribute('aria-label', SIDE_TITLE[v])
    s.hidden = true
    side[v] = s
  }
  const sash = el('div', 'sh-sash')
  sash.setAttribute('role', 'separator')
  sash.setAttribute('aria-orientation', 'vertical')
  sash.title = 'Kéo để đổi độ rộng'
  sideEl.append(sideHd, ...Object.values(side), sash)

  // Giữa: sân + khung đáy.
  const center = el('div', 'sh-center')
  const stage = el('section')
  stage.id = 'stage'
  stage.setAttribute('aria-label', 'Sân FANROC')
  const panelEl = el('section', 'sh-panel')
  panelEl.dataset.open = 'false'
  const tabs = el('div', 'sh-tabs')
  tabs.setAttribute('role', 'tablist')
  const tabBtn = {} as Record<PanelTab, HTMLButtonElement>
  const panel = {} as Record<PanelTab, HTMLElement>
  for (const t of Object.keys(PANEL_TITLE) as PanelTab[]) {
    const b = el('button', undefined, PANEL_TITLE[t])
    b.type = 'button'
    b.setAttribute('role', 'tab')
    b.dataset.tab = t
    tabBtn[t] = b
    tabs.append(b)
    const body = el('div', 'sh-pbody')
    body.dataset.panel = t
    body.setAttribute('role', 'tabpanel')
    body.setAttribute('aria-label', PANEL_TITLE[t])
    panel[t] = body
  }
  const fold = el('button', 'sh-fold')
  fold.type = 'button'
  fold.append(chevron())
  tabs.append(el('span', 'sp'), fold)
  panelEl.append(tabs, ...Object.values(panel))
  center.append(stage, panelEl)

  // Thanh trạng thái.
  const statusEl = el('footer', 'sh-status')
  const st = { robot: el('span'), input: el('span'), ports: el('span', 'mono'), block: el('span'), fps: el('span', 'mono sh-opt') }
  const inputText = el('span')
  st.input.append(inputText)
  const source = Object.assign(el('a', 'sh-opt', 'Mã nguồn (AGPL)'), { href: SOURCE_URL, target: '_blank', rel: 'noopener', title: `Mã nguồn của trang (AGPL-3.0): ${SOURCE_URL}` })
  wireExternal(source)
  const tb = thingblockLink(opts.thingblockUrl ?? '')
  const download = tb && Object.assign(el('a', 'sh-opt', tb.label), { href: tb.href, target: '_blank', rel: 'noopener' })
  // App desktop chỉ mở link có trong EXTERNAL_URLS + phạm vi quyền opener (external.ts): điền THINGBLOCK_URL thì thêm cả hai.
  if (download) wireExternal(download)
  statusEl.append(st.robot, st.input, st.ports, st.block, el('span', 'sp'), st.fps, ...(download ? [download] : []), source)

  // Thanh chạy nổi.
  const runEl = el('div', 'sh-run')
  runEl.setAttribute('role', 'toolbar')
  runEl.setAttribute('aria-label', 'Thanh chạy')
  const runBtn = {} as Record<keyof RunHandlers, HTMLButtonElement>
  let handlers: RunHandlers | null = null
  for (const r of RUN_BUTTONS) {
    if (r.key === 'reset') runEl.append(el('span', 'sep'))
    const b = iconButton(r.icon, r.label, r.cls)
    b.dataset.run = r.key
    b.onclick = () => handlers?.[r.key]()
    runBtn[r.key] = b
    runEl.append(b)
  }
  stage.append(runEl)

  shell.append(act, sideEl, center, statusEl)

  // ---------- Trạng thái ----------
  let view: SideView | null = null
  let panelTab: PanelTab = 'serial'
  let panelOpen = false
  const widths: Partial<Record<SideView, number>> = {}
  const widthOf = (v: SideView) => widths[v] ?? defaultSide(v, innerWidth)
  let settingsCb: (() => void) | null = null
  let homeCb: (() => void) | null = null
  let trophyCb: (() => void) | null = null

  const showSide = () => {
    sideEl.hidden = view === null
    for (const v of Object.keys(side) as SideView[]) side[v].hidden = v !== view
    for (const k of ['blocks', 'code', 'missions'] as const) {
      actBtn[k].setAttribute('aria-pressed', String(k === view))
      actBtn[k].setAttribute('aria-expanded', String(k === view))
    }
    if (view) {
      sideTitle.textContent = SIDE_TITLE[view]
      sideEl.style.width = `${widthOf(view)}px`
    }
  }
  const showPanel = () => {
    panelEl.dataset.open = String(panelOpen)
    for (const t of Object.keys(tabBtn) as PanelTab[]) {
      tabBtn[t].setAttribute('aria-selected', String(t === panelTab))
      panel[t].hidden = t !== panelTab
    }
    actBtn.serial.setAttribute('aria-pressed', String(panelOpen && panelTab === 'serial'))
    fold.title = panelOpen ? 'Thu khung dưới' : 'Mở khung dưới'
    fold.setAttribute('aria-label', fold.title)
    fold.setAttribute('aria-expanded', String(panelOpen))
  }

  const api: Shell = {
    stage,
    side,
    panel,
    get view() {
      return view
    },
    get panelTab() {
      return panelOpen ? panelTab : null
    },
    open(v) {
      view = v
      showSide()
    },
    setPanel(open, tab) {
      panelOpen = open
      if (tab) panelTab = tab
      showPanel()
    },
    badge(_v, n) {
      const text = n > 99 ? '99+' : String(n)
      serialBadge.hidden = n <= 0
      if (serialBadge.textContent !== text) serialBadge.textContent = text
    },
    runbar(h, state, opts = {}) {
      handlers = h
      const r = runState(state, opts)
      const set = (b: HTMLButtonElement, disabled: boolean, pressed: boolean) => {
        if (b.disabled !== disabled) b.disabled = disabled
        const p = String(pressed)
        if (b.getAttribute('aria-pressed') !== p) b.setAttribute('aria-pressed', p)
      }
      set(runBtn.run, r.run, r.runOn)
      set(runBtn.pause, r.pause, r.pauseOn)
      set(runBtn.step, r.step, false)
      set(runBtn.stop, r.stop, false)
    },
    runbarVisible(v) {
      runEl.hidden = !v
    },
    status(s) {
      const [robot, input, ports, block, fps] = statusText(s)
      if (st.robot.textContent !== robot) st.robot.textContent = robot
      if (inputText.textContent !== input) {
        inputText.textContent = input
        st.input.querySelector('svg')?.remove()
        const name = INPUT_ICON[s.input]
        if (name) st.input.prepend(icon(name, 14))
      }
      if (st.ports.textContent !== ports) st.ports.textContent = ports
      if (st.block.textContent !== block) st.block.textContent = block
      if (st.fps.textContent !== fps) st.fps.textContent = fps
    },
    activity(items) {
      for (const k of Object.keys(actBtn) as Activity[]) actBtn[k].hidden = !items.includes(k)
    },
    onSettings(cb) {
      settingsCb = cb
    },
    onHome(cb) {
      homeCb = cb
      homeBtn.hidden = false
    },
    onTrophy(cb) {
      trophyCb = cb
    },
  }

  // ---------- Bấm ----------
  for (const k of ['blocks', 'code', 'missions'] as const) actBtn[k].onclick = () => api.open(view === k ? null : k)
  actBtn.serial.onclick = () => api.setPanel(!(panelOpen && panelTab === 'serial'), 'serial')
  actBtn.trophy.onclick = () => trophyCb?.()
  closeBtn.onclick = () => api.open(null)
  gearBtn.onclick = (e) => {
    e.stopPropagation() // khung ⚙ đóng khi bấm ra ngoài: chính cú bấm mở không được tính là "ngoài"
    settingsCb?.()
  }
  homeBtn.onclick = () => homeCb?.()
  for (const t of Object.keys(tabBtn) as PanelTab[]) tabBtn[t].onclick = () => api.setPanel(!(panelOpen && panelTab === t), t)
  fold.onclick = () => api.setPanel(!panelOpen)

  // Kéo mép khung bên.
  sash.onpointerdown = (e) => {
    if (!view) return
    e.preventDefault()
    sash.setPointerCapture(e.pointerId)
    sash.classList.add('drag')
    const left = sideEl.getBoundingClientRect().left
    const move = (ev: PointerEvent) => {
      if (!view) return
      widths[view] = clampSide(ev.clientX - left, innerWidth)
      sideEl.style.width = `${widths[view]}px`
    }
    const up = () => {
      sash.classList.remove('drag')
      sash.removeEventListener('pointermove', move)
      sash.removeEventListener('pointerup', up)
      sash.removeEventListener('pointercancel', up)
    }
    sash.addEventListener('pointermove', move)
    sash.addEventListener('pointerup', up)
    sash.addEventListener('pointercancel', up)
  }

  // Đổi cỡ cửa sổ: độ rộng đã kéo tay kẹp lại trong 280 px … 70 % của cỡ mới; chưa kéo thì theo mặc định của cỡ mới.
  addEventListener('resize', () => {
    for (const v of Object.keys(widths) as SideView[]) widths[v] = clampSide(widths[v]!, innerWidth)
    if (view) sideEl.style.width = `${widthOf(view)}px`
  })

  api.activity(['blocks', 'code', 'serial'])
  showSide()
  showPanel()
  return api
}
