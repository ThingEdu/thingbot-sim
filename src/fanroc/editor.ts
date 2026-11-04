// Vùng khối ThingBlock thật cho mỗi robot do người lái (thẻ "Robot 1 · <đội>", "Robot 2 · <đội>"), mỗi thẻ một bo
// ThingBot ảo (SimWorker) nối qua RobotLink. Lỗi tiếng Việt hiện ngay trên vùng khối của thẻ (Review Focus 2).
// Task 11: thẻ không còn thanh nút — Chạy / Dừng / Tải .tb nằm trên thanh chạy nổi của vỏ (ui/shell.ts), robot mẫu /
// đế / cơ cấu dựng bằng `configControls` đặt ở ⚙ (sau này cả Xưởng); trang gọi `run` / `stop` / `download` / `setConfig`.
import * as ScratchBlocks from '@scratch/scratch-blocks'
import SimWorker from '../sim-worker?worker'
import type { Message } from '../sim-worker.ts'
import { createBlocks, type BlocksApi } from '../blocks.ts'
import { RobotLink, type LinkState } from './link.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import type { Ps2State } from './gamepad.ts'
import { ROBOTS, type Actuator, type Drive, type RobotConfig, type RobotType } from './robots.ts'
import { sample, TOOLBOX } from './programs.ts'
import { tbFileName, toTb } from './tb.ts'
import { hasParamProcedures, installMakeBlockDialog, openMakeBlockDialog, registerParamProcedures, TB_PARAM_WARNING } from './procedures.ts'

export interface Editors {
  /** Thẻ đang mở. */
  readonly active: number
  program(i: number): object
  load(i: number, state: object): void
  /** Sinh mã, nạp lên bo ảo; chạy ngay nếu cổng đang mở (`setGate`), không thì chờ `release`. */
  run(i: number): void
  stop(i: number): void
  ports(i: number): PortValues
  /** Bo ảo (RobotLink) của thẻ i — người lái `{ kind: 'program' }` của GameSession. */
  link(i: number): RobotLink
  /** Tay cầm của khung hình này cho bộ thu PS2 của robot i (null = trung tính). */
  input(i: number, pad: Ps2State | null): void
  cfg(i: number): RobotConfig
  state(i: number): LinkState
  onError(cb: (i: number, msg: string) => void): void
  /** Người dùng đổi robot mẫu / đế / cơ cấu của thẻ i. */
  onConfig(cb: (i: number, cfg: RobotConfig) => void): void
  /** Chương trình được phép chạy lúc này không (Trận: chỉ sau 10 s xả bóng), và dòng trạng thái lúc đang chờ. */
  setGate(gate: () => boolean, waiting: () => string): void
  /** Gọi mỗi khung: chương trình đã nạp và đang chờ thì chạy khi cổng mở (hoặc cập nhật dòng chờ). */
  release(): void
  /** Có chương trình học sinh nào đã nạp, đang chạy hay tạm dừng (kể cả bo ảo của robot đồng đội) — R24. */
  anyActive(): boolean
  /** Mở thẻ i. */
  show(i: number): void
  /** Đổi robot mẫu / đế / cơ cấu của thẻ i (báo `onConfig`). */
  setConfig(i: number, cfg: RobotConfig): void
  /** Nạp chương trình mẫu TeleOp / Auto của robot đang chọn vào thẻ i. */
  sample(i: number, kind: 'teleop' | 'auto'): void
  /** Tải chương trình của thẻ i về dạng .tb (khối của em có ô số ⇒ hiện lời báo R37 trên thẻ, vẫn cho tải). */
  download(i: number): void
  /** Mã Arduino của thẻ i, kèm lời báo R37 khi có khối của em có ô số (mã đó chưa chạy được trên ThingBot thật). */
  arduino(i: number): { code: string; warning: string | null }
  /** Tô sáng khối của thẻ i (undefined = bỏ tô). */
  highlight(i: number, id: string | undefined): void
  /** Chữ trên khối (thanh trạng thái "Đang chạy khối: …"). */
  describe(i: number, id: string | undefined): string | null
  /** Vùng khối của thẻ nào đó đổi, hoặc người dùng đổi thẻ (mã Arduino cần sinh lại). */
  onChange(cb: () => void): void
  /** Dừng mọi chương trình (trận mới). */
  stopAll(): void
  /** Vẽ lại vùng khối của thẻ đang mở theo kích thước mới (vùng khối vừa hiện lại). */
  resize(): void
  /** Đổi chữ trên thẻ; null ⇒ ẩn thẻ đó (một bạn chơi: chỉ thẻ của bạn 1). Thẻ đang mở bị ẩn ⇒ mở thẻ đầu còn hiện. */
  tabs(labels: (string | null)[]): void
  /** Một bo ảo nữa chạy theo chương trình của thẻ `src` (robot đồng đội): nạp / chạy / dừng cùng thẻ đó, tay cầm trung tính. */
  follow(src: number, onError: (msg: string) => void): { link: RobotLink; ports(): PortValues; dispose(): void }
}

