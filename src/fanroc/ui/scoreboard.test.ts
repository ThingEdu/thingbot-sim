import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FanrocWorld, PHYSICS_DT } from '../world.ts'
import { RobotBody } from '../robot.ts'
import { Match } from '../match.ts'
import { NEUTRAL } from '../ports.ts'
import { SEATS } from '../quickmatch.ts'
import { teamScore, type ScoreBreakdown } from '../scoring.ts'
import type { RobotConfig } from '../robots.ts'
import { countdownCue, phaseOf, programLabel, resultView, scoreLine, scorePops, ScoreTicker, SCORE_HZ } from './scoreboard.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
/** Xe Ủi: hẹp. */
const UI: RobotConfig = { type: 'ui', drive: 'diff2', actuator: 'tt' }
const TEAMS = ['Dế Xanh', 'Chuồn Chuồn', 'Kiến Lửa', 'Ong Vàng']
const ZERO: ScoreBreakdown = { fire: 0, r1: 0, r2: 0, r3: 0, flag: 0, wrong: 0, mission: 0, multPct: 100, total: 0 }
const bd = (p: Partial<ScoreBreakdown>): ScoreBreakdown => ({ ...ZERO, ...p })

/** Trận theo thứ tự ghế của trang (Đỏ 0, Xanh 0, Đỏ 1, Xanh 1). */
async function setup(n = 4, practice = false, cfgs: RobotConfig[] = [MAKER, MAKER, MAKER, MAKER]) {
  const w = await FanrocWorld.create(1, { balls: false })
  const robots = SEATS.slice(0, n).map(([a, slot], i) => new RobotBody(w, cfgs[i], a, slot))
  const m = new Match(w, robots, TEAMS.slice(0, n), { seed: 1, practice })
  return { w, robots, m }
}
const run = (m: Match, n: number, seconds: number) => {
  const ports = Array.from({ length: n }, () => NEUTRAL)
  for (let k = 0; k < Math.round(seconds / PHYSICS_DT); k++) m.step(PHYSICS_DT, ports)
}

test('scorePops: tăng r3 15 ⇒ "+15 · Rãnh 3"; tăng fire ⇒ "+5 · Chữa Cháy"; wrong giảm ⇒ "−3 · Bóng sai chỗ"', () => {
  assert.deepEqual(scorePops(ZERO, bd({ r3: 15, total: 15 })), ['+15 · Rãnh 3'])
  assert.deepEqual(scorePops(bd({ fire: 10 }), bd({ fire: 15 })), ['+5 · Chữa Cháy'])
  assert.deepEqual(scorePops(bd({ wrong: -3 }), bd({ wrong: -6 })), ['−3 · Bóng sai chỗ'])
  // Không đổi ⇒ không báo; hai mục cùng đổi ⇒ hai dòng theo thứ tự mục; tổng không phải một mục.
  assert.deepEqual(scorePops(bd({ r1: 5, total: 5 }), bd({ r1: 5, total: 5 })), [])
  assert.deepEqual(scorePops(ZERO, bd({ fire: 5, flag: 40, total: 45 })), ['+5 · Chữa Cháy', '+40 · Cờ'])
})

test('scoreLine: điểm đội = teamScore; tên đội đúng bên', async () => {
  const { w, robots, m } = await setup(4, false, [UI, MAKER, UI, MAKER])
  try {
    m.setFlag(0) // +20 để điểm đội khác 0
    m.pens[3].minor = 2 // Ong Vàng: 2 lỗi nhẹ
    m.t = 1
    run(m, 4, 0.1)
    const line = scoreLine(m, robots)
    const r = m.result()
    assert.equal(line.total, r.score.total)
    assert.equal(line.total, 20)
    assert.deepEqual(line.red.teams.map((t) => t.name), ['Dế Xanh', 'Kiến Lửa'])
    assert.deepEqual(line.blue.teams.map((t) => t.name), ['Chuồn Chuồn', 'Ong Vàng'])
    const ong = line.blue.teams[1]
    assert.equal(ong.score, teamScore(r.score.total, m.pens[3]))
    assert.equal(ong.penalty, 10)
    assert.equal(line.red.teams[0].score, r.score.total)
    assert.equal(line.phase, 'ĐIỀU KHIỂN')
    assert.equal(line.clock, '2:59')
    // Nhãn chương trình theo ghế; thiếu ⇒ "Mặc định".
    const l2 = scoreLine(m, robots, ['Của em v3', 'Máy Vừa'])
    assert.deepEqual([l2.red.teams[0].program, l2.blue.teams[0].program, l2.red.teams[1].program], ['Của em v3', 'Máy Vừa', 'Mặc định'])
  } finally {
    w.rapier.free()
  }
})

test('scoreLine: nhiệm vụ một robot không vỡ (bên Xanh rỗng); luyện tập pha LUYỆN TẬP, đồng hồ đếm lên', async () => {
  const { w, robots, m } = await setup(1, true)
  try {
    run(m, 1, 0.5)
    const line = scoreLine(m, robots)
    assert.equal(line.red.teams.length, 1)
    assert.equal(line.blue.teams.length, 0)
    assert.equal(line.phase, 'LUYỆN TẬP')
    assert.equal(line.clock, '0:00')
    assert.equal(resultView(m, robots).items.length, 8)
  } finally {
    w.rapier.free()
  }
})

