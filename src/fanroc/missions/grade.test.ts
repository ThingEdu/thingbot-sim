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
import { MISSION_SEED, MISSIONS } from './data.ts'
import { straight, turtle } from './solutions.ts'
import { grade, loopEmpty, restWaits, shouldGrade, touchesMountain, type RunState } from './grade.ts'
import type { Goal, Mission, RunRecord } from './types.ts'
import { TOOLBOX_OPCODES } from '../programs.ts'
import { argumentReporter, procedureCall, procedureState } from '../procedures.ts'
import { holeCentres, mountainAt, type Pose } from '../layout.ts'
import { scoreTally, type FieldTally } from '../scoring.ts'
import type { Climb } from '../ladder.ts'
import { RobotLink } from '../link.ts'
import { FanrocWorld, PHYSICS_DT } from '../world.ts'
import { Match } from '../match.ts'
import { MATCH_S } from '../layout.ts'
import { RobotBody } from '../robot.ts'
import { Trail } from '../trail.ts'
import { GameSession } from '../game.ts'
import { NEUTRAL } from '../ports.ts'
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

// ---------- Bản ghi giả ----------
const CLIMB_ORDER: Climb[] = ['none', 'contact', 'ground', 'water']
const at = (p: Pose, dx: number, dz = 0, dyaw = 0): Pose => ({ x: p.x + dx, z: p.z + dz, yaw: p.yaw + dyaw })
const record = (m: Mission, o: Partial<RunRecord> = {}): RunRecord => ({
  start: m.start, end: m.start, trail: { distance: 3, turned: 360, time: 15 }, touchedMountain: false, events: [], program: null, ...o,
})
const emptyTally = (): FieldTally => ({
  fire: { o: 0, g: 0 }, mtn: [0, 1, 2, 3].map(() => [0, 1, 2].map(() => ({ g: 0, o: 0 }))), flags: [false, false, false, false],
  decorO: 0, climbs: { red: ['none', 'none'], blue: ['none', 'none'] },
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
    if (g.type === 'climb' && CLIMB_ORDER.indexOf(g.min) > CLIMB_ORDER.indexOf(tally.climbs.red[0])) tally.climbs.red[0] = g.min
    if (g.type === 'score') tally.fire.o = Math.max(tally.fire.o, Math.ceil(g.min / 5))
    if (g.type === 'matchEnd') events.push({ t: 180, robot: null, text: 'Hết giờ — điểm trận 0' })
  }
  if (trail.time === 1e9) trail.time = 5
  for (let k = 0; k < paramCalls; k++) begin.push(procedureCall('tiến', [0.1]) as B)
  const program = prog(begin, paramCalls ? defs(procedureState('tiến', ['mét'], [])) : [])
  return { start: m.start, end, trail, touchedMountain: false, events, tally, program }
}

// ---------- Chạy trên sân ----------
/**
 * Chạy chương trình của nhiệm vụ trên sân như vòng lặp trận (bo ảo một nhịp, vật lý một bước) và dừng đúng thời điểm
 * chấm do `shouldGrade` quyết (R57/R59), không bấm Chấm. `trail.time` = Trail.lastMoveTime.
 */
