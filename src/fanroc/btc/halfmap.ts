// Bản đồ nửa sân của một trọng tài (SVG chuỗi), vẽ từ layout.ts: Khu Chữa Cháy, thang, 2 núi × (3 rãnh + tầng trang trí).
// Xoay ngang cho vừa điện thoại: rào cạnh của liên minh ở trên, đường giữa sân ở dưới, Khu Chữa Cháy góc trên trái
// (nửa Xanh lật gương nên hai trọng tài thấy cùng một hình). Đơn vị hình = cm; vùng chạm là các ô ≥ 44 px.
import { LADDERS, MOUNTAINS, ZONES } from '../layout.ts'
import type { HalfSheet, Side } from './event.ts'
import { HALF_MTN } from './half.ts'

export type Target = { t: 'fire' } | { t: 'groove'; m: 0 | 1; k: 0 | 1 | 2 } | { t: 'decor'; m: 0 | 1 } | { t: 'ladder' }

/** Khung hình: dọc sân z ∈ [−1,2; 0,65] (phần có núi / khu / thang), ngang từ rào cạnh tới đường giữa. */
const Z0 = -1.2
export const MAP_W = 185
export const MAP_H = 120
/** Ô chạm (cm hình). Hình rộng 100% ≈ 343 px ⇒ 1 cm ≈ 1,85 px ⇒ 24 cm ≈ 44 px. */
const CHIP = 24
/** Núi vẽ to hơn thật (bán kính thật 20,7 cm) để đặt được 4 ô chạm 2 × 2. */
const MTN_R = 31

const toMap = (side: Side, x: number, z: number) => ({ X: (z - Z0) * 100, Y: (side === 'red' ? x + 1.2 : 1.2 - x) * 100 })
const f1 = (n: number) => String(Math.round(n * 10) / 10)
export const MTN_NAME = (side: Side, k: 0 | 1) => `Núi ${'ABCD'[HALF_MTN[side][k]]}`

export const sameTarget = (a: Target | null, b: Target | null): boolean => JSON.stringify(a) === JSON.stringify(b)

function chip(x: number, y: number, t: Target, label: string, n: string, on: boolean, fill: string, ink = '#1d2433'): string {
  const h = CHIP / 2
  return `<g class="hm-hit" data-t='${JSON.stringify(t)}' role="button" tabindex="0" aria-pressed="${on}" aria-label="${label} ${n}">`
    + `<rect x="${f1(x - h)}" y="${f1(y - h)}" width="${CHIP}" height="${CHIP}" rx="5" fill="${fill}" stroke="${on ? '#ffcf5a' : '#0006'}" stroke-width="${on ? 2.6 : 0.8}"/>`
    + `<text x="${f1(x)}" y="${f1(y - 3)}" font-size="6.5" text-anchor="middle" fill="${ink}" font-weight="700">${label}</text>`
    + `<text x="${f1(x)}" y="${f1(y + 7.5)}" font-size="10" text-anchor="middle" fill="${ink}" font-weight="900">${n}</text></g>`
}

/** Số trên ô rãnh: bóng xanh; có cam sai chỗ thì thêm "·c". */
const grooveText = (g: { g: number; o: number }) => (g.o > 0 ? `${g.g}·${g.o}c` : String(g.g))

