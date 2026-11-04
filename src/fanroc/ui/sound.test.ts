import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSound, type AudioLike } from './sound.ts'

/** AudioContext giả: đếm số dao động đã tạo. */
function fake() {
  const made = { osc: 0, ctx: 0 }
  const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }
  const factory = (): AudioLike => {
    made.ctx++
    return {
      currentTime: 0,
      destination: {},
      createOscillator: () => {
        made.osc++
        return { type: 'sine', frequency: param, connect: () => undefined, start() {}, stop() {} }
      },
      createGain: () => ({ gain: param, connect: () => undefined }),
    }
  }
  return { made, factory }
}

test('âm thanh: chưa có lần bấm nào ⇒ không tạo AudioContext, im lặng; bấm rồi ⇒ phát', () => {
  const { made, factory } = fake()
  const gesture = new EventTarget()
  const s = createSound(() => true, gesture, factory)
  s.ting()
  s.whistle()
  assert.deepEqual(made, { osc: 0, ctx: 0 })
  gesture.dispatchEvent(new Event('pointerdown'))
  gesture.dispatchEvent(new Event('keydown'))
  assert.equal(made.ctx, 1, 'chỉ một AudioContext')
  s.ting()
  assert.ok(made.osc > 0)
})

test('âm thanh: settings.sound = false ⇒ không phát; bật lại ⇒ phát (đọc mỗi lần)', () => {
  const { made, factory } = fake()
  const gesture = new EventTarget()
  let on = false
  const s = createSound(() => on, gesture, factory)
  gesture.dispatchEvent(new Event('pointerdown'))
  s.whistle(true)
  s.beep()
  assert.equal(made.osc, 0)
  on = true
  s.beep()
  assert.equal(made.osc, 1)
})

test('âm thanh: WebAudio hỏng (tạo ném lỗi / không có) ⇒ im lặng, không ném', () => {
  const gesture = new EventTarget()
  const s = createSound(() => true, gesture, () => {
    throw new Error('không có loa')
  })
  gesture.dispatchEvent(new Event('pointerdown'))
  assert.doesNotThrow(() => (s.ting(), s.whistle(true), s.beep()))
  const s2 = createSound(() => true, gesture, () => null)
  gesture.dispatchEvent(new Event('pointerdown'))
  assert.doesNotThrow(() => s2.ting())
})
