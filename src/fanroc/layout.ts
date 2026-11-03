// Bố cục sân FANROC: hằng số thuần (mét), không phụ thuộc đồ hoạ hay vật lý.
// Toạ độ: gốc ở tâm sân, +x sang phải nhìn từ Khu Điều Khiển, +z về phía Khu Điều Khiển, y lên trên.
// Giá trị mm của luật (fanroc-spike/sim.js) đổi bằng P(x,y) = ((x-1200)/1000, (1200-y)/1000).

export type Alliance = 'red' | 'blue'
export type Phase = 'release' | 'play' | 'end'
/** yaw quanh trục y (kiểu three.js): 0 = hướng về -z (vào sân), dương = quay ngược chiều kim đồng hồ nhìn từ trên. */
export type Pose = { x: number; z: number; yaw: number }
export type Rect = { x0: number; x1: number; z0: number; z1: number }

export const FIELD = 2.4
export const WALL_H = 0.3
export const BALL_R = 0.02

/** Đổi hình chữ nhật mm của luật [xMin, xMax, yMin, yMax] sang Rect mét (z đảo chiều nên z0 lấy từ yMax). */
const rectMm = (xMin: number, xMax: number, yMin: number, yMax: number): Rect => ({
  x0: (xMin - 1200) / 1000, x1: (xMax - 1200) / 1000, z0: (1200 - yMax) / 1000, z1: (1200 - yMin) / 1000,
})

export const ZONES: {
  fire: [Rect, Rect]
  start: Record<Alliance, Rect>
  load: Record<Alliance, Rect>
  safe: Record<Alliance, Rect>
} = {
  fire: [rectMm(0, 600, 1800, 2400), rectMm(1800, 2400, 1800, 2400)],
  start: { red: rectMm(500, 1200, 0, 300), blue: rectMm(1200, 1900, 0, 300) },
  load: { red: rectMm(0, 375, 0, 375), blue: rectMm(2025, 2400, 0, 375) },
  safe: { red: rectMm(0, 375, 1050, 1425), blue: rectMm(2025, 2400, 1050, 1425) },
}

/** Nửa cạnh chân núi (chân núi 0.4 x 0.4). */
export const MOUNTAIN_HALF = 0.2

/** Tâm 4 núi A, B, C, D. */
export const MOUNTAINS: { x: number; z: number }[] = [
  { x: -0.36, z: 0.35 }, // A: (840, 850) mm
  { x: 0.36, z: 0.35 }, // B: (1560, 850)
  { x: -0.36, z: -0.35 }, // C: (840, 1550)
  { x: 0.36, z: -0.35 }, // D: (1560, 1550)
]

/** 4 tầng núi: mặt sàn từng tầng; tầng trang trí (decor) tính như Rãnh 1. */
export const TIERS = [{ floor: 0.015 }, { floor: 0.05, decor: true }, { floor: 0.095 }, { floor: 0.13 }]
export const PEAK_Y = 0.16
export const HOLE = { r: 0.0225, depth: 0.045 }

/** Hộp Phân Phối: giữa thành sân phía xa Khu Điều Khiển, nằm ngoài sân (P(1200, 2660) mm). */
export const DISPENSER = { x: 0, z: -1.46 }

/** Hai robot mỗi liên minh xuất phát trong Khu Xuất Phát, mặt hướng vào sân (-z). */
export const START_POSES: Record<Alliance, [Pose, Pose]> = {
  red: [{ x: -0.48, z: 1.04, yaw: 0 }, { x: -0.22, z: 1.04, yaw: 0 }],
  blue: [{ x: 0.22, z: 1.04, yaw: 0 }, { x: 0.48, z: 1.04, yaw: 0 }],
}
