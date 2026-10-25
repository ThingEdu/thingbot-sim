/**
 * Bài 9 — Tay cầm điều khiển: bộ thu PS2 cắm cổng PS2, não đọc nút mỗi vòng rồi lái hai bánh. Tay cầm
 * ảo là bốn nút ▲ ▼ ◀ ▶ trên sàn (hoặc phím mũi tên). Theo phần "lái tay" của bài R4U V3 trên
 * robot.edu.vn: init PS2 on ThingBot trong khởi động, read PS2 receiver data đầu mỗi vòng lặp.
 */
import { OPEN_FLOOR } from '../arena'
import { makeGrader, motorSpeed } from './grader'
import { B, CAT, ctrl, ev, hat, per, program, S, STARTER, tb, toolbox, wait } from './state'
import type { Card, Lesson, Observation } from './types'

const UP = 'PSB_PAD_UP'
const DOWN = 'PSB_PAD_DOWN'
const LEFT = 'PSB_PAD_LEFT'
const RIGHT = 'PSB_PAD_RIGHT'

const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p>Tay cầm PS2 gửi sóng radio tới <b>bộ thu</b> cắm ở <b>cổng PS2</b> trên mạch. Mỗi vòng lặp, não hỏi bộ thu "nút nào đang được bấm?" rồi quyết định cho bánh quay.</p>
      <p>Tay cầm ảo nằm ở góc sàn: giữ nút ▲ ▼ ◀ ▶ bằng chuột, hoặc giữ phím mũi tên.</p>`,
  },
  {
    title: 'Giữ ▲ để đi tới',
    body: `<ol class="todo">
        <li>${ev('khi Arduino khởi động')}: ${tb('init ThingBot')}, ${tb('init PS2 on ThingBot')}.</li>
        <li>${ev('vòng lặp Arduino')}: ${per('read PS2 receiver data')} đầu tiên.</li>
        <li>Dưới nó: ${ctrl('nếu … thì … nếu không thì')} với ${per('PS2 up button is pressed?')}.</li>
        <li><b>thì</b>: M1 và M2 «forward at 50». <b>nếu không thì</b>: M1 và M2 «at 0».</li>
        <li>Cuối vòng: ${ctrl('đợi 0.02 giây')}.</li>
      </ol>
      <p>Bấm <b>▶ Chạy</b>, giữ ▲: xe đi tới. Nhả ra: xe dừng.</p>`,
    check: 'up',
  },
  {
    title: 'Giữ ▼ để lùi',
    body: `<p>Trong chỗ <b>nếu không thì</b>, đặt thêm một ${ctrl('nếu … thì … nếu không thì')} hỏi ${per('PS2 down button is pressed?')}: <b>thì</b> cho hai bánh «backward at 50», <b>nếu không thì</b> dừng.</p>`,
    check: 'down',
  },
  {
    title: 'Thử thách: rẽ',
    body: `<p>Thêm nút ◀ và ▶: xoay trái thì M1 lùi, M2 tiến; xoay phải thì M1 tiến, M2 lùi. Lái xe đi một vòng quanh sàn!</p>`,
    check: 'turn',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã làm một chiếc xe điều khiển từ xa: <b>tay cầm → bộ thu → não → chip PCA9685 → hai bánh</b>.</p>`,
  },
]

const moving = (o: Observation, dir: 1 | -1) => !!o.car && motorSpeed(o.pwm, 1) * dir > 0.15 && motorSpeed(o.pwm, 2) * dir > 0.15
const spinning = (o: Observation) => motorSpeed(o.pwm, 1) * motorSpeed(o.pwm, 2) < 0
const idle = (o: Observation) => !Object.values(o.pad).some(Boolean)
const reading = (o: Observation) => Object.keys(o.sensors).some((k) => k.startsWith('ps2_'))

export const BAI_9: Lesson = {
  id: 'bai-9',
  no: 9,
  title: 'Tay cầm điều khiển',
  toolbox: toolbox(
    [B.ifElse, B.if, B.waitFor(0.02)],
    [B.init, B.initPS2, B.motor(1, 'forward', 50), B.motor(2, 'forward', 50), B.motor(1, 'backward', 50), B.motor(2, 'backward', 50), B.motor(1, 'forward', 0), B.motor(2, 'forward', 0)],
    [CAT.ps2([B.ps2Read, B.button('PSB_PAD_UP'), B.button('PSB_PAD_DOWN'), B.button('PSB_PAD_LEFT'), B.button('PSB_PAD_RIGHT')])],
  ),
  starter: STARTER,
  example: program(
    hat('event_whenarduinobegin', 30, 30, S.plain('thingBotC3_init', S.plain('thingBotC3_initPS2'))),
    hat(
      'event_whenarduinoloop',
      30,
      190,
      S.plain(
        'ps2_readData',
        S.ifElse(
          S.button(UP),
          S.motor(1, 'forward', 50, S.motor(2, 'forward', 50)),
          S.ifElse(S.button(DOWN), S.motor(1, 'backward', 50, S.motor(2, 'backward', 50)), S.motor(1, 'forward', 0, S.motor(2, 'forward', 0))),
          wait(0.02),
        ),
      ),
    ),
  ),
  cards: CARDS,
  flow: 'ps2',
  controls: ['power', 'pad'],
  arena: OPEN_FLOOR,
  badges: [],
  done: ['up', 'down'],
  createGrader: makeGrader({
    track(o, run) {
      if (reading(o)) run.seen.read = true
    },
    checks: {
      up: { when: (o, run) => run.seen.read === true && o.power && o.pad[UP] && moving(o, 1) },
      down: { when: (o, run) => run.seen.read === true && o.power && o.pad[DOWN] && moving(o, -1) },
      turn: { when: (o) => o.power && (o.pad[LEFT] || o.pad[RIGHT]) && spinning(o) },
    },
    hint(o, run) {
      if (run.elapsed < 800_000) return null
      const pressed = !idle(o)
      const any = motorSpeed(o.pwm, 1) !== 0 || motorSpeed(o.pwm, 2) !== 0
      if (pressed && !run.seen.read)
        return 'Em bấm nút mà não không thấy: cần «init PS2 on ThingBot» trong khi Arduino khởi động, và «read PS2 receiver data» đầu vòng lặp Arduino.'
      if (any && !o.power) return 'Có lệnh mà xe đứng yên: bấm 🔋 Nguồn để bật công tắc nguồn.'
      if (o.card.check === 'up' && o.pad[UP] && !moving(o, 1)) return 'Não thấy nút ▲ nhưng xe chưa đi tới: chỗ «thì» cần M1 và M2 «forward at 50».'
      if (o.card.check === 'down' && o.pad[DOWN] && !moving(o, -1))
        return 'Não thấy nút ▼ nhưng xe chưa lùi: thêm «nếu PS2 down … thì» với M1 và M2 «backward at 50».'
      if (!pressed && any) return 'Nhả nút mà xe vẫn chạy: chỗ «nếu không thì» cuối cùng cần đặt tốc độ 0 cho cả M1 và M2.'
      if (!pressed && run.elapsed > 3_000_000) return o.card.check === 'down' ? 'Giữ nút ▼ (hoặc phím ↓).' : 'Giữ nút ▲ (hoặc phím ↑).'
      return null
    },
  }),
}
