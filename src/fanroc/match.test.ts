import { test } from 'node:test'
import assert from 'node:assert/strict'
import RAPIER from '@dimforge/rapier3d-compat'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import { BALL_R, FIELD, MOUNTAINS, PEAK_Y, TIERS, ZONES, fromMountain, type Alliance, type Rect } from './layout.ts'
import { barYaw, pointAt } from './ladder.ts'
import type { RobotConfig } from './robots.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const UI: RobotConfig = { type: 'ui', drive: 'diff2', actuator: 'tt' }
/** Luật V4: họ Maker không còn cờ — phép thử về cờ / tay vươn dùng Xe Cắm Cờ. */
const CO: RobotConfig = { type: 'co', drive: 'diff2', actuator: 'tt' }
const TEAMS = ['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4']
const ORANGE = 0
const GREEN = 100

/** 4 robot ở chỗ xuất phát (đỏ 0, đỏ 1, xanh 0, xanh 1). */
const setup = async (cfgs: RobotConfig[] = [MAKER, MAKER, MAKER, MAKER], practice = false) => {
  const w = await FanrocWorld.create(1)
  const robots = cfgs.map((c, i) => new RobotBody(w, c, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
  const m = new Match(w, robots, TEAMS, { seed: 1, practice })
  return { w, robots, m }
}
const all = (p: Partial<PortValues>): PortValues[] => [0, 1, 2, 3].map(() => ({ ...NEUTRAL, ...p }))
const run = (m: Match, ports: PortValues[], seconds: number) => {
  for (let k = 0; k < Math.round(seconds / PHYSICS_DT); k++) m.step(PHYSICS_DT, ports)
}
/** Chỉ robot `i` nhận `p`, các robot khác đứng yên. */
const only = (i: number, p: Partial<PortValues>): PortValues[] => [0, 1, 2, 3].map((k) => ({ ...NEUTRAL, ...(k === i ? p : {}) }))
const mid = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })

/**
 * Các chỗ đặt bóng trên tầng `k` của núi `m` (dò tia thẳng đứng theo nhiều góc trong hệ núi, lấy giữa đoạn đáy rãnh dài nhất),
 * cách nhau ≥ 2.5 BALL_R. Gọi trước khi đặt bóng nào (tia không lọc bóng).
 */
function grooveSpots(w: FanrocWorld, m: number, k: number, n: number): { x: number; z: number }[] {
  w.rapier.updateSceneQueries()
  const out: { x: number; z: number }[] = []
  for (let deg = 0; deg < 360 && out.length < n; deg += 10) {
    const ang = (deg * Math.PI) / 180
    let best: [number, number] = [0, -1]
    let start = -1
    for (let i = 0; i <= 215; i++) {
      const p = fromMountain(MOUNTAINS[m], i * 0.001 * Math.cos(ang), i * 0.001 * Math.sin(ang))
      const hit = w.rapier.castRay(new RAPIER.Ray({ x: p.x, y: 0.3, z: p.z }, { x: 0, y: -1, z: 0 }), 1, true)
      const on = hit !== null && Math.abs(0.3 - hit.timeOfImpact - TIERS[k].floor) < 0.002
      if (on && start < 0) start = i
      if ((!on || i === 215) && start >= 0) {
        if (i - start > best[1] - best[0]) best = [start, i]
        start = -1
      }
    }
    if (best[1] - best[0] < 10) continue
    const r = ((best[0] + best[1]) / 2) * 0.001
    const p = fromMountain(MOUNTAINS[m], r * Math.cos(ang), r * Math.sin(ang))
    if (out.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 2.5 * BALL_R)) out.push(p)
  }
  assert.equal(out.length, n, `chỉ tìm được ${out.length} chỗ trên tầng ${k} núi ${m}`)
  return out
}

/** n bóng trải lưới trong vùng `r`, cách mép ≥ 0.05. */
function grid(r: Rect, n: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (let a = r.x0 + 0.05; a < r.x1 - 0.04 && out.length < n; a += 0.06)
    for (let b = r.z0 + 0.05; b < r.z1 - 0.04 && out.length < n; b += 0.06) out.push({ x: a, z: b })
  return out
}

