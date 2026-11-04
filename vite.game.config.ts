import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import lessons from './vite.config.ts'

/**
 * Bản build độc lập của ThingBot FanRoc Game (spec §6.7): chỉ trang game, đường dẫn tương đối `./` nên mở được từ
 * một máy chủ tĩnh bất kỳ ở thư mục con bất kỳ, hoặc từ tệp trong gói desktop Tauri (`src-tauri/`). Thư mục ra
 * `dist-game/`, trang game ra `index.html`. Bí danh gói ThingBlock và Worker dạng ES lấy nguyên của bản bài học.
 */
const OUT = 'dist-game'

/** `fanroc.html` ⇒ `index.html` (máy chủ tĩnh / Tauri mở thẳng thư mục). */
const asIndex = (): Plugin => ({
  name: 'fanroc-as-index',
  enforce: 'post',
  generateBundle(_, bundle) {
    const page = bundle['fanroc.html']
    if (!page) this.error('Không thấy fanroc.html trong bản build game')
    page.fileName = 'index.html'
    delete bundle['fanroc.html']
    bundle['index.html'] = page
  },
})

export default defineConfig({
  base: './',
  resolve: lessons.resolve,
  worker: lessons.worker,
  plugins: [asIndex()],
  build: {
    outDir: OUT,
    emptyOutDir: true,
    rollupOptions: { input: { fanroc: resolve(__dirname, 'fanroc.html') } },
  },
  // Không có cổng mặc định: `vite preview -c vite.game.config.ts --port <cổng>` (cổng 5190 thuộc checkout khác).
  preview: { strictPort: true },
})
