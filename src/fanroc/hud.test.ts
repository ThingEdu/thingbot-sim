import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockText, deadZoneLines } from './view/hud.ts'
import { NEUTRAL } from './ports.ts'

test('deadZoneLines (R32): mỗi động cơ có lệnh trong (0, 20) % một dòng, cả chiều lùi; 0 và ≥ 20 % thì không', () => {
  assert.deepEqual(deadZoneLines({ ...NEUTRAL, M1: 10 }), ['M1 = 10 % < 20 %: động cơ TT không quay'])
  assert.deepEqual(deadZoneLines({ ...NEUTRAL, M2: -12.5, M4: 19.96 }), [
    'M2 = −12,5 % < 20 %: động cơ TT không quay',
    'M4 = 19,9 % < 20 %: động cơ TT không quay',
  ])
  assert.deepEqual(deadZoneLines({ ...NEUTRAL, M1: 20, M2: -20, M3: 100, M4: 0 }), [])
  assert.deepEqual(deadZoneLines(NEUTRAL), [])
  assert.deepEqual(deadZoneLines(undefined), [])
})

test('clockText: trận đếm ngược 0:10 → 0:00 rồi 3:00 → 0:00; luyện tập đếm lên "Luyện tập · m:ss"', () => {
  assert.equal(clockText(-10, false), '0:10')
  assert.equal(clockText(0, false), '3:00')
  assert.equal(clockText(179.5, false), '0:01')
  assert.equal(clockText(0, true), 'Luyện tập · 0:00')
  assert.equal(clockText(65.9, true), 'Luyện tập · 1:05')
  assert.equal(clockText(600, true), 'Luyện tập · 10:00')
})
