// Khối của em (procedures) có tham số số: chạy trên bo ảo bằng đúng bộ sinh mã của trang (đã ghi đè phần procedures,
// R37), xuất .tb giữ nguyên định nghĩa + prototype + lời gọi (R38), hộp thoại tạo khối tiếng Việt.
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  argumentReporter, draftFromMutation, draftMutation, draftProblem, hasParamProcedures, MY_BLOCKS_CATEGORY, openMakeBlockDialog,
  procedureCall, procedureState, TB_PARAM_WARNING,
} from './procedures.ts'
import { TOOLBOX, TOOLBOX_OPCODES } from './programs.ts'
import { decodePorts } from './ports.ts'
import { toProject } from './tb.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(ROOT, '../thingblock-editor-sim'))
const pkg = (p: string) => join(THINGBLOCK, 'packages', p)
const { JSDOM } = createRequire(join(THINGBLOCK, 'node_modules/blockly/package.json'))('jsdom')

type Snap = { pwm: number[]; error: string | undefined; running: boolean; t: number }
type Headless = {
  useDom(window: object): void
  generate(state: object): { sim: string; arduino: string; error?: string }
  Session: new (code: string, opts?: { now?: () => number }) => { running: boolean; tick(ms: number): Snap }
}
let H: Headless

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fanroc-procedures-'))
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

// ---------- Chương trình thử ----------
const motor = (m: number, speed: number) => ({
  type: 'thingBotC3_setMotor',
  fields: { MOTOR: String(m), DIRECTION: 'forward' },
  inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: speed } } } },
})
const waitFor = (value: object) => ({ type: 'control_wait', inputs: { DURATION: { shadow: { type: 'math_positive_number', fields: { NUM: 1 } }, block: value } } })
/** tiến (giây) — nhiệm vụ 5 (R161): M1 = M2 = 60, đợi (giây), rồi dừng. */
const TIEN = procedureState('tiến', ['giây'], [motor(1, 60), motor(2, 60), waitFor(argumentReporter('giây')), motor(1, 0), motor(2, 0)])
/** Chương trình: khi Arduino khởi động → tiến (m) với m giây. */
const program = (m: number) => {
  const def = (TIEN as { blocks: { blocks: object[] } }).blocks.blocks
  return { blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: procedureCall('tiến', [m]) } }, ...def] } }
}
const state = program(1)

/** Chạy chương trình trên bo ảo, trả M1/M2 ở các mốc thời gian (ms). */
function run(st: object, at: number[]): { M1: number; M2: number }[] {
  const { sim, error } = H.generate(st)
  assert.equal(error, undefined)
  const s = new H.Session(sim, { now: () => 0 })
  s.running = true
  let t = 0
  return at.map((ms) => {
    const snap = s.tick(ms - t)
    t = ms
    assert.equal(snap.error, undefined)
    const p = decodePorts(snap.pwm)
    return { M1: p.M1, M2: p.M2 }
  })
}

// ---------- Bo ảo ----------
test('khối của em có tham số số chạy trên bo ảo: tiến(1) đặt M1 = M2 = 60 rồi đợi 1 s', () => {
  const [half, after] = run(state, [500, 1200])
  assert.deepEqual(half, { M1: 60, M2: 60 }, '0,5 s: động cơ đang chạy')
  assert.deepEqual(after, { M1: 0, M2: 0 }, '1,2 s: đã đợi xong 1 s và dừng')
})

test('đối số thật sự đổi thời gian đợi: tiến(0.6) dừng ở ~0,6 s, tiến(1) vẫn chạy ở 0,8 s', () => {
  const [a1, b1] = run(program(0.6), [500, 800])
  assert.deepEqual(a1, { M1: 60, M2: 60 })
  assert.deepEqual(b1, { M1: 0, M2: 0 }, 'tiến(0.6) phải dừng trước 0,8 s')
  const [, b2] = run(program(1), [500, 800])
  assert.deepEqual(b2, { M1: 60, M2: 60 }, 'tiến(1) còn chạy ở 0,8 s')
})

