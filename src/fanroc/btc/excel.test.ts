import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySheet, newEvent, reduce, type EMatch, type EventState, type Result } from './event.ts'
import { liveScore, teamPoints } from './sheet.ts'
import { roundStandings } from './rank.ts'
import { slotTime } from './schedule.ts'
import { pctText } from '../scoring.ts'
import { exportEvent, importTeams, sampleTeams, sampleXlsx, templateXlsx, TEMPLATE_HEAD } from './excel.ts'
import { readXlsx, writeXlsx, type Cell } from './xlsx.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const res = (fireO: number, yellow = 0, red = false): Result => {
  const r = emptySheet()
  r.fire.o = fireO
  r.pens[0].yellow = yellow
  r.pens[1].red = red
  return { red: r, blue: emptySheet(), committedAt: 1 }
}

test('templateXlsx đọc lại được, dòng đầu là TEMPLATE_HEAD; nhập file mẫu trống ⇒ không có dòng nào', async () => {
  const t = await templateXlsx()
  const sheets = await readXlsx(t)
  assert.equal(sheets[0].name, 'Đội')
  assert.deepEqual(sheets[0].rows[0], [...TEMPLATE_HEAD])
  assert.deepEqual(await importTeams(t, 'mau.xlsx'), [])
})

test('importTeams xlsx: tiêu đề ở dòng 3, dòng trống giữa, mã là số, thiếu tên, trùng mã, mã tự đặt tránh mã đã có', async () => {
  const rows: Cell[][] = [
    ['Danh sách đội FANROC'],
    [],
    ['  tên  ĐỘI ', 'MÃ ĐỘI', 'Trường', 'Tỉnh/Thành', 'Người hướng dẫn'], // thứ tự cột đảo, hoa thường lẫn lộn
    ['Lửa', 12, 'THCS A', 'Hà Nội', 'Cô Lan'],
    [],
    ['Nước', null, 'THCS B', 'Huế', null],
    [null, 'X1', 'THCS C', null, null],
    ['Gió', 'D01', null, null, null],
    ['Đất', 'D01', null, null, null],
    ['Mây', '', null, null, null],
  ]
  const out = await importTeams(await writeXlsx([{ name: 'Đội', rows }]), 'doi.XLSX')
  assert.deepEqual(out.map((o) => [o.line, o.team?.code, o.team?.name, o.error]), [
    [4, '12', 'Lửa', undefined],
    [6, 'D02', 'Nước', undefined], // D01 đã dùng trong tệp ⇒ bỏ qua
    [7, undefined, undefined, 'Thiếu tên đội'],
    [8, 'D01', 'Gió', undefined],
    [9, undefined, undefined, 'Trùng mã đội D01'],
    [10, 'D03', 'Mây', undefined],
  ])
  assert.equal(out[0].team?.advisor, 'Cô Lan')
  assert.equal(out[1].team?.advisor, '')
})

test('importTeams csv chấm phẩy, có BOM, trường trong ngoặc kép chứa ; , xuống dòng và ""', async () => {
  const csv = '﻿Mã đội;Tên đội;Trường;Tỉnh/Thành;Người hướng dẫn\r\n' +
    '1;"Đội ""A"", B; C";"THCS\nX";Huế;Thầy Nam\r\n\r\n' +
    ';Đội D;;;\r\n'
  const out = await importTeams(enc(csv), 'a.csv')
  assert.equal(out.length, 2)
  assert.deepEqual(out[0].team, { code: '1', name: 'Đội "A", B; C', school: 'THCS\nX', province: 'Huế', advisor: 'Thầy Nam' })
  assert.equal(out[1].team?.code, 'D01')
  assert.equal(out[1].line, 4) // đếm theo bản ghi: 1 tiêu đề, 2 đội A, 3 trống, 4 đội D
})

test('importTeams csv dấu phẩy, không BOM; đuôi lạ ⇒ ném lỗi', async () => {
  const out = await importTeams(enc('Tên đội,Mã đội\nLửa,A\n'), 'x.csv')
  assert.equal(out[0].team?.code, 'A')
  await assert.rejects(importTeams(enc(''), 'x.pdf'), { message: 'Chỉ nhận tệp .xlsx hoặc .csv' })
  await assert.rejects(importTeams(enc(''), 'x'), { message: 'Chỉ nhận tệp .xlsx hoặc .csv' })
})

