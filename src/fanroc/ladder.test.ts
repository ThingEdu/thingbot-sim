import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLIMB_PCT, HOOK, HOOK_LABEL, HOOK_TIP, barYaw, hookTop, stepHook, type HookState, climbOf, ladderLen, pointAt, project, slideRange, stepClimb, type ClimbState } from './ladder.ts'
import { FIELD, LADDER } from './layout.ts'
import { flagEnvelope, ROBOTS, ruleChecks } from './robots.ts'

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

test('điều kiện bám: móc không có chuyển giơ->hạ, móc 90°, lệch d = 0.08 hay s < 0 đều không bám', () => {
  const p = on(0.2)
  // (a) móc đã hạ sẵn từ trước (không có bước chuyển từ ≥ upDeg)
  assert.equal(stepClimb(FLOOR, inp({ hookDeg: HOOK.downDeg, lastHookDeg: HOOK.downDeg, x: p.x, z: p.z })).mode, 'floor')
  assert.equal(stepClimb(FLOOR, inp({ hookDeg: HOOK.downDeg, lastHookDeg: HOOK.upDeg - 20, x: p.x, z: p.z })).mode, 'floor')
  // (b) móc mới hạ tới 90° (chưa ≤ downDeg)
  assert.equal(stepClimb(FLOOR, inp({ hookDeg: 90, lastHookDeg: HOOK.upDeg + 5, x: p.x, z: p.z })).mode, 'floor')
  // (c) lệch ngang 0.08 > tol
  const far = on(0.2, 0.08)
  assert.equal(grab(far.x, far.z).mode, 'floor')
  // (d) trước đầu a (s < 0) dù d = 0
  const before = pointAt('red', -0.05)
  assert.equal(grab(before.x, before.z).mode, 'floor')
  // đối chứng: cùng cách gọi ở chỗ hợp lệ thì bám
  assert.equal(grab(p.x, p.z).mode, 'hang')
})

test('contact chỉ khi móc giơ: móc 90° hay đã hạ sát thanh thì none', () => {
  const p = on(0.2)
  assert.equal(climbOf(FLOOR, 90, p.x, p.z).level, 'none')
  assert.equal(climbOf(FLOOR, HOOK.downDeg, p.x, p.z).level, 'none')
})

test('lái tiến mãi thì dừng ở cách đầu b một đoạn end', () => {
  const p = on(0.2)
  let st = grab(p.x, p.z)
  for (let i = 0; i < 60 * 20; i++) st = stepClimb(st, inp({ hookDeg: HOOK.downDeg, lastHookDeg: HOOK.downDeg, drive: 1 }))
  assert.ok(Math.abs(st.s - (ladderLen('red') - HOOK.end)) < 1e-9, `s = ${st.s}`)
})

// ---------- Đoạn trượt trong sân (thân treo không xuyên rào / Hộp Phân Phối) ----------
/** 4 góc thân treo ở chỗ bám s (như RobotBody.footprint, yaw = barYaw). */
const corners = (al: 'red' | 'blue', s: number, front: number, back: number, half: number) => {
  const c = pointAt(al, s)
  const y = barYaw(al)
  const f = { x: -Math.sin(y), z: -Math.cos(y) }
  const r = { x: Math.cos(y), z: -Math.sin(y) }
  return [[front, -half], [front, half], [-back, half], [-back, -half]].map(([a, b]) => ({ x: c.x + f.x * a + r.x * b, z: c.z + f.z * a + r.z * b }))
}
const inField = (ps: { x: number; z: number }[], tol = 1e-9) => ps.every((p) => Math.abs(p.x) <= FIELD / 2 + tol && Math.abs(p.z) <= FIELD / 2 + tol)

