import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignSeat, defaultSeats, keyName, keyRows, playerSeat, seatOf, seatOptions, splitSeats } from './settings.ts'
import { defaultConfig, sample, teleopButtons } from '../programs.ts'
import { KEY_TABLE } from '../keys.ts'
import { ROBOTS, type RobotConfig, type RobotType } from '../robots.ts'

test('seatOf: bạn 1 ô trái liên minh mình chọn, bạn 2 ô trái liên minh kia', () => {
  assert.equal(seatOf(0, 'red'), 0)
  assert.equal(seatOf(0, 'blue'), 1)
  assert.equal(seatOf(1, 'red'), 1)
  assert.equal(seatOf(1, 'blue'), 0)
})

test('defaultSeats: robot của em + 3 máy; hai bạn: 2 máy', () => {
  assert.deepEqual(defaultSeats('red', 'medium', 1), ['player-0', 'agent-medium', 'agent-medium', 'agent-medium'])
  assert.deepEqual(defaultSeats('blue', 'hard', 1), ['agent-hard', 'player-0', 'agent-hard', 'agent-hard'])
  assert.deepEqual(defaultSeats('red', 'easy', 2), ['player-0', 'player-1', 'agent-easy', 'agent-easy'])
  assert.deepEqual(defaultSeats('blue', 'easy', 2), ['player-1', 'player-0', 'agent-easy', 'agent-easy'])
})

test('assignSeat: mỗi bạn một ghế — đặt bạn 1 sang ghế khác thì ghế cũ thành máy; máy / chương trình theo thì không đụng ghế khác', () => {
  const m = defaultSeats('red', 'medium', 1)
  assert.deepEqual(assignSeat(m, 2, 'player-0', 'easy'), ['agent-easy', 'agent-medium', 'player-0', 'agent-medium'])
  assert.deepEqual(assignSeat(m, 2, 'copy-0', 'easy'), ['player-0', 'agent-medium', 'copy-0', 'agent-medium'])
  assert.deepEqual(assignSeat(m, 0, 'agent-hard', 'easy'), ['agent-hard', 'agent-medium', 'agent-medium', 'agent-medium'])
  assert.deepEqual(m, defaultSeats('red', 'medium', 1), 'không sửa mảng cũ')
  assert.equal(playerSeat(m, 0), 0)
  assert.equal(playerSeat(m, 1), -1)
})

test('seatOptions: một bạn không có "Bạn 2"; hai bạn có cả lái và chương trình của bạn 2', () => {
  const one = seatOptions(['An', 'Bình'], 1).map(([v]) => v)
  assert.deepEqual(one, ['player-0', 'agent-easy', 'agent-medium', 'agent-hard', 'copy-0'])
  const two = seatOptions(['An', 'Bình'], 2)
  assert.ok(two.some(([v, t]) => v === 'player-1' && t === 'Bình lái'))
  assert.ok(two.some(([v, t]) => v === 'copy-1' && t === 'Chương trình của Bình'))
})

test('keyName: KeyW ⇒ W, Digit1 ⇒ 1, mũi tên ⇒ ↑, dấu phẩy / chấm', () => {
  assert.deepEqual(['KeyW', 'Digit1', 'ArrowUp', 'ArrowLeft', 'Comma', 'Period'].map(keyName), ['W', '1', '↑', '←', ',', '.'])
})

test('keyRows: đủ phím của bố cục (lái + 8 nút); đi ngang chỉ đế 4 bánh; chức năng nút theo robot', () => {
  const maker = keyRows('solo', defaultConfig('maker'))
  assert.equal(maker.length, 6 + 8)
  assert.equal(maker[0].keys, 'W / ↑')
  assert.equal(maker[0].action, 'Chạy tới')
  assert.match(maker[4].action, /chỉ đế 4 bánh/)
  assert.ok(!/chỉ đế 4 bánh/.test(keyRows('solo', { type: 'maker', drive: 'omni', actuator: 's360' })[4].action))
  // Phím số 1–4 gom vào dòng của nút hình (anh Tuấn 10/11).
  const circle = maker.find((r) => r.keys === 'L / 2 = ○')!
  assert.ok(maker.some((r) => r.keys === 'I / 1 = △') && maker.some((r) => r.keys === 'K / 3 = ✕') && maker.some((r) => r.keys === 'J / 4 = □'))
  assert.equal(circle.action, 'Giữ: mở cửa xả')
  const left = keyRows('left', defaultConfig('maker'))
  assert.equal(left[0].keys, 'W')
  assert.ok(left.some((r) => r.keys === 'R = △'))
  const right = keyRows('right', defaultConfig('maker'))
  assert.equal(right[0].keys, '↑')
  assert.equal(right[4].keys, ',')
  // Mỗi phím của bảng KEY_TABLE xuất hiện đúng một lần.
  for (const layout of ['solo', 'left', 'right'] as const) {
    const shown = keyRows(layout, defaultConfig('co')).flatMap((r) => (r.keys.includes(' = ') ? r.keys.split(' = ')[0].split(' / ') : []))
    for (const code of Object.keys(KEY_TABLE[layout].buttons)) assert.equal(shown.filter((k) => k === keyName(code)).length, 1, `${layout} ${code}`)
  }
})

test('teleopButtons khớp mẫu TeleOp: nút có chức năng ⇔ mẫu đọc nút đó (mọi robot × đế × cơ cấu)', () => {
  for (const type of Object.keys(ROBOTS) as RobotType[]) {
    for (const drive of ROBOTS[type].drives) {
      for (const actuator of ['tt', 's360'] as const) {
        const cfg: RobotConfig = { type, drive, actuator }
        const json = JSON.stringify(sample(cfg, 'teleop'))
        const used = new Set([...json.matchAll(/"BUTTON":"PSB_(\w+)"/g)].map((m) => m[1]))
        const roles = Object.keys(teleopButtons(cfg))
        assert.deepEqual(roles.sort(), [...used].sort(), JSON.stringify(cfg))
      }
    }
  }
})

test('nhãn △/✕ họ Maker: thanh răng đẩy ra mũi (Mẫu Maker) / lùi ra đuôi (mẫu cải tiến), thu về; không lên xuống', () => {
  for (const type of ['maker', 'makerLift', 'makerIntake', 'makerPro'] as const) {
    const b = teleopButtons({ ...defaultConfig(type) })
    assert.match(b.TRIANGLE ?? '', type === 'maker' ? /đẩy ra mũi/ : /lùi ra đuôi/, type)
    assert.match(b.CROSS ?? '', /thu về/, type)
  }
})

test('splitSeats (0.9.1): chỉ chia đôi khi hai bạn cùng lái ở Trận lẻ / Đấu tập — nửa trái bạn 1, nửa phải bạn 2', () => {
  const two = defaultSeats('red', 'medium', 2)
  assert.deepEqual(splitSeats(2, true, two), [0, 1])
  assert.deepEqual(splitSeats(2, true, defaultSeats('blue', 'medium', 2)), [1, 0], 'bạn 1 Xanh vẫn ở nửa trái')
  assert.equal(splitSeats(1, true, defaultSeats('red', 'medium', 1)), null)
  assert.equal(splitSeats(2, false, two), null, 'màn khác (giải đấu, Xưởng…) một camera')
  assert.equal(splitSeats(2, true, assignSeat(two, 1, 'agent-hard', 'medium')), null, 'bạn 2 không lái robot nào')
})
