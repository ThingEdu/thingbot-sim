/**
 * Phép thử đầu-cuối của sân FANROC trên trình duyệt thật (Playwright, lấy từ checkout ThingBlock như ftc-e2e.mjs
 * của nhánh spike/ursim).
 *
 *   npm run e2e:fanroc                 # tự bật Vite dev trên một cổng trống, chạy N3–N6, N6b–N6d, N11 (Luật chơi + Robot mẫu Task 17), N2c (màn chính / ⚙ / Xưởng Task 13), N7, N8 (nhiệm vụ Task 14), N9, N10, N9b–N9d (giải đấu Task 15), N1, N1b, N1c (vỏ Task 11), N2, N2b (bảng điểm Task 12) và E1–E11 (E5 bỏ qua), tắt Vite
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
import { straight, turtle } from '../src/fanroc/missions/solutions.ts'
import { newTournament, playersIn, played, seatIds } from '../src/fanroc/ui/tournament.ts'
import { record } from '../src/fanroc/tournament.ts'

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
// ---------- Thao tác trên trang ----------
// Task 13: mở trang là vào màn chính; trận / đấu tập vào bằng `__fanroc.go` (N4, N6 đi bằng giao diện thật). Khung ⚙
// mới (.st-pop, ui/settings.ts): chế độ, liên minh, mức máy, tốc độ, đồ hoạ…; ai lái từng ghế ở mục Nâng cao.
async function open(page) {
  await page.goto(URL_)
  await page.waitForFunction(() => window.__fanroc?.editors && document.querySelector('#stage canvas') && window.__fanroc.screen === 'home', null, { timeout: 60000 })
  await page.locator('.hm[data-screen="home"]').waitFor({ timeout: 10000 })
}
/** Đổi màn qua router (đợi dựng xong phiên mới). */
const go = (page, screen) => page.evaluate((s) => window.__fanroc.go(s), screen)
const setPad = (page, i, axes) => page.evaluate(([i, axes]) => (window.__pads[i] = axes && { axes }), [i, axes])
const pose = (page, i = 0) => page.evaluate((i) => window.__fanroc.pose(i), i)
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z)
const deg = (rad) => (rad * 180) / Math.PI
/** Mở khung ⚙ nếu đang đóng (màn chính: nút ⚙ góc trên; màn khác: cột biểu tượng). */
async function settings(page) {
  if (await page.locator('.st-pop').isVisible()) return
  const home = page.locator('.hm[data-screen="home"]:not([hidden]) .hm-gear')
  if (await home.isVisible()) await home.click()
  else await page.locator('.sh-act button[data-view="settings"]').click()
  await page.locator('.st-pop').waitFor()
}
const closeSettings = (page) => page.keyboard.press('Escape')
/** Mở khung bên "Khối" nếu đang đóng. */
async function blocksSide(page) {
  if (await page.locator('[data-side="blocks"]').isHidden()) await page.locator('.sh-act button[data-view="blocks"]').click()
}
/** Ô chọn người lái ghế i (⚙ › Nâng cao): player-0 / player-1 / agent-* / copy-0 / copy-1. */
const seat = async (page, i, value) => {
  await settings(page)
  const adv = page.locator('.st-pop details[data-role="advanced"]')
  if (!(await adv.evaluate((d) => d.open))) await adv.locator('summary').click()
  await page.locator(`.st-pop select[data-seat="${i}"]`).selectOption(value)
}
/** Nút chữ trong khung ⚙ (mở khung trước). */
const bar = async (page, text) => {
  await settings(page)
  return page.locator('.st-pop button', { hasText: text }).first()
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

/** Robot 2–4 đứng yên: chạy theo chương trình của bạn 1 trên bo riêng (tay cầm trung tính). `keep2`: giữ ghế 2 (bạn 2). */
async function quietOthers(page, keep2 = false) {
  if (!keep2) await seat(page, 1, 'copy-0')
  await seat(page, 2, 'copy-0')
  await seat(page, 3, 'copy-0')
  await closeSettings(page)
}
/** Qua 10 s xả bóng: robot của em có chương trình nên tốc độ khoá ×1 (R24) — tua đồng hồ trận tới cuối xả bóng. */
async function skipRelease(page) {
  await page.evaluate(() => {
    const m = window.__fanroc.match
    if (m.phase === 'release') m.t = -0.02
  })
  await page.waitForFunction(() => window.__fanroc.match.phase === 'play', null, { timeout: 30000 })
}
/** Hai bạn chơi (⚙ › Hai bạn chơi). */
async function twoPlayers(page) {
  await (await bar(page, 'Hai bạn')).click()
  await page.waitForFunction(() => window.__fanroc.keypads().length === 2)
  await closeSettings(page)
}
/** Bấm ▶ Chạy ở thẻ i và chờ bo ảo chạy. */
async function run(page, i) {
  await (await tab(page, i)).click()
  await runBtn(page, 'Chạy').click()
  await page.waitForFunction((i) => window.__fanroc.editors.state(i) === 'running', i, { timeout: 15000 })
  await page.waitForTimeout(300) // bo ảo khởi động, gửi ảnh chụp PWM đầu
}
/**
 * Đấu tập, robot khác đứng yên; tay cầm cắm trước để gắn đúng ghế. Đấu tập không có 10 s xả bóng (ruling R31: tua
 * sẵn lúc tạo trận) nên trận mới mở ra đã ở pha thi đấu, t = 0. `pads` = 2 ⇒ hai bạn chơi (bạn 2 lái Robot 2).
 */
async function practice(page, pads = 1) {
  await open(page)
  for (let i = 0; i < pads; i++) {
    await setPad(page, i, MID)
    await page.waitForTimeout(150) // mỗi tay một khung để gắn ghế theo thứ tự cắm
  }
  if (pads === 2) await twoPlayers(page)
  await go(page, 'practice')
  await quietOthers(page, pads === 2)
  await page.evaluate(() => (window.__oldMatch = window.__fanroc.match))
  await runBtn(page, 'Về chỗ cũ').click() // trận mới với ghế vừa chọn
  await page.waitForFunction(() => {
    const m = window.__fanroc.match
    return m !== window.__oldMatch && m.practice && m.phase === 'play' && m.t < 1
  }, null, { timeout: 30000 })
}
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: resolve(SHOTS, name) })
}

