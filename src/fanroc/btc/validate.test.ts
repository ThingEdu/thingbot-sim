import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySheet } from './event.ts'
import { sanitizeSheet } from './validate.ts'

test('sanitizeSheet: phiếu đúng ⇒ bản sao sạch (bỏ trường lạ); sai kiểu / ngoài khoảng ⇒ null', () => {
  const ok = { ...emptySheet(), decorO: 300, extra: 'x', faults: [{ team: 1, code: 'Y2', kind: 'yellow', at: 12.5, junk: 1 }] }
  ok.pens[0].minor = 20
  const r = sanitizeSheet(ok)!
  assert.ok(r)
  assert.equal('extra' in r, false)
  assert.deepEqual(r.faults, [{ team: 1, code: 'Y2', kind: 'yellow', at: 12.5 }])
  assert.equal(r.decorO, 300)
  assert.notEqual(r.mtn, ok.mtn)
  for (const bad of [null, 1, 'x', [], {}, { ...emptySheet(), decorO: 301 }, { ...emptySheet(), decorO: -1 },
    { ...emptySheet(), climbs: ['none'] }, { ...emptySheet(), flags: [true, 1] },
    { ...emptySheet(), pens: [{ minor: 0, yellow: 21, red: false, warn: 0 }, emptySheet().pens[1]] },
    { ...emptySheet(), faults: {} }, { ...emptySheet(), fire: { o: Number.NaN, g: 0 } }]) {
    assert.equal(sanitizeSheet(bad), null, JSON.stringify(bad))
  }
})

// ---------- validateEvent: file giải đã lưu / mở từ máy ----------
import { newEvent, reduce, type Action, type EventState } from './event.ts'
import { makeSchedule } from './schedule.ts'
import { validateEvent } from './validate.ts'

/** Giải thật qua reduce: 12 đội, 1 vòng, 1 trận đã chốt + sửa, 1 trận đang đấu, mã sân, 1 đội rút lui. */
function realEvent(): EventState {
  const T = (i: number) => ({ code: `D${i}`, name: `Đội ${i}`, school: 'THCS', province: 'HN', advisor: '' })
  let s = reduce(newEvent('Giải A', 1), { t: 'teams', teams: Array.from({ length: 12 }, (_, i) => T(i + 1)) })
  const ids = s.teams.map((t) => t.id)
  s = reduce(s, { t: 'round.add', name: 'Sơ loại', teamIds: ids, perTeam: 5, fields: 2, slotMin: 7, startAt: '08:00', seed: 9 })
  const run = (...as: Action[]) => (s = as.reduce(reduce, s))
  run({ t: 'round.schedule', roundId: 'r1', matches: makeSchedule({ teamIds: ids, perTeam: 5, fields: 2, seed: 9, roundId: 'r1' }).matches },
    { t: 'code.new', field: 0, code: '0123' }, { t: 'code.new', field: 1, code: '9876' })
  const sh = { ...emptySheet(), decorO: 2 }
  run({ t: 'live.start', field: 0, matchId: 'r1-1', now: 1000 }, { t: 'live.whistle', field: 0 },
    { t: 'live.sheet', field: 0, side: 'red', sheet: sh, submit: true }, { t: 'live.sheet', field: 0, side: 'blue', sheet: emptySheet(), submit: true },
    { t: 'live.commit', field: 0, now: 2000 },
    { t: 'result.edit', roundId: 'r1', matchId: 'r1-1', result: { red: emptySheet(), blue: sh, committedAt: 2000 }, now: 3000 },
    { t: 'live.start', field: 1, matchId: 'r1-2', now: 4000 }, { t: 'live.sheet', field: 1, side: 'blue', sheet: sh, submit: false },
    { t: 'team.withdraw', id: 't12' })
  return s
}

test('validateEvent: giải thật lưu ra JSON đọc lại y nguyên', () => {
  const s = realEvent()
  const back = validateEvent(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(back, s)
  assert.deepEqual(validateEvent(JSON.parse(JSON.stringify(newEvent('Trống', 1)))), newEvent('Trống', 1))
})

test('validateEvent: file hỏng ở bất cứ tầng nào ⇒ null', () => {
  const bad: [string, (s: any) => void][] = [
    ['version lạ', (s) => (s.version = 2)],
    ['trận rỗng', (s) => (s.rounds[0].matches = [{}])],
    ['vòng thiếu teamIds', (s) => delete s.rounds[0].teamIds],
    ['teamIds không phải chuỗi', (s) => (s.rounds[0].teamIds = [1])],
    ['phiếu kết quả hỏng', (s) => (s.rounds[0].results['r1-1'].red.decorO = -1)],
    ['kết quả thiếu committedAt', (s) => delete s.rounds[0].results['r1-1'].committedAt],
    ['kết quả của trận không có', (s) => (s.rounds[0].results['r9-9'] = s.rounds[0].results['r1-1'])],
    ['nhật ký sửa hỏng', (s) => (s.rounds[0].edits[0].after = null)],
    ['đội thiếu tên', (s) => delete s.teams[0].name],
    ['withdrawn không phải bool', (s) => (s.teams[0].withdrawn = 'no')],
    ['giờ bắt đầu sai', (s) => (s.rounds[0].startAt = '8h')],
    ['sân ngoài khoảng', (s) => (s.rounds[0].matches[0].field = 16)],
    ['lượt âm', (s) => (s.rounds[0].matches[0].slot = -1)],
    ['ghế không phải 2 phần tử', (s) => (s.rounds[0].matches[0].red = ['t1'])],
    ['perTeam không nguyên', (s) => (s.rounds[0].perTeam = 2.5)],
    ['live pha lạ', (s) => (s.live[1].phase = 'xx')],
    ['live trận không có', (s) => (s.live[1].matchId = 'r9-9')],
    ['live phiếu hỏng', (s) => (s.live[1].sheets.blue = { fire: 1 })],
    ['live submitted không bool', (s) => (s.live[1].submitted = { red: 1 })],
    ['live sân không phải số', (s) => (s.live.x = null)],
    ['mã sân không 4 số', (s) => (s.codes[0] = '12')],
    ['teams không phải mảng', (s) => (s.teams = {})],
  ]
  for (const [name, hurt] of bad) {
    const s = JSON.parse(JSON.stringify(realEvent()))
    hurt(s)
    assert.equal(validateEvent(s), null, name)
  }
  for (const x of [null, 1, 'x', [], {}]) assert.equal(validateEvent(x), null)
})
