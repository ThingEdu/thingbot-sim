import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RobotLink } from './link.ts'
import { NEUTRAL } from './ports.ts'
import { PS2_NEUTRAL, type Ps2State } from './gamepad.ts'
import type { Command, Message } from '../sim-worker.ts'

/** Dây nối với worker giả: ghi lại lệnh đã gửi. */
const setup = () => {
  const sent: Command[] = []
  const errors: string[] = []
  const link = new RobotLink((c) => sent.push(c))
  link.onError = (m) => errors.push(m)
  return { link, sent, errors }
}
const pwm = (over: Record<number, number>) => Array.from({ length: 16 }, (_, ch) => over[ch] ?? 0)
const snap = (run: number, duty: number[], error?: string) =>
  ({ type: 'snapshot', run, snapshot: { pwm: duty, error, running: true }, bus: {} }) as unknown as Message
const inputs = (cs: Command[]) => Object.fromEntries(cs.filter((c) => c.type === 'input').map((c) => [c.key, c.value]))
const lastType = (cs: Command[]) => cs.at(-1)?.type
const runOf = (cs: Command[]) => (cs.find((c) => c.type === 'load') as { run: number }).run

test('load: gửi mã rồi ps2_PRESENT = 1 và đủ mọi khoá tay cầm (cần 128), chưa chạy thì cổng trung tính', () => {
  const { link, sent } = setup()
  link.load('code')
  assert.equal(sent[0].type, 'load')
  const keys = inputs(sent)
  assert.equal(keys.adcps2_PRESENT, 1)
  for (const [k, v] of Object.entries(PS2_NEUTRAL)) assert.equal(keys[`adc${k}`], v, k)
  link.receive(snap(runOf(sent), pwm({ 3: 4095 })))
  assert.deepEqual(link.ports(), NEUTRAL)
})

test('đang chạy: snapshot.pwm → cổng (M1 tiến 100); thư của lần nạp trước bị bỏ', () => {
  const { link, sent } = setup()
  link.load('a')
  const old = runOf(sent)
  link.load('b')
  const run = (sent.filter((c) => c.type === 'load').at(-1) as { run: number }).run
  assert.notEqual(run, old)
  link.start()
  link.receive(snap(run, pwm({ 3: 4095 })))
  assert.equal(link.ports().M1, 100)
  link.receive(snap(old, pwm({ 2: 4095 })))
  assert.equal(link.ports().M1, 100)
})

test('tay cầm rút ra giữa trận ⇒ mọi khoá ps2_* về trung tính ngay khung đó (Review Focus 1)', () => {
  const { link, sent } = setup()
  link.load('x')
  link.start()
  const up: Ps2State = { ...PS2_NEUTRAL, ps2_PSS_LY: 0, ps2_PSS_RY: 0, ps2_PSB_R1: 1 }
  link.input(up)
  sent.length = 0
  link.input(up)
  assert.deepEqual(sent, [], 'không đổi thì không gửi')
  link.input(null)
  const keys = inputs(sent)
  assert.equal(Object.keys(keys).length, Object.keys(PS2_NEUTRAL).length)
  for (const [k, v] of Object.entries(PS2_NEUTRAL)) assert.equal(keys[`adc${k}`], v, k)
})

test('worker báo lỗi ⇒ cổng trung tính, báo lỗi tiếng Việt, dừng worker (Review Focus 2)', () => {
  const { link, sent, errors } = setup()
  link.load('x')
  const run = runOf(sent)
  link.start()
  link.receive(snap(run, pwm({ 3: 4095 })))
  link.receive({ type: 'error', run, message: 'boom' } as Message)
  assert.deepEqual(link.ports(), NEUTRAL)
  assert.equal(link.state, 'error')
  assert.deepEqual(errors, ['Chương trình dừng vì lỗi (boom)'], 'lỗi lạ: giữ nguyên trong ngoặc')
  assert.equal(sent.at(-1)!.type, 'stop')
  link.receive(snap(run, pwm({ 3: 4095 })))
  assert.deepEqual(link.ports(), NEUTRAL, 'snapshot muộn sau lỗi không làm robot chạy lại')
})

