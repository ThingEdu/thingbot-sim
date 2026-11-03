// Xuất .tb: project.json giống cấu trúc ThingBlock (sim-09), đủ khối so với vùng khối thật, đủ cho cả 4 robot.
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import JSZip from 'jszip'
import { SAMPLES } from './programs.ts'
import { ROBOTS, type RobotType } from './robots.ts'
import { tbFileName, toProject, toTb, type ProjectJson } from './tb.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(ROOT, '../thingblock-editor-sim'))
const EXAMPLES = resolve(ROOT, '../thingblock-editor-examples/packages/thingblock-resource/src/examples/thingbot/sim-09-tay-cam-ps2.tb')
const pkg = (p: string) => join(THINGBLOCK, 'packages', p)

type Headless = { useDom(window: object): void; blockTypes(state: object): string[] }
let H: Headless

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fanroc-tb-'))
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
  const { JSDOM } = createRequire(join(THINGBLOCK, 'node_modules/blockly/package.json'))('jsdom')
  H.useDom(new JSDOM().window)
})

const TYPES = Object.keys(ROBOTS) as RobotType[]
const unzip = async (blob: Blob): Promise<{ names: string[]; project: ProjectJson }> => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return { names: Object.keys(zip.files), project: JSON.parse(await zip.file('project.json')!.async('string')) }
}
type PBlock = { opcode: string; topLevel: boolean; parent: string | null; next: string | null; shadow: boolean; x?: number }
const spriteBlocks = (p: ProjectJson) => Object.values((p.targets[1] as { blocks: Record<string, PBlock> }).blocks)

test('TeleOp Maker: một tệp project.json, extensions, board, khối mũ đầu có topLevel', async () => {
  const { names, project } = await unzip(await toTb(SAMPLES.maker.teleop))
  assert.deepEqual(names, ['project.json'])
  assert.ok(project.extensions.includes('thingBotC3'))
  assert.ok(project.extensions.includes('ps2'))
  assert.equal(project.board.device, 'thingbot')
  assert.deepEqual(project.board.peripherals, [])
  assert.equal(project.meta.semver, '3.0.0')
  const first = spriteBlocks(project)[0]
  assert.equal(first.opcode, 'event_whenarduinobegin')
  assert.equal(first.topLevel, true)
  assert.equal(first.x, 30) // giữ vị trí khối mũ như trên vùng khối
})

test('khoá cấp 1 và cấu trúc đích giống sim-09 của ThingBlock', async (t) => {
  if (!existsSync(EXAMPLES)) return t.skip('không có checkout thingblock-editor-examples')
  const ref = JSON.parse(await JSZip.loadAsync(readFileSync(EXAMPLES)).then((z) => z.file('project.json')!.async('string'))) as ProjectJson
  const mine = toProject(SAMPLES.maker.teleop)
  assert.deepEqual(Object.keys(mine), Object.keys(ref))
  assert.deepEqual(mine.targets.map((x) => Object.keys(x)), ref.targets.map((x) => Object.keys(x)))
  assert.deepEqual(mine.targets.map((x) => (x as { name: string }).name), ['Stage', 'Sprite1'])
  assert.deepEqual(Object.keys(mine.meta), Object.keys(ref.meta))
  assert.equal(mine.meta.semver, ref.meta.semver)
  assert.deepEqual(mine.board, ref.board)
  assert.deepEqual(mine.extensions, ref.extensions)
  const keys = (p: ProjectJson) => Object.keys(spriteBlocks(p)[0]).sort()
  assert.deepEqual(keys(mine), keys(ref))
})

