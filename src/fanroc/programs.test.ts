// Chương trình mẫu chạy bằng đúng khối, bộ sinh mã và bo ảo của trang, trong Node: headless.ts được gói bằng esbuild
// (scratch-blocks là TypeScript có enum), Blockly dựng XML trên jsdom của checkout ThingBlock.
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { AUTO_TIMES, defaultConfig, sample, SAMPLES, teleopButtons, TOOLBOX, TOOLBOX_OPCODES } from './programs.ts'
import { PS2_NEUTRAL, PRESENT_KEY, type Ps2State } from './gamepad.ts'
import { decodePorts, type PortValues } from './ports.ts'
import { RobotLink } from './link.ts'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { ROBOTS, type RobotConfig, type RobotType } from './robots.ts'
import type { Command, Message } from '../sim-worker.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(ROOT, '../thingblock-editor-sim'))
const pkg = (p: string) => join(THINGBLOCK, 'packages', p)

type SessionLike = {
  running: boolean
  tick(ms: number): { pwm: number[]; error: string | undefined; running: boolean; t: number }
  setInput(key: string, value: number): void
}
type Headless = {
  useDom(window: object): void
  generate(state: object): { sim: string; arduino: string; error?: string }
  known(type: string): boolean
  Session: new (code: string, opts?: { now?: () => number }) => SessionLike
}
let H: Headless

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fanroc-headless-'))
  const outfile = join(dir, 'headless.mjs')
  // Cùng alias với vite.config.ts; nền "browser" để Blockly không kéo bản Node (cần jsdom lúc nạp).
  await build({
    entryPoints: [join(ROOT, 'src/fanroc/headless.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    logLevel: 'error',
    nodePaths: [join(THINGBLOCK, 'node_modules')],
    loader: { '.css': 'empty', '.png': 'empty', '.svg': 'empty' },
    alias: {
      '@scratch/scratch-blocks': pkg('scratch-blocks/src/index.ts'),
      '@thingblock/thingblock-sim/checker': pkg('thingblock-sim/src/checker/index.ts'),
      '@thingblock/thingblock-sim': pkg('thingblock-sim/src/index.ts'),
      '@thingblock/resource': pkg('thingblock-resource/src'),
      '@thingblock/block-colors': pkg('scratch-gui/src/lib/settings/color-mode/default/index.js'),
    },
  })
  H = (await import(pathToFileURL(outfile).href)) as Headless
  rmSync(dir, { recursive: true, force: true })
  const { JSDOM } = createRequire(join(THINGBLOCK, 'node_modules/blockly/package.json'))('jsdom')
  H.useDom(new JSDOM().window)
})

const TYPES = Object.keys(ROBOTS) as RobotType[]
/** Mọi cấu hình chọn được trên trang: robot mẫu × đế bánh × cơ cấu M3/M4. */
const CONFIGS: RobotConfig[] = TYPES.flatMap((type) =>
  ROBOTS[type].drives.flatMap((drive) => (['tt', 's360'] as const).map((actuator) => ({ type, drive, actuator }))),
)
const name = (c: RobotConfig) => `${ROBOTS[c.type].name} · ${c.drive} · ${c.actuator}`

/** Mọi opcode trong chương trình (khối, bóng của ô nhập, khối nối tiếp). */
const opcodes = (state: object): Set<string> => {
  const out = new Set<string>()
  type S = { type: string; inputs?: Record<string, { shadow?: S; block?: S }>; next?: { block?: S } }
  const visit = (b: S | undefined): void => {
    if (!b) return
    out.add(b.type)
    for (const input of Object.values(b.inputs ?? {})) (visit(input.shadow), visit(input.block))
    visit(b.next?.block)
  }
  for (const b of (state as { blocks: { blocks: S[] } }).blocks.blocks) visit(b)
  return out
}

const code = (state: object): string => {
  const g = H.generate(state)
  assert.equal(g.error, undefined, `sinh mã lỗi: ${g.error}`)
  return g.sim
}

test('SAMPLES có đủ 4 robot mẫu, mỗi robot TeleOp + Auto, đúng cấu hình mặc định', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), [...TYPES].sort())
  for (const t of TYPES) {
    assert.deepEqual(SAMPLES[t].teleop, sample(defaultConfig(t), 'teleop'))
    assert.deepEqual(SAMPLES[t].auto, sample(defaultConfig(t), 'auto'))
  }
})

