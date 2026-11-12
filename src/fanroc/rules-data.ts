// Thẻ "Luật chơi" của mùa FANROC 2026–2027 (spec §6.7, §6.8): phần riêng của đề, màn chung ui/rules.ts chỉ vẽ thẻ.
// Lời trên thẻ là lời của game, viết ngắn cho học sinh 10–14 tuổi — không chép tài liệu luật của Ban Tổ chức.
// Mọi con số đọc lúc chạy từ chính mã chơi: điểm từ scoring.ts (dò bằng sân giả), thời gian / sân từ layout.ts, số trận
// mỗi đội từ tournament.ts; lỗi trọng tài là đúng các lỗi match.ts đang bắt (phép thử rules-data.test.ts đọc match.ts
// để giữ khớp). Hình minh hoạ là SVG dựng từ số đo sân, không tải gì từ mạng. Thuần, chạy được trong Node.
import { pctText, scoreTally, teamScore, type FieldTally } from './scoring.ts'
import { DISPENSER, FIELD, LADDER, LADDERS, MATCH_S, MOUNTAIN_FOOT, MOUNTAINS, PEAK_Y, RELEASE_S, TIER_GROOVE, TIERS, ZONES, type Rect } from './layout.ts'
import { ladderLen, pointAt, type Climb } from './ladder.ts'
import { createTournament, TEAM_COUNT } from './tournament.ts'

/** Một thẻ Luật chơi: tiêu đề, một câu dẫn, bảng (nhãn | số) hoặc gạch đầu dòng, và hình SVG (chuỗi). */
export interface RuleCard {
  id: string
  title: string
  lead: string
  rows?: { label: string; value: string }[]
  bullets?: string[]
  /** Ghi chú nhỏ cuối thẻ. */
  note?: string
  /** Hình minh hoạ: một phần tử `<svg>` hoàn chỉnh, dựng sẵn trong mã. */
  art: string
  /** Chữ thay cho hình (đọc màn hình). */
  alt: string
}

/** Số có dấu: +15, −3 (dấu trừ chuẩn), 0. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

// ---------- Điểm: dò từ scoring.ts bằng sân giả, không gõ tay ----------
const blank = (): FieldTally => ({
  fire: { o: 0, g: 0 },
  mtn: MOUNTAINS.map(() => [{ g: 0, o: 0 }, { g: 0, o: 0 }, { g: 0, o: 0 }]),
  flags: MOUNTAINS.map(() => false),
  decorO: 0,
  climbs: { red: ['none', 'none'], blue: ['none', 'none'] },
})
const tally = (edit: (t: FieldTally) => void) => {
  const t = blank()
  edit(t)
  return scoreTally(t)
}
const NO_PEN = { minor: 0, yellow: 0, red: false }

export const POINTS = {
  /** Một bóng cam vào Khu Chữa Cháy. */
  fire: tally((t) => (t.fire.o = 1)).total,
  r1: tally((t) => (t.mtn[0][0].g = 1)).r1,
  r2: tally((t) => (t.mtn[0][1].g = 1)).r2,
  r3: tally((t) => (t.mtn[0][2].g = 1)).r3,
  /** Cờ trên núi chưa đủ bóng xanh ở cả ba rãnh. */
  flag: tally((t) => (t.flags[0] = true)).flag,
  /** Cờ trên núi đã có bóng xanh ở cả ba rãnh. */
  flagFull: tally((t) => ((t.flags[0] = true), t.mtn[0].forEach((x) => (x.g = 1)))).flag,
  /** Một bóng sai chỗ (âm). */
  wrong: tally((t) => (t.fire.g = 1)).total,
  /** Một bóng cam ở tầng trang trí (âm, như mọi bóng cam trên núi). */
  decorOrange: tally((t) => (t.decorO = 1)).total,
  /** Phần hệ số nhân (theo %) của một robot leo ở từng mức, đúng thanh liên minh mình. */
  climb: Object.fromEntries(
    (['contact', 'ground', 'water'] as const).map((c) => [c, tally((t) => (t.climbs.red[0] = c)).multPct - 100]),
  ) as Record<Exclude<Climb, 'none'>, number>,
  /** Phạt một lỗi nhẹ / một thẻ vàng (số dương, trừ vào điểm đội). */
  minor: 100 - teamScore(100, { ...NO_PEN, minor: 1 }),
  yellow: 100 - teamScore(100, { ...NO_PEN, yellow: 1 }),
}