for (const type of TYPES)
  for (const kind of ['teleop', 'auto'] as const)
    test(`${type} ${kind}: số khối và opcode khớp vùng khối thật; cha/con nhất quán`, async () => {
      const state = SAMPLES[type][kind]
      const { project } = await unzip(await toTb(state))
      const blocks = (project.targets[1] as { blocks: Record<string, PBlock> }).blocks
      const real = Object.values(blocks).filter((b) => !b.shadow)
      assert.deepEqual(real.map((b) => b.opcode).sort(), H.blockTypes(state))
      assert.equal(real.filter((b) => b.topLevel).length, (state as { blocks: { blocks: unknown[] } }).blocks.blocks.length)
      for (const b of real) {
        if (b.parent !== null) assert.ok(blocks[b.parent], 'cha phải tồn tại')
        if (b.next !== null) assert.equal(blocks[b.next].parent, Object.keys(blocks).find((k) => blocks[k] === b))
      }
    })

test('số trong ô nhập là nguyên thuỷ sb3 [bóng, giá trị]; trường là [giá trị, null]', () => {
  const project = toProject(SAMPLES.maker.teleop)
  const blocks = Object.values((project.targets[1] as { blocks: Record<string, { opcode: string; inputs: Record<string, unknown[]>; fields: Record<string, unknown> }> }).blocks)
  const motor = blocks.find((b) => b.opcode === 'thingBotC3_setMotor')!
  assert.deepEqual(motor.fields.DIRECTION, ['forward', null])
  assert.deepEqual(motor.fields.MOTOR, ['1', null])
  assert.ok(Array.isArray(motor.inputs.SPEED))
  const servo = blocks.find((b) => b.opcode === 'thingBotC3_setServoAngle')!
  assert.deepEqual(servo.inputs.ANGLE, [1, [4, String((servo.inputs.ANGLE[1] as unknown[])[1])]])
})

test('biến: nằm trên Stage, tham chiếu [tên, id] và [12, tên, id]', () => {
  const state = {
    variables: [{ id: 'v-1', name: 'tốc độ', type: 'int' }],
    blocks: {
      blocks: [
        {
          type: 'event_whenarduinobegin', x: 5, y: 6,
          next: { block: { type: 'data_setvariableto', fields: { VARIABLE: { id: 'v-1', name: 'tốc độ' } }, inputs: { VALUE: { shadow: { type: 'text', fields: { TEXT: '3' } }, block: { type: 'data_variable', fields: { VARIABLE: { id: 'v-1', name: 'tốc độ' } } } } } } },
        },
      ],
    },
  }
  const p = toProject(state)
  assert.deepEqual((p.targets[0] as { variables: unknown }).variables, { 'v-1': ['tốc độ', 0] })
  assert.deepEqual((p.targets[0] as { variableTypes: unknown }).variableTypes, { 'v-1': 'int' })
  const set = spriteBlocks(p).find((b) => b.opcode === 'data_setvariableto') as unknown as { fields: Record<string, unknown>; inputs: Record<string, unknown> }
  assert.deepEqual(set.fields.VARIABLE, ['tốc độ', 'v-1'])
  assert.deepEqual(set.inputs.VALUE, [3, [12, 'tốc độ', 'v-1'], [10, '3']])
  assert.throws(() => toProject({ blocks: { blocks: [{ type: 'data_setvariableto', fields: { VARIABLE: { id: 'lạ' } } }] } }), /Biến chưa khai báo/)
})

test('tên tệp: fanroc-<robot>-<yyyymmdd-hhmm>.tb theo giờ máy', () => {
  assert.equal(tbFileName('sort', new Date(2026, 10, 3, 9, 5)), 'fanroc-sort-20261103-0905.tb')
})

test('ghi mẫu TeleOp của 4 robot để mở thử bằng ThingBlock desktop (nếu có FANROC_TB_OUT)', async (t) => {
  const out = process.env.FANROC_TB_OUT
  if (!out) return t.skip('đặt FANROC_TB_OUT để ghi tệp')
  mkdirSync(out, { recursive: true })
  for (const type of TYPES) writeFileSync(join(out, `fanroc-${type}-teleop.tb`), Buffer.from(await (await toTb(SAMPLES[type].teleop)).arrayBuffer()))
})