test('hộp công cụ: đúng danh sách của kế hoạch, mọi khối đều là khối đã đăng ký (không khối mới)', () => {
  const types = new Set<string>()
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk)
    else if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>
      if (r.kind === 'block') types.add(r.type as string)
      // Chuyên mục động "Khối của em": scratch-blocks tự dựng định nghĩa / prototype / lời gọi / ô tham số.
      if (r.custom === 'PROCEDURE') for (const t of ['procedures_definition', 'procedures_prototype', 'procedures_call', 'argument_reporter_string_number']) types.add(t)
      if (r.shadow) walk([{ kind: 'block', ...(r.shadow as object) }])
      Object.values(r).forEach(walk)
    }
  }
  walk(TOOLBOX)
  assert.deepEqual([...types].sort(), [...TOOLBOX_OPCODES].sort())
  for (const t of types) assert.ok(H.known(t), `khối "${t}" chưa đăng ký`)
})

for (const cfg of CONFIGS)
  for (const kind of ['teleop', 'auto'] as const)
    test(`${kind} ${name(cfg)}: sinh mã mô phỏng không lỗi, mã Arduino đúng, chỉ dùng khối của hộp công cụ`, () => {
      const state = sample(cfg, kind)
      const g = H.generate(state)
      assert.equal(g.error, undefined, `sinh mã mô phỏng lỗi: ${g.error}`)
      assert.ok(g.sim.length > 0)
      assert.match(g.arduino, /pwm\.setPWM\(M1_B/)
      if (kind === 'teleop') assert.match(g.arduino, /ps2x\.read_gamepad\(/)
      for (const op of opcodes(state)) assert.ok(TOOLBOX_OPCODES.has(op), `khối "${op}" không có trong hộp công cụ`)
    })

/** Chạy mã trên bo ảo `ms` mili giây với tay cầm `pad` (đặt như trang: ps2_PRESENT + đủ mọi khoá), trả cổng cuối. */
const runFor = (sim: string, pad: Ps2State | null, ms: number, present = true): PortValues => {
  const s = new H.Session(sim, { now: () => 0 })
  if (present) s.setInput(`adc${PRESENT_KEY}`, 1)
  for (const [k, v] of Object.entries(pad ?? PS2_NEUTRAL)) s.setInput(`adc${k}`, v)
  s.running = true
  let snap = s.tick(0)
  for (let t = 0; t < ms; t += 16) snap = s.tick(16)
  assert.equal(snap.error, undefined)
  return decodePorts(snap.pwm)
}
const pad = (over: Ps2State = {}): Ps2State => ({ ...PS2_NEUTRAL, ...over })
const MAKER = defaultConfig('maker')

test('R23: cần đẩy hết lên (LY = RY = 0) tới chương trình là 0 ⇒ M1 = M2 = 100 (tiến hết cỡ)', () => {
  const p = runFor(code(SAMPLES.maker.teleop), pad({ ps2_PSS_LY: 0, ps2_PSS_RY: 0 }), 300)
  assert.equal(p.M1, 100)
  assert.equal(p.M2, 100)
})

test('R23: trang bài học (không có ps2_PRESENT) đọc cần 0 là giữa 128 như trước ⇒ đứng yên', () => {
  const p = runFor(code(SAMPLES.maker.teleop), pad({ ps2_PSS_LY: 0, ps2_PSS_RY: 0 }), 300, false)
  assert.equal(p.M1, 0)
  assert.equal(p.M2, 0)
})

test('TeleOp xe tăng: cần giữa (và trong vùng 120…136) đứng yên, kéo hết xuống lùi, nửa lên tiến ≈ 50', () => {
  const sim = code(SAMPLES.maker.teleop)
  assert.deepEqual([runFor(sim, pad(), 200).M1, runFor(sim, pad({ ps2_PSS_LY: 120, ps2_PSS_RY: 136 }), 200).M2], [0, 0])
  const edge = runFor(sim, pad({ ps2_PSS_LY: 119, ps2_PSS_RY: 137 }), 200)
  assert.ok(edge.M1 > 0 && edge.M2 < 0, `ngoài vùng giữa phải chạy: ${edge.M1}, ${edge.M2}`)
  const down = runFor(sim, pad({ ps2_PSS_LY: 255, ps2_PSS_RY: 255 }), 200)
  assert.ok(down.M1 < -95 && down.M2 < -95, `lùi ${down.M1}, ${down.M2}`)
  const half = runFor(sim, pad({ ps2_PSS_LY: 64 }), 200)
  assert.ok(Math.abs(half.M1 - 50) <= 1 && half.M2 === 0, `nửa cần ${half.M1}, ${half.M2}`)
})

test('TeleOp Mẫu Maker: △ / ✕ vươn / thu (M4), ○ mở cửa xả S3, □ giơ móc S2 (V4); không hút bóng (R1 không dùng M3)', () => {
  const sim = code(SAMPLES.maker.teleop)
  const idle = runFor(sim, pad(), 200)
  assert.deepEqual([idle.M3, idle.M4, idle.S2, idle.S3], [0, 0, 0, 0])
  const p = runFor(sim, pad({ ps2_PSB_R1: 1, ps2_PSB_TRIANGLE: 1, ps2_PSB_CIRCLE: 1, ps2_PSB_SQUARE: 1 }), 200)
  assert.deepEqual([p.M3, p.M4, p.S2, p.S3], [0, 100, 180, 180])
  assert.equal(runFor(sim, pad({ ps2_PSB_CROSS: 1 }), 200).M4, -100)
})

test('Luật V4: Mẫu Maker / Maker Hút không còn "nâng tay" — không có L1 / L2 trong bảng phím, mẫu TeleOp không đụng S1, không servo S1', () => {
  for (const type of ['maker', 'makerIntake'] as const) {
    const cfg = defaultConfig(type)
    const b = teleopButtons(cfg)
    assert.equal(b.L1, undefined, `${type} L1: ${b.L1}`)
    assert.equal(b.L2, undefined, `${type} L2: ${b.L2}`)
    assert.equal(ROBOTS[type].servos.S1, undefined, type)
    assert.equal(ROBOTS[type].arm, undefined, type)
    const sim = code(SAMPLES[type].teleop)
    assert.equal(runFor(sim, pad({ ps2_PSB_L1: 1 }), 200).S1, null, `${type}: L1 vẫn ra lệnh S1`)
    assert.equal(runFor(sim, pad({ ps2_PSB_L2: 1 }), 200).S1, null, `${type}: L2 vẫn ra lệnh S1`)
  }
  // Maker Nâng / Pro vẫn giữ L1 / R2 / L2 cho cửa lồng S1; Xe Cắm Cờ vẫn vươn / thu tay cờ.
  assert.equal(teleopButtons(defaultConfig('makerLift')).L1, 'Nâng cửa lồng: Rãnh 3')
  assert.equal(teleopButtons(defaultConfig('makerPro')).L2, 'Hạ cửa lồng: Rãnh 1')
  assert.deepEqual([teleopButtons(defaultConfig('co')).L1, teleopButtons(defaultConfig('co')).L2], ['Vươn tay cờ', 'Thu tay cờ'])
})

test('TeleOp servo 360: R1 hút bằng S4 = 180° (Xe Phân Loại), △ nâng bằng S5 = 180° (Mẫu Maker), thả nút là 90° (dừng)', () => {
  const sort = code(sample({ type: 'sort', drive: 'diff2', actuator: 's360' }, 'teleop'))
  assert.equal(runFor(sort, pad(), 200).S4, 90)
  const ps = runFor(sort, pad({ ps2_PSB_R1: 1 }), 200)
  assert.deepEqual([ps.S4, ps.M3], [180, 0])
  const sim = code(sample({ type: 'maker', drive: 'diff2', actuator: 's360' }, 'teleop'))
  assert.equal(runFor(sim, pad(), 200).S5, 90)
  const p = runFor(sim, pad({ ps2_PSB_TRIANGLE: 1 }), 200)
  assert.deepEqual([p.S5, p.M4], [180, 0])
})

test('TeleOp Xe Phân Loại: L2 gạt S2 sang ngăn xanh, L1 về ngăn cam, ○ mở cửa S3', () => {
  const sim = code(SAMPLES.sort.teleop)
  assert.equal(runFor(sim, pad(), 200).S2, 0)
  assert.equal(runFor(sim, pad({ ps2_PSB_L2: 1 }), 200).S2, 180)
  assert.equal(runFor(sim, pad({ ps2_PSB_CIRCLE: 1 }), 200).S3, 180)
})

test('TeleOp mecanum: LY lên ⇒ 4 bánh tiến; LX phải ⇒ FL+ FR− RL− RR+; RX phải ⇒ FL+ FR− RL+ RR−', () => {
  const sim = code(sample({ type: 'maker', drive: 'mecanum', actuator: 'tt' }, 'teleop'))
  const sign = (p: PortValues) => [p.M1, p.M2, p.M3, p.M4].map(Math.sign)
  assert.deepEqual(sign(runFor(sim, pad({ ps2_PSS_LY: 0 }), 200)), [1, 1, 1, 1])
  assert.deepEqual(sign(runFor(sim, pad({ ps2_PSS_LX: 255 }), 200)), [1, -1, -1, 1])
  assert.deepEqual(sign(runFor(sim, pad({ ps2_PSS_RX: 255 }), 200)), [1, -1, 1, -1])
  assert.deepEqual(sign(runFor(sim, pad(), 200)), [0, 0, 0, 0])
})

/** Chạy chương trình trên robot ở ô xuất phát Robot 1 (đỏ, ô trái), như vòng lặp trận: bo ảo một nhịp, vật lý một bước. */
const onField = async (cfg: RobotConfig, sim: string, seconds: number, padAt: (t: number) => Ps2State | null = () => null) => {
  const world = await FanrocWorld.create(1)
  const robot = new RobotBody(world, cfg, 'red', 0)
  // Nối qua RobotLink như trang, worker thay bằng một Session chạy đồng bộ.
  let session: SessionLike | null = null
  let run = 0
  const link = new RobotLink((c: Command) => {
    if (c.type === 'load') ((session = new H.Session(c.code, { now: () => 0 })), (run = c.run))
    else if (c.type === 'run' && session) session.running = true
    else if (c.type === 'input') session?.setInput(c.key, c.value)
    else if (c.type === 'stop') session = null
  })
  link.load(sim)
  link.start()
  const trace: { t: number; x: number; z: number; ports: PortValues }[] = []
  for (let k = 0; k < Math.round(seconds / PHYSICS_DT); k++) {
    const t = k * PHYSICS_DT
    link.input(padAt(t))
    if (session) {
      const snap = (session as SessionLike).tick(PHYSICS_DT * 1000)
      link.receive({ type: 'snapshot', run, snapshot: snap, bus: {} } as unknown as Message)
    }
    const ports = link.ports()
    robot.apply(ports, PHYSICS_DT)
    world.step(PHYSICS_DT)
    trace.push({ t, ...robot.pose, ports })
  }
  return { robot, link, trace }
}
const at = <P extends { t: number }>(trace: P[], t: number): P => trace.find((p) => p.t >= t - 1e-9)!

test('TeleOp Mẫu Maker trên sân: hai cần đẩy lên ⇒ chạy về phía Ngọn Núi (−z); rút tay cầm ⇒ dừng hẳn (Review Focus 1)', async () => {
  const up = pad({ ps2_PSS_LY: 0, ps2_PSS_RY: 0 })
  const { trace } = await onField(MAKER, code(SAMPLES.maker.teleop), 3, (t) => (t < 1.5 ? up : null))
  const a = at(trace, 0)
  const b = at(trace, 1.5)
  const c = at(trace, 3 - PHYSICS_DT)
  assert.ok(a.z - b.z > 0.3, `1,5 s tiến được ${(a.z - b.z).toFixed(3)} m`)
  assert.deepEqual([c.ports.M1, c.ports.M2], [0, 0])
  assert.ok(Math.abs(c.z - at(trace, 2).z) < 0.005, `rút tay rồi vẫn trôi ${(at(trace, 2).z - c.z).toFixed(3)} m`)
})

test('Chương trình lỗi giữa trận (chia cho 0) ⇒ báo lỗi tiếng Việt, robot dừng (Review Focus 2)', async () => {
  // Lái tới 1 s rồi «set motor M1 … at (100 / 0)».
  const bad = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'event_whenarduinobegin', x: 0, y: 0,
          next: { block: { type: 'thingBotC3_init', next: { block: {
            type: 'thingBotC3_setMotor', fields: { MOTOR: '1', DIRECTION: 'forward' }, inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 80 } } } },
            next: { block: {
              type: 'thingBotC3_setMotor', fields: { MOTOR: '2', DIRECTION: 'forward' }, inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 80 } } } },
              next: { block: {
                type: 'control_wait', inputs: { DURATION: { shadow: { type: 'math_positive_number', fields: { NUM: 1 } } } },
                next: { block: {
                  type: 'thingBotC3_setMotor', fields: { MOTOR: '1', DIRECTION: 'forward' },
                  inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 0 } }, block: { type: 'operator_divide', inputs: { NUM1: { shadow: { type: 'math_number', fields: { NUM: 100 } } }, NUM2: { shadow: { type: 'math_number', fields: { NUM: 0 } } } } } } },
                } },
              } },
            } },
          } } } },
        },
        { type: 'event_whenarduinoloop', x: 0, y: 400 },
      ],
    },
  }
  const { link, trace } = await onField(MAKER, code(bad), 2.5)
  assert.equal(link.state, 'error')
  assert.match(link.error ?? '', /chia một số nguyên cho 0/)
  const end = at(trace, 2.5 - PHYSICS_DT)
  assert.deepEqual([end.ports.M1, end.ports.M2], [0, 0])
  assert.ok(at(trace, 0.9).ports.M1 > 0, 'trước lỗi robot phải đang chạy')
})

