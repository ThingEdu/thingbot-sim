// Giải đấu FANROC (thuần): bốc thăm lịch, ghi kết quả, xếp hạng theo luật mục E.
// Không biết gì về sân/luật chơi cụ thể — chỉ điểm từng trận; mùa giải khác có thể cấp MACHINE_TEAMS riêng.
import { mulberry32 } from './world.ts'
import type { Skill } from './agent.ts'
import type { RobotConfig, RobotType } from './robots.ts'

export type Entrant = { id: string; name: string; kind: 'player' | 'machine'; robot: RobotConfig; skill?: Skill; player?: 0 | 1 }
export type Slot = { red: [string, string]; blue: [string, string] } // id đội
export type Played = { teams: Record<string, { score: number; penalty: number }>; matchScore: number }
export interface TournamentState { version: 1; seed: number; perTeam: number; entrants: Entrant[]; schedule: Slot[]; results: (Played | null)[] }
export type Standing = { id: string; rank: number; total: number; best: number; penalty: number; counted: number[]; tieDraw: boolean }

export const TEAM_COUNT = 8

/** 7 đội máy (đủ cho 1 người chơi; 2 người chơi dùng 6 đầu), tên tiếng Việt, trộn mức Dễ/Vừa/Khó. */
export const MACHINE_TEAMS: { name: string; skill: Skill; robot: RobotType }[] = [
  { name: 'Rùa Vàng', skill: 'easy', robot: 'maker' },
  { name: 'Sóc Nâu', skill: 'easy', robot: 'ui' },
  { name: 'Cú Mèo', skill: 'medium', robot: 'co' },
  { name: 'Báo Đốm', skill: 'medium', robot: 'sort' },
  { name: 'Đại Bàng', skill: 'hard', robot: 'maker' },
  { name: 'Sói Xám', skill: 'hard', robot: 'ui' },
  { name: 'Hổ Mun', skill: 'medium', robot: 'co' },
]

const DEFAULT_DRIVE = { maker: 'diff2', ui: 'diff2', co: 'diff2', sort: 'diff2' } as const

export function createTournament(o: { players: Omit<Entrant, 'id' | 'kind'>[]; perTeam: number; seed: number }): TournamentState {
  if (!Number.isInteger(o.perTeam) || o.perTeam < 4 || o.perTeam > 10) throw new Error('perTeam phải từ 4 đến 10')
  if (o.players.length < 1 || o.players.length > 2) throw new Error('cần 1–2 người chơi')
  const entrants: Entrant[] = o.players.map((p, i) => ({ ...p, id: `p${i}`, kind: 'player', player: p.player ?? (i as 0 | 1) }))
  const need = TEAM_COUNT - entrants.length
  for (let i = 0; i < need; i++) {
    const m = MACHINE_TEAMS[i]
    entrants.push({ id: `m${i}`, name: m.name, kind: 'machine', skill: m.skill, robot: { type: m.robot, drive: DEFAULT_DRIVE[m.robot], actuator: 'tt' } })
  }
  const rnd = mulberry32(o.seed)
  const schedule: Slot[] = []
  for (let r = 0; r < o.perTeam; r++) {
    const ids = entrants.map((e) => e.id)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    schedule.push({ red: [ids[0], ids[1]], blue: [ids[2], ids[3]] }, { red: [ids[4], ids[5]], blue: [ids[6], ids[7]] })
  }
  return { version: 1, seed: o.seed, perTeam: o.perTeam, entrants, schedule, results: schedule.map(() => null) }
}

/** Chỉ số trận đầu tiên chưa có kết quả; null khi xong giải. Trận dở không bao giờ nằm trong results. */
export function nextMatch(s: TournamentState): number | null {
  const i = s.results.findIndex((r) => r === null)
  return i < 0 ? null : i
}

export function record(s: TournamentState, i: number, p: Played): TournamentState {
  if (i < 0 || i >= s.schedule.length) throw new Error(`không có trận ${i}`)
  const results = s.results.slice()
  results[i] = p
  return { ...s, results }
}

/** Xếp hạng luật mục E: tổng điểm; số trận lệch ⇒ chuẩn = ít nhất, bỏ các trận thấp nhất; hoà ⇒ best, ít phạt, bốc thăm. */
export function standings(s: TournamentState): Standing[] {
  const per = new Map<string, { scores: number[]; penalty: number }>()
  s.entrants.forEach((e) => per.set(e.id, { scores: [], penalty: 0 }))
  for (const r of s.results) {
    if (!r) continue
    for (const [id, t] of Object.entries(r.teams)) {
      const a = per.get(id)
      if (!a) continue
      a.scores.push(t.score)
      a.penalty += t.penalty
    }
  }
  const standard = Math.min(...[...per.values()].map((a) => a.scores.length))
  const draw = mulberry32((s.seed ^ 0x9e3779b9) >>> 0)
  const rows = s.entrants.map((e) => {
    const a = per.get(e.id)!
    const best = a.scores.length ? Math.max(...a.scores) : 0
    // bỏ các trận thấp nhất cho đủ số chuẩn; giữ thứ tự thi đấu của phần còn lại
    const drop = a.scores.length - standard
    const idx = a.scores.map((v, k) => k).sort((x, y) => a.scores[x] - a.scores[y] || x - y)
    const dropped = new Set(idx.slice(0, drop))
    const counted = a.scores.filter((_, k) => !dropped.has(k))
    return { id: e.id, total: counted.reduce((x, y) => x + y, 0), best, penalty: a.penalty, counted, key: draw() }
  })
  rows.sort((x, y) => y.total - x.total || y.best - x.best || x.penalty - y.penalty || x.key - y.key)
  const same = (x: (typeof rows)[0], y: (typeof rows)[0]) => x.total === y.total && x.best === y.best && x.penalty === y.penalty
  return rows.map((r, k) => ({
    id: r.id, rank: k + 1, total: r.total, best: r.best, penalty: r.penalty, counted: r.counted,
    tieDraw: (k > 0 && same(rows[k - 1], r)) || (k < rows.length - 1 && same(r, rows[k + 1])),
  }))
}