test('hai tham số: mỗi đối số vào đúng tham số của nó', () => {
  const def = procedureState('chạy', ['tốc độ', 'giây'], [
    { ...motor(1, 0), inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 0 } }, block: argumentReporter('tốc độ') } } },
    waitFor(argumentReporter('giây')),
    motor(1, 0),
  ]) as { blocks: { blocks: object[] } }
  const st = { blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: procedureCall('chạy', [35, 0.3]) } }, ...def.blocks.blocks] } }
  const [a, b] = run(st, [200, 400])
  assert.equal(Math.round(a.M1), 35, 'tham số "tốc độ" = 35 (PWM làm tròn xuống 1433/4095)')
  assert.equal(b.M1, 0)
})

test('khối của em không tham số vẫn chạy như trước', () => {
  const def = procedureState('bật', [], [motor(1, 60), motor(2, 60)]) as { blocks: { blocks: object[] } }
  const st = { blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: procedureCall('bật', []) } }, ...def.blocks.blocks] } }
  const { sim } = H.generate(st)
  assert.match(sim, /yield\* \w+\(\);/)
  assert.deepEqual(run(st, [300])[0], { M1: 60, M2: 60 })
})

test('ô tham số kéo ra ngoài khối định nghĩa báo lỗi tiếng Việt, không chạy', () => {
  const st = { blocks: { languageVersion: 0, blocks: [
    { type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: waitFor(argumentReporter('giây')) } },
    ...(TIEN as { blocks: { blocks: object[] } }).blocks.blocks,
  ] } }
  const { error } = H.generate(st)
  assert.match(error ?? '', /giây.*bên trong khối/)
})

// ---------- .tb ----------
test('khối của em xuất .tb và mở lại giữ nguyên định nghĩa + lời gọi', () => {
  const p = toProject(state)
  const blocks = Object.values(p.targets[1].blocks as Record<string, { opcode: string }>).map((b) => b.opcode)
  for (const op of ['procedures_definition', 'procedures_prototype', 'procedures_call']) assert.ok(blocks.includes(op), op)
})

type Sb3 = { opcode: string; parent: string | null; inputs: Record<string, unknown[]>; fields: Record<string, unknown[]>; shadow: boolean; mutation?: Record<string, unknown> }
const sb3 = (st: object) => Object.entries(toProject(st).targets[1].blocks as Record<string, Sb3>)
const ofType = (st: object, op: string) => sb3(st).filter(([, b]) => b.opcode === op)

test('.tb: khối 1 tham số có đúng mutation, một prototype mỗi định nghĩa, ô tham số và đối số', () => {
  const all = Object.fromEntries(sb3(state))
  const defs = ofType(state, 'procedures_definition')
  const protos = ofType(state, 'procedures_prototype')
  assert.equal(defs.length, 1)
  assert.equal(protos.length, 1, 'đúng một prototype')
  const [defId, def] = defs[0]
  const [protoId, proto] = protos[0]
  assert.deepEqual(def.inputs.custom_block, [1, protoId])
  assert.equal(proto.parent, defId)
  assert.equal(proto.shadow, true)
  assert.equal(proto.mutation?.proccode, 'tiến %n')
  const ids = JSON.parse(String(proto.mutation?.argumentids)) as string[]
  assert.equal(ids.length, 1)
  assert.deepEqual(JSON.parse(String(proto.mutation?.argumentnames)), ['giây'])
  assert.deepEqual(JSON.parse(String(proto.mutation?.argumentdefaults)), [''])
  assert.equal(proto.mutation?.warp, 'false')
  // Ô tham số trên prototype là bóng argument_reporter_string_number tên "giây".
  const reporterRef = proto.inputs[ids[0]]
  assert.equal(reporterRef[0], 1)
  const reporter = all[reporterRef[1] as string]
  assert.equal(reporter.opcode, 'argument_reporter_string_number')
  assert.equal(reporter.shadow, true)
  assert.deepEqual(reporter.fields.VALUE, ['giây', null])
  // Lời gọi: cùng proccode và argumentids, đối số 1 ở ô có id đó.
  const [, call] = ofType(state, 'procedures_call')[0]
  assert.equal(call.mutation?.proccode, 'tiến %n')
  assert.deepEqual(JSON.parse(String(call.mutation?.argumentids)), ids)
  assert.deepEqual(call.inputs[ids[0]], [1, [4, '1']])
  // Ô "giây" trong thân (không phải bóng) vẫn tên "giây".
  const used = ofType(state, 'argument_reporter_string_number').filter(([, b]) => !b.shadow)
  assert.equal(used.length, 1)
  assert.deepEqual(used[0][1].fields.VALUE, ['giây', null])
})

