import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BtcKeeper, RECONNECT_MS } from './keeper.ts'
import type { BtcLink } from './link.ts'

/** Deps giả: ghi lại start / stop / connect / close; hẹn giờ chạy tay bằng `fire()`. */
function harness() {
  const log: string[] = []
  const timers: { fn: () => void; ms: number }[] = []
  const links: BtcLink[] = []
  const k = new BtcKeeper({
    start: async () => (log.push('start'), { url: 'ws://127.0.0.1:47292/ws', addrs: ['10.0.0.2'], port: 47292 }),
    stop: async () => void log.push('stop'),
    connect: async () => {
      log.push('connect')
      const l: BtcLink = { send() {}, close: () => (log.push('close'), l.onClose?.()) }
      links.push(l)
      return l
    },
    wire: () => void log.push('wire'),
    changed() {},
    later: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    cancel: () => {},
  })
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const fire = async () => {
    const t = timers.splice(0)
    for (const x of t) x.fn()
    await flush()
    return t.map((x) => x.ms)
  }
  return { k, log, links, flush, fire, timers }
}

test('BtcKeeper: mở một lần; ẩn màn (không gọi gì) thì máy chủ + đường nối vẫn chạy, ensure lần nữa không mở lại', async () => {
  const h = harness()
  h.k.ensure()
  await h.flush()
  assert.deepEqual(h.log, ['start', 'connect', 'wire'])
  assert.ok(h.k.link && h.k.server && h.k.running)
  h.k.ensure() // vào lại màn
  await h.flush()
  assert.deepEqual(h.log, ['start', 'connect', 'wire'], 'không mở lại, không dừng')
})

test('BtcKeeper: chỉ stop() mới dừng máy chủ; sau đó ensure mở lại', async () => {
  const h = harness()
  h.k.ensure()
  await h.flush()
  await h.k.stop()
  assert.deepEqual(h.log, ['start', 'connect', 'wire', 'close', 'stop'])
  assert.equal(h.k.link, null)
  assert.equal(h.k.server, null)
  assert.equal(h.k.running, false)
  assert.deepEqual(await h.fire(), [], 'đóng do dừng: không hẹn nối lại')
  h.k.ensure()
  await h.flush()
  assert.deepEqual(h.log.slice(5), ['start', 'connect', 'wire'])
})

test('BtcKeeper: reconnect đóng đường nối (khách nhận nobtc) rồi nối lại, KHÔNG dừng máy chủ', async () => {
  const h = harness()
  h.k.ensure()
  await h.flush()
  const first = h.k.link
  h.k.reconnect()
  assert.equal(h.k.link, null)
  assert.deepEqual(await h.fire(), [RECONNECT_MS])
  assert.deepEqual(h.log, ['start', 'connect', 'wire', 'close', 'connect', 'wire'])
  assert.ok(h.k.link && h.k.link !== first)
})

test('BtcKeeper: mất kết nối ngoài ý muốn ⇒ hẹn nối lại 2 s', async () => {
  const h = harness()
  h.k.ensure()
  await h.flush()
  const l = h.k.link!
  l.onClose?.()
  assert.equal(h.k.link, null)
  assert.deepEqual(await h.fire(), [2000])
  assert.ok(h.k.link)
})
