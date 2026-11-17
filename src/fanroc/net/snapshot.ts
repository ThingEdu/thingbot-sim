// Ảnh chụp trạng thái sân cho Thi qua mạng LAN (spec 2026-11-18-fanroc-lan-design.md): máy chủ chụp mỗi khung, máy
// khách áp vào phiên "gương" (GameSession cùng seed, cùng robot, không bao giờ advance). Chỉ gồm những gì cảnh 3D,
// thẻ robot, bảng điểm và nhật ký đọc: thân robot + trạng thái logic, bóng (trạng thái, vị trí quả trên sân), trận.
//
// Mã nhị phân: [u32 độ dài JSON][JSON utf-8][đệm tới bội 4][Float32: 7 số mỗi robot (vị trí + quay), 7 số mỗi cờ rơi,
// 3 số mỗi bóng 'field' theo thứ tự chỉ số]. Không đồ hoạ: chạy được trong Node.
import type { GameSession } from '../game.ts'
import type { BallState } from '../world.ts'
import type { MatchEvent, Penalty } from '../match.ts'
import type { Phase } from '../layout.ts'
import type { FieldTally, ScoreBreakdown } from '../scoring.ts'
import type { ClimbState } from '../ladder.ts'
import type { PortValues } from '../ports.ts'

const ST = { box: 'b', field: 'f', held: 'h', tray: 't', out: 'o' } as const
const ST_OF: Record<string, BallState['st']> = { b: 'box', f: 'field', h: 'held', t: 'tray', o: 'out' }

export interface RobotSnap {
  stored: number[]
  comp: { o: number[]; g: number[] } | null
  extend: number
  armFrac: number
  hasFlag: boolean
  climb: ClimbState
  hookDeg: number
  msg: string | null
  /** Có cờ rơi trên sàn (vị trí nằm trong phần số thực). */
  flag: boolean
}

export interface Snapshot {
  seed: number
  /** Số khung của máy chủ, tăng dần (máy khách bỏ ảnh chụp cũ hơn ảnh đã áp). */
  frame: number
  t: number
  phase: Phase
  pens: Penalty[]
  flags: boolean[]
  evFrom: number
  events: MatchEvent[]
  tally: FieldTally
  score: ScoreBreakdown
  trays: { o: number; g: number }[]
  /** Cổng từng robot ở bước vừa chạy (hình: con lăn quay, cửa xả, kẹp cờ). */
  ports: PortValues[]
  robots: RobotSnap[]
  /** Trạng thái từng bóng, một chữ mỗi quả (b f h t o). */
  balls: string
  /** Vị trí + quay robot (7 số mỗi robot), rồi cờ rơi (7 số mỗi cờ), rồi bóng 'field' (3 số mỗi quả). */
  nums: Float32Array
}

/** Chụp phiên máy chủ; sự kiện gửi từ chỉ số `evFrom` (sự kiện cũ hơn máy khách đã có). */
export function capture(g: GameSession, frame: number, evFrom: number): Snapshot {
  const m = g.match
  const nums: number[] = []
  const robots = g.robots.map((r) => {
    const t = r.body.translation()
    const q = r.body.rotation()
    nums.push(t.x, t.y, t.z, q.x, q.y, q.z, q.w)
    return {
      stored: [...r.stored],
      comp: r.compartments ? { o: [...r.compartments.o], g: [...r.compartments.g] } : null,
      extend: r.extend,
      armFrac: r.armFrac,
      hasFlag: r.hasFlag,
      climb: { ...r.climb },
      hookDeg: r.hookDeg,
      msg: r.lastMessage,
      flag: r.flagBody !== null,
    }
  })
  for (const r of g.robots) {
    if (!r.flagBody) continue
    const t = r.flagBody.translation()
    const q = r.flagBody.rotation()
    nums.push(t.x, t.y, t.z, q.x, q.y, q.z, q.w)
  }
  let balls = ''
  for (const b of g.world.balls) {
    balls += ST[b.st]
    if (b.st === 'field' && b.body) {
      const p = b.body.translation()
      nums.push(p.x, p.y, p.z)
    }
  }
  const from = Math.max(0, Math.min(evFrom, m.events.length))
  return {
    seed: g.seed,
    frame,
    t: m.t,
    phase: m.phase,
    pens: m.pens.map((p) => ({ ...p })),
    flags: [...m.flags],
    evFrom: from,
    events: m.events.slice(from).map((e) => ({ ...e })),
    tally: m.tally(),
    score: m.result().score,
    trays: g.humans.map((h) => ({ ...h.tray })),
    ports: g.ports.map((p) => ({ ...p })),
    robots,
    balls,
    nums: Float32Array.from(nums),
  }
}

