// Thế giới vật lý FANROC (Rapier 3D): sàn, rào, 4 Ngọn Núi có gờ rãnh và lỗ cờ, 300 bóng xả từ Hộp Phân Phối.
// Chạy được cả trong Node (phép thử, không đồ hoạ) lẫn trình duyệt. Mọi nhiễu lấy từ PRNG theo `seed`.
import RAPIER from '@dimforge/rapier3d-compat'
import { BALL_R, DISPENSER, FIELD, HOLE, MOUNTAINS, MOUNTAIN_HALF, PEAK_Y, TIERS, WALL_H, ZONES, type Rect } from './layout.ts'
import type { FieldTally } from './scoring.ts'

export const PHYSICS_DT = 1 / 60

export type Vec3 = { x: number; y: number; z: number }

export interface BallState {
  color: 'o' | 'g'
  st: 'box' | 'field' | 'held' | 'tray' | 'out'
  body: RAPIER.RigidBody | null
}

// ---------- Số đo vật lý (gom một chỗ để thay khi có CAD) ----------
const BALL_COUNT = { o: 100, g: 200 }
const BALL_MASS = 0.0027
const BALL_BOUNCE = 0.6
const BALL_FRICTION = 0.5
/** Cản lăn/cản khí gần đúng để bóng dừng lại rồi ngủ, không lăn mãi. */
const BALL_LIN_DAMPING = 0.3
const BALL_ANG_DAMPING = 0.8
const FLOOR_FRICTION = 0.9
const MTN_FRICTION = 0.7
const WALL_T = 0.02
/** Bóng có tâm vượt quá biên này (hoặc rơi dưới OUT_Y) bị loại vĩnh viễn (luật P03/P08). */
const OUT_EDGE = FIELD / 2 + 0.05
const OUT_Y = -0.1

/** Nửa cạnh từng tầng núi (bầu dục "vuông vức" 0.40 / 0.30 / 0.216 / 0.136 m) và độ lệch tâm về phía sau núi (-z). */
const TIER_HALF = [0.2, 0.15, 0.108, 0.068]
const TIER_BACK = [0, 0.01, 0.02, 0.03]
const TIER_SEGMENTS = 24
const LIP_H = 0.012
const LIP_T = 0.004
/** Trụ đỉnh: tâm lỗ cờ lệch về sau núi để Rãnh 3 phía trước đủ rộng cho bóng Ø40. */
const PEAK_BACK = 0.038
const PEAK_OUTER = 0.03
const PEAK_BLOCKS = 8
/** Cửa ra của Hộp Phân Phối: ngay trong rào phía xa, cam tầng trên, xanh tầng dưới. */
const OUTLET_Z = -FIELD / 2 + 0.03
const OUTLET_W = 0.4
const OUTLET_Y = { o: 0.42, g: 0.36 }
/** Mọi bóng ra khỏi hộp trước thời điểm này của giai đoạn xả (giây). */
const RELEASE_END = 8
/** Cửa sổ cao độ để coi bóng nằm trên một tầng núi (luật chấm: tâm trong ±12 mm của sàn tầng + bán kính). */
const TIER_TOL = 0.012
const FIRE_MAX_Y = 0.03

/** PRNG mulberry32: cùng seed thì cùng chuỗi số. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Đa giác siêu elip bậc 4 (bầu dục vuông vức, lồi) nửa cạnh `h`, tâm (cx, cz). */
function superEllipse(cx: number, cz: number, h: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < TIER_SEGMENTS; i++) {
    const a = (i / TIER_SEGMENTS) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    pts.push([cx + h * Math.sign(c) * Math.sqrt(Math.abs(c)), cz + h * Math.sign(s) * Math.sqrt(Math.abs(s))])
  }
  return pts
}

