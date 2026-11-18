// Trang trọng tài trên điện thoại (trong-tai.html): vào sân bằng mã, giữ phiếu nửa sân trên máy, gửi từng thay đổi lên
// máy BTC (gộp 150 ms), mất mạng thì giữ bản chờ (RefQueue) và gửi lại khi nối lại. Không import gì của game 3D / vật lý.
import { brandStrip } from '../ui/brand.ts'
import { emptySheet, type HalfSheet, type Side } from './event.ts'
import { sameTarget, type Target } from './halfmap.ts'
import { browserBtc, connectClient } from './link.ts'
import { FIELD_PICKER, type BtcView, type ClientMsg, type RefView } from './proto.ts'
import { addFault, bump, reconcile, removeFault, type FaultKind } from './refmodel.ts'
import { RefQueue, refKey } from './refqueue.ts'
import { clockText, CSS, entryHtml, mainHtml, messageHtml, statusText, topHtml, type Conn, type SubmitState, type Tab } from './referee-ui.ts'
import { FAULTS } from '../faults.ts'

const DEVICE_KEY = 'fanroc.v1.btc.device'
const JOIN_KEY = 'fanroc.v1.btc.join' // sessionStorage: tải lại trang không phải nhập lại mã
const FIELDS = FIELD_PICKER
const DEBOUNCE_MS = 150

function safeGet(st: () => Storage, k: string): string | null {
  try {
    return st().getItem(k)
  } catch {
    return null
  }
}
function safeSet(st: () => Storage, k: string, v: string | null): void {
  try {
    if (v === null) st().removeItem(k)
    else st().setItem(k, v)
  } catch {
    // bị chặn: bỏ qua
  }
}
const local = () => localStorage
const session = () => sessionStorage

function deviceId(): string {
  const old = safeGet(local, DEVICE_KEY)
  if (old && /^[0-9a-f]{8,64}$/.test(old)) return old
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  const id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  safeSet(local, DEVICE_KEY, id)
  return id
}

/** Kho cho RefQueue: localStorage, bị chặn thì một Map trong bộ nhớ. */
function queueStore(): Pick<Storage, 'getItem' | 'setItem'> {
  const mem = new Map<string, string>()
  return {
    getItem: (k) => safeGet(local, k) ?? mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v)
      safeSet(local, k, v)
    },
  }
}

const wsUrl = () => (new URLSearchParams(location.search).has('btc') ? browserBtc(location.search) : `ws://${location.host}/ws`)
const defaultTab = (phase: RefView['phase']): Tab => (phase === 'inventory' ? 'inv' : 'play')

type Screen = 'entry' | 'main' | 'msg'

class Referee {
  private root: HTMLElement
  private device = deviceId()
  private screen: Screen = 'entry'
  private entry = { field: 0, side: 'red' as Side, code: '', err: '' }
  private msg = { text: '', sub: '', back: false }
  private link: { send(m: ClientMsg): void; close(): void; drop(): void } | null = null
  private conn: Conn = 'connecting'
  private queue: RefQueue | null = null
  private view: RefView | null = null
  private matchId: string | null = null
  private sheet: HalfSheet = emptySheet()
  private tab: Tab = 'play'
  private sel: Target | null = { t: 'groove', m: 0, k: 0 }
  private ft: { team: 0 | 1; code: string } = { team: 0, code: FAULTS[0]?.code ?? 'Khác' }
  private submit: SubmitState = 'none'
  private debounce: ReturnType<typeof setTimeout> | null = null
  private joinTimer: ReturnType<typeof setInterval> | null = null
  private lastKey = ''

