import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreTally, teamScore, type FieldTally } from './scoring.ts'

const T = (g1: number, g2: number, g3: number, o = 0) => [{ g: g1, o }, { g: g2, o: 0 }, { g: g3, o: 0 }]
const z = () => T(0, 0, 0)

test('ví dụ 1 của luật = 175', () => {
  const t: FieldTally = { fire: { o: 12, g: 0 }, mtn: [T(10, 4, 0), z(), z(), z()], flags: [false, false, false, false],
    parks: { red: ['full', 'partial'], blue: ['full', null] } }
  const b = scoreTally(t)
  assert.equal(b.total, 175)
  assert.deepEqual([b.fire, b.r1, b.r2, b.r3, b.flag, b.park, b.wrong], [60, 50, 40, 0, 0, 25, 0])
})

test('ví dụ 2 của luật = 299 (cờ 40 ở núi đủ 3 rãnh, 20 ở núi thiếu rãnh)', () => {
  const t: FieldTally = { fire: { o: 20, g: 2 }, mtn: [T(6, 3, 2), T(5, 0, 0), z(), z()], flags: [true, true, false, false],
    parks: { red: ['full', 'full'], blue: [null, null] } }
  const b = scoreTally(t)
  assert.equal(b.total, 299)
  assert.equal(b.flag, 60)
  assert.equal(b.park, 30)
  assert.equal(b.wrong, -6)
})

test('bóng cam trên núi tính sai vị trí -3', () => {
  const t: FieldTally = { fire: { o: 0, g: 0 }, mtn: [T(0, 0, 0, 2), z(), z(), z()], flags: [false, false, false, false],
    parks: { red: [null, null], blue: [null, null] } }
  assert.equal(scoreTally(t).total, -6)
})

test('cờ không có Mầm Cây nào vẫn +20; chưa cắm cờ thì không điểm cờ', () => {
  const base = (flag: boolean): FieldTally => ({ fire: { o: 0, g: 0 }, mtn: [z(), z(), z(), z()], flags: [flag, false, false, false],
    parks: { red: [null, null], blue: [null, null] } })
  assert.equal(scoreTally(base(true)).flag, 20)
  assert.equal(scoreTally(base(false)).flag, 0)
})

test('bóng xanh tầng trang trí gộp vào mtn[m][0] tính như Rãnh 1', () => {
  const rãnh1 = 3, decor = 2
  const t: FieldTally = { fire: { o: 0, g: 0 }, mtn: [T(rãnh1 + decor, 0, 0), z(), z(), z()], flags: [false, false, false, false],
    parks: { red: [null, null], blue: [null, null] } }
  const b = scoreTally(t)
  assert.equal(b.r1, 25)
  assert.equal(b.total, 25)
})

test('đỗ: một phần 5, toàn phần 10, cả 2 robot toàn phần +10 (mỗi liên minh)', () => {
  const p = (red: ('full' | 'partial' | null)[], blue: ('full' | 'partial' | null)[]): FieldTally =>
    ({ fire: { o: 0, g: 0 }, mtn: [z(), z(), z(), z()], flags: [false, false, false, false], parks: { red, blue } })
  assert.equal(scoreTally(p(['partial', null], [null, null])).park, 5)
  assert.equal(scoreTally(p(['full', 'partial'], [null, null])).park, 15)
  assert.equal(scoreTally(p(['full', 'full'], ['full', 'full'])).park, 60)
})

test('teamScore: 200 / 195 / 190 / 0 và không âm', () => {
  assert.equal(teamScore(200, { minor: 0, yellow: 0, red: false }), 200)
  assert.equal(teamScore(200, { minor: 1, yellow: 0, red: false }), 195)
  assert.equal(teamScore(200, { minor: 0, yellow: 1, red: false }), 190)
  assert.equal(teamScore(200, { minor: 0, yellow: 0, red: true }), 0)
  assert.equal(teamScore(3, { minor: 1, yellow: 0, red: false }), 0)
})
