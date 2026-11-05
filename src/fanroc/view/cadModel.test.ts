import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BALL_TUBE, CAD_WHEELS, makerCad } from './cadModel.ts'
import { ROBOTS, localGripPoint, rearExtent, rearOverhang } from '../robots.ts'

test('Mẫu Maker CAD: đủ nhóm thân / thanh răng / tay vòng / 4 bánh; cỡ khớp hộp va chạm 240 × 300 mm', () => {
  const { groups } = makerCad()
  for (const k of ['body', 'rack', 'hoop', ...CAD_WHEELS]) assert.ok(groups[k], `thiếu nhóm ${k}`)
  const box = new THREE.Box3()
  for (const k of Object.keys(groups)) {
    const g = groups[k].geo
    g.computeBoundingBox()
    box.union(g.boundingBox!.clone().translate(groups[k].pivot))
  }
  const s = box.getSize(new THREE.Vector3())
  assert.ok(Math.abs(s.x - ROBOTS.maker.size.w * 1000) < 6, `ngang ${s.x.toFixed(0)} mm`)
  assert.ok(Math.abs(s.z - ROBOTS.maker.size.l * 1000) < 8, `dài ${s.z.toFixed(0)} mm`)
  assert.ok(Math.abs(s.y - ROBOTS.maker.size.h * 1000) < 8, `cao ${s.y.toFixed(0)} mm`)
  assert.ok(box.min.y >= -1, 'không lún dưới sàn')
  // Bánh: tâm cao ~ bán kính bánh D65.
  for (const k of CAD_WHEELS) assert.ok(Math.abs(groups[k].pivot.y - 35) < 3, `${k} tâm cao ${groups[k].pivot.y}`)
})

test('Lồng chứa bóng: 4 bóng (đầy theo ROBOTS.maker.storage) chồng vừa trong ống, miệng ống là vòng CAD ở cao 209 mm', () => {
  const { groups } = makerCad()
  const pos = groups.body.geo.getAttribute('position')
  const R = 20 // bán kính bóng, mm
  let ring = 0
  let floor = Infinity
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i) - BALL_TUBE.x, pos.getZ(i) - BALL_TUBE.z)
    const y = pos.getY(i)
    if (y >= BALL_TUBE.top && r > R && r < 35) ring++ // vòng miệng ống bao quanh tâm, rộng hơn quả bóng
    if (r < R && y > 40) floor = Math.min(floor, y) // đáy lồng ngay dưới tâm ống
  }
  assert.ok(ring > 10, `không thấy vòng miệng ống quanh tâm (${ring} đỉnh)`)
  assert.ok(Math.abs(BALL_TUBE.y0 - R - floor) < 2, `quả dưới cùng không nằm trên đáy lồng (${floor.toFixed(1)} mm)`)
  const topBall = BALL_TUBE.y0 + (ROBOTS.maker.storage - 1) * BALL_TUBE.step + R
  assert.ok(topBall <= BALL_TUBE.top && topBall > BALL_TUBE.top - BALL_TUBE.step, `4 bóng cao ${topBall} mm — phải vừa đầy miệng ống`)
})

test('Mẫu Maker cắm cờ bằng đuôi: lúc thu giá cờ trên nóc (chưa nhô), lùi hết vẫn trong trần mở rộng 500 mm', () => {
  const def = ROBOTS.maker
  assert.equal(rearOverhang(def, 0, 0), 0, 'lúc thu mép giá cờ ngang đuôi khung (CAD: −153 / −151 mm)')
  assert.ok(localGripPoint(def, 0, 0).z > -def.size.l / 2, 'lúc thu giá cờ nằm trong thân')
  const full = rearOverhang(def, def.maxExtend, 0)
  assert.ok(full > 0.17, `lùi hết nhô ${full}`)
  assert.ok(Math.max(def.size.w, def.size.l) + rearExtent(def, def.maxExtend, 0) <= 0.5 + 1e-9)
})

test('Linh kiện CAD rời: bánh D65, động cơ, bo ThingBot, servo SG90, khay pin — cỡ đúng linh kiện thật', async () => {
  const { cadPart } = await import('./cadModel.ts')
  const size = (n: Parameters<typeof cadPart>[0]) => new THREE.Box3().setFromObject(cadPart(n, 0, 0, 0)).getSize(new THREE.Vector3())
  const w = size('wheel')
  assert.ok(Math.abs(w.y - 69) < 3 && Math.abs(w.z - 69) < 3 && w.x > 20 && w.x < 35, `bánh ${w.toArray()}`)
  const b = size('board')
  assert.ok(b.x > 55 && b.x < 70 && b.z > 55 && b.z < 75, `bo ${b.toArray()}`)
  for (const n of ['motor', 'servo', 'battery'] as const) assert.ok(size(n).length() > 20, n)
})
