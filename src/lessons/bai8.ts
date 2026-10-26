/**
 * Bài 8 — Xe đi thẳng và rẽ: hai động cơ, M1 bánh trái, M2 bánh phải (đấu nối khoá ThingBlock). Đi
 * thẳng 2 giây rồi dừng, xoay tại chỗ, thử thách đi hình vuông. Chấm theo chuyển động của xe trên sàn.
 */
import { OPEN_FLOOR } from '../arena'
import { makeGrader, motorSpeed } from './grader'
import { B, ctrl, ev, hat, program, S, STARTER, tb, toolbox, wait } from './state'
import type { Card, Lesson } from './types'

const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p>Bây giờ ThingBot là một <b>chiếc xe</b>: động cơ <b>M1</b> quay bánh <b>trái</b>, <b>M2</b> quay bánh <b>phải</b>. Xe chạy trên sàn có ô lưới 20 cm.</p>
      <p>Hai bánh cùng tiến thì xe đi thẳng. Một bánh tiến, một bánh lùi thì xe <b>xoay tại chỗ</b>.</p>`,
  },
  {
    title: 'Đi thẳng rồi dừng',
    body: `<p>Trong ${ev('khi Arduino khởi động')}, dưới ${tb('init ThingBot')}:</p>
      <ol class="todo">
        <li>${tb('set motor M1 go forward at 50')} và ${tb('set motor M2 go forward at 50')}</li>
        <li>${ctrl('đợi 2 giây')}</li>
        <li>${tb('set motor M1 … at 0')} và ${tb('set motor M2 … at 0')} để dừng</li>
      </ol>
      <p>Bấm <b>▶ Chạy</b>. Xe phải đi thẳng ít nhất 40 cm rồi dừng.</p>`,
    check: 'straight',
  },
  {
    title: 'Xoay tại chỗ',
    body: `<p>Thêm vào sau khi dừng: ${tb('set motor M1 go forward at 50')}, ${tb('set motor M2 go backward at 50')}, ${ctrl('đợi … giây')}, rồi dừng cả hai.</p>
      <p>Chỉnh số trong ${ctrl('đợi')} cho xe xoay khoảng <b>một góc vuông</b> (90 độ).</p>`,
    check: 'turn',
  },
  {
    title: 'Thử thách: hình vuông',
    body: `<p>Dùng ${ctrl('lặp lại 4')}: bên trong cho xe đi thẳng 1 giây rồi xoay một góc vuông. Xe phải về gần chỗ xuất phát (vòng tròn xanh).</p>
      <p class="muted">Bấm <b>↺ Đặt lại xe</b> để đưa xe về chỗ cũ.</p>`,
    check: 'square',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã lái xe bằng cách điều khiển <b>riêng từng bánh</b>. Bài 9 em lái bằng <b>tay cầm</b>.</p>`,
  },
]

const stopped = (pwm: number[]) => motorSpeed(pwm, 1) === 0 && motorSpeed(pwm, 2) === 0

export const BAI_8: Lesson = {
  id: 'bai-8',
  no: 8,
  title: 'Xe đi thẳng – rẽ',
  toolbox: toolbox(
    [B.wait, B.repeat],
    [B.init, B.motor(1, 'forward', 50), B.motor(2, 'forward', 50), B.motor(1, 'backward', 50), B.motor(2, 'backward', 50), B.motor(1, 'forward', 0), B.motor(2, 'forward', 0)],
  ),
  starter: STARTER,
  example: program(
    hat(
      'event_whenarduinobegin',
      30,
      30,
      S.plain('thingBotC3_init', S.motor(1, 'forward', 50, S.motor(2, 'forward', 50, wait(2, S.motor(1, 'forward', 0, S.motor(2, 'forward', 0)))))),
    ),
    hat('event_whenarduinoloop', 30, 470),
  ),
  cards: CARDS,
  flow: 'car',
  controls: ['power'],
  arena: OPEN_FLOOR,
  badges: [],
  done: ['straight', 'turn'],
  createGrader: makeGrader({
    track(o, run) {
      const car = o.car
      if (!car) return
      run.seen.startX ??= car.x
      run.seen.startY ??= car.y
      if (motorSpeed(o.pwm, 1) * motorSpeed(o.pwm, 2) < 0) run.seen.spun = true
    },
    checks: {
      straight: {
        when: (o) => !!o.car && o.car.travelled >= 40 && o.car.turned <= 15 && stopped(o.pwm),
      },
      // Xoay tại chỗ (hai bánh ngược chiều) rồi dừng, tổng góc khoảng một góc vuông (cộng cả đoạn đi thẳng).
      turn: { when: (o, run) => !!o.car && run.seen.spun === true && o.car.turned >= 65 && o.car.turned <= 130 && stopped(o.pwm) },
      square: {
        when: (o, run) =>
          !!o.car &&
          o.car.travelled >= 120 &&
          o.car.turned >= 300 &&
          stopped(o.pwm) &&
          Math.hypot(o.car.x - Number(run.seen.startX), o.car.y - Number(run.seen.startY)) <= 25,
      },
    },
    hint(o, run) {
      const car = o.car
      if (!car || run.elapsed < 1_000_000) return null
      const l = motorSpeed(o.pwm, 1)
      const r = motorSpeed(o.pwm, 2)
      if ((l !== 0 || r !== 0) && !o.power) return 'Có lệnh mà xe đứng yên: bấm 🔋 Nguồn để bật công tắc nguồn.'
      if (car.bumps > 0) return 'Xe đâm vào tường! Bấm ↺ Đặt lại xe rồi chạy lại, hoặc giảm số trong khối đợi.'
      if (o.card.check === 'straight') {
        if (l === 0 && r === 0 && car.travelled < 5) return 'Xe chưa chạy: thêm «set motor M1 go forward at 50» và «set motor M2 go forward at 50».'
        if (l !== 0 && r === 0) return 'Chỉ bánh trái (M1) quay nên xe đi vòng: thêm «set motor M2 go forward at 50».'
        if (r !== 0 && l === 0) return 'Chỉ bánh phải (M2) quay nên xe đi vòng: thêm «set motor M1 go forward at 50».'
        if (l < 0 && r < 0) return 'Xe đang lùi: chọn «forward» cho cả hai bánh.'
        if (car.turned > 15) return 'Xe bị lệch: hai bánh cần cùng chiều «forward» và cùng tốc độ.'
        if (run.elapsed > 4_000_000 && !(l === 0 && r === 0)) return 'Xe chưa dừng: sau «đợi 2 giây», đặt tốc độ 0 cho cả M1 và M2.'
      }
      if (o.card.check === 'turn' && run.elapsed > 4_000_000) {
        if (!run.seen.spun) return 'Muốn xoay tại chỗ: M1 «forward», M2 «backward» (hoặc ngược lại), rồi đợi một chút.'
        if (l === 0 && r === 0 && car.turned > 130)
          return `Xe xoay khoảng ${Math.round(car.turned)} độ — quá một góc vuông. Giảm số trong khối «đợi» sau lệnh xoay (thử 0.35).`
        if (l === 0 && r === 0 && car.turned < 65)
          return `Xe mới xoay khoảng ${Math.round(car.turned)} độ. Tăng số trong khối «đợi» sau lệnh xoay.`
      }
      return null
    },
  }),
}
