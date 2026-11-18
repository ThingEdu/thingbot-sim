// Màn chiếu điểm trực tiếp một sân (man-chieu.html?san=<n>, n tính từ 1): Đỏ | điểm lớn + đồng hồ | Xanh, bảng chi tiết,
// dòng trạng thái trọng tài; sau khi chốt hiện điểm chính thức; rảnh thì hiện trận kế + bảng xếp hạng. Chỉ nhận khung nhìn
// của máy BTC rồi vẽ. Không import gì của game 3D / vật lý (chỉ half.ts, scoring.ts, link.ts, proto.ts kiểu).
import { brandStrip } from '../ui/brand.ts'
import { browserBtc, connectClient } from './link.ts'
import type { BtcView, ScreenView } from './proto.ts'
import { esc, fieldName } from './referee-ui.ts'
import { screenLines } from './screen.ts'

const FIELDS = 4
const MAX_ROWS = 12

type Conn = 'connecting' | 'online' | 'offline' | 'nobtc'

export const CSS = `
:root { color-scheme: dark; --u: min(1vw, 1.78vh); }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #0b1020; color: #eef2fa; font: calc(var(--u) * 1.5)/1.3 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
#app { height: 100vh; display: flex; flex-direction: column; padding: calc(var(--u) * 1.2) calc(var(--u) * 2); gap: calc(var(--u) * 1.2); }
.sc-top { display: flex; justify-content: space-between; align-items: center; gap: calc(var(--u) * 2); }
.sc-top b { font-size: calc(var(--u) * 2.2); font-weight: 900; }
.sc-st { font-size: calc(var(--u) * 1.2); padding: .2em .8em; border-radius: 99px; background: #ffffff18; font-weight: 700; }
.sc-st.ok { background: #1fa86044; color: #b9f5cf; } .sc-st.bad { background: #e9c21a44; color: #ffe08a; }
.sc-row { flex: 1 1 auto; max-height: 52vh; display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: calc(var(--u) * 1.5); align-items: stretch; }
.sc-side { border-radius: calc(var(--u) * 1.5); padding: calc(var(--u) * 1.5); text-align: center; display: flex; flex-direction: column; justify-content: center; gap: calc(var(--u) * .4); min-width: 0; }
.sc-side.red { background: #c8253c; } .sc-side.blue { background: #2456d6; }
.sc-side h2 { margin: 0; font-size: calc(var(--u) * 3.6); font-weight: 900; letter-spacing: .08em; }
.sc-side .tn { font-size: calc(var(--u) * 2.6); font-weight: 800; overflow-wrap: anywhere; }
.sc-side .ts { font-size: calc(var(--u) * 5); font-weight: 900; font-variant-numeric: tabular-nums; }
.sc-mid { background: #000; border-radius: calc(var(--u) * 1.5); text-align: center; padding: calc(var(--u) * 1) 0; display: flex; flex-direction: column; justify-content: center; }
.sc-big { font-size: calc(var(--u) * 12); font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; color: #ffcf5a; }
.sc-clock { font-size: calc(var(--u) * 4.5); font-weight: 900; font-variant-numeric: tabular-nums; }
.sc-off { font-size: calc(var(--u) * 5); line-height: 1.15; }
.sc-lab { font-size: calc(var(--u) * 1.8); font-weight: 800; letter-spacing: .1em; opacity: .9; }
.sc-calc { font-size: calc(var(--u) * 2); opacity: .85; font-variant-numeric: tabular-nums; }
table.sc-t { width: 100%; border-collapse: collapse; font-size: calc(var(--u) * 2.2); }
table.sc-t td { padding: calc(var(--u) * .5) calc(var(--u) * 1); border-top: 1px solid #ffffff22; }
table.sc-t td:last-child { text-align: right; font-weight: 900; font-variant-numeric: tabular-nums; }
.sc-det { display: grid; grid-template-columns: 1fr 1fr; column-gap: calc(var(--u) * 3); font-size: calc(var(--u) * 2.1); }
.sc-det div { display: flex; justify-content: space-between; gap: 1em; padding: calc(var(--u) * .45) calc(var(--u) * 1); border-top: 1px solid #ffffff22; }
.sc-det div b { white-space: nowrap; font-weight: 900; font-variant-numeric: tabular-nums; text-align: right; }
.sc-refs { font-size: calc(var(--u) * 1.9); color: #ffcf5a; font-weight: 800; }
.sc-wait { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: calc(var(--u) * 2); min-height: 0; }
.sc-card { background: #ffffff10; border-radius: calc(var(--u) * 1.5); padding: calc(var(--u) * 1.5) calc(var(--u) * 2); min-height: 0; display: flex; flex-direction: column; }
.sc-card h2 { margin: 0 0 calc(var(--u) * .8); font-size: calc(var(--u) * 2.6); }
.sc-vs { font-size: calc(var(--u) * 3); font-weight: 800; line-height: 1.5; }
.sc-vs .r { color: #ff8b9b; } .sc-vs .b { color: #8db0ff; }
.sc-time { font-size: calc(var(--u) * 7); font-weight: 900; color: #ffcf5a; font-variant-numeric: tabular-nums; }
.sc-rank { flex: 1; overflow: hidden; position: relative; }
.sc-rank table { font-size: calc(var(--u) * 2.2); }
.sc-rank td:first-child { width: 3em; font-weight: 900; color: #ffcf5a; text-align: center; }
.sc-scroll { animation: sc-up var(--dur, 30s) linear infinite; }
@keyframes sc-up { 0%, 8% { transform: translateY(0); } 92%, 100% { transform: translateY(var(--dy, 0)); } }
.sc-pick { margin: auto; text-align: center; }
.sc-pick h1 { font-size: calc(var(--u) * 4); }
.sc-pick a { display: inline-block; margin: calc(var(--u) * 1); padding: calc(var(--u) * 1.5) calc(var(--u) * 4); border-radius: calc(var(--u) * 1.5); background: #ffffff1c; color: #fff; font-size: calc(var(--u) * 3.4); font-weight: 900; text-decoration: none; }
.sc-brand { display: flex; align-items: center; }
`

