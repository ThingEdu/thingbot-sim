/**
 * Web Worker chạy chương trình khối trên `thingblock-sim` — giống worker của ThingBlock
 * (`thingblock-sim/src/worker.ts`), thêm một thứ web mẫu cần mà snapshot gốc chưa có: **hoạt động trên
 * bus** giữa hai snapshot (bao nhiêu lần chương trình đọc chân GPIO, ghi kênh PCA9685 qua I2C). Không có
 * nó, cảnh chỉ biết "đèn đang sáng" chứ không biết "dữ liệu đang chạy trên dây".
 *
 * Trường này nên được đưa vào `Snapshot` của thingblock-sim (spec v0.2, mục 5); ở đây tạm lấy bằng cách
 * bọc `$.digitalRead` và `pwm.setPWM` của bo ảo.
 */
import { Session, type Snapshot } from '@thingblock/thingblock-sim'

export interface Bus {
  /** Số lần chương trình đọc từng chân GPIO, kể từ snapshot trước. */
  reads: Record<number, number>
  /** Số lần ghi từng kênh PCA9685 (mỗi lần là một gói I2C), kể từ snapshot trước. */
  writes: Record<number, number>
}

export type Command =
  | { type: 'load'; code: string }
  | { type: 'run' }
  | { type: 'stop' }
  | { type: 'input'; key: string; value: number }

export type Message =
  | { type: 'snapshot'; snapshot: Snapshot; bus: Bus }
  | { type: 'error'; message: string }

interface WorkerScope {
  postMessage(message: Message): void
  onmessage: ((event: { data: Command }) => void) | null
}

interface BoardInternals {
  $: { digitalRead: (pin: number) => number }
  devices: { pwm?: { setPWM: (ch: number, on: number, off: number) => void } }
}

const scope = globalThis as unknown as WorkerScope
const TICK_MS = 16

let session: Session | null = null
let timer: ReturnType<typeof setInterval> | null = null
let last = 0
let bus: Bus = { reads: {}, writes: {} }

const instrument = (s: Session): void => {
  const board = (s as unknown as { board: BoardInternals }).board
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
    }
  }
}

const post = (snapshot: Snapshot): void => {
  scope.postMessage({ type: 'snapshot', snapshot, bus })
  bus = { reads: {}, writes: {} }
}

const tick = (): void => {
  if (!session) return
  const now = performance.now()
  const elapsed = Math.min(now - last, 250)
  last = now
  try {
    post(session.tick(elapsed))
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
        instrument(session)
        bus = { reads: {}, writes: {} }
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
