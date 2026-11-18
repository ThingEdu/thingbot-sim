// Các dòng của bảng chi tiết trên màn chiếu (man-chieu.html). Thuần, không đụng DOM; chỉ dùng điểm đã có trong ScreenView
// (số bóng suy ra từ điểm vì mỗi loại là bội đúng của điểm một bóng).
import { esc } from './referee-ui.ts'
import { pctText } from '../scoring.ts'
import type { Side } from './event.ts'
import type { ScreenView } from './proto.ts'

/** Số nguyên có dấu trừ U+2212 cho số âm (đọc rõ trên màn chiếu hơn dấu gạch ngang). */
export const signed = (n: number): string => (n < 0 ? `−${-n}` : String(n))

export type ScreenLine = { label: string; value: string; side?: Side }

export function screenLines(v: ScreenView): ScreenLine[] {
  const s = v.score
  const lines: ScreenLine[] = [
    { label: 'Khu Chữa Cháy (cam +5)', value: `${s.fire / 5} → ${signed(s.fire)}` },
    { label: 'Rãnh 1 / 2 / 3 (+5 / +10 / +15)', value: `${s.r1 / 5} / ${s.r2 / 10} / ${s.r3 / 15} → ${signed(s.r1 + s.r2 + s.r3)}` },
    { label: 'Cờ', value: signed(s.flag) },
    { label: 'Bóng sai chỗ (−3)', value: `${signed(-s.wrong / 3)} → ${signed(s.wrong)}` },
    { label: 'Hệ số leo', value: pctText(s.multPct) },
  ]
  for (const side of ['red', 'blue'] as Side[]) {
    v.pens[side].forEach((p, i) => {
      const name = v.teams[side][i]
      if (!name) return // ghế trống: không có đội để phạt
      const parts: string[] = []
      if (p.minor > 0) parts.push(`lỗi nhẹ ${p.minor}`)
      if (p.yellow > 0) parts.push(`thẻ vàng ${p.yellow}`)
      if (p.red) parts.push('thẻ đỏ')
      if (parts.length === 0) return
      lines.push({ label: `${side === 'red' ? 'Đỏ' : 'Xanh'} · ${name} · phạt`, value: parts.join(' · '), side })
    })
  }
  return lines
}

const SIDE_NAME = { red: 'ĐỎ', blue: 'XANH' } as const

/** Khung một bên: tên từng đội theo ghế ('' ⇒ "—") và, khi đã chốt, điểm chính thức của đúng đội đó (khớp side/seat). */
export function sidePanelHtml(v: ScreenView, side: Side): string {
  const rows = [0, 1].map((seat) => {
    const name = v.teams[side][seat] ?? ''
    const off = v.official?.find((o) => o.side === side && o.seat === seat)
    return `<div class="tn">${esc(name || '—')}</div>${off ? `<div class="ts">${off.score} điểm</div>` : ''}`
  }).join('')
  return `<div class="sc-side ${side}"><h2>${SIDE_NAME[side]}</h2>${rows}</div>`
}
