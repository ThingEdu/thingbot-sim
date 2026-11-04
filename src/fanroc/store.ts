/** Lưu trữ an toàn vào localStorage: mọi truy cập bọc try/catch; hỏng / bị chặn ⇒ mặc định, không ném. */
import type { Skill } from './agent.ts'
import type { Alliance } from './layout.ts'
import { ROBOTS, type RobotConfig } from './robots.ts'
import { TEAM_COUNT, type TournamentState } from './tournament.ts'
import type { Quality } from './view/scene.ts'

export type { Quality }

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export const keys = (season: string) => ({
  settings: 'fanroc.v1.settings',
  profile: 'fanroc.v1.profile',
  missions: `fanroc.v1.${season}.missions`,
  workshop: `fanroc.v1.${season}.workshop`,
  tournament: `fanroc.v1.${season}.tournament`,
})

/** Camera không lưu (spec §8.7). `robot` = robot của bạn 1, `robot2` = robot của bạn 2 (khi hai bạn chơi). */
export type Settings = { quality?: Quality; sound: boolean; skill: Skill; alliance: Alliance; robot: RobotConfig; robot2: RobotConfig; layout2p: boolean; teacher: boolean }
export type MissionProgress = { done: boolean; stars: 0 | 1 | 2 | 3; program: object | null }
export type Profile = { names: [string, string]; stars: number }
type ProgramRec = { version: number; state: object }

export interface Store {
  settings(): Settings
  saveSettings(s: Settings): void
  mission(id: string): MissionProgress
  saveMission(id: string, p: MissionProgress): void
  program(player: 0 | 1, cfg: RobotConfig): ProgramRec | null
  saveProgram(player: 0 | 1, cfg: RobotConfig, state: object): number
  resetProgram(player: 0 | 1, cfg: RobotConfig): void
  tournament(): TournamentState | null | 'corrupt'
  saveTournament(s: TournamentState | null): void
  profile(): Profile
  saveProfile(p: Profile): void
}

