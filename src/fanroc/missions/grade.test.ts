// 12 nhiệm vụ con rùa + bộ chấm ⭐. Phần chấm là hàm thuần; phần "giải được" chạy chương trình khối thật trên sân
// mô phỏng: headless.ts gói bằng esbuild (như programs.test.ts), Session của thingblock-sim + RobotBody, sân thường
// không bước Match nên bóng nằm yên trong Hộp Phân Phối (R35).
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { MISSIONS } from './data.ts'
import { grade } from './grade.ts'
import type { Goal, Mission, RunRecord } from './types.ts'
import { TOOLBOX_OPCODES } from '../programs.ts'
import { argumentReporter, procedureCall, procedureState } from '../procedures.ts'
import { holeCentres, mountainAt, type Pose } from '../layout.ts'
import { scoreTally, type FieldTally } from '../scoring.ts'
import { RobotLink } from '../link.ts'
import { FanrocWorld, PHYSICS_DT } from '../world.ts'
import { RobotBody } from '../robot.ts'
import { Trail } from '../trail.ts'
import type { Command, Message } from '../../sim-worker.ts'

const ROOT = resolve(import.meta.dirname, '../../..')
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(ROOT, '../thingblock-editor-sim'))
const pkg = (p: string) => join(THINGBLOCK, 'packages', p)
const { JSDOM } = createRequire(join(THINGBLOCK, 'node_modules/blockly/package.json'))('jsdom')

type SessionLike = { running: boolean; tick(ms: number): { pwm: number[]; error: string | undefined; running: boolean; t: number }; setInput(k: string, v: number): void }
type Headless = {
  useDom(window: object): void
  generate(state: object): { sim: string; arduino: string; error?: string }
  blockTypes(state: object): string[]
  Session: new (code: string, opts?: { now?: () => number }) => SessionLike
}
let H: Headless

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fanroc-missions-'))
  const outfile = join(dir, 'headless.mjs')
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
  H.useDom(new JSDOM().window)
})

const byN = (n: number) => MISSIONS.find((m) => m.n === n)!
const M7 = byN(7)

// ---------- Chương trình thử ----------
type B = Record<string, unknown>
const num = (v: number) => ({ shadow: { type: 'math_number', fields: { NUM: v } } })
const chain = (bs: B[]): B | undefined => bs.reduceRight<B | undefined>((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), undefined)
const motor = (m: number, dir: 'forward' | 'backward', speed: number): B => ({ type: 'thingBotC3_setMotor', fields: { MOTOR: String(m), DIRECTION: dir }, inputs: { SPEED: num(speed) } })
const wait = (s: number | B): B => ({
  type: 'control_wait',
  inputs: { DURATION: typeof s === 'number' ? { shadow: { type: 'math_positive_number', fields: { NUM: s } } } : { shadow: { type: 'math_positive_number', fields: { NUM: 1 } }, block: s } },
})
const div = (a: B, b: number): B => ({ type: 'operator_divide', inputs: { NUM1: { ...num(0), block: a }, NUM2: num(b) } })
const repeat = (n: number, body: B[]): B => ({ type: 'control_repeat', inputs: { TIMES: { shadow: { type: 'math_whole_number', fields: { NUM: n } } }, SUBSTACK: { block: chain(body) } } })
const defs = (...states: object[]) => states.map((s) => (s as { blocks: { blocks: B[] } }).blocks.blocks[0]).map((b, i) => ({ ...b, x: 460, y: 30 + i * 320 }))
const prog = (begin: B[], extra: B[] = []) => ({
  blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: chain([{ type: 'thingBotC3_init' }, ...begin]) } }, { type: 'event_whenarduinoloop', x: 30, y: 500 }, ...extra] },
})

/**
 * Lời giải mẫu nhiệm vụ 7 (và bản sửa của nhiệm vụ 8): «tiến (mét)» và «rẽ trái (độ)» chia cho đúng số đo của nhiệm
 * vụ 4 ở tốc độ 60 (0,275 m/s; 131 °/s), «lặp lại 4».
 */
