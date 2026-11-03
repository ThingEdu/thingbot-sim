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
