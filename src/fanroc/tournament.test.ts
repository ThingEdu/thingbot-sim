import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MACHINE_TEAMS, createTournament, nextMatch, record, standings, type Played, type TournamentState } from './tournament.ts'

const robot = { type: 'maker', drive: 'diff2', actuator: 'tt' } as const
const mk = (perTeam = 4, seed = 7, np = 2) =>
  createTournament({ players: Array.from({ length: np }, (_, i) => ({ name: `Em ${i}`, robot, player: i as 0 | 1 })), perTeam, seed })

/** Dựng giải 8 đội với điểm tuỳ ý: scores[id] = [[điểm, phạt], …] theo thứ tự trận của đội đó. */
function withScores(scores: Record<string, [number, number?][]>): TournamentState {
  const s = mk(4)
  const results: Played[] = []
  const ids = s.entrants.map((e) => e.id)
  const n = Math.max(...Object.values(scores).map((v) => v.length))
  for (let m = 0; m < n; m++) {
    const teams: Played['teams'] = {}
    for (const id of ids) if (scores[id]?.[m]) teams[id] = { score: scores[id][m][0], penalty: scores[id][m][1] ?? 0 }
    results.push({ teams, matchScore: 0 })
  }
  return { ...s, results }
}
const rankOf = (st: ReturnType<typeof standings>, id: string) => st.find((x) => x.id === id)!

test('lịch: mỗi đội đúng perTeam trận, 4 đội khác nhau mỗi trận, cùng seed cùng lịch', () => {
  const s = mk(4)
  assert.equal(s.schedule.length, 8)
  const cnt: Record<string, number> = {}
  for (const m of s.schedule) {
    const four = [...m.red, ...m.blue]
    assert.equal(new Set(four).size, 4)
    four.forEach((id) => (cnt[id] = (cnt[id] ?? 0) + 1))
  }
  assert.equal(Object.keys(cnt).length, 8)
  assert.ok(Object.values(cnt).every((c) => c === 4))
  assert.deepEqual(mk(4).schedule, s.schedule)
  assert.notDeepEqual(mk(4, 8).schedule, s.schedule)
  assert.equal(mk(10).schedule.length, 20)
})

test('1 người chơi vẫn đủ 8 đội; đội máy có tên Việt, trộn mức', () => {
  const s = mk(4, 1, 1)
  assert.equal(s.entrants.length, 8)
  assert.equal(s.entrants.filter((e) => e.kind === 'machine').length, 7)
  assert.ok(new Set(MACHINE_TEAMS.map((m) => m.skill)).size === 3)
})

test('perTeam ngoài 4…10 thì throw', () => {
  assert.throws(() => mk(3))
  assert.throws(() => mk(11))
})

test('luật ví dụ 1: A 929 hạng 1; C và B cùng 900, C trên B nhờ best 280 > 260', () => {
  const st = standings(withScores({
    p0: [[180], [210], [299], [240]],
    p1: [[200], [250], [190], [260]], // B
    m0: [[190], [280], [230], [200]], // C
    m1: [[1], [1], [1], [1]], m2: [[1], [1], [1], [1]], m3: [[1], [1], [1], [1]], m4: [[1], [1], [1], [1]], m5: [[1], [1], [1], [1]],
  }))
  assert.equal(rankOf(st, 'p0').total, 929)
  assert.equal(rankOf(st, 'p0').rank, 1)
  assert.equal(rankOf(st, 'm0').total, 900)
  assert.equal(rankOf(st, 'p1').total, 900)
  assert.ok(rankOf(st, 'm0').rank < rankOf(st, 'p1').rank)
  assert.equal(rankOf(st, 'm0').tieDraw, false)
})

test('luật ví dụ 2: 5 trận chuẩn 4 ⇒ bỏ trận thấp nhất, 810', () => {
  const st = standings(withScores({
    p0: [[150], [220], [90], [260], [180]],
    p1: [[1], [1], [1], [1]], m0: [[1], [1], [1], [1]], m1: [[1], [1], [1], [1]],
    m2: [[1], [1], [1], [1]], m3: [[1], [1], [1], [1]], m4: [[1], [1], [1], [1]], m5: [[1], [1], [1], [1]],
  }))
  const d = rankOf(st, 'p0')
  assert.equal(d.total, 810)
  assert.deepEqual(d.counted, [150, 220, 260, 180])
  assert.equal(d.best, 260)
})