export function halfMap(side: Side, sheet: HalfSheet, sel: Target | null): string {
  const al = side === 'red' ? '#e23b4d' : '#2f68e0'
  const parts: string[] = []
  // nền + đường giữa sân (dưới) + rào (trên)
  parts.push(`<rect x="0" y="0" width="${MAP_W}" height="${MAP_H}" rx="4" fill="#3a3f47"/>`)
  parts.push(`<line x1="0" y1="1" x2="${MAP_W}" y2="1" stroke="${al}" stroke-width="2"/>`)
  parts.push(`<line x1="0" y1="${MAP_H - 0.5}" x2="${MAP_W}" y2="${MAP_H - 0.5}" stroke="#fff6" stroke-dasharray="3 3"/>`)
  parts.push(`<text x="${MAP_W - 3}" y="${MAP_H - 3}" font-size="5.5" text-anchor="end" fill="#aab">đường giữa sân · nửa kia của trọng tài ${side === 'red' ? 'Xanh' : 'Đỏ'}</text>`)

  // Khu Chữa Cháy (cả ô là vùng chạm)
  const fz = ZONES.fire[side === 'red' ? 0 : 1]
  const c1 = toMap(side, fz.x0, fz.z0)
  const c2 = toMap(side, fz.x1, fz.z1)
  const fx = Math.min(c1.X, c2.X), fy = Math.min(c1.Y, c2.Y), fw = Math.abs(c2.X - c1.X), fh = Math.abs(c2.Y - c1.Y)
  const onF = sameTarget(sel, { t: 'fire' })
  parts.push(`<g class="hm-hit" data-t='{"t":"fire"}' role="button" tabindex="0" aria-pressed="${onF}" aria-label="Khu Chữa Cháy">`
    + `<rect x="${f1(fx)}" y="${f1(fy)}" width="${f1(fw)}" height="${f1(fh)}" rx="3" fill="#f08a24" stroke="${onF ? '#ffcf5a' : 'none'}" stroke-width="2.6"/>`
    + `<text x="${f1(fx + fw / 2)}" y="${f1(fy + fh / 2 - 6)}" font-size="6" text-anchor="middle" fill="#221" font-weight="800">KHU CHỮA CHÁY</text>`
    + `<text x="${f1(fx + fw / 2)}" y="${f1(fy + fh / 2 + 5)}" font-size="8" text-anchor="middle" fill="#221" font-weight="900">cam ${sheet.fire.o}</text>`
    + `<text x="${f1(fx + fw / 2)}" y="${f1(fy + fh / 2 + 14)}" font-size="6.5" text-anchor="middle" fill="#221" font-weight="700">xanh ${sheet.fire.g}</text></g>`)

  // Thang: thanh xà từ cột a (rào cạnh) tới cột b; ô chạm đặt trên đoạn ngoài Khu Chữa Cháy
  const L = LADDERS[side]
  const a = toMap(side, L.a.x, L.a.z)
  const b = toMap(side, L.b.x, L.b.z)
  parts.push(`<line x1="${f1(a.X)}" y1="${f1(a.Y)}" x2="${f1(b.X)}" y2="${f1(b.Y)}" stroke="#8d939e" stroke-width="2.4" stroke-linecap="round"/>`)
  const t = 0.16
  const lx = a.X + (b.X - a.X) * t + 4, ly = a.Y + (b.Y - a.Y) * t + 4
  const climbs = sheet.climbs.map((c) => ({ none: '—', contact: 'C', ground: 'Đ', water: 'N' })[c]).join(' ')
  parts.push(chip(lx, ly, { t: 'ladder' }, 'Thang', climbs, sameTarget(sel, { t: 'ladder' }), '#ffcf5a'))

  // Hai núi: vòng đồng tâm (R1 ngoài cùng → trang trí → R2 → R3 đỉnh) + 4 ô chạm 2 × 2
  ;([0, 1] as const).forEach((k) => {
    const M = MOUNTAINS[HALF_MTN[side][k]]
    const c = toMap(side, M.x, M.z)
    const ring = [MTN_R, MTN_R * 0.78, MTN_R * 0.56, MTN_R * 0.34]
    const col = ['#2f8a4a', '#e8c99a', '#2f8a4a', '#e8c99a']
    ring.forEach((r, i) => parts.push(`<circle cx="${f1(c.X)}" cy="${f1(c.Y)}" r="${f1(r)}" fill="${col[i]}" stroke="#0004" stroke-width="0.5"/>`))
    if (sheet.flags[k]) { // cờ đã cắm: cán + lá cờ màu liên minh ở mép trên phải núi
      const qx = c.X + MTN_R * 0.75, qy = c.Y - MTN_R * 0.75
      parts.push(`<path d="M${f1(qx)} ${f1(qy + 10)}V${f1(qy - 6)}l9 3.5l-9 3.5" fill="${al}" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>`)
    }
    parts.push(`<text x="${f1(c.X)}" y="${f1(c.Y - MTN_R - 2)}" font-size="6.5" text-anchor="middle" fill="#fff" font-weight="800">${MTN_NAME(side, k)}</text>`)
    const d = CHIP / 2 + 1
    const cells: [number, number, Target, string, string][] = [
      [-d, -d, { t: 'groove', m: k, k: 0 }, 'R1', grooveText(sheet.mtn[k][0])],
      [d, -d, { t: 'groove', m: k, k: 1 }, 'R2', grooveText(sheet.mtn[k][1])],
      [-d, d, { t: 'groove', m: k, k: 2 }, 'R3', grooveText(sheet.mtn[k][2])],
      [d, d, { t: 'decor', m: k }, 'Tr.trí', String(sheet.decorO)],
    ]
    for (const [dx, dy, tg, lab, n] of cells) {
      const isDecor = tg.t === 'decor'
      parts.push(chip(c.X + dx, c.Y + dy, tg, lab, n, sameTarget(sel, tg), isDecor ? '#f3e6cf' : '#ffffff'))
    }
  })
  return `<svg class="hm" viewBox="0 0 ${MAP_W} ${MAP_H}" width="100%" role="group" aria-label="Nửa sân ${side === 'red' ? 'Đỏ' : 'Xanh'}" font-family="system-ui, sans-serif">${parts.join('')}</svg>`
}