  constructor(root: HTMLElement) {
    this.root = root
    const q = new URLSearchParams(location.search)
    const f = Number(q.get('san'))
    if (Number.isInteger(f) && f >= 1 && f <= FIELDS) this.entry.field = f - 1
    root.addEventListener('click', (e) => this.onClick(e))
    root.addEventListener('change', (e) => this.onChange(e))
    root.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement
      if (e.key === 'Enter' && t.id === 'rf-code') this.join()
      else if ((e.key === 'Enter' || e.key === ' ') && t.closest('.hm-hit')) {
        e.preventDefault()
        this.onClick(e)
      }
    })
    try {
      const saved = JSON.parse(safeGet(session, JOIN_KEY) ?? 'null') as { field: number; side: Side; code: string } | null
      if (saved && Number.isInteger(saved.field) && (saved.side === 'red' || saved.side === 'blue') && typeof saved.code === 'string') {
        this.entry = { field: saved.field, side: saved.side, code: saved.code, err: '' }
        this.start()
        return
      }
    } catch {
      // bỏ qua
    }
    this.render()
  }

  // ---------- vào / ra ----------
  private join(): void {
    const input = this.root.querySelector<HTMLInputElement>('#rf-code')
    if (input) this.entry.code = input.value.trim()
    if (!/^\d{4}$/.test(this.entry.code)) {
      this.entry.err = 'Mã sân gồm 4 chữ số.'
      this.render()
      return
    }
    this.entry.err = ''
    safeSet(session, JOIN_KEY, JSON.stringify({ field: this.entry.field, side: this.entry.side, code: this.entry.code }))
    this.start()
  }

  private start(): void {
    this.stop()
    this.queue = new RefQueue(queueStore(), refKey(this.entry.field, this.entry.side))
    const p = this.queue.pending()
    // phiếu chưa gửi được lần trước (tải lại trang giữa trận): dùng làm phiếu máy
    this.matchId = p?.matchId ?? null
    this.sheet = p?.sheet ?? emptySheet()
    this.submit = p?.submit ? 'sending' : 'none'
    this.view = null
    this.screen = 'msg'
    this.msg = { text: 'Đang nối máy Ban tổ chức…', sub: `Sân ${this.entry.field + 1} · Trọng tài ${this.entry.side === 'red' ? 'Đỏ' : 'Xanh'}`, back: true }
    this.conn = 'connecting'
    this.render()
    this.link = connectClient(wsUrl(), (m) => this.onView(m), (s) => this.onState(s))
  }

  private stop(): void {
    this.flush()
    this.link?.close()
    this.link = null
    this.setJoinTimer(0)
  }

  /** e2e: đóng ống nối, `connectClient` tự nối lại. */
  drop(): void {
    this.link?.drop()
  }

  private back(err = ''): void {
    this.stop()
    safeSet(session, JOIN_KEY, null)
    this.screen = 'entry'
    this.entry.err = err
    this.render()
  }

  private sendJoin(): void {
    this.link?.send({ t: 'join', role: 'ref', field: this.entry.field, side: this.entry.side, code: this.entry.code, device: this.device })
  }

  /** Gửi lại join mỗi `ms` (0 = thôi). */
  private setJoinTimer(ms: number): void {
    if (this.joinTimer) clearInterval(this.joinTimer)
    this.joinTimer = ms > 0 ? setInterval(() => this.sendJoin(), ms) : null
  }

  private onState(s: 'online' | 'offline' | 'nobtc'): void {
    this.conn = s
    if (s === 'online') {
      this.sendJoin()
      this.sendPending()
      this.setJoinTimer(0)
    } else if (s === 'nobtc') {
      if (!this.joinTimer) this.setJoinTimer(2000)
    } else this.setJoinTimer(0)
    if (this.screen === 'msg' && s === 'nobtc') this.msg = { text: 'Chưa có máy Ban tổ chức', sub: 'Trang tự thử lại. Nhờ Ban tổ chức mở màn điều hành giải trên máy BTC.', back: true }
    this.render()
  }

  private onView(m: BtcView): void {
    if (m.t === 'deny') {
      if (m.reason === 'code') return this.back('Mã sân không đúng')
      if (m.reason === 'waiting') {
        this.screen = 'msg'
        this.msg = { text: 'Đang chờ Ban tổ chức cho thay trọng tài…', sub: 'Ghế này đang có người chấm. Khi Ban tổ chức bấm Cho thay, trang tự vào.', back: true }
        this.setJoinTimer(3000)
        return this.render()
      }
      this.stop()
      safeSet(session, JOIN_KEY, null)
      this.screen = 'msg'
      this.msg = { text: 'Ghế này đã giao cho người khác', sub: '', back: true }
      return this.render()
    }
    if (m.t !== 'ref' || m.field !== this.entry.field || m.side !== this.entry.side || !this.queue) return
    this.setJoinTimer(0)
    this.conn = 'online'
    if (this.debounce) this.flush() // sửa đang gộp chưa gửi: đưa vào hàng chờ trước khi so
    const p = this.queue.pending()
    const r = reconcile({ matchId: this.matchId, sheet: this.sheet }, p, m)
    if (r.drop) {
      this.queue.drop()
      this.submit = 'none'
    }
    if (r.ack !== null) {
      if (p?.submit) this.submit = 'sent'
      this.queue.ack(r.ack)
    }
    this.queue.floor(m.ackSeq)
    if (this.matchId !== r.matchId) this.submit = 'none'
    const prev = this.view?.phase
    this.matchId = r.matchId
    this.sheet = r.sheet
    this.view = m
    if (this.screen !== 'main' || prev !== m.phase) this.tab = defaultTab(m.phase)
    this.screen = 'main'
    if (r.resend) this.sendPending()
    this.render()
  }

  // ---------- gửi ----------
  private editable(): boolean {
    return this.screen === 'main' && !!this.view?.match && this.matchId !== null && (this.view.phase === 'play' || this.view.phase === 'inventory')
  }

  private edit(fn: (s: HalfSheet) => HalfSheet | null): void {
    if (!this.editable()) return
    const next = fn(structuredClone(this.sheet))
    if (!next) return
    this.sheet = next
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => this.flush(), DEBOUNCE_MS)
    this.render()
  }

  /** Gộp các sửa đang chờ thành một op. */
  private flush(submit = false): void {
    if (this.debounce) clearTimeout(this.debounce)
    const had = this.debounce !== null
    this.debounce = null
    if (!this.queue || this.matchId === null || (!had && !submit)) return
    this.queue.push(this.matchId, this.sheet, submit)
    if (submit || this.submit === 'sending') this.submit = 'sending'
    this.sendPending()
    this.render()
  }

  private sendPending(): void {
    const p = this.queue?.pending()
    if (!p || !this.link) return
    this.link.send({ t: 'op', device: this.device, seq: p.seq, field: this.entry.field, side: this.entry.side, matchId: p.matchId, sheet: p.sheet, submit: p.submit })
  }

  // ---------- sự kiện ----------
  private onChange(e: Event): void {
    const t = e.target as HTMLElement
    if (t instanceof HTMLSelectElement && t.dataset.act === 'f-code') this.ft.code = t.value
    if (t instanceof HTMLInputElement && t.id === 'rf-code') this.entry.code = t.value.trim()
  }

  private onClick(e: Event): void {
    const el = e.target as Element
    const hit = el.closest<SVGGElement>('.hm-hit')
    if (hit && hit.dataset.t) {
      try {
        const t = JSON.parse(hit.dataset.t) as Target
        if (!sameTarget(this.sel, t)) {
          this.sel = t
          this.render()
        }
      } catch {
        // bỏ
      }
      return
    }
    const b = el.closest<HTMLElement>('[data-act]')
    if (!b || (b as HTMLButtonElement).disabled) return
    const act = b.dataset.act
    const v = b.dataset.v ?? ''
    const d = Number(b.dataset.d ?? 0)
    const k = Number(b.dataset.k ?? 0) as 0 | 1
    const sel = this.sel
    switch (act) {
      case 'e-field': this.entry.field = Number(v); this.keepCode(); return this.render()
      case 'e-side': this.entry.side = v as Side; this.keepCode(); return this.render()
      case 'e-join': return this.join()
      case 'back': return this.back()
      case 'tab': this.tab = v as Tab; return this.render()
      case 'n-fire-o': return this.edit((s) => ((s.fire.o = bump(s.fire.o, d)), s))
      case 'n-fire-g': return this.edit((s) => ((s.fire.g = bump(s.fire.g, d)), s))
      case 'n-g': if (sel?.t === 'groove') this.edit((s) => ((s.mtn[sel.m][sel.k].g = bump(s.mtn[sel.m][sel.k].g, d)), s)); return
      case 'n-o': if (sel?.t === 'groove') this.edit((s) => ((s.mtn[sel.m][sel.k].o = bump(s.mtn[sel.m][sel.k].o, d)), s)); return
      case 'n-decor': return this.edit((s) => ((s.decorO = bump(s.decorO, d)), s))
      case 'flag': return this.edit((s) => ((s.flags[k] = v === '1'), s))
      case 'climb': return this.edit((s) => ((s.climbs[k] = v as HalfSheet['climbs'][number]), s))
      case 'f-team': this.ft.team = Number(v) as 0 | 1; return this.render()
      case 'f-add': return this.edit((s) => addFault(s, this.ft.team, this.ft.code, v as FaultKind, Date.now()))
      case 'f-del': return this.edit((s) => removeFault(s, Number(v)))
      case 'submit':
        if (!this.editable() || this.view?.phase !== 'inventory') return
        return this.flush(true)
    }
  }

  private keepCode(): void {
    const input = this.root.querySelector<HTMLInputElement>('#rf-code')
    if (input) this.entry.code = input.value.trim()
  }

  // ---------- vẽ ----------
  private render(): void {
    const pending = !!this.queue?.pending() || this.debounce !== null
    if (this.screen === 'entry') {
      this.lastKey = ''
      this.root.innerHTML = entryHtml(this.entry, FIELDS)
      this.root.querySelector('#rf-brand')?.append(brandStrip(28))
      return
    }
    if (this.screen === 'msg') {
      this.lastKey = ''
      const top = topHtml(this.entry.field, this.entry.side, this.conn, null, pending)
      this.root.innerHTML = top + messageHtml(this.msg.text, this.msg.back, this.msg.sub)
      return
    }
    const v = this.view!
    const model = { field: this.entry.field, side: this.entry.side, conn: this.conn, view: v, sheet: this.sheet, tab: this.tab, sel: this.sel, ft: this.ft, submit: this.submit, pending }
    // đồng hồ đổi mỗi giây: chỉ sửa chữ, không dựng lại (giữ ô chọn lỗi đang mở)
    const key = JSON.stringify({ ...model, view: { ...v, clock: v.clock === null } })
    if (key === this.lastKey) {
      const c = this.root.querySelector('#rf-clock')
      if (c) c.textContent = clockText(v.clock)
      const st = this.root.querySelector('#rf-st')
      if (st) st.textContent = statusText(this.conn, pending).text
      return
    }
    this.lastKey = key
    const y = window.scrollY
    this.root.innerHTML = mainHtml(model)
    window.scrollTo(0, y)
  }
}

const style = document.createElement('style')
style.textContent = CSS
document.head.append(style)
const referee = new Referee(document.getElementById('app')!)
/** Móc cho e2e (như `__fanroc.lan.mute`): rút dây mạng giả, trang tự nối lại. */
;(window as unknown as { __fanroc_ref: { drop(): void } }).__fanroc_ref = { drop: () => referee.drop() }