// ---------- Các tình huống ----------
async function main() {
  URL_ = await startServer()
  console.log(`Trang: ${URL_}`)
  browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
  await gameTests()
  await missionTests()
  await tournamentTests()
  await shellTests()

  await test('E1 trang tải, không lỗi console, tiêu đề và chữ bảng điểm tiếng Việt', async (page) => {
    await open(page)
    await go(page, 'match')
    await page.waitForTimeout(1500)
    const title = await page.title()
    // Task 12: bảng điểm Đỏ | chung | Xanh thay HUD cũ; kiểm tra theo luật ở thẻ "Sự kiện trận".
    const hud = await page.locator('.sb').innerText()
    const events = await page.locator('.sh-pbody[data-panel="events"]').textContent()
    expect(title === 'ThingBot FanRoc Game', `tiêu đề "${title}"`)
    expect(/XẢ BÓNG/.test(hud) && /ĐỎ/.test(hud) && /XANH/.test(hud) && /Bạn 1/.test(hud) && /Chuồn Chuồn/.test(hud), `bảng điểm: ${hud.replace(/\n/g, ' ').slice(0, 120)}`)
    expect(/Kiểm tra theo luật/.test(events) && /Nhật ký trận/.test(events), `thẻ Sự kiện trận: ${events.slice(0, 80)}`)
    expect((await page.locator('.fe-tabs button').first().innerText()).startsWith('Bạn 1'), 'thiếu thẻ khối Bạn 1')
    // Bấm "Về chỗ cũ" ba lần liền (cùng một khung): các lần dựng trận không chồng nhau, không giải phóng một thế giới
    // Rapier hai lần (lỗi JS sẽ làm phép thử trượt), trận cuối vẫn chạy.
    await page.evaluate(() => {
      const again = document.querySelector('.sh-run button[data-run="reset"]')
      for (let k = 0; k < 3; k++) again.click()
    })
    await page.waitForTimeout(2000)
    const t = await page.evaluate(() => window.__fanroc.match.t)
    expect(t > -9.5, `sau 3 lần Về chỗ cũ đồng hồ đứng ở t = ${t.toFixed(2)}`)
    return `"${title}" · bảng điểm: ${hud.split('\n').slice(0, 4).join(' ')} · 3 lần Về chỗ cũ liền: t = ${t.toFixed(1)} s`
  })

  await test('E2 mẫu TeleOp + đẩy 2 cần lên 2 s ⇒ Robot 1 tiến về phía núi', async (page) => {
    await practice(page)
    await run(page, 0) // thẻ bạn 1 đã có sẵn mẫu TeleOp Maker
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
    const card = await page.locator('.rc-me').innerText()
    expect(/Tay cầm 1 đã rút ra/.test(card), `thẻ robot của em: ${card}`)
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
    await go(page, 'match')
    await quietOthers(page)
    await runBtn(page, 'Về chỗ cũ').click()
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
    await go(page, 'match')
    await seat(page, 0, 'agent-medium')
    await closeSettings(page)
    await runBtn(page, 'Về chỗ cũ').click()
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
    await go(page, 'practice')
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

  await test('E8 điện thoại 390×844: không cuộn ngang (màn chính, trận), biểu tượng Khối mở/đóng khung bên phủ sân, sân vẫn vẽ', async (page) => {
    // Task 11: nút ☰ cũ thay bằng biểu tượng Khối của cột biểu tượng; < 900 px khung bên phủ lên sân.
    await open(page)
    await page.waitForTimeout(500)
    const noScrollX = () => page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.hm')].every((e) => e.scrollWidth <= e.clientWidth + 1))
    expect(await noScrollX(), 'màn chính cuộn ngang')
    await page.locator('.hm-tile[data-tile="match"]').tap()
    await page.locator('.hm[data-screen="pick"]').waitFor()
    expect(await noScrollX(), 'màn Trước trận cuộn ngang')
    await go(page, 'match')
    await page.waitForTimeout(800)
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
    // ⚙ trên điện thoại cũng không cuộn ngang.
    await settings(page)
    expect(await page.evaluate(() => { const r = document.querySelector('.st-pop').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth }), 'khung ⚙ tràn ra ngoài màn')
    await closeSettings(page)
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
    await go(page, 'match')
    await seat(page, 0, 'agent-medium')
    await (await bar(page, 'Thấp')).click()
    const low = await (await bar(page, 'Thấp')).getAttribute('aria-pressed')
    const high = await (await bar(page, 'Cao')).getAttribute('aria-pressed')
    expect(low === 'true' && high === 'false', `đồ hoạ thấp chưa bật (thấp ${low}, cao ${high})`)
    await closeSettings(page)
    await runBtn(page, 'Về chỗ cũ').click()
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
    // Đồ hoạ lưu vào cài đặt (camera thì không — spec §8.7).
    const saved = await page.evaluate(() => window.__fanroc.store.settings().quality)
    expect(saved === 'low', `cài đặt đồ hoạ lưu "${saved}"`)
    return `${fps.toFixed(1)} fps (${frames} khung / 5 s, đồ hoạ thấp, Chromium headless + ANGLE Metal)`
  })

  await test('E10 Đấu tập: Mẫu Auto chạy ngay ⇒ Robot 1 rời ô xuất phát trong 2 s', async (page) => {
    // Không dùng practice(): chỉ chờ trận đấu tập mới được dựng (pha nào cũng được), rồi chạy ngay.
    await open(page)
    await go(page, 'practice')
    await quietOthers(page)
    const a = await pose(page)
    await page.evaluate(() => window.__fanroc.editors.sample(0, 'auto')) // Mẫu Auto của thẻ bạn 1
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
    await page.evaluate(() => window.__fanroc.editors.sample(0, 'auto'))
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

// ---------- Phép thử nhiệm vụ con rùa (Task 14) ----------
/** Mở danh sách nhiệm vụ từ ô Nhiệm vụ của màn chính. */
async function missionList(page) {
  await page.locator('.hm-tile[data-tile="missions"]').click()
  await page.locator('.hm[data-screen="missions"] .ml-card').first().waitFor()
}
async function missionTests() {
  await test('N7 nhiệm vụ 2: danh sách → thẻ 2, lời giải mẫu ▶ ⇒ trong 5 s mục tiêu đầu ✓, có vệt; Trận lẻ ⇒ không vệt', async (page) => {
    await open(page)
    await missionList(page)
    const cards = await page.locator('.hm[data-screen="missions"] .ml-card').count()
    const stages = await page.locator('.hm[data-screen="missions"] .ml-stage h2').allInnerTexts()
    expect(cards === 12 && stages.length === 4, `${cards} thẻ, ${stages.length} chặng`)
    const c2 = page.locator('.hm[data-screen="missions"] .ml-card[data-n="2"]')
    const t2 = await c2.locator('h3').innerText()
    expect(t2 === '2 – Đi thẳng' && (await c2.locator('.ml-diff i').count()) === 5, `thẻ 2: "${t2}"`)
    expect(!(await page.locator('.hm[data-screen="missions"] button').allInnerTexts()).some((t) => /\p{Extended_Pictographic}/u.test(t)), 'nút có emoji')
    await shot(page, 't14-list.png')
    await c2.click()
    await page.waitForFunction(() => window.__fanroc.screen === 'mission' && window.__fanroc.mission?.id === 'di-thang')
    expect((await page.evaluate(() => window.__fanroc.robots.length)) === 1, 'nhiệm vụ: không phải 1 robot (R61)')
    expect(await page.locator('[data-side="blocks"]').isVisible(), 'khung Khối không mở sẵn')
    expect((await page.evaluate(() => window.__fanroc.trail)) === null, 'chưa ▶ đã có vệt')
    // Khay khối của hộp công cụ nhiệm vụ: «đợi» mang số của chính hộp này (1), không phải 0.02 của hộp đầy đủ cũ.
    const flyout = await page.evaluate(() => {
      const t = [...document.querySelectorAll('[data-side="blocks"] .fe-panel:not([hidden]) .blocklyFlyout .blocklyText')].map((e) => e.textContent)
      return { wait: t[t.indexOf('đợi') - 1], all: t.join(' ') }
    })
    expect(flyout.wait === '1', `khay khối: «đợi» hiện "${flyout.wait}" (${flyout.all.slice(0, 80)})`)
    // Chấm khi chưa ▶ ⇒ nhắc bấm ▶.
    await page.locator('.mi button[data-role="grade"]').click()
    const tip = await page.locator('.mi-card [data-role="hint"]').innerText()
    expect(/Bấm ▶ để chạy trước/.test(tip), `Chấm trước ▶: "${tip}"`)
    await page.evaluate((state) => window.__fanroc.editors.load(0, state), straight(0.9))
    const t0 = Date.now()
    await runBtn(page, 'Chạy').click()
    await page.waitForFunction(() => document.querySelector('.mi-card li')?.dataset.ok === 'true', null, { timeout: 5000 })
    const firstOk = (Date.now() - t0) / 1000
    const segs = await page.evaluate(() => window.__fanroc.trail?.segments.length ?? 0)
    expect(segs >= 1, `vệt có ${segs} đoạn`)
    await page.waitForFunction(() => window.__fanroc.mission?.result, null, { timeout: 10000 })
    const r = await page.evaluate(() => ({ ...window.__fanroc.mission }))
    expect(r.reason === 'rest' && r.result.stars >= 2, `chấm: ${r.reason}, ${r.result.stars} sao`)
    const drawn = await page.evaluate(() => window.__fanroc.trailObjects)
    expect(drawn >= 2, `nhiệm vụ: chỉ ${drawn} hình vệt / đường gợi ý trên sân`)
    // Ra Trận lẻ, Xưởng, màn chính: không có vệt nào (cả dữ liệu lẫn hình trên sân).
    const left = []
    for (const scr of ['match', 'workshop', 'home']) {
      await go(page, scr)
      await page.waitForTimeout(400)
      const x = await page.evaluate(() => ({ trail: window.__fanroc.trail, n: window.__fanroc.trailObjects }))
      left.push(`${scr} ${x.n}`)
      expect(x.trail === null && x.n === 0, `${scr}: vẫn có vệt (trail ${x.trail === null ? 'null' : 'có'}, ${x.n} hình)`)
    }
    expect(await page.locator('.mi').isHidden(), 'phần phủ nhiệm vụ còn hiện ngoài nhiệm vụ')
    return `mục tiêu đầu ✓ sau ${firstOk.toFixed(1)} s · ${segs} đoạn vệt, ${drawn} hình · chấm "${r.reason}" ${r.result.stars} sao · ngoài nhiệm vụ: ${left.join(', ')} hình`
  })

  await test('N7b sửa nhiệm vụ 2 rồi chuyển ngay (< 1 s) sang nhiệm vụ 3 ⇒ bản sửa lưu cho nhiệm vụ 2, nhiệm vụ 3 giữ chương trình của nó', async (page) => {
    await open(page)
    await page.evaluate(() => window.__fanroc.go('mission', { id: 'di-thang' }))
    await page.waitForFunction(() => window.__fanroc.mission?.id === 'di-thang')
    // Nạp một chương trình có dấu hiệu riêng (đợi 0.55 s) rồi đổi thẻ để vùng khối báo "đã đổi" (bắt đầu đếm 1 s chờ lưu).
    await page.evaluate((state) => {
      window.__fanroc.editors.load(0, state)
      window.__fanroc.editors.show(0)
    }, straight(0.55))
    await page.locator('.sh-act button[data-view="missions"]').click()
    await page.locator('[data-side="missions"] .ml-card[data-n="3"]').click()
    await page.waitForFunction(() => window.__fanroc.mission?.id === 'cong-va-xoay')
    await page.waitForTimeout(1500) // quá hạn chờ lưu của cả hai
    const got = await page.evaluate(() => ({ a: JSON.stringify(window.__fanroc.store.mission('di-thang').program), b: JSON.stringify(window.__fanroc.store.mission('cong-va-xoay').program) }))
    expect(/"NUM":"?0\.55/.test(got.a), `nhiệm vụ 2 không giữ bản sửa: ${got.a.match(/NUM[^}]*/g)}`)
    expect(!/0\.55/.test(got.b), 'nhiệm vụ 3 bị ghi đè bằng chương trình của nhiệm vụ 2')
    const shown = await page.evaluate(() => JSON.stringify(window.__fanroc.editors.program(0)))
    expect(!/0\.55/.test(shown), 'vùng khối nhiệm vụ 3 hiện chương trình của nhiệm vụ 2')
    return `nhiệm vụ 2: có bản sửa · nhiệm vụ 3: ${got.b === 'null' ? 'chưa lưu (starter)' : 'chương trình riêng'}`
  })

  await test('N8 nhiệm vụ 7: lời giải mẫu đạt ≥ 2 sao, màn sao; tải lại trang ⇒ thẻ 7 vẫn ✓ và số sao', async (page) => {
    await open(page)
    await page.evaluate(() => window.__fanroc.go('mission', { id: 'hinh-vuong' }))
    await page.waitForFunction(() => window.__fanroc.mission?.id === 'hinh-vuong')
    expect(await page.locator('.mi-meas').isVisible(), 'nhiệm vụ 7 không có ô số đo')
    await page.locator('.mi button[data-role="guide"]').click()
    const g1 = await page.locator('.mi-guide p').innerText()
    await page.locator('.mi-guide button', { hasText: 'Tiếp' }).click()
    const g2 = await page.locator('.mi-guide p').innerText()
    expect(g1 && g2 && g1 !== g2, 'HƯỚNG DẪN không trượt sang bước 2')
    await page.locator('.mi-guide button', { hasText: 'Đóng' }).click()
    await page.evaluate((state) => window.__fanroc.editors.load(0, state), turtle(0.72, 131))
    await runBtn(page, 'Chạy').click()
    await page.waitForFunction(() => window.__fanroc.mission?.result, null, { timeout: 45000 })
    const r = await page.evaluate(() => ({ ...window.__fanroc.mission }))
    expect(r.result.stars >= 2, `${r.result.stars} sao (${r.reason})`)
    const card = page.locator('.mi-res-card')
    await card.waitFor()
    expect(Number(await card.getAttribute('data-stars')) === r.result.stars, 'màn sao sai số sao')
    expect(/Đã lưu tiến độ/.test(await card.innerText()), 'màn sao không báo đã lưu')
    await page.waitForTimeout(900) // sao hiện xong
    await shot(page, 't14-stars.png')
    await card.locator('button', { hasText: 'Xem lại vệt' }).click()
    const meas = await page.locator('.mi-meas').innerText()
    expect(/m/.test(meas) && /°/.test(meas), `ô số đo: ${meas}`)
    await shot(page, 't14-mission.png')
    // Tải lại: tiến độ còn trong localStorage.
    await page.reload()
    await open(page)
    await missionList(page)
    const c7 = page.locator('.hm[data-screen="missions"] .ml-card[data-n="7"]')
    const done = await c7.getAttribute('data-done')
    const stars = Number(await c7.getAttribute('data-stars'))
    expect(done === 'true' && (await c7.locator('.ok').count()) === 1 && stars >= 2, `thẻ 7 sau tải lại: done=${done}, ${stars} sao`)
    const lit = await c7.locator('.ml-stars svg[data-on="true"]').count()
    expect(lit === stars, `thẻ 7 sáng ${lit} sao`)
    return `${r.result.stars} sao (${r.reason}) · ô số đo "${meas.replace(/\n/g, ' ')}" · sau tải lại thẻ 7: ✓ ${stars} sao`
  })
}

// ---------- Phép thử màn chính, Trước trận, ⚙, Xưởng (Task 13) ----------
async function gameTests() {
  await test('N3 màn chính: 4 ô, Giải đấu chọn sẵn, phím mũi tên đổi ô, Enter ⇒ Giải đấu (màn ghi danh)', async (page) => {
    await open(page)
    await page.waitForTimeout(800) // camera quay chậm vào chỗ
    const tiles = await page.locator('.hm[data-screen="home"] .hm-tile').evaluateAll((es) => es.map((e) => e.dataset.tile))
    expect(JSON.stringify(tiles) === '["tournament","match","missions","workshop"]', `ô: ${tiles.join(', ')}`)
    const sel = () => page.locator('.hm-tile[aria-current="true"]').getAttribute('data-tile')
    expect((await sel()) === 'tournament', `ô chọn sẵn: ${await sel()}`)
    const line = await page.locator('.hm-sub').innerText()
    expect(/FANROC 2026–2027/.test(line) && /chương trình: Mặc định/.test(line), `dòng robot: ${line}`)
    expect(/0\/12/.test(await page.locator('.hm-tile[data-tile="missions"]').innerText()), 'ô Nhiệm vụ thiếu "0/12"')
    const cam = await page.evaluate(() => window.__fanroc.session.match.t)
    await shot(page, 't13-home.png')
    // Màn chính không lộ thanh chạy / bảng điểm.
    expect(await page.locator('.sh-run').isHidden(), 'màn chính còn thanh chạy')
    await page.keyboard.press('Enter')
    await page.locator('.hm[data-screen="tournament"]').waitFor({ timeout: 10000 })
    const reg = await page.locator('.hm[data-screen="tournament"]').innerText()
    expect(/Ghi danh/.test(reg) && (await page.evaluate(() => window.__fanroc.screen)) === 'tournament', `màn giải đấu: ${reg.slice(0, 60)}`)
    await page.locator('.hm[data-screen="tournament"] button', { hasText: 'Về màn chính' }).click()
    await page.locator('.hm[data-screen="home"]').waitFor()
    const moves = []
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft']) {
      await page.keyboard.press(k)
      moves.push(await sel())
    }
    expect(JSON.stringify(moves) === '["match","missions","workshop","match","tournament"]', `mũi tên: ${moves.join(' → ')}`)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter') // ô Trận lẻ · Đấu tập ⇒ Trước trận
    await page.locator('.hm[data-screen="pick"]').waitFor()
    return `ô ${tiles.join(' · ')} · mũi tên ${moves.join(' → ')} · Enter ⇒ ghi danh giải · t nền ${cam.toFixed(1)} s`
  })

  await test('N4 Trận lẻ (bàn phím, Mặc định): giữ W 2 s ⇒ rời ô ≥ 0,2 m; nhả ⇒ dừng trong 0,5 s; blur khi giữ W ⇒ dừng', async (page) => {
    await open(page)
    await page.locator('.hm-tile[data-tile="match"]').click()
    await page.locator('.hm[data-screen="pick"]').waitFor()
    const cardsN = await page.locator('.pk-card').count()
    const prog = await page.locator('.pk-card[aria-pressed="true"] .prog').innerText()
    expect(cardsN === 4 && prog === 'Mặc định', `thẻ robot ${cardsN}, nhãn "${prog}"`)
    const bars = await page.locator('.pk-card[aria-pressed="true"] .pk-bar').allInnerTexts()
    expect(bars.length === 3 && /Tốc độ/.test(bars[0]) && /Chứa bóng/.test(bars[1]) && /Cắm cờ/.test(bars[2]), `thanh: ${bars.join(' | ')}`)
    await shot(page, 't13-pick.png')
    await page.locator('.pk-acts button', { hasText: 'Vào trận' }).click()
    await page.waitForFunction(() => window.__fanroc.screen === 'match' && !window.__fanroc.match.practice, null, { timeout: 30000 })
    const me = await page.evaluate(() => window.__fanroc.mySeat())
    const kind = await page.evaluate((i) => window.__fanroc.session.driver(i).kind, me)
    expect(me === 0 && kind === 'program', `robot của em ghế ${me}, người lái ${kind}`)
    // Chương trình Mặc định nạp sẵn, chạy khi hết 10 s xả bóng (tốc độ khoá ×1).
    await page.waitForFunction(() => window.__fanroc.editors.state(0) === 'running', null, { timeout: 25000 })
    await page.waitForTimeout(300)
    const start = await pose(page, me)
    await page.locator('#stage canvas').click({ position: { x: 5, y: 5 } }) // tiêu điểm về trang (không ở ô nhập)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(2000)
    const moved = dist(start, await pose(page, me))
    await page.keyboard.up('KeyW')
    await page.waitForTimeout(500)
    const s1 = await pose(page, me)
    await page.waitForTimeout(500)
    const drift = dist(s1, await pose(page, me))
    expect(moved >= 0.2, `giữ W 2 s robot chỉ đi ${moved.toFixed(3)} m`)
    expect(drift < 0.01, `nhả W: sau 0,5 s vẫn trôi ${drift.toFixed(4)} m`)
    // Review Focus 1: đang giữ W mà cửa sổ mất tiêu điểm ⇒ nhả hết phím, robot dừng.
    await place(page, me)
    await page.waitForTimeout(200)
    const b0 = await pose(page, me)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(800)
    const b1 = await pose(page, me)
    expect(b0.z - b1.z > 0.1, `giữ W trước blur chỉ đi ${(b0.z - b1.z).toFixed(3)} m`)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await page.waitForTimeout(500)
    const b2 = await pose(page, me)
    await page.waitForTimeout(500)
    const blurDrift = dist(b2, await pose(page, me))
    await page.keyboard.up('KeyW')
    expect(blurDrift < 0.01, `blur khi giữ W: robot vẫn chạy ${blurDrift.toFixed(4)} m`)
    // Tab bị ẩn (visibilitychange, document.hidden = true) khi đang giữ W ⇒ nhả hết phím, robot dừng.
    await place(page, me)
    await page.waitForTimeout(200)
    const v0 = await pose(page, me)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(800)
    const v1 = await pose(page, me)
    expect(v0.z - v1.z > 0.1, `giữ W trước khi ẩn tab chỉ đi ${(v0.z - v1.z).toFixed(3)} m`)
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
      delete document.hidden
      delete document.visibilityState
    })
    await page.waitForTimeout(500)
    const v2 = await pose(page, me)
    await page.waitForTimeout(500)
    const hideDrift = dist(v2, await pose(page, me))
    await page.keyboard.up('KeyW')
    expect(hideDrift < 0.01, `ẩn tab khi giữ W: robot vẫn chạy ${hideDrift.toFixed(4)} m`)
    // Phím tắt Ctrl+W / ⌘+W không lái.
    await place(page, me)
    await page.waitForTimeout(200)
    const k0 = await pose(page, me)
    await page.keyboard.down('Control')
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(700)
    await page.keyboard.up('KeyW')
    await page.keyboard.up('Control')
    const ctrlDrift = dist(k0, await pose(page, me))
    expect(ctrlDrift < 0.01, `Ctrl+W mà robot đi ${ctrlDrift.toFixed(3)} m`)
    // Thẻ robot của em góc dưới trái.
    const card = await page.locator('.rc-me').innerText()
    expect(/Mẫu Maker · 2 bánh/.test(card) && /Chương trình: Mặc định/.test(card) && /Lái: Bàn phím/.test(card), `thẻ robot: ${card}`)
    // Đang gõ (ô nhập) thì W không lái.
    await place(page, me)
    await page.evaluate(() => {
      const i = Object.assign(document.createElement('input'), { id: '__type' })
      document.body.append(i)
      i.focus()
    })
    await page.waitForTimeout(200)
    const t0 = await pose(page, me)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(700)
    await page.keyboard.up('KeyW')
    const typed = dist(t0, await pose(page, me))
    expect(typed < 0.01, `gõ chữ W vào ô nhập mà robot đi ${typed.toFixed(3)} m`)
    return `giữ W 2 s: ${moved.toFixed(3)} m · nhả: trôi ${drift.toFixed(4)} m · blur: trôi ${blurDrift.toFixed(4)} m · ẩn tab: ${hideDrift.toFixed(4)} m · Ctrl+W: ${ctrlDrift.toFixed(4)} m · gõ: ${typed.toFixed(4)} m`
  })

  await test('N5 ⚙: mở / Esc đóng; màn chính có bảng phím; ở trận đủ mục, Nâng cao thu gọn, bấm ra ngoài đóng', async (page) => {
    await open(page)
    await page.locator('.hm-gear').click()
    const pop = page.locator('.st-pop')
    await pop.waitFor()
    const homeText = await pop.innerText()
    expect(/Phím điều khiển/.test(homeText) && /W \/ ↑/.test(homeText) && /Giữ: mở cửa xả/.test(homeText), `⚙ màn chính: ${homeText.slice(0, 120)}`)
    expect(!/Tốc độ/.test(homeText), 'màn chính không có mục Tốc độ')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    expect(await pop.isHidden(), 'Esc không đóng ⚙')
    await go(page, 'match')
    await page.locator('.sh-act button[data-view="settings"]').click()
    await pop.waitFor()
    const text = await pop.innerText()
    for (const k of ['Chế độ', 'Robot của em', 'Liên minh của em', 'Mức máy', 'Robot của em chạy', 'Tốc độ', 'Camera', 'Đồ hoạ', 'Âm thanh', 'Nâng cao']) {
      expect(text.includes(k), `⚙ trận thiếu "${k}"`)
    }
    expect(!(await pop.locator('details[data-role="advanced"]').evaluate((d) => d.open)), 'Nâng cao không thu gọn')
    // Có chương trình chạy (robot của em) ⇒ ×40 khoá (R24).
    const lock = await page.evaluate(() => ({ a: window.__fanroc.editors.anyActive(), s: window.__fanroc.editors.state(0), b: [...document.querySelectorAll('.st-pop button')].filter((b) => b.textContent.startsWith('×')).map((b) => b.textContent + ':' + b.disabled).join(' ') }))
    expect(await pop.locator('button', { hasText: '×40' }).isDisabled(), `×40 không khoá khi robot của em có chương trình: ${JSON.stringify(lock)}`)
    await shot(page, 't13-settings.png')
    // Nâng cao: đưa bạn 1 sang ghế 3 ⇒ ô chọn ghế 1 tự đổi sang máy (mỗi bạn một ghế), mục vẫn mở.
    await pop.locator('details[data-role="advanced"] summary').click()
    await pop.locator('select[data-seat="2"]').selectOption('player-0')
    await page.waitForTimeout(200)
    const seat0 = await pop.locator('select[data-seat="0"]').inputValue()
    const advOpen = await pop.locator('details[data-role="advanced"]').evaluate((d) => d.open)
    expect(seat0 === 'agent-medium' && advOpen, `sau khi đổi ghế 3: ghế 1 "${seat0}", Nâng cao mở ${advOpen}`)
    await page.mouse.click(1250, 420) // ra ngoài khung (trên sân)
    await page.waitForTimeout(150)
    expect(await pop.isHidden(), 'bấm ra ngoài không đóng ⚙')
    await page.locator('.sh-act button[data-view="settings"]').click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    expect(await pop.isHidden(), 'Esc không đóng ⚙ ở trận')
    return 'màn chính + trận: mở / Esc / bấm ngoài đều đúng'
  })

  await test('N6 Xưởng: Lưu ⇒ "Đã lưu v1", Trận lẻ nhãn "Của em v1"; Về mặc định ⇒ nhãn "Mặc định"', async (page) => {
    await open(page)
    await page.locator('.hm-tile[data-tile="workshop"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'workshop')
    const ws = page.locator('.ws-bar')
    await ws.waitFor()
    expect(await page.locator('[data-side="blocks"]').isVisible(), 'Xưởng: khung Khối không mở sẵn')
    const balls = await page.evaluate(() => window.__fanroc.world.balls.length)
    expect(balls === 0, `Xưởng: sân còn ${balls} bóng`)
    expect(/Mặc định/.test(await ws.locator('.prog').innerText()), 'Xưởng: nhãn ban đầu không phải Mặc định')
    await ws.locator('button', { hasText: 'Lưu cho robot của em' }).click()
    const msg = await ws.locator('.ws-msg').innerText()
    expect(msg === 'Đã lưu v1', `báo lưu: "${msg}"`)
    await shot(page, 't13-workshop.png')
    await page.locator('.sh-act button[aria-label="Màn chính"]').click()
    await page.locator('.hm[data-screen="home"]').waitFor()
    const line = await page.locator('.hm-sub').innerText()
    expect(/chương trình: Của em v1/.test(line), `màn chính: ${line}`)
    await page.locator('.hm-tile[data-tile="match"]').click()
    const prog = await page.locator('.pk-card[aria-pressed="true"] .prog').innerText()
    expect(prog === 'Của em v1', `Trước trận: "${prog}"`)
    await page.locator('.pk-acts button', { hasText: 'Vào trận' }).click()
    await page.waitForFunction(() => window.__fanroc.screen === 'match')
    await page.waitForTimeout(600)
    const sb = await page.locator('.sb [data-side="red"] .sb-prog').first().innerText()
    const card = await page.locator('.rc-me').innerText()
    expect(sb === 'Của em v1' && /Của em v1/.test(card), `bảng điểm "${sb}", thẻ: ${card}`)
    // Về mặc định ⇒ nhãn Mặc định.
    await go(page, 'workshop')
    await ws.locator('button', { hasText: 'Về mặc định' }).click()
    const msg2 = await ws.locator('.ws-msg').innerText()
    expect(/mặc định/.test(msg2) && /Mặc định/.test(await ws.locator('.prog').innerText()), `Về mặc định: "${msg2}"`)
    await go(page, 'home')
    const line2 = await page.locator('.hm-sub').innerText()
    expect(/chương trình: Mặc định/.test(line2), `màn chính sau Về mặc định: ${line2}`)
    await page.locator('.hm-tile[data-tile="match"]').click()
    const prog2 = await page.locator('.pk-card[aria-pressed="true"] .prog').innerText()
    expect(prog2 === 'Mặc định', `Trước trận sau Về mặc định: "${prog2}"`)
    return `"${msg}" · màn chính / Trước trận / bảng điểm "Của em v1" · "${msg2}" ⇒ "Mặc định"`
  })

  await test('N6b Xưởng: bộ nhớ bị chặn ghi ⇒ không báo "Đã lưu", báo lỗi tiếng Việt', async (page) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('đầy', 'QuotaExceededError')
      }
    })
    await open(page)
    await go(page, 'workshop')
    await page.locator('.ws-bar button', { hasText: 'Lưu cho robot của em' }).click()
    const msg = await page.locator('.ws-msg').innerText()
    const ok = await page.locator('.ws-msg').getAttribute('data-ok')
    expect(/^Không lưu được/.test(msg) && ok === 'false', `báo: "${msg}" (${ok})`)
    expect(/Mặc định/.test(await page.locator('.ws-bar .prog').innerText()), 'nhãn đổi dù không lưu được')
    return `"${msg}"`
  })

  await test('N6c Xưởng: bản đang sửa chưa lưu được giữ; Trước trận nhắc "chưa lưu" + Lưu / Bỏ; vào lại Xưởng ⇒ "Chưa lưu"', async (page) => {
    await open(page)
    await page.locator('.hm-tile[data-tile="workshop"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'workshop')
    const ws = page.locator('.ws-bar')
    await ws.waitFor()
    // Sửa: thay bằng Mẫu Auto (như học sinh sửa khối).
    await page.evaluate(() => window.__fanroc.editors.sample(0, 'auto'))
    await page.waitForFunction(() => document.querySelector('.ws-bar .prog')?.textContent === 'Chưa lưu', null, { timeout: 3000 })
    const edited = await page.evaluate(() => JSON.stringify(window.__fanroc.editors.program(0)))
    await page.locator('.sh-act button[aria-label="Màn chính"]').click()
    await page.locator('.hm[data-screen="home"]').waitFor()
    await page.locator('.hm-tile[data-tile="match"]').click()
    const note = page.locator('.hm[data-screen="pick"] [data-role="draft"]')
    await note.waitFor({ timeout: 3000 })
    expect(/chưa lưu/.test(await note.innerText()), 'Trước trận thiếu dòng chưa lưu')
    expect((await page.locator('.pk-card[aria-pressed="true"] .prog').innerText()) === 'Mặc định', 'trận phải chạy bản đã lưu / Mặc định')
    // Về Xưởng ⇒ bản đang sửa còn nguyên, nhãn Chưa lưu.
    await page.locator('.pk-acts button', { hasText: 'Về màn chính' }).click()
    await page.locator('.hm-tile[data-tile="workshop"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'workshop')
    const back = await page.evaluate(() => JSON.stringify(window.__fanroc.editors.program(0)))
    expect(back === edited, 'vào lại Xưởng mà bản đang sửa đã mất')
    expect((await ws.locator('.prog').innerText()) === 'Chưa lưu', `nhãn Xưởng: ${await ws.locator('.prog').innerText()}`)
    await ws.locator('button', { hasText: 'Lưu cho robot của em' }).click()
    const msg = await ws.locator('.ws-msg').innerText()
    expect(msg === 'Đã lưu v1' && (await ws.locator('.prog').innerText()) === 'Của em v1', `lưu: "${msg}"`)
    // Trận vào bằng Mặc định ⇒ bản đã lưu chạy (không phải bản nháp) — sửa tiếp, ra Trước trận: Lưu từ đó ⇒ v2.
    await page.evaluate(() => window.__fanroc.editors.sample(0, 'teleop'))
    await page.waitForFunction(() => document.querySelector('.ws-bar .prog')?.textContent === 'Chưa lưu', null, { timeout: 3000 })
    await page.locator('.sh-act button[aria-label="Màn chính"]').click()
    await page.locator('.hm-tile[data-tile="match"]').click()
    await note.waitFor()
    await note.locator('button', { hasText: 'Lưu' }).click()
    const pmsg = await page.locator('.hm[data-screen="pick"] [data-role="draft-msg"]').innerText()
    const prog2 = await page.locator('.pk-card[aria-pressed="true"] .prog').innerText()
    expect(pmsg === 'Đã lưu v2' && prog2 === 'Của em v2' && (await note.count()) === 0, `Lưu ở Trước trận: "${pmsg}", nhãn "${prog2}"`)
    // Bỏ: sửa lần nữa, Bỏ ⇒ Xưởng mở bản đã lưu v2.
    await page.locator('.pk-acts button', { hasText: 'Về màn chính' }).click()
    await page.locator('.hm-tile[data-tile="workshop"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'workshop')
    await page.evaluate(() => window.__fanroc.editors.sample(0, 'auto'))
    await page.locator('.sh-act button[aria-label="Màn chính"]').click()
    await page.locator('.hm-tile[data-tile="match"]').click()
    await note.locator('button', { hasText: 'Bỏ' }).click()
    expect((await note.count()) === 0, 'Bỏ mà dòng chưa lưu còn')
    await go(page, 'workshop')
    expect((await ws.locator('.prog').innerText()) === 'Của em v2', `sau Bỏ: ${await ws.locator('.prog').innerText()}`)
    return `giữ bản nháp · "${msg}" · Lưu ở Trước trận "${pmsg}" · Bỏ ⇒ Của em v2`
  })

  await test('N6d đổi màn chính ⇄ trận ⇄ Xưởng ×3 không rò bo ảo (Worker)', async (page) => {
    await open(page)
    const w0 = await page.evaluate(() => window.__fanroc.workers())
    const seen = []
    for (let k = 0; k < 3; k++) {
      for (const s of ['match', 'home', 'workshop', 'practice', 'home']) {
        await go(page, s)
        seen.push(await page.evaluate(() => window.__fanroc.workers()))
      }
    }
    // Trận có ghế "chương trình của bạn 1" (bo đồng đội) rồi rời trận ⇒ bo đó phải được dọn.
    await go(page, 'match')
    await seat(page, 2, 'copy-0')
    await closeSettings(page)
    const withCopy = await page.evaluate(() => window.__fanroc.workers())
    await go(page, 'home')
    const w1 = await page.evaluate(() => window.__fanroc.workers())
    expect(seen.every((n) => n === w0) && withCopy === w0 + 1 && w1 === w0, `bo ảo: đầu ${w0}, các màn ${seen.join(' ')}, có đồng đội ${withCopy}, cuối ${w1}`)
    return `bo ảo luôn ${w0} (đồng đội +1 rồi dọn)`
  })

  await test('N11 màn chính có Luật chơi + Robot mẫu; bảng điểm "+15" Rãnh 3; Robot mẫu "Mở trong Xưởng" ⇒ Xưởng nạp đúng robot, giữ bản nháp robot cũ', async (page) => {
    await open(page)
    // Hai mục nhỏ dưới 4 ô; phím mũi tên đi tới được, 4 ô chính không đổi.
    const links = await page.locator('.hm[data-screen="home"] .hm-link').evaluateAll((es) => es.map((e) => `${e.dataset.link}:${e.textContent}`))
    expect(links.length === 2 && /^rules:Luật chơi/.test(links[0]) && /^robots:Robot mẫu/.test(links[1]), `mục nhỏ: ${links.join(' | ')}`)
    const tiles = await page.locator('.hm[data-screen="home"] .hm-tile').count()
    expect(tiles === 4, `màn chính có ${tiles} ô`)
    await page.keyboard.press('ArrowDown')
    const cur = await page.locator('.hm-link[aria-current="true"]').getAttribute('data-link')
    expect(cur === 'rules', `↓ từ Giải đấu ⇒ ${cur}`)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.__fanroc.screen === 'rules')
    const rules = page.locator('.hm[data-screen="rules"]')
    await rules.waitFor()
    const cards = await rules.locator('.rl-card').evaluateAll((es) => es.map((e) => e.dataset.card))
    expect(cards.join() === 'field,match,score,faults,tournament', `thẻ: ${cards.join()}`)
    const r3 = await rules.locator('[data-card="score"] tr', { hasText: 'Rãnh 3' }).locator('td.v').innerText()
    expect(r3 === '+15', `Rãnh 3: "${r3}"`)
    expect((await rules.locator('.rl-card svg').count()) === 5, 'thiếu hình SVG trên thẻ')
    const faults = await rules.locator('[data-card="faults"]').innerText()
    expect(['P12', 'S02', 'P10', 'G15'].every((c) => faults.includes(c)), `thẻ lỗi: ${faults.slice(0, 80)}`)
    await shot(page, 't17-rules.png')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => window.__fanroc.screen === 'home')

    // Xưởng với Mẫu Maker: sửa (nạp mẫu Auto) mà chưa lưu ⇒ bản nháp; rời Xưởng.
    await page.locator('.hm-tile[data-tile="workshop"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'workshop')
    expect((await page.evaluate(() => window.__fanroc.editors.cfg(0).type)) === 'maker', 'Xưởng không mở Mẫu Maker')
    await page.evaluate(() => window.__fanroc.editors.sample(0, 'auto'))
    await page.waitForFunction(() => /Chưa lưu/.test(document.querySelector('.ws-bar .prog')?.textContent ?? ''), null, { timeout: 5000 })
    await go(page, 'home')

    const v0 = await page.evaluate(() => window.__fanroc.viewers())
    await page.locator('.hm-link[data-link="robots"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'robots')
    const gal = page.locator('.hm[data-screen="robots"]')
    await gal.locator('.rg-3d canvas').waitFor({ timeout: 15000 })
    await gal.locator('.rg-ws .blocklyBlockCanvas .blocklyBlock').first().waitFor({ timeout: 15000 })
    await gal.locator('.rg-pick [data-robot="co"]').click()
    const info = await gal.locator('[data-role="info"]').innerText()
    expect(/Xe Cắm Cờ/.test(info) && /185 × 280 × 250 mm/.test(info) && /Vươn tay cờ/.test(info), `thông tin: ${info.slice(0, 120)}`)
    const ports = await gal.locator('[data-role="ports"] td:first-child').allInnerTexts()
    expect(ports.join() === 'M1,M2,M4,S1,S2,S3', `cổng Xe Cắm Cờ: ${ports.join()}`)
    // Vùng khối chỉ xem: kéo khối không được, không có hộp công cụ.
    const ro = await page.evaluate(() => document.querySelectorAll('.rg-ws .blocklyToolboxDiv, .rg-ws .blocklyFlyout').length === 0)
    expect(ro, 'vùng khối Robot mẫu có hộp công cụ')
    await page.waitForTimeout(500) // xoay một chút cho ảnh chụp
    await shot(page, 't17-robots.png')
    const v1 = await page.evaluate(() => window.__fanroc.viewers())
    await gal.locator('[data-role="open-workshop"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'workshop')
    const cfg = await page.evaluate(() => window.__fanroc.editors.cfg(0))
    const v2 = await page.evaluate(() => window.__fanroc.viewers())
    expect(cfg.type === 'co' && cfg.drive === 'diff2', `Xưởng mở robot ${JSON.stringify(cfg)}`)
    expect(v1 === v0 + 1 && v2 === v0 && (await page.locator('.rg-3d canvas').count()) === 0, `canvas 3D: trước ${v0}, đang xem ${v1}, sau ${v2}`)
    const lbl = await page.locator('.ws-bar .prog').innerText()
    expect(lbl === 'Mặc định', `Xưởng Xe Cắm Cờ nhãn "${lbl}"`)
    const prog = await page.evaluate(() => JSON.stringify(window.__fanroc.editors.program(0)))
    expect(/thingBotC3_initPS2/.test(prog), 'Xưởng Xe Cắm Cờ không nạp TeleOp mẫu')
    // Quay lại Mẫu Maker ⇒ bản nháp chưa lưu vẫn còn.
    await page.evaluate(() => window.__fanroc.editors.setConfig(0, { type: 'maker', drive: 'diff2', actuator: 'tt' }))
    await page.waitForFunction(() => /Chưa lưu/.test(document.querySelector('.ws-bar .prog')?.textContent ?? ''), null, { timeout: 5000 })
    return `mục nhỏ ${links.map((l) => l.split(':')[0]).join(' · ')} · Rãnh 3 ${r3} · Xưởng ${cfg.type} "${lbl}" · canvas ${v0}→${v1}→${v2} · bản nháp Mẫu Maker còn`
  })

  await test('N2c màn kết quả: báo nổi / đếm ngược bị xoá; "Về màn chính" ⇒ màn chính', async (page) => {
    await open(page)
    await go(page, 'match')
    await seat(page, 0, 'agent-medium')
    await closeSettings(page)
    await skipRelease(page)
    // Tua tới sát hết giờ; chữ nổi giả còn đang hiện lúc hết giờ phải biến mất.
    await page.evaluate(() => {
      const pops = document.querySelector('.sb-pops')
      pops.append(Object.assign(document.createElement('div'), { className: 'sb-pop', textContent: '+5 · Chữa Cháy' }))
      window.__fanroc.match.t = 179.9
    })
    await page.locator('.sb-result:not([hidden])').waitFor({ timeout: 10000 })
    const left = await page.locator('.sb-pop').count()
    const count = await page.locator('.sb-count').innerText()
    expect(left === 0 && count === '', `màn kết quả còn ${left} chữ nổi, đếm ngược "${count}"`)
    expect((await page.locator('.sb').getAttribute('role')) === null, 'bảng điểm còn role="status"')
    await page.locator('.sb-result button', { hasText: 'Về màn chính' }).click()
    await page.locator('.hm[data-screen="home"]').waitFor({ timeout: 10000 })
    expect((await page.evaluate(() => window.__fanroc.screen)) === 'home', 'không về màn chính')
    expect(await page.locator('.sb-result').isHidden(), 'màn kết quả còn hiện ở màn chính')
    return 'xoá chữ nổi + đếm ngược · Về màn chính'
  })
}

// ---------- Phép thử giải đấu (Task 15) ----------
const MAKER = { type: 'maker', drive: 'diff2', actuator: 'tt' }
const TOUR_KEY = 'fanroc.v1.fanroc-2026.tournament'
/** Seed bốc thăm đầu tiên thoả `ok` (lịch chỉ phụ thuộc seed + số bạn). */
const findSeed = (players, ok) => {
  for (let seed = 1; seed < 5000; seed++) if (ok(newTournament({ names: ['Bạn 1', 'Bạn 2'], cfgs: [MAKER, MAKER], players, perTeam: 4, seed }))) return seed
  throw new Error('không tìm được seed')
}
const tourView = (page) => page.evaluate(() => window.__fanroc.tour.view)
const recordedN = (page) =>
  page.evaluate(() => {
    const t = window.__fanroc.store.tournament()
    return t && t !== 'corrupt' ? t.results.filter((r) => r !== null).length : -1
  })
const tn = (page) => page.locator('.hm[data-screen="tournament"]:not([hidden])')
/** Tua trận đang chơi tới hết giờ: chạy thật vật lý 4 s mỗi lần (như ×40) bằng phiên đang chạy — giao diện vẫn khoá ×1 (R24). */
async function fastForward(page) {
  for (let k = 0; k < 120; k++) {
    const phase = await page.evaluate(() => {
      const g = window.__fanroc.session
      g.advance(4, 1, { steps: 240 })
      return g.match.phase
    })
    if (phase === 'end') return
  }
  throw new Error('tua 480 s mà trận chưa hết giờ')
}
/** Ở Pit chờ các trận máy chạy ngầm xong, nút Vào trận bấm được. */
async function waitPlayable(page) {
  await page.waitForFunction(() => window.__fanroc.tour.view === 'pit' && !document.querySelector('.hm[data-screen="tournament"] button[data-role="play"]')?.disabled, null, { timeout: 180000 })
}

async function tournamentTests() {
  await test('N9 giải 1 bạn, 4 trận/đội: trận máy tự ghi; trận của em (Mặc định) tua tới hết ⇒ ghi, Pit 8 dòng; tải lại giữa trận kế ⇒ "Đấu tiếp", số trận đã ghi không đổi, trận dở đấu lại', async (page) => {
    // Trận 1 toàn máy: thấy trận máy tự ghi trước trận của em.
    const seed = findSeed(1, (t) => playersIn(t, 0).length === 0)
    await open(page)
    await page.evaluate((s) => window.__fanroc.setTournamentSeed(s), seed)
    await page.locator('.hm-tile[data-tile="tournament"]').click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'register')
    const machines = await tn(page).locator('[data-role="machines"] span').count()
    const per = await tn(page).locator('select[data-role="per-team"]').inputValue()
    const prog = await tn(page).locator('[data-role="program"]').allInnerTexts()
    expect(machines === 7 && per === '4' && prog.length === 1 && prog[0] === 'Mặc định', `ghi danh: ${machines} đội máy, ${per} trận, chương trình ${prog.join('/')}`)
    await shot(page, 't15-register.png')
    await tn(page).locator('button', { hasText: 'Bốc thăm lịch đấu' }).click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'schedule')
    const rows = await tn(page).locator('[data-role="schedule"] > div').count()
    const mine = await tn(page).locator('[data-role="schedule"] > div[data-mine="true"]').count()
    expect(rows === 8 && mine === 4, `lịch ${rows} trận, ${mine} trận có em`)
    expect((await recordedN(page)) === 0, 'bốc thăm xong đã có trận ghi')
    await tn(page).locator('button', { hasText: 'Vào Pit' }).click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'pit')
    const busySeen = await page.evaluate(() => window.__fanroc.tour.busy())
    await waitPlayable(page)
    const afterMachines = await recordedN(page)
    expect(afterMachines >= 1, `trận máy chưa tự ghi (${afterMachines})`)
    // Trận của em: Mặc định, ghế người lái chương trình, 3 đội máy.
    await tn(page).locator('button[data-role="play"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'tmatch' && window.__fanroc.editors.state(0) === 'loaded', null, { timeout: 30000 })
    const me = await page.evaluate(() => window.__fanroc.tour.seat(0))
    const kinds = await page.evaluate(() => [0, 1, 2, 3].map((i) => window.__fanroc.session.driver(i).kind))
    expect(me >= 0 && kinds[me] === 'program' && kinds.filter((k) => k === 'agent').length === 3, `ghế em ${me}, người lái ${kinds.join(',')}`)
    const sb = await page.locator('.sb').innerText()
    expect(/Mặc định/.test(sb) && /Máy (Dễ|Vừa|Khó)/.test(sb), `bảng điểm: ${sb.replace(/\n/g, ' ').slice(0, 120)}`)
    await skipRelease(page)
    await page.waitForFunction(() => window.__fanroc.editors.state(0) === 'running', null, { timeout: 15000 })
    const locked = await page.evaluate(() => window.__fanroc.setSpeed(40))
    expect(locked === 1, `chương trình đang chạy mà tốc độ ×${locked} (R24)`)
    const before = await recordedN(page)
    await fastForward(page)
    await page.locator('.sb-result:not([hidden])').waitFor({ timeout: 15000 })
    const acts = await page.locator('.sb-result .sb-acts button').allInnerTexts()
    expect(acts.includes('Trận kế tiếp') && !acts.includes('Chơi lại'), `nút kết quả: ${acts.join(', ')}`)
    const after = await recordedN(page)
    expect(after === before + 1, `ghi ${before} ⇒ ${after} trận`)
    await page.locator('.sb-result button', { hasText: 'Trận kế tiếp' }).click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'pit')
    const standing = await tn(page).locator('[data-role="standings"] tr[data-id]').count()
    const myScores = await tn(page).locator('[data-role="standings"] tr[data-id="p0"] td').nth(2).innerText()
    expect(standing === 8 && myScores !== '—', `Pit ${standing} dòng xếp hạng, điểm các trận của em "${myScores}"`)
    // Cột Phạt; "bốc thăm" một lần mỗi nhóm hoà (tổng, trận cao nhất, phạt bằng nhau, có điểm).
    const tie = await page.evaluate(() => {
      const t = document.querySelector('.hm[data-screen="tournament"] [data-role="standings"]')
      const head = [...t.querySelectorAll('th')].map((x) => x.textContent)
      const rows = [...t.querySelectorAll('tr[data-id]')].map((tr) => [...tr.querySelectorAll('td')].slice(3).map((x) => x.textContent).join('|'))
      const groups = new Map()
      for (const r of rows) groups.set(r, (groups.get(r) ?? 0) + 1)
      const want = [...groups.entries()].filter(([k, n]) => n > 1 && !k.startsWith('0|')).length
      return { head, want, tags: t.querySelectorAll('[data-role="tie"]').length }
    })
    expect(tie.head.includes('Phạt') && tie.tags === tie.want, `cột ${tie.head.join(', ')} · nhãn bốc thăm ${tie.tags}, nhóm hoà ${tie.want}`)
    await shot(page, 't15-pit.png')
    // Trận kế của em: chơi dở 20 s rồi tải lại trang.
    await waitPlayable(page)
    const nBefore = await recordedN(page)
    const nextIdx = await page.evaluate(() => window.__fanroc.store.tournament().results.indexOf(null))
    await tn(page).locator('button[data-role="play"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'tmatch', null, { timeout: 30000 })
    await skipRelease(page)
    await page.evaluate(() => window.__fanroc.session.advance(20, 1, { steps: 1200 }))
    const midT = await page.evaluate(() => window.__fanroc.match.t)
    await page.reload()
    await page.waitForFunction(() => window.__fanroc?.editors && window.__fanroc.screen === 'home', null, { timeout: 60000 })
    const tile = await page.locator('.hm-tile[data-tile="tournament"]').innerText()
    const nAfter = await recordedN(page)
    expect(/Đấu tiếp · trận \d\/4/.test(tile) && nAfter === nBefore, `ô Giải đấu "${tile.replace(/\n/g, ' ')}", đã ghi ${nBefore} ⇒ ${nAfter}`)
    await page.locator('.hm-tile[data-tile="tournament"]').click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'pit')
    await waitPlayable(page)
    await tn(page).locator('button[data-role="play"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'tmatch', null, { timeout: 30000 })
    const again = await page.evaluate(() => ({ i: window.__fanroc.tour.index, t: window.__fanroc.match.t }))
    expect(again.i === nextIdx && again.t < -9 && (await recordedN(page)) === nBefore, `đấu lại trận ${again.i} (cần ${nextIdx}) từ t = ${again.t.toFixed(1)} s`)
    return `seed ${seed} · máy tự ghi ${afterMachines} trận${busySeen ? ' ("Đang chơi các trận máy…")' : ''} · trận em ghi ${before}⇒${after} · Pit ${standing} dòng · tải lại ở t = ${midT.toFixed(0)} s ⇒ "${tile.match(/Đấu tiếp[^\n]*/)?.[0]}", vẫn ${nAfter} trận, đấu lại trận ${again.i + 1} từ đầu`
  })

  await test('N10 hai bạn chia đôi bàn phím: thử phím đúng robot; trong trận giữ W chỉ robot bạn 1 chạy, giữ ↑ chỉ robot bạn 2', async (page) => {
    const seed = findSeed(2, (t) => playersIn(t, 0).length === 2)
    await open(page)
    await page.evaluate((s) => window.__fanroc.setTournamentSeed(s), seed)
    await page.locator('.hm-tile[data-tile="tournament"]').click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'register')
    await tn(page).locator('.pk-seg button[data-value="2"]').click()
    await page.waitForFunction(() => window.__fanroc.keypads().length === 2 && document.querySelectorAll('.hm[data-screen="tournament"] .tn-players .tn-box').length === 2)
    const machines = await tn(page).locator('[data-role="machines"] span').count()
    expect(machines === 6, `2 bạn mà ${machines} đội máy`)
    await tn(page).locator('button', { hasText: 'Thử phím' }).click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'keytest')
    const note = await tn(page).innerText()
    expect(/Một số bàn phím không nhận nhiều phím bấm cùng lúc/.test(note), 'thiếu ghi chú bàn phím')
    const lit = () => page.evaluate(() => [...document.querySelectorAll('.tn-mini')].map((m) => m.dataset.lit))
    await page.locator('#stage canvas').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {})
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(200)
    const w = await lit()
    await page.keyboard.up('KeyW')
    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(200)
    const up = await lit()
    await page.keyboard.up('ArrowUp')
    expect(w.join() === 'true,false' && up.join() === 'false,true', `thử phím: W ⇒ ${w}, ↑ ⇒ ${up}`)
    await tn(page).locator('button', { hasText: 'Bốc thăm lịch đấu' }).click()
    await tn(page).locator('button', { hasText: 'Vào Pit' }).click()
    await waitPlayable(page)
    await tn(page).locator('button[data-role="play"]').click()
    await page.waitForFunction(() => window.__fanroc.screen === 'tmatch', null, { timeout: 30000 })
    const s = await page.evaluate(() => [window.__fanroc.tour.seat(0), window.__fanroc.tour.seat(1)])
    expect(s[0] >= 0 && s[1] >= 0, `ghế hai bạn ${s}`)
    await skipRelease(page)
    await page.waitForFunction(() => window.__fanroc.editors.state(0) === 'running' && window.__fanroc.editors.state(1) === 'running', null, { timeout: 15000 })
    await page.waitForTimeout(300)
    await page.locator('#stage canvas').click({ position: { x: 5, y: 5 } })
    const hold = async (key) => {
      const a = [await pose(page, s[0]), await pose(page, s[1])]
      await page.keyboard.down(key)
      await page.waitForTimeout(1500)
      await page.keyboard.up(key)
      const b = [await pose(page, s[0]), await pose(page, s[1])]
      await page.waitForTimeout(600)
      return [dist(a[0], b[0]), dist(a[1], b[1])]
    }
    const kw = await hold('KeyW')
    const ku = await hold('ArrowUp')
    expect(kw[0] > 0.15 && kw[1] < 0.05, `giữ W: bạn 1 đi ${kw[0].toFixed(3)} m, bạn 2 đi ${kw[1].toFixed(3)} m`)
    expect(ku[1] > 0.15 && ku[0] < 0.05, `giữ ↑: bạn 1 đi ${ku[0].toFixed(3)} m, bạn 2 đi ${ku[1].toFixed(3)} m`)
    // ⚙ › Hai bạn chơi bị khoá trong giải: bấm "Một bạn" không đổi bố cục, W vẫn chỉ lái robot bạn 1.
    await settings(page)
    const lockRow = page.locator('.st-pop [data-role="layout2p"]')
    const lockText = await lockRow.innerText()
    await lockRow.locator('button', { hasText: 'Một bạn' }).click({ force: true })
    await page.evaluate(() => document.querySelector('.st-pop [data-role="layout2p"] button')?.onclick?.())
    await page.waitForTimeout(300)
    const pads = await page.evaluate(() => window.__fanroc.keypads().length)
    const still2p = await page.evaluate(() => window.__fanroc.store.settings().layout2p)
    await closeSettings(page)
    await page.locator('#stage canvas').click({ position: { x: 5, y: 5 } })
    // Robot bạn 1 đã chạy tới có thể chạm vật cản: đặt lại hai robot vào làn trống sát rào bên.
    await page.evaluate(([s, lane]) => s.forEach((seat, k) => window.__fanroc.robots[seat].setPose(lane[k])), [s, LANE])
    await page.waitForTimeout(300)
    const kw2 = await hold('KeyW')
    expect(/Giải đấu: số bạn đã chọn lúc ghi danh/.test(lockText) && pads === 2 && still2p, `⚙ khoá: "${lockText.replace(/\n/g, ' ')}", tay ảo ${pads}, layout2p ${still2p}`)
    expect(kw2[0] > 0.15 && kw2[1] < 0.05, `sau khi thử đổi ⚙, giữ W: bạn 1 ${kw2[0].toFixed(3)} m, bạn 2 ${kw2[1].toFixed(3)} m`)
    return `seed ${seed} · thử phím W ⇒ ${w}, ↑ ⇒ ${up} · W: ${kw.map((d) => d.toFixed(2)).join(' / ')} m · ↑: ${ku.map((d) => d.toFixed(2)).join(' / ')} m · ⚙ khoá, W sau đó ${kw2.map((d) => d.toFixed(2)).join(' / ')} m`
  })

  await test('N9b giải đã xong (nạp sẵn) ⇒ ô "Giải đã xong", bục trao giải hạng 1–3 + bảng 8 dòng; Giải mới ⇒ ghi danh, xoá giải', async (page) => {
    let t = newTournament({ names: ['Tuấn', 'Bạn 2'], cfgs: [MAKER, MAKER], players: 1, perTeam: 4, seed: 7 })
    t.schedule.forEach((slot, i) => {
      const ids = seatIds(slot)
      const score = 100 + ((i * 37) % 90)
      t = record(t, i, played(ids, ids.map((id) => ({ score: id === 'p0' ? score + 40 : score, penalty: 0 })), score))
    })
    await open(page)
    await page.evaluate((v) => window.__fanroc.store.saveTournament(v), t)
    await page.reload()
    await page.waitForFunction(() => window.__fanroc?.editors && window.__fanroc.screen === 'home', null, { timeout: 60000 })
    const tile = await page.locator('.hm-tile[data-tile="tournament"]').innerText()
    expect(/Giải đã xong/.test(tile), `ô Giải đấu: ${tile}`)
    await page.locator('.hm-tile[data-tile="tournament"]').click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'podium')
    const steps = await tn(page).locator('[data-role="podium"] .tn-step').evaluateAll((es) => es.map((e) => `${e.dataset.rank}:${e.querySelector('span').textContent}`))
    const rows = await tn(page).locator('[data-role="standings"] tr[data-id]').count()
    expect(steps.length === 3 && steps.includes('1:Tuấn') && rows === 8, `bục ${steps.join(' ')}, bảng ${rows} dòng`)
    await shot(page, 't15-podium.png')
    await tn(page).locator('button', { hasText: 'Giải mới' }).click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'register')
    const gone = await page.evaluate(() => window.__fanroc.store.tournament())
    expect(gone === null, 'Giải mới mà giải cũ còn lưu')
    return `bục ${steps.join(' · ')} · bảng ${rows} dòng · Giải mới ⇒ ghi danh`
  })

  await test('N9d Pit: Xem nhanh trận máy ×40 (không ghi thêm) ⇒ Về Pit; Vào Xưởng (robot giữ nguyên) ⇒ Lưu ⇒ tự về Pit, nhãn "Của em v1"', async (page) => {
    const seed = findSeed(1, (t) => playersIn(t, 0).length === 0)
    let t = newTournament({ names: ['Bạn 1', 'Bạn 2'], cfgs: [MAKER, MAKER], players: 1, perTeam: 4, seed })
    const ids = seatIds(t.schedule[0])
    t = record(t, 0, played(ids, ids.map(() => ({ score: 222, penalty: 0 })), 222))
    await open(page)
    await page.evaluate((v) => window.__fanroc.store.saveTournament(v), t)
    await page.reload()
    await page.waitForFunction(() => window.__fanroc?.editors && window.__fanroc.screen === 'home', null, { timeout: 60000 })
    await page.locator('.hm-tile[data-tile="tournament"]').click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'pit')
    await tn(page).locator('[data-role="machine-results"] button', { hasText: 'Xem nhanh' }).click()
    await page.waitForFunction(() => window.__fanroc.screen === 'treplay', null, { timeout: 30000 })
    const kinds = await page.evaluate(() => [0, 1, 2, 3].map((i) => window.__fanroc.session.driver(i).kind))
    const sp = await page.evaluate(() => window.__fanroc.setSpeed(40))
    const t0 = await page.evaluate(() => window.__fanroc.match.t)
    await page.waitForTimeout(1000)
    const t1 = await page.evaluate(() => window.__fanroc.match.t)
    expect(kinds.every((k) => k === 'agent') && sp === 40 && t1 - t0 > 4, `Xem nhanh: người lái ${kinds}, tốc độ ×${sp}, 1 s thật = ${(t1 - t0).toFixed(1)} s trận`)
    await fastForward(page)
    await page.locator('.sb-result:not([hidden])').waitFor({ timeout: 15000 })
    await page.locator('.sb-result button', { hasText: 'Về Pit' }).click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'pit')
    expect((await recordedN(page)) === 1, `Xem nhanh mà số trận đã ghi thành ${await recordedN(page)}`)
    // Xưởng từ Pit: không có ô đổi robot; Lưu ⇒ tự về Pit, bảng xếp hạng ghi "Của em v1".
    await tn(page).locator('button', { hasText: 'Vào Xưởng sửa chương trình' }).click()
    await page.waitForFunction(() => window.__fanroc.screen === 'workshop', null, { timeout: 30000 })
    const fixed = await page.locator('[data-role="workshop"] [data-role="tour-note"]').isVisible()
    const cfgSel = await page.locator('[data-role="workshop"] .fe-cfg').count()
    expect(fixed && cfgSel === 0, `Xưởng từ Pit: ghi chú ${fixed}, ô đổi robot ${cfgSel}`)
    await page.locator('[data-role="workshop"] button', { hasText: 'Lưu cho robot của em' }).click()
    await page.waitForFunction(() => window.__fanroc.screen === 'tournament' && window.__fanroc.tour.view === 'pit', null, { timeout: 30000 })
    const note = await tn(page).locator('.tn-note[data-ok="true"]').innerText()
    const me = await tn(page).locator('[data-role="standings"] tr[data-id="p0"]').innerText()
    expect(/Đã lưu v1/.test(note) && /Của em v1/.test(me), `Pit sau khi lưu: "${note}" · "${me.replace(/\s+/g, ' ')}"`)
    return `Xem nhanh ×${sp} (${(t1 - t0).toFixed(1)} s trận / 1 s) ⇒ Về Pit, vẫn 1 trận · Xưởng ⇒ "${note}"`
  })

  await test('N9e tải lại giữa loạt trận máy ⇒ không trùng, không mất kết quả; xác nhận Bỏ giải giữ qua lần vẽ lại', async (page) => {
    // Em đấu trận 1; trận 2, 3 toàn máy (một loạt hai trận), trận 4 của em.
    const seed = findSeed(1, (t) => playersIn(t, 0).length === 1 && !playersIn(t, 1).length && !playersIn(t, 2).length)
    let t = newTournament({ names: ['Bạn 1', 'Bạn 2'], cfgs: [MAKER, MAKER], players: 1, perTeam: 4, seed })
    const ids = seatIds(t.schedule[0])
    t = record(t, 0, played(ids, ids.map(() => ({ score: 150, penalty: 0 })), 150))
    await open(page)
    await page.evaluate((v) => window.__fanroc.store.saveTournament(v), t)
    await page.reload()
    await page.waitForFunction(() => window.__fanroc?.editors && window.__fanroc.screen === 'home', null, { timeout: 60000 })
    await page.locator('.hm-tile[data-tile="tournament"]').click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'pit' && window.__fanroc.tour.busy())
    // Bấm Bỏ giải một lần (hỏi lại) rồi chờ trận máy đầu ghi: Pit vẽ lại vẫn giữ lời hỏi lại.
    await tn(page).locator('button[data-role="drop"]').click()
    await page.waitForFunction(() => window.__fanroc.store.tournament().results[1] !== null, null, { timeout: 120000 })
    const dropText = await tn(page).locator('button[data-role="drop"]').innerText()
    const focused = await page.evaluate(() => document.activeElement?.dataset?.key ?? null)
    expect(dropText === 'Bấm lần nữa để bỏ giải này' && focused === 'drop', `sau khi trận máy ghi: nút "${dropText}", tiêu điểm ${focused}`)
    const snap = await page.evaluate(() => {
      const r = window.__fanroc.store.tournament().results
      const n = r.filter((x) => x !== null).length
      location.reload()
      return { n, r1: JSON.stringify(r[1]) }
    })
    await page.waitForFunction(() => window.__fanroc?.editors && window.__fanroc.screen === 'home', null, { timeout: 60000 })
    const back = await page.evaluate(() => window.__fanroc.store.tournament().results.map((x) => x !== null))
    const nBack = back.filter(Boolean).length
    expect(nBack >= snap.n && nBack <= snap.n + 1 && back.indexOf(false) === nBack, `sau khi tải lại: ${back.map(Number).join('')} (trước ${snap.n})`)
    await page.locator('.hm-tile[data-tile="tournament"]').click()
    await waitPlayable(page)
    const end = await page.evaluate(() => window.__fanroc.store.tournament().results)
    const endN = end.filter((x) => x !== null).length
    expect(endN === 3 && end[3] === null && JSON.stringify(end[1]) === snap.r1, `xong loạt: ${end.map((x) => Number(x !== null)).join('')}, trận 2 ${JSON.stringify(end[1]) === snap.r1 ? 'giữ nguyên' : 'bị chơi lại'}`)
    return `seed ${seed} · Bỏ giải hỏi lại giữ qua lần vẽ lại · tải lại khi đã ghi ${snap.n} ⇒ ${nBack} ⇒ xong loạt ${endN} trận, không trùng`
  })

  await test('N9c giải lưu hỏng ⇒ "Không đọc được giải đang dở" + Giải mới; bộ nhớ đầy ⇒ Pit báo không lưu được; điện thoại không cuộn ngang', async (page) => {
    await open(page)
    await page.evaluate((k) => localStorage.setItem(k, '{"version":1,"seed":1,"perTeam":4,"entrants":[],"schedule":[],"results":[]}'), TOUR_KEY)
    await page.reload()
    await page.waitForFunction(() => window.__fanroc?.editors && window.__fanroc.screen === 'home', null, { timeout: 60000 })
    const tile = await page.locator('.hm-tile[data-tile="tournament"]').innerText()
    expect(/Không đọc được giải đang dở/.test(tile), `ô Giải đấu: ${tile}`)
    await page.locator('.hm-tile[data-tile="tournament"]').click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'corrupt')
    await tn(page).locator('button', { hasText: 'Giải mới' }).click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'register')
    const wide = async () => page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
    const w1 = await wide()
    // Bộ nhớ đầy khi lưu giải: Pit phải báo, không im lặng.
    await page.evaluate((k) => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, v) {
        if (key === k) throw new DOMException('đầy', 'QuotaExceededError')
        return set.call(this, key, v)
      }
    }, TOUR_KEY)
    await tn(page).locator('button', { hasText: 'Bốc thăm lịch đấu' }).click()
    await tn(page).locator('button', { hasText: 'Vào Pit' }).click()
    await page.waitForFunction(() => window.__fanroc.tour.view === 'pit')
    const warn = await tn(page).locator('.tn-note[data-ok="false"]').allInnerTexts()
    const w2 = await wide()
    expect(warn.some((x) => x === 'Không lưu được giải — tải lại trang sẽ mất tiến độ'), `Pit không báo lỗi lưu: ${warn.join(' | ')}`)
    expect(w1 <= 0 && w2 <= 0, `cuộn ngang ở 390 px: ghi danh ${w1} px, Pit ${w2} px`)
    return `hỏng ⇒ Giải mới · đầy ⇒ "${warn[0]}" · không cuộn ngang`
  }, { width: 390, height: 844 })
}

