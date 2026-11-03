import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { BALL_R, MOUNTAINS, PEAK_Y, TIERS, ZONES } from './layout.ts'

const run = (w: FanrocWorld, seconds: number) => {
  for (let k = 0; k < Math.round(seconds / PHYSICS_DT); k++) w.step(PHYSICS_DT)
}
/** Chạy 10 s xả bóng như trận thật: release(t) rồi step mỗi bước. */
const releasePhase = (w: FanrocWorld) => {
  for (let k = 0; k < 600; k++) {
    w.release(k * PHYSICS_DT)
    w.step(PHYSICS_DT)
  }
}
const pos = (w: FanrocWorld, i: number) => w.balls[i].body!.translation()
const GREEN = 150
const ORANGE = 5
const A = MOUNTAINS[0]

test('xả 10 s + 3 s: ≥ 280 bóng trên sân, không bóng nào lọt dưới sàn', async () => {
  const w = await FanrocWorld.create(1)
  releasePhase(w)
  run(w, 3)
  const field = w.balls.filter((b) => b.st === 'field')
  assert.ok(field.length >= 280, `chỉ ${field.length} bóng trên sân`)
  assert.equal(w.balls.filter((b) => b.st === 'box').length, 0, 'còn bóng trong hộp')
  for (const b of field) assert.ok(b.body!.translation().y >= 0, 'bóng dưới sàn mà vẫn field')
  // Bóng lăn theo vật lý ra khắp sân chứ không dồn cả ở rào phía xa.
  assert.ok(field.filter((b) => b.body!.translation().z > 0).length >= 30, 'bóng không lăn tới nửa sân gần')
})

test('xả bóng tất định theo seed', async () => {
  const snap = async (seed: number) => {
    const w = await FanrocWorld.create(seed)
    for (let k = 0; k < 120; k++) { w.release(k * PHYSICS_DT); w.step(PHYSICS_DT) }
    return w.balls.filter((b) => b.body).map((b) => b.body!.translation().x.toFixed(6)).join()
  }
  assert.equal(await snap(7), await snap(7))
  assert.notEqual(await snap(7), await snap(8))
})

// Rãnh 2 (TIERS[2]) phía trước Núi A: tầng 2 lệch 20 mm, nửa cạnh 108 mm; tầng 3 lệch 30 mm, nửa cạnh 68 mm.
const groove2 = { x: A.x, y: TIERS[2].floor + BALL_R + 0.001, z: A.z + 0.061 }

test('bóng xanh đứng yên trên Rãnh 2 Núi A: sau 2 s vẫn ở Rãnh 2, tally đếm mtn[0][1].g = 1', async () => {
  const w = await FanrocWorld.create(1)
  w.placeBall(GREEN, groove2)
  run(w, 2)
  const t = w.tally(new Set())
  assert.equal(t.mtn[0][1].g, 1)
  assert.ok(Math.abs(pos(w, GREEN).y - (TIERS[2].floor + BALL_R)) < 0.012)
})

test('gờ Rãnh 2 giữ bóng đang lăn ra mép', async () => {
  const w = await FanrocWorld.create(1)
  w.placeBall(GREEN, groove2, { x: 0, y: 0, z: 0.4 })
  run(w, 2)
  assert.equal(w.tally(new Set()).mtn[0][1].g, 1, `bóng rơi khỏi Rãnh 2, y = ${pos(w, GREEN).y.toFixed(3)}`)
})

test('bóng xanh trên tầng trang trí tính vào Rãnh 1 (mtn[m][0].g)', async () => {
  const w = await FanrocWorld.create(1)
  // Tầng trang trí (TIERS[1]) phía trước Núi B: mép tầng 1 ở z + 0.14, mép tầng 2 ở z + 0.088.
  const B = MOUNTAINS[1]
  w.placeBall(GREEN, { x: B.x, y: TIERS[1].floor + BALL_R + 0.001, z: B.z + 0.113 })
  run(w, 2)
  const t = w.tally(new Set())
  assert.equal(t.mtn[1][0].g, 1)
  assert.equal(t.mtn[1][1].g + t.mtn[1][2].g, 0)
})

