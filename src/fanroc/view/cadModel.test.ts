import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BALL_CHUTE, BALL_STEP, CAD_WHEELS, chuteExitModel, chuteSlot, makerCad, TALL_TOP } from './cadModel.ts'
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

test('Lồng chứa bóng: 4 bóng nối nhau theo ống cong, quả đầu ở vòng cửa ra, quả cuối trong ống đứng dưới miệng ống', () => {
  const { groups } = makerCad()
  const R = 20 // bán kính bóng, mm
  // Vòng cửa ra: tâm khối các đỉnh nhóm hoop (hệ hình = đỉnh + pivot).
  const hp = groups.hoop.geo.getAttribute('position')
  const ring = new THREE.Vector3()
  for (let i = 0; i < hp.count; i++) ring.add(new THREE.Vector3(hp.getX(i), hp.getY(i), hp.getZ(i)))
  ring.divideScalar(hp.count).add(groups.hoop.pivot)
  const s = [0, 1, 2, 3].map((n) => chuteSlot(n))
  assert.ok(s[0].distanceTo(ring) < 15, `quả ra trước cách tâm vòng cửa ra ${s[0].distanceTo(ring).toFixed(0)} mm`)
  for (let n = 1; n < 4; n++) {
    const d = s[n].distanceTo(s[n - 1])
    assert.ok(d >= 2 * R - 1 && d <= BALL_STEP + 0.5, `bóng ${n - 1}–${n} cách ${d.toFixed(1)} mm (chồng nhau / hở)`)
  }
  // Quả cuối trong ống đứng: ngay dưới tâm vòng miệng ống (các đỉnh thân cao ≥ 209 mm quanh x 58, z 43), không trồi khỏi miệng.
  const bp = groups.body.geo.getAttribute('position')
  let top = 0
  for (let i = 0; i < bp.count; i++) if (Math.hypot(bp.getX(i) - 58, bp.getZ(i) - 43) < 35 && bp.getY(i) > top) top = bp.getY(i)
  const last = s[ROBOTS.maker.storage - 1]
  assert.ok(Math.hypot(last.x - 58, last.z - 43) < 5 && last.y + R < top, `quả cuối ở ${last.toArray().map((v) => v.toFixed(0))} — phải trong ống đứng`)
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

test('Lồng 8 bóng (Maker Hút / Pro): quả cuối vẫn trong ống nối dài, dưới miệng TALL_TOP', () => {
  const last = chuteSlot(ROBOTS.makerIntake.storage - 1)
  assert.ok(Math.hypot(last.x - 58, last.z - 43) < 5, `quả cuối lệch khỏi ống: ${last.toArray()}`)
  assert.ok(last.y + 20 <= TALL_TOP && last.y + 20 > 209, `quả cuối cao ${last.y}`)
  assert.ok(TALL_TOP <= ROBOTS.makerIntake.size.h * 1000 + 1)
})

test('Cửa lồng nâng (Maker Nâng): vòng cửa ra theo chuteExit — cùng số với điểm xả của vật lý; quả đầu đi theo cửa ra', () => {
  const def = ROBOTS.makerLift
  const lo = chuteExitModel(def, 0)
  const hi = chuteExitModel(def, 1)
  assert.deepEqual(lo.toArray(), [...BALL_CHUTE[0]])
  assert.ok(Math.abs(hi.z - lo.z - 180) < 1e-6 && Math.abs(hi.y - lo.y - 117) < 1e-6, hi.toArray().join())
  assert.ok(chuteSlot(0, undefined, hi).distanceTo(hi) < 1e-9)
  assert.deepEqual(chuteExitModel(ROBOTS.maker, 1).toArray(), [...BALL_CHUTE[0]])
})
