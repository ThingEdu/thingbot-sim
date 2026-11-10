/**
 * Bài 10 — Dự án: dây chuyền phân loại trứng. Ghép bài 6 (mắt hồng ngoại IO4), bài 5 (servo S1) và bài 7
 * (động cơ M1): băng chuyền chở trứng qua mắt, trứng tối (hỏng) thì cần gạt hạ 90 độ gạt xuống thùng
 * loại, còn lại nâng 0 độ cho đi tiếp. Mô hình băng chuyền ở `../belt.ts`.
 * Chấm: 6 quả liền vào đúng thùng, trong đó ít nhất 2 quả hỏng bị gạt; thử thách: còi kêu khi gạt.
 */
import { GATE_DEG, IR_DARK, IR_PIN } from '../belt'
import { makeGrader, motorSpeed } from './grader'
import { ask, B, bang, CAT, ctrl, ev, giong, hat, hieu, op, per, program, S, STARTER, tb, toolbox, wait } from './state'
import type { Card, Lesson } from './types'

const BUZZER = 14
const STREAK = 6
const MIN_BAD = 2
const lessThanDark = {
  ...B.lessThan,
  inputs: { OPERAND1: { shadow: { type: 'text', fields: { TEXT: '' } } }, OPERAND2: { shadow: { type: 'text', fields: { TEXT: String(IR_DARK) } } } },
}

const CARDS: Card[] = [
  {
    title: 'Dự án: máy soi trứng',
    body: `<p>Trại gà mỗi ngày nhặt hàng chục nghìn quả trứng. Người ta <b>soi trứng</b>: rọi đèn qua vỏ, quả tốt sáng trong, quả hỏng <b>tối đục</b>. Máy phân loại làm việc này nhanh hơn người: <b>nhìn</b> từng quả trên băng chuyền rồi <b>gạt</b> quả hỏng sang thùng riêng. Nhà máy cà phê, gạo, hay robot FanRoc chọn bóng cũng lựa theo cách đó.</p>
      ${giong('dây chuyền giống em <b>nhặt hạt đậu đen lẫn trong rổ đậu xanh</b>: mắt nhìn từng hạt, não quyết định, tay gạt hạt lạ ra. Ở đây mắt hồng ngoại là mắt, ESP32-C3 là não, servo S1 là bàn tay.')}
      ${hieu('Em đã có đủ mảnh ghép', bang(['Việc', 'Bài', 'Trên dây chuyền'], [['Nhìn sáng, tối', '6', 'mắt hồng ngoại IO4, gắn ngay trên cần gạt'], ['Quyết định', '3, 6', 'số đọc &lt; 1500 là trứng hỏng'], ['Chạy băng chuyền', '7', 'động cơ M1'], ['Gạt', '5', 'servo S1: 90 độ gạt, 0 độ cho qua']]))}
      ${ask('Quả trứng hỏng đang nằm dưới mắt. Cần gạt nên ở góc nào?', [
        ['90 độ: hạ xuống, gạt trứng vào thùng loại', true, 'Cần gạt hạ xuống chắn đường, quả trứng lăn vào thùng loại.'],
        ['0 độ', false, '0 độ là cần gạt nhấc lên, trứng đi qua. Góc này dành cho trứng tốt.'],
      ])}
      <p>Bấm <b>🔋 Nguồn</b> trước: băng chuyền và servo cần điện từ pin.</p>`,
  },
  {
    title: 'Lắp máy phân loại',
    body: `<ol class="todo">
        <li>Trong ${ev('khi Arduino khởi động')}: ${tb('set motor M1 go forward at 40')} cho băng chuyền chạy, và ${tb('set servo S1 to angle 0 degrees')} để cần gạt nhấc lên.</li>
        <li>Trong ${ev('vòng lặp Arduino')}: ${ctrl('nếu … thì … nếu không thì')} với ${op('… < 1500')}, ô bên trái là ${per('read IR sensor 1 · IO4')}.</li>
        <li>Chỗ <b>thì</b>: ${tb('set servo S1 to angle 90 degrees')}. Chỗ <b>nếu không thì</b>: ${tb('set servo S1 to angle 0 degrees')}.</li>
        <li>Dưới cùng: ${ctrl('đợi 0.05 giây')}.</li>
      </ol>
      <p>Bấm <b>▶ Chạy</b>. <b>${STREAK} quả liền</b> phải vào đúng thùng, trong đó có trứng hỏng bị gạt.</p>`,
    check: 'sort',
  },
  {
    title: 'Thử thách: còi báo trứng hỏng',
    body: `<p>Máy soi trứng thật kêu lên cho người trông máy biết. Thêm ${tb('play note C octave 5 for 0.25 beats')} vào chỗ <b>thì</b>, ngay sau khối servo 90 độ.</p>
      ${hieu('Băng chạy nhanh thì sao?', `<p>Mắt chỉ nhìn thấy mỗi quả trong một khoảnh khắc ngắn. Băng chạy càng nhanh, khoảnh khắc đó càng ngắn. Nếu não bận việc khác quá lâu (một khối đợi dài, một nốt nhạc dài) thì trứng hỏng đã lọt qua trước khi não kịp nhìn.</p>
      <p>Thử đổi tốc độ M1 thành <b>100</b>, hoặc khối đợi thành <b>1 giây</b>, rồi xem số "nhầm" trên băng chuyền. Kỹ sư nhà máy phải cân giữa <b>nhanh</b> và <b>không sót</b>.</p>`)}`,
    check: 'beep',
    optional: true,
  },
  {
    title: 'Hoàn thành 10 bài! 🏆',
    body: `<p>Em vừa làm một <b>máy phân loại</b>: <b>nhìn → nghĩ → làm</b>, lặp mãi. Dây chuyền lựa trứng, máy lựa cà phê, robot FanRoc chọn bóng đều làm việc theo đúng ba bước này.</p>
      <p>Em cũng đã biết ba điều kỹ sư robot dùng hằng ngày: <b>đầu vào / đầu ra</b>, <b>0 và 1</b>, và <b>đọc sơ đồ để biết chân nào nối với gì</b>.</p>
      <p>Bước tiếp: dùng <b>cảm biến màu</b> của Cobot để lựa đúng theo màu đỏ, lục, lam; hoặc mở ThingBlock, chọn bo ThingBot, bấm <b>Nạp</b> để chạy trên robot thật.</p>`,
  },
]

