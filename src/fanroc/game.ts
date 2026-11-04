// Phiên chơi FANROC (GameSession): vòng lặp trận tách khỏi trang, dùng chung cho mọi màn (trang chủ, Xưởng, nhiệm vụ,
// giải đấu). Gom thế giới vật lý + robot + trận + Human Player + người lái từng ghế (chương trình khối qua RobotLink
// hay agent), và chạy vật lý theo bước cố định PHYSICS_DT. Không đụng DOM / three.js: chạy được trong Node.
//
// Ba chế độ:
//   - 'match': 10 s xả bóng rồi 180 s; chương trình đã nạp chỉ chạy khi hết 10 s xả bóng; Human Player tự động.
//   - 'practice': xả bóng tua sẵn lúc tạo (R31), không hết giờ, không phạt; chương trình chạy ngay.
//   - 'mission': chỉ robot ghế 0 (đỏ, `start`), không Human Player; mặc định sân không bóng; có bóng (nhiệm vụ 9)
//     thì xả bóng tua sẵn lúc tạo như luyện tập (R60). Không hết giờ — giờ nhiệm vụ do trang chấm (shouldGrade).
//
// Tạm dừng (spec §6.1b): vật lý, đồng hồ trận, agent, Human Player cùng đứng vì `advance` không chạy bước nào; mọi bo
// ảo đang chạy cũng tạm dừng. Chạy từng khối: mọi bo ảo chạy hết khối kế (`RobotLink.step`), rồi sân chạy đúng bằng
// thời gian ảo bo đã đi (khối `đợi 1 giây` ⇒ sân chạy 1 giây), tối đa STEP_MAX_S.
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { HumanPlayer } from './human.ts'
import { Agent, type Skill } from './agent.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import { SEATS } from './quickmatch.ts'
import type { Pose } from './layout.ts'
import type { RobotConfig } from './robots.ts'
import type { RobotLink } from './link.ts'

export type Driver =
  /** Chương trình khối (Xưởng / nhiệm vụ / mặc định): robot đi theo cổng của bo ảo; chưa chạy / dừng / lỗi ⇒ đứng yên. */
  | { kind: 'program'; link: RobotLink }
  | { kind: 'agent'; skill: Skill }
export type SeatSpec = { cfg: RobotConfig; team: string; driver: Driver }
export type GameMode = 'match' | 'practice' | 'mission'

/** Chạy từng khối: sân chạy tối đa chừng này giây cho một khối (khối `đợi` rất dài, hay `loop()` rỗng). */
export const STEP_MAX_S = 5
/** Link đang thuộc phiên nào (phiên mới nhận link ⇒ phiên cũ dispose không dừng nó). */
const owner = new WeakMap<RobotLink, GameSession>()

export interface CreateOpts {
  mode: GameMode
  /** Thứ tự ghế [Đỏ 0, Xanh 0, Đỏ 1, Xanh 1] (SEATS). 'match' / 'practice' cần đủ 4; 'mission' chỉ dùng ghế 0. */
  seats: SeatSpec[]
  seed: number
  /** Có bóng không; mặc định có, trừ 'mission'. */
  balls?: boolean
  /** 'mission': tư thế xuất phát của robot ghế 0. */
  start?: Pose
}

/** Giới hạn một lần `advance` (vòng khung hình của trang): số bước tối đa, ngân sách ms thật. */
export interface AdvanceLimit {
  steps?: number
  ms?: number
}

export class GameSession {
  readonly mode: GameMode
  readonly seed: number
  readonly world: FanrocWorld
  readonly robots: RobotBody[]
  readonly match: Match
  readonly humans: HumanPlayer[]
  readonly cfgs: RobotConfig[]
  /** Cổng của từng robot ở bước vật lý gần nhất (bảng điểm, vệt, cảnh vẽ). */
  readonly ports: PortValues[]
  paused = false
  /** Gọi sau mỗi bước vật lý (nhiệm vụ: ghi vệt, xét lúc chấm). */
  onStep?: (g: GameSession) => void

  private readonly drivers: Driver[]
  private readonly agents: (Agent | null)[]
  private acc = 0
  private disposed = false
  private stepPromise: Promise<void> | null = null

