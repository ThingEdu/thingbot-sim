import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySheet, type HalfSheet } from './event.ts'
import { RefQueue, refKey } from './refqueue.ts'

const memStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}
const sheetFire = (o: number): HalfSheet => ({ ...emptySheet(), fire: { o, g: 0 } })
const KEY = refKey(0, 'red')

test('refKey: khoá fanroc.v1.btc.ref.<sân>.<bên>', () => {
  assert.equal(KEY, 'fanroc.v1.btc.ref.0.red')
  assert.equal(refKey(2, 'blue'), 'fanroc.v1.btc.ref.2.blue')
})

test('RefQueue: push 3 lần không ack ⇒ pending seq 3, phiếu mới nhất; ack(3) ⇒ null', () => {
  const s = memStore()
  const q = new RefQueue(s, KEY)
  assert.equal(q.pending(), null)
  assert.deepEqual(q.push('m1', sheetFire(1), false, 'e1'), { seq: 1 })
  assert.deepEqual(q.push('m1', sheetFire(2), false, 'e1'), { seq: 2 })
  assert.deepEqual(q.push('m1', sheetFire(3), false, 'e1'), { seq: 3 })
  const p = q.pending()
  assert.equal(p?.seq, 3)
  assert.equal(p?.matchId, 'm1')
  assert.equal(p?.sheet.fire.o, 3)
  assert.equal(p?.submit, false)
  q.ack(3)
  assert.equal(q.pending(), null)
})

test('RefQueue: tạo lại trên cùng kho ⇒ seq tiếp 4, bản chưa ack còn nguyên', () => {
  const s = memStore()
  const q = new RefQueue(s, KEY)
  q.push('m1', sheetFire(1), false, 'e1')
  q.push('m1', sheetFire(2), false, 'e1')
  q.push('m1', sheetFire(3), false, 'e1')
  const again = new RefQueue(s, KEY)
  assert.equal(again.pending()?.seq, 3)
  assert.equal(again.pending()?.sheet.fire.o, 3)
  assert.deepEqual(again.push('m1', sheetFire(4), false, 'e1'), { seq: 4 })
  again.ack(4)
  assert.deepEqual(new RefQueue(s, KEY).push('m1', sheetFire(5), false, 'e1'), { seq: 5 })
})

test('RefQueue: ack(2) khi đang chờ 3 ⇒ vẫn chờ 3', () => {
  const q = new RefQueue(memStore(), KEY)
  q.push('m1', sheetFire(1), false, 'e1')
  q.push('m1', sheetFire(2), false, 'e1')
  q.push('m1', sheetFire(3), false, 'e1')
  q.ack(2)
  assert.equal(q.pending()?.seq, 3)
})

test('RefQueue: drop bỏ bản chờ nhưng seq vẫn tăng; bản gửi kiểm kê chưa ack không bị bản sửa sau xoá cờ submit', () => {
  const s = memStore()
  const q = new RefQueue(s, KEY)
  q.push('m1', sheetFire(1), true, 'e1')
  q.push('m1', sheetFire(2), false, 'e1')
  assert.equal(q.pending()?.submit, true)
  q.drop()
  assert.equal(q.pending(), null)
  assert.equal(new RefQueue(s, KEY).pending(), null)
  assert.deepEqual(q.push('m2', sheetFire(1), false, 'e1'), { seq: 3 })
  assert.equal(q.pending()?.submit, false)
})

test('RefQueue: floor nâng seq (BTC đã thấy seq cao hơn từ máy này)', () => {
  const q = new RefQueue(memStore(), KEY)
  q.floor(9)
  assert.deepEqual(q.push('m1', sheetFire(1), false, 'e1'), { seq: 10 })
  q.floor(4)
  assert.deepEqual(q.push('m1', sheetFire(1), false, 'e1'), { seq: 11 })
})

test('RefQueue: kho hỏng / ném lỗi ⇒ chạy trong bộ nhớ, không ném', () => {
  const bad = { getItem: () => { throw new Error('chặn') }, setItem: () => { throw new Error('chặn') } }
  const q = new RefQueue(bad, KEY)
  assert.deepEqual(q.push('m1', sheetFire(1), false, 'e1'), { seq: 1 })
  assert.equal(q.pending()?.seq, 1)
  const junk = { getItem: () => '{"seq":"x","pending":5}', setItem: () => {} }
  assert.deepEqual(new RefQueue(junk, KEY).push('m1', sheetFire(1), false, 'e1'), { seq: 1 })
})

test('RefQueue: bản chờ ghi id giải; tạo lại trên cùng kho vẫn giữ id giải', () => {
  const s = memStore()
  new RefQueue(s, KEY).push('m1', sheetFire(1), false, 'giai-1')
  assert.equal(new RefQueue(s, KEY).pending()?.event, 'giai-1')
})

test('RefQueue: bản chờ đã lưu có phiếu hỏng hoặc thiếu id giải ⇒ bỏ bản chờ (seq giữ)', () => {
  const s = memStore()
  const bad = { ...sheetFire(1), decorO: -5 }
  s.m.set(KEY, JSON.stringify({ seq: 7, pending: { seq: 7, matchId: 'm1', sheet: bad, submit: true, event: 'e1' } }))
  const q = new RefQueue(s, KEY)
  assert.equal(q.pending(), null, 'phiếu hỏng ⇒ bỏ')
  assert.deepEqual(q.push('m1', sheetFire(1), false, 'e1'), { seq: 8 })
  s.m.set(KEY, JSON.stringify({ seq: 3, pending: { seq: 3, matchId: 'm1', sheet: { ...sheetFire(1), extra: 1 }, submit: false, event: 'e1' } }))
  assert.equal(new RefQueue(s, KEY).pending()?.sheet.fire.o, 1, 'phiếu đúng ⇒ giữ (bản sạch)')
  assert.equal('extra' in new RefQueue(s, KEY).pending()!.sheet, false)
  s.m.set(KEY, JSON.stringify({ seq: 3, pending: { seq: 3, matchId: 'm1', sheet: sheetFire(1), submit: false } }))
  assert.equal(new RefQueue(s, KEY).pending(), null, 'thiếu id giải ⇒ bỏ')
})

test('RefQueue: bản gửi kiểm kê của giải khác không giữ cờ submit cho bản mới', () => {
  const q = new RefQueue(memStore(), KEY)
  q.push('m1', sheetFire(1), true, 'e1')
  q.push('m1', sheetFire(2), false, 'e2')
  assert.equal(q.pending()?.submit, false)
})
