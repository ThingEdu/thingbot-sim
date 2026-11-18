// Excel của BTC: tệp mẫu danh sách đội, nhập đội từ .xlsx / .csv, xuất cả giải ra .xlsx.
import type { EMatch, EventState, Team } from './event.ts'
import { slotTime } from './schedule.ts'
import { liveScore, teamPoints } from './sheet.ts'
import { roundStandings } from './rank.ts'
import { pctText } from '../scoring.ts'
import { readXlsx, writeXlsx, type Cell } from './xlsx.ts'

export const TEMPLATE_HEAD = ['Mã đội', 'Tên đội', 'Trường', 'Tỉnh/Thành', 'Người hướng dẫn'] as const

export function templateXlsx(): Promise<Uint8Array> {
  return writeXlsx([
    { name: 'Đội', rows: [[...TEMPLATE_HEAD]] },
    {
      name: 'Hướng dẫn',
      rows: [
        ['Điền mỗi đội một dòng ở trang "Đội", giữ nguyên dòng tiêu đề.'],
        ['Cột "Tên đội" bắt buộc. Để trống "Mã đội" thì phần mềm tự đặt D01, D02, ...'],
        ['Mã đội không được trùng nhau.'],
      ],
    },
  ])
}

// ---------- dữ liệu mẫu (để BTC tập nhập liệu, sinh lịch) ----------
// Tên trường / người hướng dẫn là tên đặt chung chung, không phải danh sách thật.
const SAMPLE_NAMES = [
  'Kiến Lửa', 'Dế Mèn', 'Ong Vàng', 'Chuồn Chuồn', 'Bọ Rùa', 'Châu Chấu', 'Sên Con', 'Cào Cào', 'Đom Đóm', 'Bươm Bướm',
  'Sóc Nhanh', 'Cú Đêm', 'Rồng Xanh', 'Hạc Trắng', 'Sao Mai', 'Tia Chớp', 'Mặt Trời', 'Cầu Vồng', 'Lửa Hồng', 'Gió Bấc',
  'Thuyền Buồm', 'Tên Lửa', 'Bánh Răng', 'Mạch Điện', 'Pin Xanh', 'Ốc Vít', 'Tia Laze', 'Nam Châm', 'Hạt Mầm', 'Đại Dương',
]
const SAMPLE_SCHOOLS: [string, string][] = [
  ['THCS Lê Lợi', 'Thanh Hóa'], ['THCS Trần Phú', 'Thanh Hóa'], ['THCS Nguyễn Du', 'Thanh Hóa'], ['THPT Hàm Rồng', 'Thanh Hóa'],
  ['THCS Quang Trung', 'Nghệ An'], ['THCS Hưng Dũng', 'Nghệ An'], ['THCS Đinh Tiên Hoàng', 'Ninh Bình'], ['THCS Kim Đồng', 'Hà Nội'],
  ['THCS Chu Văn An', 'Hà Nội'], ['FPT Schools', 'Hà Nội'],
]
const SAMPLE_ADVISORS = ['Cô Lan', 'Thầy Minh', 'Cô Hoa', 'Thầy Nam', 'Cô Thu', 'Thầy Hùng', 'Cô Mai', 'Thầy Long', 'Cô Hà', 'Thầy Sơn']

/** n đội mẫu (1–30), cố định: mã D01…, 3 đội một trường. */
export function sampleTeams(n: number): Omit<Team, 'id' | 'withdrawn'>[] {
  if (!Number.isInteger(n) || n < 1 || n > SAMPLE_NAMES.length) throw new Error(`Dữ liệu mẫu có 1–${SAMPLE_NAMES.length} đội`)
  return SAMPLE_NAMES.slice(0, n).map((name, k) => {
    const [school, province] = SAMPLE_SCHOOLS[Math.floor(k / 3) % SAMPLE_SCHOOLS.length]
    return { code: `D${String(k + 1).padStart(2, '0')}`, name, school, province, advisor: SAMPLE_ADVISORS[Math.floor(k / 3) % SAMPLE_ADVISORS.length] }
  })
}

