// Thư giữa máy BTC và điện thoại trọng tài / màn chiếu (qua bộ chuyển thư btc.rs). Chỉ kiểu, không có logic.
import type { ScoreBreakdown } from '../scoring.ts'
import type { HalfSheet, Live, Pens, Side } from './event.ts'

/** Khách ⇒ BTC. `sheet` là toàn bộ nửa sân (không phải phần thay đổi) nên gửi lại an toàn. */
export type ClientMsg =
  | { t: 'join'; role: 'ref'; field: number; side: Side; code: string; device: string }
  | { t: 'join'; role: 'screen'; field: number }
  | { t: 'op'; device: string; seq: number; field: number; side: Side; matchId: string /* trận đang ghi (RefView.match.id) */; sheet: HalfSheet; submit: boolean }

/** BTC ⇒ trọng tài giữ ghế. `clock` = giây còn lại (chỉ khi đang 'play'); `ackSeq` = seq cuối BTC đã nhận của máy này. */
export type RefView = {
  t: 'ref'; field: number; side: Side
  match: { id: string; teams: [string, string] /* tên đội liên minh mình; ghế trống = '' */ } | null
  phase: Live['phase'] | 'idle'; clock: number | null; sheet: HalfSheet; ackSeq: number
}

/** BTC ⇒ màn chiếu của một sân. */
export type ScreenView = {
  t: 'screen'; field: number; teams: Record<Side, string[]> /* luôn 2 phần tử theo ghế, '' = ghế trống */; phase: Live['phase'] | 'idle'; clock: number | null
  score: ScoreBreakdown; pens: Record<Side, Pens[]>; refs: Record<Side, 'off' | 'on' | 'sent'>
  official: { side: Side; seat: 0 | 1; name: string; score: number }[] | null
  next: { teams: Record<Side, string[]>; time: string } | null
  ranking: { rank: number; name: string; total: number }[]
}

/** Số sân hiện trên trang chọn sân (trọng tài / màn chiếu). */
export const FIELD_PICKER = 4

export type Deny = { t: 'deny'; reason: 'code' | 'taken' | 'waiting' }

export type BtcView = RefView | ScreenView | Deny
