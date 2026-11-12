import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BLOCK_SECONDS, CLIMB_EXAMPLE, FAULTS, fanrocRules, PER_TEAM, POINTS, signed } from './rules-data.ts'
import { scoreTally, teamScore, type FieldTally } from './scoring.ts'
import { MATCH_S, RELEASE_S } from './layout.ts'
import { TEAM_COUNT } from './tournament.ts'

const blank = (): FieldTally => ({
  fire: { o: 0, g: 0 },
  mtn: [0, 1, 2, 3].map(() => [{ g: 0, o: 0 }, { g: 0, o: 0 }, { g: 0, o: 0 }]),
  flags: [false, false, false, false],
  decorO: 0,
  climbs: { red: ['none', 'none'], blue: ['none', 'none'] },
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
  assert.equal(teamScore(100, { minor: 2, yellow: 1, red: false }), 100 - 2 * POINTS.minor - POINTS.yellow)
  // Bảng của luật hiện tại (nếu scoring.ts đổi thì thẻ đổi theo; phép thử này nhắc người sửa xem lại lời thẻ).
  assert.deepEqual(POINTS, {
    fire: 5, r1: 5, r2: 10, r3: 15, flag: 20, flagFull: 40, wrong: -3, decorOrange: -3,
    climb: { contact: 5, ground: 10, water: 20 }, minor: 5, yellow: 10,
  })
})

test('signed: dấu cộng / dấu trừ chuẩn (−, không phải -)', () => {
  assert.equal(signed(15), '+15')
  assert.equal(signed(-3), '−3')
  assert.equal(signed(0), '0')
})

test('thẻ Luật chơi: đủ 6 thẻ, bảng điểm có "+15" cho Rãnh 3, mỗi thẻ có hình SVG', () => {
  const cards = fanrocRules()
  assert.deepEqual(cards.map((c) => c.id), ['field', 'match', 'score', 'climb', 'faults', 'tournament'])
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
  assert.ok(text.includes(`${RELEASE_S} giây`) && text.includes(`${MATCH_S / 60} phút`), text)
  assert.ok(!text.includes('End Game'), 'luật V4 không còn End Game')
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

test('lời thẻ khớp luật chung điểm: không gọi liên minh kia là "đối thủ"; thẻ đỏ ⇒ đội được 0 điểm (không phải 0 điểm trận)', () => {
  const cards = fanrocRules()
  const all = cards.flatMap((c) => [c.lead, ...(c.bullets ?? []), ...(c.rows ?? []).flatMap((r) => [r.label, r.value]), c.note ?? '']).join(' ')
  assert.ok(!/đối thủ/i.test(all), 'còn chữ "đối thủ" — cả 4 đội nhận chung điểm trận')
  const faults = cards.find((c) => c.id === 'faults')!
  assert.ok(!faults.lead.includes('0 điểm trận') && /thẻ đỏ thì đội đó được 0 điểm/.test(faults.lead), faults.lead)
  // Khớp teamScore: thẻ đỏ ⇒ điểm đội 0 dù điểm trận cao.
  assert.equal(teamScore(500, { minor: 0, yellow: 0, red: true }), 0)
})

/** Toàn bộ chữ của một thẻ, kể cả hình SVG và chữ thay hình. */
const cardText = (c: ReturnType<typeof fanrocRules>[number]) =>
  [c.title, c.lead, ...(c.bullets ?? []), ...(c.rows ?? []).flatMap((r) => [r.label, r.value]), c.note ?? '', c.art, c.alt].join(' ')

test('thẻ Leo Thang Cứu Hỏa: 3 mức đúng số dò từ scoring.ts; ví dụ ⌈205 × 1,55⌉ = 318 tính bằng scoreTally', () => {
  // Mức leo dò lúc chạy (multPct của một robot ở mức đó), không gõ tay.
  assert.deepEqual(POINTS.climb, { contact: 5, ground: 10, water: 20 })
  const card = fanrocRules().find((c) => c.id === 'climb')!
  assert.deepEqual(card.rows!.map((r) => r.value), ['+0,05', '+0,10', '+0,20'])
  assert.match(card.rows![0].label, /Chạm/)
  assert.match(card.rows![1].label, /Đất/)
  assert.match(card.rows![2].label, /Nước/)
  // Ví dụ lấy từ scoreTally của một sân giả: đúng 205 điểm nhiệm vụ, hệ số 155 %.
  assert.deepEqual([CLIMB_EXAMPLE.mission, CLIMB_EXAMPLE.multPct, CLIMB_EXAMPLE.total], [205, 155, 318])
  const ex = cardText(card)
  assert.ok(ex.includes('⌈205 × 1,55⌉ = 318'), ex)
  assert.ok(ex.includes('THANG') && /<line|<path/.test(card.art), 'hình thẻ leo phải vẽ thanh xà và ô THANG')
})

test('thẻ Luật chơi luật V4: không còn "Vùng Bảo Vệ" / "Bảo Vệ" / "End Game" / đỗ ở bất kỳ đâu; sân vẽ 2 thanh xà và ô "THANG"', () => {
  const cards = fanrocRules()
  for (const c of cards) {
    const t = cardText(c)
    assert.doesNotMatch(t, /Bảo Vệ|BẢO VỆ|End Game|(^|\s)đỗ(\s|$|[.,])/i, c.id)
  }
  const field = cards.find((c) => c.id === 'field')!
  assert.equal((field.art.match(/data-bar="(red|blue)"/g) ?? []).length, 2, 'hai thanh xà')
  assert.equal((field.art.match(/>THANG</g) ?? []).length, 2, 'hai ô vàng THANG')
  assert.equal((field.art.match(/data-divider/g) ?? []).length, 2, 'hai vạch Đất / Nước')
})

test('tầng trang trí: không tính điểm; bóng cam ở bất kỳ đâu trên núi −3 (dò từ scoreTally)', () => {
  assert.equal(POINTS.decorOrange, POINTS.wrong)
  const score = fanrocRules().find((c) => c.id === 'score')!
  const t = cardText(score)
  assert.ok(t.includes('không tính điểm'), t)
  assert.ok(t.includes(`bóng cam ở bất kỳ đâu trên núi ${signed(POINTS.decorOrange)}`), t)
  assert.ok(!/tính như ở rãnh/.test(t), 'luật cũ: bóng xanh tầng trang trí tính như rãnh dưới')
})
