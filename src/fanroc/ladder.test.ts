import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLIMB_PCT, HOOK, climbOf, ladderLen, pointAt, project, stepClimb, type ClimbState } from './ladder.ts'
import { LADDER } from './layout.ts'

const FLOOR: ClimbState = { mode: 'floor', bar: null, s: 0 }
type Inp = Parameters<typeof stepClimb>[1]
const inp = (o: Partial<Inp>): Inp => ({ hookDeg: 160, lastHookDeg: 160, x: 0, z: 0, drive: 0, dt: 1 / 60, others: [], ...o })
/** Điểm trên thanh đỏ ở vị trí s, lệch vuông góc d (về phía +x của thanh... dùng project để kiểm). */
const on = (s: number, d = 0) => {
  const p = pointAt('red', s)
  const q = pointAt('red', s + 1e-3)
  const tx = q.x - p.x
  const tz = q.z - p.z
  const l = Math.hypot(tx, tz)
  return { x: p.x - (tz / l) * d, z: p.z + (tx / l) * d }
}
/** Giơ móc (lastHook cao) rồi hạ móc (hook thấp) tại điểm (x, z). */
const grab = (x: number, z: number, others: Inp['others'] = []) =>
  stepClimb(FLOOR, inp({ hookDeg: HOOK.downDeg, lastHookDeg: HOOK.upDeg + 5, x, z, others }))

test('project/pointAt khớp nhau', () => {
  const pr = project('red', on(0.7).x, on(0.7).z)
  assert.ok(Math.abs(pr.s - 0.7) < 1e-3 && pr.d < 1e-3)
  assert.ok(ladderLen('red') > 1.29)
})

test('giơ rồi hạ móc ở s = 0.2 thì treo, climbOf = ground', () => {
  const p = on(0.2)
  const st = grab(p.x, p.z)
  assert.equal(st.mode, 'hang'); assert.equal(st.bar, 'red')
  assert.ok(Math.abs(st.s - 0.2) < 1e-3)
  assert.equal(climbOf(st, HOOK.downDeg, p.x, p.z).level, 'ground')
})

test('lái tiến 4 s thì sang đoạn Nước', () => {
  const p = on(0.2)
  let st = grab(p.x, p.z)
  for (let i = 0; i < 240; i++) st = stepClimb(st, inp({ hookDeg: HOOK.downDeg, lastHookDeg: HOOK.downDeg, drive: 1 }))
  assert.ok(st.s > LADDER.divider + 0.01)
  assert.equal(climbOf(st, HOOK.downDeg, 0, 0).level, 'water')
})

test('hạ móc ở s = 0.7 (đoạn Nước) thì vẫn floor', () => {
  const p = on(0.7)
  assert.equal(grab(p.x, p.z).mode, 'floor')
})

test('móc giơ: d = 0.05 thì contact, d = 0.08 thì none', () => {
  const a = on(0.2, 0.05)
  assert.equal(climbOf(FLOOR, 160, a.x, a.z).level, 'contact')
  const b = on(0.2, 0.08)
  assert.equal(climbOf(FLOOR, 160, b.x, b.z).level, 'none')
  assert.equal(CLIMB_PCT.water, 20)
})

test('giơ móc khi treo thì floor', () => {
  const p = on(0.2)
  const st = grab(p.x, p.z)
  assert.equal(stepClimb(st, inp({ hookDeg: HOOK.upDeg, lastHookDeg: HOOK.downDeg })).mode, 'floor')
})

test('thanh đã 2 robot treo: robot thứ 3 không treo', () => {
  const p = on(0.2)
  assert.equal(grab(p.x, p.z, [{ bar: 'red', s: 0.1 }, { bar: 'red', s: 0.6 }]).mode, 'floor')
  assert.equal(grab(p.x, p.z, [{ bar: 'red', s: 0.6 }]).mode, 'hang')
})

test('hai robot cùng thanh không gần nhau hơn 0.3', () => {
  const p = on(0.2)
  let st = grab(p.x, p.z)
  const others = [{ bar: 'red' as const, s: 0.2 + HOOK.gap + 0.01 }]
  for (let i = 0; i < 240; i++) st = stepClimb(st, inp({ hookDeg: HOOK.downDeg, lastHookDeg: HOOK.downDeg, drive: 1, others }))
  assert.ok(others[0].s - st.s >= HOOK.gap - 1e-9, `s = ${st.s}`)
  // lùi sát đầu thanh bị kẹp ở end
  for (let i = 0; i < 600; i++) st = stepClimb(st, inp({ hookDeg: HOOK.downDeg, lastHookDeg: HOOK.downDeg, drive: -1, others }))
  assert.ok(Math.abs(st.s - HOOK.end) < 1e-9)
})
