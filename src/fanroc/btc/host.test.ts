import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newEvent, reduce, emptySheet, type Action, type EventState, type EMatch, type HalfSheet } from './event.ts'
import { BtcHost } from './host.ts'
import type { BtcView, ClientMsg, RefView, ScreenView } from './proto.ts'

const T = (n: string) => ({ code: n, name: `Đội ${n}`, school: 'THPT A', province: 'HN', advisor: 'Cô B' })
const run = (s: EventState, ...as: Action[]) => as.reduce(reduce, s)

/** Giải 4 đội, vòng r1 hai trận trên sân 0 (08:00, 7 phút/lượt), mã sân 0 = 1234. */
function base(): EventState {
  const s = run(newEvent('FANROC', 7),
    { t: 'teams', teams: [T('A'), T('B'), T('C'), T('D')] },
    { t: 'round.add', name: 'Vòng 1', teamIds: ['t1', 't2', 't3', 't4'], perTeam: 2, fields: 1, slotMin: 7, startAt: '08:00', seed: 1 },
    { t: 'code.new', field: 0, code: '1234' })
  const matches: EMatch[] = [
    { id: 'r1-1', slot: 0, field: 0, red: ['t1', 't2'], blue: ['t3', 't4'] },
    { id: 'r1-2', slot: 1, field: 0, red: ['t1', 't3'], blue: ['t2', 't4'] },
  ]
  return reduce(s, { t: 'round.schedule', roundId: 'r1', matches })
}

/** BtcHost với deps giả: thư gửi đi vào `sent`, mỗi lần lưu vào `saves`, đồng hồ `clock.t` (ms) điều khiển được. */
function harness(s: EventState = base()) {
  const sent: [string, BtcView][] = []
  const saves: EventState[] = []
  const clock = { t: 1_000_000 }
  const host = new BtcHost(s, { send: (to, m) => sent.push([to, m]), save: (x) => saves.push(x), now: () => clock.t })
  const to = (peer: string) => sent.filter(([p]) => p === peer).map(([, m]) => m)
  const last = (peer: string) => to(peer).at(-1)
  return { host, sent, saves, clock, to, last }
}

const joinRef = (device: string, side: 'red' | 'blue' = 'red', code = '1234', field = 0): ClientMsg =>
  ({ t: 'join', role: 'ref', field, side, code, device })
const sheet = (o: number): HalfSheet => ({ ...emptySheet(), decorO: o })
const op = (device: string, seq: number, s: HalfSheet, submit = false, side: 'red' | 'blue' = 'red', matchId = 'r1-1'): ClientMsg =>
  ({ t: 'op', device, seq, field: 0, side, matchId, sheet: s, submit })

test('join sai mã hoặc sân chưa có mã ⇒ deny code', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1', 'red', '9999'))
  assert.deepEqual(h.last('c1'), { t: 'deny', reason: 'code' })
  h.host.onMessage('c1', joinRef('d1', 'red', '1234', 1))
  assert.deepEqual(h.last('c1'), { t: 'deny', reason: 'code' })
})

test('ghế trống ⇒ trọng tài nhận RefView idle; thư không bao giờ phát cho "*"', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1'))
  const v = h.last('c1') as RefView
  assert.equal(v.t, 'ref')
  assert.equal(v.phase, 'idle')
  assert.equal(v.match, null)
  assert.equal(v.clock, null)
  assert.equal(v.ackSeq, 0)
  assert.ok(h.sent.every(([p]) => p !== '*'))
})

