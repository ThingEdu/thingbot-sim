import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FIELD, MOUNTAIN_HALF, MOUNTAINS, START_POSES, ZONES, type Rect } from './layout.ts'

const w = (r: Rect) => r.x1 - r.x0
const d = (r: Rect) => r.z1 - r.z0
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
const inside = (x: number, z: number, r: Rect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1

test('Khu Chữa Cháy 0.6 x 0.6, hai khu ở hai góc xa Khu Điều Khiển', () => {
  for (const r of ZONES.fire) { near(w(r), 0.6); near(d(r), 0.6) }
  assert.ok(ZONES.fire.every((r) => r.z0 === -FIELD / 2))
})

test('Bảo Vệ và Tiếp Tế 0.375 x 0.375, Xuất Phát 0.7 x 0.3', () => {
  for (const a of ['red', 'blue'] as const) {
    near(w(ZONES.safe[a]), 0.375); near(d(ZONES.safe[a]), 0.375)
    near(w(ZONES.load[a]), 0.375); near(d(ZONES.load[a]), 0.375)
    near(w(ZONES.start[a]), 0.7); near(d(ZONES.start[a]), 0.3)
  }
})

test('mọi Rect có x0<x1 và z0<z1, nằm trong sân', () => {
  const all = [...ZONES.fire, ...Object.values(ZONES.start), ...Object.values(ZONES.load), ...Object.values(ZONES.safe)]
  for (const r of all) {
    assert.ok(r.x0 < r.x1 && r.z0 < r.z1)
    assert.ok(r.x0 >= -FIELD / 2 - 1e-9 && r.x1 <= FIELD / 2 + 1e-9 && r.z0 >= -FIELD / 2 - 1e-9 && r.z1 <= FIELD / 2 + 1e-9)
  }
})

test('4 núi nằm trong sân và cách tâm nhau >= 0.4 m', () => {
  assert.equal(MOUNTAINS.length, 4)
  for (const m of MOUNTAINS) {
    assert.ok(Math.abs(m.x) + MOUNTAIN_HALF <= FIELD / 2 && Math.abs(m.z) + MOUNTAIN_HALF <= FIELD / 2)
  }
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    assert.ok(Math.hypot(MOUNTAINS[i].x - MOUNTAINS[j].x, MOUNTAINS[i].z - MOUNTAINS[j].z) >= 0.4)
  }
})

test('núi không chồng lên Khu Chữa Cháy hay Xuất Phát', () => {
  const zones = [...ZONES.fire, ZONES.start.red, ZONES.start.blue]
  for (const m of MOUNTAINS) for (const r of zones) {
    const overlap = m.x + MOUNTAIN_HALF > r.x0 && m.x - MOUNTAIN_HALF < r.x1 && m.z + MOUNTAIN_HALF > r.z0 && m.z - MOUNTAIN_HALF < r.z1
    assert.ok(!overlap)
  }
})

test('hai robot mỗi liên minh xuất phát trong Khu Xuất Phát, quay mặt vào sân (-z)', () => {
  for (const a of ['red', 'blue'] as const) {
    assert.equal(START_POSES[a].length, 2)
    for (const p of START_POSES[a]) { assert.ok(inside(p.x, p.z, ZONES.start[a])); assert.equal(p.yaw, 0) }
  }
})