test('bằng cả tổng lẫn best thì ít phạt hơn xếp trên (thử cả hai chiều)', () => {
  const rest = { m0: [[1], [1]], m1: [[1], [1]], m2: [[1], [1]], m3: [[1], [1]], m4: [[1], [1]], m5: [[1], [1]] } as Record<string, [number][]>
  const a = standings(withScores({ p0: [[100, 20], [100, 0]], p1: [[100, 5], [100, 0]], ...rest }))
  assert.ok(rankOf(a, 'p1').rank < rankOf(a, 'p0').rank)
  assert.equal(rankOf(a, 'p1').tieDraw, false)
  const b = standings(withScores({ p0: [[100, 5], [100, 0]], p1: [[100, 20], [100, 0]], ...rest }))
  assert.ok(rankOf(b, 'p0').rank < rankOf(b, 'p1').rank)
})

test('bằng tất cả ⇒ bốc thăm theo seed, tieDraw = true, ổn định', () => {
  const sc = { p0: [[100, 0]] as [number, number][], p1: [[100, 0]] as [number, number][], m0: [[1, 0]] as [number, number][] }
  const a = standings(withScores(sc))
  const b = standings(withScores(sc))
  assert.deepEqual(a, b)
  assert.equal(rankOf(a, 'p0').tieDraw, true)
  assert.equal(rankOf(a, 'p1').tieDraw, true)
  assert.notEqual(rankOf(a, 'p0').rank, rankOf(a, 'p1').rank)
})

test('nextMatch sau 3 record = 3; record bất biến; JSON khứ hồi dùng lại được', () => {
  let s = mk(4)
  const orig = s
  for (let i = 0; i < 3; i++) s = record(s, i, { teams: { p0: { score: 10, penalty: 0 } }, matchScore: 10 })
  assert.equal(nextMatch(s), 3)
  assert.equal(nextMatch(orig), 0)
  assert.equal(orig.results[0], null)
  const back = JSON.parse(JSON.stringify(s)) as TournamentState
  assert.equal(nextMatch(back), 3)
  assert.equal(standings(back).length, 8)
  let done = back
  for (let i = 3; i < 8; i++) done = record(done, i, { teams: {}, matchScore: 0 })
  assert.equal(nextMatch(done), null)
})

test('giữa giải: xếp theo tổng thô các trận đã đấu, provisional, không mất điểm trận mới', () => {
  let s = mk(4)
  const m0 = s.schedule[0]
  s = record(s, 0, { teams: { [m0.red[0]]: { score: 50, penalty: 0 }, [m0.red[1]]: { score: 50, penalty: 0 }, [m0.blue[0]]: { score: 20, penalty: 0 }, [m0.blue[1]]: { score: 20, penalty: 0 } }, matchScore: 70 })
  const st = standings(s)
  assert.ok(st.every((x) => x.provisional))
  assert.equal(rankOf(st, m0.red[0]).total, 50)
  assert.equal(rankOf(st, m0.blue[0]).total, 20)
  const played = new Set([...m0.red, ...m0.blue])
  st.filter((x) => !played.has(x.id)).forEach((x) => assert.equal(x.total, 0))
  assert.ok(rankOf(st, m0.red[0]).rank <= 2 && rankOf(st, m0.blue[0]).rank > rankOf(st, m0.red[0]).rank)
  // 3 trận: không đội nào mất điểm trận mới nhất
  for (let i = 1; i < 3; i++) {
    const m = s.schedule[i]
    s = record(s, i, { teams: Object.fromEntries([...m.red, ...m.blue].map((id) => [id, { score: 10, penalty: 0 }])), matchScore: 0 })
  }
  const st3 = standings(s)
  const n = (id: string) => s.results.filter((r) => r?.teams[id]).length
  st3.forEach((x) => assert.equal(x.counted.length, n(x.id)))
  assert.ok(st3.every((x) => x.provisional))
})

test('đủ kết quả: provisional = false và áp luật E.2', () => {
  let s = mk(4)
  s.schedule.forEach((m, i) => {
    s = record(s, i, { teams: Object.fromEntries([...m.red, ...m.blue].map((id) => [id, { score: 10 + i, penalty: 0 }])), matchScore: 0 })
  })
  const st = standings(s)
  assert.ok(st.every((x) => !x.provisional && x.counted.length === 4))
})

test('machines tuỳ chọn thay MACHINE_TEAMS', () => {
  const s = createTournament({ players: [{ name: 'A', robot }, { name: 'B', robot }], perTeam: 4, seed: 1, machines: MACHINE_TEAMS.slice(0, 5).concat(MACHINE_TEAMS.slice(0, 1).map((m) => ({ ...m, name: 'Khác' }))) })
  assert.equal(s.entrants[7].name, 'Khác')
})