test('bo ảo dừng vì lỗi (snapshot.error) ⇒ cổng trung tính, lỗi dịch sang tiếng Việt', () => {
  const { link, sent, errors } = setup()
  link.load('x')
  link.start()
  link.receive(snap(runOf(sent), pwm({ 3: 4095 }), 'IntegerDivideByZero'))
  assert.deepEqual(link.ports(), NEUTRAL)
  assert.deepEqual(errors, ['Chương trình dừng vì lỗi: chia một số nguyên cho 0'])
})

test('mã không sinh được ⇒ không nạp, báo lỗi; bấm Dừng ⇒ cổng trung tính, gửi stop', () => {
  const { link, sent, errors } = setup()
  assert.equal(link.load('', 'Khối "x" chưa mô phỏng được'), false)
  assert.equal(sent.length, 0)
  assert.equal(errors[0], 'Chương trình dừng vì lỗi: Khối "x" chưa mô phỏng được')
  link.load('ok')
  link.start()
  link.receive(snap(runOf(sent), pwm({ 3: 4095 })))
  link.stop()
  assert.equal(sent.at(-1)!.type, 'stop')
  assert.equal(link.state, 'stopped')
  assert.deepEqual(link.ports(), NEUTRAL)
})

// ---------- Tạm dừng / chạy từng khối / Serial (spec 6.1b) ----------
const snapOf = (run: number, s: Record<string, unknown>) =>
  ({ type: 'snapshot', run, snapshot: { pwm: pwm({}), error: undefined, running: true, serial: '', t: 0, block: undefined, ...s }, bus: {} }) as unknown as Message

test('pause(): gửi pause, state paused; resume(): gửi run; step(): gửi step, state paused', () => {
  const { link, sent } = setup()
  link.load('x')
  link.start()
  link.pause()
  assert.deepEqual(sent.at(-1), { type: 'pause' })
  assert.equal(link.state, 'paused')
  link.resume()
  assert.deepEqual(sent.at(-1), { type: 'run' })
  assert.equal(link.state, 'running')
  link.step()
  assert.deepEqual(sent.at(-1), { type: 'step' })
  assert.equal(link.state, 'paused')
  link.step()
  assert.deepEqual(sent.at(-1), { type: 'step' }, 'đang tạm dừng vẫn chạy từng khối được')
  assert.equal(link.state, 'paused')
})

test('step() khi mới nạp (chưa chạy) gửi step; pause/resume/step khi idle hay đã dừng không gửi gì', () => {
  const { link, sent } = setup()
  link.pause()
  link.resume()
  link.step()
  assert.deepEqual(sent, [], 'idle: không gửi gì')
  assert.equal(link.state, 'idle')
  link.load('x')
  sent.length = 0
  link.pause()
  link.resume()
  assert.deepEqual(sent, [], 'mới nạp: pause / resume không gửi')
  link.step()
  assert.deepEqual(sent, [{ type: 'step' }])
  assert.equal(link.state, 'paused')
  link.stop()
  assert.equal(lastType(sent), 'stop', 'đang tạm dừng bấm Dừng ⇒ gửi stop')
  sent.length = 0
  link.pause()
  link.resume()
  link.step()
  assert.deepEqual(sent, [], 'đã dừng: không gửi gì')
})

test('tạm dừng: robot giữ lệnh cuối (ports ≠ NEUTRAL khi có pwm), snapshot vẫn được nhận', () => {
  const { link, sent } = setup()
  link.load('x')
  const run = runOf(sent)
  link.start()
  link.pause()
  link.receive(snap(run, pwm({ 3: 4095 })))
  assert.equal(link.ports().M1, 100)
  assert.notDeepEqual(link.ports(), NEUTRAL)
})