test('phaseOf: XẢ BÓNG → ĐIỀU KHIỂN (cả 30 s cuối, luật V4 bỏ End Game) → HẾT GIỜ', async () => {
  const { w, m } = await setup()
  try {
    assert.equal(phaseOf(m), 'XẢ BÓNG')
    m.t = 0
    run(m, 4, 0.1)
    assert.equal(phaseOf(m), 'ĐIỀU KHIỂN')
    m.t = 151
    run(m, 4, 0.1)
    assert.equal(phaseOf(m), 'ĐIỀU KHIỂN')
    m.t = 179.95
    run(m, 4, 0.1)
    assert.equal(phaseOf(m), 'HẾT GIỜ')
  } finally {
    w.rapier.free()
  }
})

test('countdownCue: 3 · 2 · 1 · BẮT ĐẦU ở t = −3, −2, −1, 0; nhảy nhiều mốc một lần (×40) lấy mốc sau cùng', () => {
  assert.equal(countdownCue(-3.01, -2.99), 3)
  assert.equal(countdownCue(-2.99, -2.5), null)
  assert.equal(countdownCue(-2.01, -2), 2)
  assert.equal(countdownCue(-1.01, -0.99), 1)
  assert.equal(countdownCue(-0.01, -1e-13), 0) // cộng dồn dt lệch về 0 một chút
  assert.equal(countdownCue(-3.5, 0.2), 0)
  assert.equal(countdownCue(-10, -9.9), null)
  assert.equal(countdownCue(0.1, 0.2), null)
})

test('programLabel: agent ⇒ "Máy Dễ|Vừa|Khó"; chương trình ⇒ nhãn truyền vào, mặc định "Mặc định"', () => {
  assert.equal(programLabel({ kind: 'agent', skill: 'easy' }), 'Máy Dễ')
  assert.equal(programLabel({ kind: 'agent', skill: 'hard' }), 'Máy Khó')
  assert.equal(programLabel({ kind: 'program' }), 'Mặc định')
  assert.equal(programLabel({ kind: 'program' }, 'Của em v3'), 'Của em v3')
})

test('ScoreTicker: tối đa SCORE_HZ lần/giây; báo nổi chỉ khi đang thi đấu; trận mới không báo bù', async () => {
  const { w, robots, m } = await setup()
  try {
    const tk = new ScoreTicker()
    const first = tk.tick(0, m, robots)
    assert.ok(first && first.pops.length === 0, 'lần đầu: có dòng, không báo nổi')
    assert.equal(tk.tick(1000 / SCORE_HZ - 1, m, robots), null, 'chưa tới hạn ⇒ null')
    // Đang xả bóng: điểm đổi (cờ Núi A) nhưng không báo nổi.
    m.setFlag(0)
    const rel = tk.tick(1000 / SCORE_HZ, m, robots)
    assert.ok(rel && rel.line.phase === 'XẢ BÓNG' && rel.line.score.flag === 20 && rel.pops.length === 0, 'xả bóng không báo nổi')
    m.t = 0
    run(m, 4, 0.1)
    // Lần đầu sau xả bóng chỉ đặt mốc, dù điểm đã đổi (cờ Núi B ngay lúc sang thi đấu).
    m.setFlag(1)
    const base = tk.tick(2000, m, robots)
    assert.ok(base && base.line.phase === 'ĐIỀU KHIỂN' && base.line.score.flag === 40 && base.pops.length === 0, 'sang thi đấu: chỉ đặt mốc')
    // Cờ Núi B rơi rồi cắm lại ⇒ "−20 · Cờ", rồi "+20 · Cờ".
    m.flags[1] = false
    assert.deepEqual(tk.tick(2300, m, robots)?.pops, ['−20 · Cờ'])
    m.setFlag(1)
    const next = tk.tick(2600, m, robots)
    assert.deepEqual(next?.pops, ['+20 · Cờ'])
    // Trận khác (cùng thời điểm thật): mốc mới, không báo bù từ trận cũ.
    const b = await setup()
    try {
      b.m.t = 0
      run(b.m, 4, 0.1)
      const other = tk.tick(2601, b.m, b.robots)
      assert.ok(other && other.pops.length === 0)
    } finally {
      b.w.rapier.free()
    }
  } finally {
    w.rapier.free()
  }
})

test('scoreLine có tên đội ⇒ đúng một lần tally (dò tia 300 bóng) mỗi lần; ScoreTicker mỗi nhịp một lần', async () => {
  const { w, robots, m } = await setup(4)
  try {
    let n = 0
    const real = m.tally.bind(m)
    m.tally = () => (n++, real())
    m.t = 1
    const line = scoreLine(m, robots, [], TEAMS)
    assert.equal(n, 1, `scoreLine gọi tally ${n} lần`)
    assert.deepEqual(line.red.teams.map((t) => t.name), ['Dế Xanh', 'Kiến Lửa'])
    const ticker = new ScoreTicker()
    n = 0
    for (let k = 0; k < 3; k++) ticker.tick(k * 1000, m, robots, [], TEAMS)
    assert.equal(n, 3, `3 nhịp gọi tally ${n} lần`)
    // Không có tên: lấy tên từ result() (thêm một lần tally), cùng kết quả.
    n = 0
    const again = scoreLine(m, robots)
    assert.equal(n, 2)
    assert.deepEqual(again, line)
  } finally {
    w.rapier.free()
  }
})
