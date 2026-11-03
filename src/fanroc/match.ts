// Trận đấu FANROC: 10 s xả bóng (robot đứng yên) → 180 s thi đấu (End Game = 30 s cuối) → hết giờ (G12, robot đóng băng).
// Luyện tập (ruling R31): 10 s xả bóng chạy tua ngay lúc tạo trận (không vẽ, robot đứng yên), trận bắt đầu ở t = 0, không hết giờ.
// Chấm điểm một lần lúc t = 180 từ thế giới vật lý; trọng tài tự động chỉ ghi các lỗi máy thấy được (spec §4.5, §4.7, §5).
// Không đồ hoạ: chạy được trong Node.
import { PHYSICS_DT, type FanrocWorld } from './world.ts'
import type { RobotBody, Vec2 } from './robot.ts'
import { ENDGAME_S, FIELD, MATCH_S, RELEASE_S, ZONES, mountainAt, type Phase, type Rect } from './layout.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import { scoreTally, teamScore, type FieldTally, type Park, type ScoreBreakdown } from './scoring.ts'

// ---------- Thời gian trận và ngưỡng trọng tài (gom một chỗ) ----------
const EPS = 1e-9
/** Lỗi chỉ được tính lại khi điều kiện đã hết ít nhất chừng này giây (một đợt). */
const REARM_S = 1
/** P12: phần footprint chồng hình chiếu núi và độ cao thân so với sàn. */
const CLIMB_OVERLAP = 0.3
/** Gốc thân robot nằm ở sàn (setPose đặt y = 0.002, nghỉ ≈ 0), nên y > 0.03 tuyệt đối = cao hơn lúc nghỉ ~0.03. */
const CLIMB_Y = 0.03
/** Lưới điểm lấy mẫu footprint để ước lượng phần chồng lên núi. */
const SAMPLES = 5
/** P10: cờ coi như nằm trên sàn khi tâm thấp hơn chừng này. */
const FLAG_FLOOR_Y = 0.05
/**
 * G15 (ruling R19): chỉ giữa hai robot khác liên minh, khe thân < BLOCK_GAP, cả hai chậm hơn BLOCK_V, kéo dài hơn BLOCK_S;
 * không tính khi một trong hai có góc trong Vùng Bảo Vệ / Khu Tiếp Tế của mình.
 */
const BLOCK_GAP = 0.02
const BLOCK_V = 0.02
const BLOCK_S = 5
/** S02: góc footprint vượt mặt trong rào quá chừng này (thân tựa rào lún ~1 mm do vật lý, Khu Xuất Phát sát rào). */
const OUT_TOL = 0.005
const MOUNTAIN_NAME = ['A', 'B', 'C', 'D']

export type MatchEvent = { t: number; robot: number | null; text: string }
export type Penalty = { minor: number; yellow: number; red: boolean }

/** Một đợt lỗi: báo một lần khi điều kiện bật lên, chỉ mở lại khi điều kiện đã tắt ≥ REARM_S. */
class Episode {
  private active = false
  private off = 0
  /** true đúng lúc một đợt mới bắt đầu. */
  update(cond: boolean, dt: number): boolean {
    if (cond) {
      this.off = 0
      if (this.active) return false
      this.active = true
      return true
    }
    if (this.active) {
      this.off += dt
      if (this.off >= REARM_S - EPS) this.active = false
    }
    return false
  }
}

const inRect = (r: Rect, p: Vec2) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1

/** Đang đỗ hoặc đang được nạp bóng: có góc footprint trong Vùng Bảo Vệ / Khu Tiếp Tế của liên minh mình. */
const inOwnZone = (r: RobotBody, fp: Vec2[]) =>
  fp.some((p) => inRect(ZONES.safe[r.alliance], p) || inRect(ZONES.load[r.alliance], p))

/** Đỗ theo footprint ∩ Vùng Bảo Vệ của liên minh mình: mọi góc trong = full, ≥ 1 góc = partial. */
function parkState(r: RobotBody): Park {
  const zone = ZONES.safe[r.alliance]
  const n = r.footprint().filter((p) => inRect(zone, p)).length
  return n === 4 ? 'full' : n > 0 ? 'partial' : null
}

