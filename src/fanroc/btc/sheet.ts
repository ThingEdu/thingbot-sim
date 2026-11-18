// Phiếu hai nửa sân ⇒ điểm trận, chỉ qua scoreTally / teamScore / penaltyPoints có sẵn. Không tự chế công thức.
import { scoreTally, teamScore, type FieldTally, type ScoreBreakdown } from '../scoring.ts'
import { penaltyPoints } from '../quickmatch.ts'
import { emptySheet, type EMatch, type HalfSheet, type Pens, type Result, type Side } from './event.ts'

/** Núi nằm ở nửa sân của mỗi bên (layout.ts MOUNTAINS: A, C ở x<0 = Đỏ; B, D ở x>0 = Xanh). */
export const HALF_MTN: Record<Side, [number, number]> = { red: [0, 2], blue: [1, 3] }

/** Ghép hai phiếu nửa sân thành một sân đầy đủ. */
export function mergeTally(red: HalfSheet, blue: HalfSheet): FieldTally {
  const mtn: FieldTally['mtn'] = [[], [], [], []]
  const flags: boolean[] = [false, false, false, false]
  for (const [side, h] of [['red', red], ['blue', blue]] as const) {
    HALF_MTN[side].forEach((m, k) => {
      mtn[m] = h.mtn[k].map((x) => ({ ...x }))
      flags[m] = h.flags[k]
    })
  }
  return {
    fire: { o: red.fire.o + blue.fire.o, g: red.fire.g + blue.fire.g },
    mtn,
    decorO: red.decorO + blue.decorO,
    flags,
    climbs: { red: [...red.climbs], blue: [...blue.climbs] },
  }
}

/** Điểm đang có; nửa chưa có phiếu coi như rỗng. */
export function liveScore(red?: HalfSheet, blue?: HalfSheet): ScoreBreakdown {
  return scoreTally(mergeTally(red ?? emptySheet(), blue ?? emptySheet()))
}

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

/** "Điểm tạm nửa mình" trên điện thoại: nửa kia coi như rỗng. */
export function halfScore(h: HalfSheet, side: Side): ScoreBreakdown {
  return side === 'red' ? liveScore(h, undefined) : liveScore(undefined, h)
}
