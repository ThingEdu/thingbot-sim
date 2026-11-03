/**
 * Trang FANROC Thanh Hỏa (bản tạm để xem sân 3D): 4 Mẫu Maker 2 bánh do agent lái (Khó, Vừa, Vừa, Dễ),
 * Human Player tự động hai bên, chạy một trận đầy đủ. Vùng #blocks sẽ được bước ghép chương trình khối lấp đầy.
 *
 * Vòng lặp bước cố định: cộng dồn thời gian thật × tốc độ xem, chạy vật lý theo PHYSICS_DT (tối đa 4 bước cho mỗi
 * khung ở tốc độ ×1, nhân theo tốc độ xem, và không quá ngân sách thời gian mỗi khung — phần dư bỏ đi để không
 * "xoáy chết"), rồi vẽ một lần mỗi khung. `window.__fanroc` mở cho kiểm thử trình duyệt (ruling R4).
 */
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { HumanPlayer } from './human.ts'
import { Agent, type Skill } from './agent.ts'
import type { PortValues } from './ports.ts'
import type { RobotConfig } from './robots.ts'
import { createScene, defaultQuality, type CameraView, type Quality } from './view/scene.ts'
import { createHud } from './view/hud.ts'

const arena = document.querySelector<HTMLElement>('#arena')!
const hudEl = document.querySelector<HTMLElement>('#hud')!

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const SKILLS: Skill[] = ['hard', 'medium', 'medium', 'easy']
const SKILL_NAME: Record<Skill, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }
const TEAMS = ['Dế Xanh', 'Chuồn Chuồn', 'Kiến Lửa', 'Ong Vàng']
/** Số bước vật lý tối đa mỗi khung ở tốc độ ×1 (nhân theo tốc độ xem). */
const MAX_STEPS = 4
/** Ngân sách thời gian chạy vật lý mỗi khung, ms. */
const STEP_BUDGET_MS = 45
const SPEEDS = [1, 4, 40]

const CSS = `
@media (min-width: 901px) { .layout:has(#arena) { height: 100vh; grid-template-columns: minmax(0, 22%) minmax(0, 1fr) minmax(280px, 26%); } }
#arena { position: relative; min-height: 0; overflow: hidden; }
.fr-bar { position: absolute; left: 10px; top: 10px; right: 10px; display: flex; flex-wrap: wrap; gap: 6px; pointer-events: none; }
.fr-bar > * { pointer-events: auto; }
.fr-bar button { font: 600 13px var(--font); border: 1px solid var(--line); background: rgba(255,255,255,0.92); border-radius: 6px; padding: 5px 9px; cursor: pointer; }
.fr-bar button[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }
.fr-bar .gap { flex: 1; }
@media (max-width: 900px) { #arena { height: max(420px, 62vh); } }
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

type Game = { world: FanrocWorld; robots: RobotBody[]; match: Match; humans: HumanPlayer[]; agents: Agent[]; ports: PortValues[] }

async function newGame(seed: number): Promise<Game> {
  const world = await FanrocWorld.create(seed)
  const robots = [0, 1, 2, 3].map((i) => new RobotBody(world, MAKER, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
  const match = new Match(world, robots, TEAMS, { seed })
  const humans = (['red', 'blue'] as const).map((a) => new HumanPlayer(a))
  humans.forEach((h) => (h.onEvent = (s) => match.log(s)))
  const agents = robots.map((r, i) => new Agent(r, MAKER, SKILLS[i], seed * 10 + i))
  return { world, robots, match, humans, agents, ports: [] }
}

function step(g: Game): void {
  const view = { world: g.world, robots: g.robots, match: g.match, humans: g.humans }
  g.ports = g.agents.map((a) => a.update(view, PHYSICS_DT))
  for (const h of g.humans) h.auto({ world: g.world, robots: g.robots, phase: g.match.phase, endgame: g.match.endgame }, PHYSICS_DT)
  g.match.step(PHYSICS_DT, g.ports)
}

async function start(): Promise<void> {
  arena.textContent = 'Sân đang tải…'
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  let seed = 1
  let game = await newGame(seed)
  arena.textContent = ''
  const scene = createScene(arena)
  const hud = createHud(hudEl)
  const cfgs = game.robots.map(() => MAKER)
  hud.log(`Trận thử: 4 Mẫu Maker do agent lái (${SKILLS.map((s, i) => `Robot ${i + 1} ${SKILL_NAME[s]}`).join(', ')}), Human Player tự động`)

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
      world: game.world, robots: game.robots, match: game.match, humans: game.humans, setSpeed,
    }
  }
  expose()

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
  speedBtns = group(SPEEDS.map((s) => ({ label: `×${s}`, on: () => setSpeed(s) })), 0)
  let q: Quality = defaultQuality()
  const qBtns = group(
    [
      { label: 'Đồ hoạ cao', on: () => scene.quality((q = 'high')) },
      { label: 'Đồ hoạ thấp', on: () => scene.quality((q = 'low')) },
    ],
    q === 'high' ? 0 : 1,
  )
  const again = button('Trận mới', async () => {
    const old = game
    game = await newGame(++seed)
    old.world.rapier.free()
    expose()
  })
  const gap = document.createElement('span')
  gap.className = 'gap'
  bar.append(...camBtns, gap, ...speedBtns, ...qBtns, again)
  arena.append(bar)
  hud.onSelect = (i) => {
    if (cam !== 'field') scene.camera(cam, i)
  }

  let last = performance.now()
  let acc = 0
  const frame = (now: number) => {
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
    hud.update(game.match, game.robots, cfgs)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

start().catch((e) => {
  arena.textContent = `Không khởi tạo được sân: ${e instanceof Error ? e.message : String(e)}`
})
