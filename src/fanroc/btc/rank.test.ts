import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySheet, newEvent, reduce, type EMatch, type EventState, type Result } from './event.ts'
import { liveScore } from './sheet.ts'
import { matchPlayed, roundStandings } from './rank.ts'

const res = (fireO: number): Result => {
  const red = emptySheet()
  red.fire.o = fireO
  return { red, blue: emptySheet(), committedAt: 1 }
}
const M = (id: string, slot: number, red: [string | null, string | null], blue: [string | null, string | null]): EMatch => ({ id, slot, field: 0, red, blue })

/** 8 đội t1..t8, vòng r1 với các trận cho trước; kết quả gán thẳng vào round.results. */
function ev(matches: EMatch[], results: Record<string, Result>, withdrawn: string[] = []): EventState {
  let s = newEvent('thử', 1)
  s = reduce(s, { t: 'teams', teams: Array.from({ length: 8 }, (_, i) => ({ code: `D${i + 1}`, name: `Đội ${i + 1}`, school: '', province: '', advisor: '' })) })
  s = reduce(s, { t: 'round.add', name: 'Vòng 1', teamIds: s.teams.map((t) => t.id), perTeam: 3, fields: 1, slotMin: 7, startAt: '08:00', seed: 7 })
  s = reduce(s, { t: 'round.schedule', roundId: 'r1', matches })
  const out = structuredClone(s)
  out.rounds[0].results = results
  for (const id of withdrawn) out.teams.find((t) => t.id === id)!.withdrawn = true
  return out
}

test('matchPlayed: điểm từng đội, điểm trận và hệ số lấy từ phiếu; ghế null không tạo dòng', () => {
  const r = res(5)
  const p = matchPlayed(r, M('m', 0, ['t1', null], ['t2', 't3']))
  assert.deepEqual(Object.keys(p.teams).sort(), ['t1', 't2', 't3'])
  const sc = liveScore(r.red, r.blue)
  assert.equal(p.matchScore, sc.total)
  assert.equal(p.multPct, sc.multPct)
  assert.ok(p.matchScore > 0)
})

test('đội rút lui sau 2 trận: 7 đội còn lại không bị kéo về 2 trận, đội rút lui đứng cuối', () => {
  // 3 trận/đội cho t1..t7 qua 3 lượt; t8 chỉ đấu 2 trận rồi rút lui
  const matches = [
    M('a1', 0, ['t1', 't2'], ['t3', 't4']), M('a2', 1, ['t5', 't6'], ['t7', 't8']),
    M('b1', 2, ['t1', 't3'], ['t5', 't7']), M('b2', 3, ['t2', 't4'], ['t6', 't8']),
    M('c1', 4, ['t1', 't4'], ['t6', 't7']), M('c2', 5, ['t2', 't3'], ['t5', null]),
  ]
  const results = Object.fromEntries(matches.map((m, i) => [m.id, res(i + 1)]))
  const rows = roundStandings(ev(matches, results, ['t8']), 'r1')
  assert.equal(rows.length, 8)
  const last = rows[7]
  assert.equal(last.id, 't8')
  assert.equal(last.withdrawn, true)
  assert.equal(last.rank, 0)
  assert.equal(last.counted.length, 2)
  assert.equal(last.tieDraw, false)
  const ranked = rows.slice(0, 7)
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7])
  assert.ok(ranked.every((r) => !r.withdrawn && r.counted.length === 3), 'chuẩn là 3 trận, không bị kéo về 2')
  assert.ok(ranked.every((r) => !r.provisional))
})

test('vòng chưa xong ⇒ provisional; trận chỉ còn đội rút lui không làm vòng dở', () => {
  const matches = [M('a1', 0, ['t1', 't2'], ['t3', 't4']), M('a2', 1, ['t5', 't6'], ['t7', 't8'])]
  const part = roundStandings(ev(matches, { a1: res(2) }), 'r1')
  assert.ok(part.every((r) => r.provisional))
  assert.equal(part.find((r) => r.id === 't1')!.counted.length, 1)
  const withNull = [M('a1', 0, ['t1', 't2'], ['t3', 't4']), M('a2', 1, [null, null], [null, null])]
  const done = roundStandings(ev(withNull, { a1: res(2) }), 'r1')
  assert.ok(done.every((r) => !r.provisional))
  const wd = [M('a1', 0, ['t1', 't2'], ['t3', 't4']), M('a2', 1, ['t8', null], [null, null])]
  assert.ok(roundStandings(ev(wd, { a1: res(2) }, ['t8']), 'r1').every((r) => !r.provisional))
})