const CSS = `
.fe-root { display: flex; flex-direction: column; flex: 1; min-height: 0; background: #fff; color: var(--ink); }
.fe-tabs { display: flex; gap: 4px; padding: 8px 8px 0; border-bottom: 1px solid var(--line); }
.fe-tabs button { font: 700 13px var(--font); border: 1px solid var(--line); border-bottom: 0; background: #f4f2ee; border-radius: 6px 6px 0 0; padding: 6px 10px; cursor: pointer; }
.fe-tabs button[hidden] { display: none; }
.fe-tabs button[aria-selected="true"] { background: #fff; color: var(--teal); }
.fe-tabs button[data-err="true"]::after { content: ' ●'; color: var(--hi); }
.fe-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.fe-panel[hidden] { display: none; }
.fe-status { padding: 6px 8px; font-size: 12px; color: var(--muted); }
.fe-cfg { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.fe-cfg label { display: inline-flex; gap: 4px; align-items: center; }
.fe-cfg select { font: 13px var(--font); padding: 3px 4px; border: 1px solid var(--line); border-radius: 5px; background: #fff; max-width: 150px; }
.fe-error { margin: 0 8px 8px; padding: 6px 8px; border-radius: 6px; background: rgba(226, 71, 59, 0.1); color: var(--hi); font-size: 13px; font-weight: 600; }
.fe-error[hidden] { display: none; }
.fe-warn { margin: 0 8px 8px; padding: 6px 8px; border-radius: 6px; background: rgba(240, 170, 30, 0.15); color: #7a4b00; font-size: 13px; }
.fe-warn[hidden] { display: none; }
.fe-ws { flex: 1; min-height: 260px; position: relative; }
/* Khối SẼ chạy tiếp (RobotLink.block) sáng viền vàng, như dòng đang dừng của thanh Debug. */
.fe-root .blocklyHighlighted > .blocklyPath { stroke: #ffd400; stroke-width: 3px; filter: drop-shadow(0 0 5px #ffd400); }
`

