import { test } from 'node:test'
import assert from 'node:assert/strict'
import RAPIER from '@dimforge/rapier3d-compat'
import { FanrocWorld, PHYSICS_DT, type Vec3 } from './world.ts'
import { BALL_R, FIELD, MOUNTAINS, PEAK_Y, TIERS, TIER_GROOVE, WALL_T, ZONES, fromMountain } from './layout.ts'

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

/**
 * Tìm chỗ đặt bóng trên tầng `k` của núi `m` từ chính hình va chạm: dò tia thẳng đứng dọc một bán kính
 * (góc `ang` trong hệ núi), lấy đoạn dài nhất mà tia chạm đáy rãnh, trả về điểm giữa và hướng ra ngoài.
 * Gọi trước khi đặt bóng nào (tia không lọc bóng).
 */
function grooveSpot(w: FanrocWorld, m: number, k: number, ang = 0): { x: number; z: number; out: { x: number; z: number } } {
  w.step(PHYSICS_DT) // cập nhật bộ truy vấn cho collider vừa tạo
  let best: [number, number] = [0, -1]
  let start = -1
  const STEP = 0.001
  for (let i = 0; i <= 215; i++) {
    const r = i * STEP
    const p = fromMountain(MOUNTAINS[m], r * Math.cos(ang), r * Math.sin(ang))
    const hit = w.rapier.castRay(new RAPIER.Ray({ x: p.x, y: 0.3, z: p.z }, { x: 0, y: -1, z: 0 }), 1, true)
    const onFloor = hit !== null && Math.abs(0.3 - hit.timeOfImpact - TIERS[k].floor) < 0.002
    if (onFloor && start < 0) start = i
    if ((!onFloor || i === 215) && start >= 0) {
      if (i - start > best[1] - best[0]) best = [start, i]
      start = -1
    }
  }
  assert.ok(best[1] - best[0] >= 10, `không thấy đáy tầng ${k} núi ${m}`)
  const r = ((best[0] + best[1]) / 2) * STEP
  const p = fromMountain(MOUNTAINS[m], r * Math.cos(ang), r * Math.sin(ang))
  const o = fromMountain(MOUNTAINS[m], Math.cos(ang), Math.sin(ang))
  const M = MOUNTAINS[m]
  return { ...p, out: { x: o.x - M.x, z: o.z - M.z } }
}
/** Thả bóng ngay trên đỉnh gờ của tầng `k` tại chỗ `s`, để bóng tự rơi vào rãnh. */
const above = (s: { x: number; z: number }, k: number): Vec3 => ({ x: s.x, y: TIERS[k].lip + BALL_R + 0.003, z: s.z })
const atRest = (w: FanrocWorld, i: number) => {
  const v = w.balls[i].body!.linvel()
  return Math.hypot(v.x, v.y, v.z) < 0.01
}

test('xả 10 s + 3 s: ≥ 280 bóng trên sân, không bóng nào lọt dưới sàn', async () => {
  const w = await FanrocWorld.create(1)
  for (let k = 0; k < 60; k++) { w.release(k * PHYSICS_DT); w.step(PHYSICS_DT) }
  assert.ok(w.balls.filter((b) => b.st === 'field').every((b) => b.color === 'g'), 'tầng dưới (xanh) phải ra trước')
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

const R2 = TIER_GROOVE.indexOf(1) // tầng của Rãnh 2
const R3 = TIER_GROOVE.indexOf(2)
const DECOR = TIERS.findIndex((t) => t.decor)

test('bóng xanh thả vào Rãnh 2 Núi A: sau 2 s vẫn ở Rãnh 2, tally đếm mtn[0][1].g = 1', async () => {
  const w = await FanrocWorld.create(1)
  w.placeBall(GREEN, above(grooveSpot(w, 0, R2), R2))
  run(w, 2)
  assert.equal(w.tally(new Set()).mtn[0][1].g, 1, `y = ${pos(w, GREEN).y.toFixed(3)}`)
  assert.ok(atRest(w, GREEN))
})

test('gờ Rãnh 2 giữ bóng đang lăn ra mép (4 hướng, Núi A và D)', async () => {
  for (const m of [0, 3]) for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const w = await FanrocWorld.create(1)
    const s = grooveSpot(w, m, R2, ang)
    w.placeBall(GREEN, { x: s.x, y: TIERS[R2].floor + BALL_R + 0.001, z: s.z }, { x: s.out.x * 0.4, y: 0, z: s.out.z * 0.4 })
    run(w, 2)
    assert.equal(w.tally(new Set()).mtn[m][1].g, 1, `núi ${m} hướng ${ang.toFixed(2)}: bóng rơi khỏi Rãnh 2, y = ${pos(w, GREEN).y.toFixed(3)}`)
  }
})

test('bóng xanh trên tầng trang trí tính vào Rãnh 1 (mtn[m][0].g)', async () => {
  const w = await FanrocWorld.create(1)
  w.placeBall(GREEN, above(grooveSpot(w, 1, DECOR), DECOR))
  run(w, 2)
  const t = w.tally(new Set())
  assert.equal(t.mtn[1][0].g, 1, `y = ${pos(w, GREEN).y.toFixed(3)}`)
  assert.equal(t.mtn[1][1].g + t.mtn[1][2].g, 0)
})

test('bóng thả trên đỉnh núi (ngoài lỗ) lăn xuống chứ không lơ lửng', async () => {
  const w = await FanrocWorld.create(1)
  const h = w.holeCentres()[0]
  w.placeBall(GREEN, { x: h.x + 0.03, y: PEAK_Y + BALL_R + 0.005, z: h.z })
  run(w, 3)
  const p = pos(w, GREEN)
  assert.ok(p.y < PEAK_Y, `bóng còn trên đỉnh, y = ${p.y.toFixed(3)}`)
  assert.ok(atRest(w, GREEN), 'bóng chưa dừng')
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
  // Bóng nằm yên trên sàn sát mặt ngoài rào cũng bị loại.
  w.placeBall(ORANGE + 1, { x: 0, y: BALL_R, z: FIELD / 2 + WALL_T + BALL_R + 0.001 })
  w.step(PHYSICS_DT)
  assert.equal(w.balls[ORANGE + 1].st, 'out')
  // Bóng đã loại không hồi sinh được bằng removeBall.
  w.removeBall(GREEN)
  assert.equal(w.balls[GREEN].st, 'out')
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
  const s2 = grooveSpot(w, 0, R2)
  const s3 = grooveSpot(w, 2, R3)
  w.placeBall(ORANGE, { x: s2.x, y: TIERS[R2].floor + BALL_R, z: s2.z })
  w.placeBall(GREEN, { x: s3.x, y: TIERS[R3].floor + BALL_R, z: s3.z })
  const t = w.tally(new Set())
  assert.deepEqual(t.mtn[0][1], { g: 0, o: 1 })
  assert.deepEqual(t.mtn[2][2], { g: 1, o: 0 })
  const h = w.holeCentres()[2]
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
