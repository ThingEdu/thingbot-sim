/**
 * Trang ThingBot FanRoc Game: vỏ giao diện kiểu VS Code (ui/shell.ts) quanh sân 3D, vùng khối ThingBlock thật cho
 * Robot 1 và Robot 2 (mỗi robot một bo ThingBot ảo) trong khung bên "Khối", mã Arduino chỉ xem trong khung "Mã
 * Arduino", Serial và nhật ký trận ở khung đáy, thanh chạy nổi trên sân. Tay cầm làm bộ thu PS2, Human Player tự
 * động, agent đồng đội cho robot không có người lái. Vòng lặp trận nằm trong GameSession (game.ts); trang chỉ khởi
 * tạo, nối nút và vẽ. Màn chính / Xưởng / nhiệm vụ / giải đấu nối vào vỏ ở các task sau.
 *
 * Thứ tự robot (cũng là số trên bảng điểm): Robot 1 = đỏ ô trái (người lái 1, tay cầm 1), Robot 2 = xanh ô trái
 * (người lái 2, tay cầm 2), Robot 3 = đỏ ô phải (đồng đội Robot 1), Robot 4 = xanh ô phải (đồng đội Robot 2).
 *
 * Ai lái robot nào (ruling R27): mỗi robot một ô chọn tường minh (trong ⚙) — "Chương trình" (Robot 1 / 2, thẻ khối
 * của mình), "Agent Dễ/Vừa/Khó", hoặc "Chương trình của Robot N" (Robot 3 / 4, bo ảo riêng, tay cầm trung tính). Mặc
 * định Robot 1 = Chương trình, Robot 2–4 = Agent Vừa. Ghế "Chương trình" không bao giờ do agent lái: chưa chạy, Dừng
 * hay lỗi đều là đứng yên (Review Focus 2). Đổi người lái chỉ bắt đầu trận mới khi robot phải đổi kiểu / đế.
 * Trận: chương trình chạy khi hết 10 s xả bóng; Luyện tập: xả bóng tua sẵn lúc tạo trận (R31), chương trình chạy ngay. Tay cầm gắn ghế theo lần cắm đầu (R26).
 * Có chương trình khối đã nạp / đang chạy / tạm dừng thì tốc độ xem khoá ở ×1 (R24).
 * Thanh chạy (spec §6.1b) tác động lên thẻ khối đang mở: Chạy (đang tạm dừng ⇒ chạy tiếp), Tạm dừng / Chạy từng khối
 * (GameSession.pause / stepBlock — vật lý, đồng hồ, agent, Human Player cùng đứng), Dừng, Về chỗ cũ (trận mới), Tải
 * .tb, Đổi góc camera. Khối SẼ chạy tiếp (`link.block`) sáng viền trên vùng khối và hiện ở thanh trạng thái.
 *
 * Mỗi khung: GameSession.advance(thời gian thật × tốc độ xem) chạy vật lý theo PHYSICS_DT (tối đa 4 bước cho mỗi
 * khung ở tốc độ ×1, nhân theo tốc độ xem, và không quá ngân sách thời gian mỗi khung — phần dư bỏ đi để không
 * "xoáy chết"), rồi vẽ một lần. `window.__fanroc` mở cho kiểm thử trình duyệt (ruling R4).
 */
import { GameSession, type Driver } from './game.ts'
import type { Skill } from './agent.ts'
import type { LinkState, RobotLink } from './link.ts'
import type { RobotConfig } from './robots.ts'
import { PadSeats, type SeatStatus } from './gamepad.ts'
import { effectiveSpeed, SPEED_NOTE } from './pace.ts'
import { configControls, createEditors } from './editor.ts'
import { defaultConfig } from './programs.ts'
import { NEUTRAL } from './ports.ts'
import { createScene, defaultQuality, type CameraView, type Quality } from './view/scene.ts'
import { createHud } from './view/hud.ts'
import { countdownCue, createScoreboard, programLabel, resultView, ScoreTicker } from './ui/scoreboard.ts'
import { createSound } from './ui/sound.ts'
import { createStore } from './store.ts'
import { FANROC_2026 } from './season.ts'
import { createShell, highlightCpp, serialNews, serialPatch, type InputKind, type SerialMark } from './ui/shell.ts'

const shell = createShell(document.querySelector<HTMLElement>('#app')!)
const stage = shell.stage

