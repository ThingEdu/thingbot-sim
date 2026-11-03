import { test } from 'node:test'
import assert from 'node:assert/strict'
import { padState, PadFeed, PS2_NEUTRAL, readPads } from './gamepad.ts'

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

test('readPads: theo thứ tự cắm, bỏ chỗ trống của tay đã rút; tay không chuẩn giữ chỗ bằng null', () => {
  const pads = readPads(() => [null, fake([0, -1, 0, 0]), fake([], [], { mapping: '' }), fake([0, 1, 0, 0])])
  assert.equal(pads.length, 3)
  assert.equal(pads[0]!.ps2_PSS_LY, 0)
  assert.equal(pads[1], null)
  assert.equal(pads[2]!.ps2_PSS_LY, 255)
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
