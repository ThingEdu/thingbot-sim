// Tính điểm FANROC luật V4: hàm thuần. Điểm nhiệm vụ (bóng, cờ, bóng sai chỗ) nhân hệ số leo Thang Cứu Hỏa.
import type { Alliance } from './layout.ts'
import { CLIMB_PCT, type Climb } from './ladder.ts'

export interface FieldTally {
  /** Khu Chữa Cháy: o = cam (đúng, +5), g = xanh (sai vị trí, -3). */
  fire: { o: number; g: number }
  /** mtn[núi][rãnh 0..2]: g = Mầm Cây xanh, o = cam (sai vị trí). Tầng trang trí không thuộc rãnh nào. */
  mtn: { g: number; o: number }[][]
  /** Tổng bóng cam ở tầng trang trí của mọi núi (−3 mỗi bóng); bóng xanh ở tầng trang trí không tính. */
  decorO: number
  /** Cờ đã cắm trên từng núi. */
  flags: boolean[]
  /** Mức leo đã xét đúng thanh: climbs[liên minh][ô robot]; robot bám thanh của liên minh kia là 'none'. */
  climbs: Record<Alliance, Climb[]>
}

export type ScoreBreakdown = {
  fire: number; r1: number; r2: number; r3: number; flag: number; wrong: number
  /** Điểm nhiệm vụ = bóng + cờ + bóng sai chỗ, có thể âm. */
  mission: number
  /** Hệ số nhân theo phần trăm (100…180), số nguyên để không lệch số thực. */
  multPct: number
  /** Điểm trận = ⌈mission × multPct / 100⌉ khi mission > 0; mission ≤ 0 thì giữ nguyên. */
  total: number
}

export function scoreTally(t: FieldTally): ScoreBreakdown {
  const b: ScoreBreakdown = { fire: t.fire.o * 5, r1: 0, r2: 0, r3: 0, flag: 0, wrong: 0, mission: 0, multPct: 100, total: 0 }
  let wrong = t.fire.g + t.decorO
  t.mtn.forEach((tiers, m) => {
    b.r1 += tiers[0].g * 5
    b.r2 += tiers[1].g * 10
    b.r3 += tiers[2].g * 15
    wrong += tiers[0].o + tiers[1].o + tiers[2].o
    if (t.flags[m]) b.flag += tiers.every((x) => x.g > 0) ? 40 : 20
  })
  b.wrong = 0 - 3 * wrong // "0 -" để không ra -0
  b.mission = b.fire + b.r1 + b.r2 + b.r3 + b.flag + b.wrong
  for (const c of [...t.climbs.red, ...t.climbs.blue]) b.multPct += CLIMB_PCT[c]
  // Tích mission × multPct là số nguyên; chia 100 rồi làm tròn lên cho đúng (31775 / 100 → 318).
  // Điểm nhiệm vụ âm: luật không nói — chỉ nhân hệ số khi dương (spec "Tính điểm").
  b.total = b.mission > 0 ? Math.ceil((b.mission * b.multPct) / 100) : b.mission
  return b
}

/**
 * Phần trăm → số thập phân dấu phẩy kiểu Việt: 155 ⇒ "1,55"; `sign` ⇒ số có dấu "+0,05" / "−0,20" (dấu trừ U+2212), 0 ⇒ "0".
 * Tính bằng số nguyên (multPct là số nguyên) để không lệch số thực. Dùng chung cho bảng điểm và thẻ Luật chơi.
 */
export function pctText(pct: number, sign = false): string {
  const a = Math.abs(pct)
  const s = `${Math.floor(a / 100)},${String(a % 100).padStart(2, '0')}`
  return sign ? (pct > 0 ? `+${s}` : pct < 0 ? `−${s}` : '0') : s
}

/** Điểm của một đội: điểm trận - phạt, thấp nhất 0; thẻ đỏ = 0. */
export function teamScore(match: number, pen: { minor: number; yellow: number; red: boolean }): number {
  return pen.red ? 0 : Math.max(0, match - 5 * pen.minor - 10 * pen.yellow)
}