/**
 * Ví dụ trên thẻ Leo Thang Cứu Hỏa: một sân giả chấm bằng chính scoreTally — 205 điểm nhiệm vụ (13 bóng cam, Núi A đủ
 * 3 rãnh + cờ, Núi B 4 bóng Rãnh 3, Núi C 1 bóng Rãnh 2), 4 robot leo Nước, Đất, Nước, Chạm ⇒ hệ số 1,55 ⇒ 318.
 */
export const CLIMB_EXAMPLE = tally((t) => {
  t.fire.o = 13
  t.mtn[0].forEach((x) => (x.g = 1))
  t.flags[0] = true
  t.mtn[1][2].g = 4
  t.mtn[2][1].g = 1
  t.climbs = { red: ['water', 'ground'], blue: ['water', 'contact'] }
})

/** Số trận mỗi đội của vòng xếp hạng: dò khoảng createTournament nhận. */
export const PER_TEAM = (() => {
  const ok = (n: number) => {
    try {
      createTournament({ players: [{ name: 'thử', robot: { type: 'maker', drive: 'diff2', actuator: 'tt' } }], perTeam: n, seed: 1 })
      return true
    } catch {
      return false
    }
  }
  const all = Array.from({ length: 30 }, (_, k) => k + 1).filter(ok)
  return { min: all[0], max: all[all.length - 1] }
})()

// ---------- Lỗi trọng tài tự động: đúng các lỗi match.ts bắt ----------
/**
 * G15: hai robot khác liên minh đứng sát nhau quá chừng này giây. Là hằng riêng `BLOCK_S` của match.ts (không xuất ra
 * được vì lõi trận không sửa); phép thử đọc match.ts để số này không lệch.
 */
export const BLOCK_SECONDS = 5

export type PenKind = 'warn' | 'minor' | 'yellow'
export interface Fault { code: string; name: string; text: string; pens: PenKind[] }

const PEN_NAME: Record<PenKind, string> = { warn: 'cảnh cáo', minor: `lỗi nhẹ ${signed(-POINTS.minor)}`, yellow: `thẻ vàng ${signed(-POINTS.yellow)}` }

export const FAULTS: Fault[] = [
  { code: 'P12', name: 'Leo núi', pens: ['warn', 'minor'], text: `Robot trèo lên núi. Lần đầu: ${PEN_NAME.warn}; các lần sau: ${PEN_NAME.minor}.` },
  { code: 'S02', name: 'Vươn ra ngoài rào', pens: ['yellow'], text: `Một góc robot thò ra ngoài rào sân: ${PEN_NAME.yellow}.` },
  { code: 'P10', name: 'Cán cờ trên sàn', pens: ['warn'], text: `Đè lên lá cờ của robot khác đang nằm trên sàn: ${PEN_NAME.warn}.` },
  {
    code: 'G15', name: 'Chặn robot đội bạn', pens: ['yellow', 'warn'],
    text: `Đứng sát, chặn robot liên minh kia hơn ${BLOCK_SECONDS} giây: robot tới sau bị ${PEN_NAME.yellow}; không rõ ai chặn thì cả hai bị ${PEN_NAME.warn}. Đang ở Khu Tiếp Tế của mình hay đang treo trên Thang Cứu Hỏa thì không tính.`,
  },
]

// ---------- Hình SVG ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const f1 = (n: number) => String(Math.round(n * 10) / 10)
const svg = (w: number, h: number, body: string, label: string) =>
  `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" font-family="inherit">${body}</svg>`
