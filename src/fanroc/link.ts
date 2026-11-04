// Dây nối một robot FANROC với "bo ThingBot ảo" của nó (một SimWorker): nạp / chạy / dừng chương trình, đưa tay cầm
// vào bộ thu PS2 ảo, và đọc 16 kênh PCA9685 mới nhất thành giá trị cổng. Không đụng DOM hay Worker thật (nhận hàm
// `post`), nên chạy được trong phép thử Node.
//
// Review Focus 2: chương trình lỗi (worker báo `error`, bo ảo dừng vì lỗi, hoặc mã không sinh được) hay học sinh bấm
// Dừng ⇒ `ports()` trả NEUTRAL (robot dừng), còn trận đấu do trang chạy tiếp; lỗi báo bằng tiếng Việt qua `onError`.
import type { Command, Message } from '../sim-worker.ts'
import { decodePorts, NEUTRAL, type PortValues } from './ports.ts'
import { PadFeed, PRESENT_KEY, type Ps2State } from './gamepad.ts'

export type LinkState = 'idle' | 'loaded' | 'running' | 'paused' | 'stopped' | 'error'

/** Serial giữ tối đa bấy nhiêu ký tự cuối (khung Serial của trang). */
export const SERIAL_MAX = 20_000

/** Lý do bo ảo dừng (BoardTrap của thingblock-sim) nói bằng tiếng Việt. */
const TRAPS: Record<string, string> = {
  IntegerDivideByZero: 'chia một số nguyên cho 0',
}

/**
 * Câu báo lỗi cho học sinh: lỗi đã biết thì dịch, lỗi lạ (thường là chữ tiếng Anh của trình chạy) thì giữ nguyên
 * trong ngoặc. `vietnamese` = lời đã là tiếng Việt (bộ sinh mã của ThingBlock).
 */
export function errorText(message: string, vietnamese = false): string {
  const known = TRAPS[message] ?? (vietnamese ? message : null)
  return known !== null ? `Chương trình dừng vì lỗi: ${known}` : `Chương trình dừng vì lỗi (${message})`
}

export class RobotLink {
  state: LinkState = 'idle'
  /** Lỗi tiếng Việt gần nhất, null khi không có. */
  error: string | null = null
  /** Mã của lần nạp gần nhất (để robot khác chạy cùng chương trình). */
  code: string | null = null
  /** Khối vừa chạy (snapshot mới nhất), để trang tô sáng; undefined khi chưa chạy khối nào. */
  block: string | undefined = undefined
  /** Chữ Serial bo ảo đã in, cộng dồn từ lần nạp (giữ SERIAL_MAX ký tự cuối). */
  serial = ''
  /** Thời gian ảo của bo (µs, `snapshot.t`). */
  virtualT = 0
  onError?: (message: string) => void
  onState?: (state: LinkState) => void

  private readonly post: (c: Command) => void
  private readonly feed = new PadFeed()
  private run = 0
  private pwm: number[] | null = null
  private pad: Ps2State | null = null

  constructor(post: (c: Command) => void) {
    this.post = post
  }

  /** Nạp chương trình lên bo ảo mới (chưa chạy). `error` = mã không sinh được (khối chưa mô phỏng được…). */
  load(code: string, error?: string): boolean {
    this.pwm = null
    if (error) {
      this.fail(error, true)
      return false
    }
    this.code = code
    this.run++
    this.block = undefined
    this.serial = ''
    this.virtualT = 0
    this.error = null
    this.post({ type: 'load', code, run: this.run })
    // Bo ảo mới: đặt đủ mọi khoá tay cầm (cần ở giữa = 128, không phải 0).
    this.post({ type: 'input', key: `adc${PRESENT_KEY}`, value: 1 })
    this.feed.reset()
    this.sendPad()
    this.set('loaded')
    return true
  }

  start(): void {
    if (this.state !== 'loaded') return
    this.post({ type: 'run' })
    this.set('running')
  }

  /** Tạm dừng (⏸): chỉ khi đang chạy. Robot giữ lệnh cuối; trang quyết có chạy vật lý không. */
  pause(): void {
    if (this.state !== 'running') return
    this.post({ type: 'pause' })
    this.set('paused')
  }

  /** Chạy tiếp sau tạm dừng (▶). */
  resume(): void {
    if (this.state !== 'paused') return
    this.post({ type: 'run' })
    this.set('running')
  }

  /** Chạy từng khối (⏭): tới khối kế rồi tạm dừng. */
  step(): void {
    if (this.state !== 'running' && this.state !== 'paused' && this.state !== 'loaded') return
    this.post({ type: 'step' })
    this.set('paused')
  }

  stop(): void {
    if (this.live()) this.post({ type: 'stop' })
    this.pwm = null
    if (this.state !== 'error' && this.state !== 'idle') this.set('stopped')
  }

  /** Tay cầm của khung hình này (null = không có tay / tay rút ra / tay không chuẩn ⇒ trung tính). */
  input(pad: Ps2State | null): void {
    this.pad = pad
    if (this.live()) this.sendPad()
  }

  /** Thư từ worker; thư của lần nạp trước bị bỏ. */
  receive(msg: Message): void {
    if (msg.run !== this.run || !this.live()) return
    if (msg.type === 'error') this.fail(msg.message)
    else if (msg.type === 'snapshot') {
      const s = msg.snapshot
      if (s.serial) this.serial = (this.serial + s.serial).slice(-SERIAL_MAX)
      if (s.block !== undefined) this.block = s.block
      if (typeof s.t === 'number') this.virtualT = s.t
      if (s.error) this.fail(s.error)
      else this.pwm = s.pwm
    }
  }

  /** Giá trị cổng: khi chương trình đang chạy hoặc tạm dừng (giữ lệnh cuối), ngược lại robot đứng yên. */
  ports(): PortValues {
    return (this.state === 'running' || this.state === 'paused') && this.pwm ? decodePorts(this.pwm) : NEUTRAL
  }

  /** Bo ảo đang có chương trình (đã nạp, đang chạy hay tạm dừng). */
  private live(): boolean {
    return this.state === 'loaded' || this.state === 'running' || this.state === 'paused'
  }

  private sendPad(): void {
    for (const [k, v] of Object.entries(this.feed.next(this.pad))) this.post({ type: 'input', key: `adc${k}`, value: v })
  }

  private fail(message: string, vietnamese = false): void {
    if (this.live()) this.post({ type: 'stop' })
    this.pwm = null
    this.error = errorText(message, vietnamese)
    this.set('error')
    this.onError?.(this.error)
  }

  private set(s: LinkState): void {
    this.state = s
    this.onState?.(s)
  }
}
