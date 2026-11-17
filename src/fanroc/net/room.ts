// Phòng Thi qua mạng LAN (spec 2026-11-18-fanroc-lan-design.md): máy trạng thái thuần của máy chủ (HostRoom, liên
// minh Đỏ) và máy khách (GuestRoom, Xanh) trên một Transport. Không DOM, không vật lý: trang dựng phiên chơi khi
// nhận `onStart`, gọi `loaded()` khi xong; đồng hồ tiêm được (`now`) để phép thử tua giờ.
//
// Giao thức (JSON; ảnh chụp sân là thư nhị phân): hello → welcome | reject · lobby · ready · start · loaded · go ·
// in (cổng máy khách mỗi khung) · ping / pong · end · bye. Hub (lan.rs) tự gửi peer {on} và reject {reason}.
import type { RobotConfig } from '../robots.ts'
import type { Skill } from '../agent.ts'
import { NEUTRAL, type PortValues } from '../ports.ts'
import type { Data, Transport } from './transport.ts'

/** Phiên bản giao thức; hai máy khác số này không vào trận được. */
export const PROTO = 1
/** Không nhận thư của bên kia chừng này ms ⇒ coi là rớt mạng. */
export const SILENCE_MS = 2000
/** Máy khách rớt: chờ nối lại chừng này ms (sau đó robot Xanh đứng yên tới hết trận); máy khách thử nối lại chừng ấy. */
export const REJOIN_MS = 10_000
/** Đếm ngược trước trận. */
export const COUNTDOWN_MS = 3000
/** Máy khách đo độ trễ mỗi chừng này ms. */
export const PING_MS = 1000

export interface TeamInfo {
  team: string
  players: 1 | 2
  /** Robot ô trái, ô phải của liên minh (ô phải chỉ dùng khi có robot máy hay bạn thứ hai). */
  robots: [RobotConfig, RobotConfig]
  /** Mức robot máy lái ghế trống của liên minh này. */
  skill: Skill
  /** Phiên bản app (chỉ để hiện). */
  app: string
}

export type Msg =
  | { t: 'hello'; proto: number; info: TeamInfo }
  | { t: 'welcome'; host: TeamInfo }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; host: TeamInfo; guest: TeamInfo | null; ready: [boolean, boolean] }
  | { t: 'ready'; on: boolean }
  | { t: 'start'; seed: number; host: TeamInfo; guest: TeamInfo }
  | { t: 'loaded'; seed: number }
  | { t: 'go'; ms: number }
  | { t: 'in'; ports: PortValues[]; rtt: number }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }
  | { t: 'end' }
  | { t: 'bye' }
  | { t: 'peer'; on: boolean }

export type Stage = 'waiting' | 'lobby' | 'loading' | 'countdown' | 'playing' | 'ended' | 'closed'

/** Lời báo cho học sinh theo lý do từ chối. */
export function rejectText(reason: string): string {
  if (reason === 'proto') return 'Hai máy phải cùng phiên bản TiFa — cập nhật cả hai máy rồi thử lại.'
  if (reason === 'full') return 'Phòng đã đủ hai máy.'
  if (reason === 'nohost') return 'Máy chủ chưa mở phòng.'
  return `Không vào được phòng (${reason}).`
}

const parse = (d: Data): Msg | null => {
  if (typeof d !== 'string') return null
  try {
    const m = JSON.parse(d) as Msg
    return m && typeof m.t === 'string' ? m : null
  } catch {
    return null
  }
}

abstract class Room {
  stage: Stage
  /** Lời báo trạng thái mạng gần nhất (null = ổn). */
  note: string | null = null
  onChange?: () => void
  protected lastHeard: number
  protected transport: Transport
  protected readonly now: () => number

  protected constructor(t: Transport, stage: Stage, now: () => number) {
    this.transport = t
    this.stage = stage
    this.now = now
    this.lastHeard = now()
    this.bind(t)
  }

  protected bind(t: Transport): void {
    this.transport = t
    t.onMessage = (d) => {
      if (this.transport !== t) return
      this.lastHeard = this.now()
      if (typeof d === 'string') {
        const m = parse(d)
        if (m) this.receive(m)
      } else this.binary(d)
    }
    t.onClose = () => this.transport === t && this.closed()
  }

  protected send(m: Msg): void {
    this.transport.send(JSON.stringify(m))
  }

  protected changed(): void {
    this.onChange?.()
  }

