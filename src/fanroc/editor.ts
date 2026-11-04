// Vùng khối ThingBlock thật cho mỗi robot do người lái (thẻ "Robot 1 · <đội>", "Robot 2 · <đội>"), mỗi thẻ một bo
// ThingBot ảo (SimWorker) nối qua RobotLink. Thẻ chọn robot mẫu, đế bánh, "Cơ cấu M3/M4 chạy bằng", nạp mẫu TeleOp /
// Auto, ▶ Chạy / ■ Dừng; lỗi tiếng Việt hiện ngay dưới thanh của thẻ (Review Focus 2).
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
  /** Có chương trình học sinh nào đã nạp hoặc đang chạy (kể cả bo ảo của robot đồng đội). */
  anyActive(): boolean
  /** Người dùng bấm ▶ Chạy ở thẻ i. */
  onRun(cb: (i: number) => void): void
  /** Dừng mọi chương trình (trận mới). */
  stopAll(): void
  /** Vẽ lại vùng khối của thẻ đang mở theo kích thước mới (vùng khối vừa hiện lại). */
  resize(): void
  /** Một bo ảo nữa chạy theo chương trình của thẻ `src` (robot đồng đội): nạp / chạy / dừng cùng thẻ đó, tay cầm trung tính. */
  follow(src: number, onError: (msg: string) => void): { ports(): PortValues; dispose(): void }
}

const CSS = `
#blocks { display: flex; flex-direction: column; min-height: 0; background: #fff; border-right: 1px solid var(--line); }
.fe-tabs { display: flex; gap: 4px; padding: 8px 8px 0; border-bottom: 1px solid var(--line); }
.fe-tabs button { font: 700 13px var(--font); border: 1px solid var(--line); border-bottom: 0; background: #f4f2ee; border-radius: 6px 6px 0 0; padding: 6px 10px; cursor: pointer; }
.fe-tabs button[aria-selected="true"] { background: #fff; color: var(--teal); }
.fe-tabs button[data-err="true"]::after { content: ' ●'; color: var(--hi); }
.fe-panel { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.fe-panel[hidden] { display: none; }
.fe-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; font-size: 13px; }
.fe-bar label { display: inline-flex; gap: 4px; align-items: center; color: var(--muted); }
.fe-bar select { font: 13px var(--font); padding: 3px 4px; border: 1px solid var(--line); border-radius: 5px; background: #fff; max-width: 150px; }
.fe-bar button { font: 600 13px var(--font); border: 1px solid var(--line); background: #fff; border-radius: 6px; padding: 5px 9px; cursor: pointer; }
.fe-bar button.fe-run { background: var(--teal); border-color: var(--teal); color: #fff; }
.fe-status { padding: 0 8px 6px; font-size: 12px; color: var(--muted); }
.fe-error { margin: 0 8px 8px; padding: 6px 8px; border-radius: 6px; background: rgba(226, 71, 59, 0.1); color: var(--hi); font-size: 13px; font-weight: 600; }
.fe-error[hidden] { display: none; }
.fe-warn { margin: 0 8px 8px; padding: 6px 8px; border-radius: 6px; background: rgba(240, 170, 30, 0.15); color: #7a4b00; font-size: 13px; }
.fe-warn[hidden] { display: none; }
.fe-ws { flex: 1; min-height: 260px; position: relative; }
`

