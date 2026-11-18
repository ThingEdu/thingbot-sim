// Các dòng của bảng chi tiết trên màn chiếu (man-chieu.html). Thuần, không đụng DOM; chỉ dùng điểm đã có trong ScreenView
// (số bóng suy ra từ điểm vì mỗi loại là bội đúng của điểm một bóng).
import { pctText } from '../scoring.ts'
import type { Side } from './event.ts'
import type { ScreenView } from './proto.ts'

/** Số nguyên có dấu trừ U+2212 cho số âm (đọc rõ trên màn chiếu hơn dấu gạch ngang). */
export const signed = (n: number): string => (n < 0 ? `−${-n}` : String(n))

export function screenLines(v: ScreenView): { label: string; value: string }[] {
  const s = v.score
  const lines = [
    { label: 'Khu Chữa Cháy (cam +5)', value: `${s.fire / 5} → ${signed(s.fire)}` },
    { label: 'Rãnh 1 / 2 / 3 (+5 / +10 / +15)', value: `${s.r1 / 5} / ${s.r2 / 10} / ${s.r3 / 15} → ${signed(s.r1 + s.r2 + s.r3)}` },
    { label: 'Cờ', value: signed(s.flag) },
    { label: 'Bóng sai chỗ (−3)', value: `${signed(-s.wrong / 3)} → ${signed(s.wrong)}` },
    { label: 'Hệ số leo', value: pctText(s.multPct) },
  ]
  for (const side of ['red', 'blue'] as Side[]) {
    v.pens[side].forEach((p, i) => {
      const parts: string[] = []
      if (p.minor > 0) parts.push(`lỗi nhẹ ${p.minor}`)
      if (p.yellow > 0) parts.push(`thẻ vàng ${p.yellow}`)
      if (p.red) parts.push('thẻ đỏ')
      if (parts.length === 0) return
      lines.push({ label: `Phạt · ${v.teams[side][i] || `Đội ${side === 'red' ? 'Đỏ' : 'Xanh'} ${i + 1}`}`, value: parts.join(' · ') })
    })
  }
  return lines
}
