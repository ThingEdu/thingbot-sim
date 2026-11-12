// Thẻ "Luật chơi" của mùa FANROC 2026–2027 (spec §6.7, §6.8): phần riêng của đề, màn chung ui/rules.ts chỉ vẽ thẻ.
// Lời trên thẻ là lời của game, viết ngắn cho học sinh 10–14 tuổi — không chép tài liệu luật của Ban Tổ chức.
// Mọi con số đọc lúc chạy từ chính mã chơi: điểm từ scoring.ts (dò bằng sân giả), thời gian / sân từ layout.ts, số trận
// mỗi đội từ tournament.ts; lỗi trọng tài là đúng các lỗi match.ts đang bắt (phép thử rules-data.test.ts đọc match.ts
// để giữ khớp). Hình minh hoạ là SVG dựng từ số đo sân, không tải gì từ mạng. Thuần, chạy được trong Node.
import { allianceShare, scoreTally, teamScore, type FieldTally } from './scoring.ts'
import { DISPENSER, ENDGAME_S, FIELD, MATCH_S, MOUNTAIN_FOOT, MOUNTAINS, PEAK_Y, RELEASE_S, TIER_GROOVE, TIERS, ZONES, type Rect } from './layout.ts'
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
  parks: { red: [null, null], blue: [null, null] },
})
const tally = (edit: (t: FieldTally) => void) => {
  const t = blank()
  edit(t)
  return scoreTally(t)
}
const share = (edit: (t: FieldTally) => void) => {
  const t = blank()
  edit(t)
  return allianceShare(t).red
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
  parkPartial: share((t) => (t.parks.red = ['partial', null])).park,
  parkFull: share((t) => (t.parks.red = ['full', null])).park,
  /** Thêm khi cả hai robot của liên minh đỗ hẳn. */
  parkBonus: share((t) => (t.parks.red = ['full', 'full'])).bonus,
  /** Một bóng sai chỗ (âm). */
  wrong: tally((t) => (t.fire.g = 1)).total,
  /** Phạt một lỗi nhẹ / một thẻ vàng (số dương, trừ vào điểm đội). */
  minor: 100 - teamScore(100, { ...NO_PEN, minor: 1 }),
  yellow: 100 - teamScore(100, { ...NO_PEN, yellow: 1 }),
}

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
    text: `Đứng sát, chặn robot liên minh kia hơn ${BLOCK_SECONDS} giây: robot tới sau bị ${PEN_NAME.yellow}; không rõ ai chặn thì cả hai bị ${PEN_NAME.warn}. Đang ở Vùng Bảo Vệ hay Khu Tiếp Tế của mình thì không tính.`,
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
    b += rect(ZONES.start[a], COLOR[a], 0.18) + rect(ZONES.load[a], COLOR[a], 0.35) + rect(ZONES.ladder[a], COLOR[a], 0.6)
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
    b += text(s.x, s.y - 1, 'Vùng', { size: 7, fill: '#fff' }) + text(s.x, s.y + 7, 'Bảo Vệ', { size: 7, fill: '#fff' })
    const l = mid(ZONES.load[a])
    b += text(l.x, l.y - 1, 'Khu', { size: 7 }) + text(l.x, l.y + 7, 'Tiếp Tế', { size: 7 })
    const st = mid(ZONES.start[a])
    b += text(st.x, st.y + 3, `Xuất Phát ${a === 'red' ? 'Đỏ' : 'Xanh'}`, { size: 7.5, fill: COLOR[a] })
  }
  b += `<rect x="${OX}" y="${OY + W + 4}" width="${W}" height="14" rx="3" fill="${COLOR.wall}"/>`
  b += text(OX + W / 2, OY + W + 14, 'Khu Điều Khiển — các bạn đứng lái ở đây', { size: 7.5, fill: '#fff' })
  return svg(OX * 2 + W, OY + W + 22, b, 'Sơ đồ sân nhìn từ trên: 4 núi ở giữa, Khu Chữa Cháy hai góc xa, Vùng Bảo Vệ hai bên, Khu Xuất Phát và Khu Tiếp Tế gần Khu Điều Khiển')
}

