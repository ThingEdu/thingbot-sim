import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveSpeed } from './pace.ts'

test('R24: có chương trình khối đang chạy ⇒ luôn ×1 (kể cả xin ×4, ×40, ×0); toàn agent ⇒ đúng tốc độ xin', () => {
  assert.deepEqual([4, 40, 0, 1].map((s) => effectiveSpeed(s, true)), [1, 1, 1, 1])
  assert.deepEqual([4, 40, 0, 1].map((s) => effectiveSpeed(s, false)), [4, 40, 0, 1])
})
