import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FanrocWorld } from './world.ts'
import { RobotBody } from './robot.ts'
import { HumanPlayer, type HpContext } from './human.ts'
import { ZONES, BALL_R } from './layout.ts'
import type { RobotConfig } from './robots.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const CO: RobotConfig = { type: 'co', drive: 'diff2', actuator: 'tt' }
const SORT: RobotConfig = { type: 'sort', drive: 'diff2', actuator: 'tt' }
const UI: RobotConfig = { type: 'ui', drive: 'diff2', actuator: 'tt' }

const mid = (r: { x0: number; x1: number; z0: number; z1: number }) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })
const ball = (w: FanrocWorld, i: number, x: number, z: number) => w.placeBall(i, { x, y: BALL_R, z })
const ctx = (world: FanrocWorld, robots: RobotBody[], over: Partial<HpContext> = {}): HpContext =>
  ({ world, robots, phase: 'play', endgame: false, ...over })
/** Robot đỏ nằm trọn trong Khu Tiếp Tế đỏ. */
const inLoad = (r: RobotBody) => {
  const c = mid(ZONES.load.red)
  r.setPose({ x: c.x, z: c.z, yaw: 0 })
}
/** Robot đỏ ở giữa sân, xa mọi khu. */
const away = (r: RobotBody) => r.setPose({ x: 0, z: 0, yaw: 0 })

test('pick: lấy đúng bóng trong Khu Xuất Phát, bóng ngoài vùng không bị lấy, mỗi lần một bóng', async () => {
  const w = await FanrocWorld.create(1)
  const s = mid(ZONES.start.red)
  ball(w, 0, s.x, s.z) // cam trong vùng
  ball(w, 150, s.x + 0.05, s.z) // xanh trong vùng
  ball(w, 1, 0, 0) // cam ngoài vùng
  const hp = new HumanPlayer('red')
  const events: string[] = []
  hp.onEvent = (t) => events.push(t)
  assert.equal(hp.press('pick', ctx(w, [])), null)
  assert.equal(w.balls[0].st, 'tray')
  assert.equal(w.balls[150].st, 'field')
  assert.deepEqual(hp.tray, { o: 1, g: 0 })
  assert.deepEqual(events, ['Human Player nhặt bóng cam'])
  assert.equal(hp.press('pick', ctx(w, [])), null)
  assert.deepEqual(hp.tray, { o: 1, g: 1 })
  assert.equal(w.balls[1].st, 'field')
  assert.equal(hp.press('pick', ctx(w, [])), 'Không có bóng trong Khu Xuất Phát')
  // Khu của liên minh khác không nhặt được.
  const b = ZONES.start.blue
  ball(w, 2, (b.x0 + b.x1) / 2 + 0.2, (b.z0 + b.z1) / 2)
  assert.equal(new HumanPlayer('red').press('pick', ctx(w, [])), 'Không có bóng trong Khu Xuất Phát')
})

test('load: từ chối khi robot ngoài Khu Tiếp Tế, nhận khi một góc chạm ô', async () => {
  const w = await FanrocWorld.create(1)
  const s = mid(ZONES.start.red)
  ball(w, 0, s.x, s.z)
  const hp = new HumanPlayer('red')
  hp.press('pick', ctx(w, []))
  const r = new RobotBody(w, MAKER, 'red', 0)
  away(r)
  assert.equal(hp.press('load', ctx(w, [r])), 'Robot chưa vào Khu Tiếp Tế')
  assert.equal(r.stored.length, 0)
  // Chỉ một góc mũi xe lọt vào ô: tâm xe ngoài ô nhưng góc trong.
  const L = ZONES.load.red
  r.setPose({ x: L.x1 + 0.1, z: (L.z0 + L.z1) / 2, yaw: Math.PI / 2 }) // mũi xe hướng −x
  const inside = r.footprint().filter((p) => p.x <= L.x1 && p.x >= L.x0 && p.z >= L.z0 && p.z <= L.z1)
  assert.ok(inside.length > 0 && inside.length < 4, `${inside.length} góc trong ô`)
  const events: string[] = []
  hp.onEvent = (t) => events.push(t)
  assert.equal(hp.press('load', ctx(w, [r])), null)
  assert.deepEqual(r.stored, [0])
  assert.equal(w.balls[0].st, 'held')
  assert.deepEqual(hp.tray, { o: 0, g: 0 })
  assert.deepEqual(events, ['Robot 1 nhận bóng cam'])
})