test('hai máy cùng ghế ⇒ người sau waiting + pending; allow ⇒ người cũ taken, ghế sang máy mới', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onPeer('c2', true)
  h.host.onMessage('c1', joinRef('d1'))
  h.host.onMessage('c2', joinRef('d2'))
  assert.deepEqual(h.last('c2'), { t: 'deny', reason: 'waiting' })
  h.host.onMessage('c2', joinRef('d2')) // gửi lại không nhân đôi yêu cầu
  assert.deepEqual(h.host.pending, [{ field: 0, side: 'red', device: 'd2', peer: 'c2' }])
  h.host.allow(0, 'red')
  assert.deepEqual(h.last('c1'), { t: 'deny', reason: 'taken' })
  assert.equal((h.last('c2') as RefView).t, 'ref')
  assert.deepEqual(h.host.pending, [])
  // máy cũ không còn ghi được phiếu
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  const n = h.saves.length
  h.host.onMessage('c1', op('d1', 1, sheet(3)))
  assert.equal(h.saves.length, n)
  assert.equal(h.host.state.live[0]!.sheets.red, undefined)
})

test('cùng máy nối lại (peer mới) ⇒ nhận lại ghế, không ai bị deny', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1'))
  h.host.onPeer('c1', false)
  h.host.onPeer('c5', true)
  h.host.onMessage('c5', joinRef('d1'))
  assert.equal((h.last('c5') as RefView).t, 'ref')
  assert.ok(h.sent.every(([, m]) => m.t !== 'deny'))
  assert.deepEqual(h.host.pending, [])
})

test('máy khác vào khi người giữ ghế đang mất mạng ⇒ vẫn waiting', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1'))
  h.host.onPeer('c1', false)
  h.host.onPeer('c2', true)
  h.host.onMessage('c2', joinRef('d2'))
  assert.deepEqual(h.last('c2'), { t: 'deny', reason: 'waiting' })
})

test('release ⇒ ghế trống, người cũ nhận taken, máy mới vào được ngay', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onPeer('c2', true)
  h.host.onMessage('c1', joinRef('d1'))
  h.host.release(0, 'red')
  assert.deepEqual(h.last('c1'), { t: 'deny', reason: 'taken' })
  h.host.onMessage('c2', joinRef('d2'))
  assert.equal((h.last('c2') as RefView).t, 'ref')
})

test('op seq 3 gửi hai lần ⇒ save đúng một lần cho seq đó; seq cũ hơn bị bỏ, chỉ trả khung nhìn', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1'))
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  const n = h.saves.length
  h.host.onMessage('c1', op('d1', 3, sheet(2)))
  h.host.onMessage('c1', op('d1', 3, sheet(2)))
  assert.equal(h.saves.length, n + 1)
  h.host.onMessage('c1', op('d1', 2, sheet(9)))
  assert.equal(h.saves.length, n + 1)
  assert.equal(h.host.state.live[0]!.sheets.red!.decorO, 2)
  const v = h.last('c1') as RefView
  assert.equal(v.ackSeq, 3)
  assert.equal(v.sheet.decorO, 2)
})

test('op khi chưa có trận (idle) hoặc sai bên ⇒ bỏ, không lưu', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1'))
  h.host.onMessage('c1', op('d1', 1, sheet(1)))
  assert.equal(h.saves.length, 0)
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  h.host.onMessage('c1', op('d1', 2, sheet(1), false, 'blue'))
  assert.equal(h.saves.length, 1)
  assert.equal(h.host.state.live[0]!.sheets.blue, undefined)
})

test('tick: đồng hồ 190 s, chỉ gửi khi giây đổi; qua 190 s ⇒ inventory, lưu một lần', () => {
  const h = harness()
  h.host.onPeer('s1', true)
  h.host.onMessage('s1', { t: 'join', role: 'screen', field: 0 })
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  assert.equal((h.last('s1') as ScreenView).clock, 190)
  const n = h.to('s1').length
  h.clock.t += 100
  h.host.tick() // vẫn giây 190 (làm tròn lên) ⇒ không gửi
  assert.equal(h.to('s1').length, n)
  h.clock.t += 1000
  h.host.tick()
  assert.equal((h.last('s1') as ScreenView).clock, 189)
  h.clock.t = 1_000_000 + 189_500
  h.host.tick()
  assert.equal(h.host.state.live[0]!.phase, 'play')
  assert.equal((h.last('s1') as ScreenView).clock, 1)
  const saves = h.saves.length
  h.clock.t = 1_000_000 + 190_000
  h.host.tick()
  assert.equal(h.host.state.live[0]!.phase, 'inventory')
  assert.equal(h.saves.length, saves + 1)
  const v = h.last('s1') as ScreenView
  assert.equal(v.phase, 'inventory')
  assert.equal(v.clock, null)
  h.host.tick()
  assert.equal(h.saves.length, saves + 1)
})

