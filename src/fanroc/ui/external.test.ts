import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EXTERNAL_URLS, linkAction, tauriInvoke } from './external.ts'
import { SOURCE_URL } from './shell.ts'

test('linkAction: trình duyệt ⇒ để link tự mở; trong app desktop ⇒ mở bằng opener chỉ khi đúng link được phép', () => {
  assert.equal(linkAction(false, SOURCE_URL, EXTERNAL_URLS), 'browser')
  assert.equal(linkAction(false, 'https://khac.vn', EXTERNAL_URLS), 'browser')
  assert.equal(linkAction(true, SOURCE_URL, EXTERNAL_URLS), 'opener')
  // Không khớp đúng từng ký tự ⇒ không gọi opener (quyền của app cũng chỉ cho đúng link này).
  assert.equal(linkAction(true, SOURCE_URL + '/issues', EXTERNAL_URLS), 'blocked')
  assert.equal(linkAction(true, 'https://khac.vn', EXTERNAL_URLS), 'blocked')
})

test('tauriInvoke: chỉ có khi trang chạy trong app desktop (__TAURI_INTERNALS__)', () => {
  assert.equal(tauriInvoke({}), null)
  const calls: unknown[] = []
  const w = { __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => (calls.push([cmd, args]), Promise.resolve()) } }
  const inv = tauriInvoke(w)
  assert.ok(inv)
  void inv('plugin:opener|open_url', { url: SOURCE_URL })
  assert.deepEqual(calls, [['plugin:opener|open_url', { url: SOURCE_URL }]])
})

test('quyền opener của gói desktop: chỉ open_url, phạm vi đúng các link EXTERNAL_URLS (không opener:default)', () => {
  const cap = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../src-tauri/capabilities/default.json'), 'utf8'))
  const opener = cap.permissions.filter((p: string | { identifier: string }) => (typeof p === 'string' ? p : p.identifier).startsWith('opener:'))
  assert.deepEqual(opener, [{ identifier: 'opener:allow-open-url', allow: EXTERNAL_URLS.map((url) => ({ url })) }])
  assert.deepEqual(EXTERNAL_URLS, [SOURCE_URL])
})