test('load: End Game + robot parked => từ chối; ngoài End Game thì vẫn nạp được', async () => {
  const w = await FanrocWorld.create(1)
  const s = mid(ZONES.start.red)
  ball(w, 0, s.x, s.z)
  const hp = new HumanPlayer('red')
  hp.press('pick', ctx(w, []))
  const r = new RobotBody(w, MAKER, 'red', 0)
  inLoad(r)
  r.parked = true
  assert.equal(hp.press('load', ctx(w, [r], { endgame: true })), 'Robot đã về Vùng Bảo Vệ')
  assert.equal(r.stored.length, 0)
  assert.equal(hp.press('load', ctx(w, [r], { endgame: false })), null)
})

test('load: khay rỗng, màu hết, robot đầy, robot khác liên minh', async () => {
  const w = await FanrocWorld.create(1)
  const hp = new HumanPlayer('red')
  const r = new RobotBody(w, MAKER, 'red', 0)
  inLoad(r)
  assert.equal(hp.press('load', ctx(w, [r])), 'Khay hết bóng cam')
  hp.press('green', ctx(w, [r]))
  assert.equal(hp.color, 'g')
  assert.equal(hp.press('load', ctx(w, [r])), 'Khay hết bóng xanh')
  // Đầy: Mẫu Maker chứa 4 (tay vòng, anh Tuấn chốt 06/11).
  const s = mid(ZONES.start.red)
  for (let k = 0; k < 5; k++) ball(w, 150 + k, s.x + (k - 2) * 0.03, s.z)
  for (let k = 0; k < 5; k++) hp.press('pick', ctx(w, []))
  for (let k = 0; k < 4; k++) assert.equal(hp.press('load', ctx(w, [r])), null)
  assert.equal(hp.press('load', ctx(w, [r])), 'Robot đầy bóng')
  assert.deepEqual(hp.tray, { o: 0, g: 1 }) // bóng bị từ chối vẫn còn trong khay
  // Robot liên minh khác không được nạp dù đứng trong khu.
  const other = new RobotBody(w, MAKER, 'blue', 0)
  const c = mid(ZONES.load.red)
  other.setPose({ x: c.x, z: c.z, yaw: 0 })
  r.stored.length = 0
  away(r)
  assert.equal(hp.press('load', ctx(w, [r, other])), 'Robot chưa vào Khu Tiếp Tế')
})

test('load: hai robot trong khu => robot đầu tiên theo thứ tự ctx.robots, còn chỗ', async () => {
  const w = await FanrocWorld.create(1)
  const hp = new HumanPlayer('red')
  hp.color = 'g'
  const s = mid(ZONES.start.red)
  for (let k = 0; k < 2; k++) ball(w, 150 + k, s.x + k * 0.05, s.z)
  hp.press('pick', ctx(w, []))
  hp.press('pick', ctx(w, []))
  const a = new RobotBody(w, MAKER, 'red', 0)
  const b = new RobotBody(w, MAKER, 'red', 1)
  inLoad(a)
  inLoad(b)
  assert.equal(hp.press('load', ctx(w, [b, a])), null)
  assert.equal(b.stored.length, 1)
  assert.equal(a.stored.length, 0)
})

test('load (R33): Xe Ủi không có cửa xả ⇒ từ chối "Robot không có cửa xả"; đồng đội có S3 trong khu vẫn nhận', async () => {
  const w = await FanrocWorld.create(1)
  const hp = new HumanPlayer('red')
  const s = mid(ZONES.start.red)
  for (let k = 0; k < 2; k++) ball(w, k, s.x + k * 0.05, s.z)
  hp.press('pick', ctx(w, []))
  hp.press('pick', ctx(w, []))
  const ui = new RobotBody(w, UI, 'red', 0)
  inLoad(ui)
  assert.equal(hp.press('load', ctx(w, [ui])), 'Robot không có cửa xả')
  assert.equal(ui.stored.length, 0)
  assert.deepEqual(hp.tray, { o: 2, g: 0 })
  // Tự động cũng không nạp cho Xe Ủi.
  hp.auto(ctx(w, [ui]), 0.8)
  assert.equal(ui.stored.length, 0)
  // Mẫu Maker (có S3) cùng trong khu, đứng sau trong danh sách ⇒ Maker nhận.
  const mk = new RobotBody(w, MAKER, 'red', 1)
  inLoad(mk)
  assert.equal(hp.press('load', ctx(w, [ui, mk])), null)
  assert.equal(mk.stored.length, 1)
  assert.equal(ui.stored.length, 0)
})

test('Xe Phân Loại: bóng vào đúng ngăn theo màu', async () => {
  const w = await FanrocWorld.create(1)
  const hp = new HumanPlayer('red')
  const s = mid(ZONES.start.red)
  ball(w, 150, s.x, s.z)
  hp.press('pick', ctx(w, []))
  const r = new RobotBody(w, SORT, 'red', 0)
  inLoad(r)
  hp.press('green', ctx(w, [r]))
  assert.equal(hp.press('load', ctx(w, [r])), null)
  assert.deepEqual(r.compartments, { o: [], g: [150] })
})

