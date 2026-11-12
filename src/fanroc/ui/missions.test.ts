import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DIFFICULTY, guideSteps, hasMeasure, measureText, mergeProgress, missionCards, PROGRESS_FAILED, saveMissionVerified, totalStars } from './missions.ts'
import { MISSIONS } from '../missions/data.ts'
import { createStore, type KV } from '../store.ts'

const fake = (): KV => {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
const full = (): KV => ({ getItem: () => null, setItem() { throw new DOMException('đầy', 'QuotaExceededError') } })
const prog = { blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 1, y: 2 }] } }

test('độ khó: đủ 12 nhiệm vụ, mỗi nhiệm vụ 1–5 ô, nhiệm vụ cuối khó nhất', () => {
  for (const m of MISSIONS) assert.ok(DIFFICULTY[m.n] >= 1 && DIFFICULTY[m.n] <= 5, `nhiệm vụ ${m.n}`)
  assert.equal(Math.max(...MISSIONS.map((m) => DIFFICULTY[m.n])), DIFFICULTY[12])
})

test('ô số đo: quãng m hai chữ số, góc độ nguyên, thời gian s một chữ số (dấu phẩy)', () => {
  assert.deepEqual(measureText({ distance: 0.2754, turned: 131.4, time: 1.25 }), { distance: '0,28 m', turned: '131°', time: '1,3 s' })
  assert.deepEqual(measureText({ distance: 0, turned: 0, time: 0 }), { distance: '0,00 m', turned: '0°', time: '0,0 s' })
})

test('ô số đo chỉ có ở nhiệm vụ có điều kiện đo (measure)', () => {
  const on = MISSIONS.filter(hasMeasure).map((m) => m.n)
  assert.ok(on.includes(4) && on.includes(1))
  assert.ok(!on.includes(2) && !on.includes(12))
})

test('mergeProgress: làm lại kém hơn không hạ số sao tốt nhất, không bỏ ✓; chương trình là bản mới', () => {
  const best = mergeProgress({ done: true, stars: 3, program: null }, { done: false, stars: 0 }, prog)
  assert.deepEqual(best, { done: true, stars: 3, program: prog })
  assert.deepEqual(mergeProgress({ done: false, stars: 0, program: null }, { done: true, stars: 2 }, prog), { done: true, stars: 2, program: prog })
  assert.equal(mergeProgress({ done: true, stars: 1, program: null }, { done: true, stars: 2 }, null).stars, 2)
})

test('saveMissionVerified: lưu và đọc lại đúng ⇒ ok; bộ nhớ đầy / bị chặn ⇒ báo lỗi, không báo đã lưu', () => {
  const s = createStore('s', fake())
  const p = { done: true, stars: 2 as const, program: prog }
  assert.equal(saveMissionVerified(s, 'hinh-vuong', p).ok, true)
  assert.deepEqual(s.mission('hinh-vuong'), p)
  for (const kv of [full(), null]) {
    const r = saveMissionVerified(createStore('s', kv), 'hinh-vuong', p)
    assert.deepEqual(r, { ok: false, text: PROGRESS_FAILED })
  }
})

test('missionCards / totalStars đọc tiến độ đã lưu', () => {
  const s = createStore('s', fake())
  s.saveMission('hinh-vuong', { done: true, stars: 2, program: null })
  s.saveMission('di-thang', { done: true, stars: 3, program: null })
  const cards = missionCards(s)
  assert.equal(cards.length, 12)
  const c7 = cards.find((c) => c.n === 7)!
  assert.deepEqual([c7.done, c7.stars, c7.title, c7.stage], [true, 2, 'Hình vuông', 2])
  assert.equal(cards.find((c) => c.n === 1)!.done, false)
  assert.equal(totalStars(s), 5)
})

test('bảng HƯỚNG DẪN: trang đầu là câu mục tiêu của nhiệm vụ, rồi tới các bước', () => {
  for (const m of MISSIONS) assert.deepEqual(guideSteps(m), [m.goal, ...m.guide], m.id)
})

test('tiến độ đã lưu của nhiệm vụ 11 cũ "ve-vung-bao-ve" bị bỏ qua: thẻ 11 là Leo Thang Cứu Hỏa chưa làm, không cộng sao', () => {
  const s = createStore('s', fake())
  s.saveMission('ve-vung-bao-ve', { done: true, stars: 3, program: prog })
  const c11 = missionCards(s).find((c) => c.n === 11)!
  assert.deepEqual([c11.id, c11.title, c11.done, c11.stars], ['leo-thang', 'Leo Thang Cứu Hỏa', false, 0])
  assert.equal(totalStars(s), 0)
  assert.deepEqual(s.mission('leo-thang'), { done: false, stars: 0, program: null })
})
