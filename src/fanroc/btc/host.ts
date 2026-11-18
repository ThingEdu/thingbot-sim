// Bộ điều hành BTC chạy trong trang BTC: nhận thư trọng tài / màn chiếu (qua btc.rs), giữ ghế trọng tài, đồng hồ trận,
// gọi reduce ⇒ lưu ⇒ gửi lại khung nhìn. Ghế, seq đã nhận, trận vừa chốt chỉ ở bộ nhớ (không vào EventState); khởi động
// lại thì điện thoại tự nối lại bằng mã máy.
import { emptySheet, reduce, roundOfMatch, type Action, type EMatch, type EventState, type HalfSheet, type Live, type Round, type Seat, type Side } from './event.ts'
import { slotTime } from './schedule.ts'
import { liveScore, teamPoints } from './sheet.ts'
import { roundStandings } from './rank.ts'
import type { BtcView, ClientMsg, RefView, ScreenView } from './proto.ts'
import { sanitizeSheet } from './validate.ts'

export interface HostDeps { send(to: string, m: BtcView): void; save(s: EventState): void; now(): number /* ms */ }

/** 10 s xả bóng + 180 s trận. */
export const MATCH_SEC = 10 + 180
/** Màn chiếu hiện điểm chính thức chừng này sau khi chốt, rồi về màn chờ (trận kế + xếp hạng). */
export const OFFICIAL_MS = 45_000
/** Sai mã sân chừng này lần ⇒ lờ thư vào ghế của máy đó trong LOCK_MS. */
export const MAX_WRONG = 5
export const LOCK_MS = 60_000

type SeatHold = { device: string; peer: string; online: boolean }
const SIDES: Side[] = ['red', 'blue']
const key = (field: number, side: Side) => `${field}:${side}`
const ackKey = (device: string, field: number, side: Side) => `${device}:${field}:${side}`
/** Giới hạn thư khách: số sân, độ dài mã máy / mã sân. */
export const MAX_FIELDS = 16
const MAX_DEVICE = 64
const MAX_CODE = 8
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isField = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0 && (x as number) < MAX_FIELDS
const isSide = (x: unknown): x is Side => x === 'red' || x === 'blue'
const isDevice = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= MAX_DEVICE

export class BtcHost {
  state: EventState
  pending: { field: number; side: Side; device: string; peer: string }[] = []
  private deps: HostDeps
  private seats = new Map<string, SeatHold>()
  private screens = new Map<string, number>() // peer ⇒ sân
  private online = new Set<string>()
  private acks = new Map<string, number>() // `${device}:${sân}:${bên}` ⇒ seq cuối đã nhận (RefQueue đếm seq theo ghế)
  private offset = new Map<number, number>() // sân ⇒ giây dời đồng hồ (skipTo)
  private lastClock = new Map<number, number | null>() // sân ⇒ giây đã gửi gần nhất
  private committed = new Map<number, { id: string; at: number }>() // sân ⇒ trận vừa chốt + lúc chốt (deps.now), hiện OFFICIAL_MS
  private wrong = new Map<string, { n: number; until: number }>() // peer ⇒ số lần sai mã, khoá tới (ms)
  private wrongByField = new Map<number, number>() // sân ⇒ số lần sai mã (tới khi đổi mã)
  // Ghế / seq / trận vừa chốt chỉ ở bộ nhớ: khởi động lại thì màn chiếu không còn `official` của trận vừa chốt (chấp nhận).

  constructor(s: EventState, deps: HostDeps) {
    this.state = s
    this.deps = deps
  }

  onPeer(id: string, on: boolean): void {
    try {
      if (typeof id !== 'string' || typeof on !== 'boolean') return
      if (on) {
        this.online.add(id)
        return
      }
      this.online.delete(id)
      this.screens.delete(id)
      this.pending = this.pending.filter((p) => p.peer !== id)
      for (const [k, h] of this.seats) if (h.peer === id) {
        h.online = false
        this.sendField(Number(k.split(':')[0]))
      }
    } catch (e) {
      console.warn('BTC: lỗi xử lý vào/ra', id, e)
    }
  }