  /** Rời phòng (nút Về / đóng màn): báo bên kia rồi đóng. */
  leave(): void {
    if (this.stage === 'closed') return
    this.send({ t: 'bye' })
    this.stage = 'closed'
    this.transport.close()
    this.changed()
  }

  protected abstract receive(m: Msg): void
  protected binary(_d: ArrayBuffer): void {}
  protected abstract closed(): void
}

/** Máy chủ (liên minh Đỏ): giữ phòng, quyết seed, chạy trận; ảnh chụp do trang gửi qua `snapshot`. */
export class HostRoom extends Room {
  readonly info: TeamInfo
  guest: TeamInfo | null = null
  ready: [boolean, boolean] = [false, false]
  seed = 0
  /** Máy khách đang nối (nhận được thư trong SILENCE_MS). */
  guestOnline = false
  /** Máy khách rớt quá REJOIN_MS giữa trận: robot Xanh đứng yên tới hết trận. */
  guestGone = false
  /** Độ trễ khứ hồi máy khách báo (ms). */
  rtt = 0
  /** Máy khách vừa (nối lại) dựng xong trận: trang gửi lại toàn bộ nhật ký từ đầu. */
  resync = false
  onStart?: (seed: number, guest: TeamInfo) => void
  onGo?: () => void

  private latest: PortValues[] = [NEUTRAL, NEUTRAL]
  private loaded: [boolean, boolean] = [false, false]
  private goAt = 0
  private lostAt = 0

  constructor(t: Transport, info: TeamInfo, now: () => number = () => performance.now()) {
    super(t, 'waiting', now)
    this.info = info
  }

  /** Cổng máy khách gửi lên mới nhất cho ghế Xanh 0 / Xanh 1 (rớt mạng ⇒ trung tính). */
  ports(k: 0 | 1): PortValues {
    return this.guestOnline ? (this.latest[k] ?? NEUTRAL) : NEUTRAL
  }

  setReady(on: boolean): void {
    if (this.stage !== 'lobby') return
    this.ready[0] = on
    this.lobby()
    this.maybeStart()
  }

  /** Trang đã dựng xong phiên chơi của seed hiện tại. */
  hostLoaded(): void {
    if (this.stage !== 'loading') return
    this.loaded[0] = true
    this.maybeGo()
  }

  /** Gửi ảnh chụp sân (khi máy khách đang nối và đã dựng xong trận). */
  snapshot(buf: ArrayBuffer): void {
    if (this.guestOnline && this.loaded[1]) this.transport.send(buf)
  }

  /** Hết giờ: báo máy khách; về phòng chờ bằng `again`. */
  end(): void {
    if (this.stage !== 'playing') return
    this.stage = 'ended'
    this.send({ t: 'end' })
    this.changed()
  }

  /** Đấu lại: về phòng chờ, hai bên bấm Sẵn sàng lại. */
  again(): void {
    if (this.stage !== 'ended') return
    this.stage = this.guest && this.guestOnline ? 'lobby' : 'waiting'
    this.ready = [false, false]
    this.loaded = [false, false]
    this.guestGone = false
    this.lobby()
    this.changed()
  }

  /** Gọi mỗi khung: hết đếm ngược ⇒ vào trận; máy khách im lặng ⇒ rớt. */
  tick(): void {
    const t = this.now()
    if (this.stage === 'countdown' && t >= this.goAt) {
      this.stage = 'playing'
      this.onGo?.()
      this.changed()
    }
    if (this.guestOnline && t - this.lastHeard > SILENCE_MS) this.lost()
    if (!this.guestOnline && this.lostAt && (this.stage === 'playing' || this.stage === 'countdown') && !this.guestGone && t - this.lostAt > REJOIN_MS) {
      this.guestGone = true
      this.note = 'Máy bạn mất kết nối quá 10 giây — robot Xanh đứng yên tới hết trận'
      this.changed()
    }
  }

  /** Giây còn lại của đếm ngược (0 khi không đếm). */
  countdown(): number {
    return this.stage === 'countdown' ? Math.max(0, (this.goAt - this.now()) / 1000) : 0
  }

