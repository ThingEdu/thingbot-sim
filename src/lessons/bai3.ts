/**
 * Bài 3, từng bước một như cột bài học của ThingBlock. Bước có luật chỉ được ✓ khi bộ mô phỏng thấy mạch
 * làm đúng — bấm Chạy không đủ. Mỗi lần chương trình đổi, kết quả chấm làm lại từ đầu.
 *
 * Bộ chấm `kiểm:` của ThingBlock chưa có luật "khi giữ SW thì…", nên spike tự chấm; về sau thay bằng
 * luật trong `bai.vi.md`.
 */
import { B, ctrl, ev, hat, program, setLed, STARTER, tb, toolbox } from './state'
import type { Card, Grader, GraderChange, Lesson, Observation } from './types'

const L1 = 15

const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p>Trên mạch ThingBot có <b>nút SW</b> (cạnh phải) và <b>đèn L1</b> (nằm sát mép dưới tấm Core, gần nút SW) — chỗ có vòng cam nhấp nháy.</p>
      <p>Bấm <b>👁 Dưới Core</b> để thấy những con chip nằm bên dưới.</p>
      <p>Hôm nay em làm cho <b>đèn sáng khi giữ nút, tắt khi nhả nút</b>.</p>`,
    look: ['sw', 'l1'],
  },
  {
    title: 'Ghép khối',
    body: `<ol class="todo">
        <li>Kéo ${ctrl('nếu … thì … nếu không thì')} vào trong ${ev('vòng lặp Arduino')}.</li>
        <li>Đặt ${tb('read switch')} vào ô hình lục giác.</li>
        <li>Đặt ${tb('set led 1 100')} vào chỗ <b>thì</b>, ${tb('set led 1 0')} vào chỗ <b>nếu không thì</b>.</li>
        <li>Bấm <b>▶ Chạy</b> ở trên mạch.</li>
      </ol>`,
    check: 'build',
  },
  {
    title: 'Giữ nút SW',
    body: `<p>Giữ chuột lên nút SW trên mạch, hoặc giữ nút <b>✋ Giữ SW</b>, hoặc giữ phím <kbd>Space</kbd>.</p>
      <p>Nhìn dải <b>1 → 4</b> dưới mạch: dữ liệu đi từ nút vào não, qua chip PCA9685 rồi tới đèn.</p>`,
    check: 'on',
    look: ['sw'],
  },
  {
    title: 'Nhả nút',
    body: `<p>Thả nút ra. Đèn L1 phải <b>tắt</b>.</p>
      <p>Để ý ô <b>2</b>: não hỏi nút liên tục hàng nghìn lần mỗi giây — vì vậy đèn đổi ngay khi em nhả.</p>`,
    check: 'off',
    look: ['l1'],
  },
  {
    title: 'Thử thách',
    body: `<p>Làm cho đèn chỉ <b>sáng một nửa</b> khi giữ nút: đổi số trong ${tb('set led 1 100')} thành <b>50</b>, rồi giữ nút.</p>
      <p>Ô <b>3</b> sẽ cho em thấy chip PCA9685 nhận con số nào.</p>`,
    check: 'half',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã cho <b>não</b> đọc nút và ra lệnh cho <b>chip PCA9685</b> bật tắt đèn.</p>
      <p>Muốn thử trên kit thật: mở ThingBlock, chọn bo ThingBot, ghép đúng các khối này rồi bấm <b>Nạp</b>.</p>`,
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
