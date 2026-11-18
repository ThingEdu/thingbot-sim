// Kiểm thư từ điện thoại trước khi vào EventState: đúng hình, đúng kiểu, số trong khoảng. Sai ⇒ null (từ chối, không tự kẹp).
import type { Climb } from '../ladder.ts'
import type { EMatch, Edit, EventState, HalfSheet, Live, Pens, Result, Round, Seat, Side, Team } from './event.ts'

export const MAX_BALLS = 300
export const MAX_PENS = 20
export const MAX_FAULTS = 50
export const MAX_FAULT_CODE = 16

const CLIMBS: readonly Climb[] = ['none', 'contact', 'ground', 'water']
const KINDS = ['warn', 'minor', 'yellow', 'red'] as const

type O = Record<string, unknown>
const obj = (x: unknown): x is O => typeof x === 'object' && x !== null && !Array.isArray(x)
const count = (x: unknown, max: number): x is number => Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) <= max
const balls = (x: unknown): x is number => count(x, MAX_BALLS)
const pair = (x: unknown): x is [unknown, unknown] => Array.isArray(x) && x.length === 2

function go(x: unknown): { g: number; o: number } | null {
  return obj(x) && balls(x.g) && balls(x.o) ? { g: x.g, o: x.o } : null
}

function pens(x: unknown): Pens | null {
  if (!obj(x) || !count(x.minor, MAX_PENS) || !count(x.yellow, MAX_PENS) || typeof x.red !== 'boolean' || !count(x.warn, MAX_PENS)) return null
  return { minor: x.minor, yellow: x.yellow, red: x.red, warn: x.warn }
}

function fault(x: unknown): HalfSheet['faults'][number] | null {
  if (!obj(x) || (x.team !== 0 && x.team !== 1) || typeof x.code !== 'string' || x.code.length > MAX_FAULT_CODE) return null
  if (!KINDS.includes(x.kind as never) || typeof x.at !== 'number' || !Number.isFinite(x.at)) return null
  return { team: x.team, code: x.code, kind: x.kind as (typeof KINDS)[number], at: x.at }
}

/** Phiếu nửa sân từ khách ⇒ bản sao sạch (chỉ các trường đã biết), hoặc null nếu sai bất cứ chỗ nào. */
export function sanitizeSheet(x: unknown): HalfSheet | null {
  if (!obj(x)) return null
  const fire = go(x.fire)
  if (!fire || !balls(x.decorO)) return null
  if (!pair(x.mtn)) return null
  const mtn: { g: number; o: number }[][] = []
  for (const m of x.mtn) {
    if (!Array.isArray(m) || m.length !== 3) return null
    const tiers = m.map(go)
    if (tiers.some((t) => t === null)) return null
    mtn.push(tiers as { g: number; o: number }[])
  }
  if (!pair(x.flags) || x.flags.some((f) => typeof f !== 'boolean')) return null
  if (!pair(x.climbs) || x.climbs.some((c) => !CLIMBS.includes(c as Climb))) return null
  if (!pair(x.pens)) return null
  const p = x.pens.map(pens)
  if (p[0] === null || p[1] === null) return null
  if (!Array.isArray(x.faults) || x.faults.length > MAX_FAULTS) return null
  const faults = x.faults.map(fault)
  if (faults.some((f) => f === null)) return null
  return {
    fire,
    mtn: mtn as HalfSheet['mtn'],
    decorO: x.decorO,
    flags: [x.flags[0] as boolean, x.flags[1] as boolean],
    climbs: [x.climbs[0] as Climb, x.climbs[1] as Climb],
    pens: [p[0], p[1]],
    faults: faults as HalfSheet['faults'],
  }
}

// ---------- file giải (lưu / sao lưu / mở từ máy) ----------
/** Số sân tối đa trong file giải (như MAX_FIELDS của host.ts). */
const MAX_FIELD = 16
const int = (x: unknown, lo: number, hi: number): x is number => Number.isSafeInteger(x) && (x as number) >= lo && (x as number) <= hi
const str = (x: unknown): x is string => typeof x === 'string'
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const PHASES: readonly Live['phase'][] = ['ready', 'play', 'inventory', 'done']
const SIDES: readonly Side[] = ['red', 'blue']

function team(x: unknown): Team | null {
  if (!obj(x) || !str(x.id) || !str(x.code) || !str(x.name) || !str(x.school) || !str(x.province) || !str(x.advisor) || typeof x.withdrawn !== 'boolean') return null
  return { id: x.id, code: x.code, name: x.name, school: x.school, province: x.province, advisor: x.advisor, withdrawn: x.withdrawn }
}

const seat = (x: unknown): x is Seat => x === null || str(x)
const seats = (x: unknown): x is [Seat, Seat] => pair(x) && seat(x[0]) && seat(x[1])