  static async create(o: CreateOpts): Promise<GameSession> {
    const mission = o.mode === 'mission'
    const seats = mission ? o.seats.slice(0, 1) : o.seats
    if (mission ? seats.length < 1 : seats.length !== SEATS.length)
      throw new Error(mission ? 'Nhiệm vụ cần ghế 0' : `Trận cần đủ ${SEATS.length} ghế (nhận ${seats.length})`)
    const world = await FanrocWorld.create(o.seed, { balls: o.balls ?? !mission })
    try {
      const robots = seats.map((s, i) => new RobotBody(world, s.cfg, SEATS[i][0], SEATS[i][1]))
      // Luyện tập và nhiệm vụ: Match tua xả bóng ngay trong constructor (R31 / R60), không hết giờ, không phạt.
      const match = new Match(world, robots, seats.map((s) => s.team), { seed: o.seed, practice: o.mode !== 'match' })
      if (mission && o.start) robots[0].setPose(o.start)
      return new GameSession(o.mode, o.seed, world, robots, match, seats)
    } catch (e) {
      world.rapier.free()
      throw e
    }
  }

  private constructor(mode: GameMode, seed: number, world: FanrocWorld, robots: RobotBody[], match: Match, seats: SeatSpec[]) {
    this.mode = mode
    this.seed = seed
    this.world = world
    this.robots = robots
    this.match = match
    this.cfgs = seats.map((s) => ({ ...s.cfg }))
    this.ports = robots.map(() => NEUTRAL)
    this.humans = mode === 'mission' ? [] : (['red', 'blue'] as const).map((a) => new HumanPlayer(a))
    for (const h of this.humans) h.onEvent = (s) => match.log(s)
    this.drivers = seats.map((s) => s.driver)
    for (const l of this.links()) owner.set(l, this)
    this.agents = seats.map((s, i) => this.agentFor(i, s.driver))
  }

  /** Chương trình khối được phép chạy lúc này: không tạm dừng, và trận ('match') đã qua 10 s xả bóng, chưa hết giờ. */
  get canRun(): boolean {
    if (this.disposed || this.paused) return false
    return this.mode !== 'match' || this.match.phase === 'play'
  }

  /** Có bo ảo nào của ghế "chương trình" đang có chương trình (đã nạp / chạy / tạm dừng) — R24 khoá tốc độ ×1. */
  get programActive(): boolean {
    return this.links().some((l) => l.state === 'loaded' || l.state === 'running' || l.state === 'paused')
  }

  driver(i: number): Driver {
    return this.drivers[i]
  }

  /** Đổi người lái ghế i giữa trận (cùng robot). Agent mới bắt đầu lại từ đầu; đang tạm dừng thì bo ảo cũng dừng. */
  setDriver(i: number, d: Driver): void {
    if (i < 0 || i >= this.robots.length) return
    this.drivers[i] = d
    if (d.kind === 'program') owner.set(d.link, this)
    this.agents[i] = this.agentFor(i, d)
    this.ports[i] = NEUTRAL
    if (this.paused && d.kind === 'program') void d.link.pause()
  }

  /**
   * Chạy vật lý theo thời gian thực `dtReal` (s) × tốc độ `speed`; trả số bước đã chạy. Không chạy khi tạm dừng / hết
   * giờ. Chạm `limit` (bước hoặc ms) thì phần dư bỏ đi để không "xoáy chết".
   */
  advance(dtReal: number, speed: number, limit: AdvanceLimit = {}): number {
    if (this.paused || this.disposed || this.ended()) {
      this.acc = 0
      return 0
    }
    this.acc += Math.max(0, dtReal) * Math.max(0, speed)
    const max = limit.steps ?? Infinity
    const t0 = limit.ms === undefined ? 0 : performance.now()
    const overBudget = () => limit.ms !== undefined && performance.now() - t0 >= limit.ms
    let n = 0
    while (this.acc >= PHYSICS_DT - 1e-9 && n < max && !this.ended() && !overBudget()) {
      this.tick()
      this.acc -= PHYSICS_DT
      n++
    }
    if (n >= max || this.ended() || overBudget()) this.acc = 0
    if (n === 0) this.startLoaded() // cổng mở mà chưa đủ một bước: vẫn cho chương trình chạy
    return n
  }