const text = (x: number, y: number, s: string, o: { size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number } = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${o.size ?? 8}" fill="${o.fill ?? '#1d2433'}" text-anchor="${o.anchor ?? 'middle'}" font-weight="${o.weight ?? 600}">${esc(s)}</text>`

const COLOR = {
  red: '#e23b4d', blue: '#2f68e0', fire: '#ff8a1f', green: '#2ea84f', floor: '#f3f1ea', wall: '#5b6475', ink: '#1d2433',
  yellow: '#f2c230', metal: '#8d939e',
}

/**
 * Một thanh xà nhìn từ trên (theo LADDERS): hai cột tròn ở hai đầu, thanh xám, vạch Đất / Nước là khoanh màu liên minh
 * ở LADDER.divider tính từ tâm cột phía rào. `X`, `Y` đổi mét ra px của hình.
 */
function barTop(a: 'red' | 'blue', X: (x: number) => number, Y: (z: number) => number): string {
  const { a: p, b: q } = LADDERS[a]
  const d = pointAt(a, LADDER.divider)
  // Vạch: đoạn ngắn vuông góc với thanh.
  const len = ladderLen(a)
  const nx = -(q.z - p.z) / len
  const nz = (q.x - p.x) / len
  const k = 0.05
  return (
    `<line data-bar="${a}" x1="${f1(X(p.x))}" y1="${f1(Y(p.z))}" x2="${f1(X(q.x))}" y2="${f1(Y(q.z))}" stroke="${COLOR.metal}" stroke-width="3" stroke-linecap="round"/>` +
    `<line data-divider="${a}" x1="${f1(X(d.x - nx * k))}" y1="${f1(Y(d.z - nz * k))}" x2="${f1(X(d.x + nx * k))}" y2="${f1(Y(d.z + nz * k))}" stroke="${COLOR[a]}" stroke-width="3"/>` +
    [p, q].map((c) => `<circle cx="${f1(X(c.x))}" cy="${f1(Y(c.z))}" r="3.2" fill="${COLOR.ink}"/>`).join('')
  )
}

/** Sân nhìn từ trên: các khu từ ZONES, 4 núi từ MOUNTAINS, Hộp Phân Phối ở rào xa, Khu Điều Khiển ở dưới. */
function fieldArt(): string {
  const S = 100 // px mỗi mét
  const OX = 10
  const OY = 22
  const X = (x: number) => OX + (x + FIELD / 2) * S
  const Y = (z: number) => OY + (z + FIELD / 2) * S
  const rect = (r: Rect, fill: string, o = 0.55) =>
    `<rect x="${f1(X(r.x0))}" y="${f1(Y(r.z0))}" width="${f1((r.x1 - r.x0) * S)}" height="${f1((r.z1 - r.z0) * S)}" fill="${fill}" fill-opacity="${o}" stroke="${fill}" stroke-width="1"/>`
  const mid = (r: Rect) => ({ x: X((r.x0 + r.x1) / 2), y: Y((r.z0 + r.z1) / 2) })
  const W = FIELD * S
  let b = `<rect x="${OX}" y="${OY}" width="${W}" height="${W}" fill="${COLOR.floor}" stroke="${COLOR.wall}" stroke-width="3"/>`
  for (const z of ZONES.fire) b += rect(z, COLOR.fire, 0.45)
  for (const a of ['red', 'blue'] as const) {
    b += rect(ZONES.start[a], COLOR[a], 0.18) + rect(ZONES.load[a], COLOR[a], 0.35) + rect(ZONES.ladder[a], COLOR.yellow, 0.75)
  }
  MOUNTAINS.forEach((m, i) => {
    const hx = MOUNTAIN_FOOT.hx * S
    const hz = MOUNTAIN_FOOT.hz * S
    const ring = (k: number, fill: string) =>
      `<rect x="${f1(-hx * k)}" y="${f1(-hz * k)}" width="${f1(2 * hx * k)}" height="${f1(2 * hz * k)}" rx="${f1(4 * k)}" fill="${fill}" stroke="#3d6b45" stroke-width="0.8"/>`
    b += `<g transform="translate(${f1(X(m.x))} ${f1(Y(m.z))}) rotate(${f1((-m.yaw * 180) / Math.PI)})">${ring(1, '#cfe7c9')}${ring(0.72, '#a9d6a0')}${ring(0.46, '#7fc277')}<circle r="3" fill="${COLOR.ink}"/></g>`
    b += text(X(m.x), Y(m.z) - MOUNTAIN_FOOT.hz * S - 3, `Núi ${'ABCD'[i]}`, { size: 7.5 })
  })
  const dx0 = X(DISPENSER.x - DISPENSER.width / 2)
  b += `<rect x="${f1(dx0)}" y="${OY - 9}" width="${f1(DISPENSER.width * S)}" height="7" rx="2" fill="${COLOR.wall}"/>`
  b += text(X(DISPENSER.x), OY - 12, 'Hộp Phân Phối', { size: 7 })
  for (const z of ZONES.fire) {
    const c = mid(z)
    b += text(c.x, c.y - 1, 'Khu', { size: 7.5 }) + text(c.x, c.y + 8, 'Chữa Cháy', { size: 7.5 })
  }
  for (const a of ['red', 'blue'] as const) {
    const s = mid(ZONES.ladder[a])
    b += text(s.x, s.y + 12, 'THANG', { size: 7.5, weight: 800 })
    const l = mid(ZONES.load[a])
    b += text(l.x, l.y - 1, 'Khu', { size: 7 }) + text(l.x, l.y + 7, 'Tiếp Tế', { size: 7 })
    const st = mid(ZONES.start[a])
    b += text(st.x, st.y + 3, `Xuất Phát ${a === 'red' ? 'Đỏ' : 'Xanh'}`, { size: 7.5, fill: COLOR[a] })
  }
  // Thang Cứu Hỏa vẽ sau cùng: thanh xà nằm trên Khu Chữa Cháy và ô THANG.
  for (const a of ['red', 'blue'] as const) b += barTop(a, X, Y)
  b += `<rect x="${OX}" y="${OY + W + 4}" width="${W}" height="14" rx="3" fill="${COLOR.wall}"/>`
  b += text(OX + W / 2, OY + W + 14, 'Khu Điều Khiển — các bạn đứng lái ở đây', { size: 7.5, fill: '#fff' })
  return svg(OX * 2 + W, OY + W + 22, b, 'Sơ đồ sân nhìn từ trên: 4 núi ở giữa, Khu Chữa Cháy hai góc xa, hai thanh xà Thang Cứu Hỏa chạy chéo qua Khu Chữa Cháy và ô vàng THANG, Khu Xuất Phát và Khu Tiếp Tế gần Khu Điều Khiển')
}

/** Dòng thời gian một trận: xả bóng → thi đấu (luật V4 không còn End Game). */
function timelineArt(): string {
  const W = 240
  const total = RELEASE_S + MATCH_S
  const x0 = 10
  const rw = (W * RELEASE_S) / total
  const y = 22
  let b = `<rect x="${x0}" y="${y}" width="${f1(rw)}" height="18" fill="#8a93a6"/>`
  b += `<rect x="${f1(x0 + rw)}" y="${y}" width="${f1(W - rw)}" height="18" fill="${COLOR.blue}"/>`
  b += text(x0 + rw / 2, y - 5, `${RELEASE_S} s`, { size: 8 })
  b += text(x0 + rw + (W - rw) / 2, y + 13, `${MATCH_S / 60} phút thi đấu`, { size: 9, fill: '#fff' })
  b += text(x0, y + 32, 'Xả bóng', { size: 8, anchor: 'start' })
  b += text(x0 + W / 2, y + 48, 'Hết giờ: robot đứng yên, chấm điểm', { size: 8, fill: '#5b6475' })
  return svg(260, 76, b, `Dòng thời gian: ${RELEASE_S} giây xả bóng, ${MATCH_S / 60} phút thi đấu`)
}

/** Một ngọn núi nhìn ngang: các tầng theo TIERS, rãnh tính điểm theo TIER_GROOVE, cờ trên đỉnh. */
function mountainArt(): string {
  const ground = 128
  const H = 600 // px mỗi mét chiều cao (phóng to cho dễ nhìn)
  const cx = 92
  const half = (k: number) => 80 - k * 18
  const value = [POINTS.r1, POINTS.r2, POINTS.r3]
  let b = `<line x1="4" y1="${ground}" x2="296" y2="${ground}" stroke="${COLOR.wall}" stroke-width="2"/>`
  const labels: string[] = []
  TIERS.forEach((t, k) => {
    const top = ground - t.lip * H
    const shade = t.decor ? '#c9d3c4' : ['#cfe7c9', '#a9d6a0', '#7fc277', '#5fae58'][k]
    b += `<rect x="${f1(cx - half(k))}" y="${f1(top)}" width="${f1(2 * half(k))}" height="${f1(ground - top)}" fill="${shade}" stroke="#3d6b45" stroke-width="0.8"/>`
    const g = TIER_GROOVE[k]
    const y = top + 3
    const lx = cx + half(k) - 6
    labels.push(`<line x1="${f1(lx)}" y1="${f1(y)}" x2="186" y2="${f1(y)}" stroke="#5b6475" stroke-width="0.6" stroke-dasharray="2 2"/>`)
    labels.push(
      t.decor
        ? text(190, y + 3, `trang trí: không tính điểm`, { size: 8, anchor: 'start', fill: '#5b6475' })
        : text(190, y + 3, `Rãnh ${g + 1} · ${signed(value[g])}`, { size: 9, anchor: 'start', weight: 800 }),
    )
    if (!t.decor) b += `<circle cx="${f1(cx - half(k) + 8)}" cy="${f1(top - 3)}" r="3" fill="${COLOR.green}"/>`
  })
  const peak = ground - PEAK_Y * H
  const lastTop = ground - TIERS[TIERS.length - 1].lip * H
  b += `<rect x="${cx - 9}" y="${f1(peak)}" width="18" height="${f1(lastTop - peak)}" fill="#4d9a48" stroke="#3d6b45" stroke-width="0.8"/>`
  b += `<line x1="${cx}" y1="${f1(peak)}" x2="${cx}" y2="${f1(peak - 22)}" stroke="#6b4f2a" stroke-width="1.6"/>`
  b += `<rect x="${cx}" y="${f1(peak - 22)}" width="16" height="10" fill="#da251d"/>`
  labels.push(text(cx + 20, peak - 13, `Cờ ${signed(POINTS.flag)} / ${signed(POINTS.flagFull)}`, { size: 8.5, anchor: 'start', weight: 800 }))
  return svg(300, 136, b + labels.join(''), `Ngọn núi nhìn ngang: Rãnh 1 ${signed(POINTS.r1)}, Rãnh 2 ${signed(POINTS.r2)}, Rãnh 3 ${signed(POINTS.r3)}, cờ trên đỉnh`)
}

/**
 * Thang Cứu Hỏa nhìn ngang (dọc theo thanh): cột rào bên trái, cột Hộp Phân Phối bên phải, đoạn Đất (từ đầu rào tới
 * vạch) phía trên ô vàng THANG, đoạn Nước phía trên Khu Chữa Cháy; ba robot minh hoạ Chạm / Đất / Nước.
 */
function ladderArt(): string {
  const S = 200 // px mỗi mét
  const len = ladderLen('red')
  const x0 = 20
  const ground = 168
  const X = (s: number) => x0 + s * S
  const yBar = ground - LADDER.y * S
  const xd = X(LADDER.divider)
  let b = `<line x1="4" y1="${ground}" x2="${f1(X(len) + 16)}" y2="${ground}" stroke="${COLOR.wall}" stroke-width="2"/>`
  // Ô vàng THANG dưới đoạn Đất; Khu Chữa Cháy dưới đoạn Nước (chỉ minh hoạ vị trí).
  b += `<rect x="${f1(X(0.04))}" y="${ground}" width="${f1(xd - X(0.04))}" height="8" fill="${COLOR.yellow}"/>`
  b += text((X(0.04) + xd) / 2, ground + 18, 'ô vàng THANG', { size: 8.5, weight: 800 })
  b += `<rect x="${f1(xd + 6)}" y="${ground}" width="${f1(X(len) - xd - 40)}" height="8" fill="${COLOR.fire}" fill-opacity="0.7"/>`
  b += text((xd + X(len)) / 2, ground + 18, 'Khu Chữa Cháy', { size: 8.5 })
  for (const s of [0, len]) b += `<rect x="${f1(X(s) - 3)}" y="${f1(yBar)}" width="6" height="${f1(ground - yBar)}" fill="${COLOR.ink}"/>`
  // Ống thò qua tâm hai cột (CAD lắp sân 12/11): dài LADDER.rodLen.
  b += `<line x1="${f1(X(-LADDER.overhang.a))}" y1="${f1(yBar)}" x2="${f1(X(len + LADDER.overhang.b))}" y2="${f1(yBar)}" stroke="${COLOR.metal}" stroke-width="5" stroke-linecap="round"/>`
  b += `<rect x="${f1(xd - 3)}" y="${f1(yBar - 5)}" width="6" height="10" fill="${COLOR.red}"/>`
  b += text((X(0) + xd) / 2, yBar - 16, `Đất ${pctText(POINTS.climb.ground, true)}`, { size: 9, weight: 800 })
  b += text((xd + X(len)) / 2, yBar - 16, `Nước ${pctText(POINTS.climb.water, true)}`, { size: 9, weight: 800 })
  b += text(X(0) + 6, yBar + 12, 'rào', { size: 7.5, fill: COLOR.wall, anchor: 'start' })
  b += text(X(len) - 6, yBar + 12, 'Hộp Phân Phối', { size: 7.5, fill: COLOR.wall, anchor: 'end' })
  b += text(xd, yBar + 18, 'vạch', { size: 7.5, fill: COLOR.red })
  // Robot: thân hộp + móc vàng lên thanh. Treo ⇒ thân rời sàn.
  const robot = (cx: number, hang: boolean, label: string) => {
    const top = hang ? yBar + 26 : ground - 26
    return (
      `<rect x="${f1(cx - 13)}" y="${f1(top)}" width="26" height="22" rx="3" fill="${COLOR.blue}"/>` +
      `<path d="M${f1(cx)} ${f1(top)} V${f1(yBar - 6)} h-6 v6" fill="none" stroke="${COLOR.yellow}" stroke-width="2.4"/>` +
      text(cx, top + 14, label, { size: 7, fill: '#fff' })
    )
  }
  b += robot(X(0.1), false, 'Chạm') + robot(X(0.34), true, 'Đất') + robot(X(0.85), true, 'Nước')
  const w = X(len) + 22
  return svg(w, ground + 26, b, `Thang Cứu Hỏa nhìn ngang: thanh dài ${pctText(Math.round(LADDER.rodLen * 100))} m cao ${pctText(Math.round(LADDER.y * 100))} m; đoạn Đất trên ô vàng THANG, qua vạch là đoạn Nước`)
}

/** Ba mức phạt của trọng tài tự động. */
function faultsArt(): string {
  const card = (x: number, rot: number, fill: string, ink: string, top: string, big: string) =>
    `<g transform="translate(${x} 46) rotate(${rot})"><rect x="-30" y="-38" width="60" height="76" rx="6" fill="${fill}" stroke="#0003"/>` +
    text(0, -14, top, { size: 8.5, fill: ink }) + text(0, 14, big, { size: 16, fill: ink, weight: 900 }) + '</g>'
  const b =
    card(52, -6, '#ffffff', COLOR.ink, 'Cảnh cáo', '!') +
    card(130, 0, COLOR.fire, '#fff', 'Lỗi nhẹ', signed(-POINTS.minor)) +
    card(208, 6, '#ffd23f', COLOR.ink, 'Thẻ vàng', signed(-POINTS.yellow))
  return svg(260, 92, b, `Ba mức phạt: cảnh cáo, lỗi nhẹ ${signed(-POINTS.minor)}, thẻ vàng ${signed(-POINTS.yellow)}`)
}

/** Bốc thăm: các đội ghép ngẫu nhiên thành liên minh Đỏ / Xanh cho từng trận. */
function tournamentArt(): string {
  const n = TEAM_COUNT
  const step = 240 / n
  const dot = (x: number, y: number, fill: string, s: string) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="8" fill="${fill}"/>` + text(x, y + 3, s, { size: 8, fill: '#fff' })
  let b = ''
  for (let i = 0; i < n; i++) b += dot(10 + step / 2 + i * step, 16, '#5b6475', String(i + 1))
  b += text(130, 40, 'bốc thăm mỗi lượt', { size: 8, fill: '#5b6475' })
  // Một ví dụ ghép (chỉ để minh hoạ): mỗi lượt 2 trận, mỗi trận 2 đội Đỏ + 2 đội Xanh.
  const ex: [number[], number[]][] = [[[3, 7], [1, 5]], [[8, 2], [6, 4]]]
  ex.forEach(([red, blue], k) => {
    const x0 = 10 + k * 125
    b += `<rect x="${x0}" y="48" width="115" height="34" rx="6" fill="#ffffff" stroke="#c5cbd6"/>`
    b += text(x0 + 57.5, 59, `Trận ${k + 1}`, { size: 7.5, fill: '#5b6475' })
    red.forEach((v, j) => (b += dot(x0 + 16 + j * 19, 70, COLOR.red, String(v))))
    blue.forEach((v, j) => (b += dot(x0 + 80 + j * 19, 70, COLOR.blue, String(v))))
  })
  return svg(260, 88, b, `${n} đội được bốc thăm ghép thành liên minh Đỏ và Xanh cho từng trận`)
}

/** 6 thẻ Luật chơi của FANROC 2026–2027. */
export function fanrocRules(): RuleCard[] {
  const P = POINTS
  const ex = CLIMB_EXAMPLE
  return [
    {
      id: 'field',
      title: 'Sân thi đấu',
      lead: `Sân vuông ${Math.round(FIELD * 100)} cm có rào bao quanh. Nửa trái là của liên minh Đỏ, nửa phải của liên minh Xanh.`,
      bullets: [
        `${MOUNTAINS.length} Ngọn Núi ở giữa sân. Mỗi núi có 3 rãnh, rãnh càng cao càng nhiều điểm; đỉnh núi có lỗ để cắm cờ.`,
        'Khu Chữa Cháy: hai ô ở hai góc phía xa — nơi đưa bóng cam tới.',
        'Khu Xuất Phát và Khu Tiếp Tế ở gần Khu Điều Khiển. Ở Khu Tiếp Tế, Human Player nạp thêm bóng cho robot (trong game Human Player tự làm).',
        'Hộp Phân Phối ở rào phía xa thả bóng xuống sân lúc đầu trận.',
        `Thang Cứu Hỏa: mỗi liên minh một thanh xà cao ${Math.round(LADDER.y * 100)} cm, chạy chéo từ rào bên qua Khu Chữa Cháy tới Hộp Phân Phối. Ô vàng THANG nằm ngay dưới đoạn Đất.`,
      ],
      art: fieldArt(),
      alt: 'Sơ đồ sân từ trên xuống',
    },
    {
      id: 'match',
      title: 'Một trận đấu',
      lead: 'Mỗi trận có 4 robot: 2 robot liên minh Đỏ, 2 robot liên minh Xanh. Cả 4 đội nhận chung một điểm trận — cùng nhau làm sân thật nhiều điểm!',
      bullets: [
        `${RELEASE_S} giây đầu: Hộp Phân Phối xả bóng, robot đứng yên.`,
        `Tiếp theo là ${MATCH_S / 60} phút thi đấu: robot chạy theo chương trình khối của em (hoặc em lái bằng tay PS2 / bàn phím).`,
        'Hết giờ, robot đứng yên và sân được chấm điểm đúng như lúc đó.',
        'Điểm của mỗi đội = điểm trận trừ phần phạt của riêng đội đó, thấp nhất là 0.',
      ],
      art: timelineArt(),
      alt: 'Dòng thời gian một trận',
    },
    {
      id: 'score',
      title: 'Bảng điểm',
      lead: 'Bóng xanh là Mầm Cây — trồng lên núi. Bóng cam dập lửa — đưa vào Khu Chữa Cháy. Điểm chấm lúc hết giờ.',
      rows: [
        { label: 'Bóng cam trong Khu Chữa Cháy', value: signed(P.fire) },
        { label: 'Bóng xanh ở Rãnh 1 (thấp nhất)', value: signed(P.r1) },
        { label: 'Bóng xanh ở Rãnh 2', value: signed(P.r2) },
        { label: 'Bóng xanh ở Rãnh 3 (cao nhất)', value: signed(P.r3) },
        { label: 'Cắm cờ trên đỉnh núi', value: signed(P.flag) },
        { label: 'Cắm cờ trên núi có bóng xanh ở cả 3 rãnh (thay cho số trên)', value: signed(P.flagFull) },
        { label: 'Mỗi bóng sai chỗ (bóng cam trên núi, bóng xanh ở Khu Chữa Cháy)', value: signed(P.wrong) },
      ],
      note: `Tầng trang trí (giữa Rãnh 1 và Rãnh 2) không tính điểm: bóng xanh nằm đó không được cộng; bóng cam ở bất kỳ đâu trên núi ${signed(P.decorOrange)}, kể cả tầng trang trí. Tổng các mục này là Điểm nhiệm vụ.`,
      art: mountainArt(),
      alt: 'Ngọn núi và điểm từng rãnh',
    },
    {
      id: 'climb',
      title: 'Leo Thang Cứu Hỏa',
      lead: 'Cuối trận, đưa robot lên thanh xà của liên minh mình để nhân điểm của cả sân. Giơ móc chạm thanh, hạ móc để kéo robot lên, rồi chạy dọc thanh sang đoạn Nước.',
      rows: [
        { label: 'Chạm: móc giơ chạm thanh, bánh vẫn trên sàn', value: pctText(P.climb.contact, true) },
        { label: 'Treo ở đoạn Đất (từ đầu rào tới vạch)', value: pctText(P.climb.ground, true) },
        { label: 'Treo ở đoạn Nước (đã qua hẳn vạch)', value: pctText(P.climb.water, true) },
      ],
      bullets: [
        `Hệ số nhân = ${pctText(100)} + mức của cả 4 robot, cao nhất ${pctText(100 + 4 * P.climb.water)}. Điểm trận = Điểm nhiệm vụ × Hệ số nhân, làm tròn lên.`,
        `Ví dụ: Điểm nhiệm vụ ${ex.mission}, hai robot ở Nước, một ở Đất, một Chạm ⇒ hệ số ${pctText(ex.multPct)} ⇒ ⌈${ex.mission} × ${pctText(ex.multPct)}⌉ = ${ex.total}.`,
        'Phải bám ở đoạn Đất rồi mới trượt sang Nước. Mỗi thanh treo tối đa 2 robot; leo thanh của liên minh kia không được tính.',
        'Phạt không nhân hệ số: điểm đội = điểm trận trừ phạt của đội.',
      ],
      note: 'Hết giờ, robot đang treo ở đâu thì tính mức ở đó.',
      art: ladderArt(),
      alt: 'Thang Cứu Hỏa nhìn ngang với ba mức leo',
    },
    {
      id: 'faults',
      title: 'Lỗi thường gặp',
      lead: `Trọng tài tự động của game bắt các lỗi dưới đây. Lỗi nhẹ trừ ${POINTS.minor} điểm, thẻ vàng trừ ${POINTS.yellow} điểm của đội mắc lỗi; thẻ đỏ thì đội đó được 0 điểm (các đội khác vẫn nhận điểm trận).`,
      rows: FAULTS.map((f) => ({ label: `${f.name} (${f.code})`, value: f.text })),
      bullets: ['Đấu tập: lỗi vẫn hiện trong Sự kiện trận để em biết, nhưng không bị trừ điểm.'],
      note: 'Trận thật còn có trọng tài người: thẻ đỏ và các lỗi khác do trọng tài quyết định, game này không tự rút thẻ đỏ.',
      art: faultsArt(),
      alt: 'Ba mức phạt',
    },
    {
      id: 'tournament',
      title: 'Giải đấu',
      lead: `Giải có ${TEAM_COUNT} đội đấu vòng xếp hạng: mỗi đội đấu ${PER_TEAM.min}–${PER_TEAM.max} trận (chọn lúc ghi danh).`,
      bullets: [
        'Mỗi lượt, robot cùng màu và robot liên minh khác màu được bốc thăm ngẫu nhiên — trận này cùng màu, trận sau có thể khác màu. Cả bốn đội vẫn cùng nhận điểm trận.',
        'Hạng xếp theo tổng điểm đội của các trận.',
        'Bằng điểm thì so trận cao điểm nhất, rồi đến đội ít điểm phạt hơn; vẫn bằng nữa thì bốc thăm.',
        'Hết vòng xếp hạng: ba đội đứng đầu lên bục trao giải.',
      ],
      art: tournamentArt(),
      alt: 'Bốc thăm liên minh',
    },
  ]
}