async function runOnField(m: Mission, state: object): Promise<RunRecord & { gradedAt: number; why: 'rest' | 'maxTime' }> {
  const g = H.generate(state)
  assert.equal(g.error, undefined, `sinh mã lỗi: ${g.error}`)
  const world = await FanrocWorld.create(1, { balls: false })
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
    let why: 'rest' | 'maxTime' = 'maxTime'
    for (let k = 1; ; k++) {
      if (session) link.receive({ type: 'snapshot', run, snapshot: (session as SessionLike).tick(PHYSICS_DT * 1000), bus: {} } as unknown as Message)
      const ports = link.ports()
      robot.apply(ports, PHYSICS_DT)
      world.step(PHYSICS_DT)
      trail.add(k * PHYSICS_DT, robot.pose, ports)
      if (touchesMountain(robot.footprint())) touched = true
      const reason = shouldGrade(m, { elapsed: trail.time, hasMoved: trail.hasMoved, lastMoveTime: trail.lastMoveTime, pressed: false }, () => {
        throw new Error('nhiệm vụ lập trình không cần bản ghi để quyết lúc chấm')
      })
      if (reason) {
        why = reason === 'rest' ? 'rest' : 'maxTime'
        break
      }
    }
    assert.notEqual(link.state, 'error', `chương trình lỗi: ${link.error}`)
    return {
      start: m.start, end: robot.pose, trail: { distance: trail.distance, turned: trail.turned, time: trail.lastMoveTime },
      touchedMountain: touched, events: [], program: state, gradedAt: trail.time, why,
    }
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

test('leo Thang Cứu Hỏa (nhiệm vụ 11, luật V4): chạm ⇒ 1 sao, treo Đất ⇒ 2, treo Nước ⇒ 3; robot em là climbs.red[0]', () => {
  const m = byN(11)
  const t = (c: Climb, other: Climb = 'none') => ({ ...emptyTally(), climbs: { red: [c, other], blue: ['water', 'water'] as Climb[] } })
  assert.equal(grade(m, record(m, { tally: t('none', 'water') })).done, false, 'chỉ robot em (Robot 1) được tính')
  assert.deepEqual([grade(m, record(m, { tally: t('contact') })).done, grade(m, record(m, { tally: t('contact') })).stars], [true, 1])
  assert.equal(grade(m, record(m, { tally: t('ground') })).stars, 2)
  assert.equal(grade(m, record(m, { tally: t('water') })).stars, 3)
  assert.deepEqual(grade(m, record(m, { tally: t('water') })).goals.map((g) => g.text), ['Chạm Thang Cứu Hỏa', '⭐⭐ Treo ở Khu vực Đất', '⭐⭐⭐ Treo ở Khu vực Nước'])
})

test('dọn Khu Chữa Cháy (nhiệm vụ 9) và trận đầu (nhiệm vụ 12) đọc tally', () => {
  const m9 = byN(9)
  const dirty = { ...emptyTally(), fire: { o: 3, g: 29 } }
  assert.equal(grade(m9, record(m9, { tally: dirty })).done, false)
  assert.equal(grade(m9, record(m9, { tally: { ...dirty, fire: { o: 3, g: 28 } }, trail: { distance: 3, turned: 0, time: 40 } })).stars, 3)
  const m12 = byN(12)
  const end = [{ t: 180, robot: null, text: 'Hết giờ — điểm trận 200' }]
  const tally = { ...emptyTally(), fire: { o: 40, g: 0 } } // 200: giữa ⭐⭐ 180 và ⭐⭐⭐ 230 (R141)
  assert.equal(scoreTally(tally).total, 200)
  assert.equal(grade(m12, record(m12, { tally })).done, false, 'chưa hết giờ')
  const r = grade(m12, record(m12, { tally, events: end }))
  assert.deepEqual([r.done, r.stars], [true, 2])
  assert.match(r.hint ?? '', /200 điểm/)
})

// ---------- Giải được trên sân thật ----------
test('nhiệm vụ 7 có lời giải: «lặp lại 4» + tiến (0.72) + rẽ trái (90) chạy trên sân đạt ≥ 2 sao', async (t) => {
  const r = await runOnField(M7, SOLVED)
  const g = grade(M7, r)
  t.diagnostic(`sai số cuối ${(err(r) * 100).toFixed(1)} cm, quãng ${r.trail.distance.toFixed(2)} m, góc ${r.trail.turned.toFixed(0)}°, dừng lúc ${r.trail.time.toFixed(2)} s, chấm lúc ${r.gradedAt.toFixed(2)} s (${r.why}), ${g.stars} sao`)
  assert.equal(r.why, 'rest', 'chương trình xong thì robot đứng yên và được chấm trước maxTime')
  // Các chặng dừng 0,3 s giữa cạnh và góc không bị coi là "đứng yên" (cần ≥ 1 s).
  assert.ok(r.trail.distance > 2.8, `chấm sớm giữa chừng: quãng ${r.trail.distance}`)
  assert.ok(g.stars >= 2, `${g.stars} sao: ${JSON.stringify(g.goals)}`)
  assert.equal(g.stars, 3)
  assert.equal(r.touchedMountain, false, 'hình vuông quanh Núi A không chạm chân núi')
})

test('nhiệm vụ 8: chương trình có sẵn chạy trên sân cho vệt không khép; sửa số chia góc rẽ thì đạt ≥ 2 sao', async (t) => {
  const m = byN(8)
  const bad = await runOnField(m, m.starter!)
  const gb = grade(m, bad)
  t.diagnostic(`chương trình sai: sai số cuối ${(err(bad) * 100).toFixed(1)} cm, ${gb.stars} sao — ${gb.hint}`)
  assert.equal(gb.done, false)
  const good = await runOnField(m, turtle(0.7, 131))
  const gg = grade(m, good)
  t.diagnostic(`đã sửa: sai số cuối ${(err(good) * 100).toFixed(1)} cm, chạm núi ${good.touchedMountain}, chấm lúc ${good.gradedAt.toFixed(2)} s (${good.why}), ${gg.stars} sao`)
  assert.ok(gg.stars >= 2, `${gg.stars} sao`)
})

// ---------- Hợp đồng với match.ts và thời điểm chấm (R57) ----------
test('hợp đồng sự kiện: Match thật ghi cờ và hết giờ, grade() nhận ra; cờ của robot khác không tính', async () => {
  const w = await FanrocWorld.create(1)
  try {
    const robots = [new RobotBody(w, byN(10).robot, 'red', 0), new RobotBody(w, byN(10).robot, 'blue', 0)]
    const m = new Match(w, robots, ['Em', 'Bạn'], { seed: 1 })
    m.t = 5
    m.step(PHYSICS_DT, [])
    robots[1].onFlag!(0) // Robot 2 cắm Núi A — không phải robot của em
    const m10 = byN(10)
    const quick = { distance: 1, turned: 90, time: 20 }
    assert.equal(grade(m10, record(m10, { trail: quick, events: [...m.events] })).done, false, 'cờ của Robot 2 không tính cho em')
    robots[0].onFlag!(0) // đúng đường robot.ts gọi khi cắm được cờ
    assert.deepEqual([grade(m10, record(m10, { trail: quick, events: [...m.events] })).done, m.flags[0]], [true, true])
    const m12 = byN(12)
    assert.equal(grade(m12, record(m12, { events: [...m.events], tally: m.tally() })).done, false, 'trận chưa hết giờ')
    m.t = MATCH_S - PHYSICS_DT / 2
    m.step(PHYSICS_DT, [])
    assert.equal(m.phase, 'end')
    const r = grade(m12, record(m12, { events: [...m.events], tally: m.tally() }))
    assert.equal(r.done, true, `không nhận ra sự kiện hết giờ: ${JSON.stringify(m.events.map((e) => e.text))}`)
  } finally {
    w.rapier.free()
  }
})

test('R57: mọi nhiệm vụ có maxTime; điều kiện ⭐ thời gian nhỏ hơn maxTime; nhiệm vụ trận dùng đồng hồ trận', () => {
  for (const m of MISSIONS) {
    assert.ok(m.maxTime > 0, `nhiệm vụ ${m.n}`)
    for (const g of [...m.goals, ...m.stars.two, ...m.stars.three]) if (g.type === 'time') assert.ok(g.max < m.maxTime, `nhiệm vụ ${m.n}: time ${g.max} ≥ maxTime ${m.maxTime}`)
  }
  assert.ok(byN(12).maxTime >= MATCH_S + 10)
})

test('vùng đích ⭐⭐ / ⭐⭐⭐ nằm trong vùng đích ⭐ (đạt sao cao thì chắc chắn đã đạt sao thấp)', () => {
  for (const m of MISSIONS) {
    const base = m.goals.flatMap((g) => (g.type === 'reach' ? [g.rect] : []))
    for (const g of [...m.stars.two, ...m.stars.three]) {
      if (g.type !== 'reach') continue
      const r = g.rect
      assert.ok(base.some((b) => r.x0 >= b.x0 && r.x1 <= b.x1 && r.z0 >= b.z0 && r.z1 <= b.z1), `nhiệm vụ ${m.n}: ${JSON.stringify(r)} ra ngoài ${JSON.stringify(base)}`)
    }
  }
})

test('shouldGrade (R57/R59): bấm Chấm và hết giờ cho mọi loại; đứng yên chấm ngay nhiệm vụ lập trình', () => {
  const st = (o: Partial<RunState>): RunState => ({ elapsed: 5, hasMoved: true, lastMoveTime: 3, pressed: false, ...o })
  const never = () => {
    throw new Error('không được dựng bản ghi')
  }
  const p = byN(7)
  assert.equal(shouldGrade(p, st({}), never), 'rest')
  assert.equal(shouldGrade(p, st({ lastMoveTime: 4.5 }), never), null, 'mới đứng yên 0,5 s')
  assert.equal(shouldGrade(p, st({ hasMoved: false, lastMoveTime: 0 }), never), null, 'chưa chạy lần nào thì không tính đứng yên')
  assert.equal(shouldGrade(p, st({ lastMoveTime: 4.5, pressed: true }), never), 'pressed')
  assert.equal(shouldGrade(p, st({ elapsed: p.maxTime, lastMoveTime: p.maxTime }), never), 'maxTime')
  const match = byN(12)
  assert.equal(shouldGrade(match, st({ elapsed: 100, lastMoveTime: 10 }), never), null, 'trận không dừng vì đứng yên')
  assert.equal(shouldGrade(match, st({ elapsed: match.maxTime }), never), 'maxTime')
  assert.equal(shouldGrade(match, st({ pressed: true }), never), 'pressed')
})

test('shouldGrade (R59): nhiệm vụ lái bàn phím đứng yên chỉ chấm khi đã đạt mọi điều kiện ⭐', () => {
  const st = (o: Partial<RunState>): RunState => ({ elapsed: 20, hasMoved: true, lastMoveTime: 10, pressed: false, ...o })
  const m1 = byN(1)
  assert.equal(m1.kind, 'drive')
  const half = () => record(m1, { trail: { distance: 0.5, turned: 90, time: 10 } }) // mới lái nửa chừng rồi dừng nghĩ
  assert.equal(shouldGrade(m1, st({}), half), null)
  assert.equal(shouldGrade(m1, st({ lastMoveTime: 19.5 }), () => record(m1)), null, 'đạt rồi nhưng mới đứng 0,5 s')
  assert.equal(shouldGrade(m1, st({}), () => record(m1)), 'rest', 'đạt mọi điều kiện ⭐ và đứng yên ⇒ chấm')
  assert.equal(shouldGrade(m1, st({ pressed: true }), half), 'pressed')
  assert.equal(shouldGrade(m1, st({ elapsed: m1.maxTime }), half), 'maxTime')
  for (const n of [1, 9, 10]) assert.equal(byN(n).kind, 'drive')
})

// ---------- Chạm núi (dùng chung với màn nhiệm vụ) ----------
test('touchesMountain: góc hay điểm giữa cạnh thân xe trong hình bao chân núi ⇒ chạm', () => {
  const box = (cx: number, cz: number, h = 0.12) => [
    { x: cx - h, z: cz - h }, { x: cx + h, z: cz - h }, { x: cx + h, z: cz + h }, { x: cx - h, z: cz + h },
  ]
  assert.equal(touchesMountain(box(-0.9, 0.95)), false, 'góc sân, xa núi')
  const a = holeCentres()[0]
  assert.equal(touchesMountain(box(a.x, a.z)), true, 'đứng trên Núi A')
  // Chỉ điểm giữa cạnh trên lọt vào chân núi (hai góc ở hai bên ngoài): thân xe 1 m rộng trùm qua mép dưới Núi A.
  const foot = 0.3727 + 0.2045 // mép gần Khu Điều Khiển của Núi A (xấp xỉ, núi xoay −10,8°)
  const wide = [{ x: -0.376 - 0.5, z: foot - 0.03 }, { x: -0.376 + 0.5, z: foot - 0.03 }, { x: -0.376 + 0.5, z: foot + 0.3 }, { x: -0.376 - 0.5, z: foot + 0.3 }]
  assert.ok(wide.every((p) => mountainAt(p.x, p.z) < 0), 'bốn góc đều ngoài núi')
  assert.equal(touchesMountain(wide), true, 'điểm giữa cạnh trong chân núi')
})

// ---------- R95: robot đang đợi có chủ đích ----------
const loopProg = (loop: B[]) => ({
  blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 0, y: 0 }, { type: 'event_whenarduinoloop', x: 0, y: 300, ...(loop.length ? { next: { block: chain(loop) } } : {}) }] },
})

