import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chuteExit, portMap, rackExtent, rackOverhang, ROBOTS, ruleChecks } from './robots.ts'
import { ZONES } from './layout.ts'

test('portMap Maker diff2 + TT: L=M1, R=M2, nâng=M4, không hút (Human Player nạp bóng)', () => {
  const m = portMap({ type: 'maker', drive: 'diff2', actuator: 'tt' })
  assert.equal(m.wheels.L, 'M1')
  assert.equal(m.wheels.R, 'M2')
  assert.equal(m.intake, undefined)
  assert.equal(m.lift, 'M4')
  assert.equal(m.liftKind, 'motor')
  const sort = portMap({ type: 'sort', drive: 'diff2', actuator: 'tt' })
  assert.equal(sort.intake, 'M3')
  assert.equal(sort.intakeKind, 'motor')
})

test('portMap mecanum: 4 bánh M1..M4, cơ cấu ép sang S4/S5 servo 360', () => {
  const m = portMap({ type: 'maker', drive: 'mecanum', actuator: 'tt' })
  assert.deepEqual([m.wheels.FL, m.wheels.FR, m.wheels.RL, m.wheels.RR], ['M1', 'M2', 'M3', 'M4'])
  assert.equal(m.lift, 'S5')
  assert.equal(m.liftKind, 's360')
  const sort = portMap({ type: 'sort', drive: 'mecanum', actuator: 'tt' })
  assert.equal(sort.intake, 'S4')
  assert.equal(sort.intakeKind, 's360')
})

