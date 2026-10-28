/**
 * Bài 7 — Động cơ DC: một động cơ TT có bánh cắm cổng M1. Quay tới, đổi chiều, nhanh/chậm. Động cơ lấy
 * điện từ pin: công tắc nguồn tắt thì lệnh vẫn tới chip PCA9685 nhưng bánh không quay.
 *
 * Chiều quay đọc đúng theo mã ThingBlock sinh (`go forward` = kênh B của động cơ có xung, kênh A = 0).
 * Luật `M1 tiến/lùi` của bộ chấm ThingBlock hiện đọc ngược chiều này (xem spec, mục 8), nên bài này
 * tự chấm.
 */
import { makeGrader, motorSpeed } from './grader'
import { B, ctrl, ev, hat, program, S, STARTER, tb, toolbox, wait } from './state'
import type { Card, Lesson } from './types'

const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p>Động cơ vàng có bánh xe cắm vào <b>cổng M1</b>. Não không nối thẳng vào động cơ: lệnh đi qua chip <b>PCA9685</b>, rồi tới <b>IC điều khiển động cơ</b> — con chip đủ khoẻ để đẩy dòng điện lớn từ pin vào động cơ.</p>
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
      <p>Ô <b>2 · Chip PCA</b>: đi tới thì kênh 3 có xung, đi lùi thì kênh 2 có xung. IC động cơ nhìn kênh nào có xung để quyết định chiều dòng điện.</p>`,
    check: 'both',
  },
  {
    title: 'Nhanh và chậm',
    body: `<p>Đổi số tốc độ: thử <b>30</b> rồi <b>100</b>. Số càng lớn, xung càng rộng, bánh càng nhanh.</p>
      <p class="muted">Dưới khoảng 15 thì động cơ thật không thắng được ma sát, bánh đứng yên dù có lệnh.</p>`,
    check: 'speeds',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã điều khiển chiều và tốc độ động cơ. Bài 8 em lắp <b>hai</b> động cơ thành xe: M1 bánh trái, M2 bánh phải.</p>`,
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