/** Phần footprint (lấy mẫu lưới) nằm trong hình chiếu một núi nào đó. */
function mountainOverlap(fp: Vec2[]): number {
  const [a, b, c, d] = fp // trước trái, trước phải, sau phải, sau trái
  let hit = 0
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      const u = (i + 0.5) / SAMPLES
      const v = (j + 0.5) / SAMPLES
      const fx = a.x + (b.x - a.x) * u
      const fz = a.z + (b.z - a.z) * u
      const bx = d.x + (c.x - d.x) * u
      const bz = d.z + (c.z - d.z) * u
      if (mountainAt(fx + (bx - fx) * v, fz + (bz - fz) * v) >= 0) hit++
    }
  }
  return hit / (SAMPLES * SAMPLES)
}

/** Điểm p nằm trong tứ giác lồi q (thứ tự vòng). */
function inPoly(q: Vec2[], p: Vec2): boolean {
  let sign = 0
  for (let k = 0; k < q.length; k++) {
    const a = q[k]
    const b = q[(k + 1) % q.length]
    const cr = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)
    if (Math.abs(cr) < 1e-12) continue
    if (sign === 0) sign = Math.sign(cr)
    else if (Math.sign(cr) !== sign) return false
  }
  return true
}

function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}

/** Khe nhỏ nhất giữa hai hình chữ nhật footprint; 0 khi chồng nhau. */
function gap(p: Vec2[], q: Vec2[]): number {
  if (p.some((v) => inPoly(q, v)) || q.some((v) => inPoly(p, v))) return 0
  let d = Infinity
  for (const [s, t] of [[p, q], [q, p]]) {
    for (const v of s) for (let k = 0; k < t.length; k++) d = Math.min(d, segDist(v, t[k], t[(k + 1) % t.length]))
  }
  // Hai hình chữ nhật cắt nhau thành chữ thập (không đỉnh nào lọt vào hình kia) vẫn cho d > 0 sai; trường hợp này
  // cần hai thân xuyên nhau nên vật lý không để xảy ra — bỏ qua.
  return d
}

const speed = (r: RobotBody) => {
  const v = r.body.linvel()
  return Math.hypot(v.x, v.z)
}

export class Match {
  /** −10 … 0: xả bóng; 0 … 180: thi đấu. */
  t = -RELEASE_S
  phase: Phase = 'release'
  endgame = false
  readonly events: MatchEvent[] = []
  readonly pens: Penalty[]
  readonly flags = [false, false, false, false]

  private readonly world: FanrocWorld
  private readonly robots: RobotBody[]
  private readonly teams: string[]
  /** Luyện tập: không hết giờ, không phạt, không có giai đoạn xả bóng nhìn thấy được. */
  readonly practice: boolean
  private final: { tally: FieldTally; score: ScoreBreakdown } | null = null
  private readonly climbWarned: boolean[]
  private readonly climb: Episode[]
  private readonly out: Episode[]
  private readonly flagRun: Episode[]
  /** G15 theo cặp robot (i < j): thời gian đứng sát nhau và đợt lỗi. */
  private readonly block = new Map<string, { time: number; ep: Episode }>()
  /** Thời điểm gần nhất robot còn chạy (tốc độ ≥ BLOCK_V); −∞ nếu chưa chạy lần nào. */
  private readonly lastMoving: number[]