  protected receive(m: Msg): void {
    if (m.t === 'peer') {
      if (m.on) return // chờ hello
      if (this.guestOnline) this.lost()
      return
    }
    if (m.t === 'hello') {
      if (m.proto !== PROTO) {
        this.send({ t: 'reject', reason: 'proto' })
        return
      }
      const midMatch = this.stage === 'loading' || this.stage === 'countdown' || this.stage === 'playing'
      if (midMatch && this.guest && m.info.team !== this.guest.team) {
        this.send({ t: 'reject', reason: 'full' })
        return
      }
      this.guest = m.info
      this.guestOnline = true
      this.lostAt = 0
      this.note = null
      this.send({ t: 'welcome', host: this.info })
      if (midMatch) {
        // Nối lại giữa trận: máy khách dựng lại trận cùng seed rồi nhận ảnh chụp tiếp.
        this.loaded[1] = false
        this.send({ t: 'start', seed: this.seed, host: this.info, guest: this.guest })
      } else {
        if (this.stage === 'waiting' || this.stage === 'ended') this.stage = 'lobby'
        this.ready[1] = false
        this.lobby()
      }
      this.changed()
      return
    }
    if (!this.guestOnline) return
    if (m.t === 'ready' && this.stage === 'lobby') {
      this.ready[1] = m.on
      this.lobby()
      this.maybeStart()
    } else if (m.t === 'loaded' && m.seed === this.seed) {
      this.loaded[1] = true
      this.resync = true
      if (this.stage === 'loading') this.maybeGo()
      else if (this.stage === 'countdown') this.send({ t: 'go', ms: Math.max(0, this.goAt - this.now()) })
      else if (this.stage === 'playing') this.send({ t: 'go', ms: 0 })
      this.changed()
    } else if (m.t === 'in') {
      this.latest = m.ports
      this.rtt = m.rtt
    } else if (m.t === 'ping') this.send({ t: 'pong', at: m.at })
    else if (m.t === 'bye') this.lost()
  }

  protected closed(): void {
    this.stage = 'closed'
    this.note = 'Mất kết nối tới hub của máy này'
    this.changed()
  }

  private lost(): void {
    this.guestOnline = false
    this.lostAt = this.now()
    this.latest = [NEUTRAL, NEUTRAL]
    if (this.stage === 'lobby') {
      this.stage = 'waiting'
      this.guest = null
      this.ready = [this.ready[0], false]
      this.note = 'Máy bạn đã rời phòng'
    } else if (this.stage === 'loading' || this.stage === 'countdown' || this.stage === 'playing') {
      this.note = 'Máy bạn mất kết nối — robot Xanh đứng yên, chờ nối lại 10 giây'
    }
    this.changed()
  }

  private lobby(): void {
    if (this.guestOnline) this.send({ t: 'lobby', host: this.info, guest: this.guest, ready: this.ready })
    this.changed()
  }

  private maybeStart(): void {
    if (!this.ready[0] || !this.ready[1] || !this.guest) return
    this.stage = 'loading'
    this.loaded = [false, false]
    this.seed = 1 + Math.floor(Math.random() * 1e6)
    this.send({ t: 'start', seed: this.seed, host: this.info, guest: this.guest })
    this.onStart?.(this.seed, this.guest)
    this.changed()
  }

  private maybeGo(): void {
    if (!this.loaded[0] || !this.loaded[1]) return
    this.stage = 'countdown'
    this.goAt = this.now() + COUNTDOWN_MS
    this.send({ t: 'go', ms: COUNTDOWN_MS })
    this.changed()
  }
}

/** Máy khách (liên minh Xanh): gửi hello, theo máy chủ; ảnh chụp tới qua `onSnapshot`. */
export class GuestRoom extends Room {
  readonly info: TeamInfo
  host: TeamInfo | null = null
  ready: [boolean, boolean] = [false, false]
  seed = 0
  rtt = 0
  /** Lời từ chối (khác phiên bản / phòng đủ) — trang hiện rồi về màn tìm phòng. */
  rejected: string | null = null
  /** Đang mất kết nối giữa trận, thử nối lại (thời điểm bắt đầu mất). */
  lostAt = 0
  onStart?: (seed: number, host: TeamInfo, guest: TeamInfo) => void
  onSnapshot?: (buf: ArrayBuffer) => void
  /** Cần nối lại: trang mở Transport mới rồi gọi `rejoin`. */
  onReconnect?: () => void

  private goAt = 0
  private lastPing = 0
  private reconnecting = false
  private nextTry = 0

  constructor(t: Transport, info: TeamInfo, now: () => number = () => performance.now()) {
    super(t, 'waiting', now)
    this.info = info
    this.hello()
  }

