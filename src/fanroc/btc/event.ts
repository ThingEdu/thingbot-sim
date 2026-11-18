// Giải FANROC do BTC điều hành (thuần): đội, vòng, lịch, trận đang đấu, kết quả. Không biết cách tính điểm.
import type { Climb } from '../ladder.ts'

export type Team = { id: string; code: string; name: string; school: string; province: string; advisor: string; withdrawn: boolean }
export type Side = 'red' | 'blue'
export type Seat = string | null // id đội; null = ghế trống
export type EMatch = { id: string; slot: number; field: number; red: [Seat, Seat]; blue: [Seat, Seat] }
export type Pens = { minor: number; yellow: number; red: boolean; warn: number }
export type HalfSheet = { // một trọng tài, một nửa sân
  fire: { o: number; g: number }
  mtn: [{ g: number; o: number }[], { g: number; o: number }[]] // 2 núi của nửa này × 3 rãnh
  decorO: number
  flags: [boolean, boolean]
  climbs: [Climb, Climb]
  pens: [Pens, Pens] // theo thứ tự đội trong liên minh của trọng tài
  faults: { team: 0 | 1; code: string; kind: 'warn' | 'minor' | 'yellow' | 'red'; at: number }[]
}
export type Result = { red: HalfSheet; blue: HalfSheet; committedAt: number }
export type Edit = { matchId: string; at: number; before: Result | null; after: Result }
export type Round = { id: string; name: string; teamIds: string[]; perTeam: number; fields: number; slotMin: number; startAt: string; seed: number; matches: EMatch[]; results: Record<string, Result>; edits: Edit[] }
export type Live = { matchId: string; phase: 'ready' | 'play' | 'inventory' | 'done'; startedAt: number | null; sheets: Partial<Record<Side, HalfSheet>>; submitted: Partial<Record<Side, boolean>> }
export interface EventState { version: 1; id: string /* ngẫu nhiên mỗi giải: điện thoại bỏ phiếu chờ của giải khác */; name: string; teams: Team[]; rounds: Round[]; live: Record<number, Live | null>; codes: Record<number, string> }

const emptyMtn = () => [0, 1, 2].map(() => ({ g: 0, o: 0 }))
const emptyPens = (): Pens => ({ minor: 0, yellow: 0, red: false, warn: 0 })

export const emptySheet = (): HalfSheet => ({
  fire: { o: 0, g: 0 },
  mtn: [emptyMtn(), emptyMtn()],
  decorO: 0,
  flags: [false, false],
  climbs: ['none', 'none'],
  pens: [emptyPens(), emptyPens()],
  faults: [],
})

/** Id giải ngẫu nhiên (16 chữ số hex). */
function eventId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  const b = new Uint8Array(8)
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export function newEvent(name: string, _seed: number): EventState {
  return { version: 1, id: eventId(), name, teams: [], rounds: [], live: {}, codes: {} }
}

export type Action =
  | { t: 'event.name'; name: string } // đổi tên giải (màn BTC)
  | { t: 'teams'; teams: Omit<Team, 'id' | 'withdrawn'>[] } // thay cả danh sách (chỉ khi chưa có vòng nào có kết quả)
  | { t: 'team.add'; team: Omit<Team, 'id' | 'withdrawn'> } | { t: 'team.edit'; id: string; patch: Partial<Omit<Team, 'id'>> }
  | { t: 'team.withdraw'; id: string }
  | { t: 'round.add'; name: string; teamIds: string[]; perTeam: number; fields: number; slotMin: number; startAt: string; seed: number }
  | { t: 'round.schedule'; roundId: string; matches: EMatch[] } // chỉ thay trận CHƯA có kết quả
  | { t: 'round.teams'; roundId: string; teamIds: string[]; perTeam: number; fields: number } // thêm đội muộn / đổi số trận; màn BTC gọi tiếp makeSchedule({fixed}) + round.schedule
  | { t: 'live.start'; field: number; matchId: string; now: number } | { t: 'live.abort'; field: number }
  | { t: 'live.whistle'; field: number } | { t: 'live.sheet'; field: number; side: Side; sheet: HalfSheet; submit: boolean }
  | { t: 'live.commit'; field: number; now: number }
  | { t: 'result.edit'; roundId: string; matchId: string; result: Result; now: number }
  | { t: 'code.new'; field: number; code: string }

export function roundOfMatch(s: EventState, matchId: string): Round | undefined {
  return s.rounds.find((r) => r.matches.some((m) => m.id === matchId))
}

const nextN = (ids: string[], prefix: string) => ids.reduce((m, id) => Math.max(m, Number(id.slice(prefix.length)) || 0), 0) + 1
const hasResults = (s: EventState) => s.rounds.some((r) => Object.keys(r.results).length > 0)

