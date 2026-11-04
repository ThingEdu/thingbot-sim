// Chạy khối ThingBlock thật không cần trang: nạp chương trình (serialization JSON) vào vùng khối không giao diện của
// scratch-blocks, sinh mã Arduino và mã mô phỏng bằng đúng bộ sinh mã của trang (registerThingBlocks), và chạy mã mô
// phỏng trên bo ThingBot ảo của thingblock-sim. Chỉ phép thử dùng (programs.test.ts gói tệp này bằng esbuild vì
// scratch-blocks là mã TypeScript có enum, Node không tự bỏ kiểu được).
import * as ScratchBlocks from '@scratch/scratch-blocks'
import { Session } from '@thingblock/thingblock-sim'
import { registerThingBlocks } from '../blocks.ts'
import { registerParamProcedures } from './procedures.ts'

export { Session }

/** Blockly dựng XML khi chép bóng (shadow): cần một DOM (jsdom trong Node). */
export function useDom(window: object): void {
  ScratchBlocks.utils.xml.injectDependencies(window as never)
  ScratchBlocks.ScratchMsgs.setLocale('vi')
  registerThingBlocks()
  registerParamProcedures(ScratchBlocks)
  headlessProcedures(window as { document?: Document })
}

/**
 * Khối của em trong vùng khối không giao diện (R38): `procedures_prototype` và ô tham số gọi `setDragStrategy`, và
 * `showContextMenu`; prototype dựng ô tham số bằng `initSvg` / `render` — chỉ `BlockSvg` có. Ở đây không kéo thả, không vẽ: thêm bản rỗng
 * vào `Block` (chỉ khi thiếu; `BlockSvg` vẫn dùng bản thật của nó), và `document` toàn cục nếu chưa có. Chỉ phép thử
 * Node gọi `useDom`, trang không đụng.
 */
function headlessProcedures(window: { document?: Document }): void {
  // mutationToDom / domToMutation của khối của em gọi thẳng `document.createElement` (không qua utils.xml).
  const g = globalThis as { document?: Document }
  if (!g.document && window.document) g.document = window.document
  const proto = ScratchBlocks.Block.prototype as unknown as Record<string, unknown>
  for (const name of ['setDragStrategy', 'showContextMenu', 'initSvg', 'render']) if (typeof proto[name] !== 'function') proto[name] = () => {}
}

export function generate(state: object): { sim: string; arduino: string; error?: string } {
  ScratchBlocks.Events.disable()
  const workspace = new ScratchBlocks.Workspace()
  try {
    ScratchBlocks.serialization.workspaces.load(state, workspace)
    const arduino = ScratchBlocks.arduinoGenerator.workspaceToCode(workspace)
    const generator = ScratchBlocks.simGenerator
    const sim = generator.workspaceToCode(workspace)
    const problem = generator.diagnostics[0]
    return problem ? { sim: '', arduino, error: problem.message } : { sim, arduino }
  } finally {
    workspace.dispose()
    ScratchBlocks.Events.enable()
  }
}

/** Khối có được đăng ký (khối ThingBlock thật hoặc khối chuẩn scratch-blocks) không. */
export function known(type: string): boolean {
  return type in ScratchBlocks.Blocks
}

/** Opcode của mọi khối thật (không tính bóng) sau khi nạp vào vùng khối không giao diện, theo thứ tự đã sắp. */
export function blockTypes(state: object): string[] {
  ScratchBlocks.Events.disable()
  const workspace = new ScratchBlocks.Workspace()
  try {
    ScratchBlocks.serialization.workspaces.load(state, workspace)
    return workspace.getAllBlocks(false).filter((b) => !b.isShadow()).map((b) => b.type).sort()
  } finally {
    workspace.dispose()
    ScratchBlocks.Events.enable()
  }
}