// ---------- Phép thử giao diện mới (Task 11+) ----------
async function shellTests() {
  await test('N1 vỏ kiểu VS Code: tiêu đề, bấm Khối mở/đóng khung bên, panel đáy thu gọn, nút không emoji', async (page) => {
    await open(page)
    const noEmoji = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .map((b) => `${b.textContent} ${b.getAttribute('aria-label') ?? ''} ${b.title}`)
          .filter((t) => /\p{Extended_Pictographic}/u.test(t)),
      )
    const badHome = await noEmoji()
    expect(!badHome.length, `nút màn chính có emoji: ${badHome.slice(0, 3).join(' | ')}`)
    await go(page, 'match')
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
    await settings(page)
    const bad = await noEmoji()
    expect(!bad.length, `nút có emoji: ${bad.slice(0, 3).join(' | ')}`)
    return `"${title}" · sân ${Math.round(wOpen)} → ${Math.round(w)} / ${a} px · panel ${ph} px`
  })

  await test('N1b thanh chạy: Chạy rồi Tạm dừng ⇒ khối sắp chạy sáng viền, thanh trạng thái "Đang chạy khối", mã Arduino hiện', async (page) => {
    await open(page)
    await go(page, 'practice')
    await page.evaluate(() => window.__fanroc.editors.sample(0, 'auto'))
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
    await twoPlayers(page)
    await go(page, 'practice')
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
    // Ghế 2 cho máy lái (bạn 2 không lái nữa ⇒ chương trình bạn 2 dừng); đổi sang thẻ bạn 2 ⇒ số chưa xem của bạn 1 không mang sang.
    await seat(page, 1, 'agent-medium')
    await closeSettings(page)
    await (await tab(page, 1)).click()
    await page.waitForTimeout(100)
    const b4 = await badge()
    expect(b4 === '', `đổi thẻ mà số đỏ còn "${b4}"`)
    // Tạm dừng ở thẻ bạn 2 (không chạy): Dừng khoá; Chạy chỉ chạy tiếp, Robot 2 vẫn do máy lái.
    await runBtn(page, 'Tạm dừng').click()
    await page.waitForTimeout(100)
    const stopOff = await runBtn(page, 'Dừng').isDisabled()
    await runBtn(page, 'Chạy').click()
    await page.waitForTimeout(200)
    const r2 = await page.evaluate(() => ({ paused: window.__fanroc.session.paused, kind: window.__fanroc.session.driver(1).kind, st: window.__fanroc.editors.state(1) }))
    expect(stopOff, 'thẻ bạn 2 không chạy mà Dừng vẫn bấm được khi phiên tạm dừng')
    expect(!r2.paused && r2.kind === 'agent' && (r2.st === 'idle' || r2.st === 'stopped'), `tạm dừng + Chạy: ${JSON.stringify(r2)}`)
    // Không ghế nào do chương trình lái ⇒ Chạy từng khối khoá.
    await seat(page, 0, 'agent-medium')
    await closeSettings(page)
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
    await go(page, 'match')
    await seat(page, 0, 'agent-medium')
    await closeSettings(page)
    await runBtn(page, 'Về chỗ cũ').click()
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
    expect((await page.locator('.sb-pop').count()) === 0, 'màn kết quả còn chữ báo điểm nổi')
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
    await go(page, 'match')
    await quietOthers(page)
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