const TEAMS = ['Dế Xanh', 'Chuồn Chuồn', 'Kiến Lửa', 'Ong Vàng']
const SKILL_NAME: Record<Skill, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }
/** Số bước vật lý tối đa mỗi khung ở tốc độ ×1 (nhân theo tốc độ xem). */
const MAX_STEPS = 4
/** Ngân sách thời gian chạy vật lý mỗi khung, ms. */
const STEP_BUDGET_MS = 45
const SPEEDS = [1, 4, 40]
const CAMERAS: CameraView[] = ['field', 'follow', 'driver']

// Bảng điểm Đỏ | chung | Xanh nằm giữa trên sân (ui/scoreboard.ts); nhật ký, kiểm tra theo luật và bảng đội cuối trận
// ở thẻ "Sự kiện trận" của khung đáy (view/hud.ts). Khung ⚙ tạm (Task 13 thay bằng ui/settings.ts) giữ các lựa chọn của
// thanh công cụ cũ.
const CSS = `
.sh-serial { margin: 0; white-space: pre-wrap; word-break: break-all; font: inherit; color: #d4d4d4; }
.sh-serial:empty::before { content: 'Chưa có dòng Serial nào. Khối "Serial in" của chương trình in ra ở đây.'; color: #858585; font-family: var(--font); }
.sh-code-warn { margin: 8px 10px 0; padding: 6px 8px; border-radius: 6px; background: rgba(240, 170, 30, 0.18); color: #f0c674; font-size: 12.5px; line-height: 1.45; }
.sh-code-note { padding: 6px 10px 0; font-size: 12px; color: #969696; }
.fr-bar.sh-pop { position: absolute; left: 8px; bottom: 8px; z-index: 25; display: grid; gap: 8px; width: min(640px, calc(100% - 16px)); max-height: calc(100% - 16px); overflow: auto; padding: 12px; background: #fff; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 24px #0006; font-size: 13px; }
.fr-bar h3 { margin: 0; font-size: 14px; }
.fr-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.fr-row > b { font-size: 12px; color: var(--muted); min-width: 92px; }
.fr-bar button, .fr-bar label { font: 600 13px var(--font); border: 1px solid var(--line); background: #fff; border-radius: 6px; padding: 5px 9px; cursor: pointer; }
.fr-bar label { display: inline-flex; gap: 4px; align-items: center; cursor: default; }
.fr-bar .fe-cfg label { border: 0; padding: 0; font-weight: 500; }
.fr-bar select { font: 13px var(--font); border: 0; background: transparent; }
.fr-bar button[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }
.fr-bar button:disabled { opacity: 0.4; cursor: default; }
.fr-bar .fr-note { font: 600 12px var(--font); color: var(--muted); }
.fr-bar .fr-note[hidden] { display: none; }
.fr-pads { position: absolute; left: 10px; bottom: 10px; display: grid; gap: 2px; font: 600 12px var(--font); background: rgba(255,255,255,0.92); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 5px 9px; z-index: 4; }
`

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = text
  b.onclick = onClick
  return b
}

function group(items: { label: string; on: () => void }[], initial: number): HTMLButtonElement[] {
  const bs = items.map((it, i) =>
    button(it.label, () => {
      bs.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)))
      it.on()
    }),
  )
  bs.forEach((b, k) => b.setAttribute('aria-pressed', String(k === initial)))
  return bs
}

function picker(text: string, options: [string, string][], value: string, onChange: (v: string) => void): HTMLLabelElement {
  const l = document.createElement('label')
  l.textContent = text
  const s = document.createElement('select')
  for (const [v, t] of options) s.append(Object.assign(document.createElement('option'), { value: v, textContent: t }))
  s.value = value
  s.onchange = () => onChange(s.value)
  l.append(s)
  return l
}

function row(title: string, ...items: HTMLElement[]): HTMLDivElement {
  const r = document.createElement('div')
  r.className = 'fr-row'
  r.append(Object.assign(document.createElement('b'), { textContent: title }), ...items)
  return r
}

type SeatMode = 'program' | `agent-${Skill}` | 'copy-0' | 'copy-1'