  setReady(on: boolean): void {
    if (this.stage !== 'lobby') return
    this.ready[1] = on
    this.send({ t: 'ready', on })
    this.changed()
  }

  /** Trang đã dựng xong phiên gương của seed này. */
  loaded(): void {
    if (this.stage === 'loading') this.send({ t: 'loaded', seed: this.seed })
  }

  /** Cổng robot của máy này (ghế Xanh 0, Xanh 1) mỗi khung khi đang thi đấu. */
  input(ports: PortValues[]): void {
    if (this.stage === 'playing' || this.stage === 'countdown') this.send({ t: 'in', ports, rtt: Math.round(this.rtt) })
  }

  /** Nối lại bằng đường truyền mới (sau onReconnect). */
  rejoin(t: Transport): void {
    this.bind(t)
    this.lastHeard = this.now()
    this.reconnecting = false
    this.hello()
  }

  /** Không nối lại được (trang báo sau mỗi lần thử hỏng): hết REJOIN_MS thì hủy. */
  rejoinFailed(): void {
    this.reconnecting = false
  }

  countdown(): number {
    return this.stage === 'countdown' ? Math.max(0, (this.goAt - this.now()) / 1000) : 0
  }

  tick(): void {
    const t = this.now()
    if (this.stage === 'countdown' && t >= this.goAt) {
      this.stage = 'playing'
      this.changed()
    }
    if (this.stage !== 'closed' && this.stage !== 'waiting' && t - this.lastPing >= PING_MS) {
      this.lastPing = t
      this.send({ t: 'ping', at: t })
    }
    const inMatch = this.stage === 'loading' || this.stage === 'countdown' || this.stage === 'playing'
    if (inMatch && !this.lostAt && t - this.lastHeard > SILENCE_MS) this.lose()
    if (this.lostAt) {
      if (t - this.lostAt > REJOIN_MS) {
        this.stage = 'closed'
        this.lostAt = 0
        this.note = 'Trận bị hủy — không nối lại được máy chủ'
        this.transport.close()
        this.changed()
      } else if (!this.reconnecting && t >= this.nextTry) {
        this.reconnecting = true
        this.nextTry = t + 1000 // thử lại tối đa mỗi giây
        this.onReconnect?.()
      }
    }
  }

  protected receive(m: Msg): void {
    if (m.t === 'reject') {
      this.rejected = rejectText(m.reason)
      this.stage = 'closed'
      this.transport.close()
    } else if (m.t === 'welcome') {
      this.host = m.host
      if (this.lostAt) {
        this.lostAt = 0
        this.note = null
      } else if (this.stage === 'waiting') this.stage = 'lobby'
    } else if (m.t === 'lobby') {
      this.host = m.host
      this.ready = m.ready
      if (this.stage === 'waiting' || this.stage === 'ended') this.stage = 'lobby'
    } else if (m.t === 'start') {
      this.seed = m.seed
      this.stage = 'loading'
      this.onStart?.(m.seed, m.host, m.guest)
    } else if (m.t === 'go') {
      this.goAt = this.now() + m.ms
      this.stage = m.ms > 0 ? 'countdown' : 'playing'
    } else if (m.t === 'pong') this.rtt = this.now() - m.at
    else if (m.t === 'end') this.stage = 'ended'
    else if (m.t === 'bye') {
      this.stage = 'closed'
      this.note = 'Máy chủ đã đóng phòng'
      this.transport.close()
    }
    this.changed()
  }

  protected binary(d: ArrayBuffer): void {
    if (this.stage === 'playing' || this.stage === 'countdown' || this.stage === 'ended') this.onSnapshot?.(d)
  }

  protected closed(): void {
    const inMatch = this.stage === 'loading' || this.stage === 'countdown' || this.stage === 'playing'
    if (inMatch) {
      if (!this.lostAt) this.lose()
      this.reconnecting = false // thử lại ở nhịp kế
      return
    }
    if (this.stage !== 'closed') {
      this.stage = 'closed'
      this.note ??= 'Mất kết nối tới máy chủ'
    }
    this.changed()
  }

  private hello(): void {
    this.send({ t: 'hello', proto: PROTO, info: this.info })
  }

  private lose(): void {
    this.lostAt = this.now()
    this.note = 'Mất kết nối tới máy chủ — đang nối lại…'
    this.changed()
  }
}
