import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Trail, TRAIL_COLORS } from './trail.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import { FanrocWorld, PHYSICS_DT } from './world.ts'
import { RobotBody } from './robot.ts'
import type { RobotConfig } from './robots.ts'

const P = (o: Partial<PortValues>): PortValues => ({ ...NEUTRAL, ...o })

test('đổi ports 3 lần ⇒ 4 đoạn, màu 0,1,2,3; các đoạn nối liền nhau', () => {
  const tr = new Trail()
  const sets = [P({ M1: 50, M2: 50 }), P({ M1: 50, M2: -50 }), P({ M1: 0, M2: 0 }), P({ M1: 30, M2: 30 })]
  sets.forEach((p, k) => {
    tr.add(k * 0.1, { x: 0, z: -k * 0.1, yaw: 0 }, p)
    tr.add(k * 0.1 + 0.05, { x: 0, z: -k * 0.1 - 0.05, yaw: 0 }, p)
  })
  assert.equal(tr.segments.length, 4)
  assert.deepEqual(tr.segments.map((s) => s.color), [0, 1, 2, 3])
  assert.ok(tr.segments.every((s) => s.points.length >= 2))
  for (let i = 0; i + 1 < tr.segments.length; i++) {
    const prev = tr.segments[i].points
    assert.deepEqual(tr.segments[i + 1].points[0], prev[prev.length - 1], `đoạn ${i + 1} phải nối liền đoạn ${i}`)
  }
  assert.equal(TRAIL_COLORS.length, 6)
  assert.equal(new Set(TRAIL_COLORS).size, 6)
})

test('đổi ports ngay ở bước < 5 mm: vẫn nối liền, đoạn mới có ≥ 2 điểm hoặc trùng điểm cuối', () => {
  const tr = new Trail()
  tr.add(0, { x: 0, z: 0, yaw: 0 }, P({ M1: 1 }))
  tr.add(0.1, { x: 0, z: -0.1, yaw: 0 }, P({ M1: 1 }))
  tr.add(0.2, { x: 0, z: -0.102, yaw: 0 }, P({ M1: 2 })) // đổi lệnh khi mới nhích 2 mm
  tr.add(0.3, { x: 0, z: -0.2, yaw: 0 }, P({ M1: 2 }))
  const [a, b] = tr.segments
  assert.deepEqual(b.points[0], a.points[a.points.length - 1])
  assert.ok(b.points.length >= 2)
  assert.deepEqual(b.points[b.points.length - 1], { x: 0, z: -0.2 })
})

test('màu xoay vòng sau 6 đoạn', () => {
  const tr = new Trail()
  for (let k = 0; k < 8; k++) tr.add(k, { x: k * 0.1, z: 0, yaw: 0 }, P({ M1: k }))
  assert.deepEqual(tr.segments.map((s) => s.color), [0, 1, 2, 3, 4, 5, 0, 1])
})

test('đi 1 m thẳng ⇒ distance 1 ± 0,001 và time đúng; bước < 5 mm không làm mất quãng', () => {
  const tr = new Trail()
  const p = P({ M1: 60, M2: 60 })
  for (let k = 0; k <= 500; k++) tr.add(10 + k * 0.01, { x: 0, z: -k * 0.002, yaw: 0 }, p) // 2 mm/bước
  assert.ok(Math.abs(tr.distance - 1) <= 0.001, `distance ${tr.distance}`)
  assert.ok(Math.abs(tr.time - 5) < 1e-9, `time ${tr.time}`)
  assert.ok(tr.segments[0].points.length < 500, 'điểm < 5 mm phải bị bỏ')
})