test('loopEmpty: «lặp mãi» không có khối nào nối bên dưới', () => {
  assert.equal(loopEmpty(loopProg([])), true)
  assert.equal(loopEmpty(loopProg([wait(1)])), false)
  assert.equal(loopEmpty(SOLVED), true)
  assert.equal(loopEmpty(null), true)
  assert.equal(loopEmpty({ blocks: { blocks: [{ type: 'event_whenarduinobegin' }] } }), true, 'không có khối lặp')
})

test('restWaits (R95): khối sắp chạy là «đợi» khi chương trình còn chạy ⇒ đang đợi có chủ đích', () => {
  assert.equal(restWaits('control_wait', 'setup', true), true)
  assert.equal(restWaits('control_wait', 'loop', false), true, 'đợi trong vòng lặp')
  // Khởi động đã xong, vòng lặp rỗng: bo ảo giữ mãi khối cuối đã chạy (có thể là «đợi») — không phải đang đợi.
  assert.equal(restWaits('control_wait', 'loop', true), false)
  assert.equal(restWaits('thingBotC3_setMotor', 'setup', true), false)
  assert.equal(restWaits(null, 'setup', true), false)
  assert.equal(restWaits('control_wait', 'halted', false), false, 'bo ảo dừng vì lỗi')
  assert.equal(restWaits('control_wait', undefined, true), false, 'chưa có ảnh chụp nào')
})

