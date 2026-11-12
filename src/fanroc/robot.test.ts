import { test } from 'node:test'
import assert from 'node:assert/strict'
import RAPIER from '@dimforge/rapier3d-compat'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody, V_MAX } from './robot.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import { BALL_R, FIELD, HOLE, PEAK_Y } from './layout.ts'
import { localGripPoint, portMap, ROBOTS, ruleChecks, type RobotConfig } from './robots.ts'

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

test('Nâng/vươn M4 = 100: extend tăng 0.08 m/s, kẹp ở maxExtend, footprint dài thêm (Mẫu Maker: thanh răng ra mũi)', async () => {
  const { w, r } = await corridor()
  drive(w, r, { M4: 100 }, 1)
  assert.ok(Math.abs(r.extend - 0.08) < 0.005, `extend ${r.extend}`)
  drive(w, r, { M4: 100 }, 2)
  assert.equal(r.extend, ROBOTS.maker.maxExtend)
  const zs = r.footprint().map((c) => c.z)
  const len = Math.max(...zs) - Math.min(...zs)
  assert.ok(Math.abs(len - (ROBOTS.maker.size.l + ROBOTS.maker.maxExtend)) < 0.005, `dài ${len}`)
  assert.ok(r.forwardExtension > 0.12 && r.backExtension === 0, `trước ${r.forwardExtension} / sau ${r.backExtension}`)
  // Luật V4: thanh răng không còn giá cờ nhưng vẫn là cơ cấu thật — tính vào mở rộng (HUD / ruleChecks).
  const ext = r.extension
  assert.ok(Math.abs(ext - (0.2 - 0.039)) < 1e-6, `mở rộng theo luật ${ext}`)
  assert.ok(ruleChecks(MAKER, ext).some((c) => c.text === 'Mở rộng một chiều: 461 mm / 500 mm'))
  drive(w, r, { M4: -100 }, 3)
  assert.equal(r.extend, 0)
  assert.equal(r.extension, 0)
})

test('Maker Nâng / Hút / Pro: thanh răng M4 lùi ra sau đuôi — footprint vươn ra sau thân, mở rộng > 0', async () => {
  for (const type of ['makerLift', 'makerIntake', 'makerPro'] as const) {
    const { w, r } = await corridor({ type, drive: ROBOTS[type].drives[0], actuator: 'tt' })
    const m4 = portMap({ type, drive: ROBOTS[type].drives[0], actuator: 'tt' }).lift!
    drive(w, r, { [m4]: m4.startsWith('S') ? 180 : 100 } as Partial<PortValues>, 4)
    assert.equal(r.extend, ROBOTS[type].maxExtend, type)
    const t = r.body.translation()
    // yaw 0: mũi hướng −z ⇒ đuôi ở +z.
    const back = Math.max(...r.footprint().map((c) => c.z)) - t.z
    assert.ok(Math.abs(back - (ROBOTS[type].size.l / 2 + 0.2)) < 0.005, `${type}: đuôi footprint ${back}`)
    assert.ok(r.backExtension > 0.19 && r.forwardExtension === 0, `${type}: sau ${r.backExtension}`)
    assert.ok(r.extension > 0.15, `${type}: mở rộng ${r.extension}`)
  }
})

const CO: RobotConfig = { type: 'co', drive: 'diff2', actuator: 'tt' }