test('portMap diff2 + s360: nâng=S5, M3/M4 không dùng', () => {
  const m = portMap({ type: 'maker', drive: 'diff2', actuator: 's360' })
  assert.equal(m.intake, undefined)
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

test('ruleChecks Maker: R01 đạt, mở rộng 0.13 → 430 mm đạt, 3/4 động cơ (không còn M3 hút)', () => {
  const r = ruleChecks({ type: 'maker', drive: 'diff2', actuator: 'tt' }, 0.13)
  assert.ok(r.every((c) => c.ok === true), JSON.stringify(r))
  assert.ok(r.some((c) => /R01/.test(c.text) && /300/.test(c.text)))
  assert.ok(r.some((c) => /430 mm/.test(c.text)))
  assert.ok(r.some((c) => c.text === 'Động cơ TT: 3 / 4'))
  assert.ok(r.some((c) => c.text === 'Servo: 3 / 5'))
})

test('ruleChecks: mở rộng quá 500 mm bị đỏ', () => {
  const r = ruleChecks({ type: 'maker', drive: 'diff2', actuator: 'tt' }, 0.25)
  const c = r.find((x) => /Mở rộng/.test(x.text))
  assert.equal(c?.ok, false)
})

test('ruleChecks Maker mecanum: 4 động cơ + 4 servo vẫn đạt', () => {
  const r = ruleChecks({ type: 'maker', drive: 'mecanum', actuator: 'tt' }, 0)
  assert.ok(r.some((c) => c.text === 'Động cơ TT: 4 / 4' && c.ok === true))
  assert.ok(r.some((c) => c.text === 'Servo: 4 / 5' && c.ok === true))
})

test('ruleChecks Xe Ủi: hai chiếc cạnh nhau vừa ô 375', () => {
  const safeW = ZONES.ladder.red.x1 - ZONES.ladder.red.x0
  assert.ok(2 * ROBOTS.ui.size.w <= safeW)
  const r = ruleChecks({ type: 'ui', drive: 'diff2', actuator: 'tt' }, 0)
  assert.ok(r.some((c) => /2 × 180 mm/.test(c.text) && /ô Thang Cứu Hỏa/.test(c.text) && c.ok === true), JSON.stringify(r))
})

test('ROBOTS: kích thước và kho theo spec 4.3', () => {
  assert.deepEqual(ROBOTS.maker.size, { w: 0.24, l: 0.3, h: 0.216 })
  assert.equal(ROBOTS.maker.storage, 4) // tay vòng: Human Player bỏ 4 bóng là đầy (chốt 06/11)
  assert.equal(ROBOTS.ui.storage, 15)
  assert.deepEqual(ROBOTS.ui.drives, ['diff2'])
  assert.equal(ROBOTS.co.hpLoad, true)
  assert.equal(ROBOTS.sort.storage, 10)
  assert.equal(ROBOTS.maker.maxExtend, 0.2) // thanh răng CAD lùi ~200 mm
})

test('ruleChecks Xe Cắm Cờ: tay S1 vươn hết (armFrac 1) tính vào mở rộng: 280 + 140 = 420 mm đạt', () => {
  const r = ruleChecks({ type: 'co', drive: 'diff2', actuator: 'tt' }, 0, 1)
  const c = r.find((x) => /Mở rộng/.test(x.text))
  assert.equal(c?.text, 'Mở rộng một chiều: 420 mm / 500 mm')
  assert.equal(c?.ok, true)
})

test('localGripPoint: Xe Cắm Cờ nâng lên theo thùng (họ Maker không còn cờ — luật V4)', async () => {
  const { localGripPoint } = await import('./robots.ts')
  const c0 = localGripPoint(ROBOTS.co, 0, 0)
  const c1 = localGripPoint(ROBOTS.co, 0.05, 0)
  assert.ok(Math.abs(c1.y - c0.y - 0.05) < 1e-9 && c1.z === c0.z)
})

test('mẫu cải tiến Maker (R142): đủ cổng ThingBot, đúng luật lúc xuất phát; Pro 4 bánh dùng hết 4 động cơ + 5 servo', () => {
  for (const type of ['makerLift', 'makerIntake', 'makerPro'] as const) {
    for (const drive of ROBOTS[type].drives) {
      const r = ruleChecks({ type, drive, actuator: 'tt' }, 0)
      assert.ok(r.every((c) => c.ok === true), `${type}/${drive}: ${JSON.stringify(r)}`)
    }
  }
  assert.equal(ROBOTS.makerPro.drives[0], 'omni')
  const pro = ruleChecks({ type: 'makerPro', drive: 'omni', actuator: 'tt' }, 0)
  assert.ok(pro.some((c) => c.text === 'Động cơ TT: 4 / 4') && pro.some((c) => c.text === 'Servo: 5 / 5'), JSON.stringify(pro))
  assert.equal(portMap({ type: 'makerIntake', drive: 'diff2', actuator: 'tt' }).intake, 'M3')
  assert.deepEqual([ROBOTS.maker.storage, ROBOTS.makerLift.storage, ROBOTS.makerIntake.storage, ROBOTS.makerPro.storage], [4, 4, 8, 8])
  assert.ok(ROBOTS.makerPro.size.h <= 0.85, 'lồng nối dài vẫn dưới trần cao 850 mm')
})

test('chuteExit: Mẫu Maker cửa ra đứng yên; Maker Nâng đi thẳng từ cửa CAD tới chuteLift theo S1 / 180', () => {
  assert.deepEqual(chuteExit(ROBOTS.maker, 1), ROBOTS.maker.chute)
  assert.deepEqual(chuteExit(ROBOTS.makerLift, 0), ROBOTS.makerLift.chute)
  assert.deepEqual(chuteExit(ROBOTS.makerLift, 1), ROBOTS.makerLift.chuteLift)
  const mid = chuteExit(ROBOTS.makerLift, 0.5)!
  assert.ok(Math.abs(mid.reach - 0.04) < 1e-9 && Math.abs(mid.y - 0.1515) < 1e-9, JSON.stringify(mid))
  assert.equal(chuteExit(ROBOTS.co, 1), null)
})

test('Maker Nâng: cửa lồng nâng hết vượt mũi 130 mm, tính vào mở rộng; cùng thanh răng lùi hết thì quá 500 mm', () => {
  const cfg = { type: 'makerLift', drive: 'diff2', actuator: 'tt' } as const
  const up = ruleChecks(cfg, 0, 1).find((c) => /Mở rộng/.test(c.text))!
  assert.equal(up.ok, true)
  assert.match(up.text, /430 mm/)
  const both = ruleChecks(cfg, 0.2, 1).find((c) => /Mở rộng/.test(c.text))!
  assert.equal(both.ok, false, both.text)
})

test('Luật V4: móc leo xà — họ Maker / Xe Ủi S2 □, Xe Cắm Cờ S4 R1, Xe Phân Loại S1 □; họ Maker bỏ cờ', () => {
  for (const t of ['maker', 'makerLift', 'makerIntake', 'makerPro'] as const) {
    assert.deepEqual(ROBOTS[t].hook, { port: 'S2', button: 'SQUARE' }, t)
    assert.equal(ROBOTS[t].flag, false, t)
    assert.equal(ROBOTS[t].servos.S2, 'Móc leo xà', t)
    assert.equal('rearGrip' in ROBOTS[t] || 'flagFront' in ROBOTS[t], false, t)
  }
  assert.deepEqual(ROBOTS.ui.hook, { port: 'S2', button: 'SQUARE' })
  assert.deepEqual(ROBOTS.co.hook, { port: 'S4', button: 'R1' })
  assert.deepEqual(ROBOTS.sort.hook, { port: 'S1', button: 'SQUARE' })
  assert.equal(ROBOTS.co.flag, true)
  assert.equal(ROBOTS.ui.servos.S2, 'Móc leo xà')
  assert.equal(ROBOTS.sort.servos.S1, 'Móc leo xà')
})

test('Luật V4: mọi mẫu × mọi đế × cơ cấu đều ≤ 5 servo kể cả móc; Maker Pro omni 5 / 5, Xe Cắm Cờ omni 5 / 5 (móc S4 đếm thêm)', () => {
  const servoCount = (c: { text: string }[]) => Number(c.find((x) => x.text.startsWith('Servo:'))!.text.match(/Servo: (\d+)/)![1])
  for (const type of Object.keys(ROBOTS) as (keyof typeof ROBOTS)[]) {
    for (const drive of ROBOTS[type].drives) {
      for (const actuator of ['tt', 's360'] as const) {
        const r = ruleChecks({ type, drive, actuator }, 0)
        const c = r.find((x) => x.text.startsWith('Servo:'))!
        assert.equal(c.ok, true, `${type}/${drive}/${actuator}: ${c.text}`)
        assert.ok(servoCount(r) <= 5)
      }
    }
  }
  assert.ok(ruleChecks({ type: 'makerPro', drive: 'omni', actuator: 'tt' }, 0).some((c) => c.text === 'Servo: 5 / 5'))
  assert.ok(ruleChecks({ type: 'co', drive: 'diff2', actuator: 'tt' }, 0).some((c) => c.text === 'Servo: 4 / 5'))
  assert.ok(ruleChecks({ type: 'co', drive: 'omni', actuator: 'tt' }, 0).some((c) => c.text === 'Servo: 5 / 5'))
  assert.ok(ruleChecks({ type: 'ui', drive: 'diff2', actuator: 'tt' }, 0).some((c) => c.text === 'Servo: 2 / 5'))
})

test('Thanh răng M4 họ Maker (không còn giá cờ): lúc thu không nhô; đẩy hết nhô 200 mm, mở rộng theo luật 161 mm (≤ 500 mm); robot khác 0', () => {
  for (const t of ['maker', 'makerLift', 'makerIntake', 'makerPro'] as const) {
    const def = ROBOTS[t]
    assert.equal(rackOverhang(def, 0), 0, t)
    assert.ok(Math.abs(rackOverhang(def, def.maxExtend) - 0.2) < 1e-9, t)
    assert.ok(Math.abs(rackExtent(def, def.maxExtend) - 0.161) < 1e-9, t)
    assert.ok(Math.max(def.size.w, def.size.l) + rackExtent(def, def.maxExtend) <= 0.5 + 1e-9, t)
  }
  assert.equal(ROBOTS.maker.rack!.forward, true)
  assert.equal(ROBOTS.makerLift.rack!.forward, false)
  for (const t of ['ui', 'co', 'sort'] as const) assert.equal(rackOverhang(ROBOTS[t], 0.08), 0, t)
})
