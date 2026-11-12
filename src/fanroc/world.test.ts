import { test } from 'node:test'
import assert from 'node:assert/strict'
import RAPIER from '@dimforge/rapier3d-compat'
import { FanrocWorld, PHYSICS_DT, type Vec3 } from './world.ts'
import { BALL_R, DISPENSER, FIELD, MOUNTAINS, PEAK_Y, TIERS, TIER_GROOVE, WALL_T, ZONES, fromMountain, holeCentres } from './layout.ts'

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

test('bóng ra ở lối ra Hộp Phân Phối: trong khe, không chồng vào rào phía xa', async () => {
  const w = await FanrocWorld.create(1)
  const seen = new Set<number>()
  let maxX = 0
  for (let k = 0; k < 600; k++) {
    w.release(k * PHYSICS_DT)
    w.balls.forEach((b, i) => {
      if (!b.body || seen.has(i)) return
      seen.add(i)
      const p = b.body.translation()
      assert.ok(p.z - BALL_R > -FIELD / 2, `bóng ${i} chồng vào rào, z = ${p.z}`)
      assert.ok(Math.abs(p.x - DISPENSER.x) + BALL_R <= DISPENSER.width / 2 + 1e-9, `bóng ${i} ngoài khe, x = ${p.x}`)
      maxX = Math.max(maxX, Math.abs(p.x - DISPENSER.x))
    })
    w.step(PHYSICS_DT)
  }
  assert.equal(seen.size, 300)
  assert.ok(maxX > DISPENSER.width / 2 - BALL_R - 0.01, 'bóng không trải hết khe')
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

test('tầng trang trí (luật V4): 2 bóng xanh không tính, 1 bóng cam vào decorO (−3); 3 rãnh không nhận bóng nào', async () => {
  const w = await FanrocWorld.create(1)
  const spots = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a) => grooveSpot(w, 1, DECOR, a))
  w.placeBall(GREEN, above(spots[0], DECOR))
  w.placeBall(GREEN + 1, above(spots[1], DECOR))
  w.placeBall(ORANGE, above(spots[2], DECOR))
  run(w, 2)
  const t = w.tally(new Set())
  for (const i of [GREEN, GREEN + 1, ORANGE]) {
    assert.ok(Math.abs(pos(w, i).y - (TIERS[DECOR].floor + BALL_R)) < 0.01, `bóng ${i} không nằm trên tầng trang trí: y = ${pos(w, i).y.toFixed(3)}`)
  }
  assert.equal(t.decorO, 1)
  assert.equal(t.mtn[1].length, 3)
  assert.deepEqual(t.mtn[1], [{ g: 0, o: 0 }, { g: 0, o: 0 }, { g: 0, o: 0 }])
})