test('press ở giai đoạn xả / hết giờ', async () => {
  const w = await FanrocWorld.create(1)
  const hp = new HumanPlayer('red')
  assert.equal(hp.press('pick', ctx(w, [], { phase: 'release' })), 'Chưa được nạp bóng')
  assert.equal(hp.press('load', ctx(w, [], { phase: 'end' })), 'Hết giờ')
  assert.equal(hp.press('green', ctx(w, [], { phase: 'end' })), 'Hết giờ')
  assert.equal(hp.color, 'o')
})

test('auto: mỗi 0.8 s nhặt một bóng, chưa đủ 0.8 s thì chưa làm gì', async () => {
  const w = await FanrocWorld.create(1)
  const hp = new HumanPlayer('red')
  const s = mid(ZONES.start.red)
  for (let k = 0; k < 3; k++) ball(w, k, s.x + k * 0.05, s.z)
  const c = ctx(w, [])
  hp.auto(c, 0.5)
  assert.deepEqual(hp.tray, { o: 0, g: 0 })
  hp.auto(c, 0.4)
  assert.deepEqual(hp.tray, { o: 1, g: 0 })
  hp.auto(c, 0.8)
  hp.auto(c, 0.8)
  assert.deepEqual(hp.tray, { o: 3, g: 0 })
})

/** Khay có 3 cam + 2 xanh (nhặt bằng press), robot đỏ đứng trong Khu Tiếp Tế. */
const stocked = async (cfg: RobotConfig) => {
  const w = await FanrocWorld.create(1)
  const hp = new HumanPlayer('red')
  const s = mid(ZONES.start.red)
  for (let k = 0; k < 3; k++) ball(w, k, s.x + k * 0.05, s.z)
  for (let k = 0; k < 2; k++) ball(w, 150 + k, s.x + k * 0.05, s.z + 0.05)
  for (let k = 0; k < 5; k++) hp.press('pick', ctx(w, []))
  assert.deepEqual(hp.tray, { o: 3, g: 2 })
  const r = new RobotBody(w, cfg, 'red', 0)
  inLoad(r)
  return { w, hp, r }
}

test('auto: Xe Cắm Cờ (hpLoad) nhận xanh trước, rồi cam', async () => {
  const { w, hp, r } = await stocked(CO)
  for (let k = 0; k < 5; k++) hp.auto(ctx(w, [r]), 0.8)
  assert.deepEqual(r.stored.map((i) => w.balls[i].color), ['g', 'g', 'o', 'o', 'o'])
  assert.deepEqual(hp.tray, { o: 0, g: 0 })
})

test('auto: robot thường nhận màu khay có nhiều hơn (hoà thì cam); deterministic', async () => {
  const run = async () => {
    const { w, hp, r } = await stocked(MAKER)
    for (let k = 0; k < 4; k++) hp.auto(ctx(w, [r]), 0.8)
    return r.stored.map((i) => w.balls[i].color).join('')
  }
  assert.equal(await run(), 'oogo') // khay 3o2g: o, (2o2g hoà) o, (1o2g) g, (1o1g hoà) o — Mẫu Maker đầy ở 4
  assert.equal(await run(), await run())
})

test('auto (P04–P07): tự nhặt bóng trong Khu Xuất Phát rồi nạp cho robot ở Khu Tiếp Tế; End Game + đã đỗ ⇒ không nạp', async () => {
  const w = await FanrocWorld.create(1)
  const s = mid(ZONES.start.red)
  for (let k = 0; k < 2; k++) ball(w, 150 + k, s.x + k * 0.05, s.z)
  const hp = new HumanPlayer('red')
  const events: string[] = []
  hp.onEvent = (t) => events.push(t)
  const r = new RobotBody(w, MAKER, 'red', 0)
  inLoad(r)
  hp.auto(ctx(w, [r]), 0.8)
  assert.deepEqual(r.stored, [150])
  assert.deepEqual(events, ['Human Player nhặt bóng xanh', 'Robot 1 nhận bóng xanh'])
  r.parked = true
  hp.auto(ctx(w, [r], { endgame: true }), 0.8)
  assert.deepEqual(r.stored, [150], 'đã đỗ trong End Game: không nạp')
  assert.deepEqual(hp.tray, { o: 0, g: 1 })
  // Giai đoạn xả bóng: không nhặt.
  const hp2 = new HumanPlayer('red')
  ball(w, 152, s.x - 0.05, s.z)
  hp2.auto(ctx(w, [], { phase: 'release' }), 0.8)
  assert.deepEqual(hp2.tray, { o: 0, g: 0 })
})
