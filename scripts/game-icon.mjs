/**
 * Biểu tượng tạm của gói desktop ThingBot FanRoc Game: hình `robot` trong bộ biểu tượng của game (src/fanroc/ui/icons.ts)
 * trên nền vuông bo góc, vẽ bằng Chromium (Playwright lấy từ checkout ThingBlock như fanroc-e2e.mjs) ra PNG 1024 × 1024,
 * rồi `tauri icon` sinh bộ biểu tượng vào src-tauri/icons/. Không dùng ảnh ngoài, không biểu trưng FANROC.
 *
 *   node scripts/game-icon.mjs
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { ICON_PATHS } from '../src/fanroc/ui/icons.ts'

const ROOT = resolve(import.meta.dirname, '..')
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(ROOT, '../thingblock-editor-sim'))
const { chromium } = createRequire(resolve(THINGBLOCK, 'package.json'))('playwright')

const SIZE = 1024
const html = `<!doctype html><html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect x="64" y="64" width="896" height="896" rx="200" fill="#1e1e1e"/>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="none" stroke="#4ec96b" stroke-width="24"/>
  <svg x="232" y="212" width="560" height="560" viewBox="0 0 24 24" fill="none" stroke="#4ec96b" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS.robot}</svg>
</svg></body></html>`

const out = resolve(await mkdtemp(resolve(tmpdir(), 'fanroc-icon-')), 'icon.png')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
await page.setContent(html)
await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } })
await browser.close()
execFileSync(resolve(ROOT, 'node_modules/.bin/tauri'), ['icon', out, '-o', resolve(ROOT, 'src-tauri/icons')], { cwd: ROOT, stdio: 'inherit' })
// Chỉ gói desktop: bỏ bộ biểu tượng di động.
for (const d of ['android', 'ios']) await rm(resolve(ROOT, 'src-tauri/icons', d), { recursive: true, force: true })
console.log(`Đã sinh biểu tượng từ ${out}`)
