import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FOLLOW_ZOOM, followOffset } from './scene.ts'

test('camera Theo robot: mức vừa lùi xa hơn bản cũ (0,6 m) và thấp hơn (1 m); gần < vừa < xa', () => {
  const mid = followOffset(FOLLOW_ZOOM[1])
  assert.ok(mid.back > 0.8 && mid.up < 0.75, JSON.stringify(mid))
  // Góc nhìn xuống (tới điểm nhìn trước mũi) của mức vừa 15°…35°; bản cũ ~44°: chúi xuống, robot che nửa màn.
  const tilt = (Math.atan2(mid.up - 0.06, mid.back + mid.ahead) * 180) / Math.PI
  assert.ok(tilt > 15 && tilt < 35, `nghiêng ${tilt.toFixed(1)}°`)
  const [near, , far] = FOLLOW_ZOOM.map(followOffset)
  assert.ok(near.back < mid.back && mid.back < far.back)
  // Mức vừa cao hơn rào (0,3 m) để nhìn qua rào khi robot sát Khu Điều Khiển.
  assert.ok(mid.up > 0.3 && far.up > 0.3)
})