test('ví dụ 2 cũ dựng trên sân thật (luật V4 bỏ đỗ): điểm nhiệm vụ 269, không ai leo ⇒ hệ số 100 %, điểm trận 269', async () => {
  const { w, m } = await setup([UI, UI, MAKER, MAKER])
  // Núi A (0): Rãnh 1 = 6, Rãnh 2 = 3, Rãnh 3 = 2 Mầm Cây; núi B (1): Rãnh 1 = 5. Rãnh 2 = tầng 2, Rãnh 3 = tầng 3.
  const spots: [number, number, number][] = [[0, 0, 6], [0, 2, 3], [0, 3, 2], [1, 0, 5]]
  const places = spots.map(([mt, k, n]) => grooveSpots(w, mt, k, n).map((p) => ({ ...p, k })))
  let g = GREEN
  for (const list of places) for (const p of list) w.placeBall(g++, { x: p.x, y: TIERS[p.k].floor + BALL_R, z: p.z })
  // Chữa Cháy: 20 cam + 2 xanh (sai vị trí).
  const fire = [...grid(ZONES.fire[0], 11), ...grid(ZONES.fire[1], 11)]
  fire.forEach((p, j) => w.placeBall(j < 20 ? ORANGE + j : g++, { x: p.x, y: BALL_R, z: p.z }))
  m.setFlag(0)
  m.setFlag(1)
  const t = m.tally()
  assert.deepEqual(t.fire, { o: 20, g: 2 })
  assert.deepEqual(t.mtn[0].map((x) => x.g), [6, 3, 2])
  assert.deepEqual(t.mtn[1].map((x) => x.g), [5, 0, 0])
  assert.deepEqual(t.climbs, { red: ['none', 'none'], blue: ['none', 'none'] })
  assert.equal(t.decorO, 0)
  const r = m.result()
  assert.deepEqual([r.score.mission, r.score.multPct, r.score.total], [269, 100, 269])
  assert.deepEqual(r.teams.map((x) => x.score), [269, 269, 269, 269])
})

test('bóng đè vạch Chữa Cháy (tâm cách mép 0.015 ngoài vùng) được tính; bóng trong robot không tính', async () => {
  const { w, robots, m } = await setup()
  const f = ZONES.fire[0]
  w.placeBall(ORANGE, { x: f.x1 + 0.015, y: BALL_R, z: (f.z0 + f.z1) / 2 })
  w.placeBall(ORANGE + 1, { x: (f.x0 + f.x1) / 2, y: BALL_R, z: (f.z0 + f.z1) / 2 })
  assert.deepEqual(m.tally().fire, { o: 2, g: 0 })
  assert.ok(robots[0].take(ORANGE + 1))
  assert.deepEqual(m.tally().fire, { o: 1, g: 0 })
})

/** Robot móc (S2 của Mẫu Maker) vào thanh `bar` ở chỗ bám `s`: đặt dưới thanh, giơ móc một bước rồi hạ một bước. */
const grab = (m: Match, robots: RobotBody[], i: number, bar: Alliance, s: number) => {
  const p = pointAt(bar, s)
  robots[i].setPose({ x: p.x, z: p.z, yaw: barYaw(bar) })
  m.step(PHYSICS_DT, only(i, { S2: 180 }))
  m.step(PHYSICS_DT, only(i, { S2: 0 }))
}
const climbLog = (m: Match) => m.events.filter((e) => /chạm xà|treo ở|rời xà/.test(e.text))

test('không còn End Game: không có dòng báo "End Game" khi qua mốc 30 s cuối, không có thuộc tính endgame', async () => {
  const { m } = await setup()
  m.t = 149
  run(m, all({}), 2)
  assert.equal(m.events.filter((e) => e.text.includes('End Game')).length, 0)
  assert.equal('endgame' in m, false)
})

