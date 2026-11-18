import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newEvent, reduce, emptySheet, roundOfMatch, type Action, type EventState, type EMatch } from './event.ts'

const T = (n: string) => ({ code: n, name: `Đội ${n}`, school: 'THPT A', province: 'HN', advisor: 'Cô B' })
const run = (s: EventState, ...as: Action[]) => as.reduce(reduce, s)

/** Giải có 4 đội, 1 vòng r1 với 2 trận. */
function base(): EventState {
  const s = run(newEvent('FANROC', 7),
    { t: 'teams', teams: [T('A'), T('B'), T('C'), T('D')] },
    { t: 'round.add', name: 'Vòng 1', teamIds: ['t1', 't2', 't3', 't4'], perTeam: 1, fields: 1, slotMin: 7, startAt: '08:00', seed: 1 })
  const matches: EMatch[] = [
    { id: 'r1-1', slot: 0, field: 0, red: ['t1', 't2'], blue: ['t3', 't4'] },
    { id: 'r1-2', slot: 1, field: 0, red: ['t1', 't3'], blue: ['t2', 't4'] },
  ]
  return reduce(s, { t: 'round.schedule', roundId: 'r1', matches })
}
const sheet = (o: number) => ({ ...emptySheet(), decorO: o })

/** Chạy một trận từ start tới commit. */
function played(s: EventState, matchId: string, now = 100): EventState {
  return run(s,
    { t: 'live.start', field: 0, matchId, now },
    { t: 'live.whistle', field: 0 },
    { t: 'live.sheet', field: 0, side: 'red', sheet: sheet(1), submit: true },
    { t: 'live.sheet', field: 0, side: 'blue', sheet: sheet(2), submit: true },
    { t: 'live.commit', field: 0, now: now + 5 })
}

test('newEvent: version 1, chưa có vòng, mã sân/live rỗng', () => {
  const s = newEvent('Giải X', 3)
  assert.equal(s.version, 1)
  assert.equal(s.name, 'Giải X')
  assert.deepEqual(s.rounds, [])
  assert.deepEqual(s.teams, [])
  assert.deepEqual(s.codes, {})
  assert.deepEqual(s.live, {})
})

test('newEvent: id ngẫu nhiên (chuỗi 1..64), mỗi giải một id', () => {
  const a = newEvent('A', 1), b = newEvent('A', 1)
  assert.equal(typeof a.id, 'string')
  assert.ok(a.id.length >= 1 && a.id.length <= 64)
  assert.notEqual(a.id, b.id)
})

test('team.withdraw: trận đang đấu của đội giữ nguyên ghế', () => {
  const s = reduce(base(), { t: 'live.start', field: 0, matchId: 'r1-1', now: 1 })
  const w = reduce(s, { t: 'team.withdraw', id: 't1' })
  assert.deepEqual(w.rounds[0].matches.find((m) => m.id === 'r1-1')!.red, ['t1', 't2'], 'trận đang đấu giữ ghế')
  assert.deepEqual(w.rounds[0].matches.find((m) => m.id === 'r1-2')!.red, [null, 't3'])
})

test('round.schedule: lịch gửi vào có id trận trùng ⇒ lỗi, không đổi', () => {
  const s = base()
  const dup: EMatch[] = [
    { id: 'r1-1', slot: 0, field: 0, red: ['t1', 't2'], blue: ['t3', 't4'] },
    { id: 'r1-1', slot: 1, field: 0, red: ['t1', 't3'], blue: ['t2', 't4'] },
  ]
  assert.throws(() => reduce(s, { t: 'round.schedule', roundId: 'r1', matches: dup }), /trùng/)
  assert.deepEqual(s.rounds[0].matches.map((m) => m.id), ['r1-1', 'r1-2'])
})

test('teams/team.add: id t<n> tăng dần, withdrawn=false', () => {
  const s = run(newEvent('x', 1), { t: 'teams', teams: [T('A'), T('B')] }, { t: 'team.add', team: T('C') })
  assert.deepEqual(s.teams.map((t) => t.id), ['t1', 't2', 't3'])
  assert.ok(s.teams.every((t) => t.withdrawn === false))
  const e = reduce(s, { t: 'team.edit', id: 't2', patch: { name: 'Mới' } })
  assert.equal(e.teams[1].name, 'Mới')
})

test('team.withdraw: đánh dấu rút, trận chưa đấu mất ghế, trận đã có kết quả giữ nguyên', () => {
  const s = played(base(), 'r1-1')
  const w = reduce(s, { t: 'team.withdraw', id: 't1' })
  assert.equal(w.teams[0].withdrawn, true)
  const r = w.rounds[0]
  assert.deepEqual(r.matches.find((m) => m.id === 'r1-1')!.red, ['t1', 't2'])
  assert.deepEqual(r.matches.find((m) => m.id === 'r1-2')!.red, [null, 't3'])
})

test('round.schedule: giữ nguyên trận đã có kết quả, thay phần còn lại', () => {
  const s = played(base(), 'r1-1')
  const fresh: EMatch[] = [
    { id: 'r1-1', slot: 5, field: 0, red: ['t4', 't3'], blue: ['t2', 't1'] }, // trùng id trận đã đấu: bị bỏ qua
    { id: 'r1-9', slot: 2, field: 0, red: ['t1', 't4'], blue: ['t2', 't3'] },
  ]
  const n = reduce(s, { t: 'round.schedule', roundId: 'r1', matches: fresh })
  assert.deepEqual(n.rounds[0].matches.map((m) => m.id), ['r1-1', 'r1-9'])
  assert.deepEqual(n.rounds[0].matches[0].red, ['t1', 't2'])
  assert.ok(n.rounds[0].results['r1-1'])
})

