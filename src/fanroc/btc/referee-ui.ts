// Giao diện trang trọng tài (chuỗi HTML + CSS, không thư viện). Nút mang data-act để referee.ts bắt sự kiện một chỗ.
// Đúng bản phác trong-tai-v1 phần A: dải trên (liên minh, trận, đồng hồ, trạng thái), ba thẻ, bản đồ nửa sân, bộ đếm − / +.
import type { Climb } from '../ladder.ts'
import { FAULTS } from '../faults.ts'
import { pctText, teamScore } from '../scoring.ts'
import type { HalfSheet, Side } from './event.ts'
import { halfMap, MTN_NAME, type Target } from './halfmap.ts'
import type { RefView } from './proto.ts'
import { halfScore } from './half.ts'

export type Tab = 'play' | 'inv' | 'faults'
export type Conn = 'connecting' | 'online' | 'offline' | 'nobtc'
export type SubmitState = 'none' | 'sending' | 'sent'

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const SIDE_NAME: Record<Side, string> = { red: 'Đỏ', blue: 'Xanh' }
export const fieldName = (f: number) => `Sân ${f + 1}`

export const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #10162e; color: #eef2fa; font: 15px/1.35 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
body { -webkit-tap-highlight-color: transparent; }
#app { max-width: 480px; margin: 0 auto; padding: 10px 16px 24px; }
button { font: inherit; color: inherit; cursor: pointer; touch-action: manipulation; }
button:disabled { opacity: .45; cursor: default; }
.rf-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-radius: 10px; padding: 8px 12px; font-weight: 800; min-height: 44px; }
.rf-top.red { background: #c8253c; } .rf-top.blue { background: #2456d6; }
.rf-top small { font-weight: 500; opacity: .92; text-align: right; }
.rf-clock { font-variant-numeric: tabular-nums; font-weight: 900; }
.rf-st-bad { color: #ffe08a; font-weight: 800; }
.rf-tabs { display: flex; gap: 6px; margin: 10px 0; }
.rf-tabs button { flex: 1; min-height: 44px; border: 0; border-radius: 10px; background: #ffffff14; font-weight: 800; }
.rf-tabs button[aria-selected="true"] { background: #ffcf5a; color: #221; }
.hm { display: block; border-radius: 10px; border: 2px solid #ddd; user-select: none; }
.hm-hit { cursor: pointer; }
.rf-sel { margin-top: 10px; font-weight: 800; color: #ffcf5a; }
.rf-cnt { display: grid; grid-template-columns: 1fr 52px 56px 52px; gap: 8px; align-items: center; margin-top: 8px; }
.rf-cnt button { height: 48px; border: 0; border-radius: 10px; font: 900 24px system-ui; }
.rf-m { background: #ffffff22; } .rf-p { background: #1fa860; color: #fff; }
.rf-n { text-align: center; font: 900 26px system-ui; font-variant-numeric: tabular-nums; }
.rf-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.rf-row > span { flex: 1 0 100%; font-weight: 700; }
.rf-chip { min-height: 44px; min-width: 44px; padding: 0 12px; border: 0; border-radius: 10px; background: #ffffff1c; font-weight: 800; }
.rf-chip[aria-pressed="true"] { background: #ffcf5a; color: #221; }
.rf-grow { flex: 1; }
.rf-sum { margin-top: 12px; background: #000; border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; font-weight: 800; }
.rf-big { display: block; width: 100%; min-height: 56px; margin-top: 12px; border: 0; border-radius: 12px; background: #1fa860; color: #fff; font-weight: 900; font-size: 18px; }
.rf-send { position: sticky; bottom: 0; padding: 4px 0 8px; background: #10162e; z-index: 2; }
.rf-send .rf-note { background: #1b2340; } .rf-send .rf-ok { background: #17402c; }
.rf-note { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: #ffffff10; }
.rf-ok { background: #1fa86033; color: #b9f5cf; font-weight: 800; }
.rf-card { margin-top: 24px; padding: 18px; border-radius: 14px; background: #ffffff10; }
.rf-card h1 { font-size: 22px; margin: 0 0 6px; }
.rf-card label { display: block; margin-top: 14px; font-weight: 700; }
.rf-card input { width: 100%; min-height: 52px; margin-top: 6px; border-radius: 10px; border: 2px solid #ffffff33; background: #0b1020; color: #fff; font: 900 28px system-ui; letter-spacing: 8px; text-align: center; }
.rf-err { margin-top: 12px; color: #ffb4b4; font-weight: 800; }
.rf-sel-in { width: 100%; min-height: 48px; margin-top: 6px; border-radius: 10px; background: #0b1020; color: #fff; border: 2px solid #ffffff33; font: 700 16px system-ui; padding: 0 10px; }
.rf-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.rf-kinds button { min-height: 52px; border: 0; border-radius: 10px; font-weight: 900; }
.k-warn { background: #ffffff22; } .k-minor { background: #6d7891; } .k-yellow { background: #e9c21a; color: #221; } .k-red { background: #d22; color: #fff; }
.rf-faults { list-style: none; padding: 0; margin: 10px 0 0; }
.rf-faults li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid #ffffff1c; }
.rf-faults li span { flex: 1; }
.rf-faults button { min-height: 44px; min-width: 64px; border: 0; border-radius: 10px; background: #ffffff1c; font-weight: 800; }
.rf-pens { margin-top: 10px; font-size: 14px; }
.rf-brand { display: flex; justify-content: center; margin-top: 8px; }
table.rf-t { width: 100%; border-collapse: collapse; margin-top: 8px; }
table.rf-t td { padding: 6px 4px; border-top: 1px solid #ffffff1c; } table.rf-t td:last-child { text-align: right; font-weight: 800; }
`

// ---------- màn vào ----------
export function entryHtml(e: { field: number; side: Side; code: string; err: string }, fields: number): string {
  const fieldBtns = Array.from({ length: fields }, (_, f) =>
    `<button class="rf-chip rf-grow" data-act="e-field" data-v="${f}" aria-pressed="${e.field === f}">${fieldName(f)}</button>`).join('')
  const sideBtns = (['red', 'blue'] as const).map((s) =>
    `<button class="rf-chip rf-grow" data-act="e-side" data-v="${s}" aria-pressed="${e.side === s}" style="${e.side === s ? `background:${s === 'red' ? '#c8253c' : '#2456d6'};color:#fff` : ''}">Trọng tài ${SIDE_NAME[s]}</button>`).join('')
  return `<div class="rf-brand" id="rf-brand"></div>
<div class="rf-card"><h1>Trọng tài sân</h1><div>Chọn sân, bên mình đếm, rồi nhập mã sân 4 số hiện trên máy Ban tổ chức.</div>
<label>Sân</label><div class="rf-row">${fieldBtns}</div>
<label>Bên</label><div class="rf-row">${sideBtns}</div>
<label for="rf-code">Mã sân</label><input id="rf-code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="${esc(e.code)}" placeholder="····">
${e.err ? `<div class="rf-err" role="alert">${esc(e.err)}</div>` : ''}
<button class="rf-big" data-act="e-join">Vào chấm</button></div>`
}

export function messageHtml(text: string, back: boolean, sub = ''): string {
  return `<div class="rf-card" role="status"><h1>${esc(text)}</h1>${sub ? `<div>${esc(sub)}</div>` : ''}
${back ? '<button class="rf-big" data-act="back">Về màn vào</button>' : ''}</div>`
}

// ---------- màn chấm ----------
export type MainModel = {
  field: number; side: Side; conn: Conn; view: RefView; sheet: HalfSheet; tab: Tab; sel: Target | null
  ft: { team: 0 | 1; code: string }; submit: SubmitState; pending: boolean
}

const clockText = (s: number | null) => (s === null ? '' : `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
const matchName = (id: string) => `Trận ${id.split('-').pop()}`

export function statusText(conn: Conn, pending: boolean): { text: string; bad: boolean } {
  if (conn === 'offline') return { text: pending ? 'mất mạng · chưa gửi được' : 'mất mạng', bad: true }
  if (conn === 'nobtc') return { text: pending ? 'chưa có máy BTC · chưa gửi được' : 'chưa có máy BTC', bad: true }
  if (conn === 'connecting') return { text: 'đang nối…', bad: true }
  return pending ? { text: 'đang gửi…', bad: false } : { text: 'đã nối', bad: false }
}

export function topHtml(field: number, side: Side, conn: Conn, view: RefView | null, pending: boolean): string {
  const st = statusText(conn, pending)
  const m = view?.match ? ` · ${esc(matchName(view.match.id))}` : ''
  return `<div class="rf-top ${side}"><span>Trọng tài ${SIDE_NAME[side].toUpperCase()} · ${fieldName(field)}${m}</span>`
    + `<small><span class="rf-clock" id="rf-clock">${clockText(view?.clock ?? null)}</span>${view?.clock !== null && view?.clock !== undefined ? ' · ' : ''}`
    + `<span class="${st.bad ? 'rf-st-bad' : ''}" id="rf-st">${st.text}</span></small></div>`
}

export { clockText }

function counter(label: string, act: string, n: number, editable: boolean): string {
  const dis = editable ? '' : ' disabled'
  return `<div class="rf-cnt"><span>${label}</span><button class="rf-m" data-act="${act}" data-d="-1" aria-label="Bớt ${esc(label)}"${dis}>−</button>`
    + `<span class="rf-n">${n}</span><button class="rf-p" data-act="${act}" data-d="1" aria-label="Thêm ${esc(label)}"${dis}>+</button></div>`
}

const CLIMB_NAME: [Climb, string][] = [['none', 'Không'], ['contact', 'Chạm'], ['ground', 'Đất'], ['water', 'Nước']]
const teamLabel = (v: RefView, k: 0 | 1) => v.match?.teams[k] || `Robot ${k + 1} (ghế trống)`

function climbRows(m: MainModel, editable: boolean): string {
  return ([0, 1] as const).map((k) => `<div class="rf-row"><span>${esc(teamLabel(m.view, k))} leo thang</span>`
    + CLIMB_NAME.map(([c, n]) => `<button class="rf-chip rf-grow" data-act="climb" data-k="${k}" data-v="${c}" aria-pressed="${m.sheet.climbs[k] === c}"${editable ? '' : ' disabled'}>${n}</button>`).join('')
    + '</div>').join('')
}

function flagRow(m: MainModel, k: 0 | 1, editable: boolean): string {
  const on = m.sheet.flags[k]
  return `<div class="rf-row"><span>Cờ trên ${MTN_NAME(m.side, k)}</span>`
    + `<button class="rf-chip rf-grow" data-act="flag" data-k="${k}" data-v="0" aria-pressed="${!on}"${editable ? '' : ' disabled'}>Chưa cắm</button>`
    + `<button class="rf-chip rf-grow" data-act="flag" data-k="${k}" data-v="1" aria-pressed="${on}"${editable ? '' : ' disabled'}>Đã cắm</button></div>`
}

/** Bộ đếm cho ô đang chọn trên bản đồ. */
function selPanel(m: MainModel, editable: boolean): string {
  const s = m.sel
  const inv = m.tab === 'inv' // thẻ Kiểm kê có sẵn mục Leo thang / Cờ bên dưới: không lặp lại
  const sh = m.sheet
  if (!s) return '<div class="rf-note">Chạm một rãnh, Khu Chữa Cháy hoặc thang trên hình để đếm.</div>'
  if (s.t === 'fire') {
    return `<div class="rf-sel">Khu Chữa Cháy (đang chọn)</div>`
      + counter('Bóng cam (đúng chỗ)', 'n-fire-o', sh.fire.o, editable) + counter('Bóng xanh (sai chỗ)', 'n-fire-g', sh.fire.g, editable)
  }
  if (s.t === 'groove') {
    return `<div class="rf-sel">${MTN_NAME(m.side, s.m)} · Rãnh ${s.k + 1} (đang chọn)</div>`
      + counter('Mầm Cây xanh', 'n-g', sh.mtn[s.m][s.k].g, editable) + counter('Bóng cam sai chỗ', 'n-o', sh.mtn[s.m][s.k].o, editable)
      + (inv ? '' : flagRow(m, s.m, editable))
  }
  if (s.t === 'decor') {
    return `<div class="rf-sel">Tầng trang trí — cả hai núi nửa mình (đang chọn)</div>`
      + counter('Bóng cam trên tầng trang trí', 'n-decor', sh.decorO, editable) + (inv ? '' : flagRow(m, s.m, editable))
  }
  return `<div class="rf-sel">Thang Cứu Hỏa (đang chọn)</div>${inv ? '<div class="rf-note">Chọn mức leo ở mục Leo thang bên dưới.</div>' : climbRows(m, editable)}`
}

function scoreHtml(m: MainModel): string {
  const b = halfScore(m.sheet, m.side)
  return `<div class="rf-sum"><span>Điểm tạm nửa mình</span><span>${b.mission} × ${pctText(b.multPct)} = ${b.total}</span></div>`
}

const PEN_KINDS: { kind: 'warn' | 'minor' | 'yellow' | 'red'; label: string }[] = [
  { kind: 'warn', label: 'Cảnh cáo' },
  { kind: 'minor', label: `Lỗi nhẹ −${100 - teamScore(100, { minor: 1, yellow: 0, red: false })}` },
  { kind: 'yellow', label: 'Thẻ vàng' },
  { kind: 'red', label: 'Thẻ đỏ' },
]
const KIND_NAME = Object.fromEntries(PEN_KINDS.map((k) => [k.kind, k.label])) as Record<string, string>

function faultsTab(m: MainModel, editable: boolean): string {
  const v = m.view
  const teamBtns = ([0, 1] as const).map((k) => {
    const name = v.match?.teams[k] ?? ''
    return `<button class="rf-chip rf-grow" data-act="f-team" data-v="${k}" aria-pressed="${m.ft.team === k}"${name ? '' : ' disabled'}>${esc(name || 'Ghế trống')}</button>`
  }).join('')
  const opts = [...FAULTS.map((f) => [f.code, `${f.code} · ${f.name}`]), ['Khác', 'Khác (ghi chú với trọng tài chính)']]
    .map(([c, n]) => `<option value="${esc(c)}"${m.ft.code === c ? ' selected' : ''}>${esc(n)}</option>`).join('')
  const okTeam = !!v.match?.teams[m.ft.team]
  const full = m.sheet.faults.length >= 50
  const kinds = PEN_KINDS.map((k) => `<button class="k-${k.kind}" data-act="f-add" data-v="${k.kind}"${editable && okTeam && !full ? '' : ' disabled'}>${k.label}</button>`).join('')
  const list = m.sheet.faults.map((f, i) => `<li><span><b>${esc(v.match?.teams[f.team] || `Robot ${f.team + 1}`)}</b> · ${esc(KIND_NAME[f.kind])} · ${esc(f.code)}</span>`
    + `<button data-act="f-del" data-v="${i}"${editable ? '' : ' disabled'}>Xoá</button></li>`).reverse().join('')
  const pens = ([0, 1] as const).map((k) => {
    const p = m.sheet.pens[k]
    return `<div>${esc(teamLabel(v, k))}: lỗi nhẹ ${p.minor} · thẻ vàng ${p.yellow} · thẻ đỏ ${p.red ? 'có' : 'không'} · cảnh cáo ${p.warn}</div>`
  }).join('')
  return `<div class="rf-row"><span>Đội</span>${teamBtns}</div>
<label class="rf-sel" for="rf-code-sel" style="display:block">Lỗi</label><select id="rf-code-sel" class="rf-sel-in" data-act="f-code">${opts}</select>
<div class="rf-kinds">${kinds}</div>${full ? '<div class="rf-note">Đã đủ 50 lỗi — xoá bớt nếu bấm nhầm.</div>' : ''}
<div class="rf-pens">${pens}</div><ul class="rf-faults">${list || '<li><span>Chưa có lỗi nào.</span></li>'}</ul>`
}

function invExtra(m: MainModel, editable: boolean): string {
  const ph = m.view.phase
  const sendNote = m.submit === 'sent' ? '<div class="rf-note rf-ok" role="status">Đã gửi ✓ — vẫn sửa được tới khi chốt</div>'
    : m.submit === 'sending' ? '<div class="rf-note" role="status">Đang gửi kiểm kê…</div>' : ''
  return `<div class="rf-sel">Leo thang</div>${climbRows(m, editable)}
<div class="rf-sel">Cờ</div>${flagRow(m, 0, editable)}${flagRow(m, 1, editable)}
<div class="rf-send"><button class="rf-big" data-act="submit"${ph === 'inventory' ? '' : ' disabled'}>${m.submit === 'none' ? 'Gửi kiểm kê' : 'Gửi lại kiểm kê'}</button>
${ph === 'inventory' ? sendNote : '<div class="rf-note">Sau tiếng còi mới gửi kiểm kê. Trong trận vẫn sửa số được.</div>'}</div>`
}

/** Bảng tóm tắt chỉ đọc (trận đã xong). */
function summary(m: MainModel): string {
  const sh = m.sheet
  const rows: [string, string][] = [
    ['Khu Chữa Cháy: cam / xanh', `${sh.fire.o} / ${sh.fire.g}`],
    ...([0, 1] as const).map((k): [string, string] => [`${MTN_NAME(m.side, k)}: xanh R1 / R2 / R3`, sh.mtn[k].map((x) => x.g).join(' / ')]),
    ...([0, 1] as const).map((k): [string, string] => [`${MTN_NAME(m.side, k)}: cam sai chỗ`, String(sh.mtn[k].reduce((a, x) => a + x.o, 0))]),
    ['Cam trên tầng trang trí', String(sh.decorO)],
    ['Cờ', ([0, 1] as const).map((k) => `${MTN_NAME(m.side, k)} ${sh.flags[k] ? 'có' : 'không'}`).join(' · ')],
    ['Leo thang', sh.climbs.map((c) => CLIMB_NAME.find((x) => x[0] === c)![1]).join(' · ')],
    ['Số lỗi / thẻ', String(sh.faults.length)],
  ]
  return `<div class="rf-note">Trận đã kết thúc. Phiếu dưới đây chỉ để xem.</div><table class="rf-t">${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>`
}

export function mainHtml(m: MainModel): string {
  const ph = m.view.phase
  const top = topHtml(m.field, m.side, m.conn, m.view, m.pending)
  if (ph === 'idle' || !m.view.match) {
    return top + messageHtml('Chờ trận…', false, `${fieldName(m.field)} · Trọng tài ${SIDE_NAME[m.side]}. Khi Ban tổ chức bắt đầu trận, trang tự chuyển sang phiếu chấm.`)
  }
  if (ph === 'done' || ph === 'ready') {
    const t = ph === 'ready' ? messageHtml('Sắp vào trận…', false, 'Chờ Ban tổ chức bấm bắt đầu.') : ''
    return top + (t || summary(m) + scoreHtml(m))
  }
  const editable = true
  const tabs = ([['play', 'Trong trận'], ['inv', 'Kiểm kê'], ['faults', 'Lỗi / thẻ']] as const)
    .map(([t, n]) => `<button role="tab" data-act="tab" data-v="${t}" aria-selected="${m.tab === t}">${n}</button>`).join('')
  let body: string
  if (m.tab === 'faults') body = faultsTab(m, editable)
  else body = `<div id="rf-map">${halfMap(m.side, m.sheet, m.sel)}</div>${selPanel(m, editable)}${m.tab === 'inv' ? invExtra(m, editable) : ''}`
  return `${top}<div class="rf-tabs" role="tablist">${tabs}</div>${body}${scoreHtml(m)}`
}