export const BAI_10: Lesson = {
  id: 'bai-10',
  no: 10,
  rev: 2,
  title: 'Dự án: dây chuyền phân loại',
  toolbox: toolbox(
    [B.ifElse, B.if, B.waitFor(0.05)],
    [B.init, B.motor(1, 'forward', 40), B.setServo(0), B.setServo(90), B.playNote],
    [CAT.operators([lessThanDark, B.greaterThan]), CAT.cobot([B.ir])],
  ),
  starter: STARTER,
  example: program(
    hat('event_whenarduinobegin', 30, 30, S.plain('thingBotC3_init', S.motor(1, 'forward', 40, S.setServo(0)))),
    hat('event_whenarduinoloop', 30, 270, S.ifElse(S.lessThan(S.ir(), IR_DARK), S.setServo(90), S.setServo(0), wait(0.05))),
  ),
  cards: CARDS,
  flow: 'sort',
  controls: ['power'],
  belt: true,
  badges: [],
  done: ['sort'],
  createGrader: makeGrader({
    track(o, run) {
      if (o.sensors[String(IR_PIN)]) run.seen.read = true
      const b = o.belt
      if (!b) return
      if (o.pwm[BUZZER] > 0 && b.gate >= GATE_DEG) run.seen.beep = true
      // Lỗi gần nhất: gạt nhầm trứng tốt hay để lọt trứng hỏng, để gợi ý đúng chỗ cần sửa.
      if (b.rejectedGood > Number(run.seen.rejectedGood ?? 0)) run.seen.mistake = 'good'
      if (b.passedBad > Number(run.seen.passedBad ?? 0)) run.seen.mistake = 'bad'
      run.seen.rejectedGood = b.rejectedGood
      run.seen.passedBad = b.passedBad
    },
    checks: {
      sort: {
        when: (o, run) => {
          const b = o.belt
          if (!b || run.seen.read !== true || b.rejectedBad < MIN_BAD) return false
          const last = b.recent.slice(-STREAK)
          return last.length === STREAK && last.every(Boolean)
        },
        hold: 0,
      },
      beep: { when: (_o, run) => run.passed.has('sort') && run.seen.beep === true, hold: 0 },
    },
    hint(o, run) {
      const b = o.belt
      if (!b || run.elapsed < 1_500_000) return null
      const m = motorSpeed(o.pwm, 1)
      if (m !== 0 && !o.power) return 'Có lệnh mà băng chuyền đứng yên: bấm 🔋 Nguồn để bật công tắc nguồn.'
      if (m <= 0 && b.moved === 0) return 'Băng chuyền chưa chạy: thêm «set motor M1 go forward at 40» vào khi Arduino khởi động.'
      if (!run.seen.read) return 'Não chưa nhìn trứng: đặt «read IR sensor 1 · IO4» vào ô bên trái dấu < trong «nếu».'
      if (run.seen.mistake === 'good')
        return 'Trứng tốt cũng bị gạt: chỗ «nếu không thì» cần «set servo S1 to angle 0 degrees» để nhấc cần gạt lên.'
      if (run.seen.mistake === 'bad')
        return 'Trứng hỏng lọt vào thùng trứng tốt: kiểm tra ngưỡng < 1500, chỗ «thì» là servo 90 độ, và khối «đợi» thật ngắn (0.05 giây) để não kịp nhìn.'
      if (o.card.check === 'beep' && run.passed.has('sort') && !run.seen.beep && b.rejectedBad >= 2)
        return 'Đã gạt trứng hỏng mà còi chưa kêu: thêm «play note C octave 5 for 0.25 beats» vào chỗ «thì».'
      return null
    },
  }),
}
