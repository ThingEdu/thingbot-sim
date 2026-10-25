/**
 * Web Worker chạy chương trình khối trên `thingblock-sim` — giống worker của ThingBlock
 * (`thingblock-sim/src/worker.ts`), thêm một thứ web mẫu cần mà snapshot gốc chưa có: **hoạt động trên
 * bus** giữa hai snapshot (bao nhiêu lần chương trình đọc chân GPIO, ghi kênh PCA9685 qua I2C). Không có
 * nó, cảnh chỉ biết "đèn đang sáng" chứ không biết "dữ liệu đang chạy trên dây".
 *
 * Trường này nên được đưa vào `Snapshot` của thingblock-sim (spec v0.2, mục 5); ở đây tạm lấy bằng cách
 * bọc `$.digitalRead` và `pwm.setPWM` của bo ảo.
 *
 * Bài có luật `kiểm:` (ví dụ "L1 nhấp nháy, chu kỳ 1 giây ± 20%") được chấm ngay trong worker bằng đúng
 * bộ chấm của ThingBlock, như `Watcher` của thingblock-sim: chỉ gửi kết quả khi nó đổi.
 */
import { Session, type Snapshot } from '@thingblock/thingblock-sim'
import { evaluateLogRules, parseRule, type Rule, type RuleResult } from '@thingblock/thingblock-sim/checker'

export interface Bus {
  /** Số lần chương trình đọc từng chân GPIO, kể từ snapshot trước. */
  reads: Record<number, number>
  /** Số lần ghi từng kênh PCA9685 (mỗi lần là một gói I2C), kể từ snapshot trước. */
  writes: Record<number, number>
  /** Kênh PCA9685 vừa được ghi lệnh tắt (độ sáng 0) / lệnh bật (độ sáng > 0), kể từ snapshot trước. */
  zeros: Record<number, boolean>
  ons: Record<number, boolean>
  /** Số lần `loop()` đã bắt đầu, từ lúc chạy (cộng dồn). */
  loops: number
}

export type Command =
  | { type: 'load'; code: string; rules?: string[] }
  | { type: 'run' }
  | { type: 'stop' }
  | { type: 'input'; key: string; value: number }

export type Message =
  | { type: 'snapshot'; snapshot: Snapshot; bus: Bus }
  | { type: 'check'; results: RuleResult[] }
  | { type: 'error'; message: string }

interface WorkerScope {
  postMessage(message: Message): void
  onmessage: ((event: { data: Command }) => void) | null
}

interface BoardInternals {
  $: { digitalRead: (pin: number) => number }
  devices: { pwm?: { duty: number[]; setPWM: (ch: number, on: number, off: number) => void } }
}

const scope = globalThis as unknown as WorkerScope
const TICK_MS = 16

let session: Session | null = null
let timer: ReturnType<typeof setInterval> | null = null
let last = 0
let loops = 0
const emptyBus = (): Bus => ({ reads: {}, writes: {}, zeros: {}, ons: {}, loops })
let bus: Bus = emptyBus()
let rules: Rule[] = []
let lastCheck = ''

const instrument = (s: Session): void => {
  const internals = s as unknown as { board: BoardInternals; runner: { program: { loop: () => unknown } } }
  const { board } = internals
  const program = internals.runner.program
  const loop = program.loop.bind(program)
  program.loop = () => {
    loops++
    return loop()
  }
  const read = board.$.digitalRead
  board.$.digitalRead = (pin) => {
    bus.reads[pin] = (bus.reads[pin] ?? 0) + 1
    return read(pin)
  }
  const pwm = board.devices.pwm
  if (pwm) {
    const setPWM = pwm.setPWM.bind(pwm)
    pwm.setPWM = (ch, on, off) => {
      bus.writes[ch & 15] = (bus.writes[ch & 15] ?? 0) + 1
      setPWM(ch, on, off)
      if (pwm.duty[ch & 15] === 0) bus.zeros[ch & 15] = true
      else bus.ons[ch & 15] = true
    }
  }
}

const post = (snapshot: Snapshot): void => {
  bus.loops = loops
  scope.postMessage({ type: 'snapshot', snapshot, bus })
  bus = emptyBus()
}

/** Chấm luật của bài; bỏ qua lúc `setup` đang chạy dở, như Watcher của ThingBlock. */
const check = (s: Session): void => {
  if (!rules.length) return
  if (s.snapshot().phase === 'setup' && !s.sleeping) return
  const results = evaluateLogRules(rules, s.log)
  const key = JSON.stringify(results)
  if (key === lastCheck) return
  lastCheck = key
  scope.postMessage({ type: 'check', results })
}

const tick = (): void => {
  if (!session) return
  const now = performance.now()
  const elapsed = Math.min(now - last, 250)
  last = now
  try {
    post(session.tick(elapsed))
    check(session)
  } catch (e) {
    scope.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    session.running = false
  }
}

scope.onmessage = ({ data }) => {
  switch (data.type) {
    case 'load':
      try {
        session = new Session(data.code)
        loops = 0
        instrument(session)
        bus = emptyBus()
        rules = (data.rules ?? []).map(parseRule)
        lastCheck = ''
        post(session.snapshot())
      } catch (e) {
        session = null
        scope.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      }
      break
    case 'run':
      if (!session) return
      session.running = true
      last = performance.now()
      timer ??= setInterval(tick, TICK_MS)
      break
    case 'input':
      session?.setInput(data.key, data.value)
      break
    case 'stop':
      if (timer) clearInterval(timer)
      timer = null
      if (session) post({ ...session.snapshot(), running: false })
      session = null
      break
  }
}