  /** Thư khách: sai hình / sai kiểu ⇒ bỏ im lặng (riêng mã sân sai kiểu ⇒ deny 'code'). Không bao giờ ném ra ngoài. */
  onMessage(from: string, m: ClientMsg): void {
    try {
      const x = m as unknown
      if (!isObj(x) || typeof from !== 'string') return
      if (x.t === 'join' && x.role === 'screen') {
        if (!isField(x.field)) return
        this.online.add(from)
        const field = x.field
        this.screens.set(from, field)
        this.safeSend(from, () => this.screenView(field))
      } else if (x.t === 'join' && x.role === 'ref') {
        if (!isField(x.field) || !isSide(x.side) || !isDevice(x.device)) return
        this.online.add(from)
        if (this.locked(from)) return // sai mã quá nhiều: lờ đi
        if (typeof x.code !== 'string' || x.code.length > MAX_CODE) {
          this.wrongCode(from, x.field)
          return
        }
        this.joinRef(from, { t: 'join', role: 'ref', field: x.field, side: x.side, code: x.code, device: x.device })
      } else if (x.t === 'op') {
        if (!isField(x.field) || !isSide(x.side) || !isDevice(x.device) || !Number.isSafeInteger(x.seq) || (x.seq as number) < 1) return
        if (typeof x.matchId !== 'string' || typeof x.submit !== 'boolean' || typeof x.event !== 'string') return
        this.online.add(from)
        this.op(from, x as unknown as Extract<ClientMsg, { t: 'op' }>, sanitizeSheet(x.sheet))
      }
    } catch (e) {
      console.warn('BTC: lỗi xử lý thư của', from, e)
    }
  }

  private joinRef(from: string, m: Extract<ClientMsg, { role: 'ref' }>): void {
    const code = this.state.codes[m.field]
    if (code === undefined || code !== m.code) {
      this.wrongCode(from, m.field)
      return
    }
    // một máy không giữ cả hai ghế của một sân
    const other = this.seats.get(key(m.field, m.side === 'red' ? 'blue' : 'red'))
    if (other && other.device === m.device) {
      this.deps.send(from, { t: 'deny', reason: 'taken' })
      return
    }
    const k = key(m.field, m.side)
    const h = this.seats.get(k)
    if (!h || h.device === m.device) {
      this.seats.set(k, { device: m.device, peer: from, online: true })
      this.pending = this.pending.filter((p) => p.device !== m.device)
      this.sendField(m.field)
      return
    }
    this.pending = this.pending.filter((p) => p.device !== m.device)
    this.pending.push({ field: m.field, side: m.side, device: m.device, peer: from })
    this.deps.send(from, { t: 'deny', reason: 'waiting' })
  }

  private locked(peer: string): boolean {
    const w = this.wrong.get(peer)
    if (!w || w.n < MAX_WRONG) return false
    if (this.deps.now() < w.until) return true
    this.wrong.delete(peer) // hết khoá: đếm lại từ đầu
    return false
  }

  private wrongCode(peer: string, field: number): void {
    const w = this.wrong.get(peer) ?? { n: 0, until: 0 }
    w.n += 1
    if (w.n >= MAX_WRONG) w.until = this.deps.now() + LOCK_MS
    this.wrong.set(peer, w)
    this.wrongByField.set(field, (this.wrongByField.get(field) ?? 0) + 1)
    this.deps.send(peer, { t: 'deny', reason: 'code' })
  }

  /** Số lần nhập sai mã của sân (từ lần đổi mã gần nhất), để thẻ sân trên màn BTC cảnh báo. */
  wrongCodes(field: number): number {
    return this.wrongByField.get(field) ?? 0
  }

  /** `sheet` đã qua sanitizeSheet (null = phiếu hỏng ⇒ bỏ, chỉ trả khung nhìn, không động tới seq). */
  private op(from: string, m: Extract<ClientMsg, { t: 'op' }>, sheet: HalfSheet | null): void {
    const k = key(m.field, m.side)
    const h = this.seats.get(k)
    if (!h || h.device !== m.device) {
      const waiting = this.pending.some((p) => p.device === m.device)
      this.deps.send(from, { t: 'deny', reason: waiting ? 'waiting' : 'taken' })
      return
    }
    h.peer = from
    h.online = true
    const l = this.state.live[m.field]
    const ak = ackKey(m.device, m.field, m.side)
    const seen = this.acks.get(ak)
    const fresh = m.seq > (seen ?? 0)
    // phiếu của giải khác (mở file / giải mới, cùng mã trận) ⇒ bỏ, chỉ trả khung nhìn
    if (!l || m.event !== this.state.id || l.matchId !== m.matchId || (l.phase !== 'play' && l.phase !== 'inventory') || !fresh || !sheet) {
      this.deps.send(from, this.refView(m.field, m.side))
      return
    }
    // ackSeq phải có sẵn trong khung nhìn mà dispatch gửi đi; dispatch lỗi ⇒ trả lại seq cũ (chỉ tính khi đã lưu).
    this.acks.set(ak, m.seq)
    try {
      this.dispatch({ t: 'live.sheet', field: m.field, side: m.side, sheet, submit: m.submit })
    } catch (e) {
      if (seen === undefined) this.acks.delete(ak)
      else this.acks.set(ak, seen)
      throw e
    }
  }

