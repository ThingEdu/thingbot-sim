import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { Agent, wheelCmd, type Skill } from './agent.ts'
import { DEFAULT_LINEUP, lineupConfig, playAgents, SEATS, type Seat } from './quickmatch.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import type { RobotConfig } from './robots.ts'
import type { Climb } from './ladder.ts'
import { LADDER, MATCH_S } from './layout.ts'
import { barYaw, pointAt } from './ladder.ts'

/** Cổng bánh của Mẫu Maker diff2 (M1 trái, M2 phải). */
const WHEELS = ['M1', 'M2'] as const
const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const TEAMS = ['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4']

type Played = {
  score: number; flags: number; loads: { t: number; text: string }[]; deadZone: number
  /** Mức leo được tính lúc hết giờ [Đỏ 0, Đỏ 1, Xanh 0, Xanh 1], hệ số %, các lỗi bị bắt trong 40 s cuối (lúc leo). */
  climbs: Climb[]; multPct: number; mission: number; lateFouls: string[]
}

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
    climbs: [...r.tally.climbs.red, ...r.tally.climbs.blue],
    multPct: m.result().score.multPct,
    mission: m.result().score.mission,
    lateFouls: m.events.filter((e) => e.t >= MATCH_S - 40 && FOUL.test(e.text)).map((e) => `${e.t.toFixed(1)} ${e.text}`),
  }
}
/** Dòng sự kiện của trọng tài (phạt / cảnh cáo). */
const FOUL = /\((S02|G15|P12|P10)\)/

const SEEDS = [1, 2, 3, 4, 5, 6]
const LEVELS: Skill[] = ['easy', 'medium', 'hard']
const NAME: Record<Skill, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' }
const t0 = performance.now()
/** 6 trận mỗi mức, cùng 6 seed thế giới cho cả ba mức (so sánh trên cùng sân). */
const byLevel = new Map<Skill, Promise<Played[]>>()
const level = (s: Skill) => {
  let p = byLevel.get(s)
  if (!p) byLevel.set(s, (p = (async () => { const out: Played[] = []; for (const seed of SEEDS) out.push(await play(s, seed)); return out })()))
  return p
}
const avg = (xs: Played[]) => xs.reduce((s, x) => s + x.score, 0) / xs.length

// Luật V4: điểm trận = điểm nhiệm vụ × hệ số leo xà (Dễ chạm 120 %, Vừa 1 Đất + 1 Chạm mỗi liên minh 130 %, Khó treo Nước
// 180 % khi đủ 4 robot). Điểm nhiệm vụ của Mẫu Maker (chỉ ủi bóng + nhận bóng Human Player) lệch rất mạnh theo seed, 3 trận
// không đủ để so ba mức nên lấy 6 seed. Số đo 12/11 (thanh theo CAD lắp sân, R158): Dễ 128 / 165 / 22 / 76 / 172 / 56
// (103,2), Vừa 229 / 179 / 94 / 155 / 172 / 210 (173,2), Khó 310 / 173 / 150 / 274 / 240 / 17 (194,0).
test('điểm trận trung bình (6 trận, 4 Mẫu Maker diff2): Khó > Vừa > Dễ', async () => {
  const res: Partial<Record<Skill, Played[]>> = {}
  for (const s of LEVELS) res[s] = await level(s)
  const a = Object.fromEntries(LEVELS.map((s) => [s, avg(res[s]!)])) as Record<Skill, number>
  for (const s of LEVELS) console.log(`${NAME[s]}: ${res[s]!.map((x) => x.score).join(' / ')} — trung bình ${a[s].toFixed(1)}`)
  for (const s of LEVELS) for (const x of res[s]!) assert.equal(x.deadZone, 0, `${NAME[s]}: lệnh bánh trong vùng chết (0, 20)`)
  assert.ok(a.hard > a.medium, `Khó ${a.hard} ≤ Vừa ${a.medium}`)
  assert.ok(a.medium > a.easy, `Vừa ${a.medium} ≤ Dễ ${a.easy}`)
})

