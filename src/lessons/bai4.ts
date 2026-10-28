/**
 * Bài 4 — Màn hình OLED: init → print → refresh. Theo bài "Màn hình OLED chào em" của ThingBlock
 * (`tutorials/oled-xin-chao`), chấm bằng đúng luật `OLED hiện "…"` của ThingBlock.
 *
 * Dòng chảy dữ liệu: màn OLED cắm cổng I2C, dùng chung hai dây SDA/SCL với chip PCA9685 — não gửi cả
 * khung hình 1 KB qua I2C mỗi lần `refresh`.
 */
import { makeGrader, ruleResult } from './grader'
import { B, CAT, ctrl, ev, hat, per, program, S, STARTER, toolbox } from './state'
import type { Card, Lesson } from './types'

const R_HELLO = 'OLED hiện "Xin chao"'
const R_TB = 'OLED hiện "ThingBot"'
const RULES = [R_HELLO, R_TB]

const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p>Màn hình <b>OLED</b> nhỏ cắm vào <b>cổng I2C</b> ở cạnh phải mạch. Bài này em viết chữ lên màn hình.</p>
      <p>Màn hình dùng chung hai dây I2C với chip PCA9685: não gửi chữ qua dây, màn hình vẽ ra.</p>
      <p class="muted">Màn hình chỉ có chữ <b>không dấu</b> (ví dụ "Xin chao").</p>`,
  },
  {
    title: 'Viết dòng đầu tiên',
    body: `<p>Xếp ba khối nhóm OLED vào trong ${ev('khi Arduino khởi động')}, dưới ${per('init ThingBot')}:</p>
      <ol class="todo">
        <li>${per('init oled width 128 height 64…')} — khởi động màn hình</li>
        <li>${per('oled print Xin chao')} — viết chữ vào bộ nhớ</li>
        <li>${per('refresh oled display')} — đưa chữ ra màn hình</li>
      </ol>
      <p>Bấm <b>▶ Chạy</b>.</p>`,
    check: 'hello',
  },
  {
    title: 'Dòng thứ hai',
    body: `<p>Trước khối ${per('refresh oled display')}, thêm ${per('set oled cursor x: 0 y: 16')} rồi ${per('oled print ThingBot')}.</p>
      <p class="muted">Thứ tự: init → print "Xin chao" → set cursor → print "ThingBot" → refresh.</p>
      <p>Thấy hình bông tuyết <b>Adafruit</b> trên màn? Đó là logo thư viện vẽ sẵn lúc khởi động — mạch thật cũng vậy. Thêm ${per('clear oled')} ngay sau khối init để xoá nó.</p>`,
    check: 'two',
  },
  {
    title: 'Thử thách',
    body: `<p>Cho màn hình hiện <b>tên em</b> (không dấu) ở dòng thứ ba: ${per('set oled cursor x: 0 y: 32')} rồi ${per('oled print …')}.</p>
      <p class="muted">Muốn chữ to: thêm ${per('set oled text size')} ngay sau khối init, chọn 12x16.</p>`,
    check: 'name',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã biết ba việc với OLED: <b>khởi động</b>, <b>in chữ</b> ở chỗ mình chọn, và <b>refresh</b> để hiện ra.</p>
      <p>Bài 6 em sẽ cho màn hình hiện số đo khoảng cách. Thứ tự ${ctrl('đợi')} hay ${ev('vòng lặp Arduino')} vẫn dùng như cũ.</p>`,
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