test('quay +π/2 rồi −π/2 ⇒ turned 180; qua mốc ±π không nhảy 360', () => {
  const tr = new Trail()
  const p = P({ M1: -50, M2: 50 })
  tr.add(0, { x: 0, z: 0, yaw: 0 }, p)
  tr.add(1, { x: 0, z: 0, yaw: Math.PI / 2 }, p)
  tr.add(2, { x: 0, z: 0, yaw: 0 }, p)
  assert.ok(Math.abs(tr.turned - 180) < 1e-9, `turned ${tr.turned}`)
  const t2 = new Trail()
  t2.add(0, { x: 0, z: 0, yaw: Math.PI - 0.1 }, p)
  t2.add(1, { x: 0, z: 0, yaw: -Math.PI + 0.1 }, p)
  assert.ok(Math.abs(t2.turned - (0.2 * 180) / Math.PI) < 1e-9, `turned ${t2.turned}`)
})

test('clear() xoá sạch, dùng lại được', () => {
  const tr = new Trail()
  tr.add(0, { x: 0, z: 0, yaw: 0 }, P({ M1: 1 }))
  tr.add(1, { x: 1, z: 0, yaw: 1 }, P({ M1: 2 }))
  tr.clear()
  assert.equal(tr.segments.length, 0)
  assert.equal(tr.distance + tr.turned + tr.time, 0)
  tr.add(5, { x: 3, z: 3, yaw: 0 }, P({ M1: 9 }))
  assert.equal(tr.segments[0].color, 0)
  assert.equal(tr.time, 0)
})

test('lastMoveTime (R57): giờ của lần cuối robot còn chạy; trôi < 5 mm / quay < 2° không tính; time không đổi nghĩa', () => {
  const tr = new Trail()
  const p = P({ M1: 60, M2: 60 })
  tr.add(0, { x: 0, z: 0, yaw: 0 }, p)
  assert.equal(tr.hasMoved, false)
  for (let k = 1; k <= 100; k++) tr.add(k * 0.01, { x: 0, z: -k * 0.003, yaw: 0 }, p) // 1 s, 0,3 m
  for (let k = 1; k <= 200; k++) tr.add(1 + k * 0.01, { x: 0, z: -0.3 - Math.min(k, 40) * 0.0001, yaw: 0 }, P({})) // trôi 4 mm rồi đứng
  assert.equal(tr.hasMoved, true)
  assert.ok(Math.abs(tr.lastMoveTime - 1) < 0.011, `lastMoveTime ${tr.lastMoveTime}`)
  assert.ok(Math.abs(tr.time - 3) < 1e-9, 'time vẫn là tới điểm cuối')
  // Quay tại chỗ (tâm không dời) vẫn là đang chạy.
  for (let k = 1; k <= 50; k++) tr.add(3 + k * 0.01, { x: 0, z: -0.304, yaw: k * 0.02 }, P({ M1: -60, M2: 60 }))
  assert.ok(Math.abs(tr.lastMoveTime - 3.5) < 0.03, `quay: lastMoveTime ${tr.lastMoveTime}`)
  tr.clear()
  assert.deepEqual([tr.lastMoveTime, tr.hasMoved], [0, false])
})

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }

test('lặp lại (spec §8.2): M1 = M2 = 60 trong 1 s, 5 lần ⇒ distance lệch nhau ≤ 0,01 m', async () => {
  const dists: number[] = []
  for (let run = 0; run < 5; run++) {
    const w = await FanrocWorld.create(1, { balls: false })
    try {
      const r = new RobotBody(w, MAKER, 'red', 0)
      r.setPose({ x: 0, z: 0.9, yaw: 0 })
      const tr = new Trail()
      const ports = P({ M1: 60, M2: 60 })
      const n = Math.round(1 / PHYSICS_DT)
      tr.add(0, r.pose, ports)
      for (let k = 1; k <= n; k++) {
        r.apply(ports, PHYSICS_DT)
        w.step(PHYSICS_DT)
        tr.add(k * PHYSICS_DT, r.pose, ports)
      }
      dists.push(tr.distance)
    } finally {
      w.rapier.free()
    }
  }
  const spread = Math.max(...dists) - Math.min(...dists)
  console.log('distance mỗi lần:', dists.map((d) => d.toFixed(5)).join(' '), 'lệch', spread.toFixed(6))
  assert.ok(dists[0] > 0.2, `robot phải đi được: ${dists[0]}`)
  assert.ok(spread <= 0.01, `lệch ${spread} m`)
})
