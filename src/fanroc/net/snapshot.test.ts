import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GameSession, type SeatSpec } from '../game.ts'
import { PHYSICS_DT } from '../world.ts'
import { NEUTRAL, type PortValues } from '../ports.ts'
import type { RobotConfig } from '../robots.ts'
import { apply, capture, decode, encode } from './snapshot.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const SORT: RobotConfig = { type: 'sort', drive: 'diff2', actuator: 'tt' }
const TEAMS = ['Dế Xanh', 'Chuồn Chuồn', 'Kiến Lửa', 'Ong Vàng']
const CFGS = [MAKER, SORT, MAKER, MAKER]
const agents = (): SeatSpec[] => TEAMS.map((team, i) => ({ cfg: CFGS[i], team, driver: { kind: 'agent', skill: 'hard' } }))
const run = (g: GameSession, s: number) => {
  for (let k = 0; k < Math.round(s / PHYSICS_DT); k++) g.advance(PHYSICS_DT, 1)
}

/** Mọi thứ cảnh 3D, thẻ robot, bảng điểm, nhật ký đọc từ phiên (để so máy chủ với gương). */
function view(g: GameSession) {
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4
  return {
    robots: g.robots.map((r) => ({
      pose: [r4(r.pose.x), r4(r.pose.z), r4(r.pose.yaw), r4(r.body.translation().y)],
      stored: [...r.stored],
      comp: r.compartments && { o: [...r.compartments.o], g: [...r.compartments.g] },
      extend: r4(r.extend),
      armFrac: r4(r.armFrac),
      hasFlag: r.hasFlag,
      climb: { ...r.climb, s: r4(r.climb.s) },
      hookDeg: r4(r.hookDeg),
      msg: r.lastMessage,
      flag: r.flagBody ? [r4(r.flagBody.translation().x), r4(r.flagBody.translation().z)] : null,
    })),
    balls: g.world.balls.map((b) => (b.st === 'field' && b.body ? [b.st, r4(b.body.translation().x), r4(b.body.translation().y), r4(b.body.translation().z)] : [b.st])),
    t: r4(g.match.t),
    phase: g.match.phase,
    pens: g.match.pens,
    flags: g.match.flags,
    events: g.match.events.map((e) => ({ ...e, t: r4(e.t) })),
    tally: g.match.tally(),
    result: g.match.result(),
    trays: g.humans.map((h) => h.tray),
  }
}

test('ảnh chụp áp vào phiên gương: mọi thứ cảnh và bảng điểm đọc bằng máy chủ (sau 10 s xả bóng + 8 s đấu)', async () => {
  const host = await GameSession.create({ mode: 'match', seats: agents(), seed: 7 })
  const mirror = await GameSession.create({ mode: 'match', seats: agents(), seed: 7 })
  try {
    run(host, 18)
    assert.equal(host.match.phase, 'play')
    assert.ok(host.robots.some((r) => r.stored.length > 0), 'có robot đang chở bóng (phép thử có nghĩa)')
    assert.ok(host.match.events.length > 2)
    const buf = encode(capture(host, 1, 0))
    assert.ok(buf.byteLength < 12_000, `ảnh chụp gọn (${buf.byteLength} byte)`)
    const s = decode(buf)
    assert.ok(s)
    assert.equal(apply(mirror, s), true)
    assert.deepEqual(view(mirror), view(host))
    // Khung sau chỉ gửi sự kiện mới: gương vẫn đủ nhật ký.
    const n = host.match.events.length
    run(host, 4)
    assert.equal(apply(mirror, decode(encode(capture(host, 2, n)))!), true)
    assert.deepEqual(view(mirror), view(host))
  } finally {
    host.dispose()
    mirror.dispose()
  }
})

test('ảnh chụp của trận khác (seed khác) ⇒ apply trả false, gương giữ nguyên', async () => {
  const host = await GameSession.create({ mode: 'match', seats: agents(), seed: 7 })
  const mirror = await GameSession.create({ mode: 'match', seats: agents(), seed: 8 })
  try {
    run(host, 11)
    const before = view(mirror)
    assert.equal(apply(mirror, decode(encode(capture(host, 1, 0)))!), false)
    assert.deepEqual(view(mirror), before)
    assert.equal(decode(new ArrayBuffer(3)), null)
  } finally {
    host.dispose()
    mirror.dispose()
  }
})

test("người lái 'remote': cổng máy khách gửi lên lái robot trên máy chủ, chỉ từ pha thi đấu", async () => {
  let ports: PortValues = { ...NEUTRAL, M1: 80, M2: 80, M3: 80, M4: 80 }
  const seats = agents()
  seats[1] = { cfg: MAKER, team: 'Khách', driver: { kind: 'remote', ports: () => ports } }
  const g = await GameSession.create({ mode: 'match', seats, seed: 3 })
  try {
    const start = g.robots[1].pose
    run(g, 9.5)
    assert.ok(Math.hypot(g.robots[1].pose.x - start.x, g.robots[1].pose.z - start.z) < 0.005, 'đứng yên trong 10 s xả bóng')
    run(g, 1.5)
    const moved = Math.hypot(g.robots[1].pose.x - start.x, g.robots[1].pose.z - start.z)
    assert.ok(moved > 0.1, `chạy theo cổng gửi lên (${moved.toFixed(3)} m)`)
    ports = NEUTRAL
    const p = g.robots[1].pose
    run(g, 1)
    assert.ok(Math.hypot(g.robots[1].pose.x - p.x, g.robots[1].pose.z - p.z) < 0.05, 'cổng trung tính ⇒ dừng')
  } finally {
    g.dispose()
  }
})
