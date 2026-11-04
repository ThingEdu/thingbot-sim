// Trận ngầm toàn agent (headless): 4 robot do Agent lái, Human Player tự động hai bên.
// Dùng cho giải đấu (trận chỉ có đội máy) và cho agent.test.ts. Không đụng DOM/Three.
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import { Match } from './match.ts'
import { HumanPlayer } from './human.ts'
import { Agent, type Skill } from './agent.ts'
import type { PortValues } from './ports.ts'
import type { FieldTally } from './scoring.ts'
import type { RobotConfig } from './robots.ts'

type Alliance = 'red' | 'blue'
export type Seat = [Alliance, 0 | 1]

/** Thứ tự ghế của trang (src/fanroc/main.ts): Đỏ 0, Xanh 0, Đỏ 1, Xanh 1. */
export const SEATS: Seat[] = [['red', 0], ['blue', 0], ['red', 1], ['blue', 1]]

export interface QuickOpts {
  cfgs: RobotConfig[]
  skills: Skill[]
  teams: string[]
  seed: number
  /** Thứ tự ghế; mặc định SEATS của trang. (agent.test.ts giữ thứ tự cũ của nó để số đo không đổi.) */
  order?: Seat[]
  /** Móc quan sát mỗi bước (agent.test dùng để đếm lệnh bánh vào vùng chết). */
  onStep?: (ports: PortValues[], match: Match) => void
}

export interface QuickResult {
  match: number
  teams: { team: string; score: number; penalty: number }[]
  tally: FieldTally
  /** Ghế của từng phần tử trong teams (Đỏ/Xanh, slot). */
  seats: Seat[]
  /** Thế giới/trận đã giải phóng vật lý — chỉ để đọc sự kiện, cờ. */
  matchObj: Match
}

export async function playAgents(o: QuickOpts): Promise<QuickResult> {
  const order = o.order ?? SEATS
  const w = await FanrocWorld.create(o.seed)
  try {
    const robots = order.map(([a, slot], i) => new RobotBody(w, o.cfgs[i], a, slot))
    const m = new Match(w, robots, o.teams, { seed: o.seed })
    const humans = (['red', 'blue'] as const).map((a) => new HumanPlayer(a))
    humans.forEach((h) => (h.onEvent = (s) => m.log(s)))
    const agents = robots.map((r, i) => new Agent(r, o.cfgs[i], o.skills[i], o.seed * 10 + i))
    while (m.phase !== 'end') {
      const view = { world: w, robots, match: m, humans }
      const ports = agents.map((a) => a.update(view, PHYSICS_DT))
      o.onStep?.(ports, m)
      for (const h of humans) h.auto({ world: w, robots, phase: m.phase, endgame: m.endgame }, PHYSICS_DT)
      m.step(PHYSICS_DT, ports)
    }
    const r = m.result()
    const teams = r.teams.map((t, i) => {
      const p = m.pens[i]
      return { team: t.team, score: t.score, penalty: p.red ? r.score.total : 5 * p.minor + 10 * p.yellow }
    })
    return { match: r.score.total, teams, tally: m.tally(), seats: order, matchObj: m }
  } finally {
    w.rapier.free()
  }
}
