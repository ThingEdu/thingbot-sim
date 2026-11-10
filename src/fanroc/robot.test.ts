import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody, V_MAX } from './robot.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import { BALL_R, HOLE, PEAK_Y } from './layout.ts'
import { localGripPoint, ROBOTS, type RobotConfig } from './robots.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }

/** Chạy `seconds` giây: robot nhận cổng rồi thế giới bước một bước, như vòng lặp trận. */
const drive = (w: FanrocWorld, r: RobotBody, ports: Partial<PortValues>, seconds: number) => {
  const p = { ...NEUTRAL, ...ports }
  for (let k = 0; k < Math.round(seconds / PHYSICS_DT); k++) {
    r.apply(p, PHYSICS_DT)
    w.step(PHYSICS_DT)
  }
}
const deg = (a: number) => (a * 180) / Math.PI
/** Robot ở hành lang giữa hai cặp núi (x = 0), mặt hướng −z: phía trước trống ~0.9 m. */
const corridor = async (cfg: RobotConfig = MAKER) => {
  const w = await FanrocWorld.create(1)
  const r = new RobotBody(w, cfg, 'red', 0)
  r.setPose({ x: 0, z: 0.9, yaw: 0 })
  return { w, r }
}

test('M1 = M2 = 60 trong 2 s: tiến thẳng về −z ≈ (60−20)/80 × V_MAX × 2 (± 15 %), yaw đổi < 3°', async () => {
  const { w, r } = await corridor()
  drive(w, r, { M1: 60, M2: 60 }, 2)
  const want = ((60 - 20) / 80) * V_MAX * 2
  const dz = 0.9 - r.pose.z
  assert.ok(Math.abs(dz - want) <= 0.15 * want, `tiến ${dz.toFixed(3)} m, mong ${want.toFixed(3)} m`)
  assert.ok(Math.abs(r.pose.x) < 0.02, `lệch ngang ${r.pose.x}`)
  assert.ok(Math.abs(deg(r.pose.yaw)) < 3, `yaw ${deg(r.pose.yaw)}°`)
})

test('M1 = M2 = 15 (vùng chết 20 %): đứng yên', async () => {
  const { w, r } = await corridor()
  drive(w, r, { M1: 15, M2: 15 }, 2)
  assert.ok(Math.hypot(r.pose.x, r.pose.z - 0.9) < 0.005, `trôi ${r.pose.x}, ${r.pose.z}`)
})

test('M1 = −50, M2 = 50: quay tại chỗ sang trái (yaw tăng), tâm dịch < 0.03 m', async () => {
  const { w, r } = await corridor()
  drive(w, r, { M1: -50, M2: 50 }, 1)
  assert.ok(Math.hypot(r.pose.x, r.pose.z - 0.9) < 0.03, `tâm dịch ${r.pose.x}, ${r.pose.z}`)
  assert.ok(r.pose.yaw > (30 * Math.PI) / 180, `yaw ${deg(r.pose.yaw)}°`)
})

test('Mecanum FL +60, FR −60, RL −60, RR +60: đi ngang sang phải, |Δz| < 0.05 m', async () => {
  const w = await FanrocWorld.create(1)
  const r = new RobotBody(w, { type: 'maker', drive: 'mecanum', actuator: 's360' }, 'red', 0)
  r.setPose({ x: -0.5, z: 1.0, yaw: 0 })
  drive(w, r, { M1: 60, M2: -60, M3: -60, M4: 60 }, 2)
  assert.ok(Math.abs(r.pose.z - 1.0) < 0.05, `Δz ${r.pose.z - 1.0}`)
  assert.ok(r.pose.x - -0.5 > 0.3, `Δx ${r.pose.x + 0.5}`)
})

/** Đặt bóng nằm giữa miệng hút của Xe Phân Loại (trước mũi xe ở z = 0.9 − l/2). Mẫu Maker không hút bóng. */
const ballAtMouth = (w: FanrocWorld, i: number) => {
  w.placeBall(i, { x: 0, y: BALL_R, z: 0.9 - ROBOTS.sort.size.l / 2 - 0.025 })
}
const SORT: RobotConfig = { type: 'sort', drive: 'diff2', actuator: 'tt' }

test('Hút: bóng trước mũi + M3 = 0 trong 1 s ⇒ không hút; M3 = 80 ⇒ stored.length === 1', async () => {
  const { w, r } = await corridor(SORT)
  ballAtMouth(w, 150)
  drive(w, r, {}, 1)
  assert.equal(r.stored.length, 0)
  assert.equal(w.balls[150].st, 'field')
  drive(w, r, { M3: 80 }, 0.2)
  assert.deepEqual(r.stored, [150])
  assert.equal(w.balls[150].st, 'held')
})

