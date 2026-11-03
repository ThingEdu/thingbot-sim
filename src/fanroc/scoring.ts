// Tính điểm FANROC: hàm thuần theo bảng điểm của luật (B.4.2, B.4.3).
import type { Alliance } from './layout.ts'

export type Park = 'full' | 'partial' | null

export interface FieldTally {
  /** Khu Chữa Cháy: o = cam (đúng, +5), g = xanh (sai vị trí, -3). */
  fire: { o: number; g: number }
  /** mtn[núi][rãnh 0..2]: g = Mầm Cây xanh, o = cam (sai vị trí). Bóng xanh tầng trang trí đã gộp vào rãnh 0. */
  mtn: { g: number; o: number }[][]
  /** Cờ đã cắm trên từng núi. */
  flags: boolean[]
  parks: Record<Alliance, Park[]>
}

export type ScoreBreakdown = {
  fire: number; r1: number; r2: number; r3: number; flag: number; park: number; wrong: number; total: number
}

export function scoreTally(t: FieldTally): ScoreBreakdown {
  const b: ScoreBreakdown = { fire: t.fire.o * 5, r1: 0, r2: 0, r3: 0, flag: 0, park: 0, wrong: 0, total: 0 }
  let wrong = t.fire.g
  t.mtn.forEach((tiers, m) => {
    b.r1 += tiers[0].g * 5
    b.r2 += tiers[1].g * 10
    b.r3 += tiers[2].g * 15
    wrong += tiers[0].o + tiers[1].o + tiers[2].o
    if (t.flags[m]) b.flag += tiers.every((x) => x.g > 0) ? 40 : 20
  })
  for (const a of ['red', 'blue'] as const) {
    const p = t.parks[a]
    for (const x of p) b.park += x === 'full' ? 10 : x === 'partial' ? 5 : 0
    if (p.length === 2 && p.every((x) => x === 'full')) b.park += 10
  }
  b.wrong = 0 - 3 * wrong // "0 -" để không ra -0
  b.total = b.fire + b.r1 + b.r2 + b.r3 + b.flag + b.park + b.wrong
  return b
}

/** Điểm của một đội: điểm trận - phạt, thấp nhất 0; thẻ đỏ = 0. */
export function teamScore(match: number, pen: { minor: number; yellow: number; red: boolean }): number {
  return pen.red ? 0 : Math.max(0, match - 5 * pen.minor - 10 * pen.yellow)
}
