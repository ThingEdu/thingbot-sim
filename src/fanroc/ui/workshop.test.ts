import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Drafts, resetVerified, RESET_FAILED, SAVE_FAILED, saveVerified } from './workshop.ts'
import { createStore, type KV } from '../store.ts'
import { defaultConfig } from '../programs.ts'

const fake = (): KV => {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
/** Đọc được nhưng ghi ném lỗi (bộ nhớ đầy / bị chặn ghi). */
const full = (): KV => ({ getItem: () => null, setItem() { throw new DOMException('đầy', 'QuotaExceededError') } })
const maker = defaultConfig('maker')
const prog = { blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 1, y: 2 }] } }

test('saveVerified: lưu được ⇒ "Đã lưu v1", "Đã lưu v2"', () => {
  const s = createStore('s', fake())
  assert.deepEqual(saveVerified(s, 0, maker, prog), { ok: true, version: 1, text: 'Đã lưu v1' })
  assert.deepEqual(saveVerified(s, 0, maker, prog), { ok: true, version: 2, text: 'Đã lưu v2' })
  assert.deepEqual(s.program(0, maker)?.state, prog)
})

test('saveVerified: localStorage đầy / bị chặn ⇒ không báo "Đã lưu", báo lỗi tiếng Việt', () => {
  for (const kv of [full(), null]) {
    const r = saveVerified(createStore('s', kv), 0, maker, prog)
    assert.equal(r.ok, false)
    assert.equal(r.text, SAVE_FAILED)
    assert.ok(!/Đã lưu/.test(r.text))
  }
})

test('saveVerified: đọc lại ra bản khác (phiên bản / nội dung) ⇒ lỗi', () => {
  const s = createStore('s', fake())
  const liar = { saveProgram: () => 5, program: () => ({ version: 4, state: prog }) }
  assert.equal(saveVerified(liar, 0, maker, prog).ok, false)
  const stale = { saveProgram: () => 1, program: () => ({ version: 1, state: {} }) }
  assert.equal(saveVerified(stale, 0, maker, prog).ok, false)
  assert.equal(saveVerified(s, 1, maker, prog).ok, true)
})

test('resetVerified: xoá được ⇒ về mặc định; vẫn còn bản lưu ⇒ lỗi', () => {
  const s = createStore('s', fake())
  saveVerified(s, 0, maker, prog)
  assert.deepEqual(resetVerified(s, 0, maker), { ok: true, text: 'Đã về chương trình mặc định' })
  assert.equal(s.program(0, maker), null)
  const stuck = { resetProgram() {}, program: () => ({ version: 1, state: prog }) }
  assert.deepEqual(resetVerified(stuck, 0, maker), { ok: false, text: RESET_FAILED })
})

test('Drafts: khác base ⇒ là bản nháp theo (bạn, robot); giống base ⇒ không; bỏ ⇒ hết', () => {
  const d = new Drafts()
  const base = { blocks: { languageVersion: 0, blocks: [] } }
  d.keep(0, maker, prog, base)
  assert.ok(d.has(0, maker))
  assert.deepEqual(d.get(0, maker), { state: prog, base })
  assert.equal(d.has(1, maker), false, 'bạn 2 không dính bản nháp của bạn 1')
  assert.equal(d.has(0, defaultConfig('ui')), false, 'robot khác không dính')
  assert.equal(d.has(0, { ...maker, drive: 'omni' }), false, 'đế khác không dính')
  // Sửa lại y như cũ ⇒ không còn gì chưa lưu.
  d.keep(0, maker, JSON.parse(JSON.stringify(base)), base)
  assert.equal(d.has(0, maker), false)
  d.keep(1, maker, prog, base)
  d.drop(1, maker)
  assert.equal(d.get(1, maker), null)
})
