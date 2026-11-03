/**
 * Trang FANROC Thanh Hỏa: sân 3D, vùng khối ThingBlock thật cho Robot 1 và Robot 2 (mỗi robot một bo ThingBot ảo),
 * tay cầm làm bộ thu PS2, Human Player bằng bàn phím, agent đồng đội cho robot không có người lái.
 *
 * Thứ tự robot (cũng là số trên bảng điểm): Robot 1 = đỏ ô trái (người lái 1, tay cầm 1), Robot 2 = xanh ô trái
 * (người lái 2, tay cầm 2), Robot 3 = đỏ ô phải (đồng đội Robot 1), Robot 4 = xanh ô phải (đồng đội Robot 2). Human
 * Player hp 0 / hp 1 của KEYMAP là của liên minh đỏ / xanh, tức của người lái 1 / 2.
 *
 * Ai lái robot nào: Robot 1 / 2 do chương trình của thẻ mình, nhưng thẻ chưa bấm ▶ lần nào thì agent lái thay; đã bấm
 * thì ■ Dừng hay chương trình lỗi là robot đứng yên (Review Focus 2). Robot 3 / 4 do agent, hoặc chạy chương trình của
 * thẻ đồng đội trên bo ảo riêng (tay cầm trung tính). Trận: chương trình chạy khi hết 10 s xả bóng; Luyện tập: chạy ngay.
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
import type { PortValues } from './ports.ts'
import type { Alliance } from './layout.ts'
import type { RobotConfig } from './robots.ts'
import { readPads, type Ps2State } from './gamepad.ts'
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
.fr-pads { position: absolute; left: 10px; bottom: 10px; display: grid; gap: 2px; font: 600 12px var(--font); background: rgba(255,255,255,0.92); border: 1px solid var(--line); border-radius: 6px; padding: 5px 9px; }
@media (max-width: 900px) { #arena { height: max(420px, 62vh); } #blocks { height: 75vh; } }
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

type Game = { world: FanrocWorld; robots: RobotBody[]; match: Match; humans: HumanPlayer[]; agents: Agent[]; cfgs: RobotConfig[]; ports: PortValues[] }

async function newGame(seed: number, cfgs: RobotConfig[], skill: Skill, practice: boolean): Promise<Game> {
  const world = await FanrocWorld.create(seed)
  const robots = SEATS.map(([a, slot], i) => new RobotBody(world, cfgs[i], a, slot))
  const match = new Match(world, robots, TEAMS, { seed, practice })
  const humans = (['red', 'blue'] as const).map((a) => new HumanPlayer(a))
  humans.forEach((h) => (h.onEvent = (s) => match.log(s)))
  const agents = robots.map((r, i) => new Agent(r, cfgs[i], skill, seed * 10 + i))
  return { world, robots, match, humans, agents, cfgs, ports: [] }
}

/** Bàn phím của Human Player: chỉ nhận lần bấm (bỏ lặp phím khi giữ), không nhận khi đang gõ vào ô nhập. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

async function start(): Promise<void> {
  arena.textContent = 'Sân đang tải…'
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const editors = createEditors(blocksEl, [0, 1].map((i) => ({ label: `Robot ${i + 1} · ${TEAMS[i]}`, cfg: defaultConfig('maker') })))
  let seed = 1
  let skill: Skill = 'medium'
  let practice = false
  /** Robot 3 / 4: null = agent, số = chạy chương trình của thẻ đó. */
  const copyOf: (number | null)[] = [null, null, null, null]
  const followers: ({ ports(): PortValues; dispose(): void } | null)[] = [null, null, null, null]
  const cfgsNow = () => [editors.cfg(0), editors.cfg(1), copyOf[2] !== null ? editors.cfg(0) : defaultConfig('maker'), copyOf[3] !== null ? editors.cfg(1) : defaultConfig('maker')]

  let game = await newGame(seed, cfgsNow(), skill, practice)
  arena.textContent = ''
  const scene = createScene(arena)
  const hud = createHud(hudEl)
  editors.setGate(() => practice || game.match.phase === 'play')
  editors.onError((i, msg) => hud.log(`Robot ${i + 1}: ${msg}`))

  let speed = 1
  let cam: CameraView = 'field'
  let speedBtns: HTMLButtonElement[] = []
  /** Đổi tốc độ xem (cả từ nút lẫn từ window.__fanroc); nút đang chọn luôn khớp tốc độ hiện tại. */
  const setSpeed = (s: number) => {
    speed = Math.max(0, s)
    speedBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(SPEEDS[k] === speed)))
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

  /** Trận mới (đổi chế độ, đổi robot, bấm "Trận mới"): mọi chương trình dừng, robot về ô xuất phát. */
  const restart = async () => {
    editors.stopAll()
    const old = game
    game = await newGame(++seed, cfgsNow(), skill, practice)
    old.world.rapier.free()
    game.match.log(practice ? 'Luyện tập: chương trình chạy ngay khi bấm ▶ Chạy, không hết giờ' : 'Trận mới: chương trình chạy khi hết 10 giây xả bóng')
    expose()
  }
  editors.onConfig(() => void restart())
  expose()

  /** Robot 3 / 4 chạy chương trình của thẻ đồng đội, hoặc trả về cho agent. */
  const setDriver = (i: 2 | 3, v: string) => {
    followers[i]?.dispose()
    followers[i] = null
    copyOf[i] = v === 'agent' ? null : Number(v)
    if (copyOf[i] !== null) followers[i] = editors.follow(copyOf[i]!, (msg) => hud.log(`Robot ${i + 1}: ${msg}`))
    void restart()
  }

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
  const skillPick = picker('Agent', (['easy', 'medium', 'hard'] as Skill[]).map((s) => [s, SKILL_NAME[s]]), skill, (v) => {
    skill = v as Skill
    void restart()
  })
  const r3 = picker('Robot 3', [['agent', 'agent'], ['0', 'chương trình Robot 1']], 'agent', (v) => setDriver(2, v))
  const r4 = picker('Robot 4', [['agent', 'agent'], ['1', 'chương trình Robot 2']], 'agent', (v) => setDriver(3, v))
  speedBtns = group(SPEEDS.map((s) => ({ label: `×${s}`, on: () => setSpeed(s) })), 0)
  let q: Quality = defaultQuality()
  const qBtns = group(
    [
      { label: 'Đồ hoạ cao', on: () => scene.quality((q = 'high')) },
      { label: 'Đồ hoạ thấp', on: () => scene.quality((q = 'low')) },
    ],
    q === 'high' ? 0 : 1,
  )
  const again = button('Trận mới', () => void restart())
  const gap = document.createElement('span')
  gap.className = 'gap'
  bar.append(...modeBtns, skillPick, r3, r4, again, gap, ...camBtns, ...speedBtns, ...qBtns)
  const padsEl = document.createElement('div')
  padsEl.className = 'fr-pads'
  padsEl.setAttribute('aria-live', 'polite')
  arena.append(bar, padsEl)
  hud.onSelect = (i) => {
    if (cam !== 'field') scene.camera(cam, i)
  }

  // Tay cầm: chỉ hiện tay nào đang là bộ thu của robot nào (không cấu hình).
  let pads: (Ps2State | null)[] = []
  let padsText = ''
  const showPads = (all: (Ps2State | null)[]) => {
    const text = [0, 1]
      .map((i) => `Tay cầm ${i + 1} → Robot ${i + 1}: ${i >= all.length ? 'chưa cắm' : all[i] ? 'đã cắm' : 'không đúng bố cục chuẩn, robot đứng yên'}`)
      .join('\n')
    if (text === padsText) return
    padsText = text
    padsEl.replaceChildren(...text.split('\n').map((t) => Object.assign(document.createElement('span'), { textContent: t })))
  }
  /** Hai người (có tay cầm 2) thì Human Player bấm phím; một người thì Human Player tự động. */
  const manualHp = () => pads.length >= 2
  addEventListener('keydown', (e: KeyboardEvent) => {
    const k = KEYMAP[e.code]
    if (!k || e.repeat || typing(e.target) || !manualHp()) return
    const g = game
    const why = g.humans[k.hp].press(k.action, { world: g.world, robots: g.robots, phase: g.match.phase, endgame: g.match.endgame })
    if (why) hud.log(`Human Player ${k.hp === 0 ? 'đỏ' : 'xanh'}: ${why}`)
  })

  const step = (g: Game) => {
    const view = { world: g.world, robots: g.robots, match: g.match, humans: g.humans }
    g.ports = g.robots.map((_, i) => {
      if (i < 2 && editors.state(i) !== 'idle') return editors.ports(i)
      const f = followers[i]
      if (f) return f.ports()
      return g.agents[i].update(view, PHYSICS_DT)
    })
    if (!manualHp()) for (const h of g.humans) h.auto({ world: g.world, robots: g.robots, phase: g.match.phase, endgame: g.match.endgame }, PHYSICS_DT)
    g.match.step(PHYSICS_DT, g.ports)
  }

  let last = performance.now()
  let acc = 0
  const frame = (now: number) => {
    const all = readPads()
    pads = all
    showPads(all)
    for (const i of [0, 1]) editors.input(i, all[i] ?? null)
    editors.release()
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
    hud.update(game.match, game.robots, game.cfgs)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

start().catch((e) => {
  arena.textContent = `Không khởi tạo được sân: ${e instanceof Error ? e.message : String(e)}`
})
