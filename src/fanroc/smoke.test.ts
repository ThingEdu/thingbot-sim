import { test } from 'node:test'
import assert from 'node:assert/strict'
import RAPIER from '@dimforge/rapier3d-compat'

test('Rapier khởi tạo được trong Node và tạo được World trọng lực -9.81', async () => {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  assert.equal(world.gravity.y, -9.81)
  world.free()
})
