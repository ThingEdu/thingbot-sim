import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { GameSession, STEP_MAX_S, type SeatSpec } from './game.ts'
import { RobotLink } from './link.ts'
import type { Command, Message } from '../sim-worker.ts'
import type { RobotConfig } from './robots.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const TEAMS = ['Dế Xanh', 'Chuồn Chuồn', 'Kiến Lửa', 'Ong Vàng']
const agents = (): SeatSpec[] => TEAMS.map((team) => ({ cfg: MAKER, team, driver: { kind: 'agent', skill: 'medium' } }))
/** M1 = M2 = tiến 60 (kênh B của M1 = 3, của M2 = 5; xem ports.ts). */
const FORWARD = Array.from({ length: 16 }, (_, ch) => (ch === 3 || ch === 5 ? Math.round(0.6 * 4095) : 0))

/**
 * Bo ảo giả: trả snapshot như worker thật (load / pause / step trả `running: false`), pwm cố định; mỗi lệnh step đẩy
 * thời gian ảo thêm `stepUs` µs. Trả lời ở microtask sau (như thư của Worker), không đồng bộ. Lúc nhận pause, bo còn
 * gửi một nhịp chạy (`running: true`, +30 ms) rồi trả lời pause (+20 ms nữa): thời gian chạy tiếp tới lúc dừng không
 * thuộc khối kế. `hold` ⇒ trả lời step giữ lại tới khi gọi `release()`.
 */
function fakeLink(stepUs: number, hold = false) {
  const sent: Command[] = []
  let run = 0
  let t = 0
  let held: (() => void) | null = null
  const link: RobotLink = new RobotLink((c) => {
    sent.push(c)
    const snap = (running: boolean) =>
      link.receive({ type: 'snapshot', run, snapshot: { pwm: FORWARD, t, running, block: 'b' }, bus: {} } as unknown as Message)
    const reply = (running: boolean, dt = 0) => queueMicrotask(() => ((t += dt), snap(running)))
    if (c.type === 'load') ((run = c.run), (t = 0), reply(false))
    else if (c.type === 'pause') (reply(true, 30_000), reply(false, 20_000))
    else if (c.type === 'step') {
      if (hold) held = () => ((t += stepUs), snap(false))
      else reply(false, stepUs)
    }
  })
  return { link, sent, release: () => held?.() }
}
const ticks = () => new Promise((r) => setTimeout(r, 0))

const poses = (g: GameSession) => g.robots.map((r) => ({ ...r.pose }))

test('world: balls:false ⇒ không có bóng, release không ném', async () => {
  const w = await FanrocWorld.create(1, { balls: false })
  try {
    assert.equal(w.balls.length, 0)
    assert.doesNotThrow(() => w.release(20))
    assert.doesNotThrow(() => w.step(PHYSICS_DT))
    assert.deepEqual(w.tally(new Set()).fire, { o: 0, g: 0 })
  } finally {
    w.rapier.free()
  }
  const full = await FanrocWorld.create(1)
  assert.equal(full.balls.length, 300, 'mặc định vẫn đủ 300 bóng')
  full.rapier.free()
})

test('match, 4 agent: pause() ⇒ advance không chạy đồng hồ / robot; resume() ⇒ match.t tăng 1 s', async () => {
  const g = await GameSession.create({ mode: 'match', seats: agents(), seed: 1 })
  try {
    assert.equal(g.robots.length, 4)
    assert.deepEqual(g.robots.map((r) => [r.alliance, r.slot]), [['red', 0], ['blue', 0], ['red', 1], ['blue', 1]])
    // Qua 10 s xả bóng để agent thật sự lái.
    g.advance(10.5, 1)
    assert.equal(g.match.phase, 'play')
    g.advance(1, 1)
    g.pause()
    assert.equal(g.paused, true)
    const t0 = g.match.t
    const p0 = poses(g)
    assert.equal(g.advance(1, 1), 0)
    assert.equal(g.match.t, t0)
    assert.deepEqual(poses(g), p0)
    g.resume()
    assert.equal(g.paused, false)
    const n = g.advance(1, 1)
    assert.ok(Math.abs(g.match.t - t0 - 1) <= PHYSICS_DT + 1e-9, `match.t ${t0} → ${g.match.t}`)
    assert.ok(Math.abs(n - 60) <= 1, `${n} bước`)
  } finally {
    g.dispose()
  }
})

test('advance: giới hạn số bước mỗi lần gọi, phần dư bỏ đi', async () => {
  const g = await GameSession.create({ mode: 'practice', seats: agents(), seed: 2 })
  try {
    assert.equal(g.match.phase, 'play', 'luyện tập: xả bóng đã tua')
    const t0 = g.match.t
    assert.equal(g.advance(1, 4, { steps: 16 }), 16)
    assert.equal(g.advance(PHYSICS_DT / 2, 1), 0, 'phần dư đã bỏ, nửa bước chưa đủ chạy')
    assert.ok(Math.abs(g.match.t - t0 - 16 * PHYSICS_DT) < 1e-9)
  } finally {
    g.dispose()
  }
})

test('match: chương trình đã nạp chỉ chạy khi hết 10 s xả bóng', async () => {
  const { link } = fakeLink(0)
  const seats = agents()
  seats[0] = { cfg: MAKER, team: TEAMS[0], driver: { kind: 'program', link } }
  const g = await GameSession.create({ mode: 'match', seats, seed: 1 })
  try {
    link.load('code')
    g.advance(5, 1)
    assert.equal(g.canRun, false)
    assert.equal(link.state, 'loaded')
    g.advance(5.2, 1)
    assert.equal(g.match.phase, 'play')
    assert.equal(link.state, 'running')
    assert.equal(g.programActive, true)
  } finally {
    g.dispose()
  }
  assert.equal(link.state, 'stopped', 'dispose dừng link')
})

