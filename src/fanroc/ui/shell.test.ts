import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampSide, defaultSide, highlightCpp, serialNews, statusText } from './shell.ts'
import { ICON_NAMES, ICON_PATHS } from './icons.ts'
import { NEUTRAL } from '../ports.ts'

test('highlightCpp: thoát HTML, tô từ khoá / số / chú thích, không tô chữ trong chú thích', () => {
  const html = highlightCpp('void setup() { // bắt đầu <b>\n  int a = 10; /* x 5 */\n}')
  assert.match(html, /<span class="k">void<\/span> setup\(\)/)
  assert.match(html, /<span class="k">int<\/span> a = <span class="n">10<\/span>;/)
  assert.match(html, /<span class="c">\/\/ bắt đầu &lt;b&gt;<\/span>/)
  assert.match(html, /<span class="c">\/\* x 5 \*\/<\/span>/)
  assert.ok(!html.includes('<b>'), 'chữ < > phải được thoát')
  // Tên có số (M1, a10) không bị tô như số; #include là từ khoá tiền xử lý.
  const h2 = highlightCpp('#include <Wire.h>\nmotorM1(a10, 2.5);')
  assert.match(h2, /<span class="k">#include<\/span> &lt;Wire\.h&gt;/)
  assert.match(h2, /motorM1\(a10, <span class="n">2\.5<\/span>\);/)
})

test('serialNews: đếm dòng mới; nạp lại thì đếm lại từ đầu; cắt đuôi ở trần vẫn báo có dòng mới', () => {
  assert.equal(serialNews('', 'a\nb\n'), 2)
  assert.equal(serialNews('a\n', 'a\nb\nc'), 1)
  assert.equal(serialNews('a\nb\n', 'a\nb\n'), 0)
  assert.equal(serialNews('a\nb\nc\n', 'x\n'), 1) // bo ảo nạp lại: serial bắt đầu lại
  assert.equal(serialNews('a\nb\n', 'b\nc\n'), 1) // trần SERIAL_MAX cắt đầu: có chữ mới
  assert.equal(serialNews('a', 'ab'), 0) // chưa hết dòng
})

test('clampSide: khung bên 280 px … 70 % phần cửa sổ trừ cột biểu tượng', () => {
  assert.equal(clampSide(100, 1440), 280)
  assert.equal(clampSide(2000, 1440), Math.round(0.7 * (1440 - 48)))
  assert.equal(clampSide(500, 1440), 500)
  // Cửa sổ hẹp: 70 % < 280 px thì lấy 70 % (không tràn).
  assert.equal(clampSide(300, 390), Math.round(0.7 * (390 - 48)))
})

test('defaultSide: khung Khối 40 %, Mã Arduino 24 %; cửa sổ ≤ 900 px phủ lên sân, rộng tới 560 px', () => {
  assert.equal(defaultSide('blocks', 1440), Math.round(0.4 * 1392))
  assert.equal(defaultSide('code', 1440), Math.round(0.24 * 1392))
  assert.equal(defaultSide('blocks', 390), 390 - 48)
  assert.equal(defaultSide('code', 800), 560)
})

test('statusText: cổng M1–M4 và khối đang chạy; không có cổng (ghế không tồn tại) vẫn không vỡ', () => {
  const t = statusText({ robot: 'Robot 1 · Dế Xanh', input: 'Chương trình', ports: { ...NEUTRAL, M1: 60, M2: -60.4 }, block: 'đợi 1 giây', fps: 59.6 })
  assert.deepEqual(t, ['Robot 1 · Dế Xanh', 'Chương trình', 'M1 60 · M2 −60 · M3 0 · M4 0', 'Đang chạy khối: đợi 1 giây', '60 khung/giây'])
  const u = statusText({ robot: '', input: 'Máy', ports: undefined as never, block: null, fps: 0 })
  assert.equal(u[2], 'M1 0 · M2 0 · M3 0 · M4 0')
  assert.equal(u[3], '')
})

test('biểu tượng: đủ 20 tên, mỗi tên có nét vẽ, không tải từ mạng', () => {
  assert.equal(ICON_NAMES.length, 20)
  for (const n of ICON_NAMES) {
    assert.ok(ICON_PATHS[n] && ICON_PATHS[n].length > 10, `thiếu nét vẽ cho ${n}`)
    assert.ok(!/https?:|href|url\(/.test(ICON_PATHS[n]), `${n} tải từ ngoài`)
  }
})
