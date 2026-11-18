import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreTally } from '../scoring.ts'
import { emptySheet } from './event.ts'
import { mergeTally } from './half.ts'
import type { ScreenView } from './proto.ts'
import { screenLines } from './screen.ts'

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
  assert.equal(screenLines(v).some((l) => l.label.startsWith('Phạt')), false)
  assert.equal(val(v, 'Bóng sai chỗ (−3)'), '0 → 0')
})

test('screenLines: phạt theo đội, chỉ đội có phạt', () => {
  const v = view(() => {})
  v.pens.red[1] = { minor: 2, yellow: 1, red: false, warn: 3 }
  v.pens.blue[0] = { minor: 0, yellow: 0, red: true, warn: 0 }
  const p = screenLines(v).filter((l) => l.label.startsWith('Phạt'))
  assert.deepEqual(p, [
    { label: 'Phạt · Dế Xanh', value: 'lỗi nhẹ 2 · thẻ vàng 1' },
    { label: 'Phạt · Ong Vàng', value: 'thẻ đỏ' },
  ])
})
