import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MACHINE_TEAMS, nextMatch, record, type TournamentState } from '../tournament.ts'
import { SEATS } from '../quickmatch.ts'
import type { RobotConfig } from '../robots.ts'
import {
  entrantLabel, machinesFor, matchLine, matchSeed, newTournament, pendingMachines, played, playersIn, progressText, recorded,
  saveTournamentVerified, seatIds, standingRows,
} from './tournament.ts'

const maker: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const co: RobotConfig = { type: 'co', drive: 'omni', actuator: 'tt' }
const one = (seed = 3, perTeam = 4) => newTournament({ names: ['Tuấn', 'Minh'], cfgs: [maker, co], players: 1, perTeam, seed })
/** Ghi trận i với điểm trận `score`, mọi đội không phạt. */
const play = (s: TournamentState, i: number, score: number, pen: Record<string, number> = {}) =>
  record(s, i, played(seatIds(s.schedule[i]), seatIds(s.schedule[i]).map((id) => ({ score: Math.max(0, score - (pen[id] ?? 0)), penalty: pen[id] ?? 0 })), score))

test('newTournament: 1 bạn ⇒ 7 đội máy theo MACHINE_TEAMS, 2 bạn ⇒ 6; robot người chơi là bản sao', () => {
  assert.equal(machinesFor(1).length, 7)
  assert.equal(machinesFor(2).length, 6)
  const a = one()
  assert.equal(a.entrants.length, 8)
  assert.deepEqual(a.entrants.filter((e) => e.kind === 'machine').map((e) => e.name), MACHINE_TEAMS.slice(0, 7).map((m) => m.name))
  assert.deepEqual(a.entrants[0], { name: 'Tuấn', robot: maker, player: 0, id: 'p0', kind: 'player' })
  assert.notEqual(a.entrants[0].robot, maker)
  const b = newTournament({ names: ['Tuấn', 'Minh'], cfgs: [maker, co], players: 2, perTeam: 5, seed: 9 })
  assert.equal(b.entrants.filter((e) => e.kind === 'machine').length, 6)
  assert.deepEqual(b.entrants.slice(0, 2).map((e) => [e.name, e.player, e.robot.type]), [['Tuấn', 0, 'maker'], ['Minh', 1, 'co']])
  assert.equal(b.schedule.length, 10)
})

test('seatIds theo thứ tự ghế SEATS; playersIn cho ghế của từng bạn trong trận', () => {
  const s = one()
  const slot = s.schedule[0]
  assert.deepEqual(seatIds(slot), [slot.red[0], slot.blue[0], slot.red[1], slot.blue[1]])
  const ids = seatIds(slot)
  SEATS.forEach(([a, k], i) => assert.equal(ids[i], slot[a][k]))
  for (let i = 0; i < s.schedule.length; i++) {
    const seat = seatIds(s.schedule[i]).indexOf('p0')
    assert.deepEqual(playersIn(s, i), seat < 0 ? [] : [{ player: 0, seat }])
  }
  // Mỗi vòng 8 đội đều đấu: bạn duy nhất có đúng một trận mỗi vòng.
  for (let r = 0; r < s.perTeam; r++) assert.equal(playersIn(s, 2 * r).length + playersIn(s, 2 * r + 1).length, 1)
})

test('played: điểm / phạt theo id đội; matchSeed ổn định, khác nhau theo trận', () => {
  const p = played(['a', 'b', 'c', 'd'], [{ score: 10, penalty: 0 }, { score: 5, penalty: 5 }, { score: 10, penalty: 0 }, { score: 0, penalty: 10 }], 10)
  assert.deepEqual(p, { matchScore: 10, teams: { a: { score: 10, penalty: 0 }, b: { score: 5, penalty: 5 }, c: { score: 10, penalty: 0 }, d: { score: 0, penalty: 10 } } })
  const s = one()
  assert.equal(matchSeed(s, 2), matchSeed(one(), 2))
  assert.equal(new Set(s.schedule.map((_, i) => matchSeed(s, i))).size, s.schedule.length)
  assert.notEqual(matchSeed(s, 0), matchSeed(one(4), 0))
})

test('pendingMachines: các trận toàn máy liền nhau từ trận kế tới trước trận có người chơi', () => {
  let s = one()
  const mine = (i: number) => playersIn(s, i).length > 0
  for (;;) {
    const i = nextMatch(s)
    if (i === null) break
    const pend = pendingMachines(s)
    if (mine(i)) assert.deepEqual(pend, [])
    else {
      assert.ok(pend.length > 0 && pend[0] === i && pend.every((k, j) => k === i + j && !mine(k)))
      const after = i + pend.length
      assert.ok(after === s.schedule.length || mine(after))
    }
    s = play(s, i, 100)
  }
  assert.deepEqual(pendingMachines(s), [])
})

