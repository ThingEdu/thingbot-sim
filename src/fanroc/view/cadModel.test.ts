import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CAD_WHEELS, makerCad } from './cadModel.ts'
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

test('Mẫu Maker cắm cờ bằng đuôi: lúc thu giá cờ trên nóc (chưa nhô), lùi hết vẫn trong trần mở rộng 500 mm', () => {
  const def = ROBOTS.maker
  assert.equal(rearOverhang(def, 0, 0), 0, 'lúc thu mép giá cờ ngang đuôi khung (CAD: −153 / −151 mm)')
  assert.ok(localGripPoint(def, 0, 0).z > -def.size.l / 2, 'lúc thu giá cờ nằm trong thân')
  const full = rearOverhang(def, def.maxExtend, 0)
  assert.ok(full > 0.17, `lùi hết nhô ${full}`)
  assert.ok(Math.max(def.size.w, def.size.l) + rearExtent(def, def.maxExtend, 0) <= 0.5 + 1e-9)
})
