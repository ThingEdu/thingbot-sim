import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySheet, type HalfSheet } from './event.ts'
import { addFault, bump, reconcile, removeFault } from './refmodel.ts'
import { sanitizeSheet } from './validate.ts'

const sheetFire = (o: number): HalfSheet => ({ ...emptySheet(), fire: { o, g: 0 } })
const view = (id: string | null, sheet: HalfSheet, ackSeq: number) => ({ match: id ? { id } : null, sheet, ackSeq })

test('reconcile: trận khác ⇒ lấy phiếu BTC, bỏ bản chờ', () => {
  const r = reconcile({ matchId: 'm1', sheet: sheetFire(5) }, { seq: 4, matchId: 'm1' }, view('m2', sheetFire(0), 0))
  assert.deepEqual(r, { matchId: 'm2', sheet: sheetFire(0), drop: true, ack: null, resend: false })
})

test('reconcile: cùng trận, không có bản chờ ⇒ lấy phiếu BTC', () => {
  const r = reconcile({ matchId: 'm1', sheet: sheetFire(5) }, null, view('m1', sheetFire(7), 3))
  assert.deepEqual(r, { matchId: 'm1', sheet: sheetFire(7), drop: false, ack: null, resend: false })
})

test('reconcile: BTC đã nhận seq chờ (ackSeq ≥ seq) ⇒ lấy phiếu BTC và ack', () => {
  const r = reconcile({ matchId: 'm1', sheet: sheetFire(5) }, { seq: 4, matchId: 'm1' }, view('m1', sheetFire(5), 4))
  assert.deepEqual(r, { matchId: 'm1', sheet: sheetFire(5), drop: false, ack: 4, resend: false })
})

test('reconcile: BTC chưa nhận bản chờ ⇒ giữ phiếu máy, gửi lại', () => {
  const local = { matchId: 'm1', sheet: sheetFire(5) }
  const r = reconcile(local, { seq: 4, matchId: 'm1' }, view('m1', sheetFire(2), 3))
  assert.deepEqual(r, { matchId: 'm1', sheet: sheetFire(5), drop: false, ack: null, resend: true })
})

test('reconcile: chưa có trận (idle) ⇒ phiếu rỗng của BTC, bỏ bản chờ', () => {
  const r = reconcile({ matchId: 'm1', sheet: sheetFire(5) }, { seq: 4, matchId: 'm1' }, view(null, emptySheet(), 0))
  assert.deepEqual(r, { matchId: null, sheet: emptySheet(), drop: true, ack: null, resend: false })
})

test('bump: kẹp trong 0..300', () => {
  assert.equal(bump(0, -1), 0)
  assert.equal(bump(4, 1), 5)
  assert.equal(bump(300, 1), 300)
})

test('addFault / removeFault: thêm lỗi tăng đúng bộ đếm phạt, xoá thì trả lại; thẻ đỏ theo các lỗi còn lại', () => {
  let s = emptySheet()
  s = addFault(s, 0, 'P12', 'minor', 1)!
  s = addFault(s, 1, 'S02', 'yellow', 2)!
  s = addFault(s, 1, 'Khác', 'red', 3)!
  s = addFault(s, 1, 'G15', 'red', 4)!
  s = addFault(s, 0, 'P10', 'warn', 5)!
  assert.deepEqual(s.pens[0], { minor: 1, yellow: 0, red: false, warn: 1 })
  assert.deepEqual(s.pens[1], { minor: 0, yellow: 1, red: true, warn: 0 })
  assert.equal(s.faults.length, 5)
  assert.ok(sanitizeSheet(s))
  s = removeFault(s, 2)
  assert.equal(s.pens[1].red, true) // còn một thẻ đỏ
  s = removeFault(s, 2)
  assert.equal(s.pens[1].red, false)
  s = removeFault(s, 0)
  assert.deepEqual(s.pens[0], { minor: 0, yellow: 0, red: false, warn: 1 })
  assert.deepEqual(s.faults.map((f) => f.code), ['S02', 'P10'])
})

test('addFault: tối đa 50 lỗi và 20 mỗi loại ⇒ null (phiếu luôn qua sanitizeSheet)', () => {
  let s = emptySheet()
  for (let i = 0; i < 20; i++) s = addFault(s, 0, 'P12', 'minor', i)!
  assert.equal(addFault(s, 0, 'P12', 'minor', 99), null)
  for (let i = 0; i < 20; i++) s = addFault(s, 1, 'P12', 'warn', i)!
  for (let i = 0; i < 10; i++) s = addFault(s, 1, 'S02', 'yellow', i)!
  assert.equal(s.faults.length, 50)
  assert.equal(addFault(s, 0, 'S02', 'red', 99), null)
  assert.ok(sanitizeSheet(s))
  assert.equal(addFault(emptySheet(), 0, 'X'.repeat(17), 'warn', 1), null)
})