const turtle = (side: number, degPerS: number) =>
  prog(
    [repeat(4, [procedureCall('tiến', [side]) as B, procedureCall('rẽ trái', [90]) as B])],
    defs(
      procedureState('tiến', ['mét'], [motor(1, 'forward', 60), motor(2, 'forward', 60), wait(div(argumentReporter('mét') as B, 0.275)), motor(1, 'forward', 0), motor(2, 'forward', 0), wait(0.3)]),
      procedureState('rẽ trái', ['độ'], [motor(1, 'backward', 60), motor(2, 'forward', 60), wait(div(argumentReporter('độ') as B, degPerS)), motor(1, 'forward', 0), motor(2, 'forward', 0), wait(0.3)]),
    ),
  )

// ---------- Bản ghi giả ----------
const at = (p: Pose, dx: number, dz = 0, dyaw = 0): Pose => ({ x: p.x + dx, z: p.z + dz, yaw: p.yaw + dyaw })
const record = (m: Mission, o: Partial<RunRecord> = {}): RunRecord => ({
  start: m.start, end: m.start, trail: { distance: 3, turned: 360, time: 15 }, touchedMountain: false, events: [], program: null, ...o,
})
const emptyTally = (): FieldTally => ({
  fire: { o: 0, g: 0 }, mtn: [0, 1, 2, 3].map(() => [0, 1, 2].map(() => ({ g: 0, o: 0 }))), flags: [false, false, false, false],
  parks: { red: [null, null], blue: [null, null] },
})

/** Bản ghi đạt mọi điều kiện của nhiệm vụ (⭐ + ⭐⭐ + ⭐⭐⭐), dựng từ chính dữ liệu: chứng minh 3 sao đạt được về logic. */
function ideal(m: Mission): RunRecord {
  const all: Goal[] = [...m.goals, ...m.stars.two, ...m.stars.three]
  let end = { ...m.start }
  const trail = { distance: 0.01, turned: 0, time: 1e9 }
  const tally = emptyTally()
  const events: RunRecord['events'] = []
  const begin: B[] = []
  let paramCalls = 0
  for (const g of all) {
    if (g.type === 'reach') end = { ...end, x: (g.rect.x0 + g.rect.x1) / 2, z: (g.rect.z0 + g.rect.z1) / 2 }
    if (g.type === 'turn') end = { ...end, yaw: m.start.yaw + (g.deg * Math.PI) / 180 }
    if (g.type === 'measure') trail[g.what] = Math.max(trail[g.what], g.min ?? 0.01)
    if (g.type === 'time') trail.time = Math.min(trail.time, g.max)
    if (g.type === 'uses') begin.push(...g.opcodes.map((op) => (op === 'control_repeat' ? repeat(2, []) : op === 'control_wait' ? wait(1) : op === 'thingBotC3_setMotor' ? motor(1, 'forward', 0) : { type: op })))
    if (g.type === 'paramBlock') paramCalls = Math.max(paramCalls, g.calls ?? 1)
    if (g.type === 'flag') ((tally.flags[g.mountain] = true), events.push({ t: 1, robot: 0, text: `Robot 1 cắm cờ Núi ${'ABCD'[g.mountain]}` }))
    if (g.type === 'park') tally.parks.red[0] = 'full'
    if (g.type === 'score') tally.fire.o = Math.max(tally.fire.o, Math.ceil(g.min / 5))
    if (g.type === 'matchEnd') events.push({ t: 180, robot: null, text: 'Hết giờ — điểm trận 0' })
  }
  if (trail.time === 1e9) trail.time = 5
  for (let k = 0; k < paramCalls; k++) begin.push(procedureCall('tiến', [0.1]) as B)
  const program = prog(begin, paramCalls ? defs(procedureState('tiến', ['mét'], [])) : [])
  return { start: m.start, end, trail, touchedMountain: false, events, tally, program }
}

