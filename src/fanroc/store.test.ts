import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, defaultSettings, keys, oldRulesProgram, PROGRAM_RULES, type KV } from './store.ts'
import { defaultConfig } from './programs.ts'
import { FANROC_2026 } from './season.ts'
import { createTournament, isOldRules, record, type TournamentState } from './tournament.ts'

const fake = (): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>()
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
const boom: KV = { getItem() { throw new Error('chặn') }, setItem() { throw new Error('chặn') } }
const maker = { type: 'maker', drive: 'diff2', actuator: 'tt' } as const
const ui = { type: 'ui', drive: 'diff2', actuator: 'tt' } as const
const T: TournamentState = createTournament({ players: [{ name: 'Bạn 1', robot: maker }], perTeam: 4, seed: 1 })

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
  assert.deepEqual(st, { quality: undefined, sound: true, skill: 'medium', alliance: 'red', robot: maker, robot2: maker, layout2p: false, teacher: false })
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

test('giải: dạng sâu sai (seed, perTeam, phần tử entrants / schedule / results) ⇒ corrupt; giải đúng, có kết quả ⇒ đọc được', () => {
  const kv = fake()
  const s = createStore('s', kv)
  const played = record(T, 0, { matchScore: 120, multPct: 100, teams: Object.fromEntries(T.schedule[0].red.concat(T.schedule[0].blue).map((id) => [id, { score: 120, penalty: 0 }])) })
  const put = (v: unknown) => kv.m.set(keys('s').tournament, JSON.stringify(v))
  put(played)
  assert.deepEqual(s.tournament(), played)
  const bad: [string, (t: any) => void][] = [
    ['seed không phải số', (t) => (t.seed = 'x')],
    ['seed vô hạn', (t) => (t.seed = null)],
    ['perTeam ngoài 4–10', (t) => (t.perTeam = 11)],
    ['perTeam lẻ thập phân', (t) => (t.perTeam = 4.5)],
    ['thiếu đội', (t) => t.entrants.pop()],
    ['đội thiếu tên', (t) => delete t.entrants[0].name],
    ['đội loại lạ', (t) => (t.entrants[1].kind = 'alien')],
    ['robot không có thật', (t) => (t.entrants[0].robot = { type: 'xe', drive: 'diff2', actuator: 'tt' })],
    ['đội máy thiếu mức', (t) => delete t.entrants[3].skill],
    ['người chơi sai số', (t) => (t.entrants[0].player = 3)],
    ['trùng id', (t) => (t.entrants[2].id = t.entrants[1].id)],
    ['lịch thiếu trận', (t) => t.schedule.pop()],
    ['ô lịch sai dạng', (t) => (t.schedule[1] = { red: ['p0'], blue: [] })],
    ['ô lịch id lạ', (t) => (t.schedule[2].red[0] = 'zz')],
    ['ô lịch trùng đội', (t) => (t.schedule[2].blue[0] = t.schedule[2].red[0])],
    ['kết quả lệch độ dài', (t) => t.results.pop()],
    ['kết quả thiếu điểm trận', (t) => delete t.results[0].matchScore],
    ['kết quả điểm đội sai', (t) => (t.results[0].teams[t.schedule[0].red[0]].score = 'nhiều')],
    ['kết quả đội lạ', (t) => (t.results[0].teams.zz = { score: 1, penalty: 0 })],
    ['kết quả là số', (t) => (t.results[3] = 7)],
  ]
  for (const [why, mutate] of bad) {
    const t = JSON.parse(JSON.stringify(played))
    mutate(t)
    put(t)
    assert.equal(s.tournament(), 'corrupt', why)
  }
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
  assert.deepEqual(s.program(0, maker), { version: 2, state: { a: 2 }, rules: PROGRAM_RULES })
  assert.equal(s.program(0, ui), null)
  assert.equal(s.program(1, maker), null)
  s.saveProgram(1, maker, { b: 1 })
  s.resetProgram(0, maker)
  assert.equal(s.program(0, maker), null)
  assert.deepEqual(s.program(1, maker), { version: 1, state: { b: 1 }, rules: PROGRAM_RULES })
  assert.equal(s.saveProgram(0, maker, {}), 1)
})

