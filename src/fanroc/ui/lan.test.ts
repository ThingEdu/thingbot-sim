import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lanSeats, localSeat, teamInfo } from './lan.ts'
import type { RobotConfig } from '../robots.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const SORT: RobotConfig = { type: 'sort', drive: 'diff2', actuator: 'tt' }
const PUSH: RobotConfig = { type: 'ui', drive: 'diff2', actuator: 'tt' }

test('ghế trận hai máy: máy chủ Đỏ (ô 0, 2), máy khách Xanh (ô 1, 3); máy một bạn ⇒ ô phải là robot máy theo mức của máy đó', () => {
  const host = teamInfo({ names: ['An', 'Bình'], players: 2, robots: [MAKER, SORT], skill: 'easy', machine: 'Kiến Lửa', app: '1' })
  const guest = teamInfo({ names: ['Cúc', 'Dũng'], players: 1, robots: [PUSH, MAKER], skill: 'hard', machine: 'Ong Vàng', app: '1' })
  const s = lanSeats(host, guest)
  assert.deepEqual(s.cfgs, [MAKER, PUSH, SORT, MAKER])
  assert.deepEqual(s.teams, ['An', 'Cúc', 'Bình', 'Ong Vàng'])
  assert.deepEqual(s.who, [
    { side: 'host', player: 0 },
    { side: 'guest', player: 0 },
    { side: 'host', player: 1 },
    { side: 'guest', agent: 'hard' },
  ])
})

test('ghế của bạn trên máy này', () => {
  assert.equal(localSeat('host', 0, 1), 0)
  assert.equal(localSeat('host', 1, 2), 2)
  assert.equal(localSeat('guest', 0, 2), 1)
  assert.equal(localSeat('guest', 1, 2), 3)
  assert.equal(localSeat('guest', 1, 1), -1)
})