// ---------- Chạy trên sân ----------
/** Chạy chương trình của nhiệm vụ trên sân `seconds` giây như vòng lặp trận: bo ảo một nhịp, vật lý một bước. */
async function runOnField(m: Mission, state: object, seconds: number): Promise<RunRecord> {
  const g = H.generate(state)
  assert.equal(g.error, undefined, `sinh mã lỗi: ${g.error}`)
  const world = await FanrocWorld.create(1)
  try {
    const robot = new RobotBody(world, m.robot, 'red', 0)
    robot.setPose(m.start)
    let session: SessionLike | null = null
    let run = 0
    const link = new RobotLink((c: Command) => {
      if (c.type === 'load') ((session = new H.Session(c.code, { now: () => 0 })), (run = c.run))
      else if (c.type === 'run' && session) session.running = true
      else if (c.type === 'stop') session = null
    })
    link.load(g.sim)
    link.start()
    const trail = new Trail()
    let touched = false
    trail.add(0, robot.pose, link.ports())
    for (let k = 1; k <= Math.round(seconds / PHYSICS_DT); k++) {
      if (session) link.receive({ type: 'snapshot', run, snapshot: (session as SessionLike).tick(PHYSICS_DT * 1000), bus: {} } as unknown as Message)
      const ports = link.ports()
      robot.apply(ports, PHYSICS_DT)
      world.step(PHYSICS_DT)
      trail.add(k * PHYSICS_DT, robot.pose, ports)
      // Bốn góc và điểm giữa bốn cạnh của thân xe.
      const c = robot.footprint()
      const pts = [...c, ...c.map((p, i) => ({ x: (p.x + c[(i + 1) % 4].x) / 2, z: (p.z + c[(i + 1) % 4].z) / 2 }))]
      if (pts.some((p) => mountainAt(p.x, p.z) >= 0)) touched = true
    }
    assert.notEqual(link.state, 'error', `chương trình lỗi: ${link.error}`)
    return { start: m.start, end: robot.pose, trail: { distance: trail.distance, turned: trail.turned, time: trail.time }, touchedMountain: touched, events: [], program: state }
  } finally {
    world.rapier.free()
  }
}
const err = (r: RunRecord) => Math.hypot(r.end.x - r.start.x, r.end.z - r.start.z)

