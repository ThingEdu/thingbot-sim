import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LOGOS } from './brand.ts'

test('logo ThingEdu + Maker Việt: hai tệp có thật trong gói (SVG / PNG đúng định dạng)', () => {
  assert.deepEqual(LOGOS.map((l) => l.name), ['ThingEdu', 'Maker Việt'])
  for (const l of LOGOS) {
    const path = fileURLToPath(l.src)
    assert.ok(existsSync(path), `thiếu ${path}`)
    const head = readFileSync(path).subarray(0, 8)
    if (path.endsWith('.svg')) assert.match(head.toString(), /^<svg/)
    else assert.deepEqual([...head.subarray(1, 4)], [0x50, 0x4e, 0x47])
  }
})