/** File Excel theo đúng mẫu, đã điền n đội mẫu. */
export function sampleXlsx(n: number): Promise<Uint8Array> {
  return writeXlsx([{ name: 'Đội', rows: [[...TEMPLATE_HEAD], ...sampleTeams(n).map((t) => [t.code, t.name, t.school, t.province, t.advisor])] }])
}

// ---------- nhập ----------
export type ImportRow = { line: number; team?: Omit<Team, 'id' | 'withdrawn'>; error?: string }

/** Chuẩn hoá tiêu đề cột: bỏ khoảng trắng thừa, không phân biệt hoa thường (giữ dấu). */
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
const text = (c: Cell | undefined) => (c === null || c === undefined ? '' : String(c).trim())

/** Tách CSV theo RFC 4180: trường có ngoặc kép chứa dấu phân cách, xuống dòng và "" thoát. */
function parseCsv(src: string): string[][] {
  const t = src.replace(/^﻿/, '')
  const first = (t.split(/\r?\n/).find((l) => l.trim() !== '') ?? '')
  const count = (d: string) => { // đếm dấu phân cách ngoài ngoặc kép ở dòng đầu
    let q = false, n = 0
    for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch === d) n++ }
    return n
  }
  const delim = [',', ';', '\t'].map((d) => ({ d, n: count(d) })).sort((a, b) => b.n - a.n)[0]
  const D = delim.n > 0 ? delim.d : ','
  const rows: string[][] = []
  let row: string[] = [], f = '', q = false, any = false
  const endRow = () => { row.push(f); rows.push(row); row = []; f = ''; any = false }
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += ch
    } else if (ch === '"') { q = true; any = true }
    else if (ch === D) { row.push(f); f = ''; any = true }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; endRow() }
    else { f += ch; any = true }
  }
  if (any || f !== '' || row.length) endRow()
  return rows
}

export async function importTeams(data: Uint8Array, fileName: string): Promise<ImportRow[]> {
  const ext = /\.([^.]+)$/.exec(fileName.trim())?.[1]?.toLowerCase()
  let tables: Cell[][][]
  if (ext === 'xlsx') tables = (await readXlsx(data)).map((s) => s.rows)
  else if (ext === 'csv') tables = [parseCsv(new TextDecoder('utf-8').decode(data))]
  else throw new Error('Chỉ nhận tệp .xlsx hoặc .csv')

  const want = { code: norm(TEMPLATE_HEAD[0]), name: norm(TEMPLATE_HEAD[1]), school: norm(TEMPLATE_HEAD[2]), province: norm(TEMPLATE_HEAD[3]), advisor: norm(TEMPLATE_HEAD[4]) }
  for (const rows of tables) {
    const h = rows.findIndex((r) => r.some((c) => norm(text(c)) === want.name))
    if (h < 0) continue
    const cols = Object.fromEntries(Object.entries(want).map(([k, v]) => [k, rows[h].findIndex((c) => norm(text(c)) === v)])) as Record<keyof typeof want, number>
    const get = (r: Cell[], k: keyof typeof want) => (cols[k] < 0 ? '' : text(r[cols[k]]))
    const body = rows.slice(h + 1).map((r, i) => ({ r, line: h + 2 + i })).filter(({ r }) => r.some((c) => text(c) !== ''))
    const used = new Set(body.map(({ r }) => get(r, 'code').toLowerCase()).filter(Boolean))
    const seen = new Set<string>()
    let auto = 0
    const nextCode = () => {
      for (;;) {
        const c = `D${String(++auto).padStart(2, '0')}`
        if (!used.has(c.toLowerCase())) { used.add(c.toLowerCase()); return c }
      }
    }
    return body.map(({ r, line }): ImportRow => {
      const name = get(r, 'name')
      if (!name) return { line, error: 'Thiếu tên đội' }
      let code = get(r, 'code')
      if (code) {
        if (seen.has(code.toLowerCase())) return { line, error: `Trùng mã đội ${code}` }
      } else code = nextCode()
      seen.add(code.toLowerCase())
      return { line, team: { code, name, school: get(r, 'school'), province: get(r, 'province'), advisor: get(r, 'advisor') } }
    })
  }
  return [{ line: 1, error: 'Không tìm thấy dòng tiêu đề có cột "Tên đội"' }]
}

