// Kiểm thư từ điện thoại trước khi vào EventState: đúng hình, đúng kiểu, số trong khoảng. Sai ⇒ null (từ chối, không tự kẹp).
import type { Climb } from '../ladder.ts'
import type { HalfSheet, Pens } from './event.ts'

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