export const defaultSettings = (): Settings => ({
  quality: undefined, sound: true, skill: 'medium', alliance: 'red',
  robot: { type: 'maker', drive: 'diff2', actuator: 'tt' }, robot2: { type: 'maker', drive: 'diff2', actuator: 'tt' }, layout2p: false, teacher: false,
})
const defaultProfile = (): Profile => ({ names: ['Bạn 1', 'Bạn 2'], stars: 0 })
const defaultMission = (): MissionProgress => ({ done: false, stars: 0, program: null })

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Cấu hình robot đọc từ bộ nhớ: robot mẫu có thật, đế robot đó có, cơ cấu tt / s360; sai ⇒ null. */
function robotConfig(v: unknown): RobotConfig | null {
  if (!isObj(v) || typeof v.type !== 'string' || !Object.hasOwn(ROBOTS, v.type)) return null
  const def = ROBOTS[v.type as RobotConfig['type']]
  if (!def.drives.includes(v.drive as RobotConfig['drive'])) return null
  if (v.actuator !== 'tt' && v.actuator !== 's360') return null
  return { type: def.type, drive: v.drive as RobotConfig['drive'], actuator: v.actuator }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const SKILLS = new Set(['easy', 'medium', 'hard'])

/**
 * Giải đọc từ bộ nhớ có đúng dạng để đấu tiếp không (màn giải đấu dùng thẳng): seed, perTeam (số nguyên 4–10), đủ
 * TEAM_COUNT đội (id không trùng, tên, loại, robot có thật, đội máy có mức, người chơi 0 / 1), lịch đủ 2·perTeam trận
 * (mỗi trận 4 đội khác nhau có trong danh sách), kết quả cùng độ dài lịch (null hoặc điểm trận + điểm / phạt từng đội).
 */
function validTournament(v: unknown): v is TournamentState {
  if (!isObj(v) || v.version !== 1 || !finite(v.seed)) return false
  const perTeam = v.perTeam
  if (!Number.isInteger(perTeam) || (perTeam as number) < 4 || (perTeam as number) > 10) return false
  const { entrants, schedule, results } = v
  if (!Array.isArray(entrants) || entrants.length !== TEAM_COUNT) return false
  const ids = new Set<string>()
  for (const e of entrants) {
    if (!isObj(e) || typeof e.id !== 'string' || typeof e.name !== 'string' || robotConfig(e.robot) === null) return false
    if (e.kind === 'machine' ? !SKILLS.has(e.skill as string) : e.kind !== 'player' || (e.player !== 0 && e.player !== 1)) return false
    if (ids.has(e.id)) return false
    ids.add(e.id)
  }
  const pair = (a: unknown) => Array.isArray(a) && a.length === 2 && a.every((id) => typeof id === 'string' && ids.has(id))
  if (!Array.isArray(schedule) || schedule.length !== 2 * (perTeam as number)) return false
  for (const slot of schedule) {
    if (!isObj(slot) || !pair(slot.red) || !pair(slot.blue)) return false
    if (new Set([...(slot.red as string[]), ...(slot.blue as string[])]).size !== 4) return false
  }
  if (!Array.isArray(results) || results.length !== schedule.length) return false
  for (const r of results) {
    if (r === null) continue
    if (!isObj(r) || !finite(r.matchScore) || !isObj(r.teams)) return false
    for (const [id, t] of Object.entries(r.teams)) if (!ids.has(id) || !isObj(t) || !finite(t.score) || !finite(t.penalty)) return false
  }
  return true
}

function defaultKV(): KV | null {
  try { return globalThis.localStorage ?? null } catch { return null }
}

export function createStore(season: string, kvArg?: KV | null): Store {
  const kv: KV | null = kvArg === undefined ? defaultKV() : kvArg
  const K = keys(season)

  const read = (k: string): string | null => {
    try { return kv ? kv.getItem(k) : null } catch { return null }
  }
  const write = (k: string, v: string): void => {
    try { kv?.setItem(k, v) } catch { /* bị chặn / đầy: bỏ qua */ }
  }
  /** Đọc JSON; hỏng hoặc vắng ⇒ undefined. */
  const readJSON = (k: string): unknown => {
    const raw = read(k)
    if (!raw) return undefined
    try { return JSON.parse(raw) } catch { return undefined }
  }
  const writeJSON = (k: string, v: unknown): void => {
    try { write(k, JSON.stringify(v)) } catch { /* không tuần tự hoá được */ }
  }
  const record = (k: string): Record<string, unknown> => {
    const v = readJSON(k)
    return isObj(v) ? v : {}
  }

  const programKey = (player: 0 | 1, c: RobotConfig) => `${player}:${c.type}/${c.drive}/${c.actuator}`

  return {
    settings() {
      const v = readJSON(K.settings)
      const d = defaultSettings()
      if (!isObj(v)) return d
      return {
        quality: v.quality === 'high' || v.quality === 'low' ? v.quality : undefined,
        sound: typeof v.sound === 'boolean' ? v.sound : d.sound,
        skill: v.skill === 'easy' || v.skill === 'medium' || v.skill === 'hard' ? v.skill : d.skill,
        alliance: v.alliance === 'red' || v.alliance === 'blue' ? v.alliance : d.alliance,
        robot: robotConfig(v.robot) ?? d.robot,
        robot2: robotConfig(v.robot2) ?? d.robot2,
        layout2p: typeof v.layout2p === 'boolean' ? v.layout2p : d.layout2p,
        teacher: typeof v.teacher === 'boolean' ? v.teacher : d.teacher,
      }
    },
    saveSettings(s) { writeJSON(K.settings, s) },

    mission(id) {
      const m = record(K.missions)[id]
      if (!isObj(m)) return defaultMission()
      const stars = m.stars === 1 || m.stars === 2 || m.stars === 3 ? m.stars : 0
      return { done: m.done === true, stars, program: isObj(m.program) ? m.program : null }
    },
    saveMission(id, p) { writeJSON(K.missions, { ...record(K.missions), [id]: p }) },

    program(player, cfg) {
      const r = record(K.workshop)[programKey(player, cfg)]
      if (!isObj(r) || typeof r.version !== 'number' || !isObj(r.state)) return null
      return { version: r.version, state: r.state }
    },
    saveProgram(player, cfg, state) {
      const all = record(K.workshop)
      const key = programKey(player, cfg)
      const prev = all[key]
      const version = (isObj(prev) && typeof prev.version === 'number' ? prev.version : 0) + 1
      writeJSON(K.workshop, { ...all, [key]: { version, state } })
      return version
    },
    resetProgram(player, cfg) {
      const all = record(K.workshop)
      const key = programKey(player, cfg)
      if (!(key in all)) return
      delete all[key]
      writeJSON(K.workshop, all)
    },

    tournament() {
      const raw = read(K.tournament)
      if (!raw) return null
      let v: unknown
      try { v = JSON.parse(raw) } catch { return 'corrupt' }
      return validTournament(v) ? v : 'corrupt'
    },
    saveTournament(s) {
      if (s === null) write(K.tournament, '')
      else writeJSON(K.tournament, s)
    },

    profile() {
      const v = readJSON(K.profile)
      const d = defaultProfile()
      if (!isObj(v)) return d
      const n = v.names
      const names: [string, string] = Array.isArray(n) && typeof n[0] === 'string' && typeof n[1] === 'string' ? [n[0], n[1]] : d.names
      return { names, stars: typeof v.stars === 'number' ? v.stars : 0 }
    },
    saveProfile(p) { writeJSON(K.profile, p) },
  }
}