test('robot treo khi hết giờ được tính vào hệ số: Đỏ 1 treo Nước, Đỏ 2 treo Đất ⇒ 130 %, 1 bóng cam ⇒ ⌈5 × 1,3⌉ = 7', async () => {
  const { w, robots, m } = await setup()
  m.t = 170
  grab(m, robots, 0, 'red', 0.4)
  run(m, only(0, { M1: 255, M2: 255 }), 3) // trượt sang Nước
  grab(m, robots, 1, 'red', 0.05)
  assert.deepEqual(m.tally().climbs, { red: ['water', 'ground'], blue: ['none', 'none'] })
  const f = mid(ZONES.fire[0])
  w.placeBall(ORANGE, { x: f.x, y: BALL_R, z: f.z })
  run(m, all({}), 7.5)
  assert.equal(m.phase, 'end')
  const r = m.result()
  assert.deepEqual([r.score.mission, r.score.multPct, r.score.total], [5, 130, 7])
  assert.deepEqual(m.tally().climbs.red, ['water', 'ground'])
})

test('robot Xanh treo thanh Đỏ không tính (hệ số 100 %); robot Đỏ treo đúng chỗ đó thì 110 %', async () => {
  for (const [i, want, climbs] of [[2, 100, { red: ['none', 'none'], blue: ['none', 'none'] }], [0, 110, { red: ['ground', 'none'], blue: ['none', 'none'] }]] as const) {
    const { robots, m } = await setup()
    m.t = 0
    grab(m, robots, i, 'red', 0.2)
    assert.deepEqual(robots[i].climbLevel, { level: 'ground', bar: 'red' })
    assert.deepEqual(m.tally().climbs, climbs)
    assert.equal(m.result().score.multPct, want)
  }
})

test('Match đặt r.peers: thanh Đỏ đã có 2 robot treo (Đỏ 1, Xanh 1) thì Đỏ 2 không bám được', async () => {
  const { robots, m } = await setup()
  m.t = 0
  assert.ok(robots.every((r) => r.peers === robots))
  grab(m, robots, 0, 'red', 0.4)
  grab(m, robots, 2, 'red', 0.05)
  grab(m, robots, 1, 'red', 0.2)
  assert.deepEqual(robots.map((r) => r.climb.mode), ['hang', 'floor', 'hang', 'floor'])
})

test('nhật ký leo: chỉ báo khi mức leo giữ ≥ 0,5 s (chạm 1 bước rồi treo không báo "chạm"); tên robot theo liên minh và số trong liên minh', async () => {
  const { robots, m } = await setup()
  m.t = 0
  grab(m, robots, 0, 'red', 0.2)
  run(m, all({}), 0.4)
  assert.equal(climbLog(m).length, 0, 'chưa đủ 0,5 s')
  run(m, all({}), 0.2)
  assert.deepEqual(climbLog(m).map((e) => [e.robot, e.text]), [[0, 'Robot Đỏ 1 treo ở Khu vực Đất (+0,10)']])
  run(m, only(0, { M1: 255, M2: 255 }), 2.5)
  run(m, all({}), 0.6)
  assert.equal(climbLog(m).at(-1)?.text, 'Robot Đỏ 1 treo ở Khu vực Nước (+0,20)')
  run(m, only(0, { S2: 180 }), 0.6) // giơ móc: rơi xuống sàn, móc vẫn chạm xà
  assert.equal(climbLog(m).at(-1)?.text, 'Robot Đỏ 1 chạm xà (+0,05)')
  robots[0].setPose({ x: 0, z: 0.6, yaw: 0 })
  run(m, all({}), 0.6)
  assert.equal(climbLog(m).at(-1)?.text, 'Robot Đỏ 1 rời xà')
  grab(m, robots, 3, 'blue', 0.2)
  run(m, all({}), 0.6)
  assert.deepEqual(climbLog(m).at(-1), { t: climbLog(m).at(-1)!.t, robot: 3, text: 'Robot Xanh 2 treo ở Khu vực Đất (+0,10)' })
  assert.equal(climbLog(m).length, 5)
})

test('pha xả bóng: lệnh tiến không làm robot đi; hết 10 s sang play và robot chạy', async () => {
  const { robots, m } = await setup()
  assert.equal(m.phase, 'release')
  const z0 = robots[0].pose.z
  run(m, all({ M1: 80, M2: 80 }), 9.5)
  assert.equal(m.phase, 'release')
  assert.ok(Math.abs(robots[0].pose.z - z0) < 0.005, `robot trôi ${robots[0].pose.z - z0}`)
  run(m, all({ M1: 80, M2: 80 }), 1)
  assert.equal(m.phase, 'play')
  assert.ok(z0 - robots[0].pose.z > 0.05, 'sang play robot phải chạy')
})