test('slideRange: mỗi mẫu robot, hai thanh — trong đoạn thì thân trong rào, ra ngoài 1 mm thì thò ra; bám được ở Đất và tới được Nước', () => {
  for (const d of Object.values(ROBOTS)) {
    for (const al of ['red', 'blue'] as const) {
      const { w, l } = d.size
      const rg = slideRange(al, l / 2, l / 2, w / 2)
      assert.ok(rg.min < LADDER.divider && rg.max > LADDER.divider + 0.01, `${d.type} ${al}: ${rg.min}…${rg.max}`)
      assert.ok(rg.min > HOOK.end && rg.max < ladderLen(al) - HOOK.end, `${d.type} ${al} chặt hơn hai đầu thanh`)
      for (const s of [rg.min, (rg.min + rg.max) / 2, rg.max]) assert.ok(inField(corners(al, s, l / 2, l / 2, w / 2)), `${d.type} ${al} s ${s}`)
      assert.ok(!inField(corners(al, rg.min - 0.001, l / 2, l / 2, w / 2)), `${d.type} ${al} dưới min`)
      assert.ok(!inField(corners(al, rg.max + 0.001, l / 2, l / 2, w / 2)), `${d.type} ${al} trên max`)
    }
  }
  // Mẫu Maker 240 × 300 trên thanh theo CAD lắp sân 12/11: ≈ 0,320…1,017 (trước, theo Hình 1: 0,256…1,145). Đoạn Đất bám
  // được chỉ còn 0,320…vạch 0,451: vừa một thân treo (hai thân treo cách nhau ≥ HOOK.gap 0,3 thì thân thứ hai đã ở Nước).
  const mk = slideRange('red', 0.15, 0.15, 0.12)
  assert.ok(Math.abs(mk.min - 0.320) < 0.002 && Math.abs(mk.max - 1.017) < 0.002, `${mk.min}…${mk.max}`)
  assert.ok(mk.min + HOOK.gap > LADDER.divider + 0.01, 'hai Mẫu Maker treo cùng ở Đất phải là không thể')
  // Phần vươn ra trước làm max nhỏ lại, ra sau làm min lớn lên.
  assert.ok(slideRange('red', 0.35, 0.15, 0.12).max < mk.max - 0.1)
  assert.ok(slideRange('red', 0.15, 0.35, 0.12).min > mk.min + 0.1)
})

test('stepClimb với range: treo không trượt ra khỏi đoạn; đang ở ngoài đoạn thì đứng yên, chỉ trượt vào; bám ngoài đoạn dời vào đầu đoạn', () => {
  const range = () => ({ min: 0.3, max: 0.9 })
  let st: ClimbState = { mode: 'hang', bar: 'red', s: 0.85 }
  for (let k = 0; k < 120; k++) st = stepClimb(st, inp({ hookDeg: 0, drive: 1, range }))
  assert.equal(st.s, 0.9)
  for (let k = 0; k < 600; k++) st = stepClimb(st, inp({ hookDeg: 0, drive: -1, range }))
  assert.equal(st.s, 0.3)
  // Đang ở 0,95 (> max, vd. vừa vươn cơ cấu): tiến thì đứng yên, lùi thì vào trong.
  st = stepClimb({ mode: 'hang', bar: 'red', s: 0.95 }, inp({ hookDeg: 0, drive: 1, range }))
  assert.equal(st.s, 0.95)
  st = stepClimb({ mode: 'hang', bar: 'red', s: 0.95 }, inp({ hookDeg: 0, drive: -1, range }))
  assert.ok(st.s < 0.95)
  const p = on(0.1)
  const g = stepClimb(FLOOR, inp({ hookDeg: HOOK.downDeg, lastHookDeg: HOOK.upDeg + 5, x: p.x, z: p.z, range }))
  assert.deepEqual(g, { mode: 'hang', bar: 'red', s: 0.3 })
})

// ---------- Móc thu gọn trong thân lúc xuất phát (anh Tuấn 12/11) ----------
test('hookTop: mọi mẫu robot — 0° đỉnh móc ≤ nóc và trong khung; giơ (≥ upDeg, 180°) cao hơn trục thanh ≥ 2 cm; treo thì tới trục thanh', () => {
  for (const d of Object.values(ROBOTS)) {
    const { w, l, h } = d.size
    assert.ok(hookTop(d, 0, false) <= h + 1e-9, `${d.type}: móc thu cao ${hookTop(d, 0, false)} > nóc ${h}`)
    assert.ok(HOOK_TIP.reach <= Math.min(w, l) / 2, `${d.type}: chữ J thò khỏi khung nhìn từ trên`)
    for (const deg of [HOOK.upDeg, 180]) assert.ok(hookTop(d, deg, false) >= LADDER.y + 0.02, `${d.type} ${deg}°`)
    // Móc hạ (≤ HOOK.downDeg, như vật lý leo) là cần rút hết; trên downDeg mới duỗi.
    for (const deg of [10, 20, HOOK.downDeg]) assert.equal(hookTop(d, deg, false), h, `${d.type} ${deg}°: móc hạ mà cần còn duỗi`)
    assert.ok(hookTop(d, HOOK.downDeg + 1, false) > h, `${d.type}: trên downDeg cần phải duỗi`)
    // Giơ dần: tăng đơn điệu theo góc, không vượt mức giơ hết.
    let last = -Infinity
    for (let deg = 0; deg <= 180; deg += 10) {
      const y = hookTop(d, deg, false)
      assert.ok(y >= last && y <= LADDER.y + 0.03 + 1e-9, `${d.type} ${deg}°: ${y}`)
      last = y
    }
    // Đang treo: thân rủ ở HOOK.hangY, cần dài đúng trục thanh − nóc thân; chữ J nằm trên trục thanh.
    const pole = hookTop(d, 0, true) - HOOK_TIP.t / 2 - h
    assert.ok(Math.abs(pole - (LADDER.y - (HOOK.hangY + h))) < 1e-9, `${d.type} cần treo ${pole}`)
  }
})