function event(): EventState {
  let s = newEvent('thử', 1)
  s = reduce(s, { t: 'teams', teams: Array.from({ length: 5 }, (_, i) => ({ code: `D${i + 1}`, name: `Đội ${i + 1}`, school: `Trường ${i + 1}`, province: '', advisor: '' })) })
  s = reduce(s, { t: 'round.add', name: 'Vòng 1', teamIds: ['t1', 't2', 't3', 't4', 't5'], perTeam: 3, fields: 1, slotMin: 7, startAt: '08:00', seed: 7 })
  const ms: EMatch[] = [
    { id: 'a1', slot: 0, field: 0, red: ['t1', 't2'], blue: ['t3', 't4'] },
    { id: 'a2', slot: 1, field: 1, red: ['t5', null], blue: ['t1', 't2'] },
    { id: 'a3', slot: 2, field: 0, red: ['t3', 't4'], blue: ['t5', null] },
  ]
  s = reduce(s, { t: 'round.schedule', roundId: 'r1', matches: ms })
  s = reduce(s, { t: 'result.edit', roundId: 'r1', matchId: 'a1', result: res(5, 1), now: new Date(2026, 10, 18, 9, 5).getTime() })
  s = reduce(s, { t: 'result.edit', roundId: 'r1', matchId: 'a2', result: res(2, 0, true), now: 5 })
  s = reduce(s, { t: 'result.edit', roundId: 'r1', matchId: 'a1', result: res(9, 1), now: new Date(2026, 10, 18, 9, 30).getTime() })
  return reduce(s, { t: 'team.withdraw', id: 't4' })
}

test('exportEvent: 5 sheet, Lịch thi, Kết quả theo điểm mới, Nhật ký sửa giữ điểm cũ, Xếp hạng theo roundStandings', async () => {
  const s = event()
  const sheets = await readXlsx(await exportEvent(s, 'r1'))
  assert.deepEqual(sheets.map((x) => x.name), ['Đội', 'Lịch thi', 'Kết quả', 'Xếp hạng', 'Nhật ký sửa'])
  const by = Object.fromEntries(sheets.map((x) => [x.name, x.rows]))

  assert.deepEqual(by['Đội'][0], [...TEMPLATE_HEAD, 'Trạng thái'])
  assert.deepEqual(by['Đội'][4], ['D4', 'Đội 4', 'Trường 4', '', '', 'Rút lui'])
  assert.deepEqual(by['Đội'][1][5], '')

  assert.deepEqual(by['Lịch thi'][0], ['Lượt', 'Giờ', 'Sân', 'Trận', 'Đỏ 1', 'Đỏ 2', 'Xanh 1', 'Xanh 2'])
  assert.deepEqual(by['Lịch thi'][2], [2, slotTime('08:00', 7, 1), 2, 'a2', 'Đội 5', '—', 'Đội 1', 'Đội 2'])

  const kq = by['Kết quả']
  assert.equal(kq.length, 3) // tiêu đề + 2 trận có kết quả (a3 chưa đấu)
  assert.equal(kq[0].length, 4 + 4 + 8 + 24)
  assert.deepEqual(kq[0].slice(8, 17), ['Khu Chữa Cháy', 'R1', 'R2', 'R3', 'Cờ', 'Sai chỗ', 'Hệ số', 'Điểm trận', 'Đỏ 1 lỗi nhẹ'])
  assert.equal(kq[0][21], 'Đỏ 1 điểm đội')
  assert.equal(kq[0][22], 'Đỏ 2 lỗi nhẹ')
  const r1 = s.rounds[0].results.a1
  const sc = liveScore(r1.red, r1.blue)
  assert.deepEqual(kq[1].slice(0, 4), [1, '08:00', 1, 'a1'])
  assert.deepEqual(kq[1].slice(8, 16), [sc.fire, sc.r1, sc.r2, sc.r3, sc.flag, sc.wrong, pctText(sc.multPct), sc.total])
  const tp = teamPoints(r1, s.rounds[0].matches[0])
  assert.deepEqual(kq[1].slice(16, 22), [0, 1, 0, 0, tp[0].penalty, tp[0].score]) // Đỏ 1: 1 thẻ vàng
  assert.equal(sc.total, liveScore(res(9, 1).red, res(9, 1).blue).total)
  // a2: Đỏ 2 ghế trống, Xanh có thẻ đỏ ở Đỏ 2 (ghế null) — kiểm ghế trống để trống
  assert.deepEqual(kq[2].slice(22, 28), [null, null, null, null, null, null])
  assert.equal(kq[2][21] === null, false)

  const log = by['Nhật ký sửa']
  assert.deepEqual(log[0], ['Thời điểm', 'Trận', 'Điểm trận cũ', 'Điểm trận mới'])
  assert.equal(log.length, 4)
  assert.deepEqual(log[1], ['2026-11-18 09:05', 'a1', '', liveScore(res(5, 1).red, res(5, 1).blue).total])
  assert.deepEqual(log[3], ['2026-11-18 09:30', 'a1', liveScore(res(5, 1).red, res(5, 1).blue).total, sc.total])
  assert.notEqual(log[3][2], log[3][3])

  const st = roundStandings(s, 'r1')
  const xh = by['Xếp hạng']
  assert.equal(xh.length, st.length + 1)
  assert.deepEqual(xh[0], ['Hạng', 'Mã đội', 'Tên đội', 'Trường', 'Tổng điểm', 'Các trận tính', 'Tổng hệ số', 'Trận cao nhất', 'Điểm trừ'])
  st.forEach((e, i) => {
    const t = s.teams.find((x) => x.id === e.id)!
    assert.deepEqual(xh[i + 1], [e.rank === 0 ? 'Rút lui' : e.rank, t.code, t.name, t.school, e.total, e.counted.join(' + '), pctText(e.multSum), e.best, e.penalty])
  })
  assert.equal(xh[xh.length - 1][0], 'Rút lui')
})