/** Đặt Xe Cắm Cờ sao cho điểm kẹp nằm ngay trên lỗ cờ Núi A (luật V4: họ Maker không còn cờ). */
const overHoleA = async () => {
  const w = await FanrocWorld.create(1)
  const r = new RobotBody(w, CO, 'red', 0)
  const h = w.holeCentres()[0]
  // yaw π: mũi hướng +z — z tâm xe = z lỗ − z điểm kẹp theo trục xe.
  r.extend = ROBOTS.co.maxExtend
  r.setPose({ x: h.x, z: h.z - localGripPoint(ROBOTS.co, r.extend, 0).z, yaw: Math.PI })
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
  const { w, r } = await corridor(CO)
  drive(w, r, { S2: 150 }, 0.1)
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

for (const type of ['co'] as const) {
  // Luật V4: chỉ Xe Cắm Cờ còn cắm cờ, tiến mũi vào.
  const back = false
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

test('Tay S1 của Xe Cắm Cờ vươn tới trước: footprint dài thêm phần điểm kẹp nhô khỏi mũi (flagGrip + arm.reach = 0,19, R166), S1 null giữ nguyên', async () => {
  const { w, r } = await corridor({ type: 'co', drive: 'diff2', actuator: 'tt' })
  drive(w, r, { S1: 180 }, 0.05)
  drive(w, r, {}, 0.05)
  const zs = r.footprint().map((c) => c.z)
  const len = Math.max(...zs) - Math.min(...zs)
  assert.ok(Math.abs(len - (ROBOTS.co.size.l + ROBOTS.co.flagGrip! + ROBOTS.co.arm!.reach)) < 0.005, `dài ${len}`)
  assert.ok(Math.abs(ROBOTS.co.flagGrip! + ROBOTS.co.arm!.reach - 0.19) < 1e-9, 'duỗi hết điểm kẹp phải ở mũi + 0,19 như trước')
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

test('Luật V4: họ Maker không có cờ — hasFlag false, S2 (móc) không làm rơi cờ nào', async () => {
  for (const type of ['maker', 'makerLift', 'makerIntake', 'makerPro'] as const) {
    const { w, r } = await corridor({ type, drive: ROBOTS[type].drives[0], actuator: 'tt' })
    assert.equal(r.hasFlag, false, type)
    drive(w, r, { S2: 180 }, 0.1)
    drive(w, r, { S2: 0 }, 0.1)
    assert.equal(r.flagBody, null, type)
  }
})

// ---------- Leo Thang Cứu Hỏa (luật V4) ----------
/** Mẫu Maker đứng dưới thanh Đỏ ở chỗ bám s, quay theo thanh (mũi từ đầu rào sang đầu Hộp Phân Phối). */
const underBar = async (s = 0.2, cfg: RobotConfig = MAKER, dyaw = 0) => {
  const { barYaw, pointAt } = await import('./ladder.ts')
  const w = await FanrocWorld.create(1, { balls: false })
  const r = new RobotBody(w, cfg, 'red', 0)
  const p = pointAt('red', s)
  r.setPose({ x: p.x, z: p.z, yaw: barYaw('red') + dyaw })
  return { w, r }
}

test('Móc S2 của Mẫu Maker: giơ 180° rồi hạ 0° dưới đoạn Đất ⇒ treo Đất, thân rủ ở y = HOOK.hangY, kinematic, quay theo thanh', async () => {
  const { HOOK, barYaw } = await import('./ladder.ts')
  const { w, r } = await underBar(0.2, MAKER, 0.4) // đứng lệch hướng thanh 0,4 rad: bám vào thì quay theo thanh
  drive(w, r, { S2: 180 }, PHYSICS_DT)
  assert.deepEqual(r.climbLevel, { level: 'contact', bar: 'red' })
  drive(w, r, { S2: 0 }, PHYSICS_DT)
  assert.deepEqual(r.climbLevel, { level: 'ground', bar: 'red' })
  assert.ok(Math.abs(r.body.translation().y - HOOK.hangY) < 1e-6, `y ${r.body.translation().y}`)
  assert.equal(r.body.bodyType(), RAPIER.RigidBodyType.KinematicPositionBased)
  assert.ok(Math.abs(r.pose.yaw - barYaw('red')) < 1e-6, `yaw ${r.pose.yaw}`)
  // Không ra lệnh móc (null) vẫn treo; bánh đứng yên thì không trượt, không rơi.
  const before = r.climb.s
  drive(w, r, {}, 1)
  assert.deepEqual(r.climbLevel, { level: 'ground', bar: 'red' })
  assert.equal(r.climb.s, before)
  assert.ok(Math.abs(r.body.translation().y - HOOK.hangY) < 1e-6)
  assert.ok(Math.abs(r.pose.yaw - barYaw('red')) < 1e-6, `treo 1 s rồi yaw ${r.pose.yaw}`)
})

test('Đang treo: M1 = M2 = 255 trong 7 s trượt sang Nước (≈ 0,15 m/s, dừng ở đầu đoạn trong sân); setPose(START) về sàn, thân dynamic', async () => {
  const { HOOK, ladderLen, pointAt } = await import('./ladder.ts')
  const { START_POSES } = await import('./layout.ts')
  // Thanh theo CAD lắp sân: Mẫu Maker bám được ở 0,320…vạch 0,451.
  const { w, r } = await underBar(0.4)
  drive(w, r, { S2: 180 }, PHYSICS_DT)
  drive(w, r, { S2: 0 }, PHYSICS_DT)
  drive(w, r, { M1: 255, M2: 255 }, 1)
  assert.ok(Math.abs(r.climb.s - (0.4 + HOOK.slideV)) < 0.01, `1 s trượt tới s = ${r.climb.s}`)
  const at = pointAt('red', r.climb.s)
  assert.ok(Math.hypot(r.pose.x - at.x, r.pose.z - at.z) < 0.01, 'thân đi theo chỗ bám')
  drive(w, r, { M1: 255, M2: 255 }, 6)
  assert.deepEqual(r.climbLevel, { level: 'water', bar: 'red' })
  assert.ok(Math.abs(r.climb.s - r.slideRange('red').max) < 1e-6 && r.climb.s < ladderLen('red') - HOOK.end, `s ${r.climb.s}`)
  assert.ok(Math.abs(r.body.translation().y - HOOK.hangY) < 1e-6)
  r.setPose(START_POSES.red[0])
  assert.equal(r.climb.mode, 'floor')
  assert.equal(r.body.bodyType(), RAPIER.RigidBodyType.Dynamic)
  assert.deepEqual(r.climbLevel, { level: 'none', bar: null })
  drive(w, r, { M1: 60, M2: 60 }, 0.5)
  assert.ok(Math.hypot(r.pose.x - START_POSES.red[0].x, r.pose.z - START_POSES.red[0].z) > 0.05, 'về sàn lái được như thường')
  assert.ok(Math.abs(r.body.translation().y) < 0.01)
})

test('Đang treo mà giơ móc lại ⇒ rơi xuống sàn (dynamic), phải bám lại từ Đất', async () => {
  const { w, r } = await underBar()
  drive(w, r, { S2: 180 }, PHYSICS_DT)
  drive(w, r, { S2: 0 }, PHYSICS_DT)
  drive(w, r, { M1: 100, M2: 100 }, 3) // sang Nước
  assert.equal(r.climbLevel.level, 'water')
  drive(w, r, { S2: 180 }, 1)
  assert.equal(r.climb.mode, 'floor')
  assert.equal(r.body.bodyType(), RAPIER.RigidBodyType.Dynamic)
  assert.ok(Math.abs(r.body.translation().y) < 0.01, `chưa rơi xuống sàn: y ${r.body.translation().y}`)
  assert.equal(r.climbLevel.level, 'contact', 'móc vẫn giơ dưới thanh: chạm')
  drive(w, r, { S2: 0 }, PHYSICS_DT)
  assert.equal(r.climb.mode, 'floor', 'hạ móc dưới đoạn Nước không bám được')
})

test('Móc theo RobotDef.hook: Xe Cắm Cờ S4, Xe Phân Loại S1, Xe Ủi S2 — cổng khác không kéo robot lên', async () => {
  for (const [type, port, wrong] of [['co', 'S4', 'S2'], ['sort', 'S1', 'S2'], ['ui', 'S2', 'S1']] as const) {
    const { w, r } = await underBar(0.2, { type, drive: 'diff2', actuator: 'tt' })
    drive(w, r, { [wrong]: 180 } as Partial<PortValues>, PHYSICS_DT)
    drive(w, r, { [wrong]: 0 } as Partial<PortValues>, PHYSICS_DT)
    assert.equal(r.climb.mode, 'floor', `${type}: ${wrong} không phải móc`)
    drive(w, r, { [port]: 180 } as Partial<PortValues>, PHYSICS_DT)
    drive(w, r, { [port]: 0 } as Partial<PortValues>, PHYSICS_DT)
    assert.deepEqual(r.climbLevel, { level: 'ground', bar: 'red' }, `${type}: móc ${port}`)
  }
})

test('peers: robot cùng trận đang treo chặn chỗ bám (khoảng cách HOOK.gap); robot thứ ba không bám được thanh đã có 2 robot', async () => {
  const { HOOK, barYaw, pointAt } = await import('./ladder.ts')
  const w = await FanrocWorld.create(1, { balls: false })
  const bots = [0, 1, 2].map((k) => new RobotBody(w, MAKER, k ? 'blue' : 'red', (k % 2) as 0 | 1))
  for (const b of bots) b.peers = bots
  const hangAt = (r: RobotBody, s: number) => {
    const p = pointAt('red', s)
    r.setPose({ x: p.x, z: p.z, yaw: barYaw('red') })
    r.apply({ ...NEUTRAL, S2: 180 }, PHYSICS_DT)
    r.apply({ ...NEUTRAL, S2: 0 }, PHYSICS_DT)
  }
  // Thanh theo CAD lắp sân: đoạn Đất bám được của Mẫu Maker chỉ 0,320…0,451 — robot 0 bám 0,4 rồi trượt đi 2 s.
  hangAt(bots[0], 0.4)
  for (let k = 0; k < 120; k++) bots[0].apply({ ...NEUTRAL, M1: 100, M2: 100 }, PHYSICS_DT) // tới 0,70
  hangAt(bots[1], 0.35)
  assert.equal(bots[1].climb.mode, 'hang')
  // Robot 1 tiến về phía robot 0: dừng cách HOOK.gap.
  for (let k = 0; k < 120; k++) bots[1].apply({ ...NEUTRAL, M1: 100, M2: 100 }, PHYSICS_DT)
  assert.ok(Math.abs(bots[0].climb.s - bots[1].climb.s - HOOK.gap) < 1e-6, `${bots[0].climb.s} − ${bots[1].climb.s}`)
  hangAt(bots[2], 0.43)
  assert.equal(bots[2].climb.mode, 'floor', 'thanh đã có 2 robot')
  assert.equal(bots[2].climbLevel.level, 'none')
})

// ---------- Thân treo không trượt xuyên rào / Hộp Phân Phối (sửa sau rà soát cuối) ----------
const outside = (r: RobotBody) => r.footprint().some((p) => Math.abs(p.x) > FIELD / 2 + 1e-6 || Math.abs(p.z) > FIELD / 2 + 1e-6)

test('Treo: giữ tiến 10 s / lùi 10 s ⇒ dừng ở đầu đoạn trong sân, mọi góc footprint vẫn trong rào', async () => {
  for (const cfg of [MAKER, { type: 'ui', drive: 'diff2', actuator: 'tt' }, { type: 'co', drive: 'diff2', actuator: 'tt' }, { type: 'sort', drive: 'diff2', actuator: 'tt' }] as RobotConfig[]) {
    const { w, r } = await underBar(0.42, cfg) // Đất (vạch ≈ 0,451)
    const hook = { S1: null, S2: null, S4: null, [ROBOTS[cfg.type].hook.port]: 0 } as Partial<PortValues>
    drive(w, r, { [ROBOTS[cfg.type].hook.port]: 180 } as Partial<PortValues>, PHYSICS_DT)
    drive(w, r, hook, PHYSICS_DT)
    assert.equal(r.climb.mode, 'hang', cfg.type)
    const rg = r.slideRange('red')
    drive(w, r, { ...hook, M1: 255, M2: 255 }, 10)
    assert.ok(r.climb.s <= rg.max + 1e-9 && r.climb.s > rg.max - 1e-6, `${cfg.type} tiến: s ${r.climb.s}, max ${rg.max}`)
    assert.equal(r.climbLevel.level, 'water', `${cfg.type} vẫn tới được Nước`)
    assert.ok(!outside(r), `${cfg.type} tiến: thân thò ra ngoài ${JSON.stringify(r.footprint())}`)
    drive(w, r, { ...hook, M1: -255, M2: -255 }, 10)
    assert.ok(r.climb.s >= rg.min - 1e-9 && r.climb.s < rg.min + 1e-6, `${cfg.type} lùi: s ${r.climb.s}, min ${rg.min}`)
    assert.ok(!outside(r), `${cfg.type} lùi: thân thò ra ngoài ${JSON.stringify(r.footprint())}`)
  }
})

test('Bám từ sàn ở s = 0,2 (ngoài đoạn trong sân của Mẫu Maker): vẫn bám, chỗ bám dời vào đầu đoạn, thân trong rào', async () => {
  const { w, r } = await underBar(0.2)
  drive(w, r, { S2: 180 }, PHYSICS_DT)
  drive(w, r, { S2: 0 }, PHYSICS_DT)
  assert.equal(r.climb.mode, 'hang')
  assert.ok(Math.abs(r.climb.s - r.slideRange('red').min) < 1e-9, `s ${r.climb.s}`)
  assert.ok(!outside(r), JSON.stringify(r.footprint()))
})
