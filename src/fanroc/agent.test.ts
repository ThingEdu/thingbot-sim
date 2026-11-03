import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { HumanPlayer } from './human.ts'
import { Agent, type Skill } from './agent.ts'
import type { RobotConfig } from './robots.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const TEAMS = ['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4']

type Played = { score: number; flags: number; loads: { t: number; text: string }[] }

/**
 * Một trận headless: 4 Mẫu Maker diff2 cùng mức agent, Human Player tự động hai bên (sự kiện ghi vào trận),
 * mỗi bước: agent ra cổng → Human Player → match.step. Thế giới và agent cùng seed ⇒ chạy lại ra đúng kết quả cũ.
 */
async function play(skill: Skill, seed: number): Promise<Played> {
  const w = await FanrocWorld.create(seed)
  const robots = [0, 1, 2, 3].map((i) => new RobotBody(w, MAKER, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
  const m = new Match(w, robots, TEAMS, { seed })
  const humans = (['red', 'blue'] as const).map((a) => new HumanPlayer(a))
  humans.forEach((h) => (h.onEvent = (s) => m.log(s)))
  const agents = robots.map((r, i) => new Agent(r, MAKER, skill, seed * 10 + i))
  while (m.phase !== 'end') {
    const view = { world: w, robots, match: m, humans }
    const ports = agents.map((a) => a.update(view, PHYSICS_DT))
    for (const h of humans) h.auto({ world: w, robots, phase: m.phase, endgame: m.endgame }, PHYSICS_DT)
    m.step(PHYSICS_DT, ports)
  }
  return {
    score: m.result().score.total,
    flags: m.flags.filter(Boolean).length,
    loads: m.events.filter((e) => e.text.includes('nhận bóng')).map((e) => ({ t: e.t, text: e.text })),
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

test('điểm trận trung bình (3 trận, 4 Mẫu Maker diff2): Khó > Vừa > Dễ', async () => {
  const res: Partial<Record<Skill, Played[]>> = {}
  for (const s of LEVELS) res[s] = await level(s)
  const a = Object.fromEntries(LEVELS.map((s) => [s, avg(res[s]!)])) as Record<Skill, number>
  for (const s of LEVELS) console.log(`${NAME[s]}: ${res[s]!.map((x) => x.score).join(' / ')} — trung bình ${a[s].toFixed(1)}`)
  assert.ok(a.hard > a.medium, `Khó ${a.hard} ≤ Vừa ${a.medium}`)
  assert.ok(a.medium > a.easy, `Vừa ${a.medium} ≤ Dễ ${a.easy}`)
})

test('mức Khó cắm ≥ 2 cờ mỗi trận', async () => {
  const res = await level('hard')
  res.forEach((x, k) => assert.ok(x.flags >= 2, `trận seed ${SEEDS[k]}: ${x.flags} cờ`))
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