// Luật V4: Auto mẫu kết thúc bằng leo Thang Cứu Hỏa. Mọi robot mẫu (cấu hình mặc định, thêm Mẫu Maker mecanum) đều
// phải tới núi, xả bóng, bám thanh đỏ rồi trượt sang đoạn Nước, còn treo ở đó lúc hết 30 s — không còn bỏ qua.
for (const cfg of [...TYPES.map(defaultConfig), { type: 'maker', drive: 'mecanum', actuator: 'tt' } as RobotConfig])
  test(`Auto ${name(cfg)} từ ô Robot 1: tới Ngọn Núi A, mở cửa xả, rồi leo Thang Cứu Hỏa đỏ, trượt sang Nước`, async () => {
    const T = AUTO_TIMES
    const { robot, link, trace } = await onField(cfg, code(sample(cfg, 'auto')), 30)
    assert.notEqual(link.state, 'error', link.error ?? '')
    const atMountain = at(trace, T.toMountain)
    assert.ok(atMountain.z < 0.95, `chưa tới núi: z = ${atMountain.z.toFixed(3)}`)
    if (ROBOTS[cfg.type].servos.S3) assert.equal(at(trace, T.toMountain + T.dump / 2).ports.S3, 180, 'đang xả: cửa S3 phải mở')
    const { level, bar } = robot.climbLevel
    assert.equal(level, 'water', `chưa treo ở Nước: ${level}, s = ${robot.climb.s.toFixed(3)}, dừng ở ${JSON.stringify(robot.pose)}`)
    assert.equal(bar, 'red')
  })