test('mission, balls:false: không bóng, chỉ robot ghế 0 (đỏ) ở `start`', async () => {
  const start = { x: 0.2, z: 0.55, yaw: 0.4 }
  const g = await GameSession.create({ mode: 'mission', seats: agents(), seed: 1, balls: false, start })
  try {
    assert.equal(g.world.balls.length, 0)
    assert.equal(g.robots.length, 1)
    assert.equal(g.robots[0].alliance, 'red')
    const p = g.robots[0].pose
    assert.ok(Math.hypot(p.x - start.x, p.z - start.z) < 0.002 && Math.abs(p.yaw - start.yaw) < 0.01, JSON.stringify(p))
    assert.equal(g.match.phase, 'play')
    assert.equal(g.humans.length, 0, 'nhiệm vụ không có Human Player')
  } finally {
    g.dispose()
  }
})

test('mission, balls:true (R60): xả bóng tua ngay lúc tạo ⇒ có bóng xanh trong Khu Chữa Cháy (nhiệm vụ 9)', async () => {
  const g = await GameSession.create({ mode: 'mission', seats: agents().slice(0, 1), seed: 1, balls: true })
  try {
    assert.equal(g.match.phase, 'play')
    const fire = g.match.tally().fire
    assert.ok(fire.g >= 10, `bóng xanh trong Khu Chữa Cháy: ${fire.g}`)
  } finally {
    g.dispose()
  }
})

test('stepBlock: link giả báo Δ virtualT = 1 000 000 µs ⇒ vật lý chạy 60 bước ± 1, rồi tạm dừng', async () => {
  const { link, sent } = fakeLink(1_000_000)
  const g = await GameSession.create({
    mode: 'mission', seats: [{ cfg: MAKER, team: 'Em', driver: { kind: 'program', link } }], seed: 1, balls: false,
    start: { x: 0, z: 0.9, yaw: 0 },
  })
  try {
    let steps = 0
    g.onStep = () => steps++
    link.load('code')
    g.advance(PHYSICS_DT, 1) // nhiệm vụ: chương trình chạy ngay
    assert.equal(link.state, 'running')
    steps = 0
    const z0 = g.robots[0].pose.z
    await g.stepBlock()
    assert.ok(Math.abs(steps - 60) <= 1, `${steps} bước`)
    assert.ok(z0 - g.robots[0].pose.z > 0.1, `robot tiến ${(z0 - g.robots[0].pose.z).toFixed(3)} m với M1 = M2 = 60`)
    assert.equal(g.paused, true)
    assert.equal(link.state, 'paused')
    assert.ok(sent.some((c) => c.type === 'pause') && sent.at(-1)?.type === 'step')
    // Đang tạm dừng: advance không chạy.
    assert.equal(g.advance(1, 1), 0)
    // Chạy tiếp: link chạy lại.
    g.resume()
    assert.equal(link.state, 'running')
  } finally {
    g.dispose()
  }
})

test(`stepBlock: Δ virtualT lớn bị chặn ở ${STEP_MAX_S} s; không có chương trình thì không chạy vật lý`, async () => {
  const { link } = fakeLink(60_000_000)
  const g = await GameSession.create({
    mode: 'mission', seats: [{ cfg: MAKER, team: 'Em', driver: { kind: 'program', link } }], seed: 1, balls: false,
  })
  try {
    let steps = 0
    g.onStep = () => steps++
    await g.stepBlock()
    assert.equal(steps, 0, 'chưa nạp chương trình')
    link.load('code')
    await g.stepBlock()
    assert.ok(Math.abs(steps - STEP_MAX_S / PHYSICS_DT) <= 1, `${steps} bước`)
  } finally {
    g.dispose()
  }
})

test('stepBlock: bấm Chạy tiếp khi bo chưa trả lời ⇒ không chạy dồn Δ của khối lên sân (chỉ advance chạy)', async () => {
  const { link, release } = fakeLink(3_000_000, true)
  const g = await GameSession.create({
    mode: 'mission', seats: [{ cfg: MAKER, team: 'Em', driver: { kind: 'program', link } }], seed: 1, balls: false,
  })
  try {
    let steps = 0
    g.onStep = () => steps++
    link.load('code')
    g.advance(PHYSICS_DT, 1)
    assert.equal(link.state, 'running')
    steps = 0
    const p = g.stepBlock()
    assert.equal(g.stepping, true)
    await ticks() // trả lời pause tới, step đã gửi, trả lời step còn giữ
    g.resume()
    assert.equal(g.paused, false)
    const n = g.advance(PHYSICS_DT, 1)
    release()
    await p
    assert.equal(g.stepping, false)
    assert.equal(steps, n, `sân chạy ${steps} bước, advance chỉ ${n} bước (không được thêm 180 bước của khối 3 s)`)
  } finally {
    g.dispose()
  }
})

test('dispose: chỉ dừng link phiên còn giữ — link đã giao cho phiên mới thì chạy tiếp', async () => {
  const { link } = fakeLink(0)
  const seat = (): SeatSpec[] => [{ cfg: MAKER, team: 'Em', driver: { kind: 'program', link } }]
  const old = await GameSession.create({ mode: 'mission', seats: seat(), seed: 1, balls: false })
  const next = await GameSession.create({ mode: 'mission', seats: seat(), seed: 2, balls: false })
  try {
    link.load('code')
    next.advance(PHYSICS_DT, 1)
    assert.equal(link.state, 'running')
    old.dispose()
    assert.equal(link.state, 'running', 'phiên cũ không được dừng link của phiên mới')
  } finally {
    next.dispose()
  }
  assert.equal(link.state, 'stopped')
})