test('.tb: khối 0 tham số có đúng mutation', () => {
  const def = procedureState('bật', [], [motor(1, 60)]) as { blocks: { blocks: object[] } }
  const st = { blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', next: { block: procedureCall('bật', []) } }, ...def.blocks.blocks] } }
  const protos = ofType(st, 'procedures_prototype')
  assert.equal(protos.length, 1)
  assert.deepEqual(protos[0][1].mutation, { tagName: 'mutation', children: [], proccode: 'bật', argumentids: '[]', argumentnames: '[]', argumentdefaults: '[]', warp: 'false' })
  assert.deepEqual(protos[0][1].inputs, {})
  const [, call] = ofType(st, 'procedures_call')[0]
  assert.deepEqual(call.mutation, { tagName: 'mutation', children: [], proccode: 'bật', argumentids: '[]', warp: 'false' })
})

test('.tb: mutation dạng scratch-blocks lưu trên trang (chuỗi XML có xmlns, &quot;) đọc đúng', () => {
  const m = '<mutation xmlns="http://www.w3.org/1999/xhtml" proccode="đi &amp; về %n" argumentids="[&quot;k1&quot;]" warp="false"></mutation>'
  const st = { blocks: { blocks: [{ type: 'event_whenarduinobegin', next: { block: { type: 'procedures_call', extraState: m, inputs: { k1: { shadow: { type: 'math_number', fields: { NUM: '2' } } } } } } }] } }
  const [, call] = ofType(st, 'procedures_call')[0]
  assert.equal(call.mutation?.proccode, 'đi & về %n')
  assert.equal(call.mutation?.argumentids, '["k1"]')
  assert.deepEqual(call.inputs.k1, [1, [4, '2']])
})

test('hasParamProcedures: có khối của em có tham số mới báo', () => {
  assert.equal(hasParamProcedures(state), true)
  assert.match(TB_PARAM_WARNING, /chưa nạp được lên ThingBot thật/)
  const def = procedureState('bật', [], [motor(1, 60)]) as { blocks: { blocks: object[] } }
  assert.equal(hasParamProcedures({ blocks: { blocks: [{ type: 'event_whenarduinobegin', next: { block: procedureCall('bật', []) } }, ...def.blocks.blocks] } }), false)
  assert.equal(hasParamProcedures({ blocks: { blocks: [{ type: 'event_whenarduinobegin', next: { block: motor(1, 60) } }] } }), false)
  assert.equal(hasParamProcedures({}), false)
  // Chỉ một lời gọi có tham số lồng sâu trong khối lặp (định nghĩa đã bị xoá) cũng tính.
  assert.equal(hasParamProcedures({ blocks: { blocks: [{ type: 'control_forever', inputs: { SUBSTACK: { block: procedureCall('tiến', [1]) } } }] } }), true)
})

// ---------- Hộp công cụ ----------
test('TOOLBOX có chuyên mục Khối của em', () => {
  assert.ok(TOOLBOX.contents.some((c: { custom?: string; name?: string }) => c.custom === 'PROCEDURE' && c.name === 'Khối của em'))
  assert.deepEqual(MY_BLOCKS_CATEGORY, { kind: 'category', name: 'Khối của em', colour: '#FF6680', secondaryColour: '#FF4D6A', custom: 'PROCEDURE' })
  assert.equal(TOOLBOX.contents.at(-1), MY_BLOCKS_CATEGORY, 'nằm cuối hộp công cụ')
  for (const op of ['procedures_definition', 'procedures_prototype', 'procedures_call', 'argument_reporter_string_number']) assert.ok(TOOLBOX_OPCODES.has(op), op)
})

// ---------- Bản nháp ↔ mutation, hộp thoại ----------
test('bản nháp ↔ mutation: proccode "tên %n %n", giữ id tham số cũ khi sửa', () => {
  const m = draftMutation({ name: '  rẽ  ', params: ['độ', 'tốc độ'], ids: ['x1', 'x2'] })
  assert.deepEqual(m, { proccode: 'rẽ %n %n', argumentids: '["x1","x2"]', argumentnames: '["độ","tốc độ"]', argumentdefaults: '["",""]', warp: 'false' })
  assert.deepEqual(draftFromMutation(m), { name: 'rẽ', params: ['độ', 'tốc độ'], ids: ['x1', 'x2'] })
  const fresh = draftMutation({ name: 'tiến', params: ['giây'] })
  assert.equal(JSON.parse(fresh.argumentids).length, 1)
  assert.equal(draftFromMutation({ proccode: 'Khối của em', argumentids: '[]', argumentnames: '[]' }).name, 'Khối của em')
})

test('kiểm bản nháp: tên trống, tham số trống, tham số trùng', () => {
  assert.equal(draftProblem({ name: 'tiến', params: ['giây'] }), null)
  assert.match(draftProblem({ name: '  ', params: [] }) ?? '', /tên/i)
  assert.match(draftProblem({ name: 'tiến', params: [' '] }) ?? '', /ô số/i)
  assert.match(draftProblem({ name: 'tiến', params: ['a', 'a'] }) ?? '', /trùng/i)
  assert.match(draftProblem({ name: 'tiến 50%', params: [] }) ?? '', /%/)
})

/** Hộp thoại phải trả lời ngay (không treo phép thử khi một nút / phím không đóng được hộp thoại). */
const within = <T>(p: Promise<T>, what: string): Promise<T> =>
  Promise.race([p, new Promise<never>((_, fail) => setTimeout(() => fail(new Error(`hộp thoại không đóng sau ${what}`)), 200))])

test('hộp thoại tạo khối: nhập tên, thêm ô số, Tạo khối / Huỷ / Esc', async () => {
  const dom = new JSDOM('<body></body>')
  const g = globalThis as unknown as Record<string, unknown>
  const saved = { document: g.document, KeyboardEvent: g.KeyboardEvent }
  g.document = dom.window.document
  g.KeyboardEvent = dom.window.KeyboardEvent
  try {
    const host = dom.window.document.body
    const open = openMakeBlockDialog(host)
    const q = (sel: string) => host.querySelector(sel) as HTMLElement
    const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement

    // Tạo khối "tiến" có một ô số "giây".
    let result = open({ name: 'Khối của em', params: [] })
    const name = q('input[name="ten-khoi"]') as HTMLInputElement
    assert.ok(name, 'có ô Tên khối')
    name.value = 'tiến'
    name.dispatchEvent(new dom.window.Event('input'))
    button('Thêm ô số').click()
    const param = host.querySelector('input[name="tham-so"]') as HTMLInputElement
    param.value = 'giây'
    param.dispatchEvent(new dom.window.Event('input'))
    button('Tạo khối').click()
    const made = await within(result, 'Tạo khối')
    assert.equal(made?.name, 'tiến')
    assert.deepEqual(made?.params, ['giây'])
    assert.equal(host.querySelector('[role="dialog"]'), null, 'hộp thoại đóng')

    // Tên trống: không tạo, báo lỗi, hộp thoại còn mở.
    result = open({ name: '', params: [] })
    button('Tạo khối').click()
    assert.ok(host.querySelector('[role="dialog"]'))
    assert.match(q('[role="alert"]').textContent ?? '', /tên/i)
    button('Huỷ').click()
    assert.equal(await within(result, 'Huỷ'), null)

    // Đổi tên / xoá tham số; Esc = Huỷ.
    result = open({ name: 'rẽ', params: ['độ', 'x'], ids: ['a', 'b'] })
    const params = () => [...host.querySelectorAll('input[name="tham-so"]')] as HTMLInputElement[]
    assert.deepEqual(params().map((p) => p.value), ['độ', 'x'])
    ;(host.querySelectorAll('button[aria-label^="Xoá ô số"]')[1] as HTMLButtonElement).click()
    assert.deepEqual(params().map((p) => p.value), ['độ'])
    q('[role="dialog"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert.equal(await within(result, 'Esc'), null)

    result = open({ name: 'rẽ', params: ['độ', 'x'], ids: ['a', 'b'] })
    ;(host.querySelectorAll('button[aria-label^="Xoá ô số"]')[0] as HTMLButtonElement).click()
    button('Tạo khối').click()
    assert.deepEqual(await within(result, 'Tạo khối'), { name: 'rẽ', params: ['x'], ids: ['b'] }, 'xoá ô đầu giữ id của ô còn lại')
  } finally {
    Object.assign(g, saved)
  }
})
