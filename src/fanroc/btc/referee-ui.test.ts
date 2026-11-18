import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptySheet } from './event.ts'
import { topHtml } from './referee-ui.ts'
import type { RefView } from './proto.ts'

test('topHtml: mã trận được thoát HTML (file giải mở từ máy có thể chứa mã trận lạ)', () => {
  const view: RefView = { t: 'ref', event: 'e', field: 0, side: 'red', match: { id: 'r1-<img src=x onerror=alert(1)>', teams: ['A', 'B'] }, phase: 'play', clock: 60, sheet: emptySheet(), ackSeq: 0 }
  const html = topHtml(0, 'red', 'online', view, false)
  assert.ok(!html.includes('<img'), html)
  assert.ok(html.includes('&lt;img'), html)
})
