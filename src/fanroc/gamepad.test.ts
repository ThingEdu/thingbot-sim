import { test } from 'node:test'
import assert from 'node:assert/strict'
import { padState, PadFeed, PadSeats, PS2_NEUTRAL } from './gamepad.ts'

/** Tay giả theo bố cục chuẩn: `axes` −1…1, `pressed` là số nút đang giữ. */
const fake = (axes = [0, 0, 0, 0], pressed: number[] = [], over: object = {}) => ({
  connected: true,
  mapping: 'standard' as GamepadMappingType,
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 })),
  ...over,
})

test('padState: bố cục chuẩn → khoá ps2_*: ✕ = nút 0, R1 = 5, ▲ = 12; cần −1…1 → 0…255, giữa 128', () => {
  const s = padState(fake([0, -1, 1, 0], [0, 5, 12]))!
  assert.equal(s.ps2_PSB_CROSS, 1)
  assert.equal(s.ps2_PSB_R1, 1)
  assert.equal(s.ps2_PSB_PAD_UP, 1)
  assert.equal(s.ps2_PSB_CIRCLE, 0)
  assert.deepEqual([s.ps2_PSS_LX, s.ps2_PSS_LY, s.ps2_PSS_RX, s.ps2_PSS_RY], [128, 0, 255, 128])
  assert.deepEqual(Object.keys(s).sort(), Object.keys(PS2_NEUTRAL).sort())
})

test('padState: tay không theo bố cục chuẩn hoặc đã ngắt ⇒ null', () => {
  assert.equal(padState(fake([0, -1, 0, 0], [], { mapping: '' })), null)
  assert.equal(padState(fake([0, -1, 0, 0], [], { connected: false })), null)
  assert.equal(padState(null), null)
})

const at = (index: number, ly: number, over: object = {}) => ({ ...fake([0, ly, 0, 0]), index, id: `pad ${index}`, ...over })

test('R26: [A, B] → [null, B] ⇒ Robot 1 trung tính, Robot 2 vẫn nhận B; cắm lại A ⇒ A về Robot 1', () => {
  const seats = new PadSeats()
  const A = at(0, -1)
  const B = at(1, 1)
  const first = seats.read(() => [A, B])
  assert.deepEqual([first.pads[0]!.ps2_PSS_LY, first.pads[1]!.ps2_PSS_LY], [0, 255])
  const lost = seats.read(() => [null, B])
  assert.equal(lost.pads[0], null)
  assert.equal(lost.pads[1]!.ps2_PSS_LY, 255)
  assert.deepEqual(lost.status, ['lost', 'ok'])
  // Tay khác cắm vào lúc ghế 1 mất tay: không lấy ghế 1, không dồn ghế 2.
  const C = at(2, 0.5)
  const other = seats.read(() => [null, B, C])
  assert.equal(other.pads[0], null)
  assert.equal(other.pads[1]!.ps2_PSS_LY, 255)
  const back = seats.read(() => [A, B, C])
  assert.deepEqual([back.pads[0]!.ps2_PSS_LY, back.pads[1]!.ps2_PSS_LY], [0, 255])
  assert.deepEqual(back.status, ['ok', 'ok'])
})

test('PadSeats: ghế theo thứ tự cắm (không theo index); ghế chưa có tay là none; tay không chuẩn giữ ghế, null', () => {
  const seats = new PadSeats()
  assert.deepEqual(seats.read(() => []).status, ['none', 'none'])
  const late = at(3, 1)
  assert.equal(seats.read(() => [null, null, null, late]).pads[0]!.ps2_PSS_LY, 255)
  assert.deepEqual(seats.read(() => [null, null, null, late]).status, ['ok', 'none'], 'một tay chỉ giữ một ghế')
  const odd = at(0, -1, { mapping: '' })
  const r = seats.read(() => [odd, null, null, late])
  assert.deepEqual(r.status, ['ok', 'nonstandard'])
  assert.equal(r.pads[1], null)
})

test('PadFeed: lần đầu gửi đủ mọi khoá, sau đó chỉ khoá đổi; tay rút (null) ⇒ gửi đủ mọi khoá về trung tính (Review Focus 1)', () => {
  const feed = new PadFeed()
  const up = padState(fake([0, -1, 0, -1], [5]))!
  assert.deepEqual(feed.next(up), up)
  assert.deepEqual(feed.next(up), {})
  assert.deepEqual(feed.next({ ...up, ps2_PSB_R1: 0 }), { ps2_PSB_R1: 0 })
  assert.deepEqual(feed.next(null), PS2_NEUTRAL)
  assert.deepEqual(feed.next(null), {})
  feed.reset()
  assert.deepEqual(feed.next(null), PS2_NEUTRAL)
})
