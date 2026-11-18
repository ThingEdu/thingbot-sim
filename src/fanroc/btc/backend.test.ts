import { test } from 'node:test'
import assert from 'node:assert/strict'
import { btcBackend, EVENT_KEY, serialSaver, wsPort } from './backend.ts'

const fakeStorage = () => {
  const m = new Map<string, string>()
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

test('backend trình duyệt: lưu / đọc file giải ở fanroc.v1.btc.event; địa chỉ và cổng theo ?btc=', async () => {
  const st = fakeStorage()
  const b = btcBackend({ location: { search: '?btc=ws://127.0.0.1:5123/ws' }, localStorage: st })
  assert.equal(b.desktop, false)
  assert.equal(await b.load(), null)
  await b.save('{"a":1}')
  assert.deepEqual([...st.m.keys()], [EVENT_KEY])
  assert.equal(await b.load(), '{"a":1}')
  assert.deepEqual(await b.start(), { url: 'ws://127.0.0.1:5123/ws', addrs: ['127.0.0.1'], port: 5123 })
  const d = btcBackend({ location: { search: '' }, localStorage: st })
  assert.equal((await d.start()).port, 47292)
  const full = btcBackend({ location: { search: '' }, localStorage: { getItem: () => null, setItem: () => { throw new Error('đầy') } } })
  await assert.rejects(full.save('x'), /đầy/)
  const locked = btcBackend({ location: { search: '' }, localStorage: { getItem: () => { throw new Error('bị chặn') }, setItem: () => {} } })
  await assert.rejects(locked.load(), /bị chặn/, 'lỗi đọc không được coi là chưa có giải')
})

test('backend desktop: lệnh btc_* và save_file', async () => {
  const calls: [string, unknown][] = []
  const invoke = async (cmd: string, args: unknown) => {
    calls.push([cmd, args])
    if (cmd === 'btc_start') return { port: 47292, addrs: ['192.168.1.9'] }
    if (cmd === 'btc_load') return '{"x":1}'
    if (cmd === 'save_file') return '/Users/a/Downloads/giai.xlsx'
    return null
  }
  const b = btcBackend({ __TAURI_INTERNALS__: { invoke } } as never)
  assert.equal(b.desktop, true)
  assert.deepEqual(await b.start(), { url: 'ws://127.0.0.1:47292/ws', addrs: ['192.168.1.9'], port: 47292 })
  assert.equal(await b.load(), '{"x":1}')
  await b.save('{}')
  assert.equal(await b.saveFile('giai.xlsx', new Uint8Array([1, 2])), '/Users/a/Downloads/giai.xlsx')
  assert.deepEqual(calls.map((c) => c[0]), ['btc_start', 'btc_load', 'btc_save', 'save_file'])
  assert.deepEqual(calls[2][1], { json: '{}' })
  assert.deepEqual(calls[3][1], { name: 'giai.xlsx', data: [1, 2] })
})

test('wsPort', () => {
  assert.equal(wsPort('ws://127.0.0.1:5123/ws'), 5123)
  assert.equal(wsPort('ws://localhost/ws'), 80)
})

test('serialSaver: một lần ghi một lúc, giữ bản mới nhất, không bỏ lần ghi cuối', async () => {
  const wrote: string[] = []
  let active = 0, maxActive = 0
  const release: (() => void)[] = []
  const save = (json: string) => new Promise<void>((ok) => {
    active++
    maxActive = Math.max(maxActive, active)
    release.push(() => { active--; wrote.push(json); ok() })
  })
  const errs: unknown[] = []
  const put = serialSaver(save, (e) => errs.push(e))
  const p = put('1')
  put('2')
  put('3')
  assert.equal(release.length, 1, 'chỉ một lần ghi đang chạy')
  release.shift()!()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(release.length, 1)
  release.shift()!()
  await p
  assert.deepEqual(wrote, ['1', '3'], 'bản 2 bị thay bằng bản 3 mới hơn')
  assert.equal(maxActive, 1)
  assert.deepEqual(errs, [null, null])
  const errs2: unknown[] = []
  const bad = serialSaver(async () => { throw new Error('hỏng') }, (e) => errs2.push(e))
  await bad('x')
  assert.match(String(errs2[0]), /hỏng/)
})

test('CSP của app cho trang nối WebSocket tới 127.0.0.1 (hub LAN, ống nối, máy chủ BTC)', async () => {
  const { readFileSync } = await import('node:fs')
  const conf = JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
  const connect: string = conf.app.security.csp['connect-src']
  assert.ok(connect.split(/\s+/).includes('ws://127.0.0.1:*'), connect)
})
