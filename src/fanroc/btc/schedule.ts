// Sinh lịch sơ loại kiểu FTC (thuần, tất định theo seed): liên minh ngẫu nhiên 2 đỏ + 2 xanh,
// mỗi đội đấu perTeam trận (một số đội đấu thêm 1 trận cho tròn), hạn chế lặp bạn/đối thủ, có lượt nghỉ.
import { mulberry32 } from '../world.ts'
import type { EMatch, Seat } from './event.ts'

export type SchedOpts = { teamIds: string[]; perTeam: number; fields: number; seed: number; roundId: string; fixed?: EMatch[] /* trận đã đấu, giữ nguyên, tính vào số trận */ }
export type SchedQuality = { fieldsUsed: number; minRest: number /* số lượt nghỉ ít nhất giữa hai trận của một đội */; repeatPartners: number; repeatOpponents: number; maxSideDiff: number; extra: string[] /* đội đấu thêm 1 trận */ }

const R = 200 // số cách ghép ngẫu nhiên thử cho mỗi lượt
const SUB_SEEDS = 5 // số lần thử lại cả lịch (thêm nếu chưa đạt yêu cầu cứng)
const MAX_SUB_SEEDS = 30
const HARD = 100000 // phạt cho lịch vi phạm điều kiện cứng (nghỉ < 1, lệch màu > 1)

const pk = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const seatsOf = (m: EMatch) => [...m.red, ...m.blue].filter((s): s is string => s !== null)

type Hist = { partner: Map<string, number>; opp: Map<string, number>; diff: Map<string, number> }
const bump = (m: Map<string, number>, k: string, d = 1) => m.set(k, (m.get(k) ?? 0) + d)