export const clockText = (sec: number | null): string => {
  if (sec === null || !Number.isFinite(sec)) return '–:––'
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const SIDE_NAME = { red: 'ĐỎ', blue: 'XANH' } as const

function statusChip(c: Conn): string {
  if (c === 'online') return '<span class="sc-st ok" id="sc-st">đã nối</span>'
  if (c === 'nobtc') return '<span class="sc-st bad" id="sc-st">chờ máy BTC</span>'
  if (c === 'offline') return '<span class="sc-st bad" id="sc-st">mất kết nối</span>'
  return '<span class="sc-st" id="sc-st">đang nối…</span>'
}

const REF_TEXT = { off: 'chưa nối', on: 'đã nối', sent: 'đã gửi kiểm kê ✓' } as const
export const refsText = (v: ScreenView): string => `Trọng tài Đỏ: ${REF_TEXT[v.refs.red]} · Trọng tài Xanh: ${REF_TEXT[v.refs.blue]}`

/** Điểm chính thức: bốn mục theo thứ tự Đỏ 1, Đỏ 2, Xanh 1, Xanh 2 (teamPoints của máy BTC). */
function sidePanel(v: ScreenView, side: 'red' | 'blue'): string {
  const names = v.teams[side]
  const off = v.official
  const base = side === 'red' ? 0 : 2
  const rows = names.map((n, i) => `<div class="tn">${esc(n || '—')}</div>${off && off[base + i] ? `<div class="ts">${off[base + i].score} điểm</div>` : ''}`).join('')
  return `<div class="sc-side ${side}"><h2>${SIDE_NAME[side]}</h2>${rows}</div>`
}

function liveHtml(v: ScreenView): string {
  const official = v.official !== null
  const label = official ? 'ĐIỂM CHÍNH THỨC' : v.phase === 'ready' ? 'SẴN SÀNG' : v.phase === 'inventory' ? 'KIỂM KÊ · ĐIỂM TẠM' : 'ĐIỂM TẠM'
  const s = v.score
  const calc = s.multPct !== 100 && s.mission > 0 ? `${s.mission} × ${screenLines(v).find((l) => l.label === 'Hệ số leo')?.value}` : '&nbsp;'
  let mid: string
  if (official) {
    mid = `<div class="sc-big sc-off" id="sc-total">${label}</div><div class="sc-calc">trận đã chốt</div>`
  } else mid = `<div class="sc-clock" id="sc-clock">${clockText(v.clock)}</div><div class="sc-big" id="sc-total">${s.total}</div><div class="sc-lab">${label}</div><div class="sc-calc">${calc}</div>`
  const table = official ? '' : `<div class="sc-det">${screenLines(v).map((l) => `<div><span>${esc(l.label)}</span><b>${esc(l.value)}</b></div>`).join('')}</div>`
  return `<div class="sc-row">${sidePanel(v, 'red')}<div class="sc-mid">${mid}</div>${sidePanel(v, 'blue')}</div>${table}${official ? '' : `<div class="sc-refs">${esc(refsText(v))}</div>`}`
}

function idleHtml(v: ScreenView): string {
  const next = v.next
    ? `<div class="sc-vs"><span class="r">Đỏ</span> ${esc(v.next.teams.red.join(' · ') || '—')}<br><span class="b">Xanh</span> ${esc(v.next.teams.blue.join(' · ') || '—')}</div><div class="sc-time">${esc(v.next.time)}</div>`
    : '<div class="sc-vs">Chưa có trận kế tiếp</div>'
  const rows = v.ranking.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.total}</td></tr>`).join('')
  const rank = v.ranking.length ? `<div class="sc-rank" id="sc-rank"><table class="sc-t" id="sc-rank-t"><tbody>${rows}</tbody></table></div>` : '<div class="sc-vs">Chưa có kết quả</div>'
  return `<div class="sc-wait"><div class="sc-card"><h2>Trận kế tiếp</h2>${next}</div><div class="sc-card"><h2>Bảng xếp hạng</h2>${rank}</div></div>`
}

export function screenHtml(field: number, conn: Conn, v: ScreenView | null): string {
  const top = `<div class="sc-top"><span class="sc-brand" id="sc-brand"></span><b>${fieldName(field)}</b>${statusChip(conn)}</div>`
  let body: string
  if (!v) body = '<div class="sc-pick"><h1>Chờ máy Ban tổ chức…</h1></div>'
  else if (v.phase === 'idle' && v.official === null) body = idleHtml(v)
  else body = liveHtml(v)
  return top + body
}

function pickHtml(): string {
  const links = Array.from({ length: FIELDS }, (_, i) => `<a href="?san=${i + 1}">Sân ${i + 1}</a>`).join('')
  return `<div class="sc-pick"><h1>Chọn sân để chiếu</h1><div>${links}</div></div>`
}

const wsUrl = () => (new URLSearchParams(location.search).has('btc') ? browserBtc(location.search) : `ws://${location.host}/ws`)

class Screen {
  private conn: Conn = 'connecting'
  private view: ScreenView | null = null
  private joinTimer: ReturnType<typeof setInterval> | null = null
  private link: ReturnType<typeof connectClient>
  private lastKey = ''

  constructor(private root: HTMLElement, private field: number) {
    this.render()
    this.link = connectClient(wsUrl(), (m) => this.onView(m), (s) => this.onState(s))
  }

  private sendJoin(): void {
    this.link.send({ t: 'join', role: 'screen', field: this.field })
  }

  private onState(s: 'online' | 'offline' | 'nobtc'): void {
    this.conn = s
    if (this.joinTimer) clearInterval(this.joinTimer)
    this.joinTimer = null
    if (s === 'online') this.sendJoin()
    else if (s === 'nobtc') this.joinTimer = setInterval(() => this.sendJoin(), 2000)
    this.render()
  }

  private onView(m: BtcView): void {
    if (m.t !== 'screen' || m.field !== this.field) return
    this.conn = 'online'
    this.view = m
    this.render()
  }

  private render(): void {
    const v = this.view
    // đồng hồ đổi mỗi giây: chỉ sửa chữ, không dựng lại (bảng xếp hạng cuộn không bị giật về đầu)
    const key = JSON.stringify([this.conn, v && { ...v, clock: v.clock === null }])
    if (key === this.lastKey) {
      const c = this.root.querySelector('#sc-clock')
      if (c && v) c.textContent = clockText(v.clock)
      return
    }
    this.lastKey = key
    this.root.innerHTML = screenHtml(this.field, this.conn, v)
    this.root.querySelector('#sc-brand')?.append(brandStrip(30))
    this.fitRank()
  }

  /** Bảng xếp hạng dài hơn 12 dòng: cuộn chậm lên rồi quay về đầu. */
  private fitRank(): void {
    const t = this.root.querySelector<HTMLElement>('#sc-rank-t')
    const box = this.root.querySelector<HTMLElement>('#sc-rank')
    if (!t || !box || (this.view?.ranking.length ?? 0) <= MAX_ROWS) return
    const over = t.scrollHeight - box.clientHeight
    if (over <= 0) return
    t.classList.add('sc-scroll')
    t.style.setProperty('--dy', `-${over}px`)
    t.style.setProperty('--dur', `${Math.max(12, (this.view?.ranking.length ?? 0) * 1.5)}s`)
  }
}

const style = document.createElement('style')
style.textContent = CSS
document.head.append(style)
const root = document.getElementById('app')!
const san = Number(new URLSearchParams(location.search).get('san'))
if (Number.isInteger(san) && san >= 1 && san <= FIELDS) new Screen(root, san - 1)
else root.innerHTML = pickHtml()