test('bóng nằm trên sàn ở góc hình bao chân núi (ngoài chân thật) không tính Rãnh 1', async () => {
  const w = await FanrocWorld.create(1)
  for (const [m, lx, lz] of [[0, 0.19, 0.19], [0, -0.19, -0.19], [2, 0.19, -0.19]] as const) {
    const p = fromMountain(MOUNTAINS[m], lx, lz)
    w.placeBall(GREEN + m + (lx < 0 ? 1 : 0), { x: p.x, y: BALL_R + 0.001, z: p.z })
    assert.equal(w.inMountain(p.x, p.z), m)
  }
  run(w, 2)
  for (const i of [GREEN, GREEN + 1, GREEN + 2]) assert.ok(Math.abs(pos(w, i).y - BALL_R) < 0.003, `bóng ${i} không nằm trên sàn`)
  const t = w.tally(new Set())
  assert.deepEqual([t.mtn[0][0].g, t.mtn[2][0].g], [0, 0])
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

test('trayBall: bóng trên sân vào khay (xoá body); bóng ở trạng thái khác thì không đổi', async () => {
  const w = await FanrocWorld.create(1)
  w.placeBall(0, { x: 0, y: 0.02, z: 0 })
  w.trayBall(0)
  assert.equal(w.balls[0].st, 'tray')
  assert.equal(w.balls[0].body, null)
  w.trayBall(1) // còn trong hộp
  assert.equal(w.balls[1].st, 'box')
  w.placeBall(2, { x: 0, y: 0.02, z: 0 })
  w.removeBall(2)
  w.trayBall(2) // đang giữ trong robot
  assert.equal(w.balls[2].st, 'held')
})

test('world.holeCentres() là holeCentres() của layout ở cao độ đỉnh núi (một nguồn cho vật lý, cảnh, nhiệm vụ)', async () => {
  const w = await FanrocWorld.create(1)
  try {
    assert.deepEqual(w.holeCentres(), holeCentres().map((h) => ({ ...h, y: PEAK_Y })))
  } finally {
    w.rapier.free()
  }
})

test('Thang Cứu Hỏa: tia dọc từ trên xuống dọc thanh Xanh trúng thanh ở y ≈ 0,6675; lệch ngang 5 cm thì không trúng thanh', async () => {
  const { pointAt, ladderLen } = await import('./ladder.ts')
  const { LADDER } = await import('./layout.ts')
  const w = await FanrocWorld.create(1, { balls: false })
  const down = { x: 0, y: -1, z: 0 }
  for (const s of [0.6, 0.1, ladderLen('blue') - 0.1]) {
    const p = pointAt('blue', s)
    const hit = w.rapier.castRay(new RAPIER.Ray({ x: p.x, y: 1, z: p.z }, down), 2, true)
    assert.ok(hit, `s = ${s}: tia không trúng gì`)
    const y = 1 - hit.timeOfImpact
    assert.ok(Math.abs(y - (LADDER.y + LADDER.rodR)) < 0.003, `s = ${s}: trúng ở y = ${y.toFixed(4)}`)
  }
  // Lệch 5 cm vuông góc với thanh (nhìn từ trên): tia rơi xuống tận sàn.
  const p = pointAt('blue', 0.6)
  const q = pointAt('blue', 1.6)
  const n = { x: -(q.z - p.z), z: q.x - p.x } // pháp tuyến ngang của thanh, dài 1 m
  const hit = w.rapier.castRay(new RAPIER.Ray({ x: p.x + 0.05 * n.x, y: 1, z: p.z + 0.05 * n.z }, down), 2, true)
  assert.ok(hit && 1 - hit.timeOfImpact < 0.01, `lệch 5 cm vẫn trúng ở y = ${hit ? 1 - hit.timeOfImpact : '—'}`)
})

test('Thang Cứu Hỏa: ống dài LADDER.rodLen thò qua tâm cột a / b LADDER.overhang.a / .b (CAD lắp sân) — tia dọc trúng ống ngay ngoài cột, quá đầu ống thì không', async () => {
  const { pointAt, ladderLen } = await import('./ladder.ts')
  const { LADDER } = await import('./layout.ts')
  const w = await FanrocWorld.create(1, { balls: false })
  try {
    const down = { x: 0, y: -1, z: 0 }
    const y = (s: number) => {
      const p = pointAt('red', s)
      const hit = w.rapier.castRay(new RAPIER.Ray({ x: p.x, y: 1, z: p.z }, down), 2, true)
      return hit ? 1 - hit.timeOfImpact : null
    }
    const L = ladderLen('red')
    // Phía cột b ống thò 0,044, quá kẹp (bán kính 0,0175): trúng mặt trên ống. (Phía a ống chỉ thò 0,018, gần như ngang mép kẹp.)
    for (const s of [L + LADDER.overhang.b - 0.004, L + 0.025]) {
      const h = y(s)
      assert.ok(h !== null && Math.abs(h - (LADDER.y + LADDER.rodR)) < 0.003, `s = ${s.toFixed(3)}: trúng ở ${h}`)
    }
    // Quá đầu ống 5 mm: không trúng ống (rơi xuống rào / sàn ngoài, dưới 0,3).
    for (const s of [-LADDER.overhang.a - 0.005, L + LADDER.overhang.b + 0.005]) {
      const h = y(s)
      assert.ok(h === null || h < 0.31, `s = ${s.toFixed(3)}: quá đầu ống vẫn trúng ở ${h}`)
    }
  } finally {
    w.rapier.free()
  }
})

test('Thang Cứu Hỏa: cột hộp 20×20 cao 0,638 chắn tia ngang ở y = 0,3; kẹp Ø35 chắn tia ở y = 0,64', async () => {
  const { LADDERS, LADDER } = await import('./layout.ts')
  const w = await FanrocWorld.create(1, { balls: false })
  try {
    for (const { b } of Object.values(LADDERS)) {
      // Đầu b (gần Hộp Phân Phối, cột ngoài rào theo CAD lắp sân 12/11): tia từ tâm sân về phía cột, qua đúng tâm cột.
      // (Tia lệch 5 mm qua mặt trụ kẹp ở chỗ mới bị Rapier báo trúng sớm ~4 mm — sai số của phép chiếu tia lên trụ, không
      // phải vị trí kẹp; qua tâm thì chính xác.)
      const dz = 0
      const dir = { x: Math.sign(b.x), y: 0, z: 0 }
      const hitBox = w.rapier.castRay(new RAPIER.Ray({ x: 0, y: 0.3, z: b.z + dz }, dir), 2, true)
      const wantBox = Math.abs(b.x) - LADDER.post / 2
      assert.ok(hitBox && Math.abs(hitBox.timeOfImpact - wantBox) < 0.002, `cột ở x = ${b.x}: toi ${hitBox?.timeOfImpact}, mong ${wantBox}`)
      // y = 0,60 sát dưới kẹp (0,608): chỉ cột hộp mới chắn được, nên chiều cao cột phải ≥ 0,60.
      const hitTop = w.rapier.castRay(new RAPIER.Ray({ x: 0, y: 0.6, z: b.z + dz }, dir), 2, true)
      assert.ok(hitTop && Math.abs(hitTop.timeOfImpact - wantBox) < 0.002, `cột cao y = 0,60 ở x = ${b.x}: toi ${hitTop?.timeOfImpact}, mong ${wantBox}`)
      // y = 0,64 đã trên đỉnh cột (0,638) nhưng trong kẹp (0,608…0,673): trúng mặt trụ Ø35.
      const hitClamp = w.rapier.castRay(new RAPIER.Ray({ x: 0, y: 0.64, z: b.z + dz }, dir), 2, true)
      const wantClamp = Math.abs(b.x) - Math.sqrt(LADDER.clampR ** 2 - dz ** 2)
      assert.ok(hitClamp && Math.abs(hitClamp.timeOfImpact - wantClamp) < 0.002, `kẹp ở x = ${b.x}: toi ${hitClamp?.timeOfImpact}, mong ${wantClamp}`)
      // y = 0,69 trên kẹp (0,673) và trên ống (0,6675): không trúng gì ở đầu cột.
      const above = w.rapier.castRay(new RAPIER.Ray({ x: 0, y: 0.69, z: b.z + dz }, dir), 2, true)
      assert.ok(!above || above.timeOfImpact > Math.abs(b.x) + 0.1, 'trên kẹp phải trống')
    }
  } finally {
    w.rapier.free()
  }
})