  /** Màn BTC gọi: reduce ⇒ lưu đúng một lần ⇒ gửi lại khung nhìn. reduce lỗi ⇒ ném lại, không lưu. */
  dispatch(a: Action): void {
    const before = this.state
    const next = reduce(before, a)
    this.state = next
    this.deps.save(next)
    if (a.t === 'live.start') {
      this.offset.set(a.field, 0)
      this.committed.delete(a.field)
    } else if (a.t === 'live.commit') {
      this.committed.set(a.field, { id: before.live[a.field]!.matchId, at: this.deps.now() })
    } else if (a.t === 'live.abort') {
      this.offset.delete(a.field)
      this.committed.delete(a.field)
    } else if (a.t === 'code.new') {
      // mã mới: mọi người vào lại bằng mã mới (giữ ghế cũ thì người biết mã cũ vẫn chấm được)
      this.wrongByField.delete(a.field)
      this.pending = this.pending.filter((p) => p.field !== a.field)
      for (const side of SIDES) this.release(a.field, side, false)
    }
    if ('field' in a) this.sendField(a.field)
    else for (const f of this.fieldsInUse()) this.sendField(f)
  }

  /** Cho thay trọng tài: người cũ nhận deny 'taken', ghế sang máy đang chờ. */
  allow(field: number, side: Side): void {
    const p = this.pending.find((x) => x.field === field && x.side === side)
    if (!p) return
    const k = key(field, side)
    const old = this.seats.get(k)
    if (old && old.online && this.online.has(old.peer)) this.deps.send(old.peer, { t: 'deny', reason: 'taken' })
    this.seats.set(k, { device: p.device, peer: p.peer, online: this.online.has(p.peer) })
    this.pending = this.pending.filter((x) => x !== p)
    this.sendField(field)
  }

  /** Giải phóng ghế (mất điện thoại). */
  release(field: number, side: Side, send = true): void {
    const k = key(field, side)
    const old = this.seats.get(k)
    if (!old) return
    this.seats.delete(k)
    if (old.online && this.online.has(old.peer)) this.deps.send(old.peer, { t: 'deny', reason: 'taken' })
    if (send) this.sendField(field)
  }

  /** Mỗi 250 ms: hết giờ ⇒ còi; còn giờ ⇒ gửi khi giây hiển thị đổi; official quá OFFICIAL_MS ⇒ về màn chờ. */
  tick(): void {
    for (const [field, c] of [...this.committed]) {
      if (this.deps.now() - c.at < OFFICIAL_MS) continue
      this.committed.delete(field)
      try {
        this.sendField(field)
      } catch (e) {
        console.warn(`BTC: lỗi gửi màn chờ sân ${field + 1}`, e)
      }
    }
    for (const [f, l] of Object.entries(this.state.live)) {
      const field = Number(f)
      if (!l || l.phase !== 'play') continue
      try { // lỗi một sân không làm dừng đồng hồ sân khác
        if (this.elapsed(field, l) >= MATCH_SEC) this.dispatch({ t: 'live.whistle', field })
        else if (this.clock(field, l) !== this.lastClock.get(field)) this.sendField(field)
      } catch (e) {
        console.warn(`BTC: lỗi đồng hồ sân ${field + 1}`, e)
      }
    }
  }

  /** Móc cho e2e: dời đồng hồ sân để đã trôi đúng `elapsedSec` giây. */
  skipTo(field: number, elapsedSec: number): void {
    const l = this.state.live[field]
    if (!l || l.startedAt === null) return
    this.offset.set(field, elapsedSec - (this.deps.now() - l.startedAt) / 1000)
  }

  private elapsed(field: number, l: Live): number {
    if (l.startedAt === null) return 0
    return (this.deps.now() - l.startedAt) / 1000 + (this.offset.get(field) ?? 0)
  }

  private clock(field: number, l: Live | null | undefined): number | null {
    if (!l || l.phase !== 'play') return null
    return Math.max(0, Math.ceil(MATCH_SEC - this.elapsed(field, l) - 1e-9))
  }

  private fieldsInUse(): Set<number> {
    const fs = new Set<number>(this.screens.values())
    for (const k of this.seats.keys()) fs.add(Number(k.split(':')[0]))
    return fs
  }