const DRIVE_NAME: Record<Drive, string> = { diff2: '2 bánh', omni: '4 bánh omni', mecanum: '4 bánh mecanum' }
const STATUS: Record<LinkState, string> = {
  idle: 'Chưa chạy. Bấm nút Chạy trên sân để nạp chương trình lên ThingBot.',
  loaded: 'Đã nạp, chờ hết 10 giây xả bóng…',
  running: 'Đang chạy',
  paused: 'Đang tạm dừng — robot giữ lệnh cuối',
  stopped: 'Đã dừng — robot đứng yên',
  error: 'Chương trình lỗi — robot đứng yên, trận vẫn tiếp tục',
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const select = (options: [string, string][], value: string, onChange: (v: string) => void): HTMLSelectElement => {
  const s = el('select')
  for (const [v, t] of options) s.append(Object.assign(el('option', undefined, t), { value: v }))
  s.value = value
  s.onchange = () => onChange(s.value)
  return s
}

/** Tải chương trình của thẻ về dạng .tb để mở bằng ThingBlock desktop và nạp lên ThingBot thật. */
async function download(robot: RobotType, program: object): Promise<void> {
  const url = URL.createObjectURL(await toTb(program))
  const a = Object.assign(document.createElement('a'), { href: url, download: tbFileName(robot) })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

let liveWorkers = 0
/** Số bo ảo (Worker) đang sống — kiểm thử trình duyệt dò rò rỉ khi đổi màn nhiều lần. */
export const workerCount = () => liveWorkers

/** Một bo ThingBot ảo: Worker + RobotLink. */
function board(): { link: RobotLink; dispose(): void } {
  const worker = new SimWorker()
  liveWorkers++
  const link = new RobotLink((c) => worker.postMessage(c))
  worker.onmessage = ({ data }: MessageEvent<Message>) => link.receive(data)
  let alive = true
  return {
    link,
    dispose: () => {
      if (alive) (liveWorkers--, (alive = false))
      worker.terminate()
    },
  }
}

/**
 * Ô chọn robot mẫu / đế bánh / "Cơ cấu M3/M4 chạy bằng" cho một cấu hình (dựng mới mỗi lần gọi: ⚙ và Xưởng mỗi chỗ
 * một bộ). Đế 4 bánh: M3/M4 là bánh nên cơ cấu buộc dùng servo 360. `refresh` đọc lại cấu hình hiện tại.
 */
export function configControls(get: () => RobotConfig, set: (cfg: RobotConfig) => void): { el: HTMLElement; refresh(): void } {
  const root = el('span', 'fe-cfg')
  const label = (text: string, input: HTMLElement) => {
    const l = el('label', undefined, text)
    l.append(input)
    return l
  }
  const type = select(
    (Object.keys(ROBOTS) as RobotType[]).map((k) => [k, ROBOTS[k].name]),
    get().type,
    (v) => set({ type: v as RobotType, drive: ROBOTS[v as RobotType].drives[0], actuator: get().actuator }),
  )
  const drive = select([], get().drive, (v) => set({ ...get(), drive: v as Drive }))
  const act = select([['tt', 'động cơ TT'], ['s360', 'servo 360']], get().actuator, (v) => set({ ...get(), actuator: v as Actuator }))
  const refresh = () => {
    const c = get()
    type.value = c.type
    drive.replaceChildren(...ROBOTS[c.type].drives.map((d) => Object.assign(el('option', undefined, DRIVE_NAME[d]), { value: d })))
    drive.value = c.drive
    act.disabled = c.drive !== 'diff2'
    act.value = c.drive === 'diff2' ? c.actuator : 's360'
  }
  // Sau mỗi lần đổi: đọc lại cấu hình (đổi robot ⇒ danh sách đế khác).
  for (const s of [type, drive, act]) {
    const pick = s.onchange as (() => void) | null
    s.onchange = () => {
      pick?.call(s)
      refresh()
    }
  }
  root.append(label('Robot', type), label('Đế', drive), label('Cơ cấu M3/M4 chạy bằng', act))
  refresh()
  return { el: root, refresh }
}

export function createEditors(container: HTMLElement, robots: { label: string; cfg: RobotConfig }[]): Editors {
  registerParamProcedures(ScratchBlocks)
  const makeBlock = openMakeBlockDialog(document.body)
  const style = el('style')
  style.textContent = CSS
  document.head.append(style)
  container.replaceChildren()
  container.classList.add('fe-root')

  let active = 0
  let gate: () => boolean = () => true
  let waiting = () => STATUS.loaded
  const changeCbs: (() => void)[] = []
  const errorCbs: ((i: number, msg: string) => void)[] = []
  const configCbs: ((i: number, cfg: RobotConfig) => void)[] = []
  const followers: { src: number; link: RobotLink }[] = []

  const tabBar = el('div', 'fe-tabs')
  tabBar.setAttribute('role', 'tablist')
  container.append(tabBar)

  type Tab = {
    cfg: RobotConfig
    blocks: BlocksApi
    link: RobotLink
    tab: HTMLButtonElement
    panel: HTMLElement
    status: HTMLElement
    error: HTMLElement
    warn: HTMLElement
    /** Bề rộng vùng khối lần vẽ trước (0 = đang ẩn: lần hiện ra đầu tiên cuộn về góc trên trái). */
    shownW: number
  }
  const tabs: Tab[] = robots.map((r, i) => {
    const tab = el('button', undefined, r.label)
    tab.type = 'button'
    tab.setAttribute('role', 'tab')
    tab.onclick = () => show(i)
    tabBar.append(tab)

    const panel = el('section', 'fe-panel')
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-label', r.label)
    const status = el('div', 'fe-status')
    status.setAttribute('aria-live', 'polite')
    const error = el('div', 'fe-error')
    error.setAttribute('role', 'alert')
    error.hidden = true
    const warn = el('div', 'fe-warn')
    warn.setAttribute('role', 'status')
    warn.hidden = true
    const ws = el('div', 'fe-ws')
    panel.append(status, error, warn, ws)
    container.append(panel)

    const { link } = board()
    const t: Tab = { cfg: { ...r.cfg }, blocks: null as unknown as BlocksApi, link, tab, panel, status, error, warn, shownW: 0 }
    link.onState = (s) => {
      status.textContent = STATUS[s]
      tab.dataset.err = String(s === 'error')
      if (s !== 'error') error.hidden = true
    }
    link.onError = (msg) => {
      error.textContent = msg
      error.hidden = false
      for (const cb of errorCbs) cb(i, msg)
    }
    status.textContent = STATUS.idle

    t.blocks = createBlocks(ws, TOOLBOX)
    installMakeBlockDialog(t.blocks.workspace, makeBlock)
    t.blocks.load(sample(t.cfg, 'teleop'))
    t.blocks.onChange(() => {
      for (const cb of changeCbs) cb()
    })
    return t
  })

  const show = (i: number) => {
    active = i
    tabs.forEach((t, k) => {
      t.tab.setAttribute('aria-selected', String(k === i))
      t.panel.hidden = k !== i
    })
    fit(tabs[i])
    for (const cb of changeCbs) cb()
  }
  /**
   * Vẽ lại vùng khối theo khung. Vùng khối nạp lúc đang ẩn (khung bên đóng, thẻ khác) cuộn sai gốc vì bề rộng 0:
   * lần đầu hiện ra thì cuộn lại về góc trên trái như lúc nạp.
   */
  const fit = (t: Tab) => {
    const w = t.panel.clientWidth
    t.blocks.resize()
    if (w > 0 && t.shownW === 0) t.blocks.workspace.scroll(0, 0)
    t.shownW = w
  }
  show(0)

  const startIfOpen = (link: RobotLink) => {
    if (link.state === 'loaded' && gate()) link.start()
  }

  const api: Editors = {
    get active() {
      return active
    },
    program: (i) => ScratchBlocks.serialization.workspaces.save(tabs[i].blocks.workspace),
    load(i, state) {
      tabs[i].blocks.load(state)
      tabs[i].shownW = tabs[i].panel.clientWidth
    },
    run(i) {
      const t = tabs[i]
      t.link.stop()
      const { code, error } = t.blocks.simCode()
      const ok = t.link.load(code, error)
      for (const f of followers) {
        if (f.src !== i) continue
        f.link.stop() // như thẻ nguồn: dừng bo cũ trước khi nạp lại
        if (ok) f.link.load(code)
      }
      startIfOpen(t.link)
      for (const f of followers) if (f.src === i) startIfOpen(f.link)
    },
    stop(i) {
      tabs[i].link.stop()
      for (const f of followers) if (f.src === i) f.link.stop()
    },
    ports: (i) => tabs[i]?.link.ports() ?? NEUTRAL,
    link: (i) => tabs[i].link,
    input(i, pad) {
      tabs[i]?.link.input(pad)
    },
    cfg: (i) => ({ ...tabs[i].cfg }),
    state: (i) => tabs[i].link.state,
    onError(cb) {
      errorCbs.push(cb)
    },
    onConfig(cb) {
      configCbs.push(cb)
    },
    setGate(g, w) {
      gate = g
      waiting = w
    },
    release() {
      for (const t of tabs) {
        startIfOpen(t.link)
        if (t.link.state === 'loaded') {
          const text = waiting()
          if (t.status.textContent !== text) t.status.textContent = text
        }
      }
      for (const f of followers) startIfOpen(f.link)
    },
    anyActive: () =>
      [...tabs.map((t) => t.link), ...followers.map((f) => f.link)].some((l) => l.state === 'loaded' || l.state === 'running' || l.state === 'paused'),
    show: (i) => show(i),
    setConfig(i, cfg) {
      tabs[i].cfg = { ...cfg }
      for (const cb of configCbs) cb(i, { ...cfg })
    },
    sample(i, kind) {
      api.load(i, sample(tabs[i].cfg, kind))
    },
    download(i) {
      const t = tabs[i]
      const program = api.program(i)
      // Khối của em có ô số chưa nạp được ThingBot thật (R37): báo rõ nhưng vẫn cho tải.
      t.warn.hidden = !hasParamProcedures(program)
      t.warn.textContent = t.warn.hidden ? '' : TB_PARAM_WARNING
      void download(t.cfg.type, program)
    },
    arduino(i) {
      const t = tabs[i]
      return { code: t.blocks.arduinoCode(), warning: hasParamProcedures(api.program(i)) ? TB_PARAM_WARNING : null }
    },
    highlight(i, id) {
      tabs[i]?.blocks.highlight(id)
    },
    describe: (i, id) => tabs[i]?.blocks.describe(id) ?? null,
    onChange(cb) {
      changeCbs.push(cb)
    },
    stopAll() {
      tabs.forEach((_, i) => api.stop(i))
    },
    resize() {
      fit(tabs[active])
    },
    tabs(labels) {
      tabs.forEach((t, k) => {
        const label = labels[k] ?? null
        t.tab.hidden = label === null
        if (label !== null && t.tab.textContent !== label) {
          t.tab.textContent = label
          t.panel.setAttribute('aria-label', label)
        }
      })
      if (tabs[active].tab.hidden) {
        const first = tabs.findIndex((t) => !t.tab.hidden)
        if (first >= 0) show(first)
      }
    },
    follow(src, onError) {
      const b = board()
      const entry = { src, link: b.link }
      b.link.onError = onError
      followers.push(entry)
      // Thẻ nguồn có chương trình (đã nạp / đang chạy / tạm dừng) thì robot đồng đội nạp cùng chương trình ngay; cổng
      // (setGate) đóng lúc đang tạm dừng nên bo mới chờ ở 'loaded' và chạy khi phiên chạy tiếp.
      const s = tabs[src].link
      if ((s.state === 'running' || s.state === 'loaded' || s.state === 'paused') && s.code !== null) {
        b.link.stop()
        b.link.load(s.code)
        startIfOpen(b.link)
      }
      return {
        link: b.link,
        ports: () => b.link.ports(),
        dispose() {
          b.link.stop()
          b.dispose()
          followers.splice(followers.indexOf(entry), 1)
        },
      }
    },
  }
  return api
}
