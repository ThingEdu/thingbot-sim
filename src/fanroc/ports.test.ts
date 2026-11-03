import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodePorts, NEUTRAL, servo360 } from './ports.ts'

const pwm = (set: Record<number, number>): number[] => {
  const a = new Array<number>(16).fill(0)
  for (const [k, v] of Object.entries(set)) a[Number(k)] = v
  return a
}

test('NEUTRAL: motor 0, servo thả', () => {
  assert.deepEqual(decodePorts(pwm({})), NEUTRAL)
})

test('M1: kênh B=3 dương là tiến, A=2 dương là lùi', () => {
  assert.equal(decodePorts(pwm({ 3: 4095 })).M1, 100)
  const back = decodePorts(pwm({ 2: 2048 })).M1
  assert.ok(Math.abs(back - -50) <= 1, `M1=${back}`)
})

test('M3 đảo kênh: A=7, B=6', () => {
  assert.equal(decodePorts(pwm({ 7: 4095 })).M3, -100)
  assert.equal(decodePorts(pwm({ 6: 4095 })).M3, 100)
})

test('M4: A=1, B=0', () => {
  assert.ok(decodePorts(pwm({ 1: 1000 })).M4 < 0)
  assert.ok(decodePorts(pwm({ 0: 1000 })).M4 > 0)
})

test('M2: A=4, B=5', () => {
  assert.ok(decodePorts(pwm({ 4: 1000 })).M2 < 0)
  assert.ok(decodePorts(pwm({ 5: 1000 })).M2 > 0)
})

test('servo S1 (kênh 12): 102 → 0°, 512 → 180°, 0 → thả, ngoài miền bị kẹp', () => {
  assert.equal(decodePorts(pwm({ 12: 102 })).S1, 0)
  assert.equal(decodePorts(pwm({ 12: 512 })).S1, 180)
  assert.equal(decodePorts(pwm({ 12: 0 })).S1, null)
  assert.equal(decodePorts(pwm({ 12: 307 })).S1, (307 - 102) / 410 * 180)
  assert.equal(decodePorts(pwm({ 12: 50 })).S1, 0)
  assert.equal(decodePorts(pwm({ 12: 900 })).S1, 180)
})

test('servo S2..S5 ở kênh 11, 10, 9, 8', () => {
  const v = decodePorts(pwm({ 11: 512, 10: 512, 9: 512, 8: 512 }))
  assert.deepEqual([v.S2, v.S3, v.S4, v.S5], [180, 180, 180, 180])
  assert.equal(decodePorts(pwm({ 8: 512 })).S5, 180)
  assert.equal(decodePorts(pwm({ 8: 512 })).S4, null)
})

test('servo360: vùng chết 80…100°', () => {
  assert.equal(servo360(180), 1)
  assert.equal(servo360(90), 0)
  assert.equal(servo360(0), -1)
  assert.equal(servo360(null), 0)
  assert.equal(servo360(80), 0)
  assert.equal(servo360(100), 0)
  assert.equal(servo360(101), 1)
  assert.equal(servo360(79), -1)
})
