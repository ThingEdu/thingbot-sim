/**
 * Bài 1 — Làm quen ThingBot: không ghép khối. Trẻ bấm vào từng bộ phận trên mạch để biết nó tên gì,
 * làm gì và điều khiển bằng khối nào; rồi nhìn xuyên Core tìm hai thứ bị che; cuối cùng trả lời hai câu
 * đố về đường đi của lệnh và về nguồn điện.
 *
 * Danh sách bộ phận và lời giải thích theo trang "Làm quen ThingBot" của khóa ThingBlock trên
 * robot.edu.vn (ảnh ThingBotShield đánh số 1–9). Vị trí là px trên ảnh mạch đã lắp; ảnh Shield xoay
 * 180° so với ảnh này. Hai cổng động cơ phía trên in chữ M4, M3 trên Shield; hai cổng phía dưới (M1, M2)
 * không in tên trên ảnh nên không ghi riêng cổng nào là M1.
 */
import { ev, STARTER, tb, toolbox } from './state'
import type { Card, Grader, GraderChange, Lesson, Part } from './types'

const PARTS: Part[] = [
  {
    id: 'core',
    name: 'ThingBot Core — bộ não',
    at: [{ px: 770, py: 725 }],
    info: `Tấm mạch nằm trên cùng. <b>Chip ESP32-C3</b> — bộ não — nằm ở <b>mặt dưới</b> tấm này vì Core cắm úp xuống Shield. Cổng <b>USB-C</b> dùng để nạp chương trình và nuôi mạch.`,
    block: `${tb('init ThingBot')}, rồi mọi khối trong ${ev('khi Arduino khởi động')} và ${ev('vòng lặp Arduino')}`,
  },
  {
    id: 'sw',
    name: 'Nút bấm SW',
    at: [{ px: 1150, py: 797 }],
    info: 'Nút nhấn ở cạnh phải. Nối vào chân <b>IO3</b> của não: nhả nút là HIGH (3,3 V), bấm là LOW (0 V).',
    block: tb('read switch'),
  },
  {
    id: 'l1',
    name: 'Đèn L1 (đỏ)',
    at: [{ px: 1035, py: 840 }],
    info: 'Đèn đỏ nằm trên Shield, sát mép dưới Core nên bị che một phần. Nhận lệnh từ chip PCA9685, kênh 15.',
    block: tb('set led 1 100'),
  },
  {
    id: 'l2',
    name: 'Đèn L2 (xanh lá)',
    at: [{ px: 532, py: 845 }],
    info: 'Đèn xanh lá ở mép trái dưới Core. Nhận lệnh từ chip PCA9685, kênh 13.',
    block: tb('set led 2 100'),
  },
  {
    id: 'i2c',
    name: 'Cổng I2C',
    at: [{ px: 1110, py: 630 }],
    info: 'Cổng 4 chân để cắm thêm màn hình OLED hoặc cảm biến MPU6050. Dùng chung đường I2C (chân 8 và 9) với chip PCA9685, nên đừng dùng chân 8, 9 cho cảm biến khác.',
    block: 'các khối màn hình OLED',
  },
  {
    id: 'ps2',
    name: 'Cổng PS2',
    at: [{ px: 1110, py: 430 }],
    info: 'Cổng 6 chân để cắm bộ thu của tay cầm PS2 — dùng khi lái xe bằng tay cầm.',
    block: tb('init PS2 on ThingBot'),
  },
  {
    id: 'motor',
    name: 'Cổng động cơ M1–M4',
    at: [
      { px: 555, py: 185, label: 'M3' },
      { px: 1005, py: 185, label: 'M4' },
      { px: 550, py: 965 },
      { px: 990, py: 965 },
    ],
    info: 'Bốn cổng 2 chân cho bốn động cơ bánh xe. Hai cổng phía trên in chữ <b>M3</b>, <b>M4</b>; hai cổng phía dưới là M1, M2. Động cơ chỉ quay khi có pin và đã bật công tắc nguồn.',
    block: tb('set motor M1 go forward at 60'),
  },
  {
    id: 'power',
    name: 'Công tắc nguồn',
    at: [{ px: 855, py: 190 }],
    info: 'Gạt sang ON để <b>động cơ và servo có điện</b> từ pin. Dây USB chỉ nuôi mạch và nạp chương trình, không đủ cho động cơ. Không có khối lệnh nào cho công tắc này.',
  },
  {
    id: 'jack',
    name: 'Jack nguồn pin',
    at: [{ px: 680, py: 200 }],
    info: 'Chỗ cắm khay <b>2 viên pin 18650</b> (+ và −, tối đa 9 V). Pin sạc đầy cho khoảng 8,4 V.',
  },
  {
    id: 'servo',
    name: 'Cổng servo S1–S5',
    at: [{ px: 450, py: 560 }],
    info: 'Hàng chân bên trái: năm cổng S1–S5, mỗi cổng 3 chân <b>GND – 5V – tín hiệu</b>. Cắm servo hoặc module 3 chân.',
    block: tb('set servo S1 to angle 90 degrees'),
  },
  {
    id: 'gpio',
    name: 'Cổng cảm biến (GPIO)',
    at: [
      { px: 680, py: 965 },
      { px: 855, py: 965 },
    ],
    info: 'Hai cổng 4 chân có chân GPIO (<b>IO0</b>, <b>IO4</b>) để cắm cảm biến như DHT11 hay cảm biến siêu âm.',
    block: 'các khối cảm biến',
  },
  {
    id: 'pca',
    name: 'Chip PCA9685 — trợ lý của não',
    at: [{ px: 764, py: 618 }],
    under: true,
    info: 'Nằm trên Shield, <b>dưới Core</b>. Não gửi lệnh cho chip này qua hai dây I2C (SDA, SCL); chip này điều khiển trực tiếp <b>đèn, còi, động cơ và servo</b>. Hai chip nhỏ hai bên nó điều khiển động cơ.',
  },
  {
    id: 'buzzer',
    name: 'Còi',
    at: [{ px: 785, py: 818 }],
    under: true,
    info: 'Chiếc còi tròn màu đen nằm <b>dưới Core</b>. Nhận lệnh từ chip PCA9685, kênh 14.',
    block: tb('play note C octave 4 for 1 beats'),
  },
]