test('Hút M3 = 15 (vùng chết) ⇒ không hút', async () => {
  const { w, r } = await corridor(SORT)
  ballAtMouth(w, 150)
  drive(w, r, { M3: 15 }, 0.5)
  assert.equal(r.stored.length, 0)
})

test('Maker 4 bóng + S3 = 150 ⇒ sau 2 s hết bóng, 4 bóng về sân', async () => {
  const { w, r } = await corridor()
  for (let i = 0; i < 4; i++) {
    w.placeBall(i, { x: 1, y: BALL_R, z: 0.1 * i })
    assert.ok(r.take(i))
  }
  w.placeBall(6, { x: 1, y: BALL_R, z: 0.7 })
  assert.equal(r.take(6), false, 'đầy 4 bóng thì không nhận thêm')
  assert.equal(r.stored.length, 4)
  drive(w, r, { S3: 150 }, 2)
  assert.equal(r.stored.length, 0)
  for (let i = 0; i < 4; i++) assert.equal(w.balls[i].st, 'field')
})

test('Xe Ủi không có cửa xả S3 (R33): lệnh S3 = 150 không xả bóng đang giữ', async () => {
  const { w, r } = await corridor({ type: 'ui', drive: 'diff2', actuator: 'tt' })
  w.placeBall(0, { x: 1, y: BALL_R, z: 0 })
  assert.ok(r.take(0))
  drive(w, r, { S3: 150 }, 2)
  assert.deepEqual(r.stored, [0])
  assert.equal(w.balls[0].st, 'held')
})

test('Nâng/vươn M4 = 100: extend tăng 0.08 m/s, kẹp ở maxExtend, footprint dài thêm (Mẫu Maker: thêm về phía đuôi)', async () => {
  const { w, r } = await corridor()
  drive(w, r, { M4: 100 }, 1)
  assert.ok(Math.abs(r.extend - 0.08) < 0.005, `extend ${r.extend}`)
  drive(w, r, { M4: 100 }, 2)
  assert.equal(r.extend, ROBOTS.maker.maxExtend)
  const zs = r.footprint().map((c) => c.z)
  const len = Math.max(...zs) - Math.min(...zs)
  assert.ok(Math.abs(len - (ROBOTS.maker.size.l + ROBOTS.maker.maxExtend)) < 0.005, `dài ${len}`)
  assert.ok(r.backExtension > 0.12 && r.forwardExtension === 0, `trước ${r.forwardExtension} / sau ${r.backExtension}`)
  drive(w, r, { M4: -100 }, 3)
  assert.equal(r.extend, 0)
})

/** Đặt Maker sao cho điểm kẹp (giá cờ ở đuôi thanh răng: Mẫu Maker cắm cờ bằng đuôi) nằm ngay trên lỗ cờ Núi A. */
const overHoleA = async () => {
  const w = await FanrocWorld.create(1)
  const r = new RobotBody(w, MAKER, 'red', 0)
  const h = w.holeCentres()[0]
  // yaw π: mũi hướng +z, đuôi hướng −z về phía lỗ; thanh răng lùi hết (giá cờ ra sau đuôi).
  r.extend = ROBOTS.maker.maxExtend
  r.setPose({ x: h.x, z: h.z - localGripPoint(ROBOTS.maker, r.extend, 0).z, yaw: Math.PI })
  return { w, r, h }
}

test('Cờ: S2 null lúc đầu giữ cờ; kẹp ngay trên lỗ Núi A, S2 150 → 30 ⇒ onFlag(0)', async () => {
  const { r } = await overHoleA()
  const got: number[] = []
  r.onFlag = (m) => got.push(m)
  r.apply(NEUTRAL, PHYSICS_DT)
  assert.equal(r.hasFlag, true, 'S2 chưa ra lệnh thì vẫn giữ cờ')
  r.apply({ ...NEUTRAL, S2: 150 }, PHYSICS_DT)
  r.apply({ ...NEUTRAL, S2: 30 }, PHYSICS_DT)
  assert.deepEqual(got, [0])
  assert.equal(r.hasFlag, false)
  assert.equal(r.flagBody, null)
})

test('R16: lỗ cờ đang có bóng ⇒ không cắm, lastMessage báo, robot vẫn giữ cờ', async () => {
  const { w, r, h } = await overHoleA()
  w.placeBall(150, { x: h.x, y: PEAK_Y - HOLE.depth + BALL_R, z: h.z })
  const got: number[] = []
  r.onFlag = (m) => got.push(m)
  r.apply({ ...NEUTRAL, S2: 30 }, PHYSICS_DT)
  assert.deepEqual(got, [])
  assert.equal(r.lastMessage, 'Lỗ cờ đang có bóng')
  assert.equal(r.hasFlag, true)
  w.removeBall(150) // bóng được lấy khỏi lỗ: bước sau cắm được, thông báo tắt
  r.apply({ ...NEUTRAL, S2: 30 }, PHYSICS_DT)
  assert.deepEqual(got, [0])
  assert.equal(r.lastMessage, null)
  assert.equal(r.hasFlag, false)
})