// ---------- Dữ liệu ----------
test('12 nhiệm vụ, id duy nhất, n = 1..12, chặng và tên đúng bảng 6.3', () => {
  assert.equal(MISSIONS.length, 12)
  assert.equal(new Set(MISSIONS.map((m) => m.id)).size, 12)
  assert.deepEqual(MISSIONS.map((m) => m.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  assert.deepEqual(MISSIONS.map((m) => m.stage), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4])
  assert.deepEqual(MISSIONS.map((m) => m.title), [
    'Làm quen robot', 'Đi thẳng', 'Cong và xoay', 'Đo robot', 'Khối "tiến (m)"', 'Khối "rẽ phải/trái (độ)"', 'Hình vuông', 'Gỡ lỗi',
    'Dọn Khu Chữa Cháy', 'Cắm cờ', 'Về Vùng Bảo Vệ', 'Trận đầu tiên',
  ])
  assert.equal(byN(12).kind, 'match')
})

test('nhiệm vụ 1–8: sân không bóng, Mẫu Maker 2 bánh (M1 trái, M2 phải)', () => {
  for (const m of MISSIONS.filter((x) => x.n <= 8)) {
    assert.equal(m.balls, false, `nhiệm vụ ${m.n}`)
    assert.deepEqual(m.robot, { type: 'maker', drive: 'diff2', actuator: 'tt' }, `nhiệm vụ ${m.n}`)
  }
})

test('mọi chữ cho học sinh có tiếng Việt có dấu, đủ hướng dẫn và gợi ý', () => {
  for (const m of MISSIONS) {
    assert.ok(m.guide.length >= 3, `nhiệm vụ ${m.n}: ít nhất 3 bước hướng dẫn`)
    assert.ok(m.hints.length >= 1, `nhiệm vụ ${m.n}: có gợi ý`)
    for (const s of [m.goal, ...m.guide, ...m.hints.map((h) => h.text)]) assert.match(s, /[àáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/i, `"${s}"`)
  }
})

/** Opcode của mọi khối trong hộp công cụ / chương trình (kể cả bóng). */
const opcodes = (o: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(o)) o.forEach((x) => opcodes(x, out))
  else if (o && typeof o === 'object') {
    const r = o as Record<string, unknown>
    if (typeof r.type === 'string' && (r.kind === 'block' || r.kind === undefined)) out.add(r.type)
    for (const [k, v] of Object.entries(r)) if (k !== 'fields' && k !== 'extraState') opcodes(v, out)
  }
  return out
}

test('hộp công cụ của mọi nhiệm vụ chỉ có khối đã có (TOOLBOX_OPCODES), không khối mới', () => {
  for (const m of MISSIONS) {
    const ops = opcodes(m.toolbox)
    assert.ok(ops.size > 0, `nhiệm vụ ${m.n}: hộp công cụ rỗng`)
    for (const op of ops) assert.ok(TOOLBOX_OPCODES.has(op), `nhiệm vụ ${m.n}: khối "${op}" ngoài TOOLBOX_OPCODES`)
  }
})

test('mọi chương trình ban đầu sinh mã không lỗi và chỉ dùng khối đã có', () => {
  for (const m of MISSIONS) {
    if (!m.starter) continue
    const g = H.generate(m.starter)
    assert.equal(g.error, undefined, `nhiệm vụ ${m.n}: ${g.error}`)
    assert.ok(g.sim.length > 0)
    for (const op of H.blockTypes(m.starter)) assert.ok(TOOLBOX_OPCODES.has(op), `nhiệm vụ ${m.n}: khối "${op}"`)
  }
})

test('mỗi nhiệm vụ đạt được 3 sao (bản ghi dựng từ điều kiện của chính nó), và bản ghi rỗng không được sao nào', () => {
  for (const m of MISSIONS) {
    const r = grade(m, ideal(m))
    assert.deepEqual([r.done, r.stars], [true, 3], `nhiệm vụ ${m.n}: ${JSON.stringify(r.goals.filter((g) => !g.ok))}`)
    const nothing = grade(m, { start: m.start, end: m.start, trail: { distance: 0, turned: 0, time: 0 }, touchedMountain: false, events: [], program: null })
    assert.deepEqual([nothing.done, nothing.stars], [false, 0], `nhiệm vụ ${m.n}: đứng yên không làm gì mà vẫn đạt`)
  }
})

test('nhiệm vụ 10 dùng vị trí lỗ cờ Núi A (holeCentres) làm điểm cuối đường gợi ý', () => {
  const path = byN(10).path!
  assert.deepEqual(path[path.length - 1], holeCentres()[0])
})

// ---------- Bộ chấm: khép vòng (nhiệm vụ 7) ----------
const SOLVED = turtle(0.72, 131)

test('nhiệm vụ 7: cuối cách đầu 0,10 m ⇒ 1 sao; 0,05 m ⇒ 2 sao', () => {
  assert.deepEqual([grade(M7, record(M7, { end: at(M7.start, 0.1) })).stars, grade(M7, record(M7, { end: at(M7.start, 0.1) })).done], [1, true])
  assert.equal(grade(M7, record(M7, { end: at(M7.start, 0, 0.05) })).stars, 2)
  assert.equal(grade(M7, record(M7, { end: at(M7.start, 0.03, 0.04), program: SOLVED })).stars, 3, '0,05 m + lặp + khối của em có ô số')
})

test('nhiệm vụ 7: hướng cuối không chấm', () => {
  assert.equal(grade(M7, record(M7, { end: at(M7.start, 0.05, 0, 2), program: SOLVED })).stars, 3)
})

test('nhiệm vụ 7: 0,20 m ⇒ chưa xong, gợi ý nói "20 cm"', () => {
  const r = grade(M7, record(M7, { end: at(M7.start, 0, -0.2) }))
  assert.equal(r.done, false)
  assert.equal(r.stars, 0)
  assert.match(r.hint ?? '', /20 cm/)
  assert.ok(r.goals.some((g) => !g.ok))
})

test('⭐⭐⭐ cần lặp lại VÀ lời gọi khối của em có ít nhất một ô số', () => {
  const close = at(M7.start, 0.05)
  // Khối của em không ô số, có lặp.
  const noArg = prog([repeat(4, [procedureCall('vuông', []) as B])], defs(procedureState('vuông', [], [motor(1, 'forward', 60)])))
  assert.equal(grade(M7, record(M7, { end: close, program: noArg })).stars, 2)
  // Khối của em có ô số, không lặp.
  const noLoop = prog([procedureCall('tiến', [1]) as B], defs(procedureState('tiến', ['mét'], [wait(argumentReporter('mét') as B)])))
  const r = grade(M7, record(M7, { end: close, program: noLoop }))
  assert.equal(r.stars, 2)
  assert.match(r.hint ?? '', /lặp lại/)
  // Lặp + lời gọi có ô số nhưng nằm rời, không nối khối mũ nào ⇒ không tính.
  const loose = { blocks: { languageVersion: 0, blocks: [...(prog([repeat(4, [])]) as { blocks: { blocks: B[] } }).blocks.blocks, { ...(procedureCall('tiến', [1]) as B), x: 600, y: 600 }] } }
  assert.equal(grade(M7, record(M7, { end: close, program: loose })).stars, 2)
})

test('khép vòng mà đứng yên tại chỗ thì không tính (cần đủ quãng và góc)', () => {
  const r = grade(M7, record(M7, { trail: { distance: 0, turned: 0, time: 1 }, program: SOLVED }))
  assert.deepEqual([r.done, r.stars], [false, 0])
})

// ---------- Bộ chấm: các loại điều kiện khác ----------
test('đi thẳng (nhiệm vụ 2): hụt ⇒ gợi ý "hụt {d} cm", quá ⇒ "quá {d} cm"', () => {
  const m = byN(2)
  const r = (dz: number) => grade(m, record(m, { end: { x: m.start.x, z: 0.82 + dz, yaw: 0 }, program: prog([motor(1, 'forward', 60), wait(1)]) }))
  assert.equal(r(0).done, true)
  assert.match(r(0.12).hint ?? '', /hụt 12 cm/)
  assert.match(r(-0.09).hint ?? '', /quá 9 cm/)
})

test('quay (nhiệm vụ 6): quá ⇒ "quay quá", thiếu ⇒ "thiếu"; ⭐⭐ cần sai ≤ 2°', () => {
  const m = byN(6)
  const p = prog([procedureCall('rẽ trái', [90]) as B], defs(procedureState('rẽ trái', ['độ'], [])))
  const r = (d: number) => grade(m, record(m, { end: at(m.start, 0, 0, (d * Math.PI) / 180), program: p }))
  assert.equal(r(90).stars, 2)
  assert.equal(r(93).stars, 1)
  assert.match(r(110).hint ?? '', /quay quá 20°/)
  assert.match(r(70).hint ?? '', /thiếu 20°/)
  // Góc robot báo theo (−180°, 180°]: quay trái 90° có thể đọc thành −270° hay +450° — vẫn là đúng 90°.
  assert.equal(r(91 - 360).stars, 2)
  assert.equal(r(90 + 720).stars, 2)
  // Qua mốc ±180° vẫn tính góc ngắn nhất.
  const back = byN(3)
  assert.equal(grade(back, record(back, { end: at(back.start, 0, 0, Math.PI + 0.02), trail: { distance: 0, turned: 180, time: 1.5 } })).stars, 3)
})

test('cắm cờ (nhiệm vụ 10) chấm bằng sự kiện cắm cờ của trận', () => {
  const m = byN(10)
  assert.equal(grade(m, record(m, { events: [{ t: 9, robot: 0, text: 'Robot 1 cắm cờ Núi B' }] })).done, false)
  const r = grade(m, record(m, { trail: { distance: 2, turned: 90, time: 25 }, events: [{ t: 25, robot: 0, text: 'Robot 1 cắm cờ Núi A' }] }))
  assert.deepEqual([r.done, r.stars], [true, 3])
})

test('đỗ xe (nhiệm vụ 11): một phần ⇒ 1 sao, toàn phần ⇒ 2 sao trở lên', () => {
  const m = byN(11)
  const t = (p: 'full' | 'partial' | null) => ({ ...emptyTally(), parks: { red: [p, null] as ('full' | 'partial' | null)[], blue: [null, null] as ('full' | 'partial' | null)[] } })
  assert.equal(grade(m, record(m, { tally: t(null) })).done, false)
  assert.equal(grade(m, record(m, { tally: t('partial'), trail: { distance: 2, turned: 90, time: 15 } })).stars, 1)
  assert.equal(grade(m, record(m, { tally: t('full'), trail: { distance: 2, turned: 90, time: 15 } })).stars, 3)
})

test('dọn Khu Chữa Cháy (nhiệm vụ 9) và trận đầu (nhiệm vụ 12) đọc tally', () => {
  const m9 = byN(9)
  const dirty = { ...emptyTally(), fire: { o: 3, g: 1 } }
  assert.equal(grade(m9, record(m9, { tally: dirty })).done, false)
  assert.equal(grade(m9, record(m9, { tally: { ...dirty, fire: { o: 3, g: 0 } }, trail: { distance: 3, turned: 0, time: 40 } })).stars, 3)
  const m12 = byN(12)
  const end = [{ t: 180, robot: null, text: 'Hết giờ — điểm trận 400' }]
  const tally = { ...emptyTally(), fire: { o: 80, g: 0 } }
  assert.equal(scoreTally(tally).total, 400)
  assert.equal(grade(m12, record(m12, { tally })).done, false, 'chưa hết giờ')
  const r = grade(m12, record(m12, { tally, events: end }))
  assert.deepEqual([r.done, r.stars], [true, 2])
  assert.match(r.hint ?? '', /400 điểm/)
})

// ---------- Giải được trên sân thật ----------
test('nhiệm vụ 7 có lời giải: «lặp lại 4» + tiến (0.72) + rẽ trái (90) chạy trên sân đạt ≥ 2 sao', async () => {
  const r = await runOnField(M7, SOLVED, 16)
  const g = grade(M7, r)
  console.log(`nhiệm vụ 7 lời giải mẫu: sai số cuối ${(err(r) * 100).toFixed(1)} cm, quãng ${r.trail.distance.toFixed(2)} m, góc ${r.trail.turned.toFixed(0)}°, chạm núi ${r.touchedMountain}, ${g.stars} sao`)
  assert.ok(g.stars >= 2, `${g.stars} sao: ${JSON.stringify(g.goals)}`)
  assert.equal(g.stars, 3)
  assert.equal(r.touchedMountain, false, 'hình vuông quanh Núi A không chạm chân núi')
})

test('nhiệm vụ 8: chương trình có sẵn chạy trên sân cho vệt không khép; sửa số chia góc rẽ thì đạt ≥ 2 sao', async () => {
  const m = byN(8)
  const bad = await runOnField(m, m.starter!, 16)
  const gb = grade(m, bad)
  console.log(`nhiệm vụ 8 chương trình sai: sai số cuối ${(err(bad) * 100).toFixed(1)} cm, ${gb.stars} sao — ${gb.hint}`)
  assert.equal(gb.done, false)
  const good = await runOnField(m, turtle(0.7, 131), 16)
  const gg = grade(m, good)
  console.log(`nhiệm vụ 8 đã sửa: sai số cuối ${(err(good) * 100).toFixed(1)} cm, chạm núi ${good.touchedMountain}, ${gg.stars} sao`)
  assert.ok(gg.stars >= 2, `${gg.stars} sao`)
})