test('xuất rồi nhập lại danh sách đội: sheet Đội của exportEvent nhập được', async () => {
  const out = await importTeams(await exportEvent(event(), 'r1'), 'giai.xlsx')
  assert.equal(out.length, 5)
  assert.ok(out.every((o) => o.team))
  assert.equal(out[2].team?.school, 'Trường 3')
})

test('dữ liệu mẫu 20 / 30 đội: nhập lại không lỗi, đủ số đội, mã và tên không trùng', async () => {
  for (const n of [20, 30] as const) {
    const rows = await importTeams(await sampleXlsx(n), `mau-${n}-doi.xlsx`)
    assert.equal(rows.filter((r) => r.error).length, 0)
    const teams = rows.flatMap((r) => (r.team ? [r.team] : []))
    assert.equal(teams.length, n)
    assert.equal(new Set(teams.map((t) => t.code)).size, n)
    assert.equal(new Set(teams.map((t) => t.name)).size, n)
    assert.ok(teams.every((t) => t.school && t.province && t.advisor))
  }
  assert.deepEqual(sampleTeams(20), sampleTeams(30).slice(0, 20))
})

test('nhập .xls (Excel cũ) ⇒ lời dặn lưu lại thành .xlsx; CSV không phải UTF-8 (Windows-1258) vẫn đọc được', async () => {
  await assert.rejects(importTeams(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'ds.xls'), /Lưu thành.*\.xlsx/)
  // "Tên đội\nDế" ở bảng mã Windows-1258: ê = 0xEA, đ = 0xF0, ộ = ô (0xF4) + dấu nặng (0xF2), ế = ê (0xEA) + dấu sắc (0xEC)
  const cp = new Uint8Array([0x54, 0xea, 0x6e, 0x20, 0xf0, 0xf4, 0xf2, 0x69, 0x0a, 0x44, 0xea, 0xec])
  const rows = await importTeams(cp, 'ds.csv')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].team?.name, 'Dế')
})
