// Chạy khối ThingBlock thật không cần trang: nạp chương trình (serialization JSON) vào vùng khối không giao diện của
// scratch-blocks, sinh mã Arduino và mã mô phỏng bằng đúng bộ sinh mã của trang (registerThingBlocks), và chạy mã mô
// phỏng trên bo ThingBot ảo của thingblock-sim. Chỉ phép thử dùng (programs.test.ts gói tệp này bằng esbuild vì
// scratch-blocks là mã TypeScript có enum, Node không tự bỏ kiểu được).
import * as ScratchBlocks from '@scratch/scratch-blocks'
import { Session } from '@thingblock/thingblock-sim'
import { registerThingBlocks } from '../blocks.ts'

export { Session }

/** Blockly dựng XML khi chép bóng (shadow): cần một DOM (jsdom trong Node). */
export function useDom(window: object): void {
  ScratchBlocks.utils.xml.injectDependencies(window as never)
  ScratchBlocks.ScratchMsgs.setLocale('vi')
  registerThingBlocks()
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
