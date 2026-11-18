// Phiếu hai nửa sân ⇒ điểm trận, chỉ qua scoreTally / teamScore / penaltyPoints có sẵn. Không tự chế công thức.
// Phần không cần penaltyPoints (ghép nửa sân, điểm tạm) ở half.ts để trang trọng tài không kéo quickmatch / vật lý.
import { teamScore } from '../scoring.ts'
import { penaltyPoints } from '../quickmatch.ts'
import type { EMatch, Pens, Result } from './event.ts'
import { liveScore } from './half.ts'

export { HALF_MTN, halfScore, liveScore, mergeTally } from './half.ts'

/** Điểm từng đội của trận (bỏ ghế trống): đỏ0, đỏ1, xanh0, xanh1. Phạt chỉ lấy từ pens; faults là nhật ký, warn không đổi điểm. */
export function teamPoints(r: Result, m: EMatch): { id: string; score: number; penalty: number; pens: Pens }[] {
  const total = liveScore(r.red, r.blue).total
  const out: { id: string; score: number; penalty: number; pens: Pens }[] = []
  for (const [side, seats] of [['red', m.red], ['blue', m.blue]] as const) {
    seats.forEach((id, k) => {
      if (id === null) return
      const pens = r[side].pens[k]
      out.push({ id, score: teamScore(total, pens), penalty: penaltyPoints(pens, total), pens })
    })
  }
  return out
}
