// Thang Cứu Hỏa (luật V4): hình học thanh xà nhìn từ trên + máy trạng thái leo. Thuần số học, không đồ hoạ/vật lý.
import { LADDER, LADDERS, type Alliance } from './layout.ts'

/** none = chưa chạm; contact = móc giơ đang chạm thanh; ground/water = đang treo ở đoạn Mặt Đất/Nước. */
export type Climb = 'none' | 'contact' | 'ground' | 'water'

/** Móc: ≥ upDeg là giơ, ≤ downDeg là hạ (độ); tol = sai số ngang (m); slideV = tốc độ trượt (m/s) ở drive = 1;
 *  gap = khoảng cách tối thiểu giữa hai robot treo; end = chừa ở hai đầu thanh; hangY = độ rủ của thân robot khi treo (m). */
export const HOOK = { upDeg: 150, downDeg: 30, tol: 0.06, slideV: 0.15, gap: 0.3, end: 0.05, hangY: 0.12 }

/** % điểm leo của mỗi mức. */
export const CLIMB_PCT: Record<Climb, number> = { none: 0, contact: 5, ground: 10, water: 20 }

export function ladderLen(al: Alliance): number {
  const { a, b } = LADDERS[al]
  return Math.hypot(b.x - a.x, b.z - a.z)
}

/** s = khoảng cách dọc thanh tính từ đầu a (có thể ngoài [0, len]); d = khoảng cách vuông góc tới đường thẳng (nhìn từ trên). */
export function project(al: Alliance, x: number, z: number): { s: number; d: number } {
  const { a, b } = LADDERS[al]
  const len = ladderLen(al)
  const ux = (b.x - a.x) / len
  const uz = (b.z - a.z) / len
  const px = x - a.x
  const pz = z - a.z
  return { s: px * ux + pz * uz, d: Math.abs(px * uz - pz * ux) }
}

export function pointAt(al: Alliance, s: number): { x: number; z: number } {
  const { a, b } = LADDERS[al]
  const t = s / ladderLen(al)
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
}

/** yaw (kiểu three.js, 0 = hướng -z; mũi xe = (-sin yaw, -cos yaw)) để mũi xe hướng từ a sang b. */
export function barYaw(al: Alliance): number {
  const { a, b } = LADDERS[al]
  return Math.atan2(-(b.x - a.x), -(b.z - a.z))
}

export interface ClimbState { mode: 'floor' | 'hang'; bar: Alliance | null; s: number }

const BARS: Alliance[] = ['red', 'blue']

/** Một bước leo. drive −1…1 (trung bình bánh, dương = tiến); others = robot khác đang treo. */
export function stepClimb(
  st: ClimbState,
  inp: { hookDeg: number | null; lastHookDeg: number; x: number; z: number; drive: number; dt: number; others: { bar: Alliance; s: number }[] },
): ClimbState {
  const { hookDeg, lastHookDeg, others } = inp
  if (st.mode === 'hang' && st.bar) {
    if (hookDeg !== null && hookDeg >= HOOK.upDeg) return { mode: 'floor', bar: null, s: 0 }
    const len = ladderLen(st.bar)
    let ns = Math.min(len - HOOK.end, Math.max(HOOK.end, st.s + inp.drive * HOOK.slideV * inp.dt))
    for (const o of others) {
      if (o.bar !== st.bar) continue
      // chỉ chặn khi đang tiến lại gần: đã sát nhau sẵn (lúc bám) thì vẫn được lùi ra xa
      if (Math.abs(ns - o.s) < HOOK.gap && Math.abs(ns - o.s) < Math.abs(st.s - o.s)) {
        ns = Math.abs(st.s - o.s) < HOOK.gap ? st.s : o.s + Math.sign(st.s - o.s) * HOOK.gap
      }
    }
    return { mode: 'hang', bar: st.bar, s: ns }
  }
  // floor: bám khi móc vừa chuyển từ giơ xuống hạ ngay trên đoạn Mặt Đất của thanh còn chỗ
  if (hookDeg !== null && lastHookDeg >= HOOK.upDeg && hookDeg <= HOOK.downDeg) {
    for (const bar of BARS) {
      const p = project(bar, inp.x, inp.z)
      if (p.d <= HOOK.tol && p.s >= 0 && p.s <= LADDER.divider && others.filter((o) => o.bar === bar).length < 2) {
        return { mode: 'hang', bar, s: p.s }
      }
    }
  }
  return st
}

/** Mức leo hiện tại: treo → Mặt Đất/Nước theo s; đứng sàn mà móc giơ chạm thanh → contact. */
export function climbOf(st: ClimbState, hookDeg: number, x: number, z: number): { level: Climb; bar: Alliance | null } {
  if (st.mode === 'hang' && st.bar) return { level: st.s > LADDER.divider + 0.01 ? 'water' : 'ground', bar: st.bar }
  if (hookDeg >= HOOK.upDeg) {
    for (const bar of BARS) {
      const p = project(bar, x, z)
      if (p.d <= HOOK.tol && p.s >= 0 && p.s <= ladderLen(bar)) return { level: 'contact', bar }
    }
  }
  return { level: 'none', bar: null }
}
