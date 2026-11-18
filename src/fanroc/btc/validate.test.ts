import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySheet } from './event.ts'
import { sanitizeSheet } from './validate.ts'

test('sanitizeSheet: phiếu đúng ⇒ bản sao sạch (bỏ trường lạ); sai kiểu / ngoài khoảng ⇒ null', () => {
  const ok = { ...emptySheet(), decorO: 300, extra: 'x', faults: [{ team: 1, code: 'Y2', kind: 'yellow', at: 12.5, junk: 1 }] }
  ok.pens[0].minor = 20
  const r = sanitizeSheet(ok)!
  assert.ok(r)
  assert.equal('extra' in r, false)
  assert.deepEqual(r.faults, [{ team: 1, code: 'Y2', kind: 'yellow', at: 12.5 }])
  assert.equal(r.decorO, 300)
  assert.notEqual(r.mtn, ok.mtn)
  for (const bad of [null, 1, 'x', [], {}, { ...emptySheet(), decorO: 301 }, { ...emptySheet(), decorO: -1 },
    { ...emptySheet(), climbs: ['none'] }, { ...emptySheet(), flags: [true, 1] },
    { ...emptySheet(), pens: [{ minor: 0, yellow: 21, red: false, warn: 0 }, emptySheet().pens[1]] },
    { ...emptySheet(), faults: {} }, { ...emptySheet(), fire: { o: Number.NaN, g: 0 } }]) {
    assert.equal(sanitizeSheet(bad), null, JSON.stringify(bad))
  }
})
