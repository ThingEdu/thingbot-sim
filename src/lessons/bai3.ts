/**
 * Bài 3, từng bước một như cột bài học của ThingBlock. Bước có luật chỉ được ✓ khi bộ mô phỏng thấy mạch
 * làm đúng — bấm Chạy không đủ. Mỗi lần chương trình đổi, kết quả chấm làm lại từ đầu.
 *
 * Bộ chấm `kiểm:` của ThingBlock chưa có luật "khi giữ SW thì…", nên spike tự chấm; về sau thay bằng
 * luật trong `bai.vi.md`.
 */
import { ask, B, bang, ctrl, ev, hat, hieu, program, setLed, STARTER, tb, toolbox } from './state'
import type { Card, Grader, GraderChange, Lesson, Observation } from './types'

const L1 = 15

const CARDS: Card[] = [
  {
    title: 'Nhiệm vụ: đèn pin bấm giữ',
    body: `<p><b>Chuông cửa</b>, nút <b>thang máy</b>, nút <b>đèn pin</b>: cách đơn giản nhất để người "nói" với máy là một <b>nút bấm</b>.</p>
      <p>Nhiệm vụ: biến ThingBot thành đèn pin, <b>giữ nút SW thì đèn L1 sáng, nhả ra thì tắt</b>. Nút SW ở cạnh phải, đèn L1 sát mép dưới tấm Core (chỗ vòng cam).</p>
      ${ask('Nút SW là đầu vào hay đầu ra?', [
        ['Đầu vào', true, 'Nút báo tin cho não ("đang bị bấm"), não không ra lệnh được cho nút. Báo tin cho não là đầu vào; nhận lệnh từ não là đầu ra.'],
        ['Đầu ra', false, 'Não không thể ra lệnh cho nút tự lún xuống. Nút chỉ báo cho não biết em đang bấm hay không.'],
      ])}`,
    look: ['sw', 'l1'],
  },
  {
    title: 'Ghép khối',
    body: `<ol class="todo">
        <li>Kéo ${ctrl('nếu … thì … nếu không thì')} vào trong ${ev('vòng lặp Arduino')}.</li>
        <li>Đặt ${tb('read switch')} vào ô hình lục giác, đó là câu hỏi "nút có đang bấm không?".</li>
        <li>Đặt ${tb('set led 1 100')} vào chỗ <b>thì</b>, ${tb('set led 1 0')} vào chỗ <b>nếu không thì</b>.</li>
        <li>Bấm <b>▶ Chạy</b> ở trên mạch.</li>
      </ol>
      ${ask('Vì sao phải đặt «nếu» trong <b>vòng lặp</b>, không đặt trong «khi Arduino khởi động»?', [
        ['Vì khởi động chỉ chạy một lần lúc bật máy', true, 'Đặt ở khởi động thì não chỉ hỏi nút đúng một lần rồi thôi. Trong vòng lặp, não hỏi lại liên tục nên biết ngay khi em bấm.'],
        ['Vì đặt ở khởi động thì báo lỗi', false, 'Không báo lỗi, nhưng não chỉ hỏi nút đúng một lần lúc bật máy, sau đó không biết em bấm nữa.'],
      ])}`,
    check: 'build',
  },
  {
    title: 'Giữ nút SW',
    body: `<p>Giữ chuột lên nút SW trên mạch, hoặc giữ nút <b>✋ Giữ SW</b>, hoặc giữ phím <kbd>Space</kbd>.</p>
      <p>Nhìn dải <b>1 → 4</b> dưới mạch: tin đi từ nút vào não, não quyết định, rồi lệnh qua chip PCA9685 tới đèn.</p>`,
    check: 'on',
    look: ['sw'],
  },
  {
    title: 'Nhả nút',
    body: `<p>Thả nút ra. Đèn L1 phải <b>tắt</b>.</p>
      <p>Để ý ô <b>2</b>: não hỏi nút <b>hàng nghìn lần mỗi giây</b>, vì vậy đèn đổi ngay khi em nhả.</p>`,
    check: 'off',
    look: ['l1'],
  },
  {
    title: 'Hiểu sâu: 0 và 1 của nút',
    body: `${hieu('Nút chỉ có hai trạng thái', `<p>Nút SW được hàn sẵn vào <b>chân IO3</b> của não. Não không "thấy" ngón tay em; nó chỉ đo xem chân IO3 <b>có điện hay không</b>:</p>
      ${bang(['Em làm', 'Chân IO3', 'read switch'], [['Nhả nút', '3,3 V → <b>1</b>', 'sai'], ['Bấm nút', '0 V → <b>0</b>', '<b>đúng</b>']])}
      <p>Lạ không: <b>bấm lại là 0</b>! Vì nút này nối kiểu "bấm thì kéo chân xuống 0 V" (người ta gọi là điện trở kéo lên). Khối ${tb('read switch')} đã <b>đảo lại cho em</b>, nên em chỉ cần nhớ: bấm là <b>đúng</b>.</p>`)}
      ${hieu('Vì sao là IO3 mà không phải chân khác?', `<p>Chip não ESP32-C3 có nhiều chân, mỗi chân một số: IO0, IO1, IO2, IO3… Chân nào nối với cái gì là do <b>người thiết kế mạch</b> chọn rồi hàn cố định. Lập trình viên đọc <b>sơ đồ mạch</b> để biết. Trên ThingBot: nút SW ở IO3, cổng cảm biến ở IO0 và IO4, hai dây I2C ở IO8 và IO9.</p>`)}`,
  },
  {
    title: 'Thử thách: đèn mờ',
    body: `<p>Làm cho đèn chỉ <b>sáng một nửa</b> khi giữ nút: đổi số trong ${tb('set led 1 100')} thành <b>50</b>, rồi giữ nút.</p>
      <p>Ô <b>3</b> cho em thấy chip PCA9685 nhận con số nào: nó có 4096 bậc, 50% là khoảng 2048.</p>`,
    check: 'half',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em vừa làm một vòng <b>đầu vào → não → đầu ra</b>: nút báo tin, não quyết định, đèn làm theo. Đèn pin, chuông cửa, nút thang máy đều chạy theo đúng vòng này.</p>
      <p class="muted">Nghĩ thêm: muốn <b>bấm một lần sáng, bấm lần nữa tắt</b> như công tắc đèn phòng thì não phải <b>nhớ</b> đèn đang bật hay tắt. Đó là việc của <b>biến</b>, em sẽ gặp ở các ví dụ ThingBlock.</p>`,
  },
]

const HOLD_MS = 250
const STUCK_MS = 1200

function createGrader(onChange: GraderChange): Grader {
  let passed = new Set<string>()
  let hint: string | null = null
  let since = 0
  let lastKey = ''
  let pressedOnce = false

  const emit = () => onChange(passed, hint)
  const pass = (id: string) => {
    if (passed.has(id)) return
    passed.add(id)
    hint = null
    emit()
  }

  const reset = () => {
    passed = new Set()
    hint = null
    since = 0
    lastKey = ''
    pressedOnce = false
    emit()
  }
  return {
    // Bài 3: mỗi lần chương trình đổi, chấm lại từ đầu (chương trình mới phải tự chứng minh lại).
    restart: reset,
    clear: reset,
    observe(o: Observation) {
      if (!o.running) return
      const duty = o.pwm[L1]
      if (o.readsSwitch) pass('build')
      if (o.pressed) pressedOnce = true
      const lit = duty > 0
      const key = `${o.pressed}:${duty}`
      if (key !== lastKey) {
        lastKey = key
        since = o.now
      }
      const held = o.now - since

      if (o.pressed && lit && held >= HOLD_MS) {
        pass('on')
        if (duty >= 1500 && duty <= 2600) pass('half')
      }
      if (!o.pressed && !lit && pressedOnce && passed.has('on') && held >= HOLD_MS) pass('off')

      let next: string | null = null
      if (!o.readsSwitch && held >= 1500) {
        next = 'Chương trình chưa hỏi nút SW. Em đã đặt khối «read switch» vào ô lục giác của «nếu … thì» chưa?'
      } else if (o.pressed && !lit && held >= STUCK_MS) {
        next = 'Giữ nút mà đèn chưa sáng? Khối «set led 1 …» ở chỗ «thì» cần độ sáng lớn hơn 0.'
      } else if (!o.pressed && lit && pressedOnce && held >= STUCK_MS) {
        next = passed.has('on')
          ? 'Nhả nút mà đèn vẫn sáng? Chương trình mới có lệnh BẬT. Dùng «nếu … thì … nếu không thì» và đặt «set led 1 0» vào chỗ «nếu không thì».'
          : 'Đèn sáng cả khi không bấm nút. Lệnh bật đèn cần nằm trong chỗ «thì».'
      }
      if (next !== hint) {
        hint = next
        emit()
      }
    },
  }
}

export const BAI_3: Lesson = {
  id: 'bai-3',
  no: 3,
  title: 'Nút bấm điều khiển đèn',
  toolbox: toolbox([B.if, B.ifElse, B.wait], [B.init, B.switch, B.setLed(100), B.setLed(0)]),
  starter: STARTER,
  // Lời giải mẫu: nếu nút được bấm thì L1 sáng 100, không thì 0.
  example: program(
    hat('event_whenarduinobegin', 30, 30, { type: 'thingBotC3_init' }),
    hat('event_whenarduinoloop', 30, 150, {
      type: 'control_if_else',
      inputs: {
        CONDITION: { block: { type: 'thingBotC3_switch' } },
        SUBSTACK: { block: setLed(100) },
        SUBSTACK2: { block: setLed(0) },
      },
    }),
  ),
  cards: CARDS,
  flow: 'button',
  badges: ['sw', 'esp', 'pca', 'l1'],
  done: ['on', 'off'],
  createGrader,
}