test('skipTo: dời đồng hồ của một sân (móc cho e2e)', () => {
  const h = harness()
  h.host.onPeer('s1', true)
  h.host.onMessage('s1', { t: 'join', role: 'screen', field: 0 })
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  h.host.skipTo(0, 185)
  h.host.tick()
  assert.equal((h.last('s1') as ScreenView).clock, 5)
  h.host.skipTo(0, 190)
  h.host.tick()
  assert.equal(h.host.state.live[0]!.phase, 'inventory')
})

test('hai bên gửi kiểm kê ⇒ refs sent; BTC chốt ⇒ màn chiếu có official, next, ranking', () => {
  const h = harness()
  for (const p of ['c1', 'c2', 's1']) h.host.onPeer(p, true)
  h.host.onMessage('s1', { t: 'join', role: 'screen', field: 0 })
  h.host.onMessage('c1', joinRef('d1', 'red'))
  assert.deepEqual((h.last('s1') as ScreenView).refs, { red: 'on', blue: 'off' })
  h.host.onMessage('c2', joinRef('d2', 'blue'))
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  const live = h.last('s1') as ScreenView
  assert.deepEqual(live.teams, { red: ['Đội A', 'Đội B'], blue: ['Đội C', 'Đội D'] })
  assert.equal(live.official, null)
  assert.deepEqual(live.next, { teams: { red: ['Đội A', 'Đội C'], blue: ['Đội B', 'Đội D'] }, time: '08:07' })
  assert.deepEqual((h.last('c1') as RefView).match, { id: 'r1-1', teams: ['Đội A', 'Đội B'] })
  assert.deepEqual((h.last('c2') as RefView).match, { id: 'r1-1', teams: ['Đội C', 'Đội D'] })
  h.host.dispatch({ t: 'live.whistle', field: 0 })
  const red = { ...sheet(0), fire: { o: 2, g: 0 } } // 2 bóng cam vào Khu Chữa Cháy = 10 điểm
  h.host.onMessage('c1', op('d1', 1, red, true, 'red'))
  h.host.onMessage('c2', op('d2', 1, sheet(0), true, 'blue'))
  const before = h.last('s1') as ScreenView
  assert.deepEqual(before.refs, { red: 'sent', blue: 'sent' })
  assert.equal(before.score.total, 10)
  const n = h.saves.length
  h.host.dispatch({ t: 'live.commit', field: 0, now: h.clock.t })
  assert.equal(h.saves.length, n + 1)
  const v = h.last('s1') as ScreenView
  assert.equal(v.phase, 'idle')
  assert.deepEqual(v.official, [
    { side: 'red', seat: 0, name: 'Đội A', score: 10 }, { side: 'red', seat: 1, name: 'Đội B', score: 10 },
    { side: 'blue', seat: 0, name: 'Đội C', score: 10 }, { side: 'blue', seat: 1, name: 'Đội D', score: 10 },
  ])
  assert.deepEqual(v.next?.time, '08:07')
  assert.equal(v.ranking.length, 4)
  assert.ok(v.ranking.every((r) => r.rank > 0 && r.total === 10))
  // trận sau bắt đầu ⇒ hết official
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-2', now: h.clock.t })
  assert.equal((h.last('s1') as ScreenView).official, null)
  assert.equal((h.last('s1') as ScreenView).next, null)
})

