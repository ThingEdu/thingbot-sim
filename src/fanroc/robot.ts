// Thân robot FANROC trong thế giới Rapier: chỉ chạy theo giá trị cổng (PortValues), đúng như chương trình khối ra lệnh.
// Động cơ TT có vùng chết 20 %; đế 2 bánh / omni / mecanum; hút, xả, nâng/vươn, kẹp cờ, hai ngăn của Xe Phân Loại.
//
// Quy ước: yaw kiểu three.js (0 = mũi xe hướng −z, dương = quay ngược chiều kim đồng hồ nhìn từ trên, tức quay trái).
// Mũi xe f = (−sin yaw, −cos yaw), bên phải r = (cos yaw, −sin yaw). Đế 2 bánh: ω = (vR − vL) / track, nên
// {M1: −50, M2: 50} quay trái tại chỗ (yaw tăng).
// Cách đặt vận tốc mỗi bước (vật dynamic, giới hạn gia tốc, khoá lật) theo UrSimulator/src/sim/RobotSim.ts (MIT,
// Copyright (c) 2026 Khussein); viết lại cho đế ThingBot, không chép nguyên văn.
import RAPIER from '@dimforge/rapier3d-compat'
import type { FanrocWorld } from './world.ts'
import { HOLE, PEAK_Y, START_POSES, type Alliance, type Pose } from './layout.ts'
import { servo360, type PortValues } from './ports.ts'
import { ROBOTS, portMap, type PortMap, type RobotConfig, type RobotDef } from './robots.ts'

export type Vec2 = { x: number; z: number }

// ---------- Số đo động cơ / cơ cấu (gom một chỗ để sửa khi có số đo thật) ----------
/** Tốc độ mặt bánh khi lệnh 100 %, m/s. */
export const V_MAX = 0.55
/** Động cơ TT không quay dưới 20 % (vùng chết). */
export const DEAD_ZONE = 20
/** Gia tốc tối đa của xe (bám đường), m/s². */
const A_MAX = 2
/** Tốc độ nâng/vươn: động cơ TT ở 100 %, và servo 360 (một tốc độ), m/s. */
const LIFT_V_MOTOR = 0.08
const LIFT_V_S360 = 0.06
/** Miệng hút trước mũi xe: rộng = w − MOUTH_SIDE, sâu MOUTH_DEPTH, cao MOUTH_H (từ sàn). */
const MOUTH_SIDE = 0.02
const MOUTH_DEPTH = 0.05
const MOUTH_H = 0.06
/** Cửa xả mở: mỗi RELEASE_EVERY giây thả 1 bóng với vận tốc RELEASE_V tới trước. */
const RELEASE_EVERY = 0.25
const RELEASE_V = 0.2
/** Servo: ≥ 90° là đóng kẹp / mở cửa xả / chọn ngăn xanh. */
const SERVO_ON = 90
/** Đầu cờ cách tâm lỗ (theo phương ngang) ≤ FLAG_SNAP ⇒ cắm được. */
const FLAG_SNAP = 0.025
/** Kẹp đóng lại khi thân cờ rơi cách điểm kẹp (ngang) ≤ FLAG_PICK ⇒ nhặt lại. */
const FLAG_PICK = 0.05
/** Cờ rơi: thanh trụ nhỏ. */
const FLAG = { r: 0.008, halfH: 0.09, mass: 0.02 }
/** Sức chứa mỗi ngăn của Xe Phân Loại. */
const COMPARTMENT = 5
/** Khối lượng thân xe, kg. Thân là một hộp đáy sát sàn (gốc body ở sàn), nên gờ 15 mm của núi chặn được xe. */
const MASS = 1.2
/**
 * Chiều từng bánh của đế 4 bánh đa hướng (FL, FR, RL, RR): +1 = lệnh dương làm bánh đẩy xe tới trước.
 * Chưa đo trên robot thật (spec 4.1) — sửa ở đây khi có số đo.
 */
export const WHEEL_SIGN = { FL: 1, FR: 1, RL: 1, RR: 1 }
/** Cơ cấu nâng/vươn đi theo phương nào: Maker là thanh trượt vươn tới trước, Xe Cắm Cờ nâng thùng lên. */
const LIFT_AXIS: Partial<Record<RobotDef['type'], 'forward' | 'up'>> = { maker: 'forward', co: 'up' }

/** Mô hình động cơ TT: lệnh −100…100 → phần tốc độ −1…1, có vùng chết. */
export function ttFraction(cmd: number): number {
  const a = Math.min(100, Math.abs(cmd))
  if (a < DEAD_ZONE) return 0
  return (Math.sign(cmd) * (a - DEAD_ZONE)) / (100 - DEAD_ZONE)
}