test('Cờ mở chỗ khác ⇒ rơi xuống sàn thành vật dynamic; kẹp đóng lại gần cờ ⇒ nhặt lại', async () => {
  const { w, r } = await corridor()
  // Mẫu Maker giữ cờ trên nóc: lùi thanh răng ra sau đuôi trước, cờ mới rơi xuống sàn (không rơi lên nóc xe).
  drive(w, r, { M4: 100, S2: 150 }, 3)
  drive(w, r, { S2: 30 }, 1)
  assert.equal(r.hasFlag, false)
  assert.ok(r.flagBody, 'cờ rơi phải có body')
  assert.ok(r.flagBody!.translation().y < 0.1, `cờ chưa chạm sàn: y ${r.flagBody!.translation().y}`)
  drive(w, r, { S2: 150 }, 0.1)
  assert.equal(r.hasFlag, true)
  assert.equal(r.flagBody, null)
})

test('Xe Phân Loại: S2 < 90 hút vào ngăn cam, ≥ 90 ngăn xanh; S3 xả đúng ngăn đang chọn', async () => {
  const { w, r } = await corridor({ type: 'sort', drive: 'diff2', actuator: 'tt' })
  const mouth = (i: number) => w.placeBall(i, { x: 0, y: BALL_R, z: 0.9 - ROBOTS.sort.size.l / 2 - 0.025 })
  mouth(10)
  drive(w, r, { M3: 80, S2: 30 }, 0.2)
  mouth(150)
  drive(w, r, { M3: 80, S2: 150 }, 0.2)
  assert.deepEqual(r.compartments, { o: [10], g: [150] })
  assert.deepEqual([...r.stored].sort((a, b) => a - b), [10, 150])
  drive(w, r, { S2: 150, S3: 150 }, 1)
  assert.deepEqual(r.compartments, { o: [10], g: [] })
  assert.deepEqual(r.stored, [10])
  assert.equal(w.balls[150].st, 'field')
})

test('Xe Ủi đẩy bóng: bóng trước mũi bị đẩy đi theo xe', async () => {
  const { w, r } = await corridor({ type: 'ui', drive: 'diff2', actuator: 'tt' })
  w.placeBall(150, { x: 0, y: BALL_R, z: 0.6 })
  drive(w, r, { M1: 80, M2: 80 }, 1.5)
  const q = w.balls[150].body!.translation()
  assert.ok(q.z < 0.6 - 0.2, `bóng chỉ tới z ${q.z}`)
  assert.equal(r.stored.length, 0, 'Xe Ủi không có cơ cấu hút')
})

test('Lao vào rào và vào núi: bị chặn, không leo lên (thân vẫn sát sàn)', async () => {
  const w = await FanrocWorld.create(1)
  const r = new RobotBody(w, MAKER, 'red', 0)
  r.setPose({ x: -0.376, z: 0.9, yaw: 0 }) // thẳng hướng Núi A
  drive(w, r, { M1: 100, M2: 100 }, 3)
  const y = r.body.translation().y
  assert.ok(Math.abs(y) < 0.01, `thân lên tới y ${y}`)
  assert.ok(r.pose.z > 0.70, `xuyên vào núi tới z ${r.pose.z}`)
  r.setPose({ x: 0, z: 0.9, yaw: Math.PI }) // quay lưng về núi, mũi hướng +z ra rào gần
  drive(w, r, { M1: 100, M2: 100 }, 2)
  assert.ok(r.pose.z < 1.2 - ROBOTS.maker.size.l / 2 + 0.01, `xuyên rào tới z ${r.pose.z}`)
})

for (const type of ['maker', 'co'] as const) {
  // Mẫu Maker cắm cờ bằng đuôi (thanh răng lùi ra sau): lùi đuôi vào núi; Xe Cắm Cờ tiến mũi vào.
  const back = type === 'maker'
  test(`Cờ (${ROBOTS[type].name}): ${back ? 'lùi đuôi' : 'lái thẳng'} vào Núi A theo trục lỗ, vươn + tay S1, mở kẹp ⇒ onFlag(0) (không dịch chuyển tức thời)`, async () => {
    const w = await FanrocWorld.create(1)
    const r = new RobotBody(w, { type, drive: 'diff2', actuator: 'tt' }, 'red', 0)
    const h = w.holeCentres()[0]
    r.setPose({ x: h.x, z: 0.9, yaw: back ? Math.PI : 0 })
    const got: number[] = []
    r.onFlag = (m) => got.push(m)
    const v = back ? -100 : 100
    drive(w, r, { M1: v, M2: v, M4: 100, S1: 180, S2: 150 }, 4)
    assert.equal(r.hasFlag, true)
    const g = r.gripPoint()
    assert.ok(g.y > PEAK_Y, `điểm kẹp thấp hơn đỉnh núi: ${g.y}`)
    drive(w, r, { S1: 180, S2: 30 }, 0.1)
    assert.deepEqual(got, [0], `điểm kẹp cách lỗ ${Math.hypot(g.x - h.x, g.z - h.z).toFixed(3)} m`)
  })
}

