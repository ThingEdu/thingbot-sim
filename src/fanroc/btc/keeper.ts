// Giữ máy chủ BTC + đường nối của trang BTC (thuần, không DOM): mở một lần rồi chạy suốt, KHÔNG phụ thuộc màn Ban tổ
// chức đang hiện hay ẩn (rời màn chỉ ẩn giao diện). Chỉ dừng khi BTC bấm «Dừng máy chủ giải» (hoặc tắt app).
// `reconnect()` đóng rồi mở lại đường nối: bộ chuyển gửi `nobtc` nên mọi điện thoại / màn chiếu tự vào lại (sau Mở file).
import type { BtcLink } from './link.ts'

export type ServerInfo = { url: string; addrs: string[]; port: number }

export interface KeeperDeps {
  start(): Promise<ServerInfo>
  stop(): Promise<void>
  connect(url: string): Promise<BtcLink>
  /** Gắn onMessage / onPeer cho đường nối mới. */
  wire(l: BtcLink): void
  /** Trạng thái đổi (vẽ lại dòng trạng thái / mục Kết nối). */
  changed(): void
  later(fn: () => void, ms: number): unknown
  cancel(h: unknown): void
}

/** Chờ trước khi nối lại sau `reconnect()` (để bộ chuyển kịp bỏ BTC cũ, không từ chối BTC mới). */
export const RECONNECT_MS = 500
export const RETRY_MS = 2000

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export class BtcKeeper {
  server: ServerInfo | null = null
  link: BtcLink | null = null
  note: string | null = null
  /** Đã mở và chưa bấm Dừng. */
  running = false
  private busy = false
  private retryH: unknown = null
  private gen = 0 // tăng mỗi lần dừng: kết quả start / connect của lần chạy trước bị bỏ
  private deps: KeeperDeps

  constructor(deps: KeeperDeps) {
    this.deps = deps
  }

  /** Mở máy chủ + nối (không làm gì nếu đang chạy). */
  ensure(): void {
    if (this.running) return
    this.running = true
    void this.connect()
  }

  /** Dừng hẳn máy chủ giải (nút «Dừng máy chủ giải»). */
  async stop(): Promise<void> {
    this.running = false
    this.gen += 1
    this.clearRetry()
    const l = this.link
    this.link = null
    l?.close()
    this.server = null
    this.note = null
    this.deps.changed()
    await this.deps.stop()
  }

  /** Đóng rồi nối lại đường nối BTC: mọi khách nhận `nobtc` rồi tự vào lại. Máy chủ vẫn chạy. */
  reconnect(): void {
    if (!this.running) return
    const l = this.link
    this.link = null
    l?.close()
    this.deps.changed()
    this.clearRetry()
    this.retry(RECONNECT_MS)
  }

  private clearRetry(): void {
    if (this.retryH !== null) this.deps.cancel(this.retryH)
    this.retryH = null
  }

  private retry(ms = RETRY_MS): void {
    if (!this.running || this.retryH !== null) return
    this.retryH = this.deps.later(() => {
      this.retryH = null
      void this.connect()
    }, ms)
  }

  private async connect(): Promise<void> {
    if (!this.running || this.link || this.busy) return
    this.busy = true
    const g = this.gen
    try {
      if (!this.server) {
        const sv = await this.deps.start()
        if (g !== this.gen) return
        this.server = sv
      }
      const l = await this.deps.connect(this.server.url)
      if (g !== this.gen || !this.running) {
        l.close()
        return
      }
      this.link = l
      this.note = null
      this.deps.wire(l)
      l.onReject = () => void (this.note = 'đã có máy Ban tổ chức khác đang điều hành (chỉ một máy được điều hành)')
      l.onClose = () => {
        if (this.link !== l) return
        this.link = null
        this.note ??= 'mất kết nối, đang nối lại…'
        this.deps.changed()
        this.retry()
      }
    } catch (e) {
      if (g === this.gen) {
        this.note = msg(e)
        this.retry()
      }
    } finally {
      this.busy = false
      this.deps.changed()
    }
  }
}