test('dấu luật: bản lưu từ 0.8 (không có rules) vẫn đọc được, nhận ra là luật cũ với họ Maker; lưu lại thì có dấu V4', () => {
  const kv = fake()
  const k = keys('s').workshop
  // Bản ghi đúng như 0.8 lưu (cùng khoá fanroc.v1., không có trường rules).
  kv.m.set(k, JSON.stringify({ '0:maker/diff2/tt': { version: 3, state: { old: 1 } }, '0:ui/diff2/tt': { version: 1, state: { u: 1 } } }))
  const s = createStore('s', kv)
  const old = s.program(0, maker)
  assert.deepEqual(old, { version: 3, state: { old: 1 } })
  assert.equal(oldRulesProgram(old, maker), true)
  assert.equal(oldRulesProgram(s.program(0, ui), ui), false, 'Xe Ủi không đổi nghĩa cổng nào')
  assert.equal(s.saveProgram(0, maker, { fixed: 1 }), 4)
  assert.equal(oldRulesProgram(s.program(0, maker), maker), false)
  assert.deepEqual(JSON.parse(kv.m.get(k)!)['0:maker/diff2/tt'], { version: 4, state: { fixed: 1 }, rules: 4 })
})

test('oldRulesProgram: họ Maker (Mẫu Maker / Nâng / Hút / Pro) không dấu ⇒ true; có dấu ≥ 4, chưa lưu, hay robot khác ⇒ false', () => {
  for (const type of ['maker', 'makerLift', 'makerIntake', 'makerPro'] as const) {
    const cfg = { type, drive: 'diff2', actuator: 'tt' } as const
    assert.equal(oldRulesProgram({ version: 1, state: {} }, cfg), true, type)
    assert.equal(oldRulesProgram({ version: 1, state: {}, rules: 3 }, cfg), true, `${type} luật 3`)
    assert.equal(oldRulesProgram({ version: 1, state: {}, rules: 4 }, cfg), false, type)
    assert.equal(oldRulesProgram(null, cfg), false, type)
  }
  for (const type of ['ui', 'co', 'sort'] as const) assert.equal(oldRulesProgram({ version: 1, state: {} }, { type, drive: 'diff2', actuator: 'tt' }), false, type)
})

test('chỉ ghi khoá có tiền tố fanroc.v1.', () => {
  const kv = fake()
  const s = createStore('s', kv)
  s.saveSettings(s.settings()); s.saveProfile(s.profile()); s.saveMission('a', s.mission('a'))
  s.saveProgram(0, maker, {}); s.saveTournament(T)
  for (const k of kv.m.keys()) assert.ok(k.startsWith('fanroc.v1.'), k)
})

test('defaultSettings().robot = programs.defaultConfig(\'maker\') (một nguồn cho robot mặc định)', () => {
  assert.deepEqual(defaultSettings().robot, defaultConfig('maker'))
  assert.deepEqual(defaultSettings().robot2, defaultConfig('maker'))
})

test('cài đặt robot sai loại / đế không có / cơ cấu lạ ⇒ mặc định từng robot; đúng ⇒ giữ', () => {
  const kv = fake()
  const bad = [
    { type: 'tau-ngam', drive: 'diff2', actuator: 'tt' },
    { type: 'ui', drive: 'mecanum', actuator: 'tt' }, // Xe Ủi chỉ có 2 bánh
    { type: 'maker', drive: 'diff2', actuator: 'pin' },
    { type: 'toString', drive: 'diff2', actuator: 'tt' },
    'maker',
  ]
  for (const r of bad) {
    kv.setItem(keys('s').settings, JSON.stringify({ robot: r, robot2: r }))
    const st = createStore('s', kv).settings()
    assert.deepEqual(st.robot, maker, JSON.stringify(r))
    assert.deepEqual(st.robot2, maker, JSON.stringify(r))
  }
  const co = { type: 'co', drive: 'omni', actuator: 's360' }
  kv.setItem(keys('s').settings, JSON.stringify({ robot: ui, robot2: co }))
  const st = createStore('s', kv).settings()
  assert.deepEqual(st.robot, ui)
  assert.deepEqual(st.robot2, co)
})

test('giải lưu bản 0.8 (kết quả không có multPct) vẫn đọc được nguyên vẹn, không bị coi là hỏng', () => {
  const kv = fake()
  const s = createStore('s', kv)
  const ids = T.schedule[0].red.concat(T.schedule[0].blue)
  const old = { ...T, results: T.results.map((r, i) => (i === 0 ? { matchScore: 120, teams: Object.fromEntries(ids.map((id) => [id, { score: 120, penalty: 0 }])) } : r)) }
  kv.m.set(keys('s').tournament, JSON.stringify(old))
  const got = s.tournament()
  assert.notEqual(got, 'corrupt')
  assert.deepEqual(got, old)
  assert.equal(isOldRules(got as TournamentState), true)
})
