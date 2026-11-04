/**
 * Phép thử đầu-cuối của sân FANROC trên trình duyệt thật (Playwright, lấy từ checkout ThingBlock như ftc-e2e.mjs
 * của nhánh spike/ursim).
 *
 *   npm run e2e:fanroc                 # tự bật Vite dev trên một cổng trống, chạy N1, N1b, N1c (vỏ Task 11), N2, N2b (bảng điểm Task 12) và E1–E11 (E5 bỏ qua), tắt Vite
 *   FANROC_URL=http://localhost:5191/mo-phong/fanroc.html npm run e2e:fanroc   # dùng trang đang chạy sẵn
 *   npm run e2e:fanroc -- E3 E5        # chỉ chạy các phép thử có tên bắt đầu như vậy
 *
 * Tay cầm giả: addInitScript ghi đè navigator.getGamepads theo `window.__pads` (mỗi phần tử một tay theo
 * Gamepad.index, null = rút ra). E9 đo khung hình bằng requestAnimationFrame trong Chromium có GPU (ANGLE Metal).
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { ZONES } from '../src/fanroc/layout.ts'

const ROOT = resolve(import.meta.dirname, '..')
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(ROOT, '../thingblock-editor-sim'))
const req = createRequire(resolve(THINGBLOCK, 'package.json'))
const { chromium } = req('playwright')
const JSZip = createRequire(resolve(ROOT, 'package.json'))('jszip')
const only = process.argv.slice(2)
/** Thư mục lưu ảnh chụp (N2, N2b) nếu đặt. */
const SHOTS = process.env.FANROC_SHOTS ?? ''