test('màn chiếu: trọng tài mất mạng ⇒ refs off', () => {
  const h = harness()
  for (const p of ['c1', 's1']) h.host.onPeer(p, true)
  h.host.onMessage('s1', { t: 'join', role: 'screen', field: 0 })
  h.host.onMessage('c1', joinRef('d1', 'red'))
  h.host.onPeer('c1', false)
  assert.deepEqual((h.last('s1') as ScreenView).refs, { red: 'off', blue: 'off' })
})

test('mỗi dispatch gọi save đúng một lần; reduce lỗi ⇒ ném lại, không lưu, state giữ nguyên', () => {
  const h = harness()
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  assert.equal(h.saves.length, 1)
  assert.equal(h.saves[0], h.host.state)
  h.host.dispatch({ t: 'live.whistle', field: 0 })
  assert.equal(h.saves.length, 2)
  const s = h.host.state
  assert.throws(() => h.host.dispatch({ t: 'live.commit', field: 0, now: 1 }), /Chưa đủ hai bản kiểm kê/)
  assert.equal(h.saves.length, 2)
  assert.equal(h.host.state, s)
})

test('khởi động lại từ state đã lưu (inventory) ⇒ trọng tài nối lại thấy đúng sheet đã gửi', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1'))
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  h.host.dispatch({ t: 'live.whistle', field: 0 })
  h.host.onMessage('c1', op('d1', 7, sheet(4), true))
  const saved = JSON.parse(JSON.stringify(h.saves.at(-1))) as EventState
  const h2 = harness(saved)
  h2.host.onPeer('c9', true)
  h2.host.onMessage('c9', joinRef('d1'))
  const v = h2.last('c9') as RefView
  assert.equal(v.phase, 'inventory')
  assert.equal(v.sheet.decorO, 4)
  assert.deepEqual(v.sheet, sheet(4))
})

test('op của trận trước (matchId cũ) sau khi sân bắt đầu trận mới ⇒ bỏ, chỉ trả khung nhìn', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1'))
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  h.host.dispatch({ t: 'live.abort', field: 0 })
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-2', now: h.clock.t })
  const n = h.saves.length
  h.host.onMessage('c1', op('d1', 5, sheet(3), false, 'red', 'r1-1'))
  assert.equal(h.saves.length, n)
  assert.equal(h.host.state.live[0]!.sheets.red, undefined)
  assert.equal((h.last('c1') as RefView).match?.id, 'r1-2')
  // seq 5 bị bỏ nên chưa tính: op đúng trận cùng seq 5 vẫn được nhận
  h.host.onMessage('c1', op('d1', 5, sheet(3), false, 'red', 'r1-2'))
  assert.equal(h.saves.length, n + 1)
})

test('một máy không giữ được cả ghế Đỏ và Xanh của cùng sân', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', joinRef('d1', 'red'))
  h.host.onMessage('c1', joinRef('d1', 'blue'))
  assert.deepEqual(h.last('c1'), { t: 'deny', reason: 'taken' })
  h.host.onPeer('c2', true)
  h.host.onMessage('c2', joinRef('d2', 'blue'))
  assert.equal((h.last('c2') as RefView).side, 'blue')
})

test('mã sân sai kiểu / quá dài ⇒ deny code', () => {
  const h = harness()
  h.host.onPeer('c1', true)
  h.host.onMessage('c1', { t: 'join', role: 'ref', field: 0, side: 'red', code: 1234, device: 'd1' } as never)
  assert.deepEqual(h.last('c1'), { t: 'deny', reason: 'code' })
  h.host.onMessage('c1', joinRef('d1', 'red', '1234'.repeat(3)))
  assert.deepEqual(h.last('c1'), { t: 'deny', reason: 'code' })
})

