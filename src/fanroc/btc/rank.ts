// Xếp hạng một vòng của giải thật: dùng lõi mục E (rankCore) của giải mô phỏng; đội rút lui không vào lõi.
import type { EMatch, EventState, Result } from './event.ts'
import { liveScore, teamPoints } from './sheet.ts'
import { rankCore, type Played, type Standing } from '../tournament.ts'

export type EStanding = Standing & { withdrawn: boolean }

/** Một trận đã có phiếu → dạng Played của lõi xếp hạng (ghế null không tạo dòng). */
export function matchPlayed(r: Result, m: EMatch): Played {
  const sc = liveScore(r.red, r.blue)
  return {
    teams: Object.fromEntries(teamPoints(r, m).map((t) => [t.id, { score: t.score, penalty: t.penalty }])),
    matchScore: sc.total,
    multPct: sc.multPct,
  }
}

export function roundStandings(s: EventState, roundId: string): EStanding[] {
  const round = s.rounds.find((r) => r.id === roundId)
  if (!round) throw new Error(`Không có vòng ${roundId}`)
  const out = new Set(s.teams.filter((t) => t.withdrawn).map((t) => t.id))
  const active = round.teamIds.filter((id) => !out.has(id))
  const seats = (m: EMatch) => [...m.red, ...m.blue].filter((x): x is string => x !== null)
  // trận chỉ có ghế null hoặc đội rút lui thì bỏ qua; còn lại có kết quả hay chưa quyết định provisional
  const relevant = round.matches.filter((m) => seats(m).some((id) => !out.has(id)))
  const results = relevant.map((m) => (round.results[m.id] ? matchPlayed(round.results[m.id], m) : null))
  const provisional = results.some((r) => r === null)
  const ranked: EStanding[] = rankCore(round.seed, active, results, provisional).map((r) => ({ ...r, withdrawn: false }))
  // đội rút lui: nối cuối theo thứ tự round.teamIds, thống kê từ các trận đã ghi
  const gone: EStanding[] = round.teamIds.filter((id) => out.has(id)).map((id) => {
    const scores: number[] = []
    let penalty = 0
    let multSum = 0
    for (const m of round.matches) {
      const r = round.results[m.id]
      const t = r && teamPoints(r, m).find((x) => x.id === id)
      if (!r || !t) continue
      scores.push(t.score)
      penalty += t.penalty
      multSum += liveScore(r.red, r.blue).multPct
    }
    return {
      id, rank: 0, total: scores.reduce((a, b) => a + b, 0), multSum, best: scores.length ? Math.max(...scores) : 0, penalty,
      counted: scores, tieDraw: false, provisional, withdrawn: true,
    }
  })
  return [...ranked, ...gone]
}
