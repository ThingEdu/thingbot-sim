import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BLOCK_SECONDS, FAULTS, fanrocRules, PER_TEAM, POINTS, signed } from './rules-data.ts'
import { allianceShare, scoreTally, teamScore, type FieldTally } from './scoring.ts'
import { ENDGAME_S, MATCH_S, RELEASE_S } from './layout.ts'
import { TEAM_COUNT } from './tournament.ts'

const blank = (): FieldTally => ({
  fire: { o: 0, g: 0 },
  mtn: [0, 1, 2, 3].map(() => [{ g: 0, o: 0 }, { g: 0, o: 0 }, { g: 0, o: 0 }]),
  flags: [false, false, false, false],
  parks: { red: [null, null], blue: [null, null] },
})

test('POINTS: số điểm đọc từ scoring.ts lúc chạy (không gõ tay)', () => {
  const t = blank()
  t.mtn[0][2].g = 2
  assert.equal(scoreTally(t).r3, 2 * POINTS.r3)
  const f = blank()
  f.fire.o = 3
  assert.equal(scoreTally(f).total, 3 * POINTS.fire)
  const w = blank()
  w.fire.g = 1
  w.mtn[1][0].o = 1
  assert.equal(scoreTally(w).total, 2 * POINTS.wrong)
  assert.ok(POINTS.wrong < 0)
  const fl = blank()
  fl.flags[2] = true
  assert.equal(scoreTally(fl).flag, POINTS.flag)
  fl.mtn[2].forEach((x) => (x.g = 1))
  assert.equal(scoreTally(fl).flag, POINTS.flagFull)
  const p = blank()
  p.parks.red = ['full', 'full']
  p.parks.blue = ['partial', null]
  const sh = allianceShare(p)
  assert.equal(sh.red.park + sh.red.bonus, 2 * POINTS.parkFull + POINTS.parkBonus)
  assert.equal(sh.blue.park, POINTS.parkPartial)
  assert.equal(teamScore(100, { minor: 2, yellow: 1, red: false }), 100 - 2 * POINTS.minor - POINTS.yellow)
  // Bảng của luật hiện tại (nếu scoring.ts đổi thì thẻ đổi theo; phép thử này nhắc người sửa xem lại lời thẻ).
  assert.deepEqual(POINTS, { fire: 5, r1: 5, r2: 10, r3: 15, flag: 20, flagFull: 40, parkPartial: 5, parkFull: 10, parkBonus: 10, wrong: -3, minor: 5, yellow: 10 })
})

test('signed: dấu cộng / dấu trừ chuẩn (−, không phải -)', () => {
  assert.equal(signed(15), '+15')
  assert.equal(signed(-3), '−3')
  assert.equal(signed(0), '0')
})

test('thẻ Luật chơi: đủ 5 thẻ, bảng điểm có "+15" cho Rãnh 3, mỗi thẻ có hình SVG', () => {
  const cards = fanrocRules()
  assert.deepEqual(cards.map((c) => c.id), ['field', 'match', 'score', 'faults', 'tournament'])
  const score = cards.find((c) => c.id === 'score')!
  const r3 = score.rows!.find((r) => /Rãnh 3/.test(r.label))
  assert.equal(r3?.value, '+15')
  for (const c of cards) {
    assert.match(c.art, /^<svg [^>]*viewBox="[^"]+"/, `${c.id}: thiếu SVG`)
    assert.doesNotMatch(c.art, /<image|href=|https?:/, `${c.id}: hình không được tải từ ngoài`)
    assert.ok(c.title && c.lead, c.id)
  }
  const match = cards.find((c) => c.id === 'match')!
  const text = [match.lead, ...(match.bullets ?? [])].join(' ')
  assert.ok(text.includes(`${RELEASE_S} giây`) && text.includes(`${MATCH_S / 60} phút`) && text.includes(`${ENDGAME_S} giây`), text)
  const tour = cards.find((c) => c.id === 'tournament')!
  const tt = [tour.lead, ...(tour.bullets ?? [])].join(' ')
  assert.ok(tt.includes(`${TEAM_COUNT} đội`) && tt.includes(`${PER_TEAM.min}–${PER_TEAM.max} trận`), tt)
})

test('PER_TEAM: số trận mỗi đội dò từ createTournament (4–10)', () => {
  assert.deepEqual(PER_TEAM, { min: 4, max: 10 })
})

test('FAULTS: đúng các lỗi trọng tài tự động trong match.ts, mức phạt khớp lời gọi foul()', () => {
  const src = readFileSync(resolve(import.meta.dirname, 'match.ts'), 'utf8')
  // Mã lỗi nào match.ts ghi thì thẻ có, và ngược lại.
  const inMatch = [...new Set([...src.matchAll(/this\.foul\([^)]*?\((P\d+|S\d+|G\d+)\)/g)].map((m) => m[1]))].sort()
  assert.deepEqual(FAULTS.map((f) => f.code).sort(), inMatch)
  for (const f of FAULTS) {
    const calls = [...src.matchAll(new RegExp(`this\\.foul\\([^\\n]*\\(${f.code}\\)[^\\n]*`, 'g'))].map((m) => m[0])
    const kinds = new Set(calls.flatMap((c) => [...c.matchAll(/'(warn|minor|yellow)'/g)].map((m) => m[1])))
    assert.deepEqual([...kinds].sort(), [...f.pens].sort(), `${f.code}: ${calls.join(' | ')}`)
  }
  const block = /const BLOCK_S = (\d+(?:\.\d+)?)/.exec(src)
  assert.equal(Number(block?.[1]), BLOCK_SECONDS)
  const g15 = FAULTS.find((f) => f.code === 'G15')!
  assert.ok(g15.text.includes(`${BLOCK_SECONDS} giây`))
  const faults = fanrocRules().find((c) => c.id === 'faults')!
  const all = [faults.lead, ...(faults.bullets ?? []), ...(faults.rows ?? []).flatMap((r) => [r.label, r.value])].join(' ')
  assert.ok(all.includes(signed(-POINTS.minor)) && all.includes(signed(-POINTS.yellow)), all)
})
