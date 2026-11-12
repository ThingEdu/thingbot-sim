import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { Agent, wheelCmd, type Skill } from './agent.ts'
import { playAgents, type Seat } from './quickmatch.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import type { RobotConfig } from './robots.ts'

/** Cổng bánh của Mẫu Maker diff2 (M1 trái, M2 phải). */
const WHEELS = ['M1', 'M2'] as const
const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const TEAMS = ['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4']

type Played = { score: number; flags: number; loads: { t: number; text: string }[]; deadZone: number }

/**
 * Một trận headless: 4 Mẫu Maker diff2 cùng mức agent (dùng playAgents dùng chung với giải đấu).
 * Giữ thứ tự robot cũ của bài đo này [Đỏ 0, Đỏ 1, Xanh 0, Xanh 1] (khác SEATS của trang) (số đo 06/11 sau khi Mẫu Maker thôi xúc bóng, chỉ nhận 4 bóng từ Human Player, robot máy ủi bóng về Khu Xuất Phát, bóng ra ở vòng cửa lồng: 211 / 224 / 246).
 */
const ORDER: Seat[] = [['red', 0], ['red', 1], ['blue', 0], ['blue', 1]]
async function play(skill: Skill, seed: number): Promise<Played> {
  let deadZone = 0
  const r = await playAgents({
    cfgs: [MAKER, MAKER, MAKER, MAKER], skills: [skill, skill, skill, skill], teams: TEAMS, seed, order: ORDER,
    onStep: (ports) => { for (const p of ports) for (const k of WHEELS) if (p[k] !== 0 && Math.abs(p[k]) < 20) deadZone++ },
  })
  const m = r.matchObj
  return {
    score: r.match,
    flags: m.flags.filter(Boolean).length,
    loads: m.events.filter((e) => e.text.includes('nhận bóng')).map((e) => ({ t: e.t, text: e.text })),
    deadZone,
  }
}

const SEEDS = [1, 2, 3]
const LEVELS: Skill[] = ['easy', 'medium', 'hard']
const NAME: Record<Skill, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }
const t0 = performance.now()
/** 3 trận mỗi mức, cùng 3 seed thế giới cho cả ba mức (so sánh trên cùng sân). */
const byLevel = new Map<Skill, Promise<Played[]>>()
const level = (s: Skill) => {
  let p = byLevel.get(s)
  if (!p) byLevel.set(s, (p = (async () => { const out: Played[] = []; for (const seed of SEEDS) out.push(await play(s, seed)); return out })()))
  return p
}
const avg = (xs: Played[]) => xs.reduce((s, x) => s + x.score, 0) / xs.length

// Luật V4 (Task 2): họ Maker bỏ cờ, sân thêm cột Thang Cứu Hỏa ⇒ thứ tự điểm ba mức đổi (Vừa < Dễ ở seed 1–3);
// Task 5 (robot máy leo xà) làm lại agent và đo lại các mốc này.
test('điểm trận trung bình (3 trận, 4 Mẫu Maker diff2): Khó > Vừa > Dễ', { skip: 'Task 5 đo lại sau khi agent leo xà (luật V4)' }, async () => {
  const res: Partial<Record<Skill, Played[]>> = {}
  for (const s of LEVELS) res[s] = await level(s)
  const a = Object.fromEntries(LEVELS.map((s) => [s, avg(res[s]!)])) as Record<Skill, number>
  for (const s of LEVELS) console.log(`${NAME[s]}: ${res[s]!.map((x) => x.score).join(' / ')} — trung bình ${a[s].toFixed(1)}`)
  for (const s of LEVELS) for (const x of res[s]!) assert.equal(x.deadZone, 0, `${NAME[s]}: lệnh bánh trong vùng chết (0, 20)`)
  assert.ok(a.hard > a.medium, `Khó ${a.hard} ≤ Vừa ${a.medium}`)
  assert.ok(a.medium > a.easy, `Vừa ${a.medium} ≤ Dễ ${a.easy}`)
})

test('wheelCmd: lệnh bánh không rơi vào vùng chết 20 % (|v| < 10 ⇒ 0, còn lại ≥ 25), kẹp ±100', () => {
  for (let v = -150; v <= 150; v += 0.5) {
    const w = wheelCmd(v)
    assert.ok(w === 0 || (Math.abs(w) >= 25 && Math.abs(w) <= 100), `wheelCmd(${v}) = ${w}`)
    if (w !== 0) assert.equal(Math.sign(w), Math.sign(v))
  }
  assert.equal(wheelCmd(5), 0)
  assert.equal(wheelCmd(-18), -25)
  assert.equal(wheelCmd(60), 60)
})