/** Hai sân đang đấu (r1-1 sân 0, r1-3 sân 1), trọng tài d1 giữ Đỏ sân 0, màn chiếu sân 0. */
function twoFields() {
  const s0 = reduce(base(), { t: 'round.schedule', roundId: 'r1', matches: [
    { id: 'r1-1', slot: 0, field: 0, red: ['t1', 't2'], blue: ['t3', 't4'] },
    { id: 'r1-2', slot: 1, field: 0, red: ['t1', 't3'], blue: ['t2', 't4'] },
    { id: 'r1-3', slot: 0, field: 1, red: ['t2', 't3'], blue: ['t1', 't4'] },
  ] })
  const h = harness(s0)
  for (const p of ['c1', 's1']) h.host.onPeer(p, true)
  h.host.onMessage('s1', { t: 'join', role: 'screen', field: 0 })
  h.host.onMessage('c1', joinRef('d1'))
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  h.host.dispatch({ t: 'live.start', field: 1, matchId: 'r1-3', now: h.clock.t })
  return h
}

const good = (): Record<string, unknown> => ({ t: 'op', device: 'd1', seq: 1, field: 0, side: 'red', matchId: 'r1-1', sheet: emptySheet(), submit: false })
const withSheet = (patch: (x: Record<string, any>) => void) => {
  const m = good()
  const sh = structuredClone(emptySheet()) as unknown as Record<string, any>
  patch(sh)
  m.sheet = sh
  return m
}
const fault = { team: 0, code: 'G1', kind: 'minor', at: 3 }
const GARBAGE: [string, unknown][] = [
  ['null', null], ['số', 42], ['chuỗi', 'op'], ['mảng', []], ['rỗng', {}], ['op trơn', { t: 'op' }],
  ['field chuỗi', { ...good(), field: '0' }], ['field âm', { ...good(), field: -1 }], ['field quá lớn', { ...good(), field: 99 }],
  ['seq chuỗi', { ...good(), seq: '5' }], ['seq khổng lồ', { ...good(), seq: 1e20 }], ['seq 0', { ...good(), seq: 0 }],
  ['seq lẻ', { ...good(), seq: 1.5 }], ['side lạ', { ...good(), side: 'green' }], ['device rỗng', { ...good(), device: '' }],
  ['device dài', { ...good(), device: 'x'.repeat(65) }], ['device số', { ...good(), device: 7 }], ['matchId số', { ...good(), matchId: 1 }],
  ['sheet rỗng', { ...good(), sheet: {} }], ['sheet null', { ...good(), sheet: null }],
  ['decorO 1e9', withSheet((x) => { x.decorO = 1e9 })], ['decorO lẻ', withSheet((x) => { x.decorO = 1.5 })],
  ['fire âm', withSheet((x) => { x.fire.o = -50 })], ['fire chuỗi', withSheet((x) => { x.fire.g = '3' })],
  ['mtn thiếu rãnh', withSheet((x) => { x.mtn[0].pop() })], ['mtn một núi', withSheet((x) => { x.mtn.pop() })],
  ['mtn 301', withSheet((x) => { x.mtn[1][2].g = 301 })],
  ['cờ chuỗi', withSheet((x) => { x.flags = ['a', false] })], ['leo lạ', withSheet((x) => { x.climbs = ['fly', 'none'] })],
  ['phạt đỏ chuỗi', withSheet((x) => { x.pens[0].red = 'yes' })], ['lỗi nhẹ 21', withSheet((x) => { x.pens[1].minor = 21 })],
  ['thiếu pens', withSheet((x) => { x.pens = [x.pens[0]] })],
  ['51 lỗi', withSheet((x) => { x.faults = Array.from({ length: 51 }, () => ({ ...fault })) })],
  ['mã lỗi dài', withSheet((x) => { x.faults = [{ ...fault, code: 'X'.repeat(17) }] })],
  ['lỗi đội 2', withSheet((x) => { x.faults = [{ ...fault, team: 2 }] })], ['lỗi kind lạ', withSheet((x) => { x.faults = [{ ...fault, kind: 'boom' }] })],
  ['lỗi at NaN', withSheet((x) => { x.faults = [{ ...fault, at: 'x' }] })],
  ['join field chuỗi', { t: 'join', role: 'ref', field: '0', side: 'blue', code: '1234', device: 'd9' }],
  ['join side lạ', { t: 'join', role: 'ref', field: 0, side: 'green', code: '1234', device: 'd9' }],
  ['join device số', { t: 'join', role: 'ref', field: 0, side: 'blue', code: '1234', device: 9 }],
  ['screen field âm', { t: 'join', role: 'screen', field: -1 }], ['screen field chuỗi', { t: 'join', role: 'screen', field: 'a' }],
]