// Luật V4: robot máy leo Thang Cứu Hỏa cuối trận thay cho về đỗ. Khó: hai robot mỗi liên minh sang Nước (+20 % mỗi
// robot ⇒ 180 %); Vừa: ô 0 treo Đất (+10 %), ô 1 chạm xà (+5 %) ⇒ 130 % — thanh theo CAD lắp sân (12/11, R157) chỉ vừa một
// robot treo ở Đất (Mẫu Maker bám được 0,320…vạch 0,451; hai thân treo cách nhau ≥ 0,3); Dễ: chỉ chạm xà (+5 %).
test('leo xà cuối trận (seed 1, 4 Mẫu Maker cùng mức): Khó 4 Nước 180 %, Vừa 2 Đất + 2 Chạm 130 %, Dễ ≥ 2 Chạm; không lỗi lúc leo', async () => {
  const [hard] = await level('hard')
  const [medium] = await level('medium')
  const [easy] = await level('easy')
  for (const [n, x] of [['Khó', hard], ['Vừa', medium], ['Dễ', easy]] as const) console.log(`${n}: ${x.climbs.join(', ')} — ${x.multPct} %`)
  assert.deepEqual(hard.climbs, ['water', 'water', 'water', 'water'])
  assert.equal(hard.multPct, 180)
  assert.deepEqual(medium.climbs, ['ground', 'contact', 'ground', 'contact'])
  assert.equal(medium.multPct, 130)
  assert.ok(easy.climbs.filter((c) => c === 'contact').length >= 2, `Dễ: ${easy.climbs.join(', ')}`)
  for (const [n, x] of [['Khó', hard], ['Vừa', medium], ['Dễ', easy]] as const) assert.deepEqual(x.lateFouls, [], `${n}: lỗi lúc leo`)
})

