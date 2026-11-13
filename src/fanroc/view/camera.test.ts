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

test('chia đôi màn hình (0.9.1): hai nửa không hở, không chồng; Toàn sân thành Ghế lái của mỗi bạn', async () => {
  const { splitRects, splitView } = await import('./scene.ts')
  for (const [w, h] of [[1440, 860], [1281, 720], [2, 1]]) {
    const [a, b] = splitRects(w, h)
    assert.deepEqual([a[0], a[1], b[1], a[3], b[3]], [0, 0, 0, h, h])
    assert.equal(a[2] + b[2], w)
    assert.equal(b[0], a[2])
    assert.ok(Math.abs(a[2] - b[2]) <= 1)
  }
  assert.equal(splitView('field'), 'driver')
  assert.equal(splitView('orbit'), 'driver')
  assert.equal(splitView('follow'), 'follow')
  assert.equal(splitView('driver'), 'driver')
})