test('shouldGrade (R95): nhiệm vụ lập trình đang ở khối «đợi» thì không chấm vì đứng yên; bấm Chấm / hết giờ vẫn chấm', () => {
  const st = (o: Partial<RunState>): RunState => ({ elapsed: 5, hasMoved: true, lastMoveTime: 3, pressed: false, ...o })
  const never = () => {
    throw new Error('không được dựng bản ghi')
  }
  const p = byN(4)
  assert.equal(shouldGrade(p, st({ waiting: true }), never), null)
  assert.equal(shouldGrade(p, st({ waiting: false }), never), 'rest')
  assert.equal(shouldGrade(p, st({ waiting: true, pressed: true }), never), 'pressed')
  assert.equal(shouldGrade(p, st({ waiting: true, elapsed: p.maxTime }), never), 'maxTime')
  // Nhiệm vụ lái: `waiting` không đổi luật R59.
  const m1 = byN(1)
  assert.equal(shouldGrade(m1, { elapsed: 20, hasMoved: true, lastMoveTime: 10, pressed: false, waiting: true }, () => record(m1)), 'rest')
})


test('nhiệm vụ 2 có lời giải: M1 = M2 = 60, đợi 0,9 s, dừng ⇒ ≥ 2 sao, chấm khi robot đứng yên trước 5 s', async (t) => {
  const m = byN(2)
  const r = await runOnField(m, straight(0.9))
  const g = grade(m, r)
  t.diagnostic(`cuối z = ${r.end.z.toFixed(3)}, ${g.stars} sao, chấm lúc ${r.gradedAt.toFixed(2)} s (${r.why})`)
  assert.equal(r.why, 'rest')
  assert.ok(r.gradedAt < 5, `chấm lúc ${r.gradedAt}`)
  assert.ok(g.stars >= 2, `${g.stars} sao: ${JSON.stringify(g.goals)}`)
})