test('t = 180 ⇒ end: lệnh sau đó không làm robot đi, điểm chấm một lần', async () => {
  const { w, robots, m } = await setup()
  m.t = 179.5
  run(m, all({ M1: 80, M2: 80 }), 0.5)
  assert.equal(m.phase, 'end')
  const before = m.result().score.total
  const z0 = robots[0].pose.z
  run(m, all({ M1: 80, M2: 80 }), 1)
  assert.ok(Math.abs(robots[0].pose.z - z0) < 0.005, `robot vẫn đi ${robots[0].pose.z - z0}`)
  // Đặt bóng vào Chữa Cháy sau giờ: điểm đã chốt không đổi.
  const f = mid(ZONES.fire[0])
  w.placeBall(ORANGE, { x: f.x, y: BALL_R, z: f.z })
  run(m, all({}), 0.1)
  assert.equal(m.result().score.total, before)
  assert.ok(m.t <= 180 + 1e-9)
})

test('cắm cờ qua onFlag: flags[m] = true và có sự kiện', async () => {
  const { robots, m } = await setup()
  robots[1].onFlag!(2)
  assert.deepEqual(m.tally().flags, [false, false, true, false])
  assert.ok(m.events.some((e) => e.robot === 1 && e.text === 'Robot 2 cắm cờ Núi C'))
})

/** Nhấc robot lên đỉnh núi (thân cao hơn sàn) rồi để vật lý giữ nó trên núi. */
const climb = (r: RobotBody, mt: number) => {
  const p = MOUNTAINS[mt]
  r.setPose({ x: p.x, z: p.z, yaw: 0 })
  r.body.setTranslation({ x: p.x, y: PEAK_Y + 0.01, z: p.z }, true)
}

test('leo núi P12 hai lần ⇒ lần đầu cảnh cáo, lần sau 1 lỗi', async () => {
  const { robots, m } = await setup()
  m.t = 0
  climb(robots[0], 0)
  run(m, all({}), 0.5)
  assert.ok(robots[0].body.translation().y > 0.03, 'robot phải còn trên núi')
  assert.equal(m.pens[0].minor, 0)
  const warn = m.events.filter((e) => e.robot === 0 && e.text.includes('P12'))
  assert.equal(warn.length, 1)
  assert.match(warn[0].text, /cảnh cáo/)
  // Xuống sàn chưa tới 1 s rồi leo lại: vẫn cùng một đợt, không thêm sự kiện.
  robots[0].setPose({ x: 0, z: 0, yaw: 0 })
  run(m, all({}), 0.5)
  climb(robots[0], 0)
  run(m, all({}), 0.5)
  assert.equal(m.events.filter((e) => e.robot === 0 && e.text.includes('P12')).length, 1)
  // Xuống sàn ≥ 1 s rồi leo lại: một lỗi.
  robots[0].setPose({ x: 0, z: 0, yaw: 0 })
  run(m, all({}), 1.2)
  climb(robots[0], 0)
  run(m, all({}), 0.5)
  assert.equal(m.pens[0].minor, 1)
  assert.equal(m.events.filter((e) => e.robot === 0 && e.text.includes('P12')).length, 2)
  assert.equal(m.result().teams[0].score, 0) // điểm trận 0, không âm
})

test('vươn ra ngoài rào S02 ⇒ thẻ vàng một lần mỗi đợt', async () => {
  const { w, robots, m } = await setup()
  m.t = 0
  // Maker sát rào phía xa, mũi hướng −z (yaw 0); M4 đẩy thanh răng ra mũi, ra ngoài rào.
  robots[0].setPose({ x: -0.6, z: -FIELD / 2 + 0.16, yaw: 0 })
  run(m, only(0, { M4: 100 }), 2)
  assert.equal(m.pens[0].yellow, 1)
  run(m, only(0, { M4: 100 }), 2)
  assert.equal(m.pens[0].yellow, 1, 'cùng một đợt chỉ một thẻ')
  run(m, only(0, { M4: -100 }), 4) // thu hết (0,2 m ở 0,08 m/s = 2,5 s) rồi ở trong rào đủ lâu để sang đợt mới
  run(m, only(0, { M4: 100 }), 2)
  assert.equal(m.pens[0].yellow, 2)
  assert.equal(m.events.filter((e) => e.text.includes('S02')).length, 2)
  // 5 bóng cam trong Chữa Cháy = 25: đội 1 bị 2 thẻ vàng còn 5, các đội khác giữ 25.
  const f = mid(ZONES.fire[1])
  for (let j = 0; j < 5; j++) w.placeBall(ORANGE + j, { x: f.x + 0.05 * j, y: BALL_R, z: f.z })
  assert.deepEqual(m.result().teams.map((x) => x.score), [5, 25, 25, 25])
})