export function reduce(s0: EventState, a: Action): EventState {
  const s = structuredClone(s0) // thuần: sửa trên bản sao
  const round = (id: string) => {
    const r = s.rounds.find((x) => x.id === id)
    if (!r) throw new Error(`Không có vòng ${id}`)
    return r
  }
  const liveOf = (field: number) => {
    const l = s.live[field]
    if (!l) throw new Error(`Sân ${field + 1} chưa có trận đang đấu`)
    return l
  }
  switch (a.t) {
    case 'event.name': {
      const name = a.name.trim()
      if (!name) throw new Error('Tên giải không được để trống')
      s.name = name.slice(0, 80)
      break
    }
    case 'teams': {
      if (hasResults(s)) throw new Error('Đã có kết quả, không thể thay cả danh sách đội')
      s.teams = a.teams.map((t, i) => ({ ...t, id: `t${i + 1}`, withdrawn: false }))
      break
    }
    case 'team.add':
      s.teams.push({ ...a.team, id: `t${nextN(s.teams.map((t) => t.id), 't')}`, withdrawn: false })
      break
    case 'team.edit': {
      const t = s.teams.find((x) => x.id === a.id)
      if (!t) throw new Error(`Không có đội ${a.id}`)
      Object.assign(t, a.patch)
      break
    }
    case 'team.withdraw': {
      const t = s.teams.find((x) => x.id === a.id)
      if (!t) throw new Error(`Không có đội ${a.id}`)
      t.withdrawn = true
      const playing = new Set(Object.values(s.live).filter((l): l is Live => !!l).map((l) => l.matchId))
      for (const r of s.rounds) for (const m of r.matches) {
        if (r.results[m.id] || playing.has(m.id)) continue // trận đã đấu / đang đấu giữ nguyên
        for (const side of [m.red, m.blue]) for (let i = 0; i < 2; i++) if (side[i] === a.id) side[i] = null
      }
      break
    }
    case 'round.add':
      s.rounds.push({
        id: `r${nextN(s.rounds.map((r) => r.id), 'r')}`, name: a.name, teamIds: a.teamIds, perTeam: a.perTeam, fields: a.fields,
        slotMin: a.slotMin, startAt: a.startAt, seed: a.seed, matches: [], results: {}, edits: [],
      })
      break
    case 'round.schedule': {
      const r = round(a.roundId)
      const kept = r.matches.filter((m) => r.results[m.id])
      const fresh = a.matches.filter((m) => !r.results[m.id])
      const ids = new Set<string>()
      for (const m of a.matches) {
        if (ids.has(m.id)) throw new Error(`Lịch có mã trận trùng: ${m.id}`)
        ids.add(m.id)
      }
      r.matches = [...kept, ...fresh].sort((x, y) => x.slot - y.slot || x.field - y.field)
      break
    }
    case 'round.teams': {
      const r = round(a.roundId)
      r.teamIds = a.teamIds
      r.perTeam = a.perTeam
      r.fields = a.fields
      break
    }
    case 'live.start': {
      const m = s.rounds.flatMap((r) => r.matches).find((x) => x.id === a.matchId)
      if (!m) throw new Error(`Không có trận ${a.matchId}`)
      if (s.live[a.field]) throw new Error(`Sân ${a.field + 1} đang có trận`)
      if (roundOfMatch(s, a.matchId)!.results[a.matchId]) throw new Error(`Trận ${a.matchId} đã có kết quả`)
      s.live[a.field] = { matchId: a.matchId, phase: 'play', startedAt: a.now, sheets: {}, submitted: {} }
      break
    }
    case 'live.abort':
      s.live[a.field] = null
      break
    case 'live.whistle':
      liveOf(a.field).phase = 'inventory'
      break
    case 'live.sheet': {
      const l = liveOf(a.field)
      if (l.phase !== 'play' && l.phase !== 'inventory') throw new Error('Trận chưa ở giai đoạn ghi phiếu')
      l.sheets[a.side] = a.sheet
      if (a.submit) l.submitted[a.side] = true
      break
    }
    case 'live.commit': {
      const l = liveOf(a.field)
      if (!l.submitted.red || !l.submitted.blue || !l.sheets.red || !l.sheets.blue) throw new Error('Chưa đủ hai bản kiểm kê')
      roundOfMatch(s, l.matchId)!.results[l.matchId] = { red: l.sheets.red, blue: l.sheets.blue, committedAt: a.now }
      s.live[a.field] = null
      break
    }
    case 'result.edit': {
      const r = round(a.roundId)
      if (!r.matches.some((m) => m.id === a.matchId)) throw new Error(`Không có trận ${a.matchId} trong vòng ${a.roundId}`)
      r.edits.push({ matchId: a.matchId, at: a.now, before: r.results[a.matchId] ?? null, after: a.result })
      r.results[a.matchId] = a.result
      break
    }
    case 'code.new':
      s.codes[a.field] = a.code
      break
  }
  return s
}
