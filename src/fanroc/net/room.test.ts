import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GuestRoom, HostRoom, PROTO, type TeamInfo } from './room.ts'
import { pair, type Transport } from './transport.ts'
import { NEUTRAL } from '../ports.ts'
import type { RobotConfig } from '../robots.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const info = (team: string): TeamInfo => ({ team, players: 1, robots: [MAKER, MAKER], skill: 'medium', app: '1.0.0' })
const flush = () => new Promise((r) => setTimeout(r, 0))

function setup() {
  let clock = 0
  const now = () => clock
  const [a, b] = pair()
  const host = new HostRoom(a, info('Đỏ'), now)
  const guest = new GuestRoom(b, info('Xanh'), now)
  /** Tua đồng hồ từng 100 ms, mỗi nhịp hai phòng tick và thư kịp tới (ping / pong giữ kết nối như thật). */
  const tick = async (ms: number) => {
    for (let left = ms; left > 0; left -= 100) {
      clock += Math.min(100, left)
      host.tick()
      guest.tick()
      await flush()
    }
  }
  return { host, guest, a, b, tick, now }
}

/** Đưa hai phòng tới lúc đang thi đấu. */
async function toPlaying(s: ReturnType<typeof setup>) {
  const starts: number[] = []
  s.host.onStart = (seed) => starts.push(seed)
  s.guest.onStart = (seed) => starts.push(seed)
  await flush()
  s.host.setReady(true)
  s.guest.setReady(true)
  await flush()
  s.host.hostLoaded()
  s.guest.loaded()
  await flush()
  await s.tick(3100)
  await flush()
  return starts
}

test('phòng: vào phòng ⇒ phòng chờ hai bên; cả hai Sẵn sàng ⇒ cùng seed, đếm ngược 3 s rồi thi đấu', async () => {
  const s = setup()
  await flush()
  assert.equal(s.host.stage, 'lobby')
  assert.equal(s.guest.stage, 'lobby')
  assert.equal(s.host.guest?.team, 'Xanh')
  assert.equal(s.guest.host?.team, 'Đỏ')
  s.host.setReady(true)
  await flush()
  assert.equal(s.host.stage, 'lobby', 'một bên sẵn sàng chưa đủ')
  assert.deepEqual(s.guest.ready, [true, false])
  const starts = await toPlaying(s)
  assert.equal(starts.length, 2)
  assert.equal(starts[0], starts[1])
  assert.equal(s.host.stage, 'playing')
  assert.equal(s.guest.stage, 'playing')
})

test('phòng: cổng máy khách gửi lên tới máy chủ; ảnh chụp tới máy khách', async () => {
  const s = setup()
  await toPlaying(s)
  const got: number[] = []
  s.guest.onSnapshot = (b) => got.push(b.byteLength)
  s.guest.input([{ ...NEUTRAL, M1: 50 }, NEUTRAL])
  s.host.snapshot(new ArrayBuffer(8))
  await flush()
  assert.equal(s.host.ports(0).M1, 50)
  assert.deepEqual(got, [8])
})

test('phòng: khác phiên bản giao thức ⇒ bị từ chối với lời rõ ràng', async () => {
  const [a, b] = pair()
  const host = new HostRoom(a, info('Đỏ'), () => 0)
  b.onMessage = (d) => received.push(String(d))
  const received: string[] = []
  b.send(JSON.stringify({ t: 'hello', proto: PROTO + 1, info: info('Xanh') }))
  await flush()
  assert.equal(host.stage, 'waiting')
  assert.deepEqual(received.map((d) => JSON.parse(d)), [{ t: 'reject', reason: 'proto' }])
  // Máy khách thấy lời tiếng Việt.
  const [c, d] = pair()
  const g = new GuestRoom(d, info('Xanh'), () => 0)
  c.send(JSON.stringify({ t: 'reject', reason: 'proto' }))
  await flush()
  assert.match(g.rejected ?? '', /cùng phiên bản TiFa/)
})

test('phòng: máy khách im lặng quá 2 s giữa trận ⇒ máy chủ coi là rớt, cổng Xanh trung tính; nối lại trước 10 s ⇒ chạy tiếp', async () => {
  const s = setup()
  await toPlaying(s)
  s.guest.input([{ ...NEUTRAL, M1: 70 }, NEUTRAL])
  await flush()
  // Đường truyền máy khách tắt tiếng (không gửi gì nữa): tua đồng hồ của riêng máy chủ.
  s.b.send = () => {}
  await s.tick(1900)
  assert.equal(s.host.guestOnline, true, 'chưa tới ngưỡng')
  await s.tick(200)
  assert.equal(s.host.guestOnline, false)
  assert.equal(s.host.ports(0).M1, 0)
  assert.match(s.host.note ?? '', /chờ nối lại/)
  // Nối lại bằng đường truyền mới trước 10 s.
  const [a2, b2] = pair()
  const restarts: number[] = []
  s.guest.onStart = (seed) => restarts.push(seed)
  ;(s.host as unknown as { bind(t: Transport): void }).bind(a2)
  s.guest.rejoin(b2)
  await flush()
  assert.equal(s.host.guestOnline, true)
  assert.deepEqual(restarts, [s.host.seed], 'máy khách dựng lại trận cùng seed')
  s.guest.loaded()
  await flush()
  assert.equal(s.guest.stage, 'playing')
  assert.equal(s.host.resync, true, 'máy chủ gửi lại nhật ký từ đầu')
})

test('phòng: máy khách rớt quá 10 s ⇒ robot Xanh đứng yên tới hết trận (không hủy)', async () => {
  const s = setup()
  await toPlaying(s)
  // Máy khách tắt hẳn (không gửi, không chạy nữa); hub vẫn giữ kết nối của máy chủ.
  s.b.send = () => {}
  s.guest.tick = () => {}
  await s.tick(2100)
  assert.equal(s.host.guestGone, false)
  await s.tick(10_100)
  assert.equal(s.host.guestGone, true)
  assert.match(s.host.note ?? '', /đứng yên tới hết trận/)
  assert.equal(s.host.stage, 'playing')
})

test('phòng: máy chủ im lặng ⇒ máy khách thử nối lại; quá 10 s ⇒ Trận bị hủy', async () => {
  const s = setup()
  await toPlaying(s)
  let tries = 0
  s.guest.onReconnect = () => (tries++, s.guest.rejoinFailed())
  s.a.send = () => {}
  await s.tick(2100)
  assert.ok(s.guest.lostAt > 0)
  assert.match(s.guest.note ?? '', /đang nối lại/)
  for (let k = 0; k < 9; k++) await s.tick(1000)
  assert.ok(tries >= 5 && tries <= 11, `thử lại khoảng mỗi giây (${tries} lần)`)
  await s.tick(1500)
  assert.equal(s.guest.stage, 'closed')
  assert.match(s.guest.note ?? '', /Trận bị hủy/)
})
