// Hàng chờ gửi của điện thoại trọng tài: chỉ giữ bản mới nhất chưa được BTC nhận (phiếu là cả nửa sân, gửi lại an toàn).
// seq tăng dần và còn sau khi tải lại trang (lưu localStorage); kho hỏng / bị chặn thì chạy trong bộ nhớ.
import type { HalfSheet, Side } from './event.ts'
import { sanitizeSheet } from './validate.ts'

/** `event` = id giải (EventState.id) lúc ghi: khung nhìn của giải khác ⇒ bỏ bản chờ (cùng mã trận vẫn không lẫn). */
export type Pending = { seq: number; matchId: string; sheet: HalfSheet; submit: boolean; event: string }
type Store = Pick<Storage, 'getItem' | 'setItem'>

export const refKey = (field: number, side: Side) => `fanroc.v1.btc.ref.${field}.${side}`

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

export class RefQueue {
  private seq = 0
  private wait: Pending | null = null
  private store: Store
  private key: string

  constructor(store: Store, key: string) {
    this.store = store
    this.key = key
    try {
      const o: unknown = JSON.parse(store.getItem(key) ?? 'null')
      if (isObj(o)) {
        if (Number.isSafeInteger(o.seq) && (o.seq as number) > 0) this.seq = o.seq as number
        const p = o.pending
        // phiếu chờ trong kho cũng phải qua sanitizeSheet (kho có thể bị sửa / hỏng); sai ⇒ bỏ bản chờ, seq vẫn giữ
        const sheet = isObj(p) ? sanitizeSheet(p.sheet) : null
        if (isObj(p) && Number.isSafeInteger(p.seq) && typeof p.matchId === 'string' && sheet && typeof p.submit === 'boolean' && typeof p.event === 'string') {
          this.wait = { seq: p.seq as number, matchId: p.matchId, sheet, submit: p.submit, event: p.event }
        }
        if (isObj(p) && Number.isSafeInteger(p.seq)) this.seq = Math.max(this.seq, p.seq as number)
      }
    } catch {
      // kho hỏng: bắt đầu lại từ 0
    }
  }

  /** Thêm bản mới (thay bản chờ cũ). Bản "Gửi kiểm kê" chưa được nhận thì bản sửa sau vẫn giữ cờ gửi. */
  push(matchId: string, sheet: HalfSheet, submit: boolean, event: string): { seq: number } {
    this.seq += 1
    const keep = this.wait !== null && this.wait.matchId === matchId && this.wait.event === event && this.wait.submit
    this.wait = { seq: this.seq, matchId, sheet: structuredClone(sheet), submit: submit || keep, event }
    this.save()
    return { seq: this.seq }
  }

  pending(): Pending | null {
    return this.wait ? structuredClone(this.wait) : null
  }

  /** BTC đã nhận tới `seq`: bỏ bản chờ nếu nó không mới hơn. */
  ack(seq: number): void {
    if (this.wait && this.wait.seq <= seq) {
      this.wait = null
      this.save()
    }
  }

  /** Bỏ bản chờ (trận đã đổi). seq giữ nguyên. */
  drop(): void {
    if (!this.wait) return
    this.wait = null
    this.save()
  }

  /** BTC đã thấy seq `n` từ máy này (vd. ghế khác cùng máy): seq tiếp theo phải lớn hơn. */
  floor(n: number): void {
    if (!Number.isSafeInteger(n) || n <= this.seq) return
    this.seq = n
    this.save()
  }

  private save(): void {
    try {
      this.store.setItem(this.key, JSON.stringify({ seq: this.seq, pending: this.wait }))
    } catch {
      // đầy / bị chặn: vẫn chạy trong bộ nhớ
    }
  }
}