function addMatch(h: Hist, m: EMatch) {
  const [r1, r2] = m.red, [b1, b2] = m.blue
  if (r1 && r2) bump(h.partner, pk(r1, r2))
  if (b1 && b2) bump(h.partner, pk(b1, b2))
  for (const r of m.red) for (const b of m.blue) if (r && b) bump(h.opp, pk(r, b))
  for (const r of m.red) if (r) bump(h.diff, r, 1)
  for (const b of m.blue) if (b) bump(h.diff, b, -1)
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** Chấm các trận của một lượt trước khi ghi vào lịch sử: 1000·đồngĐộiLặp + 100·đốiThủLặp + 10·lệchMàu. */
function scoreSlot(h: Hist, rem: Map<string, number>, ms: { red: [string, string]; blue: [string, string] }[]): number {
  let p = 0
  for (const m of ms) {
    p += 1000 * ((h.partner.get(pk(m.red[0], m.red[1])) ?? 0) + (h.partner.get(pk(m.blue[0], m.blue[1])) ?? 0))
    for (const r of m.red) for (const b of m.blue) p += 100 * (h.opp.get(pk(r, b)) ?? 0)
    // lệch màu: bình phương; phạt nặng nếu số trận còn lại không đủ để kéo về |lệch| ≤ 1
    for (const t of m.red) { const d = Math.abs((h.diff.get(t) ?? 0) + 1); p += 10 * d * d + (d - (rem.get(t)! - 1) > 1 ? 3000 : 0) }
    for (const t of m.blue) { const d = Math.abs((h.diff.get(t) ?? 0) - 1); p += 10 * d * d + (d - (rem.get(t)! - 1) > 1 ? 3000 : 0) }
  }
  return p
}

function stats(teamIds: string[], matches: EMatch[]) {
  const set = new Set(teamIds)
  const slots = new Map<string, number[]>()
  const h: Hist = { partner: new Map(), opp: new Map(), diff: new Map() }
  for (const m of matches) {
    addMatch(h, m)
    for (const t of seatsOf(m)) if (set.has(t)) slots.set(t, [...(slots.get(t) ?? []), m.slot])
  }
  let minRest = Infinity
  for (const ss of slots.values()) {
    ss.sort((a, b) => a - b)
    for (let i = 1; i < ss.length; i++) minRest = Math.min(minRest, ss[i] - ss[i - 1] - 1)
  }
  let repeatPartners = 0, repeatOpponents = 0, maxSideDiff = 0
  for (const v of h.partner.values()) repeatPartners += v - 1
  for (const v of h.opp.values()) repeatOpponents += v - 1
  for (const t of teamIds) maxSideDiff = Math.max(maxSideDiff, Math.abs(h.diff.get(t) ?? 0))
  return { minRest: minRest === Infinity ? 0 : minRest, repeatPartners, repeatOpponents, maxSideDiff }
}

/** Đổi đỏ↔xanh các trận mới nếu làm các đội bớt lệch màu (leo đồi đơn giản). */
function balanceSides(matches: EMatch[], from: number) {
  const diff = new Map<string, number>()
  for (const m of matches) {
    for (const r of m.red) if (r) bump(diff, r, 1)
    for (const b of m.blue) if (b) bump(diff, b, -1)
  }
  for (let pass = 0; pass < 20; pass++) {
    let changed = false
    for (let i = from; i < matches.length; i++) {
      const m = matches[i]
      let gain = 0
      for (const r of m.red) if (r) { const d = diff.get(r) ?? 0; gain += d * d - (d - 2) * (d - 2) }
      for (const b of m.blue) if (b) { const d = diff.get(b) ?? 0; gain += d * d - (d + 2) * (d + 2) }
      if (gain > 0) {
        for (const r of m.red) if (r) bump(diff, r, -2)
        for (const b of m.blue) if (b) bump(diff, b, 2)
        matches[i] = { ...m, red: m.blue, blue: m.red }
        changed = true
      }
    }
    if (!changed) break
  }
}

/** Sửa lệch màu còn sót: đổi chỗ một ghế đỏ với một ghế xanh trong cùng lượt (cùng trận hoặc hai sân khác nhau)
 *  nếu bớt lệch và không thêm quá nhiều lặp bạn/đối thủ. */
function repairSides(teamIds: string[], fixed: EMatch[], out: EMatch[], rnd: () => number) {
  const active = new Set(teamIds)
  const h: Hist = { partner: new Map(), opp: new Map(), diff: new Map() }
  for (const m of [...fixed, ...out]) addMatch(h, m)
  const rep = (m: EMatch) => { // phạt lặp của một cách xếp, tính trên lịch sử đã gỡ trận đó
    let p = 1000 * ((h.partner.get(pk(m.red[0]!, m.red[1]!)) ?? 0) + (h.partner.get(pk(m.blue[0]!, m.blue[1]!)) ?? 0))
    for (const r of m.red) for (const b of m.blue) p += 100 * (h.opp.get(pk(r!, b!)) ?? 0)
    return p
  }
  const apply = (x: EMatch, sg: number) => { // sg = -1 gỡ trận khỏi lịch sử, +1 thêm lại
    bump(h.partner, pk(x.red[0]!, x.red[1]!), sg); bump(h.partner, pk(x.blue[0]!, x.blue[1]!), sg)
    for (const r of x.red) for (const b of x.blue) bump(h.opp, pk(r!, b!), sg)
    for (const r of x.red) bump(h.diff, r!, sg)
    for (const b of x.blue) bump(h.diff, b!, -sg)
  }
  const seat = (m: EMatch, k: number) => (k < 2 ? m.red[k] : m.blue[k - 2])!
  const put = (m: EMatch, k: number, v: string): EMatch => {
    const red: [Seat, Seat] = [...m.red], blue: [Seat, Seat] = [...m.blue]
    if (k < 2) red[k] = v; else blue[k - 2] = v
    return { ...m, red, blue }
  }
  const bySlot = new Map<number, number[]>()
  out.forEach((m, i) => bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), i]))
  for (let pass = 0; pass < 30; pass++) {
    let changed = false
    for (const idx of bySlot.values()) for (let x = 0; x < idx.length; x++) for (let y = x; y < idx.length; y++) {
      const i = idx[x], j = idx[y]
      const mi = out[i], mj = out[j]
      apply(mi, -1); if (j !== i) apply(mj, -1)
      const oldP = rep(mi) + (j !== i ? rep(mj) : 0)
      let best: [EMatch, EMatch] | null = null, bestNet = 0
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        if ((a < 2) === (b < 2)) continue // chỉ đổi khác màu mới đổi được lệch màu
        if (i === j && a > b) continue
        const t = seat(mi, a), u = seat(mj, b)
        const dt = (h.diff.get(t) ?? 0) + (a < 2 ? 1 : -1), du = (h.diff.get(u) ?? 0) + (b < 2 ? 1 : -1) // lệch khi trận còn tính
        const st = a < 2 ? -2 : 2, su = b < 2 ? -2 : 2
        const gain = dt * dt + du * du - (dt + st) * (dt + st) - (du + su) * (du + su)
        if (gain <= 0) continue
        let ni: EMatch, nj: EMatch
        if (i === j) { ni = put(put(mi, a, u), b, t); nj = ni } else { ni = put(mi, a, u); nj = put(mj, b, t) }
        const net = 150 * gain - (rep(ni) + (j !== i ? rep(nj) : 0) - oldP) // cân bằng màu được ưu tiên hơn vài lần lặp đối thủ
        if (net > bestNet) { bestNet = net; best = [ni, nj] }
      }
      if (best) { out[i] = best[0]; if (j !== i) out[j] = best[1]; changed = true }
      apply(out[i], 1); if (j !== i) apply(out[j], 1)
    }
    if (!changed) break
  }
  // còn đội lệch ≥ 2: chuyển phần lệch sang đội khác cùng lượt (bước đi ngẫu nhiên, chỉ nhận nước không làm xấu thêm) tới khi gặp đội lệch ngược
  for (let step = 0; step < 4000; step++) {
    // chỉ xét đội còn thi đấu và có ghế đúng màu lệch trong trận MỚI (trận đã đấu không đổi được)
    const viol = [...h.diff].filter(([t, v]) => active.has(t) && Math.abs(v) > 1 && out.some((m) => (v > 0 ? m.red : m.blue).includes(t)))
    if (viol.length === 0) break
    const [t, dt] = viol[Math.floor(rnd() * viol.length)]
    const badRed = dt > 0 // lệch đỏ: cần chuyển một ghế đỏ của t sang xanh
    const mine = out.map((m, i) => i).filter((i) => (badRed ? out[i].red : out[i].blue).includes(t))
    const i = mine[Math.floor(rnd() * mine.length)]
    const mi = out[i]
    const same = out.map((m, j) => j).filter((j) => out[j].slot === mi.slot)
    const j = same[Math.floor(rnd() * same.length)]
    const mj = out[j]
    const a = (badRed ? mi.red : mi.blue).indexOf(t) + (badRed ? 0 : 2)
    const b = Math.floor(rnd() * 2) + (badRed ? 2 : 0)
    const u = seat(mj, b)
    if (u === t) continue
    const du = h.diff.get(u) ?? 0
    const gain = dt * dt + du * du - (dt + (badRed ? -2 : 2)) ** 2 - (du + (badRed ? 2 : -2)) ** 2
    if (gain < 0) continue
    apply(mi, -1); if (j !== i) apply(mj, -1)
    const oldP = rep(mi) + (j !== i ? rep(mj) : 0)
    let ni: EMatch, nj: EMatch
    if (i === j) { ni = put(put(mi, a, u), b, t); nj = ni } else { ni = put(mi, a, u); nj = put(mj, b, t) }
    const ok = rep(ni) + (j !== i ? rep(nj) : 0) - oldP < 1000
    const [wi, wj] = ok ? [ni, nj] : [mi, mj]
    out[i] = wi; if (j !== i) out[j] = wj
    apply(out[i], 1); if (j !== i) apply(out[j], 1)
  }
}

