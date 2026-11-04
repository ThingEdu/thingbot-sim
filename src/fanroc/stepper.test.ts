// Chạy từng khối (⏭) trên bo ảo thật: chương trình khối ThingBlock thật (sinh bằng đúng bộ sinh mã của trang), chạy
// bằng `stepToNextBlock` — mỗi lần tới khối kế; khối `đợi 1 giây` thì thời gian ảo trôi đúng 1 giây (spec 6.1b).
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build, type BuildOptions } from 'esbuild'
import type { Session } from '@thingblock/thingblock-sim'
import { decodePorts } from './ports.ts'
import { stepToNextBlock } from '../sim-step.ts'
import type { Command, Message } from '../sim-worker.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(ROOT, '../thingblock-editor-sim'))
const pkg = (p: string) => join(THINGBLOCK, 'packages', p)
const { JSDOM } = createRequire(join(THINGBLOCK, 'node_modules/blockly/package.json'))('jsdom')

type Headless = {
  useDom(window: object): void
  generate(state: object): { sim: string; arduino: string; error?: string }
  Session: new (code: string, opts?: { now?: () => number }) => Session
}
let H: Headless
const inbox: Message[] = []
let toWorker: (c: Command) => void

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fanroc-stepper-'))
  const outfile = join(dir, 'headless.mjs')
  const common: BuildOptions = {
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
  }
  await build({ ...common, entryPoints: [join(ROOT, 'src/fanroc/headless.ts')] })
  H = (await import(pathToFileURL(outfile).href)) as Headless
  // Worker dùng chung thật (sim-worker.ts), chạy trong Node: nó gán `onmessage` và gọi `postMessage` của globalThis.
  const workerFile = join(dir, 'worker.mjs')
  await build({ ...common, entryPoints: [join(ROOT, 'src/sim-worker.ts')], outfile: workerFile })
  const g = globalThis as unknown as { postMessage: (m: Message) => void; onmessage: ((e: { data: Command }) => void) | null }
  g.postMessage = (m) => inbox.push(m)
  await import(pathToFileURL(workerFile).href)
  toWorker = (c) => g.onmessage!({ data: c })
  rmSync(dir, { recursive: true, force: true })
  H.useDom(new JSDOM().window)
})

// ---------- Chương trình thử ----------
type B = Record<string, unknown>
const motor = (id: string, speed: number): B => ({
  type: 'thingBotC3_setMotor',
  id,
  fields: { MOTOR: '1', DIRECTION: 'forward' },
  inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: speed } } } },
})
const wait = (id: string, s: number): B => ({ type: 'control_wait', id, inputs: { DURATION: { shadow: { type: 'math_positive_number', fields: { NUM: s } } } } })
const print = (id: string, text: string): B => ({ type: 'control_print', id, inputs: { STRING: { shadow: { type: 'text', fields: { TEXT: text } } } } })
const chain = (...bs: B[]): B => bs.reduceRight<B | undefined>((next, b) => (next ? { ...b, next: { block: next } } : b), undefined)!
const hat = (type: string, y: number, body?: B): B => ({ type, id: type, x: 30, y, ...(body ? { next: { block: body } } : {}) })
const session = (...hats: B[]): Session => {
  const { sim, error } = H.generate({ blocks: { languageVersion: 0, blocks: hats } })
  assert.equal(error, undefined)
  return new H.Session(sim, { now: () => 0 })
}
const m1 = (s: { pwm: number[] }) => decodePorts(s.pwm).M1

// ---------- Từng khối ----------
test('M1 tiến 60; đợi 1 giây; M1 tiến 0: lần 1 tới khối đợi, lần 2 qua đợi đúng 1 s, lần 3 M1 = 0', { timeout: 20_000 }, () => {
  const s = session(hat('event_whenarduinobegin', 30, chain(motor('m60', 60), wait('w', 1), motor('m0', 0))))
  const a = stepToNextBlock(s)
  assert.equal(a.block, 'w', 'lần 1: dừng ở khối đợi')
  assert.equal(m1(a), 60, 'khối M1 tiến 60 đã chạy xong')
  assert.ok(a.t < 50_000, `lần 1: t ≈ 0 (được ${a.t} µs)`)
  assert.equal(a.running, false)
  assert.equal(s.running, false, 'chạy từng khối xong thì bo ảo đứng (tạm dừng)')

  const b = stepToNextBlock(s)
  const dt = b.t - a.t
  assert.ok(Math.abs(dt - 1_000_000) <= 20_000, `lần 2: thời gian ảo trôi 1 s ± 20 ms (được ${dt} µs)`)
  assert.equal(b.block, 'm0', 'lần 2: dừng ở khối kế sau khối đợi')
  assert.equal(m1(b), 60, 'trong lúc đợi M1 vẫn 60: trang chạy sân 1 s bằng lệnh này')

  const c = stepToNextBlock(s)
  assert.equal(m1(c), 0, 'lần 3: M1 = 0')
  assert.equal(c.running, false)
})