  /** Gửi khung nhìn mới cho trọng tài đang giữ ghế và mọi màn chiếu của sân. */
  private sendField(field: number): void {
    this.lastClock.set(field, this.clock(field, this.state.live[field]))
    // khung nhìn lỗi (vd. file giải cũ hỏng) chỉ ghi cảnh báo: thay đổi đã lưu, không ném ngược về dispatch / tick
    for (const side of SIDES) {
      const h = this.seats.get(key(field, side))
      if (h && h.online) this.safeSend(h.peer, () => this.refView(field, side))
    }
    let sv: ScreenView | undefined
    for (const [peer, f] of this.screens) if (f === field) this.safeSend(peer, () => (sv ??= this.screenView(field)))
  }

  private safeSend(peer: string, view: () => BtcView): void {
    try {
      this.deps.send(peer, view())
    } catch (e) {
      console.warn('BTC: không dựng được khung nhìn cho', peer, e)
    }
  }

  private name(id: Seat): string {
    if (id === null) return ''
    return this.state.teams.find((t) => t.id === id)?.name ?? id
  }

  /** Tên theo ghế (luôn 2 phần tử, ghế trống = '') để khớp pens[side][k] và official. */
  private names(seats: [Seat, Seat]): string[] {
    return seats.map((x) => this.name(x))
  }

  private match(id: string): EMatch | undefined {
    return roundOfMatch(this.state, id)?.matches.find((m) => m.id === id)
  }

  refView(field: number, side: Side): RefView {
    const l = this.state.live[field]
    const m = l ? this.match(l.matchId) : undefined
    const h = this.seats.get(key(field, side))
    return {
      t: 'ref', event: this.state.id, field, side,
      match: l && m ? { id: m.id, teams: [this.name(m[side][0]), this.name(m[side][1])] } : null,
      phase: l ? l.phase : 'idle',
      clock: this.clock(field, l),
      sheet: structuredClone(l?.sheets[side] ?? emptySheet()),
      ackSeq: h ? this.acks.get(ackKey(h.device, field, side)) ?? 0 : 0,
    }
  }

  /** Vòng để hiện "trận kế" / xếp hạng: vòng của trận đang đấu ⇒ vừa chốt ⇒ vòng còn trận chưa đấu trên sân ⇒ vòng cuối. */
  private roundFor(field: number): Round | undefined {
    const l = this.state.live[field]
    if (l) return roundOfMatch(this.state, l.matchId)
    const c = this.committed.get(field)?.id
    const r = c ? roundOfMatch(this.state, c) : undefined
    if (r) return r
    return this.state.rounds.find((x) => x.matches.some((m) => m.field === field && !x.results[m.id])) ?? this.state.rounds.at(-1)
  }

  screenView(field: number): ScreenView {
    const l = this.state.live[field]
    const m = l ? this.match(l.matchId) : undefined
    const refs = {} as ScreenView['refs']
    for (const side of SIDES) {
      const h = this.seats.get(key(field, side))
      refs[side] = l?.submitted[side] ? 'sent' : h && h.online ? 'on' : 'off'
    }
    let official: ScreenView['official'] = null
    const cid = this.committed.get(field)?.id
    const cr = cid ? roundOfMatch(this.state, cid) : undefined
    const cm = cid ? this.match(cid) : undefined
    if (!l && cid && cr?.results[cid] && cm) {
      const pts = teamPoints(cr.results[cid], cm)
      official = []
      for (const side of SIDES) {
        cm[side].forEach((id, seat) => {
          const t = id === null ? undefined : pts.find((x) => x.id === id)
          if (t) official!.push({ side, seat: seat as 0 | 1, name: this.name(id), score: t.score })
        })
      }
    }
    const round = this.roundFor(field)
    const busy = new Set(Object.values(this.state.live).filter((x): x is Live => !!x).map((x) => x.matchId))
    const nm = round?.matches
      .filter((x) => x.field === field && !round.results[x.id] && !busy.has(x.id))
      .sort((a, b) => a.slot - b.slot)[0]
    const shown = m ?? cm
    return {
      t: 'screen', field,
      teams: shown ? { red: this.names(shown.red), blue: this.names(shown.blue) } : { red: ['', ''], blue: ['', ''] },
      phase: l ? l.phase : 'idle',
      clock: this.clock(field, l),
      score: liveScore(l?.sheets.red, l?.sheets.blue),
      pens: { red: structuredClone((l?.sheets.red ?? emptySheet()).pens), blue: structuredClone((l?.sheets.blue ?? emptySheet()).pens) },
      refs,
      official,
      next: round && nm ? { teams: { red: this.names(nm.red), blue: this.names(nm.blue) }, time: slotTime(round.startAt, round.slotMin, nm.slot) } : null,
      ranking: round ? roundStandings(this.state, round.id).filter((r) => r.rank > 0).map((r) => ({ rank: r.rank, name: this.name(r.id), total: r.total })) : [],
    }
  }
}