const g15 = (m: Match) => m.events.filter((e) => e.text.includes('G15'))

test('G15: robot xanh lái tới sát robot đỏ rồi đứng > 5 s ⇒ thẻ vàng cho robot xanh (tới sau), chưa 5 s thì không', async () => {
  const { robots, m } = await setup()
  m.t = 0
  // Giữa sân (z = 0, hành lang giữa hai cặp núi). Robot 3 (xanh) quay mũi về −x (yaw = π/2): bề ngang theo x là l/2 = 0.15.
  robots[0].setPose({ x: -0.3, z: 0, yaw: 0 })
  robots[2].setPose({ x: -0.3 + 0.12 + 0.15 + 0.12, z: 0, yaw: Math.PI / 2 })
  const gapX = () => robots[2].pose.x - robots[0].pose.x - 0.27
  for (let k = 0; k < 300 && gapX() > 0.012; k++) m.step(PHYSICS_DT, only(2, { M1: 40, M2: 40 }))
  assert.ok(gapX() < 0.02 && gapX() > -0.005, `khe ${gapX()}`)
  run(m, all({}), 4.5)
  assert.equal(g15(m).length, 0)
  run(m, all({}), 1.5)
  assert.equal(m.pens[2].yellow, 1)
  assert.equal(m.pens[0].yellow, 0)
  assert.deepEqual(g15(m).map((e) => e.robot), [2])
  run(m, all({}), 6)
  assert.equal(m.pens[2].yellow, 1, 'cùng một đợt chỉ một thẻ')
})

test('G15: hai robot khác liên minh cùng đứng yên từ đầu (không phân định) ⇒ cảnh cáo cả hai, không thẻ', async () => {
  const { robots, m } = await setup()
  m.t = 0
  robots[0].setPose({ x: -0.1, z: 0, yaw: 0 })
  robots[2].setPose({ x: -0.1 + 0.24 + 0.01, z: 0, yaw: 0 }) // khe 0.01
  run(m, all({}), 5.5)
  assert.deepEqual(g15(m).map((e) => e.robot), [0, 2])
  assert.ok(g15(m).every((e) => e.text.includes('cảnh cáo')))
  assert.deepEqual(m.pens.map((p) => p.yellow), [0, 0, 0, 0])
})

test('G15 không áp cho đồng đội cùng liên minh, kể cả hai robot đứng sát nhau trong ô Thang Cứu Hỏa', async () => {
  const { robots, m } = await setup([UI, UI, MAKER, MAKER])
  // Đồng đội đứng sát nhau giữa sân.
  m.t = 0
  robots[0].setPose({ x: -0.1, z: 0, yaw: 0 })
  robots[1].setPose({ x: -0.1 + 0.18 + 0.01, z: 0, yaw: 0 })
  run(m, all({}), 6)
  assert.equal(g15(m).length, 0)
  // Hai Xe Ủi đỏ đứng cạnh nhau (khe 0.005) trong ô Thang Cứu Hỏa > 5 s.
  const s = ZONES.ladder.red
  const c = mid(s)
  robots[0].setPose({ x: s.x0 + 0.095, z: c.z, yaw: 0 })
  robots[1].setPose({ x: s.x1 - 0.095, z: c.z, yaw: 0 })
  m.t = 155
  run(m, all({}), 6)
  assert.equal(g15(m).length, 0)
  assert.deepEqual(m.pens.map((p) => p.yellow), [0, 0, 0, 0])
})