async function start(): Promise<void> {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const editors = createEditors(shell.side.blocks, [0, 1].map((i) => ({ label: `Robot ${i + 1} · ${TEAMS[i]}`, cfg: defaultConfig('maker') })))
  const seats = new PadSeats()
  let seed = 1
  let practice = false
  /** Ai lái từng robot (ruling R27): chọn tường minh, không phụ thuộc lịch sử bấm nút. */
  const modes: SeatMode[] = ['program', 'agent-medium', 'agent-medium', 'agent-medium']
  const followers: ({ link: RobotLink; dispose(): void } | null)[] = [null, null, null, null]
  const cfgFor = (i: number): RobotConfig => {
    const m = modes[i]
    if (m.startsWith('copy-')) return editors.cfg(Number(m.slice(5)))
    return i < 2 ? editors.cfg(i) : defaultConfig('maker')
  }
  const skillOf = (i: number): Skill => (modes[i].startsWith('agent-') ? (modes[i].slice(6) as Skill) : 'medium')
  /** Người lái của ghế i theo ô chọn: bo ảo của thẻ, bo ảo đồng đội (follower) hoặc agent. */
  const driverFor = (i: number): Driver => {
    const m = modes[i]
    if (m === 'program') return { kind: 'program', link: editors.link(i) }
    const f = followers[i]
    if (m.startsWith('copy-') && f) return { kind: 'program', link: f.link }
    return { kind: 'agent', skill: skillOf(i) }
  }
  const newGame = (s: number) =>
    GameSession.create({
      mode: practice ? 'practice' : 'match',
      seed: s,
      seats: [0, 1, 2, 3].map((i) => ({ cfg: cfgFor(i), team: TEAMS[i], driver: driverFor(i) })),
    })

  let game = await newGame(seed)
  game.match.log('Human Player tự động')
  stage.querySelector('.sh-loading')?.remove()
  const scene = createScene(stage)
  const hud = createHud(shell.panel.events)
  const board = createScoreboard(stage)
  const ticker = new ScoreTicker()
  const store = createStore(FANROC_2026.id)
  const sound = createSound(() => store.settings().sound)
  /** Nhãn chương trình từng ghế trên bảng điểm: agent ⇒ "Máy Vừa"; chương trình ⇒ "Mặc định" (Xưởng gắn "Của em vN" ở Task 13). */
  const programs = () => game.robots.map((_, i) => programLabel(game.driver(i)))
  editors.setGate(
    () => game.canRun,
    () =>
      game.paused ? 'Đang tạm dừng — bấm Chạy để chạy tiếp' : game.match.phase === 'end' ? 'Trận đã kết thúc — bấm Về chỗ cũ để chơi trận mới' : 'Đã nạp, chờ hết 10 giây xả bóng…',
  )
  editors.onError((i, msg) => hud.log(`Robot ${i + 1}: ${msg}`))

  // Khung bên "Khối": vẽ lại vùng khối mỗi khi khung đổi cỡ (mở, đóng, kéo mép).
  new ResizeObserver(() => editors.resize()).observe(shell.side.blocks)

  // Khung bên "Mã Arduino": chỉ xem, sinh lại (chờ 250 ms) khi vùng khối đổi hoặc đổi thẻ. Khối của em có ô số ⇒ lời
  // báo R37 (mã Arduino của khối đó chưa đúng trên ThingBot thật).
  const codeNote = Object.assign(document.createElement('div'), { className: 'sh-code-note' })
  const codeWarn = Object.assign(document.createElement('div'), { className: 'sh-code-warn' })
  codeWarn.setAttribute('role', 'status')
  const codeView = Object.assign(document.createElement('pre'), { className: 'sh-code-view' })
  codeView.setAttribute('aria-label', 'Mã Arduino sinh từ khối')
  shell.side.code.append(codeNote, codeWarn, codeView)
  let codeTimer = 0
  const showCode = () => {
    const i = editors.active
    const { code, warning } = editors.arduino(i)
    codeNote.textContent = `Robot ${i + 1} · mã C++ sinh từ khối, chỉ xem`
    codeWarn.hidden = !warning
    codeWarn.textContent = warning ?? ''
    codeView.innerHTML = highlightCpp(code)
  }
  editors.onChange(() => {
    clearTimeout(codeTimer)
    codeTimer = window.setTimeout(showCode, 250)
  })
  showCode()

  // Khung đáy "Serial": chữ bo ảo của thẻ đang mở in ra. Dòng mới đếm bằng bộ đếm của RobotLink (đúng cả khi chuỗi đã
  // chạm trần SERIAL_MAX); khi khung không mở trên Serial ⇒ số đỏ trên biểu tượng. Chỉ vẽ khi thẻ Serial đang hiện và
  // có chữ mới: nối phần thêm, vẽ lại cả chuỗi khi nạp lại / trần cắt đầu.
  const serialPre = Object.assign(document.createElement('pre'), { className: 'sh-serial' })
  shell.panel.serial.append(serialPre)
  const markOf = (l: RobotLink): SerialMark => ({ loads: l.loads, chars: l.serialChars, lines: l.serialLines, len: l.serial.length })
  let serialOf = -1
  let counted: SerialMark | null = null
  let drawn: SerialMark | null = null
  let serialUnseen = 0
  const showSerial = () => {
    const i = editors.active
    const link = editors.link(i)
    const m = markOf(link)
    if (i !== serialOf) {
      // Đổi thẻ robot: số chưa xem tính lại từ thẻ mới, khung vẽ lại cả chuỗi.
      serialOf = i
      serialUnseen = 0
      drawn = null
    } else if (counted && shell.panelTab !== 'serial') serialUnseen += serialNews(counted, m)
    counted = m
    if (shell.panelTab === 'serial') {
      serialUnseen = 0
      const patch = serialPatch(drawn, m)
      if (patch !== 'same') {
        const body = shell.panel.serial
        const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 4
        const text = serialPre.firstChild as Text | null
        if (patch === 'full' || !text) serialPre.textContent = link.serial // chuỗi rỗng ⇒ không còn nút chữ: hiện lời nhắc
        else text.appendData(link.serial.slice(-patch))
        if (atEnd) body.scrollTop = 1e9 // trình duyệt tự kẹp về cuối, không đọc lại kích thước
        drawn = m
      }
    }
    shell.badge('serial', serialUnseen)
  }

  /** Tốc độ người dùng xin; tốc độ thật = effectiveSpeed (R24: có chương trình khối thì ×1). */
  let requested = 1
  let cam: CameraView = 'field'
  let speedBtns: HTMLButtonElement[] = []
  const speedNote = document.createElement('span')
  speedNote.className = 'fr-note'
  speedNote.textContent = SPEED_NOTE
  const speedNow = () => effectiveSpeed(requested, editors.anyActive())
  const showSpeed = () => {
    const locked = editors.anyActive()
    const eff = speedNow()
    speedBtns.forEach((b, k) => {
      b.setAttribute('aria-pressed', String(SPEEDS[k] === eff))
      b.disabled = locked && SPEEDS[k] !== 1
    })
    speedNote.hidden = !locked
  }
  /** Đổi tốc độ xem (nút hoặc window.__fanroc); trả về tốc độ thật sự áp dụng. */
  const setSpeed = (s: number) => {
    requested = Math.max(0, s)
    showSpeed()
    return speedNow()
  }
  const expose = () => {
    ;(window as unknown as { __fanroc: unknown }).__fanroc = {
      world: game.world, robots: game.robots, match: game.match, humans: game.humans, setSpeed, editors, session: game, shell,
      pause: () => setPaused(true), resume: () => setPaused(false), stepBlock: () => stepBlock(),
      pose: (i: number) => {
        const p = game.robots[i].pose
        return { x: p.x, z: p.z, yaw: p.yaw }
      },
    }
  }

  /**
   * Trận mới (đổi chế độ, đổi robot, Về chỗ cũ): mọi chương trình dừng, robot về ô xuất phát. Chỉ một lần dựng trận
   * chạy một lúc (không giải phóng một thế giới Rapier hai lần); yêu cầu đến giữa chừng dồn thành một lần dựng lại
   * ngay sau đó, theo lựa chọn mới nhất.
   */
  let restarting = false
  let restartAgain = false
  const restart = async () => {
    if (restarting) return void (restartAgain = true)
    restarting = true
    try {
      do {
        restartAgain = false
        editors.stopAll()
        const old = game
        game = await newGame(++seed)
        old.dispose()
        board.hideResult()
        game.match.log(practice ? 'Luyện tập: không xả bóng, không hết giờ — chương trình chạy ngay khi bấm Chạy' : 'Trận mới: chương trình chạy khi hết 10 giây xả bóng')
        expose()
      } while (restartAgain)
    } finally {
      restarting = false
    }
  }
  editors.onConfig(() => void restart())

  // Tạm dừng / chạy tiếp / từng khối (spec §6.1b).
  const setPaused = (p: boolean) => {
    if (p) game.pause()
    else game.resume()
  }
  const stepBlock = () => game.stepBlock()
  expose()

  /** Đổi người lái của robot i. Chỉ bắt đầu trận mới khi robot phải đổi kiểu / đế (chạy chương trình của thẻ khác). */
  const pickers: HTMLSelectElement[] = []
  const setMode = (i: number, m: SeatMode) => {
    modes[i] = m
    if (pickers[i] && pickers[i].value !== m) pickers[i].value = m
    followers[i]?.dispose()
    followers[i] = m.startsWith('copy-') ? editors.follow(Number(m.slice(5)), (msg) => hud.log(`Robot ${i + 1}: ${msg}`)) : null
    if (JSON.stringify(cfgFor(i)) !== JSON.stringify(game.cfgs[i])) return void restart()
    game.setDriver(i, driverFor(i))
  }
  /** Chạy chương trình của thẻ i; robot đang do agent lái ⇒ chuyển sang "Chương trình" (thấy ngay trên ô chọn). */
  const runProgram = (i: number) => {
    editors.run(i)
    if (modes[i] !== 'program') {
      setMode(i, 'program')
      game.match.log(`Robot ${i + 1}: chuyển sang lái bằng chương trình khối`)
    }
  }
  const handlers = {
    run() {
      // Đang tạm dừng: Chạy chỉ là chạy tiếp, không nạp lại / không đổi người lái của thẻ đang mở.
      if (game.paused) return setPaused(false)
      runProgram(editors.active)
    },
    pause: () => setPaused(true),
    step: () => void stepBlock(),
    stop: () => editors.stop(editors.active),
    reset: () => void restart(),
    download: () => editors.download(editors.active),
    camera() {
      cam = CAMERAS[(CAMERAS.indexOf(cam) + 1) % CAMERAS.length]
      scene.camera(cam, hud.selected)
      camBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(CAMERAS[k] === cam)))
    },
  }

  // Khung ⚙ tạm: chế độ, người lái, robot của từng thẻ, chương trình mẫu, camera, tốc độ, đồ hoạ.
  const pop = document.createElement('div')
  pop.className = 'fr-bar sh-pop'
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', 'Cài đặt')
  pop.hidden = true
  const camBtns = group(
    CAMERAS.map((c, k) => ({ label: ['Toàn sân', 'Theo robot', 'Góc người lái'][k], on: () => scene.camera((cam = c), hud.selected) })),
    0,
  )
  const modeBtns = group(
    [
      { label: 'Trận', on: () => ((practice = false), void restart()) },
      { label: 'Luyện tập', on: () => ((practice = true), void restart()) },
    ],
    0,
  )
  const agentOpts: [string, string][] = (['easy', 'medium', 'hard'] as Skill[]).map((k) => [`agent-${k}`, `Agent ${SKILL_NAME[k]}`])
  const seatPickers = [0, 1, 2, 3].map((i) => {
    const opts: [string, string][] =
      i < 2 ? [['program', 'Chương trình'], ...agentOpts] : [...agentOpts, [`copy-${i - 2}`, `Chương trình của Robot ${i - 1}`]]
    const l = picker(`Robot ${i + 1}`, opts, modes[i], (v) => setMode(i, v as SeatMode))
    pickers[i] = l.querySelector('select')!
    return l
  })
  const cfgRows = [0, 1].map((i) => {
    const c = configControls(
      () => editors.cfg(i),
      (cfg) => editors.setConfig(i, cfg),
    )
    return { c, row: row(`Thẻ Robot ${i + 1}`, c.el, button('Mẫu TeleOp', () => editors.sample(i, 'teleop')), button('Mẫu Auto', () => editors.sample(i, 'auto'))) }
  })
  speedBtns = group(SPEEDS.map((sp) => ({ label: `×${sp}`, on: () => setSpeed(sp) })), 0)
  let q: Quality = defaultQuality()
  const qBtns = group(
    [
      { label: 'Đồ hoạ cao', on: () => scene.quality((q = 'high')) },
      { label: 'Đồ hoạ thấp', on: () => scene.quality((q = 'low')) },
    ],
    q === 'high' ? 0 : 1,
  )
  pop.append(
    Object.assign(document.createElement('h3'), { textContent: 'Cài đặt' }),
    row('Chế độ', ...modeBtns, button('Trận mới', () => void restart())),
    row('Người lái', ...seatPickers),
    ...cfgRows.map((r) => r.row),
    row('Camera', ...camBtns),
    row('Tốc độ', ...speedBtns, speedNote),
    row('Đồ hoạ', ...qBtns),
  )
  const setPop = (open: boolean) => {
    pop.hidden = !open
    if (open) for (const r of cfgRows) r.c.refresh()
  }
  shell.onSettings(() => setPop(pop.hidden))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) setPop(false)
  })
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node)) setPop(false)
  })

  const padsEl = document.createElement('div')
  padsEl.className = 'fr-pads'
  padsEl.setAttribute('aria-live', 'polite')
  stage.append(pop, padsEl)
  hud.onSelect = (i) => {
    if (cam !== 'field') scene.camera(cam, i)
  }

  // Tay cầm: chỉ hiện tay nào đang là bộ thu của robot nào (không cấu hình).
  const PAD_TEXT: Record<SeatStatus, string> = {
    none: 'chưa cắm',
    ok: 'đã cắm',
    nonstandard: 'không đúng bố cục chuẩn, robot đứng yên',
    lost: 'đã rút ra, robot đứng yên',
  }
  let padsText = ''
  const showPads = (status: SeatStatus[]) => {
    const text = status.map((st, i) => `Tay cầm ${i + 1} → Robot ${i + 1}: ${PAD_TEXT[st]}`).join('\n')
    if (text === padsText) return
    padsText = text
    padsEl.replaceChildren(...text.split('\n').map((t) => Object.assign(document.createElement('span'), { textContent: t })))
  }

  /** Thanh chạy + thanh trạng thái + tô khối, theo thẻ đang mở. */
  let fps = 60
  const showRun = (status: SeatStatus[]) => {
    const i = editors.active
    const state: LinkState = editors.state(i)
    const canStep = game.robots.some((_, k) => game.driver(k).kind === 'program')
    shell.runbar(handlers, state, { busy: game.stepping, paused: game.paused, canStep })
    for (const k of [0, 1]) {
      const s = editors.state(k)
      editors.highlight(k, s === 'running' || s === 'paused' ? editors.link(k).block : undefined)
    }
    const s = editors.state(i)
    const input: InputKind = modes[i].startsWith('agent-') ? 'Máy' : status[i] === 'ok' ? 'Tay PS2' : 'Chương trình'
    shell.status({
      robot: `Robot ${i + 1} · ${TEAMS[i]}`,
      input,
      ports: game.ports[i] ?? NEUTRAL,
      block: s === 'running' || s === 'paused' ? editors.describe(i, editors.link(i).block) : null,
      fps,
    })
  }

  // Bảng điểm: dòng điểm ≤ SCORE_HZ lần/giây + báo nổi; đếm ngược 3 s cuối xả bóng; còi; màn kết quả khi hết giờ.
  let boardMatch = game.match
  let prevT = game.match.t
  let resultShown = false
  const showBoard = (now: number) => {
    const m = game.match
    if (m !== boardMatch) {
      boardMatch = m
      prevT = m.t
      resultShown = false
    }
    board.visible(game.mode !== 'mission') // nhiệm vụ: bảng nhiệm vụ riêng (Task 14)
    const out = ticker.tick(now, m, game.robots, programs())
    if (out) {
      board.update(out.line, out.pops)
      if (out.pops.some((p) => p.startsWith('+'))) sound.ting()
    }
    if (!m.practice) {
      const cue = countdownCue(prevT, m.t)
      if (cue !== null) {
        board.countdown(cue)
        if (cue === 0) sound.whistle()
        else sound.beep()
      }
      if (m.phase === 'end' && !resultShown) {
        resultShown = true
        sound.whistle(true)
        board.result(resultView(m, game.robots, programs()), {
          again: () => void restart(),
          home: () => board.hideResult(), // Task 13: về màn chính
        })
      }
    }
    prevT = m.t
  }

  let last = performance.now()
  const frame = (now: number) => {
    const { pads, status } = seats.read()
    showPads(status)
    for (const i of [0, 1]) editors.input(i, pads[i])
    editors.release()
    showSpeed()
    const speed = speedNow()
    const dt = Math.min(100, now - last) / 1000
    if (now > last) fps += (1000 / (now - last) - fps) * 0.05
    last = now
    game.advance(dt, speed, { steps: MAX_STEPS * Math.max(1, speed), ms: STEP_BUDGET_MS })
    scene.sync(game.world, game.robots, game.match, game.ports)
    hud.update(game.match, game.robots, game.cfgs, game.ports)
    showBoard(now)
    showRun(status)
    showSerial()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

const loading = document.createElement('div')
loading.className = 'sh-loading'
loading.textContent = 'Sân đang tải…'
loading.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:#ccc;font-size:15px'
stage.append(loading)
start().catch((e) => {
  loading.textContent = `Không khởi tạo được sân: ${e instanceof Error ? e.message : String(e)}`
})
