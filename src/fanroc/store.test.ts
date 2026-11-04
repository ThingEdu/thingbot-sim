import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, keys, type KV } from './store.ts'
import { FANROC_2026 } from './season.ts'
import type { TournamentState } from './tournament.ts'

const fake = (): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>()
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
const boom: KV = { getItem() { throw new Error('chặn') }, setItem() { throw new Error('chặn') } }
const maker = { type: 'maker', drive: 'diff2', actuator: 'tt' } as const
const ui = { type: 'ui', drive: 'diff2', actuator: 'tt' } as const
const T: TournamentState = { version: 1, seed: 1, perTeam: 3, entrants: [], schedule: [], results: [] }

test('khoá theo mùa', () => {
  assert.equal(keys(FANROC_2026.id).missions, 'fanroc.v1.fanroc-2026.missions')
  assert.equal(keys('x').settings, 'fanroc.v1.settings')
})

test('KV ném lỗi: mọi hàm trả mặc định, không ném', () => {
  for (const kv of [boom, null]) {
    const s = createStore('s', kv)
    assert.equal(s.settings().skill, 'medium')
    assert.equal(s.settings().sound, true)
    assert.deepEqual(s.mission('a'), { done: false, stars: 0, program: null })
    assert.equal(s.program(0, maker), null)
    assert.equal(s.tournament(), null)
    assert.deepEqual(s.profile(), { names: ['Bạn 1', 'Bạn 2'], stars: 0 })
    s.saveSettings(s.settings()); s.saveMission('a', s.mission('a')); s.saveProgram(0, maker, {})
    s.resetProgram(0, maker); s.saveTournament(T); s.saveProfile(s.profile())
  }
})

test('mặc định cài đặt: không có camera, robot maker 2 bánh', () => {
  const st = createStore('s', fake()).settings()
  assert.deepEqual(st, { quality: undefined, sound: true, skill: 'medium', alliance: 'red', robot: maker, layout2p: false })
  assert.ok(!('camera' in st))
})

test('cài đặt, hồ sơ, nhiệm vụ lưu rồi đọc lại; không theo mùa với settings/profile', () => {
  const kv = fake()
  const a = createStore('s1', kv)
  a.saveSettings({ ...a.settings(), sound: false, quality: 'low' })
  a.saveProfile({ names: ['An', 'Bình'], stars: 4 })
  a.saveMission('m1', { done: true, stars: 2, program: { x: 1 } })
  const b = createStore('s2', kv)
  assert.equal(b.settings().sound, false)
  assert.equal(b.settings().quality, 'low')
  assert.deepEqual(b.profile(), { names: ['An', 'Bình'], stars: 4 })
  assert.equal(b.mission('m1').done, false)
  assert.deepEqual(a.mission('m1'), { done: true, stars: 2, program: { x: 1 } })
})

test('JSON sai dạng: mặc định; giải ⇒ corrupt; vắng ⇒ null', () => {
  const kv = fake()
  const s = createStore('s', kv)
  assert.equal(s.tournament(), null)
  kv.m.set(keys('s').settings, '{nope')
  kv.m.set(keys('s').profile, '{"names":5}')
  kv.m.set(keys('s').missions, '[1]')
  assert.equal(s.settings().skill, 'medium')
  assert.deepEqual(s.profile().names, ['Bạn 1', 'Bạn 2'])
  assert.equal(s.mission('a').stars, 0)
  kv.m.set(keys('s').tournament, '{nope')
  assert.equal(s.tournament(), 'corrupt')
  kv.m.set(keys('s').tournament, '{"version":1,"entrants":[],"schedule":[]}')
  assert.equal(s.tournament(), 'corrupt')
  kv.m.set(keys('s').tournament, '{"version":2,"entrants":[],"schedule":[],"results":[]}')
  assert.equal(s.tournament(), 'corrupt')
})

test('giải: lưu, đọc, xoá bằng null', () => {
  const s = createStore('s', fake())
  s.saveTournament(T)
  assert.deepEqual(s.tournament(), T)
  s.saveTournament(null)
  assert.equal(s.tournament(), null)
})

test('chương trình: version tăng, tách người chơi và loại robot, reset đúng khoá', () => {
  const s = createStore('s', fake())
  assert.equal(s.saveProgram(0, maker, { a: 1 }), 1)
  assert.equal(s.saveProgram(0, maker, { a: 2 }), 2)
  assert.deepEqual(s.program(0, maker), { version: 2, state: { a: 2 } })
  assert.equal(s.program(0, ui), null)
  assert.equal(s.program(1, maker), null)
  s.saveProgram(1, maker, { b: 1 })
  s.resetProgram(0, maker)
  assert.equal(s.program(0, maker), null)
  assert.deepEqual(s.program(1, maker), { version: 1, state: { b: 1 } })
  assert.equal(s.saveProgram(0, maker, {}), 1)
})

test('chỉ ghi khoá có tiền tố fanroc.v1.', () => {
  const kv = fake()
  const s = createStore('s', kv)
  s.saveSettings(s.settings()); s.saveProfile(s.profile()); s.saveMission('a', s.mission('a'))
  s.saveProgram(0, maker, {}); s.saveTournament(T)
  for (const k of kv.m.keys()) assert.ok(k.startsWith('fanroc.v1.'), k)
})