const DRIVE_NAME: Record<Drive, string> = { diff2: '2 bánh', omni: '4 bánh omni', mecanum: '4 bánh mecanum' }
const STATUS: Record<LinkState, string> = {
  idle: 'Chưa chạy. Bấm ▶ Chạy để nạp chương trình lên ThingBot.',
  loaded: 'Đã nạp, chờ hết 10 giây xả bóng…',
  running: 'Đang chạy',
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

/** Một bo ThingBot ảo: Worker + RobotLink. */
function board(): { link: RobotLink; dispose(): void } {
  const worker = new SimWorker()
  const link = new RobotLink((c) => worker.postMessage(c))
  worker.onmessage = ({ data }: MessageEvent<Message>) => link.receive(data)
  return { link, dispose: () => worker.terminate() }
}

export function createEditors(container: HTMLElement, robots: { label: string; cfg: RobotConfig }[]): Editors {
  registerParamProcedures(ScratchBlocks)
  const makeBlock = openMakeBlockDialog(document.body)
  const style = el('style')
  style.textContent = CSS
  document.head.append(style)
  container.replaceChildren()

  let active = 0
  let gate: () => boolean = () => true
  let waiting = () => STATUS.loaded
  const runCbs: ((i: number) => void)[] = []
  const errorCbs: ((i: number, msg: string) => void)[] = []
  const configCbs: ((i: number, cfg: RobotConfig) => void)[] = []
  const followers: { src: number; link: RobotLink }[] = []

  const tabBar = el('div', 'fe-tabs')
  tabBar.setAttribute('role', 'tablist')
  container.append(tabBar)

  type Tab = { cfg: RobotConfig; blocks: BlocksApi; link: RobotLink; tab: HTMLButtonElement; panel: HTMLElement; status: HTMLElement; error: HTMLElement }
  const tabs: Tab[] = robots.map((r, i) => {
    const tab = el('button', undefined, r.label)
    tab.type = 'button'
    tab.setAttribute('role', 'tab')
    tab.onclick = () => show(i)
    tabBar.append(tab)

    const panel = el('section', 'fe-panel')
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-label', r.label)
    const bar = el('div', 'fe-bar')
    const status = el('div', 'fe-status')
    const error = el('div', 'fe-error')
    error.setAttribute('role', 'alert')
    error.hidden = true
    const warn = el('div', 'fe-warn')
    warn.setAttribute('role', 'status')
    warn.hidden = true
    const ws = el('div', 'fe-ws')
    panel.append(bar, status, error, warn, ws)
    container.append(panel)

    const { link } = board()
    const t: Tab = { cfg: { ...r.cfg }, blocks: null as unknown as BlocksApi, link, tab, panel, status, error }
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

    // Thanh của thẻ: robot mẫu, đế bánh, cơ cấu, nạp mẫu, chạy / dừng.
    const setCfg = (next: RobotConfig) => {
      t.cfg = next
      drive.replaceChildren(...ROBOTS[next.type].drives.map((d) => Object.assign(el('option', undefined, DRIVE_NAME[d]), { value: d })))
      drive.value = next.drive
      act.disabled = next.drive !== 'diff2' // đế 4 bánh: M3/M4 là bánh, cơ cấu buộc dùng servo 360
      act.value = next.drive === 'diff2' ? next.actuator : 's360'
      for (const cb of configCbs) cb(i, { ...next })
    }
    const type = select(
      (Object.keys(ROBOTS) as RobotType[]).map((k) => [k, ROBOTS[k].name]),
      t.cfg.type,
      (v) => setCfg({ type: v as RobotType, drive: ROBOTS[v as RobotType].drives[0], actuator: t.cfg.actuator }),
    )
    const drive = select([], t.cfg.drive, (v) => setCfg({ ...t.cfg, drive: v as Drive }))
    const act = select(
      [['tt', 'động cơ TT'], ['s360', 'servo 360']],
      t.cfg.actuator,
      (v) => setCfg({ ...t.cfg, actuator: v as Actuator }),
    )
    const label = (text: string, input: HTMLElement) => {
      const l = el('label', undefined, text)
      l.append(input)
      return l
    }
    const btn = (text: string, onClick: () => void, cls?: string) => {
      const b = el('button', cls, text)
      b.type = 'button'
      b.onclick = onClick
      return b
    }
    bar.append(
      label('Robot', type),
      label('Đế', drive),
      label('Cơ cấu M3/M4 chạy bằng', act),
      btn('Mẫu TeleOp', () => api.load(i, sample(t.cfg, 'teleop'))),
      btn('Mẫu Auto', () => api.load(i, sample(t.cfg, 'auto'))),
      btn('▶ Chạy', () => {
        api.run(i)
        for (const cb of runCbs) cb(i)
      }, 'fe-run'),
      btn('■ Dừng', () => api.stop(i)),
      btn('Tải về để nạp', () => {
        const program = api.program(i)
        // Khối của em có ô số chưa nạp được ThingBot thật (R37): báo rõ nhưng vẫn cho tải.
        warn.hidden = !hasParamProcedures(program)
        warn.textContent = warn.hidden ? '' : TB_PARAM_WARNING
        void download(t.cfg.type, program)
      }),
    )
    drive.replaceChildren(...ROBOTS[t.cfg.type].drives.map((d) => Object.assign(el('option', undefined, DRIVE_NAME[d]), { value: d })))
    drive.value = t.cfg.drive
    act.disabled = t.cfg.drive !== 'diff2'

    t.blocks = createBlocks(ws, TOOLBOX)
    installMakeBlockDialog(t.blocks.workspace, makeBlock)
    t.blocks.load(sample(t.cfg, 'teleop'))
    return t
  })

  const show = (i: number) => {
    active = i
    tabs.forEach((t, k) => {
      t.tab.setAttribute('aria-selected', String(k === i))
      t.panel.hidden = k !== i
    })
    tabs[i].blocks.resize()
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
    },
    run(i) {
      const t = tabs[i]
      t.link.stop()
      const { code, error } = t.blocks.simCode()
      const ok = t.link.load(code, error)
      for (const f of followers) if (f.src === i) (ok ? f.link.load(code) : f.link.stop())
      startIfOpen(t.link)
      for (const f of followers) if (f.src === i) startIfOpen(f.link)
    },
    stop(i) {
      tabs[i].link.stop()
      for (const f of followers) if (f.src === i) f.link.stop()
    },
    ports: (i) => tabs[i]?.link.ports() ?? NEUTRAL,
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
    anyActive: () => [...tabs.map((t) => t.link), ...followers.map((f) => f.link)].some((l) => l.state === 'loaded' || l.state === 'running'),
    onRun(cb) {
      runCbs.push(cb)
    },
    stopAll() {
      tabs.forEach((_, i) => api.stop(i))
    },
    resize() {
      tabs[active].blocks.resize()
    },
    follow(src, onError) {
      const b = board()
      const entry = { src, link: b.link }
      b.link.onError = onError
      followers.push(entry)
      // Thẻ nguồn đang chạy thì robot đồng đội chạy cùng chương trình ngay.
      const s = tabs[src].link
      if ((s.state === 'running' || s.state === 'loaded') && s.code !== null) {
        b.link.load(s.code)
        startIfOpen(b.link)
      }
      return {
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
