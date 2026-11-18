import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreTally } from '../scoring.ts'
import { emptySheet } from './event.ts'
import { mergeTally } from './half.ts'
import type { ScreenView } from './proto.ts'
import { screenLines, sidePanelHtml } from './screen.ts'

const pens = () => [{ minor: 0, yellow: 0, red: false, warn: 0 }, { minor: 0, yellow: 0, red: false, warn: 0 }]
function view(f: (r: ReturnType<typeof emptySheet>, b: ReturnType<typeof emptySheet>) => void): ScreenView {
  const r = emptySheet(), b = emptySheet()
  f(r, b)
  return {
    t: 'screen', field: 0, teams: { red: ['Kiến Lửa', 'Dế Xanh'], blue: ['Ong Vàng', 'Chuồn Chuồn'] }, phase: 'play', clock: 100,
    score: scoreTally(mergeTally(r, b)), pens: { red: pens(), blue: pens() }, refs: { red: 'on', blue: 'on' }, official: null, next: null, ranking: [],
  }
}
const val = (v: ScreenView, label: string) => screenLines(v).find((l) => l.label === label)?.value

test('screenLines: Khu Chữa Cháy, rãnh, sai chỗ, cờ, hệ số', () => {
  const v = view((r, b) => {
    r.fire.o = 7; b.fire.o = 5 // 12 cam ⇒ 60
    r.mtn[0][0].g = 9; r.mtn[0][1].g = 6; r.mtn[1][2].g = 3 // 9 / 6 / 3 ⇒ 45 + 60 + 45 = 150
    r.decorO = 4 // 4 sai chỗ ⇒ −12
    r.flags[0] = true // chưa đủ 3 rãnh ⇒ 20
    r.climbs[0] = 'ground'
  })
  assert.equal(val(v, 'Khu Chữa Cháy (cam +5)'), '12 → 60')
  assert.equal(val(v, 'Rãnh 1 / 2 / 3 (+5 / +10 / +15)'), '9 / 6 / 3 → 150')
  assert.equal(val(v, 'Bóng sai chỗ (−3)'), '4 → −12')
  assert.equal(val(v, 'Cờ'), '20')
  assert.equal(val(v, 'Hệ số leo'), `1,${String(v.score.multPct - 100).padStart(2, '0')}`) // 105 ⇒ "1,05"
  assert.ok(v.score.multPct > 100 && v.score.multPct < 200)
})

test('screenLines: không có phạt ⇒ không có dòng Phạt; sai chỗ 0 ⇒ "0 → 0"', () => {
  const v = view(() => {})
  assert.equal(screenLines(v).some((l) => l.label.endsWith('phạt')), false)
  assert.equal(val(v, 'Bóng sai chỗ (−3)'), '0 → 0')
})

test('screenLines: phạt theo đội, chỉ đội có phạt', () => {
  const v = view(() => {})
  v.pens.red[1] = { minor: 2, yellow: 1, red: false, warn: 3 }
  v.pens.blue[0] = { minor: 0, yellow: 0, red: true, warn: 0 }
  const p = screenLines(v).filter((l) => l.label.endsWith('phạt'))
  assert.deepEqual(p, [
    { label: 'Đỏ · Dế Xanh · phạt', value: 'lỗi nhẹ 2 · thẻ vàng 1', side: 'red' },
    { label: 'Xanh · Ong Vàng · phạt', value: 'thẻ đỏ', side: 'blue' },
  ])
})

test('ghế trống: phạt và điểm chính thức khớp đúng đội (đỏ [A, trống], xanh [trống, C])', () => {
  const v = view(() => {})
  v.teams = { red: ['A', ''], blue: ['', 'C'] }
  v.pens.red = [{ minor: 1, yellow: 0, red: false, warn: 0 }, { minor: 5, yellow: 0, red: false, warn: 0 }] // ghế 1 trống: bỏ qua
  v.pens.blue = [{ minor: 0, yellow: 2, red: false, warn: 0 }, { minor: 1, yellow: 0, red: false, warn: 0 }] // ghế 0 trống: bỏ qua
  assert.deepEqual(screenLines(v).filter((l) => l.side), [
    { label: 'Đỏ · A · phạt', value: 'lỗi nhẹ 1', side: 'red' },
    { label: 'Xanh · C · phạt', value: 'lỗi nhẹ 1', side: 'blue' },
  ])
  v.official = [{ side: 'red', seat: 0, name: 'A', score: 11 }, { side: 'blue', seat: 1, name: 'C', score: 22 }]
  const red = sidePanelHtml(v, 'red'), blue = sidePanelHtml(v, 'blue')
  assert.equal((red.match(/class="ts"/g) ?? []).length, 1)
  assert.ok(red.indexOf('11 điểm') < red.indexOf('—'))
  assert.ok(blue.indexOf('—') < blue.indexOf('C'))
  assert.ok(blue.indexOf('C') < blue.indexOf('22 điểm'))
  assert.equal((blue.match(/class="ts"/g) ?? []).length, 1)
})

test('sidePanelHtml: tên đội có <script> và & được thoát', () => {
  const v = view(() => {})
  v.teams.red = ['<script>alert(1)</script>', 'A & B']
  const h = sidePanelHtml(v, 'red')
  assert.ok(!h.includes('<script>'))
  assert.ok(h.includes('&lt;script&gt;') && h.includes('A &amp; B'))
})
