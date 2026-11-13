import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardText, padLine, type CardInfo } from './robotcard.ts'
import { deadZoneLines } from '../view/hud.ts'
import { NEUTRAL } from '../ports.ts'

const base: CardInfo = { player: 'Bạn 1', robot: 'Mẫu Maker · 2 bánh', program: 'Của em v2', input: 'Bàn phím', pad: { n: 1, status: 'none' }, held: 2, storage: 6, warnings: [] }

test('cardText: tên robot, nhãn chương trình, cách lái + bóng; không tay cầm ⇒ không dòng tay cầm', () => {
  assert.deepEqual(cardText(base), ['Bạn 1 · Mẫu Maker · 2 bánh', 'Chương trình: Của em v2', 'Lái: Bàn phím · bóng 2/6'])
})

test('cardText: tay rút ra / sai bố cục và cảnh báo vùng chết hiện trên thẻ', () => {
  const warn = deadZoneLines({ ...NEUTRAL, M1: 10 })
  const lines = cardText({ ...base, input: 'Tay PS2', pad: { n: 1, status: 'lost' }, warnings: warn })
  assert.equal(lines[2], 'Lái: Tay PS2 · bóng 2/6')
  assert.match(lines[3], /^Tay cầm 1 đã rút ra/)
  assert.equal(lines[4], 'M1 = 10 % < 20 %: động cơ TT không quay')
  assert.match(padLine(2, 'nonstandard')!, /Tay cầm 2 không đúng bố cục chuẩn/)
  assert.equal(padLine(1, 'ok'), null)
})

test('WarningHold: dòng cảnh báo không nháy — ở lại WARN_HOLD_MS sau lần cuối, số % đổi tối đa một lần mỗi WARN_HOLD_MS', async () => {
  const { WarningHold, WARN_HOLD_MS } = await import('./robotcard.ts')
  const h = new WarningHold()
  const a = 'M1 = 12 % < 20 %: động cơ TT không quay'
  const b = 'M1 = 15 % < 20 %: động cơ TT không quay'
  assert.deepEqual(h.update(0, [a]), [a])
  assert.deepEqual(h.update(16, []), [a], 'tắt một khung hình vẫn còn')
  assert.deepEqual(h.update(32, [b]), [a], 'chưa đủ thời gian thì chưa đổi số')
  assert.deepEqual(h.update(WARN_HOLD_MS, [b]), [b])
  assert.deepEqual(h.update(2 * WARN_HOLD_MS - 1, []), [b])
  assert.deepEqual(h.update(2 * WARN_HOLD_MS, []), [])
})

test('hai bạn (0.9.1): thẻ ghi phím lái của bạn đó khi lái bàn phím; tay PS2 thì không', () => {
  assert.equal(cardText({ ...base, keys: 'W A S D' })[2], 'Lái: Bàn phím W A S D · bóng 2/6')
  assert.equal(cardText({ ...base, keys: '↑ ← ↓ →', input: 'Tay PS2' })[2], 'Lái: Tay PS2 · bóng 2/6')
  assert.equal(cardText(base)[2], 'Lái: Bàn phím · bóng 2/6')
})