/** Cắt đa giác lồi theo nửa mặt phẳng a·x + b·z <= d (Sutherland–Hodgman), kết quả vẫn lồi. */
function clip(poly: [number, number][], a: number, b: number, d: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const fp = a * p[0] + b * p[1] - d
    const fq = a * q[0] + b * q[1] - d
    if (fp <= 0) out.push(p)
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq)
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
    }
  }
  return out
}

const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad

export class FanrocWorld {
  readonly rapier: RAPIER.World
  readonly balls: BallState[]
  private readonly rnd: () => number
  /** Thứ tự ra khỏi hộp: xen kẽ 1 cam / 2 xanh. */
  private readonly releaseOrder: number[]
  private released = 0

  private constructor(seed: number) {
    this.rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.rapier.timestep = PHYSICS_DT
    this.rnd = mulberry32(seed)
    this.balls = []
    for (let i = 0; i < BALL_COUNT.o + BALL_COUNT.g; i++) this.balls.push({ color: i < BALL_COUNT.o ? 'o' : 'g', st: 'box', body: null })
    this.releaseOrder = []
    let o = 0
    let g = BALL_COUNT.o
    while (o < BALL_COUNT.o || g < this.balls.length) {
      if (o < BALL_COUNT.o) this.releaseOrder.push(o++)
      for (let k = 0; k < 2 && g < this.balls.length; k++) this.releaseOrder.push(g++)
    }
    this.buildField()
    MOUNTAINS.forEach((m) => this.buildMountain(m.x, m.z))
  }

  static async create(seed: number): Promise<FanrocWorld> {
    await RAPIER.init()
    return new FanrocWorld(seed)
  }

  private fixed(desc: RAPIER.ColliderDesc, friction = MTN_FRICTION): void {
    this.rapier.createCollider(desc.setFriction(friction).setRestitution(0.3))
  }

  private buildField(): void {
    // Sàn dày, rộng quá rào để bóng văng ra ngoài vẫn có chỗ rơi trước khi bị loại.
    this.fixed(RAPIER.ColliderDesc.cuboid(3, 0.1, 3).setTranslation(0, -0.1, 0), FLOOR_FRICTION)
    const h = FIELD / 2 + WALL_T / 2
    const len = FIELD / 2 + WALL_T
    for (const [x, z, hx, hz] of [[0, -h, len, WALL_T / 2], [0, h, len, WALL_T / 2], [-h, 0, WALL_T / 2, len], [h, 0, WALL_T / 2, len]]) {
      this.fixed(RAPIER.ColliderDesc.cuboid(hx, WALL_H / 2, hz).setTranslation(x, WALL_H / 2, z))
    }
  }

