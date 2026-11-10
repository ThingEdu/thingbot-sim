/**
 * Bài 6 — Mắt hồng ngoại: bóng tối màu thì đèn L1 sáng, bóng sáng màu thì tắt; thử thách hiện số đọc lên
 * OLED. Một mắt hồng ngoại phản xạ (cùng loại bốn mắt dưới gầm xe Cobot) cắm cổng cảm biến, chân tín hiệu
 * IO4, đọc bằng khối «read IR sensor 1 · IO4» của gói Cobot trong ThingBlock. Trẻ chọn quả bóng đặt
 * trước mắt; số đọc mỗi quả ở `../belt.ts`. Bài dạy độ hắt sáng và ngưỡng, chưa dùng cảm biến màu I2C.
 */
import { IR_DARK, IR_PIN } from '../belt'
import { makeGrader } from './grader'
import { ask, B, bang, CAT, ctrl, ev, giong, hat, hieu, op, per, program, S, setLed, STARTER, tb, toolbox, VAO, wait } from './state'
import type { Card, Lesson } from './types'

const L1 = 15
const DARK_BALLS = ['xanh', 'den']
const LIGHT_BALLS = ['trang', 'vang', 'do']
const lessThanDark = {
  ...B.lessThan,
  inputs: { OPERAND1: { shadow: { type: 'text', fields: { TEXT: '' } } }, OPERAND2: { shadow: { type: 'text', fields: { TEXT: String(IR_DARK) } } } },
}

