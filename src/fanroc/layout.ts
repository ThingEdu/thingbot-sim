// Bố cục sân FANROC: hằng số thuần (mét), không phụ thuộc đồ hoạ hay vật lý.
// Toạ độ: gốc ở tâm sân, +x sang phải nhìn từ Khu Điều Khiển, +z về phía Khu Điều Khiển, y lên trên.

export type Alliance = 'red' | 'blue'
export type Phase = 'release' | 'play' | 'end'
/** yaw quanh trục y (kiểu three.js): 0 = hướng về -z (vào sân), dương = quay ngược chiều kim đồng hồ nhìn từ trên. */
export type Pose = { x: number; z: number; yaw: number }
export type Rect = { x0: number; x1: number; z0: number; z1: number }

/** Thời gian trận (giây): 10 s xả bóng, 180 s thi đấu (luật V4 bỏ End Game). Dùng chung cho trận, bảng điểm, agent. */
export const RELEASE_S = 10
export const MATCH_S = 180

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
  ladder: Record<Alliance, Rect>
} = {
  fire: [rect(-1.1969, -0.6088, -1.1969, -0.6088), rect(0.6088, 1.1969, -1.1969, -0.6088)],
  start: { red: rect(-0.6993, 0.0007, 0.8969, 1.1969), blue: rect(0.0007, 0.7007, 0.8969, 1.1969) },
  load: { red: rect(-1.197, -0.822, 0.8218, 1.1969), blue: rect(0.822, 1.197, 0.8218, 1.1969) },
  ladder: { red: rect(-1.1877, -0.8127, -0.5888, -0.2138), blue: rect(0.8127, 1.1877, -0.5888, -0.2138) },
}

/**
 * Thang Cứu Hỏa: thanh xà tròn của mỗi liên minh, nằm trên rào, chạy từ `a` (đầu rào bên cạnh ô Bảo Vệ) tới `b` (đầu
 * Hộp Phân Phối). Đoạn từ `a` tới `divider` là Mặt Đất, phần còn lại là Nước.
 * Kích thước lấy từ CAD "Full sân Fanroc" (12/11/2026): thanh = Part 38 (ống Ø20 dày 2 mm, dài 1,400 m giữa tâm hai cột,
 * trục cao 0,6575 m), cột = Part 34 (nhôm hộp 20×20, cao 0,638 m), kẹp đầu cột = Part 37 (trụ Ø35 cao 65 mm, y 0,608…0,673).
 * CAD là các chi tiết rời nên vị trí đặt theo Hình 1 của luật: cột phía Hộp Phân Phối (∓0,202; −1,19) sát mép hộp, cột phía rào
 * (∓1,19; −0,198). Vạch Đất/Nước = chỗ thanh cắt mép Khu Chữa Cháy (z = −0,6088), tính từ hình học, không gõ tay
 * (số "khoảng 430 / 870 mm" trong luật chỉ để tham khảo).
 * y = trục thanh, rodR = bán kính ống, post = cạnh cột vuông, postH = cao cột, clampR/clampH/clampY0 = kẹp đầu cột.
 */
export const LADDERS: Record<Alliance, { a: { x: number; z: number }; b: { x: number; z: number } }> = {
  red: { a: { x: -1.19, z: -0.198 }, b: { x: -0.202, z: -1.19 } },
  blue: { a: { x: 1.19, z: -0.198 }, b: { x: 0.202, z: -1.19 } },
}

/** Khoảng cách dọc thanh (từ `a`) tới chỗ thanh cắt đường z = zEdge. */
export function barCrossing(l: { a: { x: number; z: number }; b: { x: number; z: number } }, zEdge: number): number {
  const t = (zEdge - l.a.z) / (l.b.z - l.a.z)
  return t * Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z)
}

export const LADDER = {
  y: 0.6575,
  divider: barCrossing(LADDERS.red, ZONES.fire[0].z1),
  rodR: 0.01,
  post: 0.02,
  postH: 0.638,
  clampR: 0.0175,
  clampH: 0.065,
  /** đáy kẹp (CAD: y 0,608…0,673; kẹp không đối xứng quanh trục ống). */
  clampY0: 0.608,
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
 * Các tầng núi: `floor` = đáy rãnh, `lip` = đỉnh gờ ngoài. Tầng trang trí (decor) không phải rãnh tính điểm (luật V4):
 * bóng xanh ở đó không tính, bóng cam vẫn −3.
 * Luật ghi 15/50/95/130 mm; CAD cho đỉnh gờ 15/50/95/125 và đáy rãnh 5/40/80/110.
 */
export const TIERS: { floor: number; lip: number; decor?: boolean }[] = [
  { floor: 0.005, lip: 0.015 },
  { floor: 0.04, lip: 0.05, decor: true },
  { floor: 0.08, lip: 0.095 },
  { floor: 0.11, lip: 0.125 },
]
/** Rãnh tính điểm (0..2) của từng tầng; tầng decor = −1 (không thuộc rãnh nào). */
export const TIER_GROOVE: number[] = TIERS.map((t, k) => (t.decor ? -1 : TIERS.slice(0, k + 1).filter((x) => !x.decor).length - 1))
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

/** Tâm miệng lỗ cờ của từng núi (chỉ số = núi A..D) trên mặt sân; nguồn duy nhất cho vật lý, cảnh 3D và nhiệm vụ. */
export function holeCentres(): { x: number; z: number }[] {
  return MOUNTAINS.map((m) => fromMountain(m, HOLE.lx, HOLE.lz))
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
