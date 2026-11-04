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