  /** `opts.seed` giữ theo giao diện của kế hoạch; nhiễu do thế giới (FanrocWorld.create(seed)) lo, Match không dùng. */
  constructor(world: FanrocWorld, robots: RobotBody[], teams: string[], opts: { practice?: boolean; seed: number }) {
    if (teams.length !== robots.length) throw new Error(`Cần ${robots.length} tên đội (mỗi robot một đội), nhận ${teams.length}`)
    this.world = world
    this.robots = robots
    this.teams = teams
    this.practice = opts.practice ?? false
    this.pens = robots.map(() => ({ minor: 0, yellow: 0, red: false }))
    this.climbWarned = robots.map(() => false)
    this.climb = robots.map(() => new Episode())
    this.out = robots.map(() => new Episode())
    this.flagRun = robots.map(() => new Episode())
    this.lastMoving = robots.map(() => -Infinity)
    robots.forEach((r, i) => {
      r.onFlag = (m) => {
        this.flags[m] = true
        this.log(`Robot ${i + 1} cắm cờ Núi ${MOUNTAIN_NAME[m]}`, i)
      }
    })
    if (this.practice) this.skipRelease()
  }

  /** Luyện tập: tua hết 10 s xả bóng ngay (bóng rơi xong, robot đứng yên) để chương trình chạy được từ t = 0. */
  private skipRelease(): void {
    while (this.phase === 'release') this.step(PHYSICS_DT, [])
    this.t = 0 // cộng dồn dt lệch ~1e-13
  }

  /** Ghi một sự kiện (trọng tài, cờ, Human Player qua onEvent…) kèm thời điểm trận. */
  log(text: string, robot: number | null = null): void {
    this.events.push({ t: this.t, robot, text })
  }

  /** Đặt cờ đã cắm trên núi m (dựng trạng thái sân trong phép thử). */
  setFlag(m: number): void {
    this.flags[m] = true
  }

  step(dt: number, ports: PortValues[]): void {
    this.syncPhase() // t có thể được đặt thẳng (bảng điều khiển / phép thử)
    const playing = this.phase === 'play'
    this.robots.forEach((r, i) => {
      r.apply(playing ? (ports[i] ?? NEUTRAL) : NEUTRAL, dt)
      if (this.phase === 'end') this.freeze(r)
    })
    if (this.phase === 'release') this.world.release(this.t + RELEASE_S)
    this.world.step(dt)
    if (this.phase !== 'end') this.t += dt
    this.syncPhase()
    if (this.phase !== 'play') return
    const endgame = !this.practice && MATCH_S - this.t <= ENDGAME_S + EPS
    if (endgame && !this.endgame) this.log('End Game: còn 30 giây')
    this.endgame = endgame
    for (const r of this.robots) r.parked = parkState(r) !== null && this.endgame
    this.referee(dt)
    if (!this.practice && this.t >= MATCH_S - EPS) this.finish()
  }

  /** Hết 10 s xả bóng ⇒ thi đấu. */
  private syncPhase(): void {
    if (this.phase === 'release' && this.t >= -EPS) {
      this.phase = 'play'
      this.log(this.practice ? 'Luyện tập: bóng đã xả xong — robot chạy được ngay' : 'Hết 10 giây xả bóng — bắt đầu thi đấu')
    }
  }

  /** Hết giờ (G12): chốt điểm một lần, robot đứng yên từ đây. */
  private finish(): void {
    this.t = MATCH_S
    this.phase = 'end'
    for (const r of this.robots) this.freeze(r)
    const tally = this.tally()
    this.final = { tally, score: scoreTally(tally) }
    this.log(`Hết giờ — điểm trận ${this.final.score.total}`)
  }

