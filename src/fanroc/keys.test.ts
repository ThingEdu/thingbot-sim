import { test } from 'node:test'
import assert from 'node:assert/strict'
import { KeyPad, layoutFor, mergePad, typing } from './keys.ts'
import { PS2_NEUTRAL } from './gamepad.ts'

const press = (layout: 'solo' | 'left' | 'right', drive: 'diff2' | 'omni' | 'mecanum', ...codes: string[]) => {
  const p = new KeyPad(layout)
  for (const c of codes) p.down(c)
  return p.state(drive)
}

test('diff2: trộn W/S/A/D theo spec §8.4', () => {
  const rows: [string[], number, number][] = [
    [['KeyW'], 0, 0], [['KeyS'], 255, 255], [['KeyA'], 255, 0], [['KeyD'], 0, 255],
    [['KeyW', 'KeyA'], 128, 0], [['KeyW', 'KeyD'], 0, 128], [['KeyS', 'KeyA'], 255, 128], [['KeyS', 'KeyD'], 128, 255],
    [[], 128, 128], [['ArrowUp'], 0, 0], [['KeyW', 'KeyS'], 128, 128],
  ]
  for (const [keys, ly, ry] of rows) {
    const s = press('solo', 'diff2', ...keys)
    assert.equal(s.ps2_PSS_LY, ly, `LY ${keys}`)
    assert.equal(s.ps2_PSS_RY, ry, `RY ${keys}`)
  }
})

test('omni/mecanum: W/S → LY, A/D → RX, Q/E → LX', () => {
  for (const d of ['omni', 'mecanum'] as const) {
    assert.equal(press('solo', d, 'KeyW').ps2_PSS_LY, 0)
    assert.equal(press('solo', d, 'KeyS').ps2_PSS_LY, 255)
    assert.equal(press('solo', d, 'KeyA').ps2_PSS_RX, 0)
    assert.equal(press('solo', d, 'KeyD').ps2_PSS_RX, 255)
    assert.equal(press('solo', d, 'KeyQ').ps2_PSS_LX, 0)
    assert.equal(press('solo', d, 'KeyE').ps2_PSS_LX, 255)
    assert.equal(press('solo', d).ps2_PSS_LY, 128)
  }
})

test('nút ảo và mọi khoá như PS2_NEUTRAL', () => {
  assert.equal(press('solo', 'diff2', 'KeyI').ps2_PSB_TRIANGLE, 1)
  assert.equal(press('solo', 'diff2', 'KeyP').ps2_PSB_R2, 1)
  assert.equal(press('left', 'diff2', 'KeyR').ps2_PSB_TRIANGLE, 1)
  assert.equal(press('left', 'diff2', 'Digit3').ps2_PSB_L2, 1)
  assert.deepEqual(Object.keys(press('solo', 'diff2')).sort(), Object.keys(PS2_NEUTRAL).sort())
})

test('releaseAll → trung tính; up nhả từng phím', () => {
  const p = new KeyPad('solo')
  p.down('KeyW'); p.down('KeyI')
  assert.equal(p.active(), true)
  p.up('KeyW')
  assert.equal(p.state('diff2').ps2_PSS_LY, 128)
  p.down('KeyW'); p.releaseAll()
  assert.deepEqual(p.state('diff2'), { ...PS2_NEUTRAL })
  assert.equal(p.active(), false)
})

test('chia đôi bàn phím: left không nhận mũi tên, right không nhận W', () => {
  const l = new KeyPad('left'), r = new KeyPad('right')
  assert.equal(l.down('ArrowUp'), false)
  assert.equal(r.down('KeyW'), false)
  assert.equal(l.down('KeyW'), true)
  assert.equal(r.down('ArrowUp'), true)
  assert.equal(r.down('Comma'), true)
  assert.equal(press('right', 'omni', 'Period').ps2_PSS_LX, 255)
  assert.equal(l.state('diff2').ps2_PSS_LY, 0)
  assert.equal(r.state('diff2').ps2_PSS_LY, 0)
})

test('mergePad: tay thật thắng khi có cần lệch / nút bấm', () => {
  const virt = press('solo', 'diff2', 'KeyW')
  assert.deepEqual(mergePad(null, virt), virt)
  assert.deepEqual(mergePad({ ...PS2_NEUTRAL }, virt), virt)
  const real = { ...PS2_NEUTRAL, ps2_PSS_LY: 0 }
  assert.deepEqual(mergePad(real, press('solo', 'diff2', 'KeyS')), real)
  const btn = { ...PS2_NEUTRAL, ps2_PSB_CROSS: 1 }
  assert.deepEqual(mergePad(btn, virt), btn)
})

test('typing: ô nhập / vùng soạn thảo / ô chọn / ô sửa của Blockly ⇒ đang gõ; nút, thân trang ⇒ không', () => {
  const cls = (...c: string[]) => ({ contains: (x: string) => c.includes(x) })
  assert.equal(typing({ tagName: 'INPUT' }), true)
  assert.equal(typing({ tagName: 'textarea' }), true)
  assert.equal(typing({ tagName: 'SELECT' }), true)
  assert.equal(typing({ tagName: 'DIV', isContentEditable: true }), true)
  assert.equal(typing({ tagName: 'INPUT', classList: cls('blocklyHtmlInput') }), true)
  assert.equal(typing({ tagName: 'DIV', classList: cls('blocklyHtmlInput') }), true)
  assert.equal(typing({ tagName: 'BUTTON', classList: cls('hm-tile') }), false)
  assert.equal(typing({ tagName: 'BODY', isContentEditable: false }), false)
  assert.equal(typing(null), false)
})

test('layoutFor: một bạn solo; hai bạn: bạn 1 nửa trái, bạn 2 nửa phải', () => {
  assert.equal(layoutFor(0, false), 'solo')
  assert.equal(layoutFor(1, false), 'solo')
  assert.equal(layoutFor(0, true), 'left')
  assert.equal(layoutFor(1, true), 'right')
})

test('một bạn: phím số 1 = △, 2 = ○, 3 = ✕, 4 = □ (anh Tuấn 10/11)', () => {
  const want: [string, string][] = [['Digit1', 'TRIANGLE'], ['Digit2', 'CIRCLE'], ['Digit3', 'CROSS'], ['Digit4', 'SQUARE']]
  for (const [code, name] of want) {
    const s = press('solo', 'diff2', code)
    const on = Object.keys(s).filter((k) => k.startsWith('ps2_PSB_') && s[k] === 1)
    assert.deepEqual(on, [`ps2_PSB_${name}`], code)
  }
})
