/**
 * Bài 7 — Động cơ DC: một động cơ TT có bánh cắm cổng M1. Quay tới, đổi chiều, nhanh/chậm. Động cơ lấy
 * điện từ pin: công tắc nguồn tắt thì lệnh vẫn tới chip PCA9685 nhưng bánh không quay.
 *
 * Chiều quay đọc đúng theo mã ThingBlock sinh (`go forward` = kênh B của động cơ có xung, kênh A = 0).
 * Luật `M1 tiến/lùi` của bộ chấm ThingBlock hiện đọc ngược chiều này (xem spec, mục 8), nên bài này
 * tự chấm.
 */
import { makeGrader, motorSpeed } from './grader'
import { ask, B, ctrl, ev, giong, hat, hieu, program, S, STARTER, tb, toolbox, wait } from './state'
import type { Card, Lesson } from './types'

const CARDS: Card[] = [
  {
    title: 'Nhiệm vụ: băng chuyền',
    body: `<p>Đèn và màn hình giúp robot <b>nói</b>. Động cơ giúp robot <b>làm việc thật</b>: quay quạt, chạy <b>băng chuyền</b> ở siêu thị, kéo bánh xe.</p>
      <p>Nhiệm vụ: cho động cơ vàng ở <b>cổng M1</b> quay tới, quay lùi như băng chuyền chở hàng qua lại, rồi đổi tốc độ.</p>
      ${giong('động cơ là <b>cơ bắp</b>. Não người không tự nhấc được cặp sách; não gửi tín hiệu rất nhỏ, cơ bắp mới dùng sức. Ở robot, <b>mạch công suất</b> nhận tín hiệu nhỏ từ não rồi đẩy điện mạnh từ pin vào động cơ.')}
      ${ask('Vì sao não không nối thẳng vào động cơ?', [
        ['Động cơ cần dòng điện lớn hơn não chịu được nhiều lần', true, 'Chân của não chỉ cho ra dòng điện rất nhỏ, đủ bật đèn tín hiệu. Nối thẳng động cơ vào sẽ hỏng chân não. Vì vậy lệnh đi qua mạch công suất rồi tới IC điều khiển động cơ, con chip đủ khoẻ để đẩy điện từ pin.'],
        ['Vì động cơ ở xa não', false, 'Khoảng cách không phải vấn đề. Vấn đề là động cơ "ăn" dòng điện quá lớn.'],
      ])}
      <p>Nhớ bài 1: động cơ chỉ quay khi có <b>pin</b> và đã <b>bật công tắc nguồn</b> (nút 🔋 Nguồn).</p>`,
    look: ['pca'],
  },
  {
    title: 'Quay tới',
    body: `<p>Kéo ${tb('set motor M1 go forward at 60')} vào ${ev('khi Arduino khởi động')}, dưới ${tb('init ThingBot')}. Bật nguồn, bấm <b>▶ Chạy</b>.</p>`,
    check: 'fwd',
  },
  {
    title: 'Tới rồi lùi',
    body: `<p>Trong ${ev('vòng lặp Arduino')} xếp:</p>
      <ol class="todo">
        <li>${tb('set motor M1 go forward at 60')}, ${ctrl('đợi 2 giây')}</li>
        <li>${tb('set motor M1 go backward at 60')}, ${ctrl('đợi 2 giây')}</li>
      </ol>
      ${hieu('Chiều quay là chuyện 0 và 1', `<p>Cổng M1 dùng <b>hai kênh</b> của mạch công suất. Ô <b>2 · Mạch công suất</b> cho thấy: đi tới thì <b>kênh 3</b> có xung, kênh 2 bằng 0; đi lùi thì ngược lại. IC động cơ nhìn kênh nào "bật" để đẩy dòng điện theo chiều nào. Đổi chiều điện là đổi chiều quay.</p>`)}`,
    check: 'both',
  },
  {
    title: 'Nhanh và chậm',
    body: `${ask('Tốc độ 30 và 100 khác nhau thế nào ở mức điện?', [
        ['Bật tắt nhanh, thời gian bật dài hay ngắn khác nhau', true, 'Giống đèn sáng 50% ở bài 2: chip bật tắt điện cực nhanh. Số càng lớn, thời gian "bật" càng dài, động cơ nhận nhiều điện hơn nên quay nhanh hơn.'],
        ['Tốc độ 100 dùng pin khác', false, 'Cùng một pin. Chỉ khác ở chỗ điện được bật bao lâu trong mỗi nhịp.'],
      ])}
      <p>Giờ thử thật: đổi số tốc độ thành <b>30</b> rồi <b>100</b>.</p>
      <p class="muted">Dưới khoảng 15 thì động cơ thật không thắng được ma sát, bánh đứng yên dù có lệnh.</p>`,
    check: 'speeds',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã điều khiển <b>chiều</b> (kênh nào bật) và <b>tốc độ</b> (bật bao lâu) của động cơ, như bộ điều khiển băng chuyền.</p>
      <p>Bài 8 em lắp <b>hai</b> động cơ thành xe: M1 bánh trái, M2 bánh phải.</p>`,
  },
]

export const BAI_7: Lesson = {
  id: 'bai-7',
  no: 7,
  title: 'Động cơ DC',
  toolbox: toolbox([B.wait], [B.init, B.motor(1, 'forward', 60), B.motor(1, 'backward', 60), B.motor(1, 'forward', 0)]),
  starter: STARTER,
  example: program(
    hat('event_whenarduinobegin', 30, 30, S.plain('thingBotC3_init')),
    hat('event_whenarduinoloop', 30, 150, S.motor(1, 'forward', 60, wait(2, S.motor(1, 'backward', 60, wait(2))))),
  ),
  cards: CARDS,
  flow: 'motor',
  controls: ['power'],
  props: ['motor'],
  badges: ['esp', 'pca', null, 'wheel'],
  done: ['fwd', 'both'],
  createGrader: makeGrader({
    track(o, run) {
      const v = motorSpeed(o.pwm, 1)
      if (!o.power) return
      if (v > 0.15) run.seen.fwd = true
      if (v < -0.15) run.seen.back = true
      if (Math.abs(v) > 0.15 && Math.abs(v) <= 0.45) run.seen.slow = true
      if (Math.abs(v) >= 0.9) run.seen.fast = true
    },
    checks: {
      fwd: { when: (o) => o.power && motorSpeed(o.pwm, 1) > 0.15, hold: 500_000 },
      both: { when: (_o, run) => run.seen.fwd === true && run.seen.back === true, hold: 0 },
      speeds: { when: (_o, run) => run.passed.has('both') && run.seen.slow === true && run.seen.fast === true, hold: 0 },
    },
    hint(o, run) {
      if (run.elapsed < 1_200_000) return null
      const v = motorSpeed(o.pwm, 1)
      const others = ([2, 3, 4] as const).some((m) => motorSpeed(o.pwm, m) !== 0)
      if (v === 0 && others) return 'Động cơ đang cắm cổng M1: chọn M1 trong khối «set motor».'
      if (v !== 0 && !o.power) return 'Có lệnh cho động cơ nhưng bánh không quay: bấm 🔋 Nguồn để bật công tắc nguồn.'
      if (v !== 0 && Math.abs(v) < 0.15) return 'Tốc độ nhỏ quá, động cơ không thắng được ma sát: thử số từ 40 trở lên.'
      if (o.card.check === 'both' && run.elapsed > 5_000_000 && !(run.seen.fwd && run.seen.back))
        return run.seen.fwd
          ? 'Bánh mới quay tới: thêm «đợi 2 giây», «set motor M1 go backward at 60», «đợi 2 giây» — tất cả trong vòng lặp Arduino.'
          : 'Bánh chưa quay tới: thêm «set motor M1 go forward at 60».'
      if (v === 0 && !run.seen.fwd && !run.seen.back) return 'Chưa có lệnh cho động cơ: kéo khối «set motor M1 go forward at 60» vào chương trình.'
      return null
    },
  }),
}