test('ruleChecks R01 tính cả móc đã thu: mọi mẫu vẫn ≤ 300 × 300 × 850', () => {
  for (const d of Object.values(ROBOTS)) {
    const r01 = ruleChecks({ type: d.type, drive: d.drives[0], actuator: 'tt' }, 0).find((c) => /^R01/.test(c.text))
    assert.ok(r01 && r01.ok === true && /móc đã thu/.test(r01.text), `${d.type}: ${JSON.stringify(r01)}`)
    const mm = (m: number) => Math.round(m * 1000)
    assert.ok(r01.text.includes(`× ${mm(Math.max(d.size.h, hookTop(d, 0, false), d.flag ? flagEnvelope(d, 0, 0).y1 : 0))} mm`), r01.text)
  }
})

// ---------- Móc lò xo (anh Tuấn 12/11): chốt gập lúc xuất phát, servo 180° nhả chốt — lò xo bật MÓC (không bắn robot, RC04) ----------
test('stepHook: cài chốt thì servo < upDeg không nhúc nhích; 180° lò xo bật móc lên nhanh; về 0° tời cuốn xuống rồi cài chốt lại', () => {
  const d = ROBOTS.maker
  const h = d.size.h
  const full = hookTop(d, 180, false)
  const run = (st: HookState, deg: number, s: number, hanging = false) => {
    for (let k = 0; k < Math.round(s * 60); k++) st = stepHook(st, d, deg, hanging, 1 / 60)
    return st
  }
  let st: HookState = { latched: true, top: h }
  st = run(st, HOOK.upDeg - 1, 1)
  assert.deepEqual(st, { latched: true, top: h }, 'chốt chưa nhả mà móc đã lên')
  // Lò xo: 0,05 s đã lên rõ, ≤ 0,25 s là lên hết (cao hơn trục thanh ≥ 2 cm), không vượt mức giơ hết.
  const a = run(st, 180, 0.05)
  assert.ok(!a.latched && a.top > h + 0.1, `0,05 s: ${a.top}`)
  st = run(st, 180, 0.25)
  assert.ok(Math.abs(st.top - full) < 1e-9 && st.top >= LADDER.y + 0.02, `0,25 s: ${st.top}`)
  // Tời cuốn xuống chậm hơn lò xo bật lên.
  const down = run(st, 0, 0.05)
  assert.ok(full - down.top < a.top - h, 'tời phải chậm hơn lò xo')
  st = run(st, 0, 1)
  assert.deepEqual(st, { latched: true, top: h }, 'về 0° phải gập lại, cài chốt')
  // Về HOOK.downDeg (30°, móc hạ) là đủ gập, cài chốt; dừng ở 31° thì cần còn duỗi, chưa cài.
  const up = run({ latched: false, top: full }, 180, 0.1)
  assert.deepEqual(run(up, HOOK.downDeg, 1), { latched: true, top: h }, 'servo 30° (móc hạ) mà chưa cài chốt lại')
  assert.equal(run(up, HOOK.downDeg + 1, 1).latched, false)
  // Đã cài chốt lại: 90° không bật móc.
  assert.deepEqual(run(st, 90, 0.5), { latched: true, top: h })
  // Đang treo: cần dài đúng tới trục thanh.
  assert.equal(stepHook(st, d, 0, true, 1 / 60).top, hookTop(d, 0, true))
})

test('HOOK_LABEL nói rõ lò xo bật móc (RC04: lò xo không được bắn robot lên thanh)', () => {
  assert.equal(HOOK_LABEL, 'Móc leo xà (lò xo bật móc)')
  for (const d of Object.values(ROBOTS)) {
    const label = (d.servos as Record<string, string>)[d.hook.port] ?? HOOK_LABEL
    assert.equal(label, HOOK_LABEL, d.type)
  }
})
