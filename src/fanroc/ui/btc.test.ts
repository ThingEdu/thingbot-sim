import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backupName, fieldsOf, nextMatch, parseEvent, randomCode, scheduleRows } from './btc.ts'
import { qrSvg } from '../btc/qr.ts'
import { emptySheet, newEvent, type Round, type Team } from '../btc/event.ts'

const team = (i: number): Team => ({ id: `t${i}`, code: `D0${i}`, name: `Đội ${i}`, school: '', province: '', advisor: '', withdrawn: false })
const round = (): Round => ({
  id: 'r1', name: 'Sơ loại', teamIds: ['t1', 't2', 't3', 't4', 't5'], perTeam: 3, fields: 2, slotMin: 7, startAt: '08:00', seed: 1,
  matches: [
    { id: 'r1-1', slot: 0, field: 0, red: ['t1', 't2'], blue: ['t3', 't4'] },
    { id: 'r1-2', slot: 0, field: 1, red: ['t5', null], blue: ['t2', 't1'] },
    { id: 'r1-3', slot: 2, field: 1, red: ['t3', 't4'], blue: ['t5', 't9'] },
  ],
  results: { 'r1-1': { red: emptySheet(), blue: emptySheet(), committedAt: 1 } }, edits: [],
})

test('scheduleRows: lượt, giờ theo slotTime, sân đếm từ 1, tên đội, ghế trống "—", đã đấu', () => {
  const rows = scheduleRows(round(), [1, 2, 3, 4, 5].map(team))
  assert.deepEqual(rows[0], { id: 'r1-1', slot: 1, time: '08:00', field: 1, red: ['Đội 1', 'Đội 2'], blue: ['Đội 3', 'Đội 4'], done: true })
  assert.deepEqual(rows[1], { id: 'r1-2', slot: 1, time: '08:00', field: 2, red: ['Đội 5', '—'], blue: ['Đội 2', 'Đội 1'], done: false })
  assert.equal(rows[2].time, '08:14')
  assert.equal(rows[2].slot, 3)
  assert.deepEqual(rows[2].blue, ['Đội 5', 't9'], 'đội không còn trong danh sách ⇒ hiện id')
})

test('nextMatch: trận chưa đấu sớm nhất của sân, bỏ trận đang đấu; fieldsOf: các sân có trận', () => {
  const r = round()
  assert.equal(nextMatch(r, 0, new Set())?.id, undefined)
  assert.equal(nextMatch(r, 1, new Set())?.id, 'r1-2')
  assert.equal(nextMatch(r, 1, new Set(['r1-2']))?.id, 'r1-3')
  assert.deepEqual(fieldsOf(r), [0, 1])
})

test('qrSvg: chuỗi <svg> co giãn có viewBox', () => {
  const svg = qrSvg('http://192.168.1.5:47292/')
  assert.ok(svg.startsWith('<svg'))
  assert.match(svg, /viewBox="0 0 \d+ \d+"/)
  assert.ok(svg.length > 1000, 'có các ô đen')
})

test('parseEvent: nhận file giải version 1, từ chối JSON hỏng / sai hình', () => {
  const s = newEvent('Giải A', 1)
  assert.deepEqual(parseEvent(JSON.stringify(s)), s)
  assert.equal(parseEvent('{'), null)
  assert.equal(parseEvent(JSON.stringify({ ...s, version: 2 })), null)
  assert.equal(parseEvent(JSON.stringify({ ...s, teams: {} })), null)
  assert.equal(parseEvent('null'), null)
})

test('backupName / randomCode', () => {
  assert.equal(backupName('Giải FANROC: Hà Nội', new Date(2026, 10, 19, 8, 5)), 'giai-fanroc-ha-noi-2026-11-19-0805.json')
  assert.equal(backupName('Vòng khu vực Đà Nẵng', new Date(2026, 10, 19, 8, 5)), 'giai-vong-khu-vuc-da-nang-2026-11-19-0805.json')
  assert.equal(backupName('', new Date(2026, 0, 2, 3, 4)), 'giai-2026-01-02-0304.json')
  for (let i = 0; i < 50; i++) assert.match(randomCode(), /^\d{4}$/)
})
