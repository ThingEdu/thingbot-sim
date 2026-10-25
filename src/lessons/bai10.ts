/**
 * Bài 10 — Dự án: xe tự tránh vật cản. Ghép bài 6 (siêu âm) với bài 8 (hai bánh): vật gần thì xoay, không
 * thì đi thẳng — chương trình "tự lái" của bài R4U trên robot.edu.vn (≈ FanRoc mini).
 * Chấm: xe tự đi được 3 m trên sàn có vật cản mà không đâm lần nào.
 *
 * Ngưỡng 25 cm (bài R4U dùng 15–20 cm cho xe thật): thử 300 lần với hướng xuất phát và nhịp vòng lặp
 * lệch ngẫu nhiên, ngưỡng 25 ở tốc độ 50 không trượt lần nào, còn 20 cm trượt ~2 % vì xe cần chỗ để
 * xoay chứ không chỉ để phanh.
 */
import { OBSTACLE_COURSE } from '../arena'
import { SONAR_KEY } from '../sim-extra'
import { makeGrader, motorSpeed } from './grader'
import { B, CAT, ctrl, ev, hat, op, per, program, S, STARTER, tb, toolbox, wait } from './state'
import type { Card, Lesson } from './types'

const BUZZER = 14
const GOAL_CM = 300
const NEAR = 25
const lessThan25 = { ...B.lessThan, inputs: { OPERAND1: { shadow: { type: 'text', fields: { TEXT: '' } } }, OPERAND2: { shadow: { type: 'text', fields: { TEXT: String(NEAR) } } } } }

const CARDS: Card[] = [
  {
    title: 'Dự án: xe tự lái',
    body: `<p>Xe có <b>cảm biến siêu âm</b> ở mũi (TRIG IO0, ECHO IO4) và hai bánh M1 (trái), M2 (phải). Trên sàn có mấy hộp gỗ.</p>
      <p>Nhiệm vụ: xe <b>tự chạy 3 mét</b> mà <b>không đâm</b> vào đâu. Em đã có đủ mảnh ghép từ bài 6 và bài 8!</p>`,
  },
  {
    title: 'Lắp bộ não tự lái',
    body: `<p>Trong ${ev('vòng lặp Arduino')}:</p>
      <ol class="todo">
        <li>${ctrl('nếu … thì … nếu không thì')} với ${op('… < 25')} và ${per('ultrasonic … read distance cm')}.</li>
        <li><b>thì</b> (vật gần): M1 «forward at 50», M2 «backward at 50» — xoay tránh.</li>
        <li><b>nếu không thì</b>: M1 và M2 «forward at 50» — đi thẳng.</li>
        <li>Cuối vòng: ${ctrl('đợi 0.05 giây')}.</li>
      </ol>
      <p>Bật 🔋 Nguồn, bấm <b>▶ Chạy</b>. Đường đỏ chấm là tia siêu âm.</p>`,
    check: 'avoid',
  },
  {
    title: 'Nhanh hơn thì sao?',
    body: `<p>Đổi tốc độ đi thẳng lên <b>80</b> rồi bấm Chạy vài lần. Xe có hay đâm hơn không?</p>
      <p>Thử chỉnh ngưỡng ${op('… < 25')} và tốc độ xoay để tìm cặp số chạy an toàn nhất. Ghi lại các lần thử!</p>
      <p class="muted">Xe càng nhanh thì càng cần thấy vật từ xa hơn — và càng dễ quệt hông khi lách qua góc hộp.</p>`,
  },
  {
    title: 'Thử thách: còi báo',
    body: `<p>Cho xe <b>kêu</b> mỗi lần tránh vật: thêm ${tb('play note C octave 5 for 0.25 beats')} vào chỗ <b>thì</b>.</p>`,
    check: 'beep',
    optional: true,
  },
  {
    title: 'Hoàn thành 10 bài! 🏆',
    body: `<p>Em đã đi hết đường: <b>đèn → nút → màn hình → servo → cảm biến → động cơ → xe → tay cầm → xe tự lái</b>.</p>
      <p>Mang chương trình sang ThingBlock, chọn bo ThingBot, bấm <b>Nạp</b> và cho xe thật chạy thử nhé!</p>`,
  },
]

export const BAI_10: Lesson = {
  id: 'bai-10',
  no: 10,
  title: 'Dự án: xe tránh vật cản',
  toolbox: toolbox(
    [B.ifElse, B.if, B.waitFor(0.05)],
    [B.init, B.motor(1, 'forward', 50), B.motor(2, 'forward', 50), B.motor(1, 'backward', 50), B.motor(2, 'backward', 50), B.motor(1, 'forward', 0), B.motor(2, 'forward', 0), B.playNote],
    [CAT.operators([lessThan25, B.greaterThan, B.and]), CAT.sensor([B.sonar])],
  ),
  starter: STARTER,
  example: program(
    hat('event_whenarduinobegin', 30, 30, S.plain('thingBotC3_init')),
    hat(
      'event_whenarduinoloop',
      30,
      150,
      S.ifElse(
        S.lessThan(S.sonar(), NEAR),
        S.motor(1, 'forward', 50, S.motor(2, 'backward', 50)),
        S.motor(1, 'forward', 50, S.motor(2, 'forward', 50)),
        wait(0.05),
      ),
    ),
  ),
  cards: CARDS,
  flow: 'avoid',
  controls: ['power'],
  arena: OBSTACLE_COURSE,
  badges: [],
  done: ['avoid'],
  createGrader: makeGrader({
    track(o, run) {
      if (o.sensors[SONAR_KEY]) run.seen.read = true
      if (o.car && o.car.sonar < NEAR + 5 && o.pwm[BUZZER] > 0) run.seen.beep = true
    },
    checks: {
      avoid: { when: (o, run) => run.seen.read === true && !!o.car && o.car.travelled >= GOAL_CM && o.car.bumps === 0, hold: 0 },
      beep: { when: (_o, run) => run.passed.has('avoid') && run.seen.beep === true, hold: 0 },
    },
    hint(o, run) {
      const car = o.car
      if (!car || run.elapsed < 1_500_000) return null
      const l = motorSpeed(o.pwm, 1)
      const r = motorSpeed(o.pwm, 2)
      if ((l !== 0 || r !== 0) && !o.power) return 'Có lệnh mà xe đứng yên: bấm 🔋 Nguồn để bật công tắc nguồn.'
      if (Object.keys(o.sensors).some((k) => k.startsWith('sonar_') && k !== SONAR_KEY))
        return 'Cảm biến cắm ở TRIG IO0, ECHO IO4: sửa hai ô số trong khối ultrasonic thành 0 và 4.'
      if (!run.seen.read) return 'Xe chưa "nhìn": đặt khối «ultrasonic … read distance cm» vào ô so sánh của «nếu».'
      if (car.bumps > 0)
        return 'Xe đâm vào vật! Tăng ngưỡng (ví dụ 30 cm) hoặc giảm tốc độ, rồi bấm Chạy lại — xe sẽ về chỗ xuất phát.'
      if (car.travelled < 30 && car.turned > 540) return 'Xe cứ xoay tại chỗ: chỗ «nếu không thì» cần cho cả M1 và M2 «forward».'
      if (o.card.check === 'beep' && run.elapsed > 5_000_000 && !run.seen.beep)
        return 'Xe tránh mà chưa kêu: thêm «play note C octave 5 for 0.25 beats» vào chỗ «thì».'
      return null
    },
  }),
}
