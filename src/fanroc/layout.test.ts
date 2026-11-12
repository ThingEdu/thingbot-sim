import { test } from 'node:test'
import assert from 'node:assert/strict'
import mesh from './assets/mountain-mesh.json' with { type: 'json' }
import {
  BALL_R, DISPENSER, FIELD, HOLE, MOUNTAIN_FOOT, MOUNTAINS, PEAK_Y, START_POSES, TIERS, TIER_GROOVE, WALL_H, ZONES,
  LADDER, LADDERS, fromMountain, holeCentres, mountainAt, toMountain, type Rect,
} from './layout.ts'
import { ladderLen, pointAt, project } from './ladder.ts'

const w = (r: Rect) => r.x1 - r.x0
const d = (r: Rect) => r.z1 - r.z0
const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`)
const inside = (x: number, z: number, r: Rect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
/** Các điểm trên viền hình bao chân núi m, theo toạ độ sân. */
const footEdge = (m: (typeof MOUNTAINS)[number]) => {
  const pts: { x: number; z: number }[] = []
  for (let i = 0; i <= 20; i++) {
    const t = -1 + i / 10
    pts.push(fromMountain(m, t * MOUNTAIN_FOOT.hx, -MOUNTAIN_FOOT.hz), fromMountain(m, t * MOUNTAIN_FOOT.hx, MOUNTAIN_FOOT.hz))
    pts.push(fromMountain(m, -MOUNTAIN_FOOT.hx, t * MOUNTAIN_FOOT.hz), fromMountain(m, MOUNTAIN_FOOT.hx, t * MOUNTAIN_FOOT.hz))
  }
  return pts
}

test('Khu Chữa Cháy vuông 0.588 (CAD), hai khu ở hai góc phía Hộp Phân Phối, đỏ bên x < 0', () => {
  for (const r of ZONES.fire) { near(w(r), 0.5881, 1e-4); near(d(r), 0.5881, 1e-4) }
  assert.ok(ZONES.fire.every((r) => r.z0 < -FIELD / 2 + 0.005))
  assert.ok(ZONES.fire[0].x1 < 0 && ZONES.fire[1].x0 > 0)
})

test('Bảo Vệ và Tiếp Tế 0.375 x 0.375, Xuất Phát 0.7 x 0.3; đỏ bên x < 0', () => {
  for (const a of ['red', 'blue'] as const) {
    near(w(ZONES.ladder[a]), 0.375, 1e-3); near(d(ZONES.ladder[a]), 0.375, 1e-3)
    near(w(ZONES.load[a]), 0.375, 1e-3); near(d(ZONES.load[a]), 0.375, 1e-3)
    near(w(ZONES.start[a]), 0.7, 1e-3); near(d(ZONES.start[a]), 0.3, 1e-3)
  }
  for (const z of [ZONES.ladder, ZONES.load]) assert.ok(z.red.x1 < 0 && z.blue.x0 > 0)
  assert.ok(ZONES.start.red.x0 < 0 && ZONES.start.blue.x1 > 0)
})

test('mọi Rect có x0<x1 và z0<z1, nằm trong sân', () => {
  const all = [...ZONES.fire, ...Object.values(ZONES.start), ...Object.values(ZONES.load), ...Object.values(ZONES.ladder)]
  for (const r of all) {
    assert.ok(r.x0 < r.x1 && r.z0 < r.z1)
    assert.ok(r.x0 >= -FIELD / 2 - 1e-9 && r.x1 <= FIELD / 2 + 1e-9 && r.z0 >= -FIELD / 2 - 1e-9 && r.z1 <= FIELD / 2 + 1e-9)
  }
})

test('toMountain và fromMountain là nghịch đảo; mountainAt theo hình bao chân đã xoay', () => {
  for (const [i, m] of MOUNTAINS.entries()) {
    const p = fromMountain(m, 0.1, -0.05)
    const q = toMountain(m, p.x, p.z)
    near(q.lx, 0.1); near(q.lz, -0.05)
    assert.equal(mountainAt(m.x, m.z), i)
    assert.equal(mountainAt(fromMountain(m, MOUNTAIN_FOOT.hx - 0.001, 0).x, fromMountain(m, MOUNTAIN_FOOT.hx - 0.001, 0).z), i)
    const outside = fromMountain(m, MOUNTAIN_FOOT.hx + 0.002, 0)
    assert.equal(mountainAt(outside.x, outside.z), -1)
  }
  assert.equal(mountainAt(0, 0), -1)
})

test('4 núi nằm trong sân, không chồng nhau, không chồng Khu Chữa Cháy hay Xuất Phát', () => {
  assert.equal(MOUNTAINS.length, 4)
  const zones = [...ZONES.fire, ZONES.start.red, ZONES.start.blue]
  for (const [i, m] of MOUNTAINS.entries()) {
    for (const p of footEdge(m)) {
      assert.ok(Math.abs(p.x) <= FIELD / 2 && Math.abs(p.z) <= FIELD / 2)
      for (const r of zones) assert.ok(!inside(p.x, p.z, r), `núi ${i} chồng vùng`)
      const o = mountainAt(p.x, p.z)
      assert.ok(o === i || o === -1, `núi ${i} chồng núi ${o}`)
    }
    for (const r of zones) for (const [x, z] of [[r.x0, r.z0], [r.x0, r.z1], [r.x1, r.z0], [r.x1, r.z1]]) assert.equal(mountainAt(x, z), -1)
  }
})

test('tầng núi: đáy rãnh < đỉnh gờ, tăng dần, dưới đỉnh; tầng decor không phải rãnh tính điểm', () => {
  for (const [k, t] of TIERS.entries()) {
    assert.ok(t.floor < t.lip && t.lip < PEAK_Y)
    if (k > 0) assert.ok(t.floor > TIERS[k - 1].lip)
  }
  assert.deepEqual(TIER_GROOVE, [0, -1, 1, 2], 'tầng trang trí không gộp vào rãnh nào (luật V4)')
  assert.ok(HOLE.depth < PEAK_Y - TIERS[TIERS.length - 1].floor + 1e-9)
  assert.ok(Math.hypot(HOLE.lx, HOLE.lz) < 0.02 && HOLE.r > BALL_R)
})

test('lưới núi CAD: chân đúng hình bao, đỉnh ở PEAK_Y, chỉ số hợp lệ', () => {
  const v = mesh.vertices
  let [x0, x1, y0, y1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) {
    x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1])
    z0 = Math.min(z0, v[i + 2]); z1 = Math.max(z1, v[i + 2])
  }
  near(y0, 0, 1e-4); near(y1, PEAK_Y, 1e-4)
  near(x1, MOUNTAIN_FOOT.hx, 0.002); near(-x0, MOUNTAIN_FOOT.hx, 0.002)
  near(z1, MOUNTAIN_FOOT.hz, 0.002); near(-z0, MOUNTAIN_FOOT.hz, 0.002)
  assert.equal(mesh.indices.length % 3, 0)
  assert.ok(mesh.indices.every((i) => i >= 0 && i < v.length / 3))
})

test('Hộp Phân Phối ở mặt trong rào phía xa, cao hơn rào', () => {
  near(DISPENSER.z, -FIELD / 2, 0.002)
  assert.ok(DISPENSER.y > WALL_H && DISPENSER.width > 2 * BALL_R)
})

test('hai robot mỗi liên minh xuất phát trong Khu Xuất Phát, quay mặt vào sân (-z)', () => {
  for (const a of ['red', 'blue'] as const) {
    assert.equal(START_POSES[a].length, 2)
    for (const p of START_POSES[a]) { assert.ok(inside(p.x, p.z, ZONES.start[a])); assert.equal(p.yaw, 0) }
  }
})

test('holeCentres(): một lỗ cờ mỗi núi (A..D), lệch đúng HOLE (lx, lz) khỏi tâm chân trong hệ núi', () => {
  const hs = holeCentres()
  assert.equal(hs.length, MOUNTAINS.length)
  hs.forEach((h, i) => {
    assert.equal(mountainAt(h.x, h.z), i)
    const p = toMountain(MOUNTAINS[i], h.x, h.z)
    near(p.lx, HOLE.lx, 1e-12)
    near(p.lz, HOLE.lz, 1e-12)
  })
})

test('thanh xà theo CAD lắp sân 12/11 (R157): tâm cột cách nhau 1,338 m, ống 1,400 m thò 0,018 / 0,044 (tổng 0,062); vạch ≈ 0,451 m từ tâm cột a, ngay mép Khu Chữa Cháy', () => {
  near(ladderLen('red'), 1.338, 0.001); near(ladderLen('blue'), 1.338, 0.001)
  near(LADDER.rodLen, 1.4, 1e-9)
  near(LADDER.overhang.a + LADDER.overhang.b, 0.062, 0.001)
  near(LADDER.overhang.a, 0.0177, 0.001); near(LADDER.overhang.b, 0.0443, 0.001)
  // Đầu ống Đỏ theo CAD: (−1,2482; −0,2772) → (−0,2582; −1,2671).
  const e0 = pointAt('red', -LADDER.overhang.a)
  const e1 = pointAt('red', ladderLen('red') + LADDER.overhang.b)
  near(e0.x, -1.2482, 0.001); near(e0.z, -0.2772, 0.001)
  near(e1.x, -0.2582, 0.001); near(e1.z, -1.2671, 0.001)
  // Đúng 45°.
  const { a, b } = LADDERS.red
  near(Math.abs(b.x - a.x), Math.abs(b.z - a.z), 0.001)
  // Vạch Đất / Nước: chỗ thanh cắt z = −0,6088 (mép Khu Chữa Cháy), x ≈ −0,917, cách tâm cột a ≈ 0,451 m; băng keo CAD ở
  // x ≈ −0,899 (cách chỗ đó < 0,03 m dọc thanh).
  const d = pointAt('red', LADDER.divider)
  near(d.z, ZONES.fire[0].z1, 1e-9)
  near(d.x, -0.917, 0.002)
  assert.ok(d.x >= ZONES.fire[0].x0 && d.x <= ZONES.fire[0].x1)
  near(LADDER.divider, 0.451, 0.002)
  assert.ok(Math.abs(project('red', -0.899, -0.6267).s - LADDER.divider) < 0.03, 'băng keo CAD gần vạch tính')
})

test('thanh xà CAD: ống Ø20 trục cao 0,6574, cột 20×20 cao 0,638, kẹp Ø35 cao 65 mm phủ y 0,608…0,673', () => {
  near(LADDER.y, 0.6574, 1e-9); near(LADDER.rodR, 0.01, 1e-9)
  near(LADDER.post, 0.02, 1e-9); near(LADDER.postH, 0.638, 1e-9)
  near(LADDER.clampR, 0.0175, 1e-9); near(LADDER.clampH, 0.065, 1e-9)
  near(LADDER.clampY0, 0.608, 1e-9); near(LADDER.clampY0 + LADDER.clampH, 0.673, 1e-9)
  // Kẹp tâm cao 0,6405 như CAD.
  near(LADDER.clampY0 + LADDER.clampH / 2, 0.6405, 1e-9)
  assert.ok(LADDER.y - LADDER.rodR >= LADDER.clampY0 && LADDER.y + LADDER.rodR <= LADDER.clampY0 + LADDER.clampH, 'ống nằm trọn trong kẹp')
})

test('cột theo CAD lắp sân: tâm Đỏ a (−1,2356; −0,2897), b (−0,2895; −1,2358), Xanh a (1,2355; −0,2898), b (0,2894; −1,2358); cả 4 cột ngoài mặt trong rào', () => {
  const want = { red: [[-1.2356, -0.2897], [-0.2895, -1.2358]], blue: [[1.2355, -0.2898], [0.2894, -1.2358]] }
  for (const al of ['red', 'blue'] as const) {
    const [a, b] = want[al]
    near(LADDERS[al].a.x, a[0]); near(LADDERS[al].a.z, a[1]); near(LADDERS[al].b.x, b[0]); near(LADDERS[al].b.z, b[1])
    for (const p of [LADDERS[al].a, LADDERS[al].b]) {
      // Mặt trong của cột (cạnh 20) vẫn ngoài mặt trong rào ±FIELD/2.
      assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) - LADDER.post / 2 >= FIELD / 2, `${al} cột (${p.x}, ${p.z}) lấn vào sân`)
    }
  }
})

test('ô THANG lệch trục thanh ≈ 0,087 m (CAD lắp sân; trước tính tay 9 mm)', () => {
  for (const al of ['red', 'blue'] as const) {
    const z = ZONES.ladder[al]
    near(project(al, (z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2).d, 0.087, 0.005)
  }
})

test('hai thanh xà đối xứng qua x = 0 (CAD lệch nhau ≤ 0,1 mm)', () => {
  const t = 2e-4
  near(LADDERS.blue.a.x, -LADDERS.red.a.x, t); near(LADDERS.blue.a.z, LADDERS.red.a.z, t)
  near(LADDERS.blue.b.x, -LADDERS.red.b.x, t); near(LADDERS.blue.b.z, LADDERS.red.b.z, t)
  near(ladderLen('blue'), ladderLen('red'), t)
  const p = pointAt('red', 0.5)
  const q = pointAt('blue', 0.5)
  near(q.x, -p.x, t); near(q.z, p.z, t)
})

test('thanh xà đi phía trên ô Bảo Vệ (tâm ô cách thanh < 0,19 m)', () => {
  for (const a of ['red', 'blue'] as const) {
    const z = ZONES.ladder[a]
    near(w(z), 0.375, 1e-3)
    const pr = project(a, (z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2)
    assert.ok(pr.d < 0.19, `d = ${pr.d}`)
  }
})
