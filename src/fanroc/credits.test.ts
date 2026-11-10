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

test('mọi phần MIT / Apache-2.0 có văn bản giấy phép trong THIRD_PARTY_LICENSES.txt, bộ cài kèm tệp đó + LICENSE AGPL', () => {
  const root = resolve(import.meta.dirname, '../..')
  const third = readFileSync(resolve(root, 'THIRD_PARTY_LICENSES.txt'), 'utf8')
  for (const c of CREDITS.filter((c) => /MIT|Apache/.test(c.license))) {
    const link = c.from.match(/https:\/\/github\.com\/[\w-]+\/[\w.-]+/)?.[0]
    assert.ok(link && third.includes(link), `THIRD_PARTY_LICENSES.txt thiếu ${c.name}`)
  }
  assert.match(third, /Apache License\s+Version 2\.0/)
  assert.match(readFileSync(resolve(root, 'LICENSE'), 'utf8'), /GNU AFFERO GENERAL PUBLIC LICENSE/)
  const bundle = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')).bundle
  assert.equal(bundle.license, 'AGPL-3.0-only')
  assert.equal(bundle.licenseFile, '../LICENSE')
  for (const f of ['LICENSE', 'NGUON.md', 'THIRD_PARTY_LICENSES.txt']) assert.equal(bundle.resources[`../${f}`], f)
})