test('G15 không tính khi một robot có góc trong Khu Tiếp Tế của mình; ô Thang Cứu Hỏa (Vùng Bảo Vệ cũ) không còn miễn', async () => {
  for (const zone of [ZONES.load.red, ZONES.ladder.red]) {
    const { robots, m } = await setup()
    m.t = 0
    // Robot đỏ chìa nửa thân ra khỏi mép phải ô của mình, robot xanh đứng sát bên phải nó (ngoài mọi ô xanh).
    const z = zone === ZONES.load.red ? zone.z0 + 0.2 : mid(zone).z
    robots[0].setPose({ x: zone.x1 + 0.05, z, yaw: 0 })
    robots[2].setPose({ x: zone.x1 + 0.05 + 0.24 + 0.01, z, yaw: 0 })
    run(m, all({}), 6)
    assert.equal(g15(m).length > 0, zone !== ZONES.load.red, `ô x1 = ${zone.x1}: ${JSON.stringify(g15(m))}`)
  }
})

test('G15 miễn cho robot đang treo trên Thang Cứu Hỏa; cùng chỗ đó đứng sàn thì vẫn tính', async () => {
  for (const hanging of [true, false]) {
    const { robots, m } = await setup()
    m.t = 0
    const p = pointAt('red', 0.2)
    if (hanging) grab(m, robots, 0, 'red', 0.2)
    else robots[0].setPose({ x: p.x, z: p.z, yaw: barYaw('red') })
    assert.equal(robots[0].climb.mode === 'hang', hanging)
    // Robot xanh song song, đứng sát phía trong sân (khe 0,01 theo pháp tuyến của thanh).
    const fp = robots[0].footprint()
    const width = Math.hypot(fp[1].x - fp[0].x, fp[1].z - fp[0].z)
    const n = { x: fp[1].x - fp[0].x, z: fp[1].z - fp[0].z }
    const sgn = n.x + n.z > 0 ? 1 : -1 // phía +x +z là trong sân
    const off = (width + 0.01) / width
    robots[2].setPose({ x: p.x + sgn * n.x * off, z: p.z + sgn * n.z * off, yaw: barYaw('red') })
    run(m, all({}), 6)
    assert.equal(g15(m).length > 0, !hanging, `${hanging ? 'đang treo: không tính' : 'đứng sàn: tính'} ${JSON.stringify(g15(m))}`)
  }
})

test('luyện tập: không hết giờ, không phạt (sự kiện ghi "luyện tập")', async () => {
  const { robots, m } = await setup(undefined, true)
  m.t = 0
  robots[0].setPose({ x: -0.6, z: -FIELD / 2 + 0.16, yaw: 0 })
  run(m, only(0, { M4: 100 }), 2)
  assert.equal(m.pens[0].yellow, 0)
  assert.ok(m.events.some((e) => e.text.includes('S02') && e.text.includes('luyện tập')))
  m.t = 179.9
  run(m, all({}), 0.5)
  assert.equal(m.phase, 'play')
})

test('luyện tập (R31): tạo trận là đã xả xong bóng, t = 0 pha thi đấu, robot vẫn ở ô xuất phát', async () => {
  const w = await FanrocWorld.create(1)
  const robots = [MAKER, MAKER, MAKER, MAKER].map((c, i) => new RobotBody(w, c, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1))
  const start = robots.map((r) => ({ ...r.pose }))
  const m = new Match(w, robots, TEAMS, { seed: 1, practice: true })
  assert.equal(m.phase, 'play')
  assert.equal(m.t, 0)
  assert.equal(w.balls.filter((b) => b.st === 'box').length, 0, 'còn bóng trong hộp')
  robots.forEach((r, i) => assert.ok(Math.hypot(r.pose.x - start[i].x, r.pose.z - start[i].z) < 0.005, `Robot ${i + 1} trôi khỏi ô xuất phát`))
  assert.ok(m.events.some((e) => e.text.startsWith('Luyện tập: bóng đã xả xong')))
  // Trận thường không tua.
  const w2 = await FanrocWorld.create(1)
  const m2 = new Match(w2, [MAKER, MAKER, MAKER, MAKER].map((c, i) => new RobotBody(w2, c, i < 2 ? 'red' : 'blue', (i % 2) as 0 | 1)), TEAMS, { seed: 1 })
  assert.equal(m2.phase, 'release')
  assert.equal(m2.t, -10)
})