// ---------- xuất ----------
const pad = (n: number) => String(n).padStart(2, '0')
const localTime = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const SEATS = ['Đỏ 1', 'Đỏ 2', 'Xanh 1', 'Xanh 2']

export async function exportEvent(s: EventState, roundId: string): Promise<Uint8Array> {
  const round = s.rounds.find((r) => r.id === roundId)
  if (!round) throw new Error(`Không có vòng ${roundId}`)
  const team = (id: string | null) => s.teams.find((t) => t.id === id)
  const nameOf = (id: string | null) => (id === null ? '—' : team(id)?.name ?? id)
  const seatsOf = (m: EMatch) => [m.red[0], m.red[1], m.blue[0], m.blue[1]]
  const head = (m: EMatch): Cell[] => [m.slot + 1, slotTime(round.startAt, round.slotMin, m.slot), m.field + 1, m.id, ...seatsOf(m).map(nameOf)]

  const teams: Cell[][] = [[...TEMPLATE_HEAD, 'Trạng thái'], ...s.teams.map((t) => [t.code, t.name, t.school, t.province, t.advisor, t.withdrawn ? 'Rút lui' : ''])]
  const schedule: Cell[][] = [['Lượt', 'Giờ', 'Sân', 'Trận', ...SEATS], ...round.matches.map(head)]

  const resHead: Cell[] = ['Lượt', 'Giờ', 'Sân', 'Trận', ...SEATS, 'Khu Chữa Cháy', 'R1', 'R2', 'R3', 'Cờ', 'Sai chỗ', 'Hệ số', 'Điểm trận']
  for (const st of SEATS) resHead.push(`${st} lỗi nhẹ`, `${st} thẻ vàng`, `${st} thẻ đỏ`, `${st} cảnh cáo`, `${st} điểm trừ`, `${st} điểm đội`)
  const results: Cell[][] = [resHead]
  for (const m of round.matches) {
    const r = round.results[m.id]
    if (!r) continue
    const sc = liveScore(r.red, r.blue)
    const tp = teamPoints(r, m) // chỉ có ghế khác null, theo thứ tự Đỏ 1, Đỏ 2, Xanh 1, Xanh 2
    const row: Cell[] = [...head(m), sc.fire, sc.r1, sc.r2, sc.r3, sc.flag, sc.wrong, pctText(sc.multPct), sc.total]
    let k = 0
    for (const id of seatsOf(m)) {
      if (id === null) { row.push(null, null, null, null, null, null); continue }
      const t = tp[k++]
      row.push(t.pens.minor, t.pens.yellow, t.pens.red ? 1 : 0, t.pens.warn, t.penalty, t.score)
    }
    results.push(row)
  }

  const standings: Cell[][] = [['Hạng', 'Mã đội', 'Tên đội', 'Trường', 'Tổng điểm', 'Các trận tính', 'Tổng hệ số', 'Trận cao nhất', 'Điểm trừ']]
  for (const e of roundStandings(s, roundId)) {
    const t = team(e.id)
    standings.push([e.rank === 0 ? 'Rút lui' : e.rank, t?.code ?? '', t?.name ?? e.id, t?.school ?? '', e.total, e.counted.join(' + '), pctText(e.multSum), e.best, e.penalty])
  }

  const log: Cell[][] = [['Thời điểm', 'Trận', 'Điểm trận cũ', 'Điểm trận mới'], ...round.edits.map((e): Cell[] => [
    localTime(e.at), e.matchId, e.before ? liveScore(e.before.red, e.before.blue).total : '', liveScore(e.after.red, e.after.blue).total,
  ])]

  return writeXlsx([
    { name: 'Đội', rows: teams }, { name: 'Lịch thi', rows: schedule }, { name: 'Kết quả', rows: results },
    { name: 'Xếp hạng', rows: standings }, { name: 'Nhật ký sửa', rows: log },
  ])
}
