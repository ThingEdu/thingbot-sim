import { test } from 'node:test'
import assert from 'node:assert/strict'
import { portMap, ROBOTS, ruleChecks } from './robots.ts'
import { ZONES } from './layout.ts'

test('portMap Maker diff2 + TT: L=M1, R=M2, hút=M3, nâng=M4', () => {
  const m = portMap({ type: 'maker', drive: 'diff2', actuator: 'tt' })
  assert.equal(m.wheels.L, 'M1')
  assert.equal(m.wheels.R, 'M2')
  assert.equal(m.intake, 'M3')
  assert.equal(m.lift, 'M4')
  assert.equal(m.intakeKind, 'motor')
  assert.equal(m.liftKind, 'motor')
})

test('portMap Maker mecanum: 4 bánh M1..M4, cơ cấu ép sang S4/S5 servo 360', () => {
  const m = portMap({ type: 'maker', drive: 'mecanum', actuator: 'tt' })
  assert.deepEqual([m.wheels.FL, m.wheels.FR, m.wheels.RL, m.wheels.RR], ['M1', 'M2', 'M3', 'M4'])
  assert.equal(m.intake, 'S4')
  assert.equal(m.lift, 'S5')
  assert.equal(m.intakeKind, 's360')
  assert.equal(m.liftKind, 's360')
})

test('portMap diff2 + s360: hút=S4, nâng=S5, M3/M4 không dùng', () => {
  const m = portMap({ type: 'maker', drive: 'diff2', actuator: 's360' })
  assert.equal(m.intake, 'S4')
  assert.equal(m.lift, 'S5')
  assert.equal(m.wheels.RL, undefined)
})

test('portMap Xe Cắm Cờ chỉ có cơ cấu nâng M4; Xe Phân Loại chỉ có hút M3', () => {
  const co = portMap({ type: 'co', drive: 'diff2', actuator: 'tt' })
  assert.equal(co.intake, undefined)
  assert.equal(co.lift, 'M4')
  const sort = portMap({ type: 'sort', drive: 'diff2', actuator: 's360' })
  assert.equal(sort.intake, 'S4')
  assert.equal(sort.lift, undefined)
})

test('ruleChecks Maker: R01 đạt, mở rộng 0.13 → 430 mm đạt, 4/4 động cơ', () => {
  const r = ruleChecks({ type: 'maker', drive: 'diff2', actuator: 'tt' }, 0.13)
  assert.ok(r.every((c) => c.ok === true), JSON.stringify(r))
  assert.ok(r.some((c) => /R01/.test(c.text) && /300/.test(c.text)))
  assert.ok(r.some((c) => /430 mm/.test(c.text)))
  assert.ok(r.some((c) => c.text === 'Động cơ TT: 4 / 4'))
  assert.ok(r.some((c) => c.text === 'Servo: 3 / 5'))
})

test('ruleChecks: mở rộng quá 500 mm bị đỏ', () => {
  const r = ruleChecks({ type: 'maker', drive: 'diff2', actuator: 'tt' }, 0.25)
  const c = r.find((x) => /Mở rộng/.test(x.text))
  assert.equal(c?.ok, false)
})

test('ruleChecks Maker mecanum: 4 động cơ + 5 servo vẫn đạt', () => {
  const r = ruleChecks({ type: 'maker', drive: 'mecanum', actuator: 'tt' }, 0)
  assert.ok(r.some((c) => c.text === 'Động cơ TT: 4 / 4' && c.ok === true))
  assert.ok(r.some((c) => c.text === 'Servo: 5 / 5' && c.ok === true))
})

test('ruleChecks Xe Ủi: hai chiếc cạnh nhau vừa ô 375', () => {
  const safeW = ZONES.safe.red.x1 - ZONES.safe.red.x0
  assert.ok(2 * ROBOTS.ui.size.w <= safeW)
  const r = ruleChecks({ type: 'ui', drive: 'diff2', actuator: 'tt' }, 0)
  assert.ok(r.some((c) => /2 × 180 mm/.test(c.text) && c.ok === true), JSON.stringify(r))
})

test('ROBOTS: kích thước và kho theo spec 4.3', () => {
  assert.deepEqual(ROBOTS.maker.size, { w: 0.24, l: 0.3, h: 0.216 })
  assert.equal(ROBOTS.maker.storage, 6)
  assert.equal(ROBOTS.ui.storage, 15)
  assert.deepEqual(ROBOTS.ui.drives, ['diff2'])
  assert.equal(ROBOTS.co.hpLoad, true)
  assert.equal(ROBOTS.sort.storage, 10)
  assert.equal(ROBOTS.maker.maxExtend, 0.13)
})

test('ruleChecks Xe Cắm Cờ: tay S1 vươn hết (armFrac 1) tính vào mở rộng: 280 + 140 = 420 mm đạt', () => {
  const r = ruleChecks({ type: 'co', drive: 'diff2', actuator: 'tt' }, 0, 1)
  const c = r.find((x) => /Mở rộng/.test(x.text))
  assert.equal(c?.text, 'Mở rộng một chiều: 420 mm / 500 mm')
  assert.equal(c?.ok, true)
})

test('localGripPoint: Mẫu Maker vươn tới trước theo thanh trượt, Xe Cắm Cờ nâng lên theo thùng', async () => {
  const { localGripPoint } = await import('./robots.ts')
  const m0 = localGripPoint(ROBOTS.maker, 0, 0)
  const m1 = localGripPoint(ROBOTS.maker, 0.1, 0)
  assert.ok(Math.abs(m1.z - m0.z - 0.1) < 1e-9 && m1.y === m0.y)
  const c0 = localGripPoint(ROBOTS.co, 0, 0)
  const c1 = localGripPoint(ROBOTS.co, 0.05, 0)
  assert.ok(Math.abs(c1.y - c0.y - 0.05) < 1e-9 && c1.z === c0.z)
})
