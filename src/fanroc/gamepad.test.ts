import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hatPad, padState, PadFeed, PadSeats, PS2_NEUTRAL } from './gamepad.ts'

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

/** Tay giả PS2 cắm USB như Chrome macOS báo (đo trên tay thật): 12 nút, 10 trục, mũ ở trục 9 đứng yên 3,29. */
const ps2usb = (axes: Record<number, number> = {}, pressed: number[] = []) => ({
  connected: true,
  mapping: '' as GamepadMappingType,
  id: ' USB Gamepad           (Vendor: 0810 Product: 0001)',
  axes: Array.from({ length: 10 }, (_, i) => axes[i] ?? (i === 9 ? 3.29 : 0)),
  buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 })),
})

test('padState: tay giả PS2 USB 0810:0001 — △ ○ ✕ □ = 0 1 2 3, cần phải ở trục 5 / 2, mũi tên là trục mũ 9', () => {
  const s = padState(ps2usb({ 0: 1, 5: -1, 2: 1, 9: -1 }, [0, 2, 6]))!
  assert.ok(s)
  assert.equal(s.ps2_PSB_TRIANGLE, 1)
  assert.equal(s.ps2_PSB_CROSS, 1)
  assert.equal(s.ps2_PSB_L2, 1)
  assert.equal(s.ps2_PSB_CIRCLE, 0)
  assert.equal(s.ps2_PSS_LX, 255)
  assert.equal(s.ps2_PSS_RX, 0)
  assert.equal(s.ps2_PSS_RY, 255)
  assert.equal(s.ps2_PSB_PAD_UP, 1)
  assert.equal(s.ps2_PSB_PAD_DOWN, 0)
  const idle = padState(ps2usb())!
  assert.equal(idle.ps2_PSS_LX, 128)
  assert.deepEqual([idle.ps2_PSB_PAD_UP, idle.ps2_PSB_PAD_RIGHT, idle.ps2_PSB_PAD_DOWN, idle.ps2_PSB_PAD_LEFT], [0, 0, 0, 0])
  // Mọi khoá của bố cục chuẩn đều có (bo ảo không thiếu khoá nào).
  assert.deepEqual(Object.keys(s).sort(), Object.keys(PS2_NEUTRAL).sort())
})

test('hatPad: 8 hướng đo trên tay thật, chéo bấm cả hai, đứng yên không bấm gì', () => {
  const d = (v: number) => Object.entries(hatPad(v)).filter(([, on]) => on).map(([k]) => k).join('+')
  assert.equal(d(3.29), '')
  assert.equal(d(-1), 'up')
  assert.equal(d(-0.43), 'right')
  assert.equal(d(0.14), 'down')
  assert.equal(d(0.71), 'left')
  assert.equal(d(-0.71), 'up+right')
  assert.equal(d(1), 'up+left')
})

test('padState: tay lạ không chuẩn khác vẫn null', () => {
  assert.equal(padState({ ...ps2usb(), id: 'Generic (Vendor: 1234 Product: 5678)' }), null)
})