test('Tay S1 của Xe Cắm Cờ vươn tới trước: footprint dài thêm arm.reach, S1 null giữ nguyên', async () => {
  const { w, r } = await corridor({ type: 'co', drive: 'diff2', actuator: 'tt' })
  drive(w, r, { S1: 180 }, 0.05)
  drive(w, r, {}, 0.05)
  const zs = r.footprint().map((c) => c.z)
  const len = Math.max(...zs) - Math.min(...zs)
  assert.ok(Math.abs(len - (ROBOTS.co.size.l + ROBOTS.co.arm!.reach)) < 0.005, `dài ${len}`)
})

test('Khoá lật: đâm chéo vào cạnh núi, thân không nghiêng (quaternion x, z ≈ 0)', async () => {
  const w = await FanrocWorld.create(1)
  const r = new RobotBody(w, MAKER, 'red', 0)
  r.setPose({ x: -0.05, z: 0.85, yaw: 0.6 }) // mũi hướng chéo về góc Núi A
  let tilt = 0
  for (let k = 0; k < 180; k++) {
    r.apply({ ...NEUTRAL, M1: 100, M2: 100 }, PHYSICS_DT)
    w.step(PHYSICS_DT)
    const q = r.body.rotation()
    tilt = Math.max(tilt, Math.abs(q.x), Math.abs(q.z))
  }
  assert.ok(tilt < 1e-3, `nghiêng ${tilt}`)
})

test('Maker Nâng: S1 = 180° ⇒ bóng ra ở cửa lồng nâng (130 mm trước mũi, cao 210 mm), mũi xe dài thêm 130 mm', async () => {
  const { w, r } = await corridor({ type: 'makerLift', drive: 'diff2', actuator: 'tt' })
  const low = r.releasePoint()
  drive(w, r, { S1: 180 }, 0.1)
  const hi = r.releasePoint()
  const t = r.body.translation()
  const ahead = (p: { x: number; z: number }) => Math.hypot(p.x - t.x, p.z - t.z)
  assert.ok(Math.abs(ahead(hi) - (0.15 + 0.13)) < 0.005, `cửa nâng cách tâm ${ahead(hi)} (${JSON.stringify(hi)}, tâm ${JSON.stringify(t)})`)
  assert.ok(Math.abs(hi.y - 0.21) < 0.003 && Math.abs(low.y - 0.093) < 0.003, `${hi.y} ${low.y}`) // gốc thân sát sàn (lúc đặt cao 2 mm rồi lắng xuống)
  assert.ok(Math.abs(r.forwardExtension - 0.13) < 1e-6)
})

test('Maker Hút: con lăn M3 hút bóng trước mũi vào lồng, 8 bóng là đầy', async () => {
  const { w, r } = await corridor({ type: 'makerIntake', drive: 'diff2', actuator: 'tt' })
  w.placeBall(150, { x: 0, y: BALL_R, z: 0.9 - ROBOTS.makerIntake.size.l / 2 - 0.025 })
  drive(w, r, { M3: 80 }, 0.2)
  assert.deepEqual(r.stored, [150])
  for (let i = 0; i < 8; i++) {
    w.placeBall(i, { x: 1, y: BALL_R, z: 0.1 * i })
    r.take(i)
  }
  assert.equal(r.stored.length, 8)
})

test('Mẫu Maker: cửa ra ở đuôi (anh Tuấn 10/11) — điểm xả 100 mm sau tâm xe, bóng lăn ra sau; Maker Nâng vẫn xả ở mũi', async () => {
  const { r } = await corridor()
  const t = r.body.translation()
  const p = r.releasePoint()
  // yaw 0: mũi hướng −z ⇒ đuôi ở +z.
  assert.ok(Math.abs(p.z - t.z - 0.1) < 0.003 && Math.abs(p.x - t.x) < 1e-6, `điểm xả ${JSON.stringify(p)}, tâm ${JSON.stringify(t)}`)
  assert.ok(Math.abs(p.y - 0.093) < 0.003)
  assert.equal(r.forwardExtension, 0)
  const lift = (await corridor({ type: 'makerLift', drive: 'diff2', actuator: 'tt' })).r
  const tl = lift.body.translation()
  assert.ok(lift.releasePoint().z < tl.z, 'Maker Nâng xả ở mũi (−z)')
})