test('nhiệm vụ 9 (R96): sân MISSION_SEED có 38 bóng xanh trong Khu Chữa Cháy; một lượt quét dọc rào đạt ⭐ (≤ 28)', async (t) => {
  const m = byN(9)
  const g = await GameSession.create({ mode: 'mission', seed: MISSION_SEED, seats: [{ cfg: m.robot, team: 'Em', driver: { kind: 'program', link: new RobotLink(() => {}) } }], balls: true, start: m.start })
  try {
    const before = g.match.tally().fire.g
    const max = (m.goals.find((x) => x.type === 'fireClear') as { max: number }).max
    assert.ok(before >= max + 8, `lúc đầu chỉ ${before} bóng xanh — ⭐ quá dễ`)
    // Mỗi làn: đặt robot sát rào trong khu, chạy thẳng hết tốc 0,75 m ra phía giữa sân (ba làn dọc, ba làn ngang mỗi khu).
    const D = Math.PI / 180
    const zone0 = [
      ...[-1.07, -0.9, -0.74].map((z) => ({ x: -1.08, z, yaw: -90 * D })),
      ...[-1.07, -0.9, -0.74].map((x) => ({ x, z: -1.08, yaw: 180 * D })),
    ]
    const r = g.robots[0]
    let s = 0
    for (const lane of [...zone0, ...zone0.map((l) => ({ x: -l.x, z: l.z, yaw: -l.yaw }))]) {
      r.setPose(lane)
      while (Math.hypot(r.pose.x - lane.x, r.pose.z - lane.z) < 0.75 && s < 60) (g.match.step(PHYSICS_DT, [{ ...NEUTRAL, M1: 100, M2: 100 }]), (s += PHYSICS_DT))
      for (let k = 0; k < 0.3 / PHYSICS_DT; k++) (g.match.step(PHYSICS_DT, [NEUTRAL]), (s += PHYSICS_DT))
    }
    const after = g.match.tally().fire.g
    t.diagnostic(`${before} → ${after} bóng xanh sau ${s.toFixed(1)} s lái`)
    assert.ok(after <= max, `một lượt còn ${after} bóng xanh (⭐ cần ≤ ${max})`)
  } finally {
    g.dispose()
  }
})

test('chương trình dừng vì lỗi (chia cho 0) ⇒ không đạt, 0 sao, gợi ý là câu lỗi — dù robot đã tới đích', () => {
  for (const m of MISSIONS.filter((x) => x.kind === 'program')) {
    assert.equal(grade(m, ideal(m)).stars, 3, m.id)
    const err = 'Chương trình dừng vì lỗi: chia một số nguyên cho 0'
    const r = grade(m, { ...ideal(m), error: err })
    assert.equal(r.done, false, m.id)
    assert.equal(r.stars, 0, m.id)
    assert.ok(r.hint?.startsWith(err) && /chạy lại/.test(r.hint), `${m.id}: ${r.hint}`)
  }
})