export function encode(s: Snapshot): ArrayBuffer {
  const { nums, ...rest } = s
  const json = new TextEncoder().encode(JSON.stringify(rest))
  const head = 4 + json.length
  const pad = (4 - (head % 4)) % 4
  const buf = new ArrayBuffer(head + pad + nums.byteLength)
  new DataView(buf).setUint32(0, json.length, true)
  new Uint8Array(buf, 4, json.length).set(json)
  new Float32Array(buf, head + pad, nums.length).set(nums)
  return buf
}

/** Giải mã; gói hỏng ⇒ null. */
export function decode(buf: ArrayBuffer): Snapshot | null {
  try {
    const n = new DataView(buf).getUint32(0, true)
    const rest = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n))) as Omit<Snapshot, 'nums'>
    const head = 4 + n
    const off = head + ((4 - (head % 4)) % 4)
    const nums = new Float32Array(buf.slice(off))
    if (typeof rest.seed !== 'number' || !Array.isArray(rest.robots) || typeof rest.balls !== 'string') return null
    return { ...rest, nums }
  } catch {
    return null
  }
}

/** Vật giả chỉ có vị trí (+ quay) cho bóng / cờ ở phiên gương: cảnh 3D chỉ đọc translation() / rotation(). */
type FakeBody = { translation(): { x: number; y: number; z: number }; rotation(): { x: number; y: number; z: number; w: number } }
const fake = (a: Float32Array, k: number, rot: boolean): FakeBody => {
  const t = { x: a[k], y: a[k + 1], z: a[k + 2] }
  const q = rot ? { x: a[k + 3], y: a[k + 4], z: a[k + 5], w: a[k + 6] } : { x: 0, y: 0, z: 0, w: 1 }
  return { translation: () => t, rotation: () => q }
}

/**
 * Áp ảnh chụp vào phiên gương. Sai seed / số robot / số bóng (ảnh chụp của trận khác) ⇒ false, không đổi gì.
 */
export function apply(g: GameSession, s: Snapshot): boolean {
  if (s.seed !== g.seed || s.robots.length !== g.robots.length || s.balls.length !== g.world.balls.length) return false
  const a = s.nums
  let k = 0
  g.robots.forEach((r, i) => {
    const x = s.robots[i]
    r.body.setTranslation({ x: a[k], y: a[k + 1], z: a[k + 2] }, false)
    r.body.setRotation({ x: a[k + 3], y: a[k + 4], z: a[k + 5], w: a[k + 6] }, false)
    k += 7
    r.stored.splice(0, r.stored.length, ...x.stored)
    if (r.compartments && x.comp) {
      r.compartments.o.splice(0, r.compartments.o.length, ...x.comp.o)
      r.compartments.g.splice(0, r.compartments.g.length, ...x.comp.g)
    }
    r.extend = x.extend
    r.armFrac = x.armFrac
    r.hasFlag = x.hasFlag
    r.climb = { ...x.climb }
    r.hookDeg = x.hookDeg
    r.lastMessage = x.msg
  })
  g.robots.forEach((r, i) => {
    if (s.robots[i].flag) {
      r.flagBody = fake(a, k, true) as unknown as typeof r.flagBody
      k += 7
    } else r.flagBody = null
  })
  g.world.balls.forEach((b, i) => {
    b.st = ST_OF[s.balls[i]] ?? 'out'
    if (b.st === 'field') {
      b.body = fake(a, k, false) as unknown as BallState['body']
      k += 3
    } else b.body = null
  })
  g.match.mirror(s)
  s.trays.forEach((t, i) => g.humans[i] && Object.assign(g.humans[i].tray, t))
  s.ports.forEach((p, i) => i < g.ports.length && (g.ports[i] = p))
  return true
}
