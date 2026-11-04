import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playAgents, SEATS } from './quickmatch.ts'
import { teamScore } from './scoring.ts'
import type { RobotConfig } from './robots.ts'
import type { Skill } from './agent.ts'

const MAKER: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const opts = (seed: number) => ({
  cfgs: [MAKER, MAKER, MAKER, MAKER],
  skills: ['hard', 'medium', 'easy', 'hard'] as Skill[],
  teams: ['Đỏ A', 'Xanh A', 'Đỏ B', 'Xanh B'],
  seed,
})

test('playAgents: cùng seed ⇒ cùng điểm trận; điểm đội = teamScore(trận, phạt); dưới 60 s', async () => {
  const t0 = performance.now()
  const a = await playAgents(opts(5))
  const secs = (performance.now() - t0) / 1000
  const b = await playAgents(opts(5))
  console.log(`quickmatch: trận ${a.match} điểm trong ${secs.toFixed(1)} s`)
  assert.ok(secs < 60, `trận ngầm ${secs.toFixed(1)} s ≥ 60 s`)
  assert.equal(b.match, a.match)
  assert.deepEqual(b.teams, a.teams)
  assert.deepEqual(a.teams.map((t) => t.team), ['Đỏ A', 'Xanh A', 'Đỏ B', 'Xanh B'])
  assert.deepEqual(a.seats, SEATS)
  assert.deepEqual(a.seats, [['red', 0], ['blue', 0], ['red', 1], ['blue', 1]])
  a.teams.forEach((t, i) => {
    const p = a.matchObj.pens[i]
    assert.equal(t.score, teamScore(a.match, p))
    assert.equal(t.penalty, p.red ? a.match : 5 * p.minor + 10 * p.yellow)
  })
})