type Attempt = { matches: EMatch[]; extra: string[]; penalty: number } | null

function attempt(o: SchedOpts, fu: number, seed: number): Attempt {
  const rnd = mulberry32(seed)
  const fixed = o.fixed ?? []
  const set = new Set(o.teamIds)
  const played = new Map<string, number>(o.teamIds.map((t) => [t, 0]))
  const last = new Map<string, number>() // lượt cuối đã đấu
  const h: Hist = { partner: new Map(), opp: new Map(), diff: new Map() }
  let maxSlot = -1, maxN = 0
  for (const m of fixed) {
    addMatch(h, m)
    maxSlot = Math.max(maxSlot, m.slot)
    if (m.id.startsWith(`${o.roundId}-`)) maxN = Math.max(maxN, Number(m.id.slice(o.roundId.length + 1)) || 0)
    for (const t of seatsOf(m)) if (set.has(t)) { played.set(t, played.get(t)! + 1); last.set(t, Math.max(last.get(t) ?? -1, m.slot)) }
  }
  const rem = new Map<string, number>()
  let need = 0
  for (const t of o.teamIds) { const r = Math.max(0, o.perTeam - played.get(t)!); rem.set(t, r); need += r }
  const total = Math.ceil(need / 4)
  const extra = shuffle([...o.teamIds], rnd).slice(0, total * 4 - need)
  for (const t of extra) rem.set(t, rem.get(t)! + 1)
  extra.sort((a, b) => o.teamIds.indexOf(a) - o.teamIds.indexOf(b))

  const out: EMatch[] = []
  let left = total, slot = maxSlot + 1, n = maxN, penalty = 0
  while (left > 0) {
    const k = Math.min(fu, left), need4 = 4 * k
    let pool = o.teamIds.filter((t) => rem.get(t)! > 0 && last.get(t) !== slot - 1)
    if (pool.length < need4) { // thiếu đội đã nghỉ: kéo thêm đội vừa đấu lượt trước (sẽ bị phạt nghỉ)
      const more = o.teamIds.filter((t) => rem.get(t)! > 0 && last.get(t) === slot - 1)
      pool = [...pool, ...shuffle(more, rnd).sort((a, b) => rem.get(b)! - rem.get(a)!)]
    }
    if (pool.length < need4) return null
    shuffle(pool, rnd).sort((a, b) => rem.get(b)! - rem.get(a)!) // còn thiếu nhiều trận nhất trước, hoà thì ngẫu nhiên
    const cut = rem.get(pool[need4 - 1])!
    const must = pool.filter((t) => rem.get(t)! > cut)
    const tier = pool.filter((t) => rem.get(t)! === cut)
    const take = need4 - must.length
    let best: { red: [string, string]; blue: [string, string] }[] | null = null, bestS = Infinity
    for (let r = 0; r < R; r++) {
      const pick = [...must, ...shuffle([...tier], rnd).slice(0, take)]
      shuffle(pick, rnd)
      const ms: { red: [string, string]; blue: [string, string] }[] = []
      for (let i = 0; i < k; i++) ms.push({ red: [pick[4 * i], pick[4 * i + 1]], blue: [pick[4 * i + 2], pick[4 * i + 3]] })
      const s = scoreSlot(h, rem, ms)
      if (s < bestS) { bestS = s; best = ms }
    }
    best!.forEach((b, f) => {
      const m: EMatch = { id: `${o.roundId}-${++n}`, slot, field: f, red: b.red, blue: b.blue }
      out.push(m); addMatch(h, m)
      for (const t of seatsOf(m)) { rem.set(t, rem.get(t)! - 1); last.set(t, slot) }
    })
    left -= k; slot++
  }
  balanceSides(out, 0)
  repairSides(o.teamIds, fixed, out, rnd)
  const q = stats(o.teamIds, [...fixed, ...out])
  penalty = 1000 * q.repeatPartners + 100 * q.repeatOpponents + 10 * q.maxSideDiff
  if (q.minRest < 1) penalty += HARD
  if (q.maxSideDiff > 1) penalty += HARD
  return { matches: out, extra, penalty }
}