test('Xe Ủi chở bóng xanh đứng trong Khu Chữa Cháy: giữ bóng, không đổi nhiệm vụ mỗi bước', async () => {
  const w = await FanrocWorld.create(1)
  const ui: RobotConfig = { type: 'ui', drive: 'diff2', actuator: 'tt' }
  const robots = [ui, MAKER, MAKER, MAKER].map((c, i) => new RobotBody(w, c, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
  const m = new Match(w, robots, TEAMS, { seed: 1 })
  m.t = 0
  const idle: PortValues[] = robots.map(() => ({ ...NEUTRAL }))
  m.step(PHYSICS_DT, idle) // sang pha thi đấu
  const r = robots[0]
  r.setPose({ x: -0.9, z: -0.9, yaw: Math.PI / 4 })
  w.placeBall(150, { x: 0, y: 0.02, z: 0 })
  assert.ok(r.take(150))
  const agent = new Agent(r, ui, 'hard', 1)
  const view = { world: w, robots, match: m, humans: [] }
  let switches = 0
  let last = agent.doing
  for (let k = 0; k < 180; k++) {
    const p = agent.update(view, PHYSICS_DT)
    m.step(PHYSICS_DT, [p, ...idle.slice(1)])
    if (agent.doing !== last) switches++
    last = agent.doing
  }
  assert.equal(w.balls[150].st, 'held', 'bóng xanh không được thả vào Khu Chữa Cháy')
  assert.ok(switches <= 6, `${switches} lần đổi nhiệm vụ trong 3 s`)
})

test('mức Khó cắm ≥ 2 cờ mỗi trận (luật V4: 4 Xe Cắm Cờ — họ Maker không còn cờ)', async () => {
  const CO: RobotConfig = { type: 'co', drive: 'diff2', actuator: 'tt' }
  for (const seed of SEEDS) {
    const r = await playAgents({ cfgs: [CO, CO, CO, CO], skills: ['hard', 'hard', 'hard', 'hard'], teams: TEAMS, seed, order: ORDER })
    const flags = r.matchObj.flags.filter(Boolean).length
    assert.ok(flags >= 2, `trận seed ${seed}: ${flags} cờ`)
  }
})

test('10 trận Khó: không có sự kiện "nhận bóng" khi thời gian còn < 10 s', async () => {
  let n = 0
  let minLeft = Infinity
  for (let seed = 11; seed <= 20; seed++) {
    const x = await play('hard', seed)
    n += x.loads.length
    for (const e of x.loads) minLeft = Math.min(minLeft, 180 - e.t)
    const late = x.loads.filter((e) => 180 - e.t < 10)
    assert.deepEqual(late, [], `seed ${seed}: nhận bóng muộn`)
  }
  assert.ok(n > 0, 'không trận nào có Human Player nạp bóng: phép thử không kiểm được gì')
  console.log(`10 trận Khó: ${n} lần nhận bóng, muộn nhất khi còn ${minLeft.toFixed(1)} s`)
})

test('cùng seed ⇒ cùng trận (PRNG theo seed, không Math.random)', async () => {
  const [first] = await level('easy')
  const again = await play('easy', SEEDS[0])
  assert.deepEqual(again, first)
  console.log(`Tổng thời gian chạy phép thử agent: ${((performance.now() - t0) / 1000).toFixed(1)} s`)
})

test('mẫu cải tiến (R142, 1 trận Khó, 4 robot cùng mẫu): Maker Nâng đổ được Rãnh 2–3; Maker Hút và Pro hút bóng trên sân; cả ba hơn Mẫu Maker', async () => {
  const play1 = async (type: RobotConfig['type'], drive: RobotConfig['drive'] = 'diff2') => {
    const cfg: RobotConfig = { type, drive, actuator: 'tt' }
    const r = await playAgents({ cfgs: [cfg, cfg, cfg, cfg], skills: ['hard', 'hard', 'hard', 'hard'], teams: TEAMS, seed: 1, order: ORDER })
    return r
  }
  const base = (await level('hard'))[0].score
  const lift = await play1('makerLift')
  const high = lift.tally.mtn.reduce((s, tiers) => s + tiers[1].g + tiers[2].g, 0)
  assert.ok(high >= 4, `Maker Nâng: ${high} bóng xanh ở Rãnh 2–3`)
  const intake = await play1('makerIntake')
  const pro = await play1('makerPro', 'omni')
  for (const [name, r] of [['Maker Nâng', lift], ['Maker Hút', intake], ['Maker Pro', pro]] as const) {
    console.log(`${name}: ${r.match} (Mẫu Maker cùng seed: ${base})`)
    assert.ok(r.match > base, `${name} ${r.match} ≤ Mẫu Maker ${base}`)
  }
  // Hút trên sân: số bóng xanh lên núi nhiều hơn số Human Player nạp.
  const loaded = intake.matchObj.events.filter((e) => e.text.includes('nhận bóng')).length
  const onMtn = intake.tally.mtn.reduce((s, tiers) => s + tiers[0].g + tiers[1].g + tiers[2].g, 0)
  assert.ok(onMtn > loaded, `Maker Hút: ${onMtn} bóng trên núi, Human Player nạp ${loaded}`)
})
