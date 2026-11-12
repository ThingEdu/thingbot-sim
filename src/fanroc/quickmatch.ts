// Trận ngầm toàn agent (headless): 4 robot do Agent lái, Human Player tự động hai bên.
// Dùng cho giải đấu (trận chỉ có đội máy) và cho agent.test.ts. Không đụng DOM/Three.
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { HumanPlayer } from './human.ts'
import { Agent, type Skill } from './agent.ts'
import type { PortValues } from './ports.ts'
import type { FieldTally } from './scoring.ts'
import type { Penalty } from './match.ts'
import type { RobotConfig, RobotType } from './robots.ts'
import { defaultConfig } from './programs.ts'

type Alliance = 'red' | 'blue'
export type Seat = [Alliance, 0 | 1]

/** Thứ tự ghế của trang (src/fanroc/main.ts): Đỏ 0, Xanh 0, Đỏ 1, Xanh 1. */
export const SEATS: Seat[] = [['red', 0], ['blue', 0], ['red', 1], ['blue', 1]]

/**
 * Đội hình robot mặc định theo ghế SEATS (R162, anh Tuấn 12/11: "robot lúc xuất phát đa dạng"): Đỏ 1 Mẫu Maker (ghế của
 * em — em chọn robot khác thì robot của em thay), Xanh 1 Chuồn Chuồn Maker Hút, Đỏ 2 Kiến Lửa Xe Cắm Cờ, Xanh 2 Ong Vàng
 * Maker Nâng. Robot máy của cả bốn mẫu đều ghi điểm và leo xà ở mọi mức (agent.test.ts). Trận lẻ, Đấu tập và sân nền màn
 * chính dùng chung; nhiệm vụ 12 có đội hình riêng 4 Mẫu Maker (Mission.lineup).
 */
export const DEFAULT_LINEUP: readonly RobotType[] = ['maker', 'makerIntake', 'co', 'makerLift']
/** Cấu hình mặc định (đế đầu tiên của mẫu) của robot ở ghế `i` trong đội hình mặc định. */
export const lineupConfig = (i: number): RobotConfig => defaultConfig(DEFAULT_LINEUP[i])

export interface QuickOpts {
  cfgs: RobotConfig[]
  skills: Skill[]
  teams: string[]
  seed: number
  /** Thứ tự ghế; mặc định SEATS của trang. (agent.test.ts giữ thứ tự cũ của nó để số đo không đổi.) */
  order?: Seat[]
  /** Móc quan sát mỗi bước (agent.test dùng để đếm lệnh bánh vào vùng chết). */
  onStep?: (ports: PortValues[], match: Match) => void
  /**
   * Chạy từng lát chừng này ms rồi nhường luồng (setTimeout 0) — giải đấu chạy trận máy ngầm trên trang mà sân, nút
   * vẫn chạy mượt. Bỏ trống: chạy một mạch (phép thử). Kết quả không đổi: số bước vật lý vẫn y như vậy.
   */
  sliceMs?: number
}

export interface QuickResult {
  match: number
  /** Hệ số nhân của trận (phần trăm, 100…180). */
  multPct: number
  teams: { team: string; score: number; penalty: number }[]
  tally: FieldTally
  /** Ghế của từng phần tử trong teams (Đỏ/Xanh, slot). */
  seats: Seat[]
  /** Thế giới/trận đã giải phóng vật lý — chỉ để đọc sự kiện, cờ. */
  /** Chỉ để ĐỌC (sự kiện, cờ, phạt): thế giới đã giải phóng nên step()/mọi thứ chạy vật lý đều không hợp lệ. */
  matchObj: Match
}

/** Điểm phạt của một đội: 5·nhẹ + 10·vàng; thẻ đỏ ⇒ mất cả điểm trận. */
export function penaltyPoints(p: Penalty, matchScore: number): number {
  return p.red ? matchScore : 5 * p.minor + 10 * p.yellow
}

export async function playAgents(o: QuickOpts): Promise<QuickResult> {
  const order = o.order ?? SEATS
  const n = order.length
  if (o.cfgs.length !== n || o.skills.length !== n || o.teams.length !== n)
    throw new Error(`Trận ngầm cần ${n} cấu hình robot, ${n} mức agent và ${n} tên đội (nhận ${o.cfgs.length}/${o.skills.length}/${o.teams.length})`)
  const w = await FanrocWorld.create(o.seed)
  try {
    const robots = order.map(([a, slot], i) => new RobotBody(w, o.cfgs[i], a, slot))
    const m = new Match(w, robots, o.teams, { seed: o.seed })
    const humans = (['red', 'blue'] as const).map((a) => new HumanPlayer(a))
    humans.forEach((h) => (h.onEvent = (s) => m.log(s)))
    const agents = robots.map((r, i) => new Agent(r, o.cfgs[i], o.skills[i], o.seed * 10 + i))
    let t0 = performance.now()
    while (m.phase !== 'end') {
      if (o.sliceMs !== undefined && performance.now() - t0 >= o.sliceMs) {
        await new Promise((ok) => setTimeout(ok, 0))
        t0 = performance.now()
      }
      const view = { world: w, robots, match: m, humans }
      const ports = agents.map((a) => a.update(view, PHYSICS_DT))
      o.onStep?.(ports, m)
      for (const h of humans) h.auto({ world: w, robots, phase: m.phase }, PHYSICS_DT)
      m.step(PHYSICS_DT, ports)
    }
    const r = m.result()
    const teams = r.teams.map((t, i) => {
      const p = m.pens[i]
      return { team: t.team, score: t.score, penalty: penaltyPoints(p, r.score.total) }
    })
    return { match: r.score.total, multPct: r.score.multPct, teams, tally: m.tally(), seats: order, matchObj: m }
  } finally {
    w.rapier.free()
  }
}
