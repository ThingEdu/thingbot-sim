/**
 * Trang FANROC Thanh Hỏa: sân 3D, vùng khối ThingBlock thật cho Robot 1 và Robot 2 (mỗi robot một bo ThingBot ảo),
 * tay cầm làm bộ thu PS2, Human Player bằng bàn phím, agent đồng đội cho robot không có người lái.
 *
 * Thứ tự robot (cũng là số trên bảng điểm): Robot 1 = đỏ ô trái (người lái 1, tay cầm 1), Robot 2 = xanh ô trái
 * (người lái 2, tay cầm 2), Robot 3 = đỏ ô phải (đồng đội Robot 1), Robot 4 = xanh ô phải (đồng đội Robot 2). Human
 * Player hp 0 / hp 1 của KEYMAP là của liên minh đỏ / xanh, tức của người lái 1 / 2.
 *
 * Ai lái robot nào (ruling R27): mỗi robot một ô chọn tường minh — "Chương trình" (Robot 1 / 2, thẻ khối của mình),
 * "Agent Dễ/Vừa/Khó", hoặc "Chương trình của Robot N" (Robot 3 / 4, bo ảo riêng, tay cầm trung tính). Mặc định
 * Robot 1 = Chương trình, Robot 2–4 = Agent Vừa. Ghế "Chương trình" không bao giờ do agent lái: chưa chạy, ■ Dừng hay
 * lỗi đều là đứng yên (Review Focus 2). Đổi người lái chỉ bắt đầu trận mới khi robot phải đổi kiểu / đế.
 * Trận: chương trình chạy khi hết 10 s xả bóng; Luyện tập: xả bóng tua sẵn lúc tạo trận (R31), chương trình chạy ngay. Tay cầm gắn ghế theo lần cắm đầu (R26).
 * Có chương trình khối đang chạy thì tốc độ xem khoá ở ×1 (R24).
 *
 * Vòng lặp bước cố định: cộng dồn thời gian thật × tốc độ xem, chạy vật lý theo PHYSICS_DT (tối đa 4 bước cho mỗi
 * khung ở tốc độ ×1, nhân theo tốc độ xem, và không quá ngân sách thời gian mỗi khung — phần dư bỏ đi để không
 * "xoáy chết"), rồi vẽ một lần mỗi khung. `window.__fanroc` mở cho kiểm thử trình duyệt (ruling R4).
 */
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { HumanPlayer, KEYMAP } from './human.ts'
import { Agent, type Skill } from './agent.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import type { Alliance } from './layout.ts'
import type { RobotConfig } from './robots.ts'
import { PadSeats, type SeatStatus } from './gamepad.ts'
import { effectiveSpeed, SPEED_NOTE } from './pace.ts'
import { createEditors } from './editor.ts'
import { defaultConfig } from './programs.ts'
import { createScene, defaultQuality, type CameraView, type Quality } from './view/scene.ts'
import { createHud } from './view/hud.ts'

const arena = document.querySelector<HTMLElement>('#arena')!
const hudEl = document.querySelector<HTMLElement>('#hud')!
const blocksEl = document.querySelector<HTMLElement>('#blocks')!

const TEAMS = ['Dế Xanh', 'Chuồn Chuồn', 'Kiến Lửa', 'Ong Vàng']
const SEATS: [Alliance, 0 | 1][] = [['red', 0], ['blue', 0], ['red', 1], ['blue', 1]]
const SKILL_NAME: Record<Skill, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }
/** Số bước vật lý tối đa mỗi khung ở tốc độ ×1 (nhân theo tốc độ xem). */
const MAX_STEPS = 4
/** Ngân sách thời gian chạy vật lý mỗi khung, ms. */
const STEP_BUDGET_MS = 45
const SPEEDS = [1, 4, 40]