test('móc ở cổng khác S2 (Xe Phân Loại S1 — trùng servo cũ của toPorts; Xe Cắm Cờ S4): robot máy Vừa vẫn treo Đất được', async () => {
  for (const type of ['sort', 'co'] as const) {
    const w = await FanrocWorld.create(1)
    const cfg: RobotConfig = { type, drive: 'diff2', actuator: 'tt' }
    const robots = [cfg, MAKER, MAKER, MAKER].map((c, i) => new RobotBody(w, c, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
    const m = new Match(w, robots, TEAMS, { seed: 1 })
    m.t = 0
    const idle: PortValues[] = robots.map(() => ({ ...NEUTRAL }))
    m.step(PHYSICS_DT, idle) // sang pha thi đấu
    m.t = MATCH_S - 30
    const r = robots[0]
    r.setPose({ x: -0.55, z: -0.25, yaw: 0 }) // ngoài sân trống, cách chỗ bám (≈ 0,391) chừng 0,5 m
    const agent = new Agent(r, cfg, 'medium', 1)
    const view = { world: w, robots, match: m, humans: [] }
    while (m.phase === 'play') m.step(PHYSICS_DT, [agent.update(view, PHYSICS_DT), ...idle.slice(1)])
    assert.equal(r.climbLevel.level, 'ground', `${r.def.name}: ${r.climbLevel.level} (${agent.doing})`)
    assert.equal(r.climbLevel.bar, 'red')
  }
})

test('pha quay theo thanh: robot treo ngay sau chỗ bám (vừa ngoài 0,32) — Đỏ 1 đứng vuông góc ở chỗ bám vẫn quay theo thanh và bám được, không đứng ở pha quay quá 3,5 s', async () => {
  const w = await FanrocWorld.create(1)
  const robots = [MAKER, MAKER, MAKER, MAKER].map((c, i) => new RobotBody(w, c, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
  const m = new Match(w, robots, TEAMS, { seed: 1 })
  m.t = 0
  const idle: PortValues[] = robots.map(() => ({ ...NEUTRAL }))
  m.step(PHYSICS_DT, idle) // sang pha thi đấu
  m.t = MATCH_S - 13 // vừa tới giờ đi leo (ETA ≈ 6 s bám + 8 s chờ đồng đội + 4 s trượt mức Khó)
  // Thanh theo CAD lắp sân: chỗ bám (Khó) ở LADDER.divider − 0,06 ≈ 0,391. Đỏ 0 (không agent) bám ở Đất rồi trượt tới
  // chỗ bám + 0,325 (vừa ngoài "thân treo phủ chỗ bám" 0,32): đuôi thân treo cách chỗ bám 0,175 < nửa đường chéo Đỏ 1
  // (0,19). Đỏ 1 đứng ở chỗ bám, vuông góc với thanh: quay theo thanh góc xe sượt thân treo. (Thanh CAD lắp sân: thân treo
  // trong 0,32 quanh chỗ bám thì agent chờ ở điểm chờ, nên cảnh "nhích vào thân treo rồi kẹt" của bản trước không còn dựng
  // được; giới hạn giờ CLIMB_ALIGN_MAX_S có phép thử riêng ngay dưới: bánh kẹt.)
  const s0 = LADDER.divider - 0.06
  const at = (s: number) => pointAt('red', s)
  robots[0].setPose({ ...at(0.43), yaw: barYaw('red') })
  m.step(PHYSICS_DT, [{ ...NEUTRAL, S2: 180 }, ...idle.slice(1)])
  m.step(PHYSICS_DT, [{ ...NEUTRAL, S2: 0 }, ...idle.slice(1)])
  assert.equal(robots[0].climb.mode, 'hang')
  while (robots[0].climb.s < s0 + 0.325) m.step(PHYSICS_DT, [{ ...NEUTRAL, M1: 100, M2: 100 }, ...idle.slice(1)])
  m.t = MATCH_S - 13
  const r = robots[1]
  r.setPose({ ...at(s0), yaw: barYaw('red') + Math.PI / 2 })
  const agent = new Agent(r, MAKER, 'hard', 1)
  const view = { world: w, robots, match: m, humans: [] }
  let run = 0
  let longest = 0
  let leftAlign = 0
  let last = ''
  for (let k = 0; k < 12 * 60 && m.phase === 'play'; k++) {
    m.step(PHYSICS_DT, [{ ...NEUTRAL }, agent.update(view, PHYSICS_DT), ...idle.slice(2)])
    const d = agent.doing
    run = d === 'climb:align' ? run + PHYSICS_DT : 0
    longest = Math.max(longest, run)
    if (last === 'climb:align' && d !== 'climb:align') leftAlign++
    last = d
  }
  assert.ok(leftAlign > 0, 'không lần nào rời pha quay theo thanh')
  assert.equal(r.climb.mode, 'hang', `Đỏ 1 không bám được: ${agent.doing}`)
  assert.ok(longest < 3.5, `đứng ở pha quay theo thanh liền ${longest.toFixed(1)} s`)
})

// R163: giới hạn giờ của pha quay theo thanh (CLIMB_ALIGN_MAX_S = 2,5 s). Dò 8 chỗ đỗ một robot sàn quanh chỗ bám, 15
// thân treo ngay sau chỗ bám và 72 thế đứng sát rào: không thế nào làm robot máy kẹt thật (góc xe đẩy được robot sàn, quay
// được tại chỗ). Nên dựng kẹt ở chính robot: bánh không ăn (cổng bánh bị bỏ qua, như động cơ đứt dây / bánh trượt) — agent
// ra lệnh quay mà hướng không đổi, không tiến độ ⇒ sau 2,5 s phải bỏ pha quay đi lại từ đầu, không đứng đó tới hết trận.
test('pha quay theo thanh không tiến (bánh không ăn): quá CLIMB_ALIGN_MAX_S thì bỏ, đi lại từ đầu — không đứng ở pha quay quá 3 s', async () => {
  const w = await FanrocWorld.create(1)
  const robots = [MAKER, MAKER, MAKER, MAKER].map((c, i) => new RobotBody(w, c, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
  const m = new Match(w, robots, TEAMS, { seed: 1 })
  m.t = 0
  const idle: PortValues[] = robots.map(() => ({ ...NEUTRAL }))
  m.step(PHYSICS_DT, idle) // sang pha thi đấu
  m.t = MATCH_S - 20
  const r = robots[1]
  r.setPose({ ...pointAt('red', LADDER.divider - 0.06), yaw: barYaw('red') + Math.PI / 2 }) // ở chỗ bám, vuông góc thanh
  const apply = r.apply.bind(r)
  r.apply = (_ports, dt) => apply({ ...NEUTRAL }, dt) // bánh không ăn lệnh
  const agent = new Agent(r, MAKER, 'hard', 1)
  const view = { world: w, robots, match: m, humans: [] }
  let run = 0
  let longest = 0
  let gaveUp = 0
  let last = ''
  for (let k = 0; k < 12 * 60 && m.phase === 'play'; k++) {
    m.step(PHYSICS_DT, [{ ...NEUTRAL }, agent.update(view, PHYSICS_DT), ...idle.slice(2)])
    const d = agent.doing
    if (last === 'climb:align' && d === 'climb:go') gaveUp++
    run = d === 'climb:align' ? run + PHYSICS_DT : 0
    longest = Math.max(longest, run)
    last = d
  }
  assert.ok(gaveUp >= 1, 'không lần nào bỏ pha quay theo thanh')
  assert.ok(longest > 2 && longest < 3, `đứng ở pha quay theo thanh liền ${longest.toFixed(2)} s (giới hạn 2,5 s)`)
})

// Chặn hồi quy: Dễ seed 1 trước vòng sửa omni (b1999f1) được 162 điểm nhiệm vụ, trước Task 5 (về đỗ, fd9da6c) 111; khi
// lùi-trong-chỗ-chật bị giới hạn chỉ cho việc leo, Dễ rơi xuống −9 (cùng hệ số 120 %). Sàn 100: dưới cả hai mốc cũ một
// quãng (cho phép lệch do đổi chiến thuật), trên xa mức hỏng.
test('Mẫu Maker Dễ seed 1: điểm nhiệm vụ không dưới 100 (chặn hồi quy lái ở chỗ chật)', async () => {
  const [easy] = await level('easy')
  console.log(`Dễ seed 1: điểm trận ${easy.score} = ${easy.mission} × ${easy.multPct} %`)
  assert.ok(easy.mission >= 100, `điểm nhiệm vụ ${easy.mission}`)
})

test('lái ở chỗ chật (hành lang giữa Núi A và Núi C): đích ở sau lưng ⇒ lùi thẳng về đích, không quay tại chỗ', async () => {
  const w = await FanrocWorld.create(1)
  const robots = [MAKER, MAKER, MAKER, MAKER].map((c, i) => new RobotBody(w, c, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
  const r = robots[0]
  r.setPose({ x: -0.37, z: 0, yaw: -Math.PI / 2 }) // giữa hành lang, mũi hướng +x (đông)
  const agent = new Agent(r, MAKER, 'medium', 1) as unknown as { aim(q: { x: number; z: number }, v: number): void; cmd: { fwd: number; turn: number } }
  agent.aim({ x: -0.9, z: 0.02 }, 60) // đích ở phía tây, sau lưng
  assert.ok(agent.cmd.fwd < 0, `lệnh tiến ${agent.cmd.fwd} (phải lùi)`)
  assert.ok(Math.abs(agent.cmd.turn) < 20, `lệnh quay ${agent.cmd.turn}`)
  // Ngoài sân trống thì vẫn quay tại chỗ như cũ.
  r.setPose({ x: 0.9, z: 0.0, yaw: -Math.PI / 2 })
  agent.aim({ x: 0.4, z: 0.02 }, 60)
  assert.equal(agent.cmd.fwd, 0)
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
    console.log(`${name}: ${r.match} = ${r.matchObj.result().score.mission} × ${r.matchObj.result().score.multPct} % (Mẫu Maker cùng seed: ${base}); leo ${[...r.tally.climbs.red, ...r.tally.climbs.blue].join(', ')}`)
    assert.ok(r.match > base, `${name} ${r.match} ≤ Mẫu Maker ${base}`)
  }
  // Đế omni (4 bánh, quay chậm hơn ~2 lần) cũng leo được như đế 2 bánh: Khó ⇒ cả 4 robot sang Nước.
  assert.deepEqual([...pro.tally.climbs.red, ...pro.tally.climbs.blue], ['water', 'water', 'water', 'water'], 'Maker Pro omni')
  assert.equal(pro.matchObj.result().score.multPct, 180)
  // Hút trên sân: số bóng xanh lên núi nhiều hơn số Human Player nạp.
  const loaded = intake.matchObj.events.filter((e) => e.text.includes('nhận bóng')).length
  const onMtn = intake.tally.mtn.reduce((s, tiers) => s + tiers[0].g + tiers[1].g + tiers[2].g, 0)
  assert.ok(onMtn > loaded, `Maker Hút: ${onMtn} bóng trên núi, Human Player nạp ${loaded}`)
})

// R162: Trận lẻ / Đấu tập / nhiệm vụ 12 mặc định là đội hình đa dạng (Mẫu Maker, Maker Hút, Xe Cắm Cờ, Maker Nâng) theo
// ghế SEATS của trang. Số đo 12/11 (seed 1–6): Dễ 252 / 276 / 135 / 156 / 167 / 178 (194,0), Vừa 206 / 318 / 242 / 176 /
// 227 / 297 (244,3), Khó 503 / 393 / 317 / 575 / 544 / 341 (445,5).
test('đội hình mặc định (R162, ghế SEATS, 6 seed mỗi mức): Khó > Vừa > Dễ; Khó cả 4 mẫu treo Nước; Xe Cắm Cờ cắm cờ ở Vừa / Khó; Dễ mẫu nào cũng chạm xà', async () => {
  const cfgs = DEFAULT_LINEUP.map((_, i) => lineupConfig(i))
  const res: Record<Skill, { score: number; climbs: Climb[]; flags: number }[]> = { easy: [], medium: [], hard: [] }
  for (const s of LEVELS) for (const seed of SEEDS) {
    const r = await playAgents({ cfgs, skills: cfgs.map(() => s), teams: TEAMS, seed })
    res[s].push({ score: r.match, climbs: SEATS.map(([a, k]) => r.tally.climbs[a][k]), flags: r.matchObj.flags.filter(Boolean).length })
  }
  const a = Object.fromEntries(LEVELS.map((s) => [s, res[s].reduce((t, x) => t + x.score, 0) / SEEDS.length])) as Record<Skill, number>
  for (const s of LEVELS) console.log(`đội hình mặc định ${NAME[s]}: ${res[s].map((x) => x.score).join(' / ')} — trung bình ${a[s].toFixed(1)}`)
  assert.ok(a.hard > a.medium, `Khó ${a.hard} ≤ Vừa ${a.medium}`)
  assert.ok(a.medium > a.easy, `Vừa ${a.medium} ≤ Dễ ${a.easy}`)
  for (const x of res.hard) assert.deepEqual(x.climbs, ['water', 'water', 'water', 'water'])
  for (const s of ['medium', 'hard'] as const) for (const x of res[s]) assert.ok(x.flags >= 1, `${NAME[s]}: Xe Cắm Cờ không cắm cờ nào`)
  DEFAULT_LINEUP.forEach((type, i) => {
    const touched = res.easy.filter((x) => x.climbs[i] !== 'none').length
    assert.ok(touched >= 5, `Dễ: ${type} chỉ chạm xà ${touched}/6 trận`)
  })
})