  /**
   * Chạy từng khối: tạm dừng, gửi step cho mọi bo ảo của ghế "chương trình" (đang chạy / tạm dừng, hoặc đã nạp khi cổng
   * mở), chờ trả lời, rồi chạy vật lý đúng bằng thời gian ảo đã đi (Δ virtualT lớn nhất trong các bo, tối đa STEP_MAX_S)
   * với cổng giữ nguyên lệnh trong lúc khối đó chạy. Không có bo nào để bước ⇒ không chạy vật lý.
   */
  stepBlock(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.stepPromise) return this.stepPromise
    const gateOpen = this.mode !== 'match' || this.match.phase === 'play'
    const pausing = this.pauseAll()
    const links = this.links().filter((l) => l.state === 'paused' || (l.state === 'loaded' && gateOpen))
    if (!links.length) return Promise.resolve()
    // Chạy tiếp (resume) giữa chừng ⇒ bỏ phần sân của bước này: vòng khung hình đã chạy sân theo thời gian thật.
    const aborted = () => this.disposed || !this.paused
    const run = async () => {
      // Đang chạy thì chờ bo dừng hẳn trước: thời gian ảo bo chạy tiếp tới lúc nhận pause không tính vào khối này.
      await Promise.all(pausing)
      if (aborted()) return
      const before = links.map((l) => l.virtualT)
      await Promise.all(links.map((l) => l.step()))
      if (aborted()) return
      const us = Math.max(0, ...links.map((l, k) => l.virtualT - before[k]))
      const n = Math.round(Math.min(STEP_MAX_S, us / 1e6) / PHYSICS_DT)
      for (let k = 0; k < n && !this.ended() && !aborted(); k++) this.tick()
    }
    this.stepPromise = run().finally(() => (this.stepPromise = null))
    return this.stepPromise
  }

  /** Đang chạy từng khối (chờ bo ảo trả lời / chạy sân của khối): trang khoá nút Tạm dừng / Chạy tiếp. */
  get stepping(): boolean {
    return this.stepPromise !== null
  }

  pause(): void {
    void this.pauseAll()
  }

  resume(): void {
    if (this.disposed) return
    this.paused = false
    this.acc = 0
    for (const l of this.links()) l.resume()
  }

  /**
   * Kết thúc phiên: dừng các bo ảo phiên này còn giữ (link đã được phiên mới nhận thì để nguyên), giải phóng Rapier.
   * Sau đó advance / stepBlock không làm gì.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const l of this.links()) if (owner.get(l) === this) (owner.delete(l), l.stop())
    this.world.rapier.free()
  }

  // ---------- Bên trong ----------

  /** Hết giờ (đọc lại mỗi lần: `tick` đổi pha). */
  private ended(): boolean {
    return this.match.phase === 'end'
  }

  /** Tạm dừng phiên và mọi bo ảo đang chạy; trả lời hứa của từng bo (xong khi bo đã dừng). */
  private pauseAll(): Promise<void>[] {
    this.paused = true
    this.acc = 0
    return this.links().map((l) => l.pause())
  }

  private links(): RobotLink[] {
    return this.drivers.flatMap((d) => (d.kind === 'program' ? [d.link] : []))
  }

  private agentFor(i: number, d: Driver): Agent | null {
    return d.kind === 'agent' ? new Agent(this.robots[i], this.cfgs[i], d.skill, this.seed * 10 + i) : null
  }

  /** Chương trình đã nạp và đang chờ thì chạy khi cổng mở. */
  private startLoaded(): void {
    if (!this.canRun) return
    for (const l of this.links()) if (l.state === 'loaded') l.start()
  }

  /** Một bước vật lý: mở chương trình đang chờ (nếu cổng mở) → cổng từng ghế → Human Player tự động → trận. */
  private tick(): void {
    this.startLoaded()
    const view = { world: this.world, robots: this.robots, match: this.match, humans: this.humans }
    this.drivers.forEach((d, i) => {
      this.ports[i] = d.kind === 'program' ? d.link.ports() : this.agents[i]!.update(view, PHYSICS_DT)
    })
    const ctx = { world: this.world, robots: this.robots, phase: this.match.phase, endgame: this.match.endgame }
    for (const h of this.humans) h.auto(ctx, PHYSICS_DT)
    this.match.step(PHYSICS_DT, this.ports)
    this.onStep?.(this)
  }
}