// ---------- Máy chủ Vite riêng (không dùng cổng 5190 của checkout khác) ----------
const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer()
    s.once('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })

let vite = null
async function startServer() {
  if (process.env.FANROC_URL) return process.env.FANROC_URL
  const port = await freePort()
  vite = spawn(resolve(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  vite.stdout.on('data', (d) => (out += d))
  vite.stderr.on('data', (d) => (out += d))
  const url = `http://127.0.0.1:${port}/mo-phong/fanroc.html`
  const t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    if (vite.exitCode !== null) throw new Error(`Vite thoát sớm:\n${out}`)
    try {
      if ((await fetch(url)).ok) return url
    } catch {
      /* chưa lên */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Vite không lên sau 30 s:\n${out}`)
}
const stopServer = () => {
  if (vite && vite.exitCode === null) vite.kill('SIGTERM')
}
process.on('exit', stopServer)

// ---------- Khung phép thử ----------
const FAKE_PADS = () => {
  window.__pads = []
  const make = (p, i) => ({
    id: `tay giả ${i + 1}`, index: i, connected: true, mapping: 'standard', timestamp: performance.now(),
    axes: [...p.axes], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  })
  navigator.getGamepads = () => window.__pads.map((p, i) => (p ? make(p, i) : null))
}
const UP = [0, -1, 0, -1] // cả hai cần đẩy lên hết (LY = RY = 0 theo ps2_*)
const MID = [0, 0, 0, 0] // thả tay: cần 128

let URL_ = ''
let browser
const results = []
async function test(name, fn, viewport = { width: 1440, height: 860 }) {
  if (only.length && !only.some((o) => name.startsWith(o))) return
  const phone = viewport.width < 500
  const context = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.addInitScript(FAKE_PADS)
  const t0 = Date.now()
  let ok = false
  let detail = ''
  try {
    detail = (await fn(page, errors)) ?? ''
    ok = !errors.length
    if (errors.length) detail += ` · lỗi JS: ${errors[0]}`
  } catch (e) {
    detail = e.message.split('\n')[0]
  }
  results.push({ name, ok })
  console.log(`${ok ? 'ĐẠT  ' : 'TRƯỢT'}  ${name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)  ${detail}`)
  await context.close()
}
/** Phép thử tạm bỏ (ghi lý do), không tính vào số ĐẠT / TRƯỢT. */
function skip(name, why) {
  if (only.length && !only.some((o) => name.startsWith(o))) return
  console.log(`BỎ QUA  ${name}  — ${why}`)
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

// ---------- Thao tác trên trang ----------
async function open(page) {
  await page.goto(URL_)
  await page.waitForFunction(() => window.__fanroc?.editors && document.querySelector('#stage canvas'), null, { timeout: 60000 })
}
const setPad = (page, i, axes) => page.evaluate(([i, axes]) => (window.__pads[i] = axes && { axes }), [i, axes])
const pose = (page, i = 0) => page.evaluate((i) => window.__fanroc.pose(i), i)
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z)
const deg = (rad) => (rad * 180) / Math.PI
// Task 11: thanh công cụ cũ nằm trong khung ⚙ (tạm, Task 13 thay), vùng khối trong khung bên "Khối", ▶ / ■ / Tải .tb /
// Tạm dừng / Từng khối trên thanh chạy nổi. Các thao tác dưới mở đúng khung trước khi bấm.
/** Mở khung ⚙ nếu đang đóng. */
async function settings(page) {
  if (await page.locator('.fr-bar').isHidden()) await page.locator('.sh-act button[data-view="settings"]').click()
}
/** Mở khung bên "Khối" nếu đang đóng. */
async function blocksSide(page) {
  if (await page.locator('[data-side="blocks"]').isHidden()) await page.locator('.sh-act button[data-view="blocks"]').click()
}
/** Ô chọn người lái của robot i (thứ tự trong ⚙: Robot 1…4). */
const seat = async (page, i, value) => {
  await settings(page)
  await page.locator('.fr-bar select').nth(i).selectOption(value)
}
/** Nút chữ trong khung ⚙ (mở khung trước). */
const bar = async (page, text) => {
  await settings(page)
  return page.locator('.fr-bar button', { hasText: text }).first()
}
/** Nút của thanh chạy nổi theo aria-label. */
const runBtn = (page, label) => page.locator(`.sh-run button[aria-label="${label}"]`)
const panel = (page) => page.locator('.fe-panel:not([hidden])')
/**
 * Đặt robot i vào làn trống sát rào bên (x = ±0.95 m, nhìn về phía núi) bằng RobotBody.setPose có sẵn: từ ô xuất
 * phát đi thẳng 0.35 m là đụng giá cờ, robot xoay lệch — phép thử lái cần đường trống.
 */
const LANE = [{ x: -0.95, z: 1.0, yaw: 0 }, { x: 0.95, z: 1.0, yaw: 0 }]
const place = (page, i) => page.evaluate(([i, p]) => window.__fanroc.robots[i].setPose(p), [i, LANE[i]])
const tab = async (page, i) => {
  await blocksSide(page)
  return page.locator('.fe-tabs button').nth(i)
}
const linkState = (page, i) => page.evaluate((i) => window.__fanroc.editors.state(i), i)

/** Robot 2–4 đứng yên: Robot 2 = Chương trình (không nạp gì), Robot 3 / 4 chạy theo chương trình của Robot 1 / 2. */
async function quietOthers(page) {
  await seat(page, 1, 'program')
  await seat(page, 2, 'copy-0')
  await seat(page, 3, 'copy-1')
}
/** Qua 10 s xả bóng ở ×40 (chưa nạp chương trình nào nên được phép), rồi về ×1. */
async function skipRelease(page) {
  expect((await page.evaluate(() => window.__fanroc.setSpeed(40))) === 40, '×40 bị khoá dù chưa có chương trình')
  await page.waitForFunction(() => window.__fanroc.match.phase === 'play', null, { timeout: 30000 })
  await page.evaluate(() => window.__fanroc.setSpeed(1))
}
/** Bấm ▶ Chạy ở thẻ i và chờ bo ảo chạy. */
async function run(page, i) {
  await (await tab(page, i)).click()
  await runBtn(page, 'Chạy').click()
  await page.waitForFunction((i) => window.__fanroc.editors.state(i) === 'running', i, { timeout: 15000 })
  await page.waitForTimeout(300) // bo ảo khởi động, gửi ảnh chụp PWM đầu
}
/**
 * Luyện tập, robot khác đứng yên; tay cầm cắm trước để gắn đúng ghế. Luyện tập không có 10 s xả bóng (ruling R31:
 * tua sẵn lúc tạo trận) nên trận mới mở ra đã ở pha thi đấu, t = 0.
 */
async function practice(page, pads = 1) {
  await open(page)
  for (let i = 0; i < pads; i++) {
    await setPad(page, i, MID)
    await page.waitForTimeout(150) // mỗi tay một khung để gắn ghế theo thứ tự cắm
  }
  await quietOthers(page)
  await page.evaluate(() => (window.__oldMatch = window.__fanroc.match))
  await (await bar(page, 'Luyện tập')).click() // trận mới: Human Player chốt theo số tay cầm lúc này
  await page.waitForFunction(() => {
    const m = window.__fanroc.match
    return m !== window.__oldMatch && m.practice && m.phase === 'play' && m.t < 1
  }, null, { timeout: 30000 })
}

// ---------- Các tình huống ----------
async function main() {
  URL_ = await startServer()
  console.log(`Trang: ${URL_}`)
  browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
  await shellTests()

  await test('E1 trang tải, không lỗi console, tiêu đề và chữ bảng điểm tiếng Việt', async (page) => {
    await open(page)
    await page.waitForTimeout(1500)
    const title = await page.title()
    // Task 12: bảng điểm Đỏ | chung | Xanh thay HUD cũ; kiểm tra theo luật ở thẻ "Sự kiện trận".
    const hud = await page.locator('.sb').innerText()
    const events = await page.locator('.sh-pbody[data-panel="events"]').textContent()
    expect(title === 'ThingBot FanRoc Game', `tiêu đề "${title}"`) // Task 11: tên sản phẩm mới
    expect(/XẢ BÓNG/.test(hud) && /ĐỎ/.test(hud) && /XANH/.test(hud) && /Dế Xanh/.test(hud), `bảng điểm: ${hud.replace(/\n/g, ' ').slice(0, 120)}`)
    expect(/Kiểm tra theo luật/.test(events) && /Nhật ký trận/.test(events), `thẻ Sự kiện trận: ${events.slice(0, 80)}`)
    expect((await page.locator('.fe-tabs button').first().innerText()).startsWith('Robot 1'), 'thiếu thẻ khối Robot 1')
    // Bấm "Trận mới" ba lần liền (cùng một khung): các lần dựng trận không chồng nhau, không giải phóng một thế giới
    // Rapier hai lần (lỗi JS sẽ làm phép thử trượt), trận cuối vẫn chạy.
    await page.evaluate(() => {
      const again = [...document.querySelectorAll('.fr-bar button')].find((b) => b.textContent === 'Trận mới')
      for (let k = 0; k < 3; k++) again.click()
    })
    await page.waitForTimeout(2000)
    const t = await page.evaluate(() => window.__fanroc.match.t)
    expect(t > -9.5, `sau 3 lần Trận mới đồng hồ đứng ở t = ${t.toFixed(2)}`)
    return `"${title}" · bảng điểm: ${hud.split('\n').slice(0, 4).join(' ')} · 3 lần Trận mới liền: t = ${t.toFixed(1)} s`
  })

  await test('E2 mẫu TeleOp + đẩy 2 cần lên 2 s ⇒ Robot 1 tiến về phía núi', async (page) => {
    await practice(page)
    await run(page, 0) // thẻ Robot 1 đã có sẵn mẫu TeleOp Maker
    await place(page, 0)
    await page.waitForTimeout(200)
    const a = await pose(page)
    await setPad(page, 0, UP)
    await page.waitForTimeout(2000)
    const b = await pose(page)
    const dz = a.z - b.z
    const dyaw = Math.abs(deg(b.yaw - a.yaw))
    expect(dz > 0.3, `z giảm ${dz.toFixed(3)} m (cần > 0.3)`)
    expect(dyaw < 10, `lệch hướng ${dyaw.toFixed(1)}°`)
    return `z giảm ${dz.toFixed(3)} m, lệch ${dyaw.toFixed(1)}°`
  })

  await test('E3 thả tay ⇒ dừng trong 0.5 s; rút tay ⇒ dừng; 2 tay: rút tay 1 thì Robot 2 vẫn chạy', async (page) => {
    await practice(page, 2)
    await run(page, 0)
    await run(page, 1)
    // a) thả tay
    await place(page, 0)
    await setPad(page, 0, UP)
    await page.waitForTimeout(1000)
    await setPad(page, 0, MID)
    await page.waitForTimeout(500)
    const a1 = await pose(page)
    await page.waitForTimeout(500)
    const a2 = await pose(page)
    expect(dist(a1, a2) < 0.01, `thả tay: sau 0.5 s vẫn trôi ${dist(a1, a2).toFixed(4)} m`)
    // b) rút tay giữa lúc đang đẩy
    await place(page, 0)
    await page.waitForTimeout(200)
    const bs = await pose(page)
    await setPad(page, 0, UP)
    await page.waitForTimeout(800)
    const b0 = await pose(page)
    expect(bs.z - b0.z > 0.1, `rút tay: trước khi rút robot chỉ tiến ${(bs.z - b0.z).toFixed(3)} m`)
    await setPad(page, 0, null)
    await page.waitForTimeout(500)
    const b1 = await pose(page)
    await page.waitForTimeout(800)
    const b2 = await pose(page)
    expect(dist(b1, b2) < 0.01, `rút tay: robot vẫn chạy ${dist(b1, b2).toFixed(4)} m`)
    const pads = await page.locator('.fr-pads').innerText()
    expect(/Tay cầm 1 → Robot 1: đã rút ra/.test(pads), `ô tay cầm: ${pads}`)
    // c) hai tay: cắm lại tay 1, cả hai đẩy, rút tay 1 ⇒ Robot 1 dừng, Robot 2 vẫn tiến
    await place(page, 0)
    await place(page, 1)
    await setPad(page, 0, UP)
    await setPad(page, 1, UP)
    await page.waitForTimeout(800)
    await setPad(page, 0, null)
    await page.waitForTimeout(500)
    const c1 = [await pose(page, 0), await pose(page, 1)]
    await page.waitForTimeout(800)
    const c2 = [await pose(page, 0), await pose(page, 1)]
    const r2 = c1[1].z - c2[1].z
    expect(dist(c1[0], c2[0]) < 0.01, `2 tay: Robot 1 vẫn chạy ${dist(c1[0], c2[0]).toFixed(4)} m sau khi rút tay 1`)
    expect(r2 > 0.1, `2 tay: Robot 2 chỉ tiến ${r2.toFixed(3)} m khi tay 2 vẫn đẩy`)
    return `thả: trôi ${dist(a1, a2).toFixed(4)} m · rút: trôi ${dist(b1, b2).toFixed(4)} m · 2 tay: R1 trôi ${dist(c1[0], c2[0]).toFixed(4)} m, R2 tiến ${r2.toFixed(3)} m`
  })

  await test('E4 chương trình lỗi ⇒ robot dừng, lỗi tiếng Việt cạnh vùng khối, đồng hồ trận vẫn chạy', async (page) => {
    await open(page)
    await quietOthers(page)
    await (await bar(page, 'Trận mới')).click()
    await page.waitForFunction(() => window.__fanroc.match.t < -9)
    await skipRelease(page)
    // Chạy tới 1 s rồi chia số nguyên cho 0 (bo ảo dừng vì IntegerDivideByZero).
    await page.evaluate(() => {
      const n = (v) => ({ shadow: { type: 'math_number', fields: { NUM: v } } })
      const motor = (m, v, next) => ({ type: 'thingBotC3_setMotor', fields: { MOTOR: String(m), DIRECTION: 'forward' }, inputs: { SPEED: v }, ...(next ? { next: { block: next } } : {}) })
      const wait = (s, next) => ({ type: 'control_wait', inputs: { DURATION: { shadow: { type: 'math_positive_number', fields: { NUM: s } } } }, next: { block: next } })
      const div0 = { ...n(0), block: { type: 'operator_divide', inputs: { NUM1: n(100), NUM2: n(0) } } }
      window.__fanroc.editors.load(0, { blocks: { languageVersion: 0, blocks: [
        { type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: { type: 'thingBotC3_init', next: { block: motor(1, n(70), motor(2, n(70), wait(1, motor(1, div0)))) } } } },
        { type: 'event_whenarduinoloop', x: 30, y: 400 },
      ] } })
    })
    await place(page, 0)
    await page.waitForTimeout(200)
    const a = await pose(page)
    await run(page, 0)
    await page.waitForFunction(() => window.__fanroc.editors.state(0) === 'error', null, { timeout: 10000 })
    const b = await pose(page)
    await page.waitForTimeout(300)
    const c = await pose(page)
    const t1 = await page.evaluate(() => window.__fanroc.match.t)
    await page.waitForTimeout(1000)
    const d = await pose(page)
    const t2 = await page.evaluate(() => window.__fanroc.match.t)
    const phase = await page.evaluate(() => window.__fanroc.match.phase)
    const err = panel(page).locator('.fe-error')
    const text = (await err.isVisible()) ? await err.innerText() : ''
    expect(a.z - b.z > 0.1, `trước lỗi robot chỉ đi ${(a.z - b.z).toFixed(3)} m — chương trình không chạy?`)
    expect(dist(c, d) < 0.01, `sau lỗi robot vẫn chạy ${dist(c, d).toFixed(4)} m`)
    expect(text.includes('Chương trình dừng vì lỗi: chia một số nguyên cho 0'), `lỗi hiện: "${text}"`)
    expect(phase === 'play' && t2 - t1 > 0.8, `đồng hồ: ${t1.toFixed(2)} → ${t2.toFixed(2)} s, pha ${phase}`)
    return `đi ${(a.z - b.z).toFixed(2)} m rồi dừng (trôi ${dist(c, d).toFixed(4)} m) · "${text}" · đồng hồ ${t1.toFixed(1)} → ${t2.toFixed(1)} s`
  })

  // E5 (Human Player bấm phím Q/A/S/D) bỏ: Task 10 bỏ KEYMAP, Human Player luôn tự động (chốt 04/11). Task 16 viết lại
  // phép thử đầu-cuối theo giao diện mới; luật nạp bóng P04–P07 có phép thử Node ở human.test.ts.
  skip('E5 bàn phím Human Player', 'đã bỏ KEYMAP (Task 10) — Human Player tự động, xem human.test.ts')

  await test('E6 trận ×40 với 4 agent ⇒ HẾT GIỜ, bảng đội 4 dòng, màn kết quả: điểm trận = tổng các mục', async (page) => {
    await open(page)
    await seat(page, 0, 'agent-medium')
    await (await bar(page, 'Trận mới')).click()
    await page.waitForFunction(() => window.__fanroc.match.t < -9)
    const sp = await page.evaluate(() => window.__fanroc.setSpeed(40))
    expect(sp === 40, `tốc độ thật ×${sp}`)
    const t0 = Date.now()
    await page.waitForFunction(() => window.__fanroc.match.phase === 'end', null, { timeout: 240000 })
    const wall = (Date.now() - t0) / 1000
    await page.waitForTimeout(500)
    const phase = await page.locator('.sb-phase').innerText()
    const rows = await page.locator('.fr-teams .fr-chk').count() // bảng đội (lỗi nhẹ / thẻ) ở thẻ Sự kiện trận
    const total = Number(await page.locator('.sb-result .sb-big').innerText())
    // Bảng mục của màn kết quả: "+15", "−6", "0" (dấu trừ U+2212).
    const items = (await page.locator('.sb-result [data-side="total"] .sb-row b').allInnerTexts()).map((t) => Number(t.replace('−', '-')))
    const sum = items.reduce((s, v) => s + v, 0)
    const model = await page.evaluate(() => window.__fanroc.match.result().score.total)
    expect(phase === 'HẾT GIỜ', `pha "${phase}"`)
    expect(rows === 4, `bảng đội ${rows} dòng`)
    expect(items.length === 7 && total === sum && total === model, `điểm ${total}, tổng mục ${sum} (${items.join(' ')}), mô hình ${model}`)
    return `190 s trận trong ${wall.toFixed(1)} s · điểm ${total} = ${items.join(' + ')}`
  })

  await test('E7 "Tải về để nạp" tải tệp .tb giải nén ra project.json', async (page) => {
    await open(page)
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), runBtn(page, 'Tải .tb để nạp ThingBot').click()])
    const name = dl.suggestedFilename()
    const dir = await mkdtemp(resolve(tmpdir(), 'fanroc-tb-'))
    const file = resolve(dir, name)
    await dl.saveAs(file)
    const zip = await JSZip.loadAsync(await readFile(file))
    const pj = zip.file('project.json')
    expect(name.endsWith('.tb'), `tên tệp "${name}"`)
    expect(pj, `trong zip chỉ có: ${Object.keys(zip.files).join(', ')}`)
    const project = JSON.parse(await pj.async('string'))
    expect(Array.isArray(project.targets) && project.targets.length > 0, 'project.json không có targets')
    return `${name} · project.json ${project.targets.length} target`
  })

  await test('E8 điện thoại 390×844: không cuộn ngang, biểu tượng Khối mở/đóng khung bên phủ sân, sân vẫn vẽ', async (page) => {
    // Task 11: nút ☰ cũ thay bằng biểu tượng Khối của cột biểu tượng; < 900 px khung bên phủ lên sân.
    await open(page)
    await page.waitForTimeout(1000)
    const noScrollX = () => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth)
    const blocksH = () => page.locator('[data-side="blocks"]').evaluate((e) => e.getBoundingClientRect().height)
    const menu = page.locator('.sh-act button[data-view="blocks"]')
    expect(await noScrollX(), 'trang cuộn ngang')
    const expanded = () => menu.getAttribute('aria-expanded')
    expect((await menu.getAttribute('aria-label')) === 'Khối', `aria-label "${await menu.getAttribute('aria-label')}"`)
    const stageW0 = await page.locator('#stage').evaluate((e) => e.getBoundingClientRect().width)
    const h0 = await blocksH()
    const x0 = await expanded()
    await menu.tap()
    await page.waitForTimeout(300)
    const h1 = await blocksH()
    const x1 = await expanded()
    const stageW1 = await page.locator('#stage').evaluate((e) => e.getBoundingClientRect().width)
    expect(await noScrollX(), 'trang cuộn ngang khi hiện vùng khối')
    expect(stageW1 === stageW0, `khung bên không phủ mà đẩy sân: ${stageW0} → ${stageW1} px`)
    await menu.tap()
    await page.waitForTimeout(300)
    const h2 = await blocksH()
    const x2 = await expanded()
    expect(h0 === 0 && h1 > 200 && h2 === 0, `vùng khối cao ${h0} → ${h1} → ${h2}`)
    expect(x0 === 'false' && x1 === 'true' && x2 === 'false', `aria-expanded ${x0} → ${x1} → ${x2}`)
    // Sân vẫn vẽ: ảnh chụp canvas có nhiều màu (không trắng / đen trơn).
    const png = (await page.locator('#stage canvas').screenshot()).toString('base64')
    const colors = await page.evaluate(async (b64) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, img.width, img.height).data
      const seen = new Set()
      for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4))
      return seen.size
    }, png)
    expect(colors > 20, `canvas chỉ có ${colors} màu`)
    return `vùng khối ${h0} → ${Math.round(h1)} → ${h2} px (aria-expanded ${x0} → ${x1} → ${x2}) · canvas ${colors} màu`
  }, { width: 390, height: 844 })

  await test('E9 đồ hoạ Thấp: khung hình trung bình 5 s trận ≥ 30 fps', async (page) => {
    await open(page)
    await seat(page, 0, 'agent-medium')
    await (await bar(page, 'Đồ hoạ thấp')).click()
    const low = await (await bar(page, 'Đồ hoạ thấp')).getAttribute('aria-pressed')
    const high = await (await bar(page, 'Đồ hoạ cao')).getAttribute('aria-pressed')
    expect(low === 'true' && high === 'false', `đồ hoạ thấp chưa bật (thấp ${low}, cao ${high})`)
    await (await bar(page, 'Trận mới')).click()
    await page.waitForFunction(() => window.__fanroc.match.t < -9)
    await skipRelease(page)
    await page.waitForTimeout(500)
    const { fps, frames } = await page.evaluate(
      () =>
        new Promise((ok) => {
          let frames = 0
          const t0 = performance.now()
          const tick = (now) => {
            if (now - t0 >= 5000) return ok({ frames, fps: (frames * 1000) / (now - t0) })
            frames++
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
    )
    const phase = await page.evaluate(() => window.__fanroc.match.phase)
    expect(phase === 'play', `pha ${phase}`)
    expect(fps >= 30, `${fps.toFixed(1)} fps`)
    return `${fps.toFixed(1)} fps (${frames} khung / 5 s, đồ hoạ thấp, Chromium headless + ANGLE Metal)`
  })

  await test('E10 Luyện tập: bấm ▶ Mẫu Auto ngay ⇒ Robot 1 rời ô xuất phát trong 2 s', async (page) => {
    // Không dùng practice(): chỉ chờ trận luyện tập mới được dựng (pha nào cũng được), rồi chạy ngay.
    await open(page)
    await quietOthers(page)
    await page.evaluate(() => (window.__oldMatch = window.__fanroc.match))
    await (await bar(page, 'Luyện tập')).click()
    await page.waitForFunction(() => window.__fanroc.match !== window.__oldMatch && window.__fanroc.match.practice, null, { timeout: 30000 })
    const a = await pose(page)
    await (await bar(page, 'Mẫu Auto')).click() // Mẫu Auto của thẻ Robot 1 (khung ⚙)
    await run(page, 0) // gồm 0.3 s chờ bo ảo khởi động
    await page.waitForTimeout(1700)
    const b = await pose(page)
    const m = await page.evaluate(() => ({ phase: window.__fanroc.match.phase, t: window.__fanroc.match.t }))
    const clock = `${await page.locator('.sb-phase').innerText()} · ${await page.locator('.sb-clock').innerText()}`
    expect(dist(a, b) > 0.1, `sau 2 s Robot 1 chỉ đi ${dist(a, b).toFixed(3)} m (pha ${m.phase}, t = ${m.t.toFixed(2)} s)`)
    expect(/^LUYỆN TẬP · \d+:\d\d$/.test(clock), `đồng hồ "${clock}"`)
    return `đi ${dist(a, b).toFixed(3)} m trong 2 s · pha ${m.phase}, t = ${m.t.toFixed(1)} s · đồng hồ "${clock}"`
  })

  await test('E11 Tạm dừng ⇒ đồng hồ + robot đứng, tốc độ khoá ×1; Từng khối ⇒ sân chạy đúng một khối (≤ 5 s); Chạy tiếp', async (page) => {
    await practice(page)
    await (await bar(page, 'Mẫu Auto')).click()
    await run(page, 0)
    await runBtn(page, 'Tạm dừng').click()
    const t0 = await page.evaluate(() => window.__fanroc.match.t)
    const a = await pose(page)
    await page.waitForTimeout(600)
    const t1 = await page.evaluate(() => window.__fanroc.match.t)
    expect(t1 === t0 && dist(a, await pose(page)) < 1e-6, `tạm dừng mà đồng hồ ${t0} → ${t1}`)
    expect((await linkState(page, 0)) === 'paused', `bo ảo: ${await linkState(page, 0)}`)
    expect((await page.evaluate(() => window.__fanroc.setSpeed(40))) === 1, 'tạm dừng vẫn phải khoá ×1 (R24)')
    // Từng khối: khối đặt động cơ không tốn thời gian ảo, khối đợi thì sân chạy đúng thời gian đợi.
    const jumps = []
    for (let k = 0; k < 12 && !jumps.some((d) => d > 0.05); k++) {
      const before = await page.evaluate(() => window.__fanroc.match.t)
      await runBtn(page, 'Chạy từng khối').click()
      await page.waitForTimeout(150)
      jumps.push((await page.evaluate(() => window.__fanroc.match.t)) - before)
    }
    expect(jumps.some((d) => d > 0.05) && jumps.every((d) => d >= 0 && d <= 5 + 1e-6), `bước: ${jumps.map((d) => d.toFixed(2)).join(' ')}`)
    expect((await linkState(page, 0)) === 'paused', 'sau Từng khối bo ảo vẫn tạm dừng')
    const t2 = await page.evaluate(() => window.__fanroc.match.t)
    await runBtn(page, 'Chạy').click() // đang tạm dừng: Chạy = chạy tiếp
    await page.waitForTimeout(500)
    const t3 = await page.evaluate(() => window.__fanroc.match.t)
    expect((await linkState(page, 0)) === 'running' && t3 - t2 > 0.2, `chạy tiếp: ${t2.toFixed(2)} → ${t3.toFixed(2)} s`)
    return `đứng ${t0.toFixed(2)} s · từng khối ${jumps.map((d) => d.toFixed(2)).join(' ')} s · chạy tiếp +${(t3 - t2).toFixed(2)} s`
  })
}

// ---------- Phép thử giao diện mới (Task 11+) ----------
async function shellTests() {
  await test('N1 vỏ kiểu VS Code: tiêu đề, bấm Khối mở/đóng khung bên, panel đáy thu gọn, nút không emoji', async (page) => {
    await open(page)
    const title = await page.title()
    expect(title === 'ThingBot FanRoc Game', `tiêu đề "${title}"`)
    const act = page.locator('.sh-act button[data-view="blocks"]')
    const side = page.locator('[data-side="blocks"]')
    const avail = () => page.evaluate(() => innerWidth - 48)
    const stageW = () => page.locator('#stage').evaluate((e) => e.getBoundingClientRect().width)
    expect(!(await side.isVisible()), 'khung Khối đang mở sẵn (trận: mặc định ẩn)')
    await act.click()
    await page.waitForTimeout(200)
    expect(await side.isVisible(), 'bấm Khối mà khung Khối không hiện')
    const wOpen = await stageW()
    expect((await act.getAttribute('aria-pressed')) === 'true', 'biểu tượng Khối không sáng khi khung mở')
    await act.click()
    await page.waitForTimeout(200)
    expect(!(await side.isVisible()), 'bấm lại Khối mà khung Khối không ẩn')
    const w = await stageW()
    const a = await avail()
    expect(w >= 0.9 * a, `#stage rộng ${w} px < 90 % của ${a} px`)
    const ph = await page.locator('.sh-panel').evaluate((e) => e.getBoundingClientRect().height)
    expect(ph <= 30, `panel đáy cao ${ph} px (thu gọn phải ≤ 30 px)`)
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .map((b) => `${b.textContent} ${b.getAttribute('aria-label') ?? ''} ${b.title}`)
        .filter((t) => /\p{Extended_Pictographic}/u.test(t)),
    )
    expect(!bad.length, `nút có emoji: ${bad.slice(0, 3).join(' | ')}`)
    return `"${title}" · sân ${Math.round(wOpen)} → ${Math.round(w)} / ${a} px · panel ${ph} px`
  })

  await test('N1b thanh chạy: Chạy rồi Tạm dừng ⇒ khối sắp chạy sáng viền, thanh trạng thái "Đang chạy khối", mã Arduino hiện', async (page) => {
    await open(page)
    await (await bar(page, 'Luyện tập')).click()
    await page.waitForFunction(() => window.__fanroc.match.practice)
    await (await bar(page, 'Mẫu Auto')).click()
    await blocksSide(page)
    await runBtn(page, 'Chạy').click()
    await page.waitForFunction(() => window.__fanroc.editors.state(0) === 'running', null, { timeout: 15000 })
    await page.waitForTimeout(600)
    await runBtn(page, 'Tạm dừng').click()
    await page.waitForTimeout(300)
    const glow = await page.locator('.fe-panel:not([hidden]) .blocklyHighlighted').count()
    const status = await page.locator('.sh-status').innerText()
    const disabled = await runBtn(page, 'Tạm dừng').isDisabled()
    expect(glow === 1, `${glow} khối sáng viền (cần đúng 1)`)
    expect(/Đang chạy khối: \S/.test(status), `thanh trạng thái: ${status.replace(/\n/g, ' | ')}`)
    expect(disabled, 'đang tạm dừng mà nút Tạm dừng vẫn bấm được')
    await page.locator('.sh-act button[data-view="code"]').click()
    await page.waitForTimeout(400)
    const code = await page.locator('.sh-code-view').innerText()
    const kw = await page.locator('.sh-code-view .k').count()
    expect(/void setup\(\)/.test(code) && kw > 3, `mã Arduino: ${code.slice(0, 60)} (${kw} từ khoá tô màu)`)
    await runBtn(page, 'Dừng').click()
    await page.waitForTimeout(200)
    const glowAfter = await page.locator('[data-side] .blocklyHighlighted').count()
    expect(glowAfter === 0, `đã Dừng mà còn ${glowAfter} khối sáng`)
    return `${status.split('\n').find((t) => t.startsWith('Đang chạy khối'))} · mã ${code.split('\n').length} dòng, ${kw} từ khoá`
  })

  await test('N1c Serial chạm trần vẫn đếm dòng mới; thanh chạy: Dừng theo thẻ, tạm dừng + Chạy không đổi người lái, không ghế chương trình ⇒ khoá Từng khối', async (page) => {
    await open(page)
    await (await bar(page, 'Luyện tập')).click()
    await page.waitForFunction(() => window.__fanroc.match.practice)
    await blocksSide(page)
    await runBtn(page, 'Chạy').click()
    await page.waitForFunction(() => window.__fanroc.editors.state(0) === 'running', null, { timeout: 15000 })
    // Bo ảo in Serial (thư giả cùng lần nạp): 7000 dòng (chạm trần 20 000 ký tự) rồi thêm 10 dòng giống hệt.
    const feed = (n) =>
      page.evaluate((n) => {
        const l = window.__fanroc.editors.link(0)
        l.receive({ type: 'snapshot', run: l.loads, snapshot: { pwm: Array(16).fill(0), running: true, serial: 'hi\n'.repeat(n) }, bus: {} })
      }, n)
    const badge = () => page.locator('.sh-act button[data-view="serial"] .sh-badge').evaluate((e) => (e.hidden ? '' : e.textContent))
    await feed(7000)
    await page.waitForTimeout(100)
    const b1 = await badge()
    await page.locator('.sh-act button[data-view="serial"]').click()
    await page.waitForTimeout(100)
    const shown = await page.locator('.sh-serial').evaluate((e) => e.textContent.length)
    const b2 = await badge()
    await page.locator('.sh-act button[data-view="serial"]').click()
    await feed(10)
    await page.waitForTimeout(100)
    const b3 = await badge()
    expect(b1 === '99+' && shown === 20000 && b2 === '' && b3 === '10', `số đỏ ${b1} → mở Serial ${b2} (${shown} ký tự) → +10 dòng: "${b3}"`)
    // Đổi sang thẻ Robot 2 ⇒ số chưa xem của Robot 1 không mang sang.
    await (await tab(page, 1)).click()
    await page.waitForTimeout(100)
    const b4 = await badge()
    expect(b4 === '', `đổi thẻ mà số đỏ còn "${b4}"`)
    // Tạm dừng ở thẻ Robot 2 (chưa nạp): Dừng khoá; Chạy chỉ chạy tiếp, Robot 2 vẫn do agent lái.
    await runBtn(page, 'Tạm dừng').click()
    await page.waitForTimeout(100)
    const stopOff = await runBtn(page, 'Dừng').isDisabled()
    await runBtn(page, 'Chạy').click()
    await page.waitForTimeout(200)
    const r2 = await page.evaluate(() => ({ paused: window.__fanroc.session.paused, kind: window.__fanroc.session.driver(1).kind, st: window.__fanroc.editors.state(1) }))
    expect(stopOff, 'thẻ Robot 2 chưa có chương trình mà Dừng vẫn bấm được khi phiên tạm dừng')
    expect(!r2.paused && r2.kind === 'agent' && r2.st === 'idle', `tạm dừng + Chạy: ${JSON.stringify(r2)}`)
    // Không ghế nào do chương trình lái ⇒ Chạy từng khối khoá.
    await seat(page, 0, 'agent-medium')
    await page.waitForTimeout(300)
    const stepOff = await runBtn(page, 'Chạy từng khối').isDisabled()
    expect(stepOff, 'không có ghế chương trình mà Chạy từng khối vẫn bấm được')
    return `số đỏ ${b1} → ${b2 || 'ẩn'} → ${b3} · Dừng khoá · Robot 2 vẫn ${r2.kind} · Từng khối khoá`
  })

  await test('N2 trận ×40 4 agent ⇒ đếm ngược 3·2·1·BẮT ĐẦU!, màn kết quả Đỏ | chung | Xanh, tổng = match.result(), Chơi lại', async (page) => {
    await open(page)
    // Ghi lại mọi chữ đếm ngược hiện ra (mỗi lần một phần tử mới trong .sb-count).
    await page.evaluate(() => {
      window.__counts = []
      new MutationObserver(() => {
        const b = document.querySelector('.sb-count b')
        if (b && window.__counts.at(-1) !== b.textContent) window.__counts.push(b.textContent)
      }).observe(document.querySelector('.sb-count'), { childList: true })
    })
    await seat(page, 0, 'agent-medium')
    await (await bar(page, 'Trận mới')).click()
    await page.waitForFunction(() => window.__fanroc.match.t < -9)
    await page.evaluate(() => window.__fanroc.setSpeed(4)) // ×4: mỗi mốc đếm ngược cách nhau ~15 khung
    await page.waitForFunction(() => window.__fanroc.match.phase === 'play', null, { timeout: 30000 })
    const counts = await page.evaluate(() => window.__counts)
    expect(['3', '2', '1', 'BẮT ĐẦU!'].every((c) => counts.includes(c)), `đếm ngược: ${counts.join(' · ')}`)
    // Nhãn chương trình: 4 ghế đều Máy Vừa.
    const progs = await page.locator('.sb .sb-prog').allTextContents()
    expect(progs.length === 4 && progs.every((t) => t === 'Máy Vừa'), `nhãn: ${progs.join(', ')}`)
    expect((await page.evaluate(() => window.__fanroc.setSpeed(40))) === 40, 'không lên được ×40')
    await page.waitForFunction(() => window.__fanroc.match.phase === 'end', null, { timeout: 240000 })
    await page.locator('.sb-result:not([hidden])').waitFor({ timeout: 5000 })
    const sides = await page.locator('.sb-result [data-side]').evaluateAll((es) => es.map((e) => e.dataset.side))
    expect(JSON.stringify(sides) === '["red","total","blue"]', `vùng: ${sides.join(', ')}`)
    const shown = Number(await page.locator('.sb-result [data-side="total"] .sb-big').innerText())
    const model = await page.evaluate(() => window.__fanroc.match.result())
    expect(shown === model.score.total, `màn kết quả ${shown}, mô hình ${model.score.total}`)
    // Điểm đội trên hai cột = result().teams theo ghế (Đỏ: Robot 1, 3; Xanh: Robot 2, 4).
    const red = (await page.locator('.sb-result [data-side="red"] .sb-trow b').allInnerTexts()).map(Number)
    const blue = (await page.locator('.sb-result [data-side="blue"] .sb-trow b').allInnerTexts()).map(Number)
    const want = model.teams.map((t) => t.score)
    expect(JSON.stringify(red) === JSON.stringify([want[0], want[2]]) && JSON.stringify(blue) === JSON.stringify([want[1], want[3]]), `đội đỏ ${red} xanh ${blue}, mô hình ${want}`)
    const acts = await page.locator('.sb-result .sb-acts button').allInnerTexts()
    expect(acts.includes('Chơi lại') && acts.includes('Về màn chính'), `nút: ${acts.join(', ')}`)
    if (SHOTS) await page.screenshot({ path: resolve(SHOTS, 't12-result.png') })
    await page.evaluate(() => (window.__oldMatch = window.__fanroc.match))
    await page.locator('.sb-result button', { hasText: 'Chơi lại' }).click()
    await page.waitForFunction(() => window.__fanroc.match !== window.__oldMatch, null, { timeout: 30000 })
    await page.waitForTimeout(300)
    expect(await page.locator('.sb-result').isHidden(), 'Chơi lại mà màn kết quả còn hiện')
    return `đếm ngược ${counts.join(' · ')} · tổng ${shown} · đỏ ${red.join('/')} · xanh ${blue.join('/')}`
  })

  await test('N2b báo điểm nổi "+10 · Vùng Bảo Vệ" khi robot vào Vùng Bảo Vệ; thanh chạy nằm dưới bảng điểm', async (page) => {
    await open(page)
    await quietOthers(page)
    await page.locator('.fr-bar').evaluate((e) => (e.hidden = true)) // đóng khung ⚙ cho ảnh chụp
    await skipRelease(page)
    const s = ZONES.safe.red
    await page.evaluate((p) => window.__fanroc.robots[0].setPose(p), { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, yaw: 0 })
    await page.locator('.sb-pop', { hasText: '+10 · Vùng Bảo Vệ' }).waitFor({ timeout: 3000 })
    await page.waitForTimeout(250) // qua phần phóng to của chữ nổi
    const sb = await page.locator('.sb').boundingBox()
    const run = await page.locator('.sh-run').boundingBox()
    expect(run.y >= sb.y + sb.height, `thanh chạy y=${run.y} đè bảng điểm (đáy ${sb.y + sb.height})`)
    const park = await page.locator('.sb [data-side="red"] .sb-hd span').innerText()
    expect(park === 'Đỗ 10', `ô Đỏ: "${park}"`)
    if (SHOTS) await page.screenshot({ path: resolve(SHOTS, 't12-match.png') })
    await page.waitForTimeout(1600)
    // Chữ nổi tự tắt sau 1,5 s (Human Player tự động có thể ghi thêm "+5 · Chữa Cháy" mới trong lúc chờ).
    const left = await page.locator('.sb-pop', { hasText: 'Vùng Bảo Vệ' }).count()
    expect(left === 0, `sau 1,5 s còn ${left} chữ "Vùng Bảo Vệ"`)
    return `bảng điểm đáy ${Math.round(sb.y + sb.height)} px, thanh chạy ${Math.round(run.y)} px · "${park}"`
  })
}

let code = 1
try {
  await main()
  const bad = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - bad}/${results.length} ĐẠT`)
  code = bad || !results.length ? 1 : 0
} catch (e) {
  console.error(e)
} finally {
  await browser?.close()
  stopServer()
}
process.exit(code)
