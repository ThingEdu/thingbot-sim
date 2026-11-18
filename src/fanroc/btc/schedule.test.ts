import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeSchedule, slotTime } from './schedule.ts'
import type { EMatch } from './event.ts'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`)
const seatsOf = (m: EMatch) => [...m.red, ...m.blue] as string[]
const CASES: [number, number, number][] = [[8, 5, 1], [12, 5, 2], [30, 5, 1], [31, 5, 2], [90, 5, 3], [120, 10, 4]]

for (const [n, p, f] of CASES) {
  test(`lịch (${n} đội, ${p} trận, ${f} sân) hợp lệ`, () => {
    const teamIds = ids(n)
    const { matches, quality, notes } = makeSchedule({ teamIds, perTeam: p, fields: f, seed: 11, roundId: 'r1' })
    const fu = Math.min(f, Math.floor(n / 4))
    assert.equal(quality.fieldsUsed, fu)
    const want = Math.ceil((n * p) / 4) * 4 - n * p
    assert.equal(quality.extra.length, want)
    const played = new Map<string, number>(teamIds.map((t) => [t, 0]))
    const bySlot = new Map<number, EMatch[]>()
    for (const m of matches) {
      const s = seatsOf(m)
      assert.equal(new Set(s).size, 4, 'một trận 4 đội khác nhau')
      for (const t of s) played.set(t, played.get(t)! + 1)
      bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), m])
      assert.ok(m.field >= 0 && m.field < fu)
    }
    for (const t of teamIds) {
      const c = played.get(t)!
      assert.equal(c, quality.extra.includes(t) ? p + 1 : p)
    }
    for (const [, ms] of bySlot) {
      assert.ok(ms.length <= fu)
      const all = ms.flatMap(seatsOf)
      assert.equal(new Set(all).size, all.length, 'không đội nào hai trận cùng slot')
      assert.equal(new Set(ms.map((m) => m.field)).size, ms.length, 'mỗi sân một trận / lượt')
    }
    const slots = [...bySlot.keys()].sort((a, b) => a - b)
    slots.slice(0, -1).forEach((s) => assert.equal(bySlot.get(s)!.length, fu))
    matches.forEach((m, i) => assert.equal(m.id, `r1-${i + 1}`))
    assert.ok(quality.maxSideDiff <= 1, `maxSideDiff=${quality.maxSideDiff}`)
    if (n >= 8 * fu) assert.ok(quality.minRest >= 1, `minRest=${quality.minRest}`)
    assert.equal(notes.includes('Có đội không được nghỉ giữa hai trận'), quality.minRest < 1)
    console.log(`  (${n},${p},${f}) fieldsUsed=${fu} slots=${slots.length} minRest=${quality.minRest} partners=${quality.repeatPartners} opp=${quality.repeatOpponents} side=${quality.maxSideDiff} extra=${quality.extra.length}`)
  })
}

test('tất định theo seed, khác seed thì khác', () => {
  const o = { teamIds: ids(30), perTeam: 5, fields: 2, roundId: 'r1' }
  const a = makeSchedule({ ...o, seed: 5 })
  assert.deepEqual(makeSchedule({ ...o, seed: 5 }), a)
  assert.notDeepEqual(makeSchedule({ ...o, seed: 6 }).matches, a.matches)
})

test('(90,5,3) chạy dưới 3000 ms', () => {
  const t0 = Date.now()
  makeSchedule({ teamIds: ids(90), perTeam: 5, fields: 3, seed: 3, roundId: 'r1' })
  const ms = Date.now() - t0
  console.log(`  (90,5,3) ${ms} ms`)
  assert.ok(ms < 3000, `${ms} ms`)
})

test('(120,10,4) chạy trong vài giây', () => {
  const t0 = Date.now()
  makeSchedule({ teamIds: ids(120), perTeam: 10, fields: 4, seed: 3, roundId: 'r1' })
  const ms = Date.now() - t0
  console.log(`  (120,10,4) ${ms} ms`)
  assert.ok(ms < 8000, `${ms} ms`)
})

test('đội chọn đấu thêm là ngẫu nhiên theo seed, không luôn là id đầu', () => {
  const firsts = new Set<string>()
  for (let s = 1; s <= 6; s++) makeSchedule({ teamIds: ids(31), perTeam: 5, fields: 1, seed: s, roundId: 'r1' }).quality.extra.forEach((t) => firsts.add(t))
  assert.ok(firsts.size > 3)
})

test('fixed giữ nguyên, tính vào số trận, bỏ đội đã rút', () => {
  const teamIds = ids(16)
  const full = makeSchedule({ teamIds, perTeam: 4, fields: 2, seed: 2, roundId: 'r1' })
  const fixed = full.matches.filter((m) => m.slot < 3)
  assert.ok(fixed.length > 0)
  const maxN = Math.max(...fixed.map((m) => Number(m.id.slice(3))))
  const gone = 't16'
  const left = teamIds.filter((t) => t !== gone)
  const r = makeSchedule({ teamIds: left, perTeam: 4, fields: 2, seed: 9, roundId: 'r1', fixed })
  assert.deepEqual(r.matches.slice(0, fixed.length), fixed)
  const added = r.matches.slice(fixed.length)
  assert.ok(added.length > 0)
  added.forEach((m, i) => { assert.equal(m.id, `r1-${maxN + 1 + i}`); assert.ok(m.slot >= 3); assert.ok(!seatsOf(m).includes(gone)) })
  const played = new Map<string, number>(left.map((t) => [t, 0]))
  for (const m of r.matches) for (const t of seatsOf(m)) if (played.has(t)) played.set(t, played.get(t)! + 1)
  for (const t of left) assert.ok([4, 5].includes(played.get(t)!), `${t}=${played.get(t)}`)
  for (const m of added) assert.equal(new Set(seatsOf(m)).size, 4)
})

test('ít đội: giảm số sân và ghi chú', () => {
  const r = makeSchedule({ teamIds: ids(8), perTeam: 5, fields: 2, seed: 1, roundId: 'r1' })
  assert.equal(r.quality.fieldsUsed, 2)
  const r2 = makeSchedule({ teamIds: ids(9), perTeam: 5, fields: 4, seed: 1, roundId: 'r1' })
  assert.equal(r2.quality.fieldsUsed, 2)
  assert.ok(r2.notes.includes('Dùng 2 sân (ít đội)'))
})

test('đầu vào sai thì ném', () => {
  const ok = { teamIds: ids(8), perTeam: 5, fields: 1, seed: 1, roundId: 'r1' }
  assert.throws(() => makeSchedule({ ...ok, teamIds: ids(7) }))
  assert.throws(() => makeSchedule({ ...ok, teamIds: ids(121) }))
  assert.throws(() => makeSchedule({ ...ok, perTeam: 2 }))
  assert.throws(() => makeSchedule({ ...ok, perTeam: 11 }))
  assert.throws(() => makeSchedule({ ...ok, fields: 0 }))
  assert.throws(() => makeSchedule({ ...ok, fields: 5 }))
})

test('slotTime cộng phút', () => {
  assert.equal(slotTime('08:00', 7, 3), '08:21')
  assert.equal(slotTime('08:50', 7, 2), '09:04')
  assert.equal(slotTime('09:05', 10, 0), '09:05')
})

test('fixed lệch màu không sửa được: không ném, có ghi chú, trận mới vẫn hợp lệ', () => {
  const teamIds = ids(12)
  // t1 đỏ ở 3 trận đã đấu
  const fixed: EMatch[] = [
    { id: 'r1-1', slot: 0, field: 0, red: ['t1', 't2'], blue: ['t3', 't4'] },
    { id: 'r1-2', slot: 1, field: 0, red: ['t1', 't5'], blue: ['t6', 't7'] },
    { id: 'r1-3', slot: 2, field: 0, red: ['t1', 't8'], blue: ['t9', 't10'] },
  ]
  const r = makeSchedule({ teamIds, perTeam: 4, fields: 1, seed: 3, roundId: 'r1', fixed })
  assert.deepEqual(r.matches.slice(0, 3), fixed)
  assert.ok(r.quality.maxSideDiff > 1)
  assert.ok(r.notes.includes('Có đội lệch số lần Đỏ / Xanh do các trận đã đấu'))
  const added = r.matches.slice(3)
  added.forEach((m, i) => { assert.equal(m.id, `r1-${4 + i}`); assert.ok(m.slot >= 3) })
  const bySlot = new Map<number, string[]>()
  const cnt = new Map<string, number>()
  for (const m of r.matches) {
    bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), ...seatsOf(m)])
    for (const t of seatsOf(m)) cnt.set(t, (cnt.get(t) ?? 0) + 1)
  }
  for (const a of bySlot.values()) assert.equal(new Set(a).size, a.length)
  for (const t of teamIds) assert.ok([4, 5].includes(cnt.get(t)!), `${t}=${cnt.get(t)}`)
})

test('fixed có đội đã rút, id vòng khác không ảnh hưởng, ranh giới fixed/mới hợp lệ', () => {
  const teamIds = ids(16).filter((t) => t !== 't16')
  const fixed: EMatch[] = [
    { id: 'r1-1', slot: 0, field: 0, red: ['t1', 't2'], blue: ['t3', 't16'] },
    { id: 'r1-2', slot: 1, field: 0, red: ['t4', 't5'], blue: ['t6', 't7'] },
    { id: 'r0-9', slot: 2, field: 0, red: ['t8', 't9'], blue: ['t10', 't11'] },
  ]
  const r = makeSchedule({ teamIds, perTeam: 4, fields: 1, seed: 4, roundId: 'r1', fixed })
  const added = r.matches.slice(3)
  added.forEach((m, i) => { assert.equal(m.id, `r1-${3 + i}`); assert.ok(m.slot >= 3); assert.ok(!seatsOf(m).includes('t16')) })
  assert.ok(r.quality.minRest >= 1, `minRest=${r.quality.minRest}`)
  assert.ok(r.quality.maxSideDiff <= 1, `side=${r.quality.maxSideDiff}`)
  const bySlot = new Map<number, string[]>()
  for (const m of r.matches) bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), ...seatsOf(m)])
  for (const a of bySlot.values()) assert.equal(new Set(a).size, a.length)
})
