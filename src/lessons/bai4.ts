/**
 * Bài 4 — Màn hình OLED: init → print → refresh. Theo bài "Màn hình OLED chào em" của ThingBlock
 * (`tutorials/oled-xin-chao`), chấm bằng đúng luật `OLED hiện "…"` của ThingBlock.
 *
 * Dòng chảy dữ liệu: màn OLED cắm cổng I2C, dùng chung hai dây SDA/SCL với chip PCA9685 — não gửi cả
 * khung hình 1 KB qua I2C mỗi lần `refresh`.
 */
import { makeGrader, ruleResult } from './grader'
import { ask, B, bang, CAT, ctrl, ev, giong, hat, hieu, per, program, S, STARTER, toolbox } from './state'
import type { Card, Lesson } from './types'

const R_HELLO = 'OLED hiện "Xin chao"'
const R_TB = 'OLED hiện "ThingBot"'
const RULES = [R_HELLO, R_TB]

const CARDS: Card[] = [
  {
    title: 'Nhiệm vụ: bảng tên robot',
    body: `<p>Đèn chỉ nói được hai điều: <b>có</b> hoặc <b>không</b>. Muốn robot nói được <b>chữ và số</b> (tên, nhiệt độ, lời nhắn) thì cần <b>màn hình</b>, như màn hình lò vi sóng hay đồng hồ điện tử.</p>
      <p>Nhiệm vụ: làm <b>bảng tên</b> cho robot trên màn hình <b>OLED</b> nhỏ cắm ở <b>cổng I2C</b>, cạnh phải mạch.</p>
      ${giong('màn hình là <b>khuôn mặt</b> của robot: chỗ nó "nói" bằng chữ và hình cho người đứng xem.')}
      <p class="muted">Màn hình chỉ có chữ <b>không dấu</b> (ví dụ "Xin chao").</p>`,
  },
  {
    title: 'Viết dòng đầu tiên',
    body: `<p>Xếp ba khối nhóm OLED vào trong ${ev('khi Arduino khởi động')}, dưới ${per('init ThingBot')}:</p>
      <ol class="todo">
        <li>${per('init oled width 128 height 64…')} — đánh thức màn hình</li>
        <li>${per('oled print Xin chao')} — viết chữ vào <b>bộ nhớ</b></li>
        <li>${per('refresh oled display')} — đưa bộ nhớ ra màn hình</li>
      </ol>
      ${ask('Nếu thiếu khối «refresh oled display», màn hình sẽ…', [
        ['Vẫn hiện chữ', false, 'Chữ mới chỉ nằm trong bộ nhớ của màn hình. Phải refresh thì nó mới vẽ ra.'],
        ['Đen, không có gì', true, 'Màn hình vẽ xong cả trang trong bộ nhớ rồi mới hiện một lần, để không bị nhấp nháy. Refresh là lệnh "hiện ra".'],
      ])}
      <p>Bấm <b>▶ Chạy</b>.</p>`,
    check: 'hello',
  },
  {
    title: 'Dòng thứ hai',
    body: `<p>Trước khối ${per('refresh oled display')}, thêm ${per('set oled cursor x: 0 y: 16')} rồi ${per('oled print ThingBot')}.</p>
      ${hieu('x và y trên màn hình', `<p>Màn hình là lưới <b>128 × 64 chấm sáng</b>. Gốc (0, 0) ở <b>góc trên bên trái</b>; <b>x</b> đi sang phải, <b>y</b> đi xuống dưới. Chữ cỡ nhỏ cao 8 chấm, nên y: 16 là xuống dưới, cách dòng đầu một khoảng.</p>`)}
      <p class="muted">Thấy hình bông tuyết <b>Adafruit</b>? Đó là logo thư viện vẽ sẵn lúc khởi động, mạch thật cũng vậy. Thêm ${per('clear oled')} ngay sau khối init để xoá nó.</p>`,
    check: 'two',
  },
  {
    title: 'Hiểu sâu: hai dây, nhiều thiết bị',
    body: `${hieu('Cổng I2C', `${bang(['Chân', 'Nối vào não', 'Làm gì'], [['GND, VCC', '—', 'cấp điện cho màn hình'], ['SDA', 'IO8', 'chở dữ liệu (chữ, lệnh)'], ['SCL', 'IO9', 'gõ nhịp cho dữ liệu đi đều']])}
      <p>Mạch công suất (điều khiển đèn, động cơ) cũng nằm trên <b>đúng hai dây này</b>. Vậy sao não không gửi nhầm? Vì mỗi thiết bị có một <b>"số nhà"</b> riêng, gọi là địa chỉ. Màn hình OLED có số nhà <b>0x3C</b> (ô "địa chỉ I2C" trong khối init). Não gọi đúng số nhà nào thì chỉ thiết bị đó trả lời.</p>
      <p>Vì vậy em đừng dùng IO8, IO9 cho việc khác: chúng đang là "đường dây chung" của cả mạch.</p>`)}`,
  },
  {
    title: 'Thử thách: tên của em',
    body: `<p>Cho màn hình hiện <b>tên em</b> (không dấu) ở dòng thứ ba: ${per('set oled cursor x: 0 y: 32')} rồi ${per('oled print …')}.</p>
      <p class="muted">Muốn chữ to: thêm ${per('set oled text size')} ngay sau khối init, chọn 12x16.</p>`,
    check: 'name',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Robot của em đã có <b>bảng tên</b>. Em biết ba việc với OLED: <b>khởi động</b>, <b>in chữ</b> ở chỗ mình chọn bằng x, y, và <b>refresh</b> để hiện ra.</p>
      <p>Bài 6 màn hình này sẽ hiện <b>số đo khoảng cách</b> mà robot tự đo được.</p>`,
  },
]

const KNOWN = ['xin chao', 'thingbot']

export const BAI_4: Lesson = {
  id: 'bai-4',
  no: 4,
  title: 'Màn hình OLED',
  toolbox: toolbox(
    [B.wait],
    [B.init],
    [CAT.oled([B.oledInit, B.oledPrint('Xin chao'), B.oledCursor(0, 16), B.oledPrint('ThingBot'), B.oledText, B.oledClear, B.oledRefresh])],
  ),
  starter: STARTER,
  example: program(
    hat(
      'event_whenarduinobegin',
      30,
      30,
      S.plain(
        'thingBotC3_init',
        S.oledInit(S.oledPrint('Xin chao', S.oledCursor(0, 16, S.oledPrint('ThingBot', S.plain('oled_refresh'))))),
      ),
    ),
    hat('event_whenarduinoloop', 30, 470),
  ),
  cards: CARDS,
  rules: RULES,
  flow: 'oled',
  props: ['oled'],
  badges: ['esp', 'i2c', 'oled'],
  done: ['hello', 'two'],
  createGrader: makeGrader({
    checks: {
      hello: { when: (o) => ruleResult(RULES, o, R_HELLO)?.ok === true, hold: 0 },
      two: { when: (o) => ruleResult(RULES, o, R_HELLO)?.ok === true && ruleResult(RULES, o, R_TB)?.ok === true, hold: 0 },
      name: {
        when: (o) =>
          (o.oledText ?? '')
            .split('\n')
            .map((l) => l.trim().toLowerCase())
            .some((l) => l.length >= 2 && !KNOWN.includes(l)),
        hold: 0,
      },
    },
    hint(o, run) {
      if (run.elapsed < 1_000_000) return null
      if (!o.oledOn) return 'Màn hình chưa được khởi động: thêm khối «init oled width 128 height 64…» trước khối «oled print».'
      if (!o.oledText) return 'Màn hình vẫn đen: chữ mới nằm trong bộ nhớ. Thêm «refresh oled display» sau khối «oled print».'
      if (/[^\x20-\x7e\r\n]/.test(o.oledText)) return 'Màn hình không có chữ có dấu: viết không dấu, ví dụ "Xin chao".'
      const wanted = o.card.check === 'two' ? [R_HELLO, R_TB] : o.card.check === 'hello' ? [R_HELLO] : []
      for (const r of wanted) {
        const res = ruleResult(RULES, o, r)
        if (res && !res.ok) return `${res.message} Kiểm lại chữ trong ô của khối «oled print».`
      }
      return null
    },
  }),
}