test('log(text, robot) ghi sự kiện kèm thời điểm (để nối HumanPlayer.onEvent)', async () => {
  const { m } = await setup()
  m.log('Human Player nhặt bóng cam')
  m.log('Robot 2 nhận bóng xanh', 1)
  assert.deepEqual(m.events.slice(-2), [
    { t: -10, robot: null, text: 'Human Player nhặt bóng cam' },
    { t: -10, robot: 1, text: 'Robot 2 nhận bóng xanh' },
  ])
})

test('cán cờ nằm trên sàn (P10) ⇒ cảnh cáo, không phạt điểm', async () => {
  const { robots, m } = await setup([CO, MAKER, MAKER, MAKER])
  m.t = 0
  robots[0].setPose({ x: 0, z: 0, yaw: 0 })
  // Xe Cắm Cờ mở kẹp xa lỗ cờ ⇒ cờ rơi ra sàn trước mũi xe.
  run(m, only(0, { S2: 0 }), 1)
  const f = robots[0].flagBody!.translation()
  assert.ok(f.y < 0.05, `cờ chưa nằm sàn: y = ${f.y}`)
  assert.equal(m.events.filter((e) => e.text.includes('P10')).length, 0)
  robots[1].setPose({ x: f.x, z: f.z, yaw: Math.PI / 2 })
  run(m, all({}), 0.1)
  const ev = m.events.filter((e) => e.text.includes('P10'))
  assert.equal(ev.length, 1)
  assert.equal(ev[0].robot, 1)
  assert.match(ev[0].text, /cảnh cáo/)
  assert.deepEqual(m.pens[1], { minor: 0, yellow: 0, red: false })
})

test('P10 không tính robot tới chỗ cờ của chính mình', async () => {
  const { robots, m } = await setup([CO, MAKER, MAKER, MAKER])
  m.t = 0
  robots[0].setPose({ x: 0, z: 0, yaw: 0 })
  run(m, only(0, { S2: 0 }), 1)
  const f = robots[0].flagBody!.translation()
  robots[0].setPose({ x: f.x, z: f.z, yaw: Math.PI / 2 })
  run(m, all({}), 0.1)
  assert.equal(m.events.filter((e) => e.text.includes('P10')).length, 0)
})

test('sau hết giờ tally()/result() trả bản sao: sửa kết quả trả về không đổi điểm đã chốt', async () => {
  const { m } = await setup()
  m.t = 179.9
  run(m, all({}), 0.2)
  assert.equal(m.phase, 'end')
  const t = m.tally()
  t.fire.o = 50
  t.flags[0] = true
  m.result().score.total = 999
  assert.equal(m.tally().fire.o, 0)
  assert.equal(m.tally().flags[0], false)
  assert.equal(m.result().score.total, 0)
})

test('số tên đội phải bằng số robot', async () => {
  const w = await FanrocWorld.create(1)
  const robots = [new RobotBody(w, MAKER, 'red', 0), new RobotBody(w, MAKER, 'red', 1)]
  assert.throws(() => new Match(w, robots, ['Đội 1'], { seed: 1 }), /tên đội/)
})

test('S02 do thanh răng lùi ra đuôi (Maker Nâng sát rào phía xa, đuôi hướng rào) và do tay S1 của Xe Cắm Cờ', async () => {
  const LIFT: RobotConfig = { type: 'makerLift', drive: 'diff2', actuator: 'tt' }
  const { robots, m } = await setup([LIFT, CO, MAKER, MAKER])
  m.t = 0
  // yaw π: mũi hướng +z, đuôi về rào phía xa (−z).
  robots[0].setPose({ x: -0.6, z: -FIELD / 2 + 0.16, yaw: Math.PI })
  robots[1].setPose({ x: 0.3, z: -FIELD / 2 + 0.16, yaw: 0 })
  run(m, [{ ...NEUTRAL, M4: 100 }, { ...NEUTRAL, S1: 180 }, { ...NEUTRAL }, { ...NEUTRAL }], 2)
  assert.equal(m.pens[0].yellow, 1, 'thanh răng ra sau đuôi')
  assert.equal(m.pens[1].yellow, 1, 'tay cờ vươn ra mũi')
})