const CSS = `
@media (min-width: 901px) { .layout:has(#arena) { height: 100vh; grid-template-columns: minmax(340px, 30%) minmax(0, 1fr) minmax(260px, 22%); } }
#arena { position: relative; min-height: 0; overflow: hidden; }
.fr-bar { position: absolute; left: 10px; top: 10px; right: 10px; display: flex; flex-wrap: wrap; gap: 6px; pointer-events: none; }
.fr-bar > * { pointer-events: auto; }
.fr-bar button, .fr-bar label { font: 600 13px var(--font); border: 1px solid var(--line); background: rgba(255,255,255,0.92); border-radius: 6px; padding: 5px 9px; cursor: pointer; }
.fr-bar label { display: inline-flex; gap: 4px; align-items: center; cursor: default; }
.fr-bar select { font: 13px var(--font); border: 0; background: transparent; }
.fr-bar button[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }
.fr-bar .gap { flex: 1; }
.fr-bar button:disabled { opacity: 0.4; cursor: default; }
.fr-bar .fr-note { font: 600 12px var(--font); background: rgba(255,255,255,0.92); border-radius: 6px; padding: 5px 9px; color: var(--muted); }
.fr-bar .fr-note[hidden] { display: none; }
.fr-pads { position: absolute; left: 10px; bottom: 10px; display: grid; gap: 2px; font: 600 12px var(--font); background: rgba(255,255,255,0.92); border: 1px solid var(--line); border-radius: 6px; padding: 5px 9px; }
@media (max-width: 900px) { #arena { height: max(420px, 62vh); } #blocks { height: 75vh; } }
body.fr-nocode #blocks { display: none; }
@media (min-width: 901px) { body.fr-nocode .layout:has(#arena) { grid-template-columns: minmax(0, 1fr) minmax(260px, 22%); } }
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

type SeatMode = 'program' | `agent-${Skill}` | 'copy-0' | 'copy-1'
type Game = {
  world: FanrocWorld; robots: RobotBody[]; match: Match; humans: HumanPlayer[]; agents: Agent[]; cfgs: RobotConfig[]; ports: PortValues[]
  /** Human Player bấm phím (hai người) hay tự động, chốt lúc bắt đầu trận. */
  manualHp: boolean
}

async function newGame(seed: number, cfgs: RobotConfig[], skills: Skill[], practice: boolean, manualHp: boolean): Promise<Game> {
  const world = await FanrocWorld.create(seed)
  const robots = SEATS.map(([a, slot], i) => new RobotBody(world, cfgs[i], a, slot))
  const match = new Match(world, robots, TEAMS, { seed, practice })
  const humans = (['red', 'blue'] as const).map((a) => new HumanPlayer(a))
  humans.forEach((h) => (h.onEvent = (s) => match.log(s)))
  const agents = robots.map((r, i) => new Agent(r, cfgs[i], skills[i], seed * 10 + i))
  return { world, robots, match, humans, agents, cfgs, ports: [], manualHp }
}

/** Bàn phím của Human Player: chỉ nhận lần bấm (bỏ lặp phím khi giữ), không nhận khi đang gõ vào ô nhập. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

async function start(): Promise<void> {
  arena.textContent = 'Sân đang tải…'
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const editors = createEditors(blocksEl, [0, 1].map((i) => ({ label: `Robot ${i + 1} · ${TEAMS[i]}`, cfg: defaultConfig('maker') })))
  const seats = new PadSeats()
  let seed = 1
  let practice = false
  /** Ai lái từng robot (ruling R27): chọn tường minh, không phụ thuộc lịch sử bấm nút. */
  const modes: SeatMode[] = ['program', 'agent-medium', 'agent-medium', 'agent-medium']
  const followers: ({ ports(): PortValues; dispose(): void } | null)[] = [null, null, null, null]
  const cfgFor = (i: number): RobotConfig => {
    const m = modes[i]
    if (m.startsWith('copy-')) return editors.cfg(Number(m.slice(5)))
    return i < 2 ? editors.cfg(i) : defaultConfig('maker')
  }
  const skillOf = (i: number): Skill => (modes[i].startsWith('agent-') ? (modes[i].slice(6) as Skill) : 'medium')
  /** Hai tay cầm lúc bắt đầu trận ⇒ hai người, Human Player bấm phím; không thì tự động. Chốt một lần mỗi trận. */
  const twoPeople = () => seats.read().status.filter((x) => x === 'ok' || x === 'nonstandard').length >= 2
  const hpNote = (manual: boolean) =>
    manual ? 'Human Player: hai người — bấm phím (đỏ Q A S D, xanh U J K L)' : 'Human Player tự động (một người; cắm đủ 2 tay cầm rồi bấm Trận mới để bấm phím)'

  let game = await newGame(seed, [0, 1, 2, 3].map(cfgFor), [0, 1, 2, 3].map(skillOf), practice, twoPeople())
  game.match.log(hpNote(game.manualHp))
  arena.textContent = ''
  const scene = createScene(arena)
  const hud = createHud(hudEl)
  editors.setGate(
    () => practice || game.match.phase === 'play',
    () => (game.match.phase === 'end' ? 'Trận đã kết thúc — bấm Trận mới' : 'Đã nạp, chờ hết 10 giây xả bóng…'),
  )
  editors.onError((i, msg) => hud.log(`Robot ${i + 1}: ${msg}`))

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
      world: game.world, robots: game.robots, match: game.match, humans: game.humans, setSpeed, editors,
      pose: (i: number) => {
        const p = game.robots[i].pose
        return { x: p.x, z: p.z, yaw: p.yaw }
      },
    }
  }

  /**
   * Trận mới (đổi chế độ, đổi robot, bấm "Trận mới"): mọi chương trình dừng, robot về ô xuất phát. Chỉ một lần dựng
   * trận chạy một lúc (không giải phóng một thế giới Rapier hai lần); yêu cầu đến giữa chừng dồn thành một lần dựng
   * lại ngay sau đó, theo lựa chọn mới nhất.
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
        game = await newGame(++seed, [0, 1, 2, 3].map(cfgFor), [0, 1, 2, 3].map(skillOf), practice, twoPeople())
        old.world.rapier.free()
        game.match.log(practice ? 'Luyện tập: không xả bóng, không hết giờ — chương trình chạy ngay khi bấm ▶ Chạy' : 'Trận mới: chương trình chạy khi hết 10 giây xả bóng')
        game.match.log(hpNote(game.manualHp))
        expose()
      } while (restartAgain)
    } finally {
      restarting = false
    }
  }
  editors.onConfig(() => void restart())
  expose()

  /** Đổi người lái của robot i. Chỉ bắt đầu trận mới khi robot phải đổi kiểu / đế (chạy chương trình của thẻ khác). */
  const pickers: HTMLSelectElement[] = []
  const setMode = (i: number, m: SeatMode) => {
    modes[i] = m
    if (pickers[i] && pickers[i].value !== m) pickers[i].value = m
    followers[i]?.dispose()
    followers[i] = m.startsWith('copy-') ? editors.follow(Number(m.slice(5)), (msg) => hud.log(`Robot ${i + 1}: ${msg}`)) : null
    if (JSON.stringify(cfgFor(i)) !== JSON.stringify(game.cfgs[i])) return void restart()
    if (m.startsWith('agent-')) {
      const g = game
      g.agents[i] = new Agent(g.robots[i], g.cfgs[i], skillOf(i), seed * 10 + i)
    }
  }
  // Bấm ▶ Chạy ở thẻ của robot đang do agent lái ⇒ chuyển robot đó sang "Chương trình" (thấy ngay trên ô chọn).
  editors.onRun((i) => {
    if (modes[i] !== 'program') {
      setMode(i, 'program')
      game.match.log(`Robot ${i + 1}: chuyển sang lái bằng chương trình khối`)
    }
  })

  // Thanh công cụ trên sân.
  const bar = document.createElement('div')
  bar.className = 'fr-bar'
  const camBtns = group(
    [
      { label: 'Toàn sân', on: () => scene.camera((cam = 'field')) },
      { label: 'Theo robot', on: () => scene.camera((cam = 'follow'), hud.selected) },
      { label: 'Góc người lái', on: () => scene.camera((cam = 'driver'), hud.selected) },
    ],
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
  speedBtns = group(SPEEDS.map((sp) => ({ label: `×${sp}`, on: () => setSpeed(sp) })), 0)
  let q: Quality = defaultQuality()
  const qBtns = group(
    [
      { label: 'Đồ hoạ cao', on: () => scene.quality((q = 'high')) },
      { label: 'Đồ hoạ thấp', on: () => scene.quality((q = 'low')) },
    ],
    q === 'high' ? 0 : 1,
  )
  const again = button('Trận mới', () => void restart())
  // Nút ☰: ẩn/hiện vùng khối (mẫu ftc.html). Điện thoại mặc định ẩn để sân đủ lớn.
  const codeBtn = button('☰', () => setCodeHidden(!document.body.classList.contains('fr-nocode')))
  codeBtn.setAttribute('aria-label', 'Vùng khối lệnh')
  codeBtn.setAttribute('aria-controls', 'blocks')
  // aria-expanded = vùng khối đang hiện; nút tô đậm (aria-pressed) cũng khi vùng khối đang hiện.
  const setCodeHidden = (hidden: boolean) => {
    document.body.classList.toggle('fr-nocode', hidden)
    codeBtn.setAttribute('aria-expanded', String(!hidden))
    codeBtn.setAttribute('aria-pressed', String(!hidden))
    codeBtn.title = hidden ? 'Hiện vùng khối lệnh' : 'Ẩn vùng khối lệnh'
    if (!hidden) editors.resize()
  }
  setCodeHidden(matchMedia('(max-width: 760px)').matches)
  const gap = document.createElement('span')
  gap.className = 'gap'
  bar.append(codeBtn, ...modeBtns, ...seatPickers, again, gap, ...camBtns, ...speedBtns, speedNote, ...qBtns)
  const padsEl = document.createElement('div')
  padsEl.className = 'fr-pads'
  padsEl.setAttribute('aria-live', 'polite')
  arena.append(bar, padsEl)
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
  addEventListener('keydown', (e: KeyboardEvent) => {
    const k = KEYMAP[e.code]
    const g = game
    if (!k || e.repeat || typing(e.target) || !g.manualHp) return
    const why = g.humans[k.hp].press(k.action, { world: g.world, robots: g.robots, phase: g.match.phase, endgame: g.match.endgame })
    if (why) hud.log(`Human Player ${k.hp === 0 ? 'đỏ' : 'xanh'}: ${why}`)
  })

  const step = (g: Game) => {
    const view = { world: g.world, robots: g.robots, match: g.match, humans: g.humans }
    g.ports = g.robots.map((_, i) => {
      const m = modes[i]
      // Ghế "Chương trình" không bao giờ do agent lái: chưa chạy / đã dừng / lỗi ⇒ NEUTRAL (editors.ports).
      if (m === 'program') return editors.ports(i)
      if (m.startsWith('copy-')) return followers[i]?.ports() ?? NEUTRAL
      return g.agents[i].update(view, PHYSICS_DT)
    })
    if (!g.manualHp) for (const h of g.humans) h.auto({ world: g.world, robots: g.robots, phase: g.match.phase, endgame: g.match.endgame }, PHYSICS_DT)
    g.match.step(PHYSICS_DT, g.ports)
  }

  let last = performance.now()
  let acc = 0
  const frame = (now: number) => {
    const { pads, status } = seats.read()
    showPads(status)
    for (const i of [0, 1]) editors.input(i, pads[i])
    editors.release()
    showSpeed()
    const speed = speedNow()
    acc += (Math.min(100, now - last) / 1000) * speed
    last = now
    const t0 = performance.now()
    const max = MAX_STEPS * Math.max(1, speed)
    let n = 0
    while (acc >= PHYSICS_DT && n < max && game.match.phase !== 'end' && performance.now() - t0 < STEP_BUDGET_MS) {
      step(game)
      acc -= PHYSICS_DT
      n++
    }
    if (n === max || performance.now() - t0 >= STEP_BUDGET_MS || game.match.phase === 'end') acc = 0
    scene.sync(game.world, game.robots, game.match, game.ports)
    hud.update(game.match, game.robots, game.cfgs, game.ports)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

start().catch((e) => {
  arena.textContent = `Không khởi tạo được sân: ${e instanceof Error ? e.message : String(e)}`
})
