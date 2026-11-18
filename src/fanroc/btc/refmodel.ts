// Logic thuần của trang trọng tài: ghép phiếu máy với khung nhìn BTC, sửa bộ đếm, thêm / xoá lỗi.
// Mọi phiếu sinh ra đều qua được sanitizeSheet (BTC bỏ im lặng phiếu sai).
import type { HalfSheet } from './event.ts'
import { MAX_BALLS, MAX_FAULT_CODE, MAX_FAULTS, MAX_PENS } from './validate.ts'

export type FaultKind = HalfSheet['faults'][number]['kind']

/**
 * Khung nhìn BTC tới: giải khác / trận khác (hoặc hết trận) ⇒ lấy phiếu BTC, bỏ bản chờ; cùng trận mà không có bản chờ hoặc BTC đã
 * nhận bản chờ (ackSeq ≥ seq) ⇒ lấy phiếu BTC (ack nếu có bản chờ); còn lại giữ phiếu máy và gửi lại bản chờ.
 */
export function reconcile(
  local: { matchId: string | null; sheet: HalfSheet },
  pending: { seq: number; matchId: string; event: string } | null,
  view: { event: string; match: { id: string } | null; sheet: HalfSheet; ackSeq: number },
): { matchId: string | null; sheet: HalfSheet; drop: boolean; ack: number | null; resend: boolean } {
  const id = view.match?.id ?? null
  if (id !== local.matchId || (pending && (pending.matchId !== id || pending.event !== view.event))) {
    return { matchId: id, sheet: view.sheet, drop: pending !== null, ack: null, resend: false }
  }
  if (!pending) return { matchId: id, sheet: view.sheet, drop: false, ack: null, resend: false }
  if (view.ackSeq >= pending.seq) return { matchId: id, sheet: view.sheet, drop: false, ack: pending.seq, resend: false }
  return { matchId: id, sheet: local.sheet, drop: false, ack: null, resend: true }
}

/** Cộng / trừ một bộ đếm bóng, kẹp trong 0..MAX_BALLS. */
export const bump = (n: number, d: number): number => Math.max(0, Math.min(MAX_BALLS, n + d))

const PEN_OF: Record<Exclude<FaultKind, 'red'>, 'warn' | 'minor' | 'yellow'> = { warn: 'warn', minor: 'minor', yellow: 'yellow' }

/** Thêm một lỗi cho đội `team` (0/1 theo liên minh mình) và tăng bộ đếm phạt; vượt giới hạn ⇒ null. */
export function addFault(s: HalfSheet, team: 0 | 1, code: string, kind: FaultKind, at: number): HalfSheet | null {
  if (s.faults.length >= MAX_FAULTS || code.length > MAX_FAULT_CODE) return null
  const out = structuredClone(s)
  const p = out.pens[team]
  if (kind === 'red') p.red = true
  else {
    const k = PEN_OF[kind]
    if (p[k] >= MAX_PENS) return null
    p[k] += 1
  }
  out.faults.push({ team, code, kind, at })
  return out
}

/** Xoá lỗi thứ `i` và trả lại bộ đếm phạt; thẻ đỏ còn khi đội vẫn còn lỗi thẻ đỏ khác. */
export function removeFault(s: HalfSheet, i: number): HalfSheet {
  const f = s.faults[i]
  if (!f) return s
  const out = structuredClone(s)
  out.faults.splice(i, 1)
  const p = out.pens[f.team]
  if (f.kind === 'red') p.red = out.faults.some((x) => x.team === f.team && x.kind === 'red')
  else p[PEN_OF[f.kind]] = Math.max(0, p[PEN_OF[f.kind]] - 1)
  return out
}
