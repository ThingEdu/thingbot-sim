// Thế giới vật lý FANROC (Rapier 3D): sàn, rào, 4 Ngọn Núi (lưới tam giác CAD), 300 bóng xả từ Hộp Phân Phối.
// Tuỳ chọn `balls: false` (nhiệm vụ con rùa, spec §8.6): sân không có bóng, `release` không làm gì.
// Chạy được cả trong Node (phép thử, không đồ hoạ) lẫn trình duyệt. Mọi nhiễu lấy từ PRNG theo `seed`.
import RAPIER from '@dimforge/rapier3d-compat'
import { BALL_R, DISPENSER, FIELD, LADDER, LADDERS, MOUNTAINS, PEAK_Y, TIERS, TIER_GROOVE, WALL_H, WALL_T, ZONES, holeCentres, mountainAt, type Rect } from './layout.ts'
import type { FieldTally } from './scoring.ts'
import mesh from './assets/mountain-mesh.json' with { type: 'json' }

const MESH_VERTICES = new Float32Array(mesh.vertices)
const MESH_INDICES = new Uint32Array(mesh.indices)

export const PHYSICS_DT = 1 / 60

export type Vec3 = { x: number; y: number; z: number }

export interface BallState {
  color: 'o' | 'g'
  st: 'box' | 'field' | 'held' | 'tray' | 'out'
  body: RAPIER.RigidBody | null
}

// ---------- Số đo vật lý của bóng và xả bóng (hình học sân ở layout.ts) ----------
const BALL_COUNT = { o: 100, g: 200 }
const BALL_MASS = 0.0027
const BALL_BOUNCE = 0.6
const BALL_FRICTION = 0.5
/** Cản lăn/cản khí gần đúng để bóng dừng lại rồi ngủ, không lăn mãi. */
const BALL_LIN_DAMPING = 0.3
const BALL_ANG_DAMPING = 0.8
const FLOOR_FRICTION = 0.9
const MTN_FRICTION = 0.7
/** Bóng có tâm vượt mặt ngoài rào (hoặc rơi dưới OUT_Y) bị loại vĩnh viễn (luật P03/P08). */
const OUT_EDGE = FIELD / 2 + WALL_T
const OUT_Y = -0.1
/** Bóng ra trong khe của Hộp Phân Phối (tâm bóng cách mép khe ít nhất BALL_R), xanh (tầng dưới) trước rồi cam. */
const OUTLET_HALF = DISPENSER.width / 2 - BALL_R
/** Tâm bóng khi ra: cách mặt trong rào phía xa (z = −FIELD/2) một bán kính + khe hở nhỏ. */
const OUTLET_Z = Math.max(DISPENSER.z, -FIELD / 2) + BALL_R + 0.002
/** Mọi bóng ra khỏi hộp trước thời điểm này của giai đoạn xả (giây). */
const RELEASE_END = 8
/** Hai bóng ra liền nhau cách nhau ít nhất chừng này theo x để không đè lên nhau. */
const SPAWN_GAP = 2.2 * BALL_R
/** Cửa sổ cao độ để coi bóng nằm trên một tầng núi (luật chấm: tâm trong ±12 mm của đáy rãnh + bán kính). */
const TIER_TOL = 0.012
const FIRE_MAX_Y = 0.03
/** Tia dò thứ bóng đang tựa lên: dài đủ để bóng kẹt cao nhất còn trong cửa sổ TIER_TOL vẫn chạm đáy rãnh. */
const REST_RAY = BALL_R + TIER_TOL + 0.002
const DOWN = { x: 0, y: -1, z: 0 }

