// Ghép hai phiếu nửa sân thành sân đầy đủ và tính điểm tạm, chỉ qua scoreTally có sẵn. Nhẹ (không kéo quickmatch /
// vật lý) để trang trọng tài trên điện thoại dùng được; sheet.ts xuất lại các tên này.
import { scoreTally, type FieldTally, type ScoreBreakdown } from '../scoring.ts'
import { emptySheet, type HalfSheet, type Side } from './event.ts'

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

/** "Điểm tạm nửa mình" trên điện thoại: nửa kia coi như rỗng. */
export function halfScore(h: HalfSheet, side: Side): ScoreBreakdown {
  return side === 'red' ? liveScore(h, undefined) : liveScore(undefined, h)
}
