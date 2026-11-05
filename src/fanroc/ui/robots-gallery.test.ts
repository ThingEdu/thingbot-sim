import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controlRows, portRows, sizeText } from './robots-gallery.ts'
import { portMap, ROBOTS, type RobotType } from '../robots.ts'
import { teleopButtons } from '../programs.ts'

test('portRows: cổng lấy từ portMap + servo của ROBOTS (đế 2 bánh, động cơ TT)', () => {
  assert.deepEqual(portRows({ type: 'maker', drive: 'diff2', actuator: 'tt' }), [
    { port: 'M1', use: 'Bánh trái' },
    { port: 'M2', use: 'Bánh phải' },
    { port: 'M4', use: 'Thanh trượt răng · động cơ TT' },
    { port: 'S1', use: 'Nâng tay' },
    { port: 'S2', use: 'Kẹp cờ' },
    { port: 'S3', use: 'Cửa xả' },
  ])
})

test('portRows: đế 4 bánh chiếm M1–M4, cơ cấu chuyển sang S4 / S5 servo 360', () => {
  const rows = portRows({ type: 'maker', drive: 'omni', actuator: 'tt' })
  assert.deepEqual(rows.map((r) => r.port), ['M1', 'M2', 'M3', 'M4', 'S1', 'S2', 'S3', 'S5'])
  assert.equal(rows.find((r) => r.port === 'M3')?.use, 'Bánh sau trái')
  assert.equal(rows.find((r) => r.port === 'S5')?.use, 'Thanh trượt răng · servo 360')
})

test('portRows: mọi robot × đế — mỗi cổng portMap dùng đều có dòng, không cổng nào hai dòng', () => {
  for (const type of Object.keys(ROBOTS) as RobotType[]) {
    for (const drive of ROBOTS[type].drives) {
      for (const actuator of ['tt', 's360'] as const) {
        const cfg = { type, drive, actuator }
        const rows = portRows(cfg)
        const ports = rows.map((r) => r.port)
        assert.equal(new Set(ports).size, ports.length, `${type}/${drive}/${actuator}`)
        const m = portMap(cfg)
        for (const p of [...Object.values(m.wheels), m.intake, m.lift]) if (p) assert.ok(ports.includes(p), `${type}/${drive}: thiếu ${p}`)
        for (const s of Object.keys(ROBOTS[type].servos)) assert.ok(ports.includes(s), `${type}: thiếu ${s}`)
      }
    }
  }
})

test('sizeText: kích thước từ ROBOTS, đơn vị mm', () => {
  assert.equal(sizeText(ROBOTS.maker), '240 × 300 × 216 mm (ngang × dài × cao)')
})

test('controlRows: nút tay PS2 lấy từ teleopButtons, kèm dòng cần lái theo đế', () => {
  const cfg = { type: 'co' as const, drive: 'diff2' as const, actuator: 'tt' as const }
  const rows = controlRows(cfg)
  assert.match(rows[0].use, /cần trái.*bánh trái/i)
  const btns = teleopButtons(cfg)
  for (const [k, v] of Object.entries(btns)) assert.ok(rows.some((r) => r.port === k && r.use === v), k)
  assert.match(controlRows({ type: 'co', drive: 'omni', actuator: 'tt' })[0].use, /đi ngang/)
})

test('demoPose: chạy thử cơ cấu trong giới hạn của robot (vươn 0…maxExtend, tay 0…1, kẹp / cửa đổi theo nhịp)', async () => {
  const { demoPose } = await import('./robots-gallery.ts')
  const def = ROBOTS.maker
  const ps = Array.from({ length: 61 }, (_, i) => demoPose(def, i / 10))
  assert.ok(ps.every((p) => p.extend >= 0 && p.extend <= def.maxExtend + 1e-9 && p.armFrac >= 0 && p.armFrac <= 1))
  assert.ok(ps[0].extend < 1e-9 && Math.abs(ps[30].extend - def.maxExtend) < 1e-9, 'đầu chu kỳ thu hết, giữa chu kỳ vươn hết')
  assert.ok(ps.some((p) => p.grip) && ps.some((p) => !p.grip) && ps.some((p) => p.gate) && ps.some((p) => !p.gate))
})