const OUTSIDE = PARTS.filter((p) => !p.under).map((p) => p.id)
const UNDER = PARTS.filter((p) => p.under).map((p) => p.id)

const QUIZ: Record<string, { right: string; why: Record<string, string> }> = {
  q1: {
    right: 'pca',
    why: {
      sw: 'Chưa đúng: nút SW chỉ báo cho não là em đang bấm. Thử lại nhé!',
      esp: 'Gần đúng! Não quyết định bật đèn, nhưng não không nối thẳng vào đèn. Lệnh còn đi qua ai nữa?',
    },
  },
  q2: {
    right: 'power',
    why: {
      upload: 'Chưa đúng: chương trình vẫn chạy (đèn, còi vẫn được). Thứ thiếu là điện cho động cơ.',
      sw: 'Chưa đúng: nút SW không cấp điện. Xem lại thẻ "Công tắc nguồn".',
    },
  },
}

const choice = (q: string, value: string, text: string) =>
  `<button type="button" class="choice" data-answer="${q}:${value}">${text}</button>`

const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p>Đây là <b>ThingBot</b>. Nó có <b>hai tầng</b>: tấm <b>Core</b> (bộ não) ở trên, tấm <b>Shield</b> ở dưới — chỗ cắm động cơ, servo, cảm biến.</p>
      <p>Các <b>chấm cam</b> trên mạch bấm được. Bấm thử một chấm để xem đó là gì. Nút <b>+</b> <b>−</b> ở góc để phóng to.</p>`,
  },
  {
    title: 'Tìm khắp mạch',
    body: `<p>Bấm vào <b>tất cả</b> các chấm cam (hoặc bấm thẳng lên linh kiện). Chấm nào em đã xem sẽ chuyển màu xanh.</p>
      <p>Ở giữa màn hình có danh sách: tìm đủ <b>${OUTSIDE.length}</b> bộ phận nhìn thấy được.</p>`,
    check: 'outside',
  },
  {
    title: 'Dưới tấm Core',
    body: `<p>Có <b>${UNDER.length}</b> thứ bị tấm Core che mất!</p>
      <p>Bấm <b>👁 Dưới Core</b> để nhìn xuyên qua, rồi tìm chúng.</p>`,
    check: 'under',
  },
  {
    title: 'Câu đố 1',
    body: `<p>Em bấm nút SW và đèn L1 sáng. <b>Ai ra lệnh trực tiếp cho đèn L1?</b></p>
      <div class="choices">${choice('q1', 'sw', 'Nút SW')}${choice('q1', 'esp', 'Não ESP32-C3')}${choice('q1', 'pca', 'Chip PCA9685')}</div>`,
    check: 'q1',
  },
  {
    title: 'Câu đố 2',
    body: `<p>Robot đã cắm dây USB, chương trình chạy, đèn sáng — nhưng <b>bánh xe không quay</b>. Em cần làm gì?</p>
      <div class="choices">${choice('q2', 'upload', 'Nạp lại chương trình')}${choice('q2', 'power', 'Lắp pin và bật công tắc nguồn')}${choice('q2', 'sw', 'Bấm nút SW')}</div>`,
    check: 'q2',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã biết mọi bộ phận của ThingBot, và biết lệnh đi thế nào: <b>não → chip PCA9685 → đèn, còi, động cơ</b>.</p>
      <p>Sang <b>Bài 2</b> để tự ra lệnh cho đèn L1 chớp nhé.</p>`,
  },
]

function createGrader(onChange: GraderChange): Grader {
  let passed = new Set<string>()
  const found = new Set<string>()
  let hint: string | null = null
  const emit = () => onChange(passed, hint)
  const pass = (id: string) => {
    if (passed.has(id)) return
    passed.add(id)
    hint = null
  }
  return {
    restart() {},
    clear() {
      passed = new Set()
      found.clear()
      hint = null
      emit()
    },
    observe() {},
    event(type, value) {
      if (type === 'pick') {
        found.add(value)
        if (OUTSIDE.every((id) => found.has(id))) pass('outside')
        if (UNDER.every((id) => found.has(id))) pass('under')
      } else {
        const [q, answer] = value.split(':')
        const quiz = QUIZ[q]
        if (!quiz) return
        if (answer === quiz.right) pass(q)
        else hint = quiz.why[answer] ?? 'Chưa đúng, thử lại nhé!'
      }
      emit()
    },
  }
}

export const BAI_1: Lesson = {
  id: 'bai-1',
  no: 1,
  title: 'Làm quen ThingBot',
  toolbox: toolbox([], []),
  starter: STARTER,
  example: STARTER,
  cards: CARDS,
  parts: PARTS,
  flow: 'explore',
  badges: [],
  done: ['outside', 'under', 'q1'],
  createGrader,
}