/** PRNG mulberry32: cùng seed thì cùng chuỗi số (dùng chung cho thế giới và agent). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad

export class FanrocWorld {
  readonly rapier: RAPIER.World
  readonly balls: BallState[]
  private readonly rnd: () => number
  /** Thứ tự ra khỏi hộp: hết xanh (tầng dưới) rồi tới cam (tầng trên đổ xuống). */
  private readonly releaseOrder: number[]
  private released = 0
  /** Collider của 4 núi, để biết bóng đang tựa lên núi hay lên sàn. */
  private readonly mountainColliders = new Set<number>()
  private lastSpawnX = Number.NaN

  private constructor(seed: number, balls: boolean) {
    this.rapier = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.rapier.timestep = PHYSICS_DT
    this.rnd = mulberry32(seed)
    this.balls = []
    const count = balls ? BALL_COUNT.o + BALL_COUNT.g : 0
    for (let i = 0; i < count; i++) this.balls.push({ color: i < BALL_COUNT.o ? 'o' : 'g', st: 'box', body: null })
    this.releaseOrder = []
    for (let i = BALL_COUNT.o; i < this.balls.length; i++) this.releaseOrder.push(i)
    for (let i = 0; i < Math.min(BALL_COUNT.o, this.balls.length); i++) this.releaseOrder.push(i)
    this.buildField()
    MOUNTAINS.forEach((m) => this.buildMountain(m))
    this.buildLadders()
    this.rapier.updateSceneQueries() // tally dò tia được cả trước bước vật lý đầu tiên
  }

  /** `opts.balls = false` ⇒ sân không bóng (`balls` rỗng, `release` không làm gì); mặc định có 300 bóng. */
  static async create(seed: number, opts: { balls?: boolean } = {}): Promise<FanrocWorld> {
    await RAPIER.init()
    return new FanrocWorld(seed, opts.balls ?? true)
  }

  private fixed(desc: RAPIER.ColliderDesc, friction = MTN_FRICTION): RAPIER.Collider {
    return this.rapier.createCollider(desc.setFriction(friction).setRestitution(0.3))
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

  /** Thang Cứu Hỏa (luật V4): mỗi liên minh một thanh xà (trụ bo đầu, cao LADDER.y) trên hai cột hộp 20×20 có kẹp Ø35, va chạm tĩnh. */
  private buildLadders(): void {
    for (const { a, b } of Object.values(LADDERS)) {
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      // Capsule của Rapier dọc trục y: xoay 90° quanh trục (uz, 0, −ux) để nằm theo hướng thanh.
      const k = Math.SQRT1_2 / len
      this.fixed(
        RAPIER.ColliderDesc.capsule(len / 2, LADDER.rodR)
          .setTranslation((a.x + b.x) / 2, LADDER.y, (a.z + b.z) / 2)
          .setRotation({ x: dz * k, y: 0, z: -dx * k, w: Math.SQRT1_2 }),
      )
      for (const p of [a, b]) {
        this.fixed(RAPIER.ColliderDesc.cuboid(LADDER.post / 2, LADDER.postH / 2, LADDER.post / 2).setTranslation(p.x, LADDER.postH / 2, p.z))
        // kẹp đầu cột Ø35 cao 65 mm, y 0,608…0,673 (CAD Part 37)
        this.fixed(RAPIER.ColliderDesc.cylinder(LADDER.clampH / 2, LADDER.clampR).setTranslation(p.x, LADDER.clampY0 + LADDER.clampH / 2, p.z))
      }
    }
  }

  /** Một núi: lưới tam giác CAD (vỏ mỏng: đáy rãnh + gờ 3–4 mm), va chạm tĩnh, xoay theo yaw của núi. */
  private buildMountain(m: { x: number; z: number; yaw: number }): void {
    const desc = RAPIER.ColliderDesc.trimesh(MESH_VERTICES, MESH_INDICES)
      .setTranslation(m.x, 0, m.z)
      .setRotation({ x: 0, y: Math.sin(m.yaw / 2), z: 0, w: Math.cos(m.yaw / 2) })
    this.mountainColliders.add(this.fixed(desc).handle)
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
    if (n === 0) return // sân không bóng
    const target = Math.min(n, Math.floor((n * Math.max(0, t)) / RELEASE_END) + 1)
    while (this.released < target) {
      const i = this.releaseOrder[this.released++]
      const b = this.balls[i]
      if (b.st !== 'box') continue
      const r = this.rnd
      let x = DISPENSER.x + (r() * 2 - 1) * OUTLET_HALF
      for (let k = 0; k < 4 && Math.abs(x - this.lastSpawnX) < SPAWN_GAP; k++) x = DISPENSER.x + (r() * 2 - 1) * OUTLET_HALF
      this.lastSpawnX = x
      this.placeBall(
        i,
        { x, y: DISPENSER.y + BALL_R, z: OUTLET_Z },
        { x: (r() - 0.5) * 1.2, y: 0, z: 0.5 + r() * 1.5 },
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
    if (b.st !== 'field') return // bóng đã loại / đang giữ không được hồi sinh
    this.freeBody(b)
    b.st = 'held'
  }

  /** Human Player nhặt bóng vào khay: bóng thành 'tray', xoá body. Chỉ bóng đang trên sân mới nhặt được. */
  trayBall(i: number): void {
    const b = this.balls[i]
    if (b.st !== 'field') return
    this.freeBody(b)
    b.st = 'tray'
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

  /** Tâm miệng lỗ cờ của từng núi (A..D) theo CAD, ở cao độ PEAK_Y. */
  holeCentres(): Vec3[] {
    return holeCentres().map((h) => ({ ...h, y: PEAK_Y }))
  }

  /** Chỉ số núi có hình bao chân (CAD 0.414 × 0.409, theo hệ núi) chứa điểm (x, z), hoặc -1. */
  inMountain(x: number, z: number): number {
    return mountainAt(x, z)
  }

  /**
   * Đếm bóng theo luật hình học: Khu Chữa Cháy (bóng chạm vạch cũng tính) và 3 rãnh của từng núi.
   * Bóng chỉ thuộc một tầng khi tia ngắn từ tâm bóng xuống chạm núi trước tiên (không phải sàn, robot hay bóng khác)
   * và tâm bóng trong ±TIER_TOL của đáy rãnh + BALL_R; rãnh tính điểm lấy từ TIER_GROOVE. Tầng trang trí (TIER_GROOVE −1):
   * chỉ đếm bóng cam vào `decorO`, bóng xanh bỏ qua (luật V4).
   * Bóng trong `robotsHolding` hoặc không ở 'field' không tính.
   */
  tally(robotsHolding: Set<number>): Omit<FieldTally, 'flags' | 'climbs'> {
    const fire = { o: 0, g: 0 }
    let decorO = 0
    const mtn = MOUNTAINS.map(() => [0, 1, 2].map(() => ({ g: 0, o: 0 })))
    this.balls.forEach((b, i) => {
      if (b.st !== 'field' || !b.body || robotsHolding.has(i)) return
      const p = b.body.translation()
      if (p.y < FIRE_MAX_Y && ZONES.fire.some((r) => inRect(r, p.x, p.z, BALL_R))) {
        fire[b.color]++
        return
      }
      const m = this.inMountain(p.x, p.z)
      if (m < 0) return
      let k = -1
      TIERS.forEach((t, j) => {
        const d = Math.abs(p.y - (t.floor + BALL_R))
        if (d <= TIER_TOL && (k < 0 || d < Math.abs(p.y - (TIERS[k].floor + BALL_R)))) k = j
      })
      if (k < 0) return
      const hit = this.rapier.castRay(new RAPIER.Ray(p, DOWN), REST_RAY, true, undefined, undefined, undefined, b.body)
      if (!hit || !this.mountainColliders.has(hit.collider.handle)) return
      const g = TIER_GROOVE[k]
      if (g >= 0) mtn[m][g][b.color]++
      else if (b.color === 'o') decorO++
    })
    return { fire, mtn, decorO }
  }
}