test('snapshot: block, virtualT, serial cộng dồn (cắt 20 000 ký tự cuối); nạp lại thì xoá', () => {
  const { link, sent } = setup()
  link.load('x')
  const run = runOf(sent)
  link.start()
  link.receive(snapOf(run, { serial: 'xin ', block: 'b1', t: 1000 }))
  link.receive(snapOf(run, { serial: 'chào\n', block: 'b2', t: 2000 }))
  assert.equal(link.serial, 'xin chào\n')
  assert.equal(link.block, 'b2')
  assert.equal(link.virtualT, 2000)
  link.receive(snapOf(run, { serial: 'a'.repeat(19_999) + 'Z' }))
  assert.equal(link.serial.length, 20_000)
  assert.ok(link.serial.endsWith('aZ') && link.serial.startsWith('a'), 'giữ 20 000 ký tự cuối')
  link.load('y')
  assert.equal(link.serial, '')
  assert.equal(link.block, undefined)
  assert.equal(link.virtualT, 0)
})

test('serialChars / serialLines đếm cả khi chuỗi đã chạm trần (7000 × "hi\\n" rồi 10 dòng ⇒ +10); nạp lại về 0', () => {
  const { link, sent } = setup()
  link.load('x')
  const run = runOf(sent)
  link.start()
  link.receive(snapOf(run, { serial: 'hi\n'.repeat(7000) }))
  const before = { text: link.serial, chars: link.serialChars, lines: link.serialLines, loads: link.loads }
  assert.equal(before.lines, 7000)
  assert.equal(before.chars, 21_000)
  link.receive(snapOf(run, { serial: 'hi\n'.repeat(10) }))
  assert.equal(link.serial, before.text, 'chuỗi đã chạm trần: hai lần đọc giống hệt nhau')
  assert.equal(link.serialLines - before.lines, 10)
  assert.equal(link.serialChars - before.chars, 30)
  link.load('y')
  assert.equal(link.serialLines, 0)
  assert.equal(link.serialChars, 0)
  assert.equal(link.loads, before.loads + 1)
})

test('tạm dừng: tay cầm vẫn gửi (lần chạy từng khối kế đọc đúng tay)', () => {
  const { link, sent } = setup()
  link.load('x')
  link.start()
  link.pause()
  sent.length = 0
  link.input({ ...PS2_NEUTRAL, ps2_PSS_LY: 0 })
  assert.equal(inputs(sent).adcps2_PSS_LY, 0)
})

test('step() xong đúng lúc snapshot trả lời của nó tới (sau trả lời load / pause, bỏ qua nhịp chạy)', async () => {
  const { link, sent } = setup()
  const reply = (run: number, t: number, running: boolean) =>
    link.receive({ type: 'snapshot', run, snapshot: { pwm: pwm({}), t, running }, bus: {} } as unknown as Message)
  link.load('x')
  const run = runOf(sent)
  link.start()
  link.pause()
  let done = false
  const p = link.step().then(() => (done = true))
  reply(run, 0, false) // trả lời load
  reply(run, 16_000, true) // nhịp chạy gửi trước khi worker nhận pause
  reply(run, 20_000, false) // trả lời pause
  await Promise.resolve()
  assert.equal(done, false, 'chưa tới trả lời của step')
  reply(run, 1_020_000, false) // trả lời step
  await p
  assert.equal(link.virtualT, 1_020_000)
  // Dừng giữa chừng: lời hứa của step xong luôn (không treo nút).
  const q = link.step()
  link.stop()
  await q
})

test('step() quá hạn không có trả lời ⇒ xong và rời hàng chờ; thư kế tiếp là của lệnh kế, không xong nhầm', async () => {
  const { link, sent } = setup()
  const reply = (t: number) =>
    link.receive({ type: 'snapshot', run: runOf(sent), snapshot: { pwm: pwm({}), t, running: false }, bus: {} } as unknown as Message)
  link.load('x')
  reply(0) // trả lời load
  await link.step(20) // bo không trả lời: xong sau 20 ms
  let done = false
  const p = link.step(10_000).then(() => (done = true))
  reply(500_000) // trả lời step thứ hai
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(done, true, 'trả lời phải thuộc step thứ hai')
  await p
  link.stop()
})