  private freeze(r: RobotBody): void {
    r.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    r.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  /** Trạng thái sân để chấm: sau t = 180 là bản đã chốt, trước đó là bản tức thời (cho bảng điểm). */
  tally(): FieldTally {
    if (this.final) return structuredClone(this.final.tally)
    const held = new Set<number>()
    for (const r of this.robots) {
      for (const i of r.stored) held.add(i)
      if (r.compartments) for (const i of [...r.compartments.o, ...r.compartments.g]) held.add(i)
    }
    const parks: FieldTally['parks'] = { red: [null, null], blue: [null, null] }
    for (const r of this.robots) parks[r.alliance][r.slot] = parkState(r)
    return { ...this.world.tally(held), flags: [...this.flags], parks }
  }

  result(): { score: ScoreBreakdown; teams: { team: string; score: number }[] } {
    const score = this.final ? { ...this.final.score } : scoreTally(this.tally())
    return { score, teams: this.teams.map((team, i) => ({ team, score: teamScore(score.total, this.pens[i]) })) }
  }

  // ---------- Trọng tài ----------

  /** Ghi lỗi; luyện tập thì chỉ ghi, không phạt. */
  private foul(i: number, text: string, pen: 'warn' | 'minor' | 'yellow'): void {
    const what = pen === 'warn' ? 'cảnh cáo' : pen === 'minor' ? 'lỗi nhẹ (−5)' : 'thẻ vàng (−10)'
    if (this.practice) {
      this.log(`Robot ${i + 1} ${text}: ${what} (luyện tập, không phạt)`, i)
      return
    }
    if (pen === 'minor') this.pens[i].minor++
    if (pen === 'yellow') this.pens[i].yellow++
    this.log(`Robot ${i + 1} ${text}: ${what}`, i)
  }

  private referee(dt: number): void {
    const fps = this.robots.map((r) => r.footprint())
    this.robots.forEach((r, i) => {
      const fp = fps[i]
      // P12 leo núi.
      const climbing = r.body.translation().y > CLIMB_Y && mountainOverlap(fp) > CLIMB_OVERLAP
      if (this.climb[i].update(climbing, dt)) {
        this.foul(i, 'leo núi (P12)', this.climbWarned[i] ? 'minor' : 'warn')
        this.climbWarned[i] = true
      }
      // S02 vươn ra ngoài rào.
      const outside = fp.some((p) => Math.abs(p.x) > FIELD / 2 + OUT_TOL || Math.abs(p.z) > FIELD / 2 + OUT_TOL)
      if (this.out[i].update(outside, dt)) this.foul(i, 'vươn ra ngoài rào (S02)', 'yellow')
      // P10 cán cờ nằm trên sàn (cờ của robot khác; tới nhặt lại cờ của mình không phải cán cờ).
      const onFlag = this.robots.some((o, k) => {
        if (k === i) return false
        const f = o.flagBody?.translation()
        return f !== undefined && f.y < FLAG_FLOOR_Y && inPoly(fp, f)
      })
      if (this.flagRun[i].update(onFlag, dt)) this.foul(i, 'cán cờ trên sàn (P10)', 'warn')
    })
    // G15 chặn robot khác liên minh quá 5 s. Lỗi thuộc robot tới sau (còn chạy gần nhất trước khi cả hai đứng);
    // cùng dừng một bước (không phân định được) ⇒ cảnh cáo cả hai, không thẻ.
    this.robots.forEach((r, i) => {
      if (speed(r) >= BLOCK_V) this.lastMoving[i] = this.t
    })
    for (let i = 0; i < this.robots.length; i++) {
      for (let j = i + 1; j < this.robots.length; j++) {
        const a = this.robots[i]
        const b = this.robots[j]
        if (a.alliance === b.alliance) continue
        const key = `${i}-${j}`
        let s = this.block.get(key)
        if (!s) this.block.set(key, (s = { time: 0, ep: new Episode() }))
        const close = gap(fps[i], fps[j]) < BLOCK_GAP && speed(a) < BLOCK_V && speed(b) < BLOCK_V &&
          !inOwnZone(a, fps[i]) && !inOwnZone(b, fps[j])
        s.time = close ? s.time + dt : 0
        if (!s.ep.update(s.time > BLOCK_S, dt)) continue
        const li = this.lastMoving[i]
        const lj = this.lastMoving[j]
        if (li === lj) {
          this.foul(i, `sát Robot ${j + 1} quá 5 giây (G15), không rõ robot nào chặn`, 'warn')
          this.foul(j, `sát Robot ${i + 1} quá 5 giây (G15), không rõ robot nào chặn`, 'warn')
        } else {
          const [x, y] = li > lj ? [i, j] : [j, i]
          this.foul(x, `chặn Robot ${y + 1} quá 5 giây (G15)`, 'yellow')
        }
      }
    }
  }
}