test('round.teams: đổi đội/số trận/số sân', () => {
  const n = reduce(base(), { t: 'round.teams', roundId: 'r1', teamIds: ['t1', 't2'], perTeam: 3, fields: 2 })
  assert.deepEqual(n.rounds[0].teamIds, ['t1', 't2'])
  assert.equal(n.rounds[0].perTeam, 3)
  assert.equal(n.rounds[0].fields, 2)
})

test('live: start → whistle → sheet → commit', () => {
  let s = run(base(), { t: 'live.start', field: 0, matchId: 'r1-1', now: 10 })
  assert.equal(s.live[0]!.phase, 'play')
  assert.equal(s.live[0]!.startedAt, 10)
  s = reduce(s, { t: 'live.whistle', field: 0 })
  assert.equal(s.live[0]!.phase, 'inventory')
  s = reduce(s, { t: 'live.sheet', field: 0, side: 'red', sheet: sheet(1), submit: false })
  assert.equal(s.live[0]!.submitted.red, undefined)
  assert.equal(s.live[0]!.sheets.red!.decorO, 1)
  s = reduce(s, { t: 'live.sheet', field: 0, side: 'red', sheet: sheet(3), submit: true })
  assert.equal(s.live[0]!.sheets.red!.decorO, 3)
  assert.equal(s.live[0]!.submitted.red, true)
  assert.throws(() => reduce(s, { t: 'live.commit', field: 0, now: 20 }), /Chưa đủ hai bản kiểm kê/)
  s = reduce(s, { t: 'live.sheet', field: 0, side: 'blue', sheet: sheet(2), submit: false }) // đã có phiếu nhưng chưa nộp
  assert.throws(() => reduce(s, { t: 'live.commit', field: 0, now: 20 }), /Chưa đủ hai bản kiểm kê/)
  s = reduce(s, { t: 'live.sheet', field: 0, side: 'blue', sheet: sheet(2), submit: true })
  s = reduce(s, { t: 'live.commit', field: 0, now: 20 })
  assert.equal(s.live[0], null)
  const res = s.rounds[0].results['r1-1']
  assert.equal(res.red.decorO, 3)
  assert.equal(res.blue.decorO, 2)
  assert.equal(res.committedAt, 20)
})

test('live.start: lỗi khi sân đang bận hoặc trận đã có kết quả; abort giải phóng sân', () => {
  const s = run(base(), { t: 'live.start', field: 0, matchId: 'r1-1', now: 1 })
  assert.throws(() => reduce(s, { t: 'live.start', field: 0, matchId: 'r1-2', now: 2 }), /Sân/)
  const a = reduce(s, { t: 'live.abort', field: 0 })
  assert.equal(a.live[0], null)
  const p = played(base(), 'r1-1')
  assert.throws(() => reduce(p, { t: 'live.start', field: 0, matchId: 'r1-1', now: 3 }), /kết quả/)
  assert.throws(() => reduce(base(), { t: 'live.sheet', field: 0, side: 'red', sheet: sheet(1), submit: true }), /Sân/)
})

test('result.edit: thêm Edit với before là kết quả cũ', () => {
  const s = played(base(), 'r1-1')
  const old = s.rounds[0].results['r1-1']
  const nu = { red: sheet(9), blue: sheet(8), committedAt: 200 }
  const e = reduce(s, { t: 'result.edit', roundId: 'r1', matchId: 'r1-1', result: nu, now: 300 })
  assert.equal(e.rounds[0].edits.length, 1)
  assert.deepEqual(e.rounds[0].edits[0], { matchId: 'r1-1', at: 300, before: old, after: nu })
  assert.deepEqual(e.rounds[0].results['r1-1'], nu)
  const e2 = reduce(e, { t: 'result.edit', roundId: 'r1', matchId: 'r1-2', result: nu, now: 400 })
  assert.equal(e2.rounds[0].edits[1].before, null)
})

test('teams: ném khi đã có kết quả', () => {
  assert.throws(() => reduce(played(base(), 'r1-1'), { t: 'teams', teams: [T('Z')] }), /kết quả/)
})

test('code.new và roundOfMatch', () => {
  const s = reduce(base(), { t: 'code.new', field: 1, code: '4821' })
  assert.equal(s.codes[1], '4821')
  assert.equal(roundOfMatch(s, 'r1-2')!.id, 'r1')
  assert.equal(roundOfMatch(s, 'nope'), undefined)
})

test('reduce thuần: không sửa đối tượng vào', () => {
  const acts: Action[] = [
    { t: 'team.add', team: T('Q') },
    { t: 'team.withdraw', id: 't1' },
    { t: 'live.start', field: 0, matchId: 'r1-1', now: 1 },
    { t: 'round.teams', roundId: 'r1', teamIds: ['t1'], perTeam: 2, fields: 1 },
    { t: 'code.new', field: 0, code: '1234' },
  ]
  for (const a of acts) {
    const s = base()
    const before = structuredClone(s)
    reduce(s, a)
    assert.deepEqual(s, before, a.t)
  }
  const p = played(base(), 'r1-1')
  const before = structuredClone(p)
  reduce(p, { t: 'result.edit', roundId: 'r1', matchId: 'r1-1', result: p.rounds[0].results['r1-1'], now: 5 })
  assert.deepEqual(p, before)
})

test('event.name: đổi tên giải (bỏ khoảng trắng thừa); tên trống ⇒ lỗi, không đổi', () => {
  const s = reduce(base(), { t: 'event.name', name: '  Vòng khu vực Hà Nội  ' })
  assert.equal(s.name, 'Vòng khu vực Hà Nội')
  assert.throws(() => reduce(s, { t: 'event.name', name: '   ' }), /Tên giải/)
})
