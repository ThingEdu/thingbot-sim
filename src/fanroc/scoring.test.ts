import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreTally, teamScore, type FieldTally } from './scoring.ts'
import type { Climb } from './ladder.ts'

const T = (g1: number, g2: number, g3: number, o = 0) => [{ g: g1, o }, { g: g2, o: 0 }, { g: g3, o: 0 }]
const z = () => T(0, 0, 0)
const NONE = (): FieldTally['climbs'] => ({ red: ['none', 'none'], blue: ['none', 'none'] })
const tally = (p: Partial<FieldTally> = {}): FieldTally =>
  ({ fire: { o: 0, g: 0 }, mtn: [z(), z(), z(), z()], decorO: 0, flags: [false, false, false, false], climbs: NONE(), ...p })
const climbs = (red: Climb[], blue: Climb[]): FieldTally['climbs'] => ({ red, blue })

test('ví dụ luật V4: điểm nhiệm vụ 205, leo [Nước, Nước, Đất, Chạm] ⇒ hệ số 155 %, điểm trận ⌈205 × 1,55⌉ = 318', () => {
  const b = scoreTally(tally({ fire: { o: 41, g: 0 }, climbs: climbs(['water', 'water'], ['ground', 'contact']) }))
  assert.equal(b.mission, 205)
  assert.equal(b.multPct, 155)
  assert.equal(b.total, 318)
})

test('hệ số nhân: không ai leo = 100 %, đủ 4 robot treo Nước = 180 %', () => {
  assert.equal(scoreTally(tally({ fire: { o: 1, g: 0 } })).multPct, 100)
  const b = scoreTally(tally({ fire: { o: 2, g: 0 }, climbs: climbs(['water', 'water'], ['water', 'water']) }))
  assert.equal(b.multPct, 180)
  assert.equal(b.total, 18)
})

test('điểm nhiệm vụ 0 ⇒ điểm trận 0 (không phải −0) dù có robot treo', () => {
  const b = scoreTally(tally({ climbs: climbs(['water', 'ground'], ['contact', 'none']) }))
  assert.equal(b.mission, 0)
  assert.ok(Object.is(b.total, 0), `total = ${b.total}`)
})

test('điểm nhiệm vụ âm (−6) với hệ số 120 % ⇒ giữ nguyên −6', () => {
  const b = scoreTally(tally({ fire: { o: 0, g: 2 }, climbs: climbs(['water', 'none'], ['none', 'none']) }))
  assert.equal(b.multPct, 120)
  assert.equal(b.mission, -6)
  assert.equal(b.total, -6)
})

test('ví dụ 1 và 2 cũ (bỏ phần đỗ): điểm nhiệm vụ 150 và 269, không leo ⇒ điểm trận bằng điểm nhiệm vụ', () => {
  const b1 = scoreTally(tally({ fire: { o: 12, g: 0 }, mtn: [T(10, 4, 0), z(), z(), z()] }))
  assert.deepEqual([b1.fire, b1.r1, b1.r2, b1.r3, b1.flag, b1.wrong, b1.mission, b1.total], [60, 50, 40, 0, 0, 0, 150, 150])
  const b2 = scoreTally(tally({ fire: { o: 20, g: 2 }, mtn: [T(6, 3, 2), T(5, 0, 0), z(), z()], flags: [true, true, false, false] }))
  assert.equal(b2.flag, 60)
  assert.equal(b2.wrong, -6)
  assert.equal(b2.total, 269)
})

test('bóng cam trên Rãnh 1 / Rãnh 2 tính sai vị trí −3 mỗi bóng', () => {
  assert.equal(scoreTally(tally({ mtn: [T(0, 0, 0, 2), z(), z(), z()] })).total, -6)
  const r2: FieldTally['mtn'] = [z(), z(), z(), z()]
  r2[2][1].o = 1
  const b = scoreTally(tally({ mtn: r2 }))
  assert.equal(b.wrong, -3)
  assert.equal(b.r2, 0)
})

test('tầng trang trí: 2 xanh + 1 cam ⇒ bóng xanh không tính (r1 0), bóng cam −3', () => {
  // world.tally bỏ bóng xanh ở tầng trang trí, chỉ đếm cam vào decorO.
  const b = scoreTally(tally({ decorO: 1 }))
  assert.equal(b.r1, 0)
  assert.equal(b.wrong, -3)
  assert.equal(b.total, -3)
})

test('cờ không có Mầm Cây nào vẫn +20; chưa cắm cờ thì không điểm cờ', () => {
  assert.equal(scoreTally(tally({ flags: [true, false, false, false] })).flag, 20)
  assert.equal(scoreTally(tally()).flag, 0)
})

test('teamScore: 200 / 195 / 190 / 0, không âm; 318 − thẻ vàng = 308', () => {
  assert.equal(teamScore(200, { minor: 0, yellow: 0, red: false }), 200)
  assert.equal(teamScore(200, { minor: 1, yellow: 0, red: false }), 195)
  assert.equal(teamScore(200, { minor: 0, yellow: 1, red: false }), 190)
  assert.equal(teamScore(200, { minor: 0, yellow: 0, red: true }), 0)
  assert.equal(teamScore(3, { minor: 1, yellow: 0, red: false }), 0)
  assert.equal(teamScore(318, { minor: 0, yellow: 1, red: false }), 308)
})
