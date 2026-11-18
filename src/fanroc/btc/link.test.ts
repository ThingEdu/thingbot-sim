import { test } from 'node:test'
import assert from 'node:assert/strict'
import { browserBtc, parseBtcFrame, parseClientFrame } from './link.ts'

test('browserBtc: mặc định ws://127.0.0.1:47292/ws; ?btc= chỉ nhận ws:// tới máy này, đường /ws', () => {
  assert.equal(browserBtc(''), 'ws://127.0.0.1:47292/ws')
  assert.equal(browserBtc('?btc=ws://127.0.0.1:5000/ws'), 'ws://127.0.0.1:5000/ws')
  assert.equal(browserBtc('?btc=ws://localhost/ws'), 'ws://localhost/ws')
  assert.equal(browserBtc('?san=1&btc=ws://localhost:47300/ws'), 'ws://localhost:47300/ws')
  assert.equal(browserBtc('?btc=ws://evil.example:80/ws'), 'ws://127.0.0.1:47292/ws')
  assert.equal(browserBtc('?btc=ws://127.0.0.1:5000/'), 'ws://127.0.0.1:47292/ws')
  assert.equal(browserBtc('?btc=wss://127.0.0.1:5000/ws'), 'ws://127.0.0.1:47292/ws')
})

test('parseBtcFrame: thư khách, vào/ra, bị từ chối; còn lại bỏ', () => {
  assert.deepEqual(parseBtcFrame('{"from":"c3","m":{"t":"join","role":"screen","field":0}}'),
    { t: 'msg', from: 'c3', m: { t: 'join', role: 'screen', field: 0 } })
  assert.deepEqual(parseBtcFrame('{"peer":"c4","on":true}'), { t: 'peer', id: 'c4', on: true })
  assert.deepEqual(parseBtcFrame('{"peer":"c4","on":false}'), { t: 'peer', id: 'c4', on: false })
  assert.deepEqual(parseBtcFrame('{"t":"reject","reason":"btc"}'), { t: 'reject', reason: 'btc' })
  assert.equal(parseBtcFrame('không phải json'), null)
  assert.equal(parseBtcFrame('{"from":3,"m":{}}'), null)
  assert.equal(parseBtcFrame('{"from":"c1"}'), null)
  assert.equal(parseBtcFrame('{"peer":"c4","on":"yes"}'), null)
  assert.equal(parseBtcFrame('null'), null)
})

test('parseClientFrame: nobtc ⇒ trạng thái; khung nhìn ⇒ view; rác ⇒ null', () => {
  assert.deepEqual(parseClientFrame('{"t":"nobtc"}'), { t: 'nobtc' })
  assert.deepEqual(parseClientFrame('{"t":"deny","reason":"code"}'), { t: 'view', m: { t: 'deny', reason: 'code' } })
  assert.equal(parseClientFrame('{"t":"lạ"}'), null)
  assert.equal(parseClientFrame('}{'), null)
})
