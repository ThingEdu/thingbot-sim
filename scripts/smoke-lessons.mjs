/**
 * Chạy thử từng bài trên trình duyệt không giao diện: mở bài, nạp lời giải mẫu (hoặc chương trình sai cố
 * ý), bấm Chạy, làm thao tác của trẻ (kéo vật cản, giữ nút tay cầm…), rồi in bước nào đã ✓ và gợi ý gì.
 *
 *   npm run dev            # cổng 5190
 *   node scripts/smoke-lessons.mjs [bai-4 bai-6 …]          # lời giải mẫu: bước đang mở phải ✓
 *   node scripts/smoke-lessons.mjs --starter [bai-4 …]       # khung trống: không bước nào được ✓
 *
 * Playwright lấy từ checkout ThingBlock (biến THINGBLOCK_EDITOR, mặc định ../thingblock-editor-sim).
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(import.meta.dirname, '../../thingblock-editor-sim'))
const { chromium } = createRequire(resolve(THINGBLOCK, 'package.json'))('playwright')
const URL = process.env.SIM_URL ?? 'http://localhost:5190/'

const flow = (page) => page.$$eval('#flow li', (ls) => ls.map((l) => l.innerText.replace(/\n/g, ' ')).join(' / '))
const state = (page) =>
  page.evaluate(() => ({
    step: document.querySelector('#step-title').textContent,
    status: document.querySelector('#step-status').hidden ? '' : document.querySelector('#step-status').textContent,
    hint: document.querySelector('#hint').hidden ? '' : document.querySelector('#hint').textContent,
    dots: [...document.querySelectorAll('#dots span')].map((s) => (s.className.includes('ok') ? '✓' : '·')).join(''),
    run: document.querySelector('#status').textContent,
  }))
const hold = async (page, button, ms) => {
  await page.locator(`[data-pad="${button}"]`).hover()
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}
const slide = (page, cm) =>
  page.$eval('#sonar', (s, v) => {
    s.value = String(v)
    s.dispatchEvent(new Event('input'))
  }, cm)

/** [bài, bước mở sẵn (0 = đầu), kịch bản] — kịch bản trả về các dòng để in. */
const CASES = {
  'bai-2': [1, async (p) => [await p.waitForTimeout(6000), await flow(p)]],
  'bai-3': [
    2,
    async (p) => {
      await p.waitForTimeout(800)
      await p.locator('#hold').hover()
      await p.mouse.down()
      await p.waitForTimeout(1000)
      const held = `giữ SW: ${(await state(p)).status} | ${await flow(p)}`
      await p.mouse.up()
      return [held]
    },
  ],
  'bai-4': [2, async (p) => [await p.waitForTimeout(3000), await flow(p)]],
  'bai-5': [3, async (p) => [await p.waitForTimeout(7000), await flow(p)]],
  'bai-6': [
    1,
    async (p) => {
      await slide(p, 10)
      await p.waitForTimeout(1500)
      const near = `gần: ${(await state(p)).status} | ${await flow(p)}`
      await p.click('#next')
      await slide(p, 60)
      await p.waitForTimeout(1500)
      return [near, `xa: ${(await state(p)).status} | ${await flow(p)}`]
    },
  ],
  'bai-7': [2, async (p) => [await p.waitForTimeout(6500), await flow(p)]],
  'bai-8': [1, async (p) => [await p.waitForTimeout(4500), await flow(p)]],
  'bai-9': [
    1,
    async (p) => {
      await p.waitForTimeout(800)
      await hold(p, 'PSB_PAD_UP', 1500)
      const up = `▲: ${(await state(p)).status}`
      await p.waitForTimeout(600)
      const rel = `nhả: ${await flow(p)}`
      await p.click('#next')
      await hold(p, 'PSB_PAD_DOWN', 1500)
      return [up, rel, `▼: ${(await state(p)).status}`]
    },
  ],
  'bai-10': [1, async (p) => [await p.waitForTimeout(15000), await flow(p)]],
}

const browser = await chromium.launch()
const starter = process.argv.includes('--starter')
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
let bad = 0
for (const [id, [card, script]] of Object.entries(CASES)) {
  if (only.length && !only.includes(id)) continue
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.addInitScript(
    ([id, card]) => localStorage.setItem('thingbot-sim:v1', JSON.stringify({ done: [], current: id, power: true, lessons: { [id]: { card } } })),
    [id, card],
  )
  await page.goto(URL)
  await page.waitForTimeout(1200)
  if (!starter) await page.click('#example')
  await page.click('#run')
  const lines = (await script(page)).filter((l) => typeof l === 'string')
  const s = await state(page)
  console.log(`\n== ${id} · ${s.step} · ${s.dots}  ${s.status}  [${s.run}]`)
  for (const l of lines) console.log('   ', l)
  if (s.hint) console.log('    gợi ý:', s.hint)
  if (errors.length) console.log('    LỖI:', errors.slice(0, 3).join(' | '))
  const ok = (starter ? !s.dots.includes('✓') : s.status.startsWith('✓')) && !errors.length
  if (!ok) bad++
  console.log(ok ? '    ĐẠT' : '    KHÔNG ĐẠT')
  await page.close()
}
await browser.close()
process.exit(bad ? 1 : 0)
