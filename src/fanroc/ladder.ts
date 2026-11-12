// Thang Cứu Hỏa (luật V4): hình học thanh xà nhìn từ trên + máy trạng thái leo. Thuần số học, không đồ hoạ/vật lý.
import { FIELD, LADDER, LADDERS, type Alliance } from './layout.ts'

/** none = chưa chạm; contact = móc giơ đang chạm thanh; ground/water = đang treo ở đoạn Mặt Đất/Nước. */
export type Climb = 'none' | 'contact' | 'ground' | 'water'

/** Móc: ≥ upDeg là giơ, ≤ downDeg là hạ (độ); tol = sai số ngang (m); slideV = tốc độ trượt (m/s) ở drive = 1;
 *  gap = khoảng cách tối thiểu giữa hai robot treo; end = chừa ở hai đầu thanh; hangY = độ rủ của thân robot khi treo (m). */
export const HOOK = { upDeg: 150, downDeg: 30, tol: 0.06, slideV: 0.15, gap: 0.3, end: 0.05, hangY: 0.12 }

/**
 * Tên cổng của móc (bảng cổng / thẻ robot). Móc là cần lò xo (anh Tuấn 12/11): lúc xuất phát cần gập, cài chốt trong thân;
 * servo quay tới 180° nhả chốt, lò xo bật MÓC lên trên thanh; servo về 0° là tời cuốn móc xuống, kéo robot lên xà.
 * Luật RC04 cấm lò xo bắn ROBOT lên thanh: lò xo ở đây chỉ nâng móc (vài chục gam), robot lên xà là do tời / servo kéo.
 */
export const HOOK_LABEL = 'Móc leo xà (lò xo bật móc)'

/**
 * Hình móc (vẽ bằng khối, chưa có CAD; anh Tuấn 12/11: không được có cơ cấu thò ra ngoài khung lúc xuất phát): cần ống lồng
 * THẲNG ĐỨNG ở tâm nóc xe, đầu chữ J. `reach` = thanh ngang của chữ J vươn ra khỏi trục cần, `t` = dày thanh ngang,
 * `drop` = nhánh rủ xuống của chữ J.
 */
export const HOOK_TIP = { reach: 0.044, t: 0.008, drop: 0.03 }

/**
 * Độ cao đỉnh móc (mặt trên thanh ngang chữ J) trong hệ thân xe (gốc ở đáy thân), m — nguồn chung cho hình 3D và R01.
 * - Đứng sàn: cần lồng rút hết ở 0° (đỉnh móc ngang nóc `h`, không cao hơn), duỗi dần theo góc servo, từ `HOOK.upDeg` trở
 *   lên thì đỉnh móc cao hơn trục thanh xà 3 cm.
 * - Đang treo (thân rủ ở `HOOK.hangY`): cần dài đúng từ nóc thân tới trục thanh xà, thanh ngang chữ J nằm trên trục thanh.
 * Cần không bao giờ nằm ngang nên móc luôn ở trong khung w × l (nhìn từ trên chỉ thò `HOOK_TIP.reach` khỏi tâm).
 */
export function hookTop(def: { size: { h: number } }, deg: number, hanging: boolean): number {
  const { h } = def.size
  if (hanging) return LADDER.y - HOOK.hangY + HOOK_TIP.t / 2
  const frac = Math.max(0, Math.min(1, deg / HOOK.upDeg))
  return h + frac * (LADDER.y + 0.03 - h)
}

/**
 * Móc lò xo theo thời gian (hình 3D): `latched` = cần đang gập, cài chốt trong thân; `top` = độ cao đỉnh móc như `hookTop`.
 * - Cài chốt: đỉnh móc ở nóc xe, servo dưới HOOK.upDeg không làm gì (chốt chưa nhả).
 * - Servo ≥ HOOK.upDeg: nhả chốt, lò xo bật móc lên nhanh (HOOK_SPRING_V) tới độ cao dây tời đang cho phép.
 * - Servo hạ dần: tời cuốn dây, kéo móc xuống (HOOK_WINCH_V) theo góc servo; về tới nóc với servo ≤ HOOK.downDeg là cài chốt lại.
 * - Đang treo: cần dài đúng tới trục thanh (tời kéo robot lên — vật lý leo ở stepClimb, không do lò xo).
 */
export type HookState = { latched: boolean; top: number }
/** Tốc độ lò xo bật móc / tời cuốn móc xuống (m/s, chỉ để vẽ). */
export const HOOK_SPRING_V = 3
export const HOOK_WINCH_V = 1

