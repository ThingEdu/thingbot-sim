/**
 * Bài 6 — Cảm biến khoảng cách: vật lại gần hơn 20 cm thì đèn L1 sáng báo động, xa thì tắt; thử thách
 * hiện số đo lên OLED. Cảm biến siêu âm HC-SR04P cắm TRIG IO0, ECHO IO4 như bài R4U của khoá
 * ThingBlock; trẻ kéo thanh "Vật cản" để đổi khoảng cách.
 */
import { SONAR_KEY } from '../sim-extra'
import { makeGrader } from './grader'
import { ask, B, bang, CAT, ctrl, ev, hat, hieu, op, per, program, RA, S, setLed, STARTER, tb, toolbox, VAO, wait } from './state'
import type { Card, Lesson } from './types'

const L1 = 15
const NEAR = 20

const CARDS: Card[] = [
  {
    title: 'Nhiệm vụ: cảm biến lùi xe',
    body: `<p>Ô tô lùi gần tường thì kêu <b>tít tít</b>; cửa siêu thị tự mở khi em đi tới; con <b>dơi</b> bay trong đêm không đâm vào cây. Cả ba dùng chung một mẹo: <b>phát tiếng rồi nghe tiếng vọng</b>.</p>
      <p>Cảm biến siêu âm phát một tiếng "chíp" tai người không nghe được, rồi đo xem <b>bao lâu</b> tiếng vọng quay về. Nhiệm vụ: làm <b>đèn báo vật gần</b>, vật dưới 20 cm thì đèn L1 sáng.</p>
      ${ask('Vật càng xa thì tiếng vọng quay về…', [
        ['Càng chậm', true, 'Tiếng phải đi xa hơn rồi quay lại. Âm thanh đi khoảng 343 mét mỗi giây, nên não đổi thời gian thành khoảng cách được.'],
        ['Càng nhanh', false, 'Đường đi dài hơn thì mất nhiều thời gian hơn, nên chậm hơn.'],
        ['Như nhau', false, 'Nếu như nhau thì cảm biến không đo được gì. Thời gian chính là thứ cho biết khoảng cách.'],
      ])}
      ${hieu('Vì sao gõ 0 và 4 trong khối?', `${bang(['Chân cảm biến', 'Nối vào não', 'Với não là'], [['TRIG', 'IO0', `${RA}: não ra lệnh "phát tiếng"`], ['ECHO', 'IO4', `${VAO}: cảm biến báo "đã nghe vọng"`], ['VCC, GND', '—', 'cấp điện']])}
      <p>Cổng cảm biến của ThingBot được hàn sẵn tới IO0 và IO4, nên trong khối em gõ <b>TRIG 0, ECHO 4</b>. Cắm sang cổng khác thì phải sửa số cho khớp, nếu không não sẽ "nói" và "nghe" ở nhầm chỗ.</p>`)}
      <p>Kéo thanh <b>Vật cản</b> trên mạch để đưa vật lại gần hay ra xa.</p>`,
  },
  {
    title: 'Đèn báo vật gần',
    body: `<p>Trong ${ev('vòng lặp Arduino')}:</p>
      <ol class="todo">
        <li>Kéo ${ctrl('nếu … thì … nếu không thì')} vào.</li>
        <li>Đặt ${op('… < 20')} vào ô lục giác, rồi đặt ${per('ultrasonic sensor … read distance cm')} vào ô bên trái của dấu &lt;.</li>
        <li>Chỗ <b>thì</b>: ${tb('set led 1 100')}. Chỗ <b>nếu không thì</b>: ${tb('set led 1 0')}.</li>
        <li>Dưới cùng thêm ${ctrl('đợi 0.05 giây')} để cảm biến kịp nghe tiếng vọng.</li>
      </ol>
      <p>Bấm <b>▶ Chạy</b>, kéo vật cản lại gần <b>dưới 20 cm</b>.</p>`,
    check: 'near',
  },
  {
    title: 'Đưa vật ra xa',
    body: `<p>Kéo vật cản ra <b>xa hơn 20 cm</b>. Đèn L1 phải tắt.</p>
      ${hieu('Từ con số tới có / không', `<p>Nút SW chỉ có 0 hoặc 1. Cảm biến này đưa ra <b>một con số</b>: 7 cm, 30 cm, 150 cm… Não <b>so sánh</b> con số với <b>ngưỡng</b> 20 để biến nó thành có/không: dưới 20 là "gần" (đúng), còn lại là "xa" (sai). Ngưỡng là con số <b>em chọn</b> tuỳ việc: cảm biến lùi xe dùng ngưỡng khác cửa siêu thị.</p>`)}
      <p class="muted">Ô <b>1 · Cảm biến</b>: vật cách 30 cm thì tiếng vọng mất khoảng 1 740 micro giây (một phần triệu giây) để quay về.</p>`,
    check: 'far',
  },
  {
    title: 'Thử thách: hiện số đo',
    body: `<p>Cho màn OLED <b>hiện số đo</b>: trong vòng lặp thêm ${per('clear oled')}, ${per('oled print …')} (đặt khối cảm biến vào ô chữ), ${per('refresh oled display')}. Đừng quên ${per('init oled …')} trong khởi động.</p>
      <p>Rồi kéo thanh <b>Vật cản</b>: số trên màn hình phải đổi theo. Giờ em có một <b>thước đo không chạm</b>.</p>`,
    check: 'oled',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Robot của em đã <b>tự thấy</b> vật ở gần và tự quyết định bật đèn, như cảm biến lùi xe ô tô.</p>
      <p>Bài 7 em cho robot <b>chuyển động</b>. Bài 10 sẽ ghép cảm biến này với bánh xe để xe tự né vật cản.</p>`,
  },
]

const reads = (o: { sensors: Record<string, number> }) => Object.keys(o.sensors).filter((k) => k.startsWith('sonar_'))

export const BAI_6: Lesson = {
  id: 'bai-6',
  no: 6,
  title: 'Cảm biến khoảng cách',
  toolbox: toolbox(
    [B.ifElse, B.if, B.waitFor(0.05)],
    [B.init, B.setLed(100), B.setLed(0)],
    [
      CAT.operators([B.lessThan, B.greaterThan]),
      CAT.sensor([B.sonar]),
      CAT.oled([B.oledInit, B.oledClear, B.oledCursor(0, 0), B.oledPrint(''), B.oledRefresh]),
    ],
  ),
  starter: STARTER,
  example: program(
    hat('event_whenarduinobegin', 30, 30, S.plain('thingBotC3_init')),
    hat('event_whenarduinoloop', 30, 150, S.ifElse(S.lessThan(S.sonar(), NEAR), setLed(100), setLed(0), wait(0.05))),
  ),
  cards: CARDS,
  flow: 'sonar',
  controls: ['sonar'],
  props: ['sonar', 'oled'],
  badges: ['sonar', 'esp', 'pca', 'l1'],
  done: ['near', 'far'],
  createGrader: makeGrader({
    track(o, run) {
      if (reads(o).length) run.seen.read = true
      if (reads(o).some((k) => k !== SONAR_KEY)) run.seen.wrongPins = true
      // Bước OLED: màn hình phải hiện đúng số đo ở ít nhất hai khoảng cách khác nhau (in chữ "50" cố định không tính).
      const cm = String(Math.trunc(o.sonar))
      if ((o.oledText ?? '').split(/\s+/).includes(cm) && !String(run.seen.shown ?? '').split(',').includes(cm))
        run.seen.shown = `${run.seen.shown ?? ''},${cm}`
    },
    checks: {
      near: { when: (o, run) => run.seen.read === true && o.sonar < NEAR && o.pwm[L1] > 0 },
      far: { when: (o, run) => run.passed.has('near') && run.seen.read === true && o.sonar > NEAR + 3 && o.pwm[L1] === 0 },
      oled: { when: (_o, run) => String(run.seen.shown ?? '').split(',').filter(Boolean).length >= 2, hold: 0 },
    },
    hint(o, run) {
      if (run.elapsed < 1_500_000) return null
      if (run.seen.wrongPins)
        return 'Cảm biến cắm ở TRIG IO0, ECHO IO4: sửa hai ô số trong khối «ultrasonic sensor pin TRIG … ECHO …» thành 0 và 4.'
      if (!run.seen.read) return 'Não chưa hỏi cảm biến: đặt khối «ultrasonic … read distance cm» vào ô bên trái của dấu < trong «nếu».'
      const lit = o.pwm[L1] > 0
      if (o.card.check === 'oled') {
        if (!o.oledOn) return 'Màn hình chưa khởi động: thêm «init oled …» vào khi Arduino khởi động.'
        if (!o.oledText) return 'Màn hình vẫn đen: thêm «refresh oled display» sau «oled print».'
        if (String(run.seen.shown ?? '').split(',').filter(Boolean).length === 1) return 'Kéo thanh Vật cản sang chỗ khác: số trên màn hình phải đổi theo.'
        return null
      }
      if (o.sonar < NEAR && !lit) return 'Vật ở gần mà đèn chưa sáng: chỗ «thì» cần «set led 1 100».'
      if (o.sonar > NEAR + 3 && lit)
        return 'Vật ở xa mà đèn vẫn sáng: dùng «nếu … thì … nếu không thì» và đặt «set led 1 0» vào chỗ «nếu không thì».'
      if (o.card.check === 'near' && o.sonar >= NEAR) return 'Kéo thanh Vật cản xuống dưới 20 cm.'
      if (o.card.check === 'far' && o.sonar <= NEAR + 3) return 'Kéo thanh Vật cản ra xa hơn 23 cm.'
      return null
    },
  }),
}
