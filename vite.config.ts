import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Web mẫu không chép mã ThingBlock: khối, bộ sinh mã và lõi mô phỏng được import thẳng từ checkout
 * `thingblock-editor` (mặc định là worktree nhánh `feat/sim-m0` nằm cạnh repo này).
 */
const THINGBLOCK = resolve(process.env.THINGBLOCK_EDITOR ?? resolve(__dirname, '../thingblock-editor-sim'))
const pkg = (p: string) => resolve(THINGBLOCK, 'packages', p)

export default defineConfig({
  resolve: {
    alias: {
      '@scratch/scratch-blocks': pkg('scratch-blocks/src/index.ts'),
      '@thingblock/thingblock-sim': pkg('thingblock-sim/src/index.ts'),
      '@thingblock/resource': pkg('thingblock-resource/src'),
      // Bảng màu khối mặc định của ThingBlock GUI (file JS thuần, không phụ thuộc gì).
      '@thingblock/block-colors': pkg('scratch-gui/src/lib/settings/color-mode/default/index.js'),
    },
  },
  server: { port: 5190, fs: { allow: [__dirname, THINGBLOCK] } },
  worker: { format: 'es' },
})
