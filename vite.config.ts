import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Web mẫu không chép mã ThingBlock: khối, bộ sinh mã và lõi mô phỏng được import thẳng từ checkout
 * `thingblock-editor` (mặc định là worktree nhánh `feat/sim-m0` nằm cạnh repo này).
 */
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(__dirname, '../thingblock-editor-sim'))
const pkg = (p: string) => resolve(THINGBLOCK, 'packages', p)

/**
 * Web chạy dưới robot.edu.vn/mo-phong/ (robot.edu.vn chuyển tiếp ngầm sang project Vercel này), nên bản
 * build nằm trong dist/mo-phong/ để đường dẫn tệp giống hệt ở cả hai tên miền.
 */
const BASE = '/mo-phong/'

export default defineConfig({
  base: BASE,
  build: { outDir: `dist${BASE}`, emptyOutDir: true },
  resolve: {
    alias: {
      '@scratch/scratch-blocks': pkg('scratch-blocks/src/index.ts'),
      // Bộ chấm luật `kiểm:` của bài học ThingBlock (đặt trước để không bị alias gói chính nuốt).
      '@thingblock/thingblock-sim/checker': pkg('thingblock-sim/src/checker/index.ts'),
      '@thingblock/thingblock-sim': pkg('thingblock-sim/src/index.ts'),
      '@thingblock/resource': pkg('thingblock-resource/src'),
      // Bảng màu khối mặc định của ThingBlock GUI (file JS thuần, không phụ thuộc gì).
      '@thingblock/block-colors': pkg('scratch-gui/src/lib/settings/color-mode/default/index.js'),
    },
  },
  server: { port: 5190, fs: { allow: [__dirname, THINGBLOCK] } },
  worker: { format: 'es' },
})