test('vòng lặp rỗng không có khối kế: dừng sau tối đa 5 s ảo, không treo worker', { timeout: 20_000 }, () => {
  const s = session(hat('event_whenarduinobegin', 30, motor('m60', 60)))
  const real = performance.now()
  const a = stepToNextBlock(s)
  assert.ok(a.t >= 5_000_000 && a.t < 5_100_000, `tối đa 5 s ảo (được ${a.t} µs)`)
  assert.equal(a.block, 'm60')
  assert.equal(m1(a), 60)
  const b = stepToNextBlock(s, 300)
  assert.ok(b.t - a.t >= 300_000 && b.t - a.t < 320_000, `giới hạn truyền vào được dùng (được ${b.t - a.t} µs)`)
  console.log(`# 5 s ảo của loop() rỗng chạy mất ${Math.round(performance.now() - real)} ms thật`)
})

test('vòng lặp chỉ có một khối in: mỗi lần chạy từng khối in đúng một dòng Serial', () => {
  // Khối hiện tại không đổi id (luôn là "p") nhưng mỗi vòng là một lần chạy khối mới: phải dừng sau mỗi vòng.
  const s = session(hat('event_whenarduinoloop', 30, print('p', 'x')))
  for (let i = 0; i < 4; i++) {
    const snap = stepToNextBlock(s)
    assert.equal(snap.block, 'p')
    assert.equal((snap.serial.match(/x/g) ?? []).length, 1, `lần ${i + 1}: ${JSON.stringify(snap.serial)}`)
    assert.ok(snap.t < 100_000 * (i + 1), 'không chạy tới giới hạn 5 s')
  }
})

// ---------- Worker dùng chung: lệnh pause / step cộng thêm ----------
const snaps = () => inbox.filter((m) => m.type === 'snapshot').map((m) => (m as Extract<Message, { type: 'snapshot' }>).snapshot)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('worker: step gửi đúng một snapshot ở khối kế; run sau step chạy tiếp; pause dừng gửi snapshot', { timeout: 20_000 }, async (t) => {
  // Trượt giữa chừng thì vẫn dừng đồng hồ của worker, không để tiến trình thử treo.
  t.after(() => toWorker({ type: 'stop' }))
  const { sim } = H.generate({ blocks: { languageVersion: 0, blocks: [hat('event_whenarduinobegin', 30, chain(motor('m60', 60), wait('w', 1), motor('m0', 0)))] } })
  inbox.length = 0
  toWorker({ type: 'load', code: sim, run: 7 })
  assert.equal(snaps().length, 1, 'load: một snapshot')
  toWorker({ type: 'step' })
  assert.equal(snaps().length, 2, 'step: thêm đúng một snapshot, ngay (không chờ đồng hồ thật)')
  const a = snaps().at(-1)!
  assert.equal(a.block, 'w')
  assert.equal(m1(a), 60)
  assert.equal(a.running, false)
  assert.ok(inbox.every((m) => m.run === 7))
  await sleep(80)
  assert.equal(snaps().length, 2, 'sau step bo ảo đứng: không tự gửi thêm')
  toWorker({ type: 'step' })
  const b = snaps().at(-1)!
  assert.ok(Math.abs(b.t - a.t - 1_000_000) <= 20_000, `qua khối đợi: ${b.t - a.t} µs`)
  toWorker({ type: 'run' })
  await sleep(80)
  const running = snaps().length
  assert.ok(running > 3, 'run sau step chạy tiếp (gửi snapshot mỗi 16 ms)')
  assert.equal(m1(snaps().at(-1)!), 0, 'chạy tiếp: khối M1 tiến 0 đã chạy')
  toWorker({ type: 'pause' })
  const paused = snaps().length
  assert.equal(snaps().at(-1)!.running, false, 'pause gửi một snapshot running = false')
  await sleep(80)
  assert.equal(snaps().length, paused, 'đang tạm dừng: không gửi thêm snapshot')
})