/** Dòng thời gian một trận: xả bóng → thi đấu → End Game. */
function timelineArt(): string {
  const W = 240
  const total = RELEASE_S + MATCH_S
  const x0 = 10
  const rw = (W * RELEASE_S) / total
  const ew = (W * ENDGAME_S) / total
  const y = 22
  let b = `<rect x="${x0}" y="${y}" width="${f1(rw)}" height="18" fill="#8a93a6"/>`
  b += `<rect x="${f1(x0 + rw)}" y="${y}" width="${f1(W - rw - ew)}" height="18" fill="${COLOR.blue}"/>`
  b += `<rect x="${f1(x0 + W - ew)}" y="${y}" width="${f1(ew)}" height="18" fill="${COLOR.fire}"/>`
  b += text(x0 + rw / 2, y - 5, `${RELEASE_S} s`, { size: 8 })
  b += text(x0 + rw + (W - rw - ew) / 2, y + 13, `${MATCH_S / 60} phút thi đấu`, { size: 9, fill: '#fff' })
  b += text(x0 + W - ew / 2, y - 5, `${ENDGAME_S} s cuối`, { size: 8 })
  b += text(x0, y + 32, 'Xả bóng', { size: 8, anchor: 'start' })
  b += text(x0 + W, y + 32, 'End Game', { size: 8, anchor: 'end' })
  b += text(x0 + W / 2, y + 48, 'Hết giờ: robot đứng yên, chấm điểm', { size: 8, fill: '#5b6475' })
  return svg(260, 76, b, `Dòng thời gian: ${RELEASE_S} giây xả bóng, ${MATCH_S / 60} phút thi đấu, ${ENDGAME_S} giây cuối là End Game`)
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
        ? text(190, y + 3, `trang trí (= Rãnh ${g + 1})`, { size: 8, anchor: 'start', fill: '#5b6475' })
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

/** 5 thẻ Luật chơi của FANROC 2026–2027. */
export function fanrocRules(): RuleCard[] {
  const P = POINTS
  return [
    {
      id: 'field',
      title: 'Sân thi đấu',
      lead: `Sân vuông ${Math.round(FIELD * 100)} cm có rào bao quanh. Nửa trái là của liên minh Đỏ, nửa phải của liên minh Xanh.`,
      bullets: [
        `${MOUNTAINS.length} Ngọn Núi ở giữa sân. Mỗi núi có 3 rãnh, rãnh càng cao càng nhiều điểm; đỉnh núi có lỗ để cắm cờ.`,
        'Khu Chữa Cháy: hai ô ở hai góc phía xa — nơi đưa bóng cam tới.',
        'Vùng Bảo Vệ: mỗi liên minh một ô sát rào bên — cuối trận đỗ robot vào đây.',
        'Khu Xuất Phát và Khu Tiếp Tế ở gần Khu Điều Khiển. Ở Khu Tiếp Tế, Human Player nạp thêm bóng cho robot (trong game Human Player tự làm).',
        'Hộp Phân Phối ở rào phía xa thả bóng xuống sân lúc đầu trận.',
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
        `${ENDGAME_S} giây cuối là End Game: lúc đưa robot về Vùng Bảo Vệ.`,
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
        { label: 'Mỗi robot đỗ một phần trong Vùng Bảo Vệ', value: signed(P.parkPartial) },
        { label: 'Mỗi robot đỗ hẳn trong Vùng Bảo Vệ', value: signed(P.parkFull) },
        { label: 'Cả 2 robot của một liên minh đỗ hẳn: thưởng thêm', value: signed(P.parkBonus) },
        { label: 'Mỗi bóng sai chỗ (bóng cam trên núi, bóng xanh ở Khu Chữa Cháy)', value: signed(P.wrong) },
      ],
      note: 'Bóng xanh nằm ở tầng trang trí của núi được tính như ở rãnh ngay dưới nó.',
      art: mountainArt(),
      alt: 'Ngọn núi và điểm từng rãnh',
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