export class RobotBody {
  readonly def: RobotDef
  readonly cfg: RobotConfig
  readonly alliance: Alliance
  readonly slot: 0 | 1
  readonly body: RAPIER.RigidBody
  /** Chỉ số bóng đang ở trong robot (st 'held'), theo thứ tự vào. */
  readonly stored: number[] = []
  /** Xe Phân Loại: bóng theo ngăn (cùng các chỉ số trong `stored`); robot khác: null. */
  readonly compartments: { o: number[]; g: number[] } | null
  /** Mức nâng/vươn hiện tại, m (0…maxExtend). */
  extend = 0
  hasFlag: boolean
  /** Cờ đã rơi ra sàn (vật dynamic) để vẽ; null khi đang giữ hoặc đã cắm. */
  flagBody: RAPIER.RigidBody | null = null
  /** Trận đặt; RobotBody không tự tính đỗ. */
  parked = false
  /** Thông báo cho người chơi (vd. R16), null khi không có gì. */
  lastMessage: string | null = null
  /** Tay kẹp cờ (S1 / 180, 0…1); S1 null giữ giá trị lệnh gần nhất. */
  armFrac = 0
  onFlag?: (mountain: number) => void

  private readonly world: FanrocWorld
  private readonly ports: PortMap
  /** Kẹp cờ đang đóng; S2 null (chưa ra lệnh) giữ nguyên trạng thái. */
  private gripClosed = true
  private releaseWait = 0

