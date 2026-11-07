import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CREDITS } from './credits.ts'

const doc = readFileSync(resolve(import.meta.dirname, '../../NGUON.md'), 'utf8')

test('NGUON.md ghi đủ mọi nguồn trong ⚙ › Nguồn (tên, link / commit, giấy phép)', () => {
  const lines = doc.split('\n')
  for (const c of CREDITS) {
    const line = lines.find((l) => l.startsWith(`| ${c.name} |`))
    assert.ok(line, `thiếu dòng "${c.name}"`)
    const link = c.from.match(/https:\/\/\S+/)?.[0]
    if (link) assert.ok(line.includes(link), `dòng "${c.name}" thiếu link ${link}`)
    assert.ok(line.endsWith(`| ${c.license} |`), `dòng "${c.name}" ghi giấy phép khác`)
  }
})

test('mỗi nguồn ghi rõ lấy từ đâu và giấy phép', () => {
  for (const c of CREDITS) assert.ok(c.from.length > 10 && c.license.length > 2, c.name)
})

test('ThingBlock ghi đúng commit CI tải về', () => {
  const ci = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/fanroc-desktop.yml'), 'utf8')
  const ref = ci.match(/THINGBLOCK_REF: (\w+)/)?.[1]
  assert.ok(ref && CREDITS[0].from.includes(ref))
})