function match(x: unknown): EMatch | null {
  if (!obj(x) || !str(x.id) || !int(x.slot, 0, 100000) || !int(x.field, 0, MAX_FIELD - 1) || !seats(x.red) || !seats(x.blue)) return null
  return { id: x.id, slot: x.slot, field: x.field, red: [x.red[0], x.red[1]], blue: [x.blue[0], x.blue[1]] }
}

function result(x: unknown): Result | null {
  if (!obj(x) || !finite(x.committedAt)) return null
  const red = sanitizeSheet(x.red), blue = sanitizeSheet(x.blue)
  return red && blue ? { red, blue, committedAt: x.committedAt } : null
}

function edit(x: unknown, ids: Set<string>): Edit | null {
  if (!obj(x) || !str(x.matchId) || !ids.has(x.matchId) || !finite(x.at)) return null
  const before = x.before === null ? null : result(x.before)
  const after = result(x.after)
  if ((x.before !== null && !before) || !after) return null
  return { matchId: x.matchId, at: x.at, before, after }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function round(x: unknown): Round | null {
  if (!obj(x) || !str(x.id) || !str(x.name) || !Array.isArray(x.teamIds) || !x.teamIds.every(str)) return null
  if (!int(x.perTeam, 1, 50) || !int(x.fields, 1, MAX_FIELD) || !int(x.slotMin, 1, 1440) || !str(x.startAt) || !HHMM.test(x.startAt) || !Number.isSafeInteger(x.seed)) return null
  if (!Array.isArray(x.matches) || !obj(x.results) || !Array.isArray(x.edits)) return null
  const matches = x.matches.map(match)
  if (matches.some((m) => m === null)) return null
  const ids = new Set(matches.map((m) => m!.id))
  if (ids.size !== matches.length) return null
  const results: Record<string, Result> = {}
  for (const [k, v] of Object.entries(x.results)) {
    const r = result(v)
    if (!ids.has(k) || !r) return null
    results[k] = r
  }
  const edits = x.edits.map((e) => edit(e, ids))
  if (edits.some((e) => e === null)) return null
  return {
    id: x.id, name: x.name, teamIds: [...x.teamIds], perTeam: x.perTeam, fields: x.fields, slotMin: x.slotMin, startAt: x.startAt,
    seed: x.seed as number, matches: matches as EMatch[], results, edits: edits as Edit[],
  }
}

function live(x: unknown, ids: Set<string>): Live | null {
  if (!obj(x) || !str(x.matchId) || !ids.has(x.matchId) || !PHASES.includes(x.phase as never)) return null
  if (x.startedAt !== null && !finite(x.startedAt)) return null
  if (!obj(x.sheets) || !obj(x.submitted)) return null
  const sheets: Live['sheets'] = {}
  const submitted: Live['submitted'] = {}
  for (const [k, v] of Object.entries(x.sheets)) {
    const sh = sanitizeSheet(v)
    if (!SIDES.includes(k as Side) || !sh) return null
    sheets[k as Side] = sh
  }
  for (const [k, v] of Object.entries(x.submitted)) {
    if (!SIDES.includes(k as Side) || typeof v !== 'boolean') return null
    submitted[k as Side] = v
  }
  return { matchId: x.matchId, phase: x.phase as Live['phase'], startedAt: x.startedAt as number | null, sheets, submitted }
}

const fieldKey = (k: string) => /^\d+$/.test(k) && Number(k) < MAX_FIELD

/**
 * File giải (EventState version 1) ⇒ bản sao sạch, hoặc null nếu sai bất cứ chỗ nào (kiểu, khoảng, trận / kết quả /
 * trận đang đấu trỏ tới trận không có). Dùng khi mở lại giải đã lưu và khi «Mở file giải».
 */
export function validateEvent(x: unknown): EventState | null {
  if (!obj(x) || x.version !== 1 || !str(x.id) || x.id.length < 1 || x.id.length > 64 || !str(x.name) || !Array.isArray(x.teams) || !Array.isArray(x.rounds) || !obj(x.live) || !obj(x.codes)) return null
  const teams = x.teams.map(team)
  if (teams.some((t) => t === null)) return null
  const rounds = x.rounds.map(round)
  if (rounds.some((r) => r === null)) return null
  const all = new Set<string>()
  for (const r of rounds) for (const m of r!.matches) {
    if (all.has(m.id)) return null // id trận trùng giữa các vòng
    all.add(m.id)
  }
  const lv: EventState['live'] = {}
  for (const [k, v] of Object.entries(x.live)) {
    if (!fieldKey(k)) return null
    if (v === null) lv[Number(k)] = null
    else {
      const l = live(v, all)
      if (!l) return null
      lv[Number(k)] = l
    }
  }
  const codes: EventState['codes'] = {}
  for (const [k, v] of Object.entries(x.codes)) {
    if (!fieldKey(k) || !str(v) || !/^\d{4}$/.test(v)) return null
    codes[Number(k)] = v
  }
  return { version: 1, id: x.id, name: x.name, teams: teams as Team[], rounds: rounds as Round[], live: lv, codes }
}