export function makeSchedule(o: SchedOpts): { matches: EMatch[]; quality: SchedQuality; notes: string[] } {
  const n = o.teamIds.length
  if (n < 8 || n > 120) throw new Error('số đội phải từ 8 đến 120')
  if (!Number.isInteger(o.perTeam) || o.perTeam < 3 || o.perTeam > 10) throw new Error('số trận mỗi đội phải từ 3 đến 10')
  if (!Number.isInteger(o.fields) || o.fields < 1 || o.fields > 4) throw new Error('số sân phải từ 1 đến 4')
  const fu = Math.min(o.fields, Math.floor(n / 4))
  const notes: string[] = []
  if (fu < o.fields) notes.push(`Dùng ${fu} sân (ít đội)`)
  let best: Attempt = null
  for (let i = 0; i < MAX_SUB_SEEDS; i++) {
    if (i >= SUB_SEEDS && best && best.penalty < HARD) break
    const a = attempt(o, fu, (o.seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)
    if (a && (!best || a.penalty < best.penalty)) best = a
  }
  if (!best) throw new Error('không xếp được lịch với các thông số này')
  const fixed = o.fixed ?? []
  const matches = [...fixed, ...best.matches]
  const q = stats(o.teamIds, matches)
  if (q.minRest < 1) notes.push('Có đội không được nghỉ giữa hai trận')
  if (q.maxSideDiff > 1) notes.push('Có đội lệch số lần Đỏ / Xanh do các trận đã đấu')
  return { matches, quality: { fieldsUsed: fu, ...q, extra: best.extra }, notes }
}

/** Giờ bắt đầu lượt: slotTime("08:00", 7, 3) ⇒ "08:21". */
export function slotTime(startAt: string, slotMin: number, slot: number): string {
  const [h, m] = startAt.split(':').map(Number)
  const t = (((h * 60 + m + slotMin * slot) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
