import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySheet, type EMatch, type HalfSheet, type Result } from './event.ts'
import { halfScore, liveScore, mergeTally, teamPoints, HALF_MTN } from './sheet.ts'
import { CLIMB_EXAMPLE } from '../rules-data.ts'

// Hai nửa sân tái tạo đúng CLIMB_EXAMPLE: 13 cam chia 7 + 6, Núi A đủ 3 rãnh + cờ, Núi B 4 bóng Rãnh 3, Núi C 1 bóng Rãnh 2.
function halves(): { red: HalfSheet; blue: HalfSheet } {
  const red = emptySheet()
  red.fire.o = 7
  red.mtn[0].forEach((x) => (x.g = 1)) // Núi A
  red.flags[0] = true
  red.mtn[1][1].g = 1 // Núi C, Rãnh 2
  red.climbs = ['water', 'ground']
  const blue = emptySheet()
  blue.fire.o = 6
  blue.mtn[0][2].g = 4 // Núi B, Rãnh 3
  blue.climbs = ['water', 'contact']
  return { red, blue }
}
const match: EMatch = { id: 'm1', slot: 0, field: 0, red: ['a', 'b'], blue: ['c', 'd'] }

test('HALF_MTN: đỏ giữ Núi A, C; xanh giữ Núi B, D', () => {
  assert.deepEqual(HALF_MTN, { red: [0, 2], blue: [1, 3] })
})

test('hai nửa ghép lại đúng ví dụ Leo Thang (318)', () => {
  const { red, blue } = halves()
  assert.equal(CLIMB_EXAMPLE.total, 318)
  assert.deepEqual(liveScore(red, blue), CLIMB_EXAMPLE)
  assert.equal(mergeTally(red, blue).mtn.length, 4)
})

test('liveScore thiếu nửa = nửa rỗng', () => {
  const { red } = halves()
  assert.equal(liveScore().total, 0)
  assert.equal(liveScore(red).total, liveScore(red, emptySheet()).total)
})

test('halfScore chỉ tính nửa của mình', () => {
  const { red, blue } = halves()
  assert.equal(halfScore(red, 'red').fire, 35)
  assert.equal(halfScore(blue, 'blue').r3, 60)
  assert.equal(halfScore(blue, 'blue').fire, 30)
})

const result = (): Result => ({ ...halves(), committedAt: 1 })

test('teamPoints: không phạt thì mỗi đội đủ điểm trận, thứ tự đỏ0 đỏ1 xanh0 xanh1', () => {
  const t = teamPoints(result(), match)
  assert.deepEqual(t.map((x) => x.id), ['a', 'b', 'c', 'd'])
  assert.ok(t.every((x) => x.score === 318 && x.penalty === 0))
})

test('thẻ đỏ: đội đó 0 điểm, phạt = cả điểm trận', () => {
  const r = result()
  r.red.pens[1].red = true
  const t = teamPoints(r, match)
  assert.equal(t[1].score, 0)
  assert.equal(t[1].penalty, 318)
  assert.equal(t[0].score, 318)
})

test('một lỗi nhẹ + một vàng ⇒ phạt 15; ghế khác của nửa không bị ảnh hưởng', () => {
  const r = result()
  r.blue.pens[0] = { minor: 1, yellow: 1, red: false, warn: 0 }
  const t = teamPoints(r, match)
  assert.equal(t[2].penalty, 15)
  assert.equal(t[2].score, 303)
  assert.equal(t[3].penalty, 0)
})

test('cảnh cáo không ảnh hưởng điểm; faults chỉ là nhật ký', () => {
  const r = result()
  r.red.pens[0].warn = 3
  r.red.faults.push({ team: 0, code: 'G1', kind: 'red', at: 5 })
  const t = teamPoints(r, match)
  assert.equal(t[0].penalty, 0)
  assert.equal(t[0].score, 318)
})

test('bỏ ghế null', () => {
  const t = teamPoints(result(), { ...match, red: ['a', null], blue: [null, 'd'] })
  assert.deepEqual(t.map((x) => x.id), ['a', 'd'])
  assert.equal(t[1].score, 318)
})