const CARDS: Card[] = [
  {
    title: 'Nhiệm vụ: mắt nhận bóng FanRoc',
    body: `<p>Ở sân <b>FanRoc</b>, robot phải biết quả bóng trước mặt là quả nào để nhặt đúng. Người nhìn bằng mắt; hôm nay robot của em có một <b>mắt hồng ngoại</b>, cùng loại với bốn mắt dưới gầm xe <b>Cobot</b>.</p>
      ${giong('mắt hồng ngoại giống em <b>rọi đèn pin vào đồ vật trong phòng tối</b>. Đồ màu sáng hắt ánh sáng lại nhiều, đồ màu tối "nuốt" ánh sáng. Mắt có một bóng đèn hồng ngoại (người không nhìn thấy) và một "con ngươi" đo xem ánh sáng hắt lại nhiều hay ít.')}
      <p>Nhiệm vụ: làm <b>đèn báo bóng tối màu</b>. Bóng tối màu thì đèn L1 sáng, bóng sáng màu thì đèn tắt. Chọn quả bóng ở thanh <b>Bóng</b> trên mạch.</p>
      ${ask('Đặt quả bóng trắng, rồi quả bóng đen trước mắt. Quả nào cho số lớn hơn?', [
        ['Bóng trắng', true, 'Màu trắng hắt lại gần hết ánh sáng, "con ngươi" nhận nhiều nên số lớn (khoảng 3500). Màu đen nuốt gần hết, số nhỏ (khoảng 300).'],
        ['Bóng đen', false, 'Nhớ chiếc áo đen phơi nắng: nó nóng vì nuốt ánh sáng. Ánh sáng bị nuốt thì không hắt lại, nên số nhỏ.'],
        ['Bằng nhau', false, 'Nếu bằng nhau thì robot không phân biệt được hai quả. Hai màu này hắt sáng khác nhau rất xa.'],
      ])}
      ${hieu('Vì sao chọn "1 · IO4" trong khối?', `${bang(['Chân của mắt', 'Nối vào não', 'Với não là'], [['OUT (tín hiệu)', 'IO4', `${VAO}: báo "hắt lại bao nhiêu"`], ['VCC, GND', '—', 'cấp điện cho đèn và con ngươi']])}
      <p>Mắt cắm ở <b>cổng cảm biến</b>, chân tín hiệu của cổng hàn sẵn tới <b>IO4</b>. IO4 là chân <b>đọc được số</b>: không chỉ 0 hay 1 như nút SW, mà mọi số từ 0 tới 4095. Trên xe Cobot, mắt số 1 cũng nằm ở IO4, nên khối ghi "1 · IO4".</p>`)}`,
  },
  {
    title: 'Đèn báo bóng tối màu',
    body: `<p>Trong ${ev('vòng lặp Arduino')}:</p>
      <ol class="todo">
        <li>Kéo ${ctrl('nếu … thì … nếu không thì')} vào.</li>
        <li>Đặt ${op('… < 1500')} vào ô lục giác, rồi đặt ${per('read IR sensor 1 · IO4')} vào ô bên trái của dấu &lt;.</li>
        <li>Chỗ <b>thì</b>: ${tb('set led 1 100')}. Chỗ <b>nếu không thì</b>: ${tb('set led 1 0')}.</li>
        <li>Dưới cùng thêm ${ctrl('đợi 0.05 giây')}.</li>
      </ol>
      <p>Bấm <b>▶ Chạy</b>, rồi chọn quả bóng <b>đen</b> hoặc <b>xanh dương</b>.</p>`,
    check: 'dark',
  },
  {
    title: 'Bóng sáng màu',
    body: `<p>Giờ chọn quả <b>trắng</b>, <b>vàng</b> hoặc <b>đỏ</b>. Đèn L1 phải tắt.</p>
      ${hieu('Ngưỡng: biến con số thành có hoặc không', `<p>Mắt đưa ra <b>một con số</b>, còn đèn chỉ cần biết <b>có hay không</b>. Não <b>so</b> con số với <b>ngưỡng</b> 1500: nhỏ hơn là "tối", còn lại là "sáng". Giống em nheo mắt nhìn và tự nhủ "tối hơn mức này thì là bóng đen".</p>
      ${bang(['Bóng', 'Số đọc', 'So với 1500'], [['trắng', '≈ 3500', 'sáng'], ['vàng', '≈ 3100', 'sáng'], ['đỏ', '≈ 2300', 'sáng'], ['xanh dương', '≈ 1100', 'tối'], ['đen', '≈ 300', 'tối']])}`)}
      ${hieu('Mắt hồng ngoại không thấy màu', `<p>Với mắt người, đỏ và vàng khác hẳn nhau. Mắt hồng ngoại chỉ thấy <b>hắt lại nhiều hay ít</b>, nên hai quả này cho số gần nhau. Muốn biết chắc "đây là bóng đỏ" thì cần <b>cảm biến màu</b>: nó có ba "con ngươi" đỏ, lục, lam, giống ba loại tế bào nhìn màu trong mắt người. Xe Cobot có một cảm biến màu như vậy, nối qua hai dây I2C như màn OLED ở bài 4.</p>`)}
      <p class="muted">Trên robot thật, số đọc còn đổi theo khoảng cách và đèn trong phòng. Em đặt từng quả, xem số, rồi tự chọn ngưỡng nằm giữa hai nhóm.</p>`,
    check: 'light',
  },
  {
    title: 'Thử thách: hiện số đọc',
    body: `<p>Cho màn OLED <b>hiện số đọc</b>: trong vòng lặp thêm ${per('clear oled')}, ${per('oled print …')} (đặt khối mắt hồng ngoại vào ô chữ), ${per('refresh oled display')}. Đừng quên ${per('init oled …')} trong khởi động.</p>
      <p>Rồi đổi bóng: số trên màn hình phải đổi theo. Ghi lại số của từng quả vào vở. Kỹ sư chọn ngưỡng đúng bằng cách này.</p>`,
    check: 'oled',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Robot của em đã <b>tự nhìn</b> và phân biệt bóng sáng, bóng tối, như robot FanRoc chọn bóng hay máy lựa cà phê loại hạt đen.</p>
      <p>Bài 7 em cho robot <b>chuyển động</b>. Bài 10 sẽ ghép mắt này với băng chuyền và servo để làm <b>dây chuyền phân loại trứng</b>.</p>`,
  },
]

/** Các chân mà chương trình hỏi mắt hồng ngoại (khoá `analogRead` là số chân). */
const irReads = (o: { sensors: Record<string, number> }) => Object.keys(o.sensors).filter((k) => /^\d+$/.test(k))

export const BAI_6: Lesson = {
  id: 'bai-6',
  no: 6,
  rev: 2,
  title: 'Mắt hồng ngoại',
  toolbox: toolbox(
    [B.ifElse, B.if, B.waitFor(0.05)],
    [B.init, B.setLed(100), B.setLed(0)],
    [
      CAT.operators([lessThanDark, B.greaterThan]),
      CAT.cobot([B.ir]),
      CAT.oled([B.oledInit, B.oledClear, B.oledCursor(0, 0), B.oledPrint(''), B.oledRefresh]),
    ],
  ),
  starter: STARTER,
  example: program(
    hat('event_whenarduinobegin', 30, 30, S.plain('thingBotC3_init')),
    hat('event_whenarduinoloop', 30, 150, S.ifElse(S.lessThan(S.ir(), IR_DARK), setLed(100), setLed(0), wait(0.05))),
  ),
  cards: CARDS,
  flow: 'ir',
  controls: ['ball'],
  props: ['ir', 'oled'],
  badges: ['sonar', 'esp', 'pca', 'l1'],
  done: ['dark', 'light'],
  createGrader: makeGrader({
    track(o, run) {
      const pins = irReads(o)
      if (pins.includes(String(IR_PIN))) run.seen.read = true
      if (pins.some((k) => k !== String(IR_PIN))) run.seen.wrongPin = true
      // Bước OLED: màn hình phải hiện đúng số đọc của ít nhất hai quả bóng khác nhau.
      const v = String(o.ir)
      if ((o.oledText ?? '').split(/\s+/).includes(v) && !String(run.seen.shown ?? '').split(',').includes(v))
        run.seen.shown = `${run.seen.shown ?? ''},${v}`
    },
    checks: {
      dark: { when: (o, run) => run.seen.read === true && DARK_BALLS.includes(o.ball) && o.pwm[L1] > 0 },
      light: { when: (o, run) => run.passed.has('dark') && run.seen.read === true && LIGHT_BALLS.includes(o.ball) && o.pwm[L1] === 0 },
      oled: { when: (_o, run) => String(run.seen.shown ?? '').split(',').filter(Boolean).length >= 2, hold: 0 },
    },
    hint(o, run) {
      if (run.elapsed < 1_500_000) return null
      if (run.seen.wrongPin) return 'Mắt hồng ngoại cắm ở IO4: trong khối «read IR sensor …» chọn «1 · IO4».'
      if (!run.seen.read) return 'Não chưa hỏi mắt: đặt khối «read IR sensor 1 · IO4» vào ô bên trái của dấu < trong «nếu».'
      const lit = o.pwm[L1] > 0
      if (o.card.check === 'oled') {
        if (!o.oledOn) return 'Màn hình chưa khởi động: thêm «init oled …» vào khi Arduino khởi động.'
        if (!o.oledText) return 'Màn hình vẫn đen: thêm «refresh oled display» sau «oled print».'
        if (String(run.seen.shown ?? '').split(',').filter(Boolean).length === 1) return 'Đổi sang quả bóng khác: số trên màn hình phải đổi theo.'
        return null
      }
      if (DARK_BALLS.includes(o.ball) && !lit)
        return `Bóng tối màu mà đèn chưa sáng. Số đọc là ${o.ir}: ô bên phải dấu < phải là 1500, và chỗ «thì» cần «set led 1 100».`
      if (LIGHT_BALLS.includes(o.ball) && lit)
        return 'Bóng sáng màu mà đèn vẫn sáng: dùng «nếu … thì … nếu không thì» và đặt «set led 1 0» vào chỗ «nếu không thì».'
      if (o.card.check === 'dark' && !DARK_BALLS.includes(o.ball)) return 'Chọn quả bóng đen hoặc xanh dương ở thanh Bóng.'
      if (o.card.check === 'light' && !LIGHT_BALLS.includes(o.ball)) return 'Chọn quả bóng trắng, vàng hoặc đỏ ở thanh Bóng.'
      return null
    },
  }),
}
