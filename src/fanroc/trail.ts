// Vệt con rùa: ghi lại đường đi của tâm robot và các số đo (quãng, góc quay, thời gian).
// Thuần dữ liệu — không phụ thuộc three.js; scene vẽ `segments` ở task sau.
import type { Pose } from './layout.ts'
import type { PortValues } from './ports.ts'

/** 6 màu xoay vòng cho các đoạn vệt (mỗi lần bộ động cơ đổi là một đoạn, một màu). */
export const TRAIL_COLORS: readonly number[] = [0xff7a1a, 0x2463eb, 0x1fa860, 0xf2a516, 0xc04ee0, 0xe2384d]

/** Điểm cách điểm đã lưu trước < 5 mm thì bỏ (giữ vệt gọn); riêng điểm đổi đoạn luôn được giữ. */
export const MIN_STEP = 0.005

/** Ngưỡng "robot còn chạy" (R57): tâm dời ≥ 5 mm hoặc hướng đổi ≥ 2° so với lần chạy được ghi trước. */
export const MOVE_STEP = 0.005
export const MOVE_TURN_DEG = 2

export type TrailSegment = { color: number; points: { x: number; z: number }[] }

/** Hiệu hai góc theo đường ngắn nhất, trong (−π, π]. */
const angleDiff = (a: number, b: number): number => {
  let d = (a - b) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  else if (d <= -Math.PI) d += 2 * Math.PI
  return d
}

export class Trail {
  readonly segments: TrailSegment[] = []
  /** m, cộng dồn quãng tâm robot theo MỌI bước (kể cả bước < 5 mm bị bỏ khỏi vệt) — bộ lọc 5 mm
   *  chỉ áp cho điểm lưu để vẽ, không làm mất quãng đo. */
  distance = 0
  /** độ, cộng dồn |Δyaw| (mọi bước, kể cả quay tại chỗ). */
  turned = 0
  /** s kể từ điểm đầu tiên. */
  time = 0
  private t0: number | null = null
  private last: { x: number; z: number } | null = null // điểm vừa thấy (đo quãng)
  private lastStored: { x: number; z: number } | null = null // điểm vừa lưu (lọc 5 mm)
  private lastYaw = 0
  private key = ''
  private colorIdx = 0
  private anchor: Pose | null = null // tư thế lúc robot "chạy" lần gần nhất (R57)
  private moveT = 0
  private moved = false

  /** s kể từ điểm đầu tới lần cuối robot còn chạy (tâm dời ≥ MOVE_STEP hoặc quay ≥ MOVE_TURN_DEG kể từ lần chạy
   *  trước); 0 nếu chưa chạy. Robot đứng yên khi `time − lastMoveTime ≥ 1` (R57). Không đổi nghĩa của `time`. */
  get lastMoveTime(): number {
    return this.moveT
  }
  /** Robot đã chạy ít nhất một lần kể từ điểm đầu. */
  get hasMoved(): boolean {
    return this.moved
  }

  add(t: number, pose: Pose, ports: PortValues): void {
    const key = `${ports.M1},${ports.M2},${ports.M3},${ports.M4}`
    if (this.t0 === null || this.last === null) {
      this.t0 = t
      this.key = key
      this.last = { x: pose.x, z: pose.z }
      this.lastStored = { x: pose.x, z: pose.z }
      this.lastYaw = pose.yaw
      this.segments.push({ color: this.colorIdx, points: [{ x: pose.x, z: pose.z }] })
      this.anchor = { ...pose }
      return
    }
    this.time = t - this.t0
    const a = this.anchor ?? pose
    if (Math.hypot(pose.x - a.x, pose.z - a.z) >= MOVE_STEP || (Math.abs(angleDiff(pose.yaw, a.yaw)) * 180) / Math.PI >= MOVE_TURN_DEG) {
      this.anchor = { ...pose }
      this.moveT = this.time
      this.moved = true
    }
    this.turned += (Math.abs(angleDiff(pose.yaw, this.lastYaw)) * 180) / Math.PI
    this.lastYaw = pose.yaw
    const changed = key !== this.key
    this.distance += Math.hypot(pose.x - this.last.x, pose.z - this.last.z)
    this.last = { x: pose.x, z: pose.z }
    const ls = this.lastStored ?? this.last
    const d = Math.hypot(pose.x - ls.x, pose.z - ls.z)
    if (changed) {
      this.key = key
      this.colorIdx = (this.colorIdx + 1) % TRAIL_COLORS.length
      // Đoạn mới mở bằng điểm lưu cuối của đoạn trước để nét vẽ liền, rồi tới điểm hiện tại.
      const seed = this.lastStored ?? { x: pose.x, z: pose.z }
      const pts = [{ x: seed.x, z: seed.z }]
      if (seed.x !== pose.x || seed.z !== pose.z) pts.push({ x: pose.x, z: pose.z })
      this.segments.push({ color: this.colorIdx, points: pts })
      this.lastStored = { x: pose.x, z: pose.z }
      return
    }
    if (d < MIN_STEP) return
    this.lastStored = { x: pose.x, z: pose.z }
    this.segments[this.segments.length - 1].points.push({ x: pose.x, z: pose.z })
  }

  clear(): void {
    this.segments.length = 0
    this.distance = 0
    this.turned = 0
    this.time = 0
    this.t0 = null
    this.last = null
    this.lastStored = null
    this.lastYaw = 0
    this.key = ''
    this.colorIdx = 0
    this.anchor = null
    this.moveT = 0
    this.moved = false
  }
}