test('bóng thả trên đỉnh núi (ngoài lỗ) lăn xuống chứ không lơ lửng', async () => {
  const w = await FanrocWorld.create(1)
  const h = w.holeCentres()[0]
  w.placeBall(GREEN, { x: h.x + 0.031, y: PEAK_Y + BALL_R + 0.005, z: h.z })
  run(w, 3)
  const p = pos(w, GREEN)
  const v = w.balls[GREEN].body!.linvel()
  assert.ok(p.y < PEAK_Y, `bóng còn trên đỉnh, y = ${p.y.toFixed(3)}`)
  assert.ok(Math.hypot(v.x, v.y, v.z) < 0.01, 'bóng chưa dừng')
  const onTier = TIERS.some((t) => Math.abs(p.y - (t.floor + BALL_R)) <= 0.012)
  const onFloor = Math.abs(p.y - BALL_R) < 0.002
  assert.ok(onTier || onFloor, `bóng lơ lửng ở y = ${p.y.toFixed(3)}`)
})

test('bóng tâm ngoài sân bị loại sau 1 bước, body được xoá', async () => {
  const w = await FanrocWorld.create(1)
  w.placeBall(GREEN, { x: 1.4, y: 0.05, z: 0 })
  w.step(PHYSICS_DT)
  assert.equal(w.balls[GREEN].st, 'out')
  assert.equal(w.balls[GREEN].body, null)
  w.placeBall(ORANGE, { x: 0, y: -0.2, z: 0 })
  w.step(PHYSICS_DT)
  assert.equal(w.balls[ORANGE].st, 'out')
})

test('tally: Khu Chữa Cháy tính bóng chạm vạch, bỏ bóng robot đang giữ và bóng đã hút', async () => {
  const w = await FanrocWorld.create(1)
  const f = ZONES.fire[0]
  w.placeBall(ORANGE, { x: (f.x0 + f.x1) / 2, y: BALL_R, z: (f.z0 + f.z1) / 2 })
  w.placeBall(ORANGE + 1, { x: f.x1 + BALL_R * 0.9, y: BALL_R, z: (f.z0 + f.z1) / 2 }) // tâm ngoài vạch nhưng chạm vạch
  w.placeBall(ORANGE + 2, { x: f.x1 + BALL_R * 1.2, y: BALL_R, z: (f.z0 + f.z1) / 2 }) // không chạm vạch
  w.placeBall(GREEN, { x: (f.x0 + f.x1) / 2 + 0.1, y: BALL_R, z: (f.z0 + f.z1) / 2 })
  w.placeBall(ORANGE + 3, { x: (f.x0 + f.x1) / 2 - 0.1, y: BALL_R, z: (f.z0 + f.z1) / 2 })
  w.placeBall(ORANGE + 4, { x: (f.x0 + f.x1) / 2, y: BALL_R, z: (f.z0 + f.z1) / 2 + 0.1 })
  w.removeBall(ORANGE + 4)
  assert.equal(w.balls[ORANGE + 4].st, 'held')
  assert.equal(w.balls[ORANGE + 4].body, null)
  const t = w.tally(new Set([ORANGE + 3]))
  assert.deepEqual(t.fire, { o: 2, g: 1 })
})

test('tally: bóng cam trên rãnh là sai vị trí (.o), Rãnh 3 đếm vào mtn[m][2]', async () => {
  const w = await FanrocWorld.create(1)
  w.placeBall(ORANGE, groove2)
  const h = w.holeCentres()[2]
  w.placeBall(GREEN, { x: h.x, y: TIERS[3].floor + BALL_R, z: h.z + 0.051 }) // Rãnh 3 phía trước trụ đỉnh Núi C
  const t = w.tally(new Set())
  assert.deepEqual(t.mtn[0][1], { g: 0, o: 1 })
  assert.deepEqual(t.mtn[2][2], { g: 1, o: 0 })
  assert.equal(w.inMountain(h.x, h.z), 2)
  assert.equal(w.inMountain(0, 0), -1)
})

test('hiệu năng: 190 s vật lý với 300 bóng < 60 s thời gian máy', async () => {
  const w = await FanrocWorld.create(3)
  const t0 = performance.now()
  releasePhase(w)
  run(w, 180)
  const s = (performance.now() - t0) / 1000
  console.log(`190 s vật lý, ${w.balls.filter((b) => b.st === 'field').length} bóng trên sân: ${s.toFixed(1)} s thời gian máy`)
  assert.ok(s < 60, `chậm: ${s.toFixed(1)} s`)
})
