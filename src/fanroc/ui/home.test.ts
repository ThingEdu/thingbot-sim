import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LINKS, programText, robotName, robotStats, tileMove, TILES } from './home.ts'
import { chrome, defaultCamera, SCREENS } from './router.ts'
import { ROBOTS } from '../robots.ts'
import { V_MAX } from '../robot.ts'
import { defaultConfig } from '../programs.ts'

test('TILES: 4 ô, Giải đấu đầu tiên (chọn sẵn)', () => {
  assert.deepEqual([...TILES], ['tournament', 'match', 'missions', 'workshop'])
})

test('tileMove: phím mũi tên đi theo lưới ô; ra ngoài lưới / phím khác thì đứng yên', () => {
  const rows: [Parameters<typeof tileMove>[0], string, string][] = [
    ['tournament', 'ArrowRight', 'match'], ['tournament', 'ArrowLeft', 'tournament'], ['tournament', 'ArrowDown', 'rules'], ['tournament', 'ArrowUp', 'tournament'],
    ['match', 'ArrowLeft', 'tournament'], ['match', 'ArrowRight', 'missions'], ['match', 'ArrowDown', 'workshop'], ['match', 'ArrowUp', 'match'],
    ['missions', 'ArrowLeft', 'match'], ['missions', 'ArrowDown', 'workshop'], ['missions', 'ArrowRight', 'missions'], ['missions', 'ArrowUp', 'missions'],
    ['workshop', 'ArrowUp', 'match'], ['workshop', 'ArrowLeft', 'tournament'], ['workshop', 'ArrowRight', 'workshop'], ['workshop', 'ArrowDown', 'rules'],
    // Hàng mục nhỏ dưới 4 ô: Luật chơi · Robot mẫu.
    ['rules', 'ArrowRight', 'robots'], ['rules', 'ArrowUp', 'workshop'], ['rules', 'ArrowLeft', 'rules'], ['rules', 'ArrowDown', 'rules'],
    ['robots', 'ArrowLeft', 'rules'], ['robots', 'ArrowUp', 'workshop'], ['robots', 'ArrowRight', 'robots'], ['robots', 'ArrowDown', 'robots'],
    ['match', 'Enter', 'match'], ['missions', 'KeyW', 'missions'],
  ]
  for (const [from, key, to] of rows) assert.equal(tileMove(from, key), to, `${from} + ${key}`)
})

test('LINKS: hai mục nhỏ Luật chơi, Robot mẫu — ngoài 4 ô chính', () => {
  assert.deepEqual([...LINKS], ['rules', 'robots'])
  for (const l of LINKS) assert.ok(!(TILES as readonly string[]).includes(l))
})

test('programText: có bản lưu ⇒ "Của em vN"; chưa lưu hoặc chọn Mặc định ⇒ "Mặc định"', () => {
  assert.equal(programText({ version: 3 }), 'Của em v3')
  assert.equal(programText({ version: 1 }, true), 'Của em v1')
  assert.equal(programText({ version: 3 }, false), 'Mặc định')
  assert.equal(programText(null), 'Mặc định')
})

test('robotStats: thanh lấy từ ROBOTS (storage/10 kẹp 1, cờ = có kẹp + tầm vươn), tốc độ V_MAX, đế 4 bánh đi ngang', () => {
  const maker = robotStats(defaultConfig('maker'))
  const ui = robotStats(defaultConfig('ui'))
  const co = robotStats(defaultConfig('co'))
  const sort = robotStats(defaultConfig('sort'))
  assert.equal(maker.storage, ROBOTS.maker.storage / 10)
  assert.equal(ui.storage, 1) // 15 bóng: kẹp 1
  assert.equal(sort.storage, 1)
  assert.equal(ui.flag, 0)
  assert.equal(sort.flag, 0)
  assert.equal(maker.flag, 0) // luật V4: họ Maker bỏ cờ (S2 làm móc leo xà)
  assert.equal(co.flag, 1) // tay vươn 14 cm
  assert.equal(maker.flagText, 'Không cắm cờ')
  for (const s of [maker, ui, co, sort]) assert.ok(s.speed > 0 && s.speed <= 1)
  assert.match(maker.speedText, new RegExp(`^${String(V_MAX).replace('.', ',')} m/s$`))
  assert.match(robotStats({ type: 'maker', drive: 'omni', actuator: 's360' }).speedText, /đi ngang được/)
  assert.equal(ui.flagText, 'Không cắm cờ')
  assert.equal(co.flagText, 'Kẹp cờ · tay vươn 14 cm')
  assert.equal(robotName(defaultConfig('maker')), 'Mẫu Maker · 2 bánh')
})

test('router: camera mặc định theo màn (trận / đấu tập / Xưởng Theo robot, nhiệm vụ Toàn sân, màn chính quay chậm)', () => {
  assert.equal(defaultCamera('home'), 'orbit')
  assert.equal(defaultCamera('match'), 'driver')
  assert.equal(defaultCamera('practice'), 'driver')
  assert.equal(defaultCamera('workshop'), 'follow')
  assert.equal(defaultCamera('mission'), 'field')
  assert.equal(defaultCamera('missions'), 'field')
  assert.equal(defaultCamera('tournament'), 'field')
  assert.equal(defaultCamera('tmatch'), 'driver')
  assert.equal(defaultCamera('treplay'), 'field')
  assert.equal(defaultCamera('rules'), 'orbit')
  assert.equal(defaultCamera('robots'), 'orbit')
  assert.equal(SCREENS.length, 11)
})

test('router: trận giải đấu như trận lẻ (khối, thanh chạy, bảng điểm); Xem nhanh chỉ bảng điểm, không thanh chạy', () => {
  assert.deepEqual(chrome('tmatch'), chrome('match'))
  assert.deepEqual(chrome('treplay'), { activity: [], runbar: false, scoreboard: true, live: true, dev: false })
})

test('router: màn chính không có cột biểu tượng / thanh chạy / bảng điểm; trận có; Xưởng không bảng điểm', () => {
  assert.deepEqual(chrome('home'), { activity: [], runbar: false, scoreboard: false, live: true, dev: false })
  assert.equal(chrome('match').scoreboard, true)
  assert.equal(chrome('practice').runbar, true)
  assert.equal(chrome('workshop').scoreboard, false)
  assert.ok(chrome('workshop').activity.includes('blocks'))
  assert.equal(chrome('mission').scoreboard, false)
  // Màn chơi gọn (ẩn khối / Serial / thanh trạng thái); chỉ Xưởng và màn nhiệm vụ cần đủ vỏ lập trình.
  assert.equal(chrome('match').dev, false)
  assert.equal(chrome('tmatch').dev, false)
  assert.equal(chrome('workshop').dev, true)
  assert.equal(chrome('mission').dev, true)
  // Luật chơi, Robot mẫu: phủ sân như màn chính, không cột biểu tượng / thanh chạy / bảng điểm; sân nền tạm dừng
  // (đọc chữ / xoay robot mẫu, không tốn máy cho vật lý + vẽ sân phía sau).
  assert.deepEqual(chrome('rules'), { ...chrome('home'), live: false })
  assert.deepEqual(chrome('robots'), { ...chrome('home'), live: false })
})
