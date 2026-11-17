import { test } from 'node:test'
import assert from 'node:assert/strict'
import { browserHub, lanBackend } from './backend.ts'

test('hub trình duyệt: mặc định 127.0.0.1:47290; ?lanhub= chỉ nhận ws:// tới máy này', () => {
  assert.equal(browserHub(''), 'ws://127.0.0.1:47290')
  assert.equal(browserHub('?lanhub=ws://127.0.0.1:5000'), 'ws://127.0.0.1:5000')
  assert.equal(browserHub('?lanhub=ws://localhost:5001'), 'ws://localhost:5001')
  assert.equal(browserHub('?lanhub=ws://evil.example:80'), 'ws://127.0.0.1:47290')
})

test('backend: trong app desktop gọi lệnh lan_* và trả địa chỉ 127.0.0.1 của ống nối', async () => {
  const calls: [string, unknown][] = []
  const invoke = async (cmd: string, args: unknown) => {
    calls.push([cmd, args])
    if (cmd === 'lan_host_start') return { port: 47290, addrs: ['192.168.1.9'] }
    if (cmd === 'lan_connect') return 51234
    if (cmd === 'lan_rooms') return [{ name: 'Đỏ', addr: '192.168.1.9:47290', proto: 1 }]
    return null
  }
  const b = lanBackend({ __TAURI_INTERNALS__: { invoke } } as never)
  assert.equal(b.desktop, true)
  assert.deepEqual(await b.host('Đội Đỏ'), { url: 'ws://127.0.0.1:47290', addrs: ['192.168.1.9'] })
  assert.equal(await b.join('192.168.1.9'), 'ws://127.0.0.1:51234')
  assert.equal((await b.rooms()).length, 1)
  assert.deepEqual(calls.map((c) => c[0]), ['lan_host_start', 'lan_connect', 'lan_rooms'])
  assert.deepEqual(calls[1][1], { addr: '192.168.1.9' })
  const web = lanBackend({ location: { search: '' } })
  assert.equal(web.desktop, false)
  assert.equal(await web.join('1.2.3.4'), 'ws://127.0.0.1:47290')
})