test('TeleOp Maker Nâng: L2 / R2 / L1 đưa cửa lồng S1 tới 0° / 120° / 180° (Rãnh 1 / 2 / 3)', () => {
  const sim = code(SAMPLES.makerLift.teleop)
  assert.equal(runFor(sim, pad(), 200).S1, 0)
  assert.ok(Math.abs(runFor(sim, pad({ ps2_PSB_R2: 1 }), 200).S1! - 120) < 1) // PWM làm tròn ~0,15°
  assert.equal(runFor(sim, pad({ ps2_PSB_L1: 1 }), 200).S1, 180)
  assert.equal(runFor(sim, pad({ ps2_PSB_L1: 1, ps2_PSB_L2: 1 }), 200).S1, 0)
})

for (const cfg of [...TYPES.map(defaultConfig), { type: 'co', drive: 'omni', actuator: 'tt' } as RobotConfig, { type: 'sort', drive: 'mecanum', actuator: 's360' } as RobotConfig])
  test(`TeleOp ${name(cfg)}: móc leo xà ở ${ROBOTS[cfg.type].hook.port} — giữ ${ROBOTS[cfg.type].hook.button} giơ 180°, nhả hạ 0°; khớp teleopButtons`, () => {
    const { port, button } = ROBOTS[cfg.type].hook
    const sim = code(sample(cfg, 'teleop'))
    assert.equal(runFor(sim, pad(), 200)[port], 0, 'lúc đầu móc hạ')
    assert.equal(runFor(sim, pad({ [`ps2_PSB_${button}`]: 1 }), 200)[port], 180, 'giữ nút: giơ móc')
    assert.equal(teleopButtons(cfg)[button], 'Giữ: giơ móc leo xà (nhả: kéo lên xà)')
    // Mẫu chỉ có đúng một nút điều khiển móc: không nút nào khác trong bảng nói về móc.
    assert.deepEqual(Object.entries(teleopButtons(cfg)).filter(([, v]) => /móc/.test(v!)).map(([k]) => k), [button])
  })
