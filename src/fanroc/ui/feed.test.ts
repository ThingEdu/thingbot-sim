import { test } from 'node:test'
import assert from 'node:assert/strict'
import { climbItem, EventFeed, FEED_GAP_MS, FEED_LIFE_MS, FEED_MAX, FEED_QUEUE_MAX, foulItem, scoreItem } from './feed.ts'

const it = (text: string) => scoreItem(text)

test('EventFeed: nhiều dòng cùng lúc hiện lần lượt, cách nhau FEED_GAP_MS', () => {
  const f = new EventFeed()
  f.push([it('+5 · Chữa Cháy'), it('−3 · Bóng sai chỗ'), it('+15 · Rãnh 3')])
  assert.deepEqual(f.tick(0).map((s) => s.text), ['+5 · Chữa Cháy'])
  assert.equal(f.tick(FEED_GAP_MS - 1).length, 1, 'chưa đủ khoảng cách thì chưa hiện dòng sau')
  assert.deepEqual(f.tick(FEED_GAP_MS).map((s) => s.text), ['+5 · Chữa Cháy', '−3 · Bóng sai chỗ'])
  assert.equal(f.tick(2 * FEED_GAP_MS).length, 3)
})

test('EventFeed: mỗi dòng ở lại FEED_LIFE_MS kể từ lúc hiện, tối đa FEED_MAX dòng, hàng chờ tối đa FEED_QUEUE_MAX', () => {
  const f = new EventFeed()
  f.push([it('+5 · A')])
  f.tick(0)
  assert.equal(f.tick(FEED_LIFE_MS - 1).length, 1)
  assert.equal(f.tick(FEED_LIFE_MS).length, 0)
  const g = new EventFeed()
  g.push(Array.from({ length: FEED_QUEUE_MAX + 3 }, (_, i) => it(`+${i + 1} · x`)))
  assert.equal(g.tick(0)[0].text, '+4 · x', 'bỏ 3 dòng chờ cũ nhất')
  for (let k = 1; k < FEED_QUEUE_MAX; k++) assert.ok(g.tick(k * FEED_GAP_MS).length <= FEED_MAX)
  g.clear()
  assert.equal(g.tick(1e6).length, 0)
})

test('foulItem: lỗi trọng tài ⇒ tên đội + lý do; trừ điểm đỏ, cảnh cáo / luyện tập vàng; sự kiện khác bỏ qua', () => {
  const names = ['Bạn 1', 'Kiến Lửa']
  assert.deepEqual(foulItem({ robot: 1, text: 'Robot 2 vươn ra ngoài rào (S02): thẻ vàng (−10)' }, names), {
    text: 'Kiến Lửa vươn ra ngoài rào (S02): thẻ vàng (−10)',
    tone: 'minus',
  })
  assert.equal(foulItem({ robot: 0, text: 'Robot 1 leo núi (P12): cảnh cáo' }, names)?.tone, 'warn')
  assert.equal(foulItem({ robot: 0, text: 'Robot 1 leo núi (P12): lỗi nhẹ (−5) (luyện tập, không phạt)' }, names)?.tone, 'warn')
  assert.equal(foulItem({ robot: 0, text: 'Robot 1 cắm cờ Núi A' }, names), null)
  assert.equal(foulItem({ robot: null, text: 'End Game: còn 30 giây' }, names), null)
  assert.equal(scoreItem('−3 · Bóng sai chỗ').tone, 'minus')
})

test('climbItem: dòng leo xà của Match ⇒ tên đội + mức; lên mức xanh, rời xà đỏ; sự kiện khác (kể cả lỗi) bỏ qua', () => {
  const names = ['Dế Xanh', 'Kiến Lửa', 'Ong Vàng', 'Chuồn Chuồn']
  assert.deepEqual(climbItem({ robot: 3, text: 'Robot 4 treo ở Khu vực Nước (+0,20)' }, names), { text: 'Chuồn Chuồn treo ở Khu vực Nước (+0,20)', tone: 'plus' })
  assert.deepEqual(climbItem({ robot: 0, text: 'Robot 1 chạm xà (+0,05)' }, names), { text: 'Dế Xanh chạm xà (+0,05)', tone: 'plus' })
  assert.deepEqual(climbItem({ robot: 1, text: 'Robot 2 rời xà' }, names), { text: 'Kiến Lửa rời xà', tone: 'minus' })
  assert.equal(climbItem({ robot: 0, text: 'Robot 1 cắm cờ Núi A' }, names), null)
  assert.equal(climbItem({ robot: 0, text: 'Robot 1 leo núi (P12): cảnh cáo' }, names), null)
  assert.equal(climbItem({ robot: null, text: 'Hết giờ — điểm trận 318' }, names), null)
})