export function stepHook(st: HookState, def: { size: { h: number } }, deg: number, hanging: boolean, dt: number): HookState {
  const h = def.size.h
  if (hanging) return { latched: false, top: hookTop(def, deg, true) }
  let latched = st.latched
  if (latched && deg >= HOOK.upDeg) latched = false
  if (latched) return { latched, top: h }
  const target = hookTop(def, deg, false)
  const top = target > st.top ? Math.min(target, st.top + HOOK_SPRING_V * dt) : Math.max(target, st.top - HOOK_WINCH_V * dt)
  return { latched: deg <= HOOK.downDeg && top <= h + 1e-9, top }
}

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

/** Đoạn chỗ bám [min, max] mà thân treo nằm trọn trong sân; min > max khi không có chỗ nào. */
export type SlideRange = { min: number; max: number }

/**
 * Đoạn chỗ bám s trên thanh `al` mà thân treo (quay theo thanh, mũi từ a sang b) nằm trọn trong mặt trong rào: hình chữ nhật
 * dài `front` tới trước tâm, `back` ra sau tâm, rộng `half` mỗi bên (cùng cách tính như RobotBody.footprint). Hộp Phân Phối
 * và hai cột đều ngoài sân / ở hai đầu thanh nên trong sân là đủ: cột, rào và hộp là vật rắn, thân treo không trượt xuyên qua.
 */
export function slideRange(al: Alliance, front: number, back: number, half: number): SlideRange {
  const { a } = LADDERS[al]
  const yaw = barYaw(al)
  const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) }
  const r = { x: Math.cos(yaw), z: -Math.sin(yaw) }
  const len = ladderLen(al)
  const u = { x: (LADDERS[al].b.x - a.x) / len, z: (LADDERS[al].b.z - a.z) / len }
  const H = FIELD / 2
  let min = -Infinity
  let max = Infinity
  for (const da of [front, -back]) {
    for (const db of [half, -half]) {
      for (const k of ['x', 'z'] as const) {
        // −H ≤ a + u s + f da + r db ≤ H theo trục k.
        const c = a[k] + f[k] * da + r[k] * db
        if (Math.abs(u[k]) < 1e-12) {
          if (Math.abs(c) > H) return { min: 1, max: 0 }
          continue
        }
        const s1 = (-H - c) / u[k]
        const s2 = (H - c) / u[k]
        min = Math.max(min, Math.min(s1, s2))
        max = Math.min(max, Math.max(s1, s2))
      }
    }
  }
  return { min, max }
}

const BARS: Alliance[] = ['red', 'blue']

/**
 * Một bước leo. drive −1…1 (trung bình bánh, dương = tiến); others = robot khác đang treo; range(bar) = đoạn chỗ bám mà
 * thân robot này treo trên thanh `bar` vẫn nằm trọn trong sân (slideRange; bỏ trống = cả thanh).
 * - Đang treo: trượt không ra khỏi đoạn đó (rào / Hộp Phân Phối / cột chặn). Nếu đang ở ngoài đoạn (vừa vươn cơ cấu ra khi
 *   treo sát đầu) thì đứng yên chỗ cũ, chỉ được trượt vào trong — không tự đẩy thân đi.
 * - Bám từ sàn ngoài đoạn đó (vd. đứng chéo sát rào): vẫn bám, chỗ bám dời vào đầu gần nhất của đoạn.
 */
export function stepClimb(
  st: ClimbState,
  inp: {
    hookDeg: number | null; lastHookDeg: number; x: number; z: number; drive: number; dt: number; others: { bar: Alliance; s: number }[]
    range?: (bar: Alliance) => SlideRange
  },
): ClimbState {
  const { hookDeg, lastHookDeg, others } = inp
  if (st.mode === 'hang' && st.bar) {
    if (hookDeg !== null && hookDeg >= HOOK.upDeg) return { mode: 'floor', bar: null, s: 0 }
    const len = ladderLen(st.bar)
    const rg = inp.range?.(st.bar)
    const lo = Math.max(HOOK.end, rg ? Math.min(rg.min, st.s) : -Infinity)
    const hi = Math.min(len - HOOK.end, rg ? Math.max(rg.max, st.s) : Infinity)
    let ns = Math.min(hi, Math.max(lo, st.s + inp.drive * HOOK.slideV * inp.dt))
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
        const rg = inp.range?.(bar)
        const s = rg && rg.min <= rg.max ? Math.min(rg.max, Math.max(rg.min, p.s)) : p.s
        return { mode: 'hang', bar, s }
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