test('progressText: "Đấu tiếp · trận x/y" theo vòng; xong ⇒ bục trao giải; recorded đếm trận đã ghi', () => {
  let s = one()
  assert.equal(progressText(s), 'Đấu tiếp · trận 1/4')
  s = play(s, 0, 50)
  assert.equal(progressText(s), 'Đấu tiếp · trận 1/4')
  assert.equal(recorded(s), 1)
  s = play(s, 1, 50)
  assert.equal(progressText(s), 'Đấu tiếp · trận 2/4')
  for (let i = 2; i < 8; i++) s = play(s, i, 50)
  assert.equal(recorded(s), 8)
  assert.equal(progressText(s), 'Giải đã xong · xem bục trao giải')
})

test('standingRows: 8 dòng, điểm các trận "a + b", tạm tính giữa giải, ghi bốc thăm khi hoà hết tiêu chí', () => {
  let s = one()
  const fresh = standingRows(s, () => 'Mặc định')
  assert.equal(fresh.length, 8)
  assert.ok(fresh.every((r) => r.provisional && r.scores === '—' && r.total === 0 && r.tie))
  // Trận 0 điểm 200, trận 1 điểm 100: đội trận 0 xếp trên; đội bị phạt 20 ở trận 0 xếp cuối nhóm đó.
  const ids0 = seatIds(s.schedule[0])
  s = play(s, 0, 200, { [ids0[0]]: 20 })
  s = play(s, 1, 100)
  const rows = standingRows(s, (e) => (e.kind === 'player' ? 'Của em v2' : ''))
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(rows.slice(0, 3).map((r) => r.total), [200, 200, 200])
  assert.equal(rows[3].id, ids0[0])
  assert.equal(rows[3].scores, '180')
  assert.ok(rows[0].tie && rows[2].tie && !rows[3].tie)
  s = play(s, 2, 30)
  const r2 = standingRows(s, () => '')
  const top = r2.find((r) => r.id === seatIds(s.schedule[2]).find((id) => ids0.includes(id) && id !== ids0[0]))
  if (top) assert.equal(top.scores, '200 + 30')
  const p0 = r2.find((r) => r.id === 'p0')!
  assert.equal(p0.name, 'Tuấn')
  assert.equal(p0.player, true)
  assert.equal(p0.label, 'Tuấn (Mẫu Maker · 2 bánh)')
  assert.equal(rows.find((r) => r.id === 'p0')!.label, 'Tuấn (Mẫu Maker · 2 bánh, Của em v2)')
})

test('entrantLabel: người chơi kèm robot + chương trình, đội máy kèm mức', () => {
  const s = one()
  assert.equal(entrantLabel(s.entrants[0], 'Của em v3'), 'Tuấn (Mẫu Maker · 2 bánh, Của em v3)')
  const m = s.entrants.find((e) => e.kind === 'machine' && e.skill === 'hard')!
  assert.equal(entrantLabel(m), `${m.name} (Máy Khó)`)
})

test('matchLine: tên hai liên minh, có người chơi không', () => {
  const s = one()
  for (let i = 0; i < s.schedule.length; i++) {
    const l = matchLine(s, i)
    const name = (id: string) => s.entrants.find((e) => e.id === id)!.name
    assert.deepEqual(l.red, s.schedule[i].red.map(name))
    assert.deepEqual(l.blue, s.schedule[i].blue.map(name))
    assert.equal(l.mine, playersIn(s, i).length > 0)
    assert.equal(l.round, Math.floor(i / 2) + 1)
  }
})

test('saveTournamentVerified: đọc lại đúng ⇒ true; bộ nhớ đầy (ghi không vào) ⇒ false; null xoá', () => {
  const s = one()
  let kept: unknown = null
  const good = { saveTournament: (v: TournamentState | null) => void (kept = v && JSON.parse(JSON.stringify(v))), tournament: () => kept as TournamentState | null }
  assert.equal(saveTournamentVerified(good, s), true)
  const full = { saveTournament: () => {}, tournament: () => null }
  assert.equal(saveTournamentVerified(full, s), false)
  // Ghi không vào nhưng còn bản cũ (trận trước): vẫn là không lưu được.
  const stale = { saveTournament: () => {}, tournament: () => s }
  assert.equal(saveTournamentVerified(stale, play(s, 0, 10)), false)
  assert.equal(saveTournamentVerified(good, null), true)
  assert.equal(kept, null)
})
