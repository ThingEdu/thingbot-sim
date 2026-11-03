// Bố cục sân FANROC: hằng số thuần (mét), không phụ thuộc đồ hoạ hay vật lý.
// Toạ độ: gốc ở tâm sân, +x sang phải nhìn từ Khu Điều Khiển, +z về phía Khu Điều Khiển, y lên trên.

export type Alliance = 'red' | 'blue'
export type Phase = 'release' | 'play' | 'end'
/** yaw quanh trục y (kiểu three.js): 0 = hướng về -z (vào sân), dương = quay ngược chiều kim đồng hồ nhìn từ trên. */
export type Pose = { x: number; z: number; yaw: number }
export type Rect = { x0: number; x1: number; z0: number; z1: number }

// Mọi số đo sân lấy từ CAD "Lắp sân.step" (user gửi 03/11/2026); CAD thắng cả số trong văn bản luật (ruling R11).

export const FIELD = 2.4
/** Rào: mặt trong ở ±FIELD/2, dày WALL_T, đỉnh ở WALL_H. */
export const WALL_H = 0.2985
export const WALL_T = 0.025
export const BALL_R = 0.02

const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 })

/** Các vùng (vạch dán phẳng), đỏ = phía x < 0. */
export const ZONES: {
  fire: [Rect, Rect]
  start: Record<Alliance, Rect>
  load: Record<Alliance, Rect>
  safe: Record<Alliance, Rect>
} = {
  fire: [rect(-1.1969, -0.6088, -1.1969, -0.6088), rect(0.6088, 1.1969, -1.1969, -0.6088)],
  start: { red: rect(-0.6993, 0.0007, 0.8969, 1.1969), blue: rect(0.0007, 0.7007, 0.8969, 1.1969) },
  load: { red: rect(-1.197, -0.822, 0.8218, 1.1969), blue: rect(0.822, 1.197, 0.8218, 1.1969) },
  safe: { red: rect(-1.1877, -0.8127, -0.5888, -0.2138), blue: rect(0.8127, 1.1877, -0.5888, -0.2138) },
}

/**
 * 4 Ngọn Núi giống hệt nhau (một lưới CAD, xem assets/mountain-mesh.json), mỗi núi đặt tại tâm chân (x, z)
 * và xoay `yaw` quanh trục y (kiểu three.js / Rapier). Hệ núi: gốc ở tâm chân, đáy y = 0.
 */
export const MOUNTAINS: { x: number; z: number; yaw: number }[] = [
  { x: -0.3763, z: 0.3727, yaw: (-10.82 * Math.PI) / 180 }, // A
  { x: 0.3727, z: 0.378, yaw: (72.16 * Math.PI) / 180 }, // B
  { x: -0.3729, z: -0.3822, yaw: (164.18 * Math.PI) / 180 }, // C
  { x: 0.379, z: -0.3741, yaw: (-0.82 * Math.PI) / 180 }, // D
]

/** Hình bao chân núi trong hệ núi (0.414 x 0.409, tâm ở gốc). */
export const MOUNTAIN_FOOT = { hx: 0.207, hz: 0.2045 }

/**
 * Các tầng núi: `floor` = đáy rãnh, `lip` = đỉnh gờ ngoài. Tầng trang trí (decor) tính như rãnh ngay dưới nó.
 * Luật ghi 15/50/95/130 mm; CAD cho đỉnh gờ 15/50/95/125 và đáy rãnh 5/40/80/110.
 */
export const TIERS: { floor: number; lip: number; decor?: boolean }[] = [
  { floor: 0.005, lip: 0.015 },
  { floor: 0.04, lip: 0.05, decor: true },
  { floor: 0.08, lip: 0.095 },
  { floor: 0.11, lip: 0.125 },
]
/** Rãnh tính điểm (0..2) của từng tầng: tầng decor gộp vào rãnh của tầng không-decor gần nhất bên dưới. */
export const TIER_GROOVE: number[] = TIERS.map((_, k) => Math.max(0, TIERS.slice(0, k + 1).filter((t) => !t.decor).length - 1))
export const PEAK_Y = 0.16
/** Lỗ cờ Ø45, đáy phẳng sâu 30 (CAD; luật ghi 45), tâm lệch (lx, lz) so với tâm chân trong hệ núi. */
export const HOLE = { r: 0.0225, depth: 0.03, lx: 0.00143, lz: 0.00908 }

/** Đổi toạ độ hệ núi → sân (xoay yaw như three.js rotation.y rồi tịnh tiến). */
export function fromMountain(m: { x: number; z: number; yaw: number }, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(m.yaw)
  const s = Math.sin(m.yaw)
  return { x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c }
}

/** Đổi toạ độ sân → hệ núi. */
export function toMountain(m: { x: number; z: number; yaw: number }, x: number, z: number): { lx: number; lz: number } {
  const c = Math.cos(m.yaw)
  const s = Math.sin(m.yaw)
  const dx = x - m.x
  const dz = z - m.z
  return { lx: dx * c - dz * s, lz: dx * s + dz * c }
}

/** Chỉ số núi có hình bao chân chứa điểm (x, z), hoặc -1. */
export function mountainAt(x: number, z: number): number {
  return MOUNTAINS.findIndex((m) => {
    const p = toMountain(m, x, z)
    return Math.abs(p.lx) <= MOUNTAIN_FOOT.hx && Math.abs(p.lz) <= MOUNTAIN_FOOT.hz
  })
}

/** Lối bóng ra của Hộp Phân Phối: mặt trong rào phía xa, mép đáy ở cao độ y, khe rộng `width`. Hộp nằm ngoài sân. */
export const DISPENSER = { x: 0, z: -1.2005, y: 0.426, width: 0.404 }

/** Hai robot mỗi liên minh xuất phát tại tâm robot giữ chỗ trong CAD, mặt hướng vào sân (-z). */
export const START_POSES: Record<Alliance, [Pose, Pose]> = {
  red: [{ x: -0.5372, z: 1.0509, yaw: 0 }, { x: -0.1808, z: 1.0528, yaw: 0 }],
  blue: [{ x: 0.1867, z: 1.0557, yaw: 0 }, { x: 0.5085, z: 1.055, yaw: 0 }],
}