test('thư rác: không ném, không lưu, state không đổi, sân khác vẫn thổi còi', () => {
  for (const [name, m] of GARBAGE) {
    const h = twoFields()
    const n = h.saves.length
    const before = structuredClone(h.host.state)
    assert.doesNotThrow(() => h.host.onMessage('c1', m as ClientMsg), name)
    assert.doesNotThrow(() => h.host.onPeer(m as string, true), name)
    assert.equal(h.saves.length, n, name)
    assert.deepEqual(h.host.state, before, name)
    h.clock.t += 190_000
    assert.doesNotThrow(() => h.host.tick(), name)
    assert.equal(h.host.state.live[0]!.phase, 'inventory', name)
    assert.equal(h.host.state.live[1]!.phase, 'inventory', name)
  }
  // đối chứng: thư đúng thì được nhận (bảng trên không đỏ vì lý do khác)
  const h = twoFields()
  const n = h.saves.length
  h.host.onMessage('c1', withSheet((x) => { x.faults = [{ ...fault }]; x.decorO = 300 }) as ClientMsg)
  assert.equal(h.saves.length, n + 1)
})

test('state đã lưu bị hỏng ở một sân ⇒ tick sân khác vẫn chạy', () => {
  const h0 = twoFields()
  const s = structuredClone(h0.host.state)
  s.live[0]!.sheets.red = {} as HalfSheet // file cũ hỏng
  const h = harness(s)
  h.host.onPeer('s1', true)
  h.host.onMessage('s1', { t: 'join', role: 'screen', field: 0 })
  h.clock.t += 190_000
  assert.doesNotThrow(() => h.host.tick())
  assert.equal(h.host.state.live[1]!.phase, 'inventory')
})

test('ghế trống: màn chiếu teams luôn 2 phần tử theo ghế, official khớp side/seat', () => {
  const s = reduce(base(), { t: 'round.schedule', roundId: 'r1', matches: [{ id: 'r1-1', slot: 0, field: 0, red: ['t1', null], blue: [null, 't4'] }] })
  const h = harness(s)
  for (const p of ['c1', 'c2', 's1']) h.host.onPeer(p, true)
  h.host.onMessage('s1', { t: 'join', role: 'screen', field: 0 })
  h.host.onMessage('c1', joinRef('d1', 'red'))
  h.host.onMessage('c2', joinRef('d2', 'blue'))
  h.host.dispatch({ t: 'live.start', field: 0, matchId: 'r1-1', now: h.clock.t })
  assert.deepEqual((h.last('s1') as ScreenView).teams, { red: ['Đội A', ''], blue: ['', 'Đội D'] })
  h.host.dispatch({ t: 'live.whistle', field: 0 })
  h.host.onMessage('c1', op('d1', 1, { ...sheet(0), fire: { o: 2, g: 0 } }, true, 'red'))
  h.host.onMessage('c2', op('d2', 1, sheet(0), true, 'blue'))
  h.host.dispatch({ t: 'live.commit', field: 0, now: h.clock.t })
  assert.deepEqual((h.last('s1') as ScreenView).official, [
    { side: 'red', seat: 0, name: 'Đội A', score: 10 }, { side: 'blue', seat: 1, name: 'Đội D', score: 10 },
  ])
})