  constructor(world: FanrocWorld, cfg: RobotConfig, alliance: Alliance, slot: 0 | 1) {
    this.world = world
    this.cfg = cfg
    this.def = ROBOTS[cfg.type]
    this.alliance = alliance
    this.slot = slot
    this.ports = portMap(cfg)
    this.hasFlag = this.def.flag
    this.compartments = cfg.type === 'sort' ? { o: [], g: [] } : null
    const { w, l, h } = this.def.size
    const rapier = world.rapier
    this.body = rapier.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().enabledRotations(false, true, false).setCanSleep(false),
    )
    rapier.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, l / 2)
        .setTranslation(0, h / 2, 0)
        .setMass(MASS)
        // Bám đường do bộ điều khiển vận tốc lo, thân trượt tự do; không nảy.
        .setFriction(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
      this.body,
    )
    this.setPose(START_POSES[alliance][slot])
  }

  /** Đặt xe tại tư thế, đứng yên. */
  setPose(p: Pose): void {
    this.body.setTranslation({ x: p.x, y: 0.002, z: p.z }, true)
    this.body.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  get pose(): Pose {
    const t = this.body.translation()
    const q = this.body.rotation()
    return { x: t.x, z: t.z, yaw: 2 * Math.atan2(q.y, q.w) }
  }

  /** Mũi xe f và bên phải r (đơn vị, mặt phẳng x-z). */
  private axes(): { f: Vec2; r: Vec2 } {
    const yaw = this.pose.yaw
    const s = Math.sin(yaw)
    const c = Math.cos(yaw)
    return { f: { x: -s, z: -c }, r: { x: c, z: -s } }
  }

  private get forwardExtend(): number {
    return LIFT_AXIS[this.def.type] === 'forward' ? this.extend : 0
  }

  /** Phần tay kẹp cờ đang vươn tới trước, m. */
  private get armReach(): number {
    return this.armFrac * (this.def.arm?.reach ?? 0)
  }

  /** Tổng phần nhô ra trước mũi xe (vươn + tay kẹp), m — đưa vào ruleChecks / đỗ. */
  get forwardExtension(): number {
    return this.forwardExtend + this.armReach
  }

  /** Điểm cách mũi xe thêm `ahead` theo phương ngang và cao `y` so với sàn. */
  private ahead(ahead: number, y: number): { x: number; y: number; z: number } {
    const t = this.body.translation()
    const { f } = this.axes()
    const d = this.def.size.l / 2 + ahead
    return { x: t.x + f.x * d, y: t.y + y, z: t.z + f.z * d }
  }

  private get liftUp(): number {
    return LIFT_AXIS[this.def.type] === 'up' ? this.extend : 0
  }

  /** Điểm xả bóng: mũi + reach (+ vươn), cao release.y (+ nâng). */
  releasePoint(): { x: number; y: number; z: number } {
    return this.ahead(this.def.release.reach + this.forwardExtend, this.def.release.y + this.liftUp)
  }

  /** Điểm kẹp cờ: như điểm xả, cộng phần tay kẹp S1 (R17). */
  gripPoint(): { x: number; y: number; z: number } {
    const up = this.armFrac * (this.def.arm?.up ?? 0)
    return this.ahead(this.def.release.reach + this.forwardExtend + this.armReach, this.def.release.y + this.liftUp + up)
  }

  /** 4 góc hình chữ nhật thân xe (gồm phần vươn và tay kẹp tới trước): trước trái, trước phải, sau phải, sau trái. */
  footprint(): Vec2[] {
    const t = this.body.translation()
    const { f, r } = this.axes()
    const front = this.def.size.l / 2 + this.forwardExtension
    const back = -this.def.size.l / 2
    const half = this.def.size.w / 2
    const at = (a: number, b: number): Vec2 => ({ x: t.x + f.x * a + r.x * b, z: t.z + f.z * a + r.z * b })
    return [at(front, -half), at(front, half), at(back, half), at(back, -half)]
  }

  /** Nhận một bóng vào robot (hút được, hoặc Human Player nạp từ khay). false nếu đầy hoặc bóng không lấy được. */
  take(i: number, compartment?: 'o' | 'g'): boolean {
    const b = this.world.balls[i]
    if (b.st !== 'field' && b.st !== 'tray') return false
    if (this.compartments) {
      const c = compartment ?? b.color
      if (this.compartments[c].length >= COMPARTMENT) return false
      this.compartments[c].push(i)
    } else if (this.stored.length >= this.def.storage) return false
    if (b.st === 'field') this.world.removeBall(i)
    else b.st = 'held'
    this.stored.push(i)
    return true
  }

  /** Gọi mỗi bước vật lý, trước world.step(dt). */
  apply(ports: PortValues, dt: number): void {
    this.drive(ports, dt)
    this.lift(ports, dt)
    this.intake(ports)
    this.release(ports, dt)
    if (ports.S1 !== null) this.armFrac = Math.max(0, Math.min(1, ports.S1 / 180))
    this.flag(ports)
  }

  private wheel(ports: PortValues, key: keyof PortMap['wheels']): number {
    const p = this.ports.wheels[key]
    return p ? ttFraction(ports[p] ?? 0) * V_MAX : 0
  }

  private drive(ports: PortValues, dt: number): void {
    const { w, l } = this.def.size
    let fwd: number
    let right = 0
    let omega: number // rad/s, dương = quay trái
    let halfSpan: number
    if (this.cfg.drive === 'diff2') {
      const vL = this.wheel(ports, 'L')
      const vR = this.wheel(ports, 'R')
      fwd = (vL + vR) / 2
      omega = (vR - vL) / w
      halfSpan = w / 2
    } else {
      // Omni chữ X và mecanum: trộn ngược từ 4 bánh (cùng công thức, không tính hao hụt khi đi ngang).
      const fl = this.wheel(ports, 'FL') * WHEEL_SIGN.FL
      const fr = this.wheel(ports, 'FR') * WHEEL_SIGN.FR
      const rl = this.wheel(ports, 'RL') * WHEEL_SIGN.RL
      const rr = this.wheel(ports, 'RR') * WHEEL_SIGN.RR
      halfSpan = (w + l) / 2
      fwd = (fl + fr + rl + rr) / 4
      right = (fl - fr - rl + rr) / 4
      omega = (-fl + fr - rl + rr) / 4 / halfSpan
    }
    const { f, r } = this.axes()
    const tx = f.x * fwd + r.x * right
    const tz = f.z * fwd + r.z * right
    // Tiến dần tới vận tốc lệnh, giới hạn bởi bám đường; va chạm do bước vật lý sau đó giải (đẩy tường thì đứng).
    const v = this.body.linvel()
    let dx = tx - v.x
    let dz = tz - v.z
    const maxDv = A_MAX * dt
    const dv = Math.hypot(dx, dz)
    if (dv > maxDv) {
      dx *= maxDv / dv
      dz *= maxDv / dv
    }
    this.body.setLinvel({ x: v.x + dx, y: v.y, z: v.z + dz }, true)
    const wy = this.body.angvel().y
    const maxDw = (A_MAX / halfSpan) * dt
    const dw = Math.max(-maxDw, Math.min(maxDw, omega - wy))
    this.body.setAngvel({ x: 0, y: wy + dw, z: 0 }, true)
  }

  private lift(ports: PortValues, dt: number): void {
    const p = this.ports.lift
    if (!p) return
    const v = this.ports.liftKind === 's360' ? servo360(ports[p]) * LIFT_V_S360 : ttFraction(ports[p] ?? 0) * LIFT_V_MOTOR
    this.extend = Math.max(0, Math.min(this.def.maxExtend, this.extend + v * dt))
  }

  private intake(ports: PortValues): void {
    const p = this.ports.intake
    if (!p) return
    const on = this.ports.intakeKind === 's360' ? servo360(ports[p]) === 1 : (ports[p] ?? 0) >= DEAD_ZONE
    if (!on) return
    const t = this.body.translation()
    const { f, r } = this.axes()
    const near = this.def.size.l / 2
    const halfW = (this.def.size.w - MOUTH_SIDE) / 2
    const sel: 'o' | 'g' = (ports.S2 ?? 0) >= SERVO_ON ? 'g' : 'o'
    this.world.balls.forEach((b, i) => {
      if (b.st !== 'field' || !b.body) return
      const q = b.body.translation()
      const dx = q.x - t.x
      const dz = q.z - t.z
      const a = dx * f.x + dz * f.z
      const s = dx * r.x + dz * r.z
      const h = q.y - t.y
      if (a < near || a > near + MOUTH_DEPTH || Math.abs(s) > halfW || h < 0 || h > MOUTH_H) return
      this.take(i, sel)
    })
  }

  private release(ports: PortValues, dt: number): void {
    if ((ports.S3 ?? 0) < SERVO_ON) {
      this.releaseWait = 0
      return
    }
    this.releaseWait -= dt
    if (this.releaseWait > 1e-9) return
    let i: number | undefined
    if (this.compartments) {
      const c = this.compartments[(ports.S2 ?? 0) >= SERVO_ON ? 'g' : 'o']
      i = c.shift()
      if (i !== undefined) this.stored.splice(this.stored.indexOf(i), 1)
    } else i = this.stored.shift()
    if (i === undefined) return
    this.releaseWait = RELEASE_EVERY
    const { f } = this.axes()
    const v = this.body.linvel()
    this.world.placeBall(i, this.releasePoint(), { x: v.x + f.x * RELEASE_V, y: 0, z: v.z + f.z * RELEASE_V })
  }

  private flag(ports: PortValues): void {
    this.lastMessage = null // chỉ còn khi điều kiện R16 đang xảy ra ở bước này
    if (!this.def.flag) return
    const wasClosed = this.gripClosed
    if (ports.S2 !== null) this.gripClosed = ports.S2 >= SERVO_ON
    const tip = this.gripPoint()
    // Kẹp vừa đóng lại gần cờ đang nằm sàn ⇒ nhặt lại.
    if (!this.hasFlag && this.flagBody && this.gripClosed && !wasClosed) {
      if (this.flagDistance(tip) <= FLAG_PICK) {
        this.world.rapier.removeRigidBody(this.flagBody)
        this.flagBody = null
        this.hasFlag = true
      }
      return
    }
    if (!this.hasFlag || this.gripClosed) return
    const holes = this.world.holeCentres()
    const m = holes.findIndex((h) => Math.hypot(h.x - tip.x, h.z - tip.z) <= FLAG_SNAP)
    if (m >= 0) {
      if (this.holeBlocked(holes[m])) {
        // R16: lỗ có bóng thì không cắm được, robot vẫn giữ cờ.
        this.lastMessage = 'Lỗ cờ đang có bóng'
        return
      }
      this.hasFlag = false
      this.onFlag?.(m)
      return
    }
    this.hasFlag = false
    this.dropFlag(tip)
  }

  private holeBlocked(h: { x: number; z: number }): boolean {
    return this.world.balls.some((b) => {
      if (b.st !== 'field' || !b.body) return false
      const q = b.body.translation()
      return q.y < PEAK_Y && Math.hypot(q.x - h.x, q.z - h.z) <= HOLE.r
    })
  }

  /** Khoảng cách ngang từ điểm kẹp tới thân cờ đang nằm (đoạn thẳng trục cờ chiếu xuống sàn). */
  private flagDistance(p: { x: number; z: number }): number {
    const c = this.flagBody!.translation()
    const q = this.flagBody!.rotation()
    // Trục y của cờ sau khi xoay theo quaternion.
    const ax = 2 * (q.x * q.y - q.w * q.z) * FLAG.halfH
    const az = 2 * (q.y * q.z + q.w * q.x) * FLAG.halfH
    const len2 = ax * ax + az * az
    const t = len2 > 1e-12 ? Math.max(-1, Math.min(1, ((p.x - c.x) * ax + (p.z - c.z) * az) / len2)) : 0
    return Math.hypot(p.x - (c.x + ax * t), p.z - (c.z + az * t))
  }

  private dropFlag(at: { x: number; y: number; z: number }): void {
    const rapier = this.world.rapier
    this.flagBody = rapier.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(at.x, at.y, at.z))
    rapier.createCollider(RAPIER.ColliderDesc.cylinder(FLAG.halfH, FLAG.r).setMass(FLAG.mass).setFriction(0.6), this.flagBody)
  }
}