  /** Một núi: 4 tầng lồi xếp chồng, gờ ngoài 12 mm mỗi tầng, trụ đỉnh rỗng quanh lỗ cờ. */
  private buildMountain(cx: number, cz: number): void {
    const hz = cz - PEAK_BACK
    const hr = HOLE.r
    TIERS.forEach((tier, i) => {
      const poly = superEllipse(cx, cz - TIER_BACK[i], TIER_HALF[i])
      const top = tier.floor
      // Tầng cao nhất bị khoét lỗ cờ: tách đa giác thành 4 mảnh lồi quanh ô vuông ngoại tiếp lỗ.
      const pieces = i === TIERS.length - 1
        ? [
            clip(poly, 0, -1, -(hz + hr)), // phía trước lỗ (z > hz + hr)
            clip(poly, 0, 1, hz - hr), // phía sau lỗ
            clip(clip(clip(poly, 0, 1, hz + hr), 0, -1, -(hz - hr)), 1, 0, cx - hr), // bên trái
            clip(clip(clip(poly, 0, 1, hz + hr), 0, -1, -(hz - hr)), -1, 0, -(cx + hr)), // bên phải
          ]
        : [poly]
      for (const piece of pieces) {
        const v = new Float32Array(piece.length * 6)
        piece.forEach(([x, z], k) => v.set([x, 0, z, x, top, z], k * 6))
        const desc = RAPIER.ColliderDesc.convexHull(v)
        if (desc) this.fixed(desc)
      }
      // Gờ: một vòng khối mỏng chạy dọc mép ngoài tầng, ở phía trong mép.
      const ox = cx
      const oz = cz - TIER_BACK[i]
      for (let k = 0; k < poly.length; k++) {
        const [x0, z0] = poly[k]
        const [x1, z1] = poly[(k + 1) % poly.length]
        const len = Math.hypot(x1 - x0, z1 - z0)
        let nx = -(z1 - z0) / len
        let nz = (x1 - x0) / len
        const mx = (x0 + x1) / 2
        const mz = (z0 + z1) / 2
        if (nx * (mx - ox) + nz * (mz - oz) > 0) { nx = -nx; nz = -nz } // pháp tuyến hướng vào trong
        const yaw = Math.atan2(z1 - z0, x1 - x0)
        this.fixed(
          RAPIER.ColliderDesc.cuboid(len / 2 + LIP_T / 2, LIP_H / 2, LIP_T / 2)
            .setTranslation(mx + nx * LIP_T / 2, top + LIP_H / 2, mz + nz * LIP_T / 2)
            .setRotation({ x: 0, y: Math.sin(-yaw / 2), z: 0, w: Math.cos(-yaw / 2) }),
        )
      }
    })
    // Đáy lỗ cờ: sâu HOLE.depth tính từ đỉnh.
    const holeBottom = PEAK_Y - HOLE.depth
    const below = TIERS[TIERS.length - 2].floor
    this.fixed(RAPIER.ColliderDesc.cuboid(hr, (holeBottom - below) / 2, hr).setTranslation(cx, (below + holeBottom) / 2, hz))
    // Trụ đỉnh rỗng: 8 khối nhỏ quanh lỗ, từ mặt tầng cao nhất lên PEAK_Y.
    const base = TIERS[TIERS.length - 1].floor
    const t = PEAK_OUTER - hr
    const rc = hr + t / 2
    const half = PEAK_OUTER * Math.tan(Math.PI / PEAK_BLOCKS)
    for (let k = 0; k < PEAK_BLOCKS; k++) {
      const a = (k / PEAK_BLOCKS) * Math.PI * 2
      this.fixed(
        RAPIER.ColliderDesc.cuboid(t / 2, (PEAK_Y - base) / 2, half)
          .setTranslation(cx + Math.cos(a) * rc, (base + PEAK_Y) / 2, hz + Math.sin(a) * rc)
          .setRotation({ x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) }),
      )
    }
  }

  step(dt: number): void {
    this.rapier.timestep = dt
    this.rapier.step()
    for (const b of this.balls) {
      if (b.st !== 'field' || !b.body || b.body.isSleeping()) continue
      const p = b.body.translation()
      if (Math.abs(p.x) > OUT_EDGE || Math.abs(p.z) > OUT_EDGE || p.y < OUT_Y) {
        this.freeBody(b)
        b.st = 'out'
      }
    }
  }

  /** Gọi mỗi bước trong 10 s xả bóng với t = thời gian của giai đoạn xả; thả dần để hết 300 bóng trước RELEASE_END. */
  release(t: number): void {
    const n = this.releaseOrder.length
    const target = Math.min(n, Math.floor((n * Math.max(0, t)) / RELEASE_END) + 1)
    while (this.released < target) {
      const i = this.releaseOrder[this.released++]
      const b = this.balls[i]
      if (b.st !== 'box') continue
      const r = this.rnd
      this.placeBall(
        i,
        { x: DISPENSER.x + (r() - 0.5) * OUTLET_W, y: OUTLET_Y[b.color], z: OUTLET_Z },
        { x: (r() - 0.5) * 1.2, y: 0, z: 0.6 + r() * 1.8 },
      )
    }
  }

  /** Chỉ số các bóng đang trên sân có tâm nằm trong `rect`. */
  ballsIn(rect: Rect): number[] {
    const out: number[] = []
    this.balls.forEach((b, i) => {
      if (b.st !== 'field' || !b.body) return
      const p = b.body.translation()
      if (inRect(rect, p.x, p.z)) out.push(i)
    })
    return out
  }

  /** Robot hút bóng vào: bóng thành 'held', xoá body (đánh thức bóng đang tựa vào nó). */
  removeBall(i: number): void {
    const b = this.balls[i]
    this.freeBody(b)
    b.st = 'held'
  }

  /** Đặt (lại) bóng vào sân tại `pos` với vận tốc `vel`. */
  placeBall(i: number, pos: Vec3, vel: Vec3 = { x: 0, y: 0, z: 0 }): void {
    const b = this.balls[i]
    this.freeBody(b)
    const body = this.rapier.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setLinvel(vel.x, vel.y, vel.z)
        .setLinearDamping(BALL_LIN_DAMPING)
        .setAngularDamping(BALL_ANG_DAMPING)
        .setCcdEnabled(true),
    )
    this.rapier.createCollider(
      RAPIER.ColliderDesc.ball(BALL_R).setMass(BALL_MASS).setRestitution(BALL_BOUNCE).setFriction(BALL_FRICTION),
      body,
    )
    b.body = body
    b.st = 'field'
  }

  private freeBody(b: BallState): void {
    if (!b.body) return
    const p = b.body.translation()
    this.rapier.removeRigidBody(b.body)
    b.body = null
    // Bóng ngủ đang tựa vào bóng vừa mất phải được đánh thức để rơi xuống.
    for (const o of this.balls) {
      if (o.st !== 'field' || !o.body || !o.body.isSleeping()) continue
      const q = o.body.translation()
      if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 3 * BALL_R) o.body.wakeUp()
    }
  }

  /** Tâm miệng lỗ cờ của từng núi (A..D), ở cao độ PEAK_Y. */
  holeCentres(): Vec3[] {
    return MOUNTAINS.map((m) => ({ x: m.x, y: PEAK_Y, z: m.z - PEAK_BACK }))
  }

  /** Chỉ số núi có chân (0.4 × 0.4) chứa điểm (x, z), hoặc -1. */
  inMountain(x: number, z: number): number {
    return MOUNTAINS.findIndex((m) => Math.abs(x - m.x) <= MOUNTAIN_HALF && Math.abs(z - m.z) <= MOUNTAIN_HALF)
  }

  /**
   * Đếm bóng theo luật hình học: Khu Chữa Cháy (bóng chạm vạch cũng tính) và 3 rãnh của từng núi.
   * Tầng trang trí gộp vào Rãnh 1. Bóng trong `robotsHolding` hoặc không ở 'field' không tính.
   */
  tally(robotsHolding: Set<number>): Omit<FieldTally, 'flags' | 'parks'> {
    const fire = { o: 0, g: 0 }
    const mtn = MOUNTAINS.map(() => [0, 1, 2].map(() => ({ g: 0, o: 0 })))
    // TIERS[0] và tầng trang trí TIERS[1] → Rãnh 1; TIERS[2] → Rãnh 2; TIERS[3] → Rãnh 3.
    const groove = TIERS.map((_, k) => (k <= 1 ? 0 : k - 1))
    this.balls.forEach((b, i) => {
      if (b.st !== 'field' || !b.body || robotsHolding.has(i)) return
      const p = b.body.translation()
      if (p.y < FIRE_MAX_Y && ZONES.fire.some((r) => inRect(r, p.x, p.z, BALL_R))) {
        fire[b.color]++
        return
      }
      const m = this.inMountain(p.x, p.z)
      if (m < 0) return
      const k = TIERS.findIndex((t) => Math.abs(p.y - (t.floor + BALL_R)) <= TIER_TOL)
      if (k >= 0) mtn[m][groove[k]][b.color]++
    })
    return { fire, mtn }
  }
}
