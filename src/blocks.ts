/**
 * Vùng khối: đúng scratch-blocks và đúng định nghĩa khối của gói `thingbot-core` trong ThingBlock —
 * không chép, không định nghĩa lại. Mỗi bài chỉ mở vài khối trong hộp công cụ (xem `lessons/`).
 */
import * as ScratchBlocks from '@scratch/scratch-blocks'
import { registerBlocks } from '@thingblock/resource/extensions/peripheral/thingbot-core/blocks'
import { registerGenerators } from '@thingblock/resource/extensions/peripheral/thingbot-core/generator'
import { registerSimGenerators } from '@thingblock/resource/extensions/peripheral/thingbot-core/sim'
import type { WorkspaceSvg } from '@scratch/scratch-blocks'
import { blockColors } from '@thingblock/block-colors'

export interface BlocksApi {
  workspace: WorkspaceSvg
  /** Mã cho bộ mô phỏng, hoặc lỗi nếu có khối chưa mô phỏng được. */
  simCode(): { code: string; error?: string }
  arduinoCode(): string
  load(state: object): void
  /** Đổi hộp công cụ khi đổi bài. */
  setToolbox(toolbox: object): void
  /** Khối đang chạy, kể cho trẻ bằng đúng chữ trên khối: "set led 1 100", "đợi 0.5 giây"… */
  describe(id: string | undefined): string | null
  highlight(id: string | undefined): void
  onChange(cb: () => void): void
}

let registered = false

export function createBlocks(container: HTMLElement, toolbox: object): BlocksApi {
  ScratchBlocks.ScratchMsgs.setLocale('vi')
  if (!registered) {
    registerBlocks(ScratchBlocks)
    registerGenerators(ScratchBlocks.arduinoGenerator, ScratchBlocks.ArduinoOrder)
    registerSimGenerators(ScratchBlocks.simGenerator, ScratchBlocks.ArduinoOrder)
    registered = true
  }

  const workspace = ScratchBlocks.inject(container, {
    toolbox,
    theme: new ScratchBlocks.Theme('default', blockColors as never, undefined, {
      workspaceBackgroundColour: '#ffffff',
      flyoutBackgroundColour: '#f4f2ee',
      flyoutOpacity: 1,
      toolboxBackgroundColour: '#ffffff',
    }),
    media: 'media/',
    zoom: { controls: true, wheel: false, startScale: 0.675 },
    grid: { spacing: 40, length: 2, colour: '#ddd' },
    trashcan: false,
    sounds: false,
    comments: false,
    collapse: false,
  } as never)

  let highlighted: string | undefined
  const api: BlocksApi = {
    workspace,
    simCode() {
      const generator = ScratchBlocks.simGenerator
      try {
        const code = generator.workspaceToCode(workspace)
        const problem = generator.diagnostics[0]
        return problem ? { code: '', error: problem.message } : { code }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        const unsupported = /block type: (\S+)/.exec(message)
        return { code: '', error: unsupported ? `Khối "${unsupported[1]}" chưa mô phỏng được` : message }
      }
    },
    arduinoCode() {
      try {
        return ScratchBlocks.arduinoGenerator.workspaceToCode(workspace)
      } catch (e) {
        return `// Không sinh được mã: ${e instanceof Error ? e.message : String(e)}`
      }
    },
    load(state) {
      ScratchBlocks.Events.disable()
      try {
        workspace.clear()
        ScratchBlocks.serialization.workspaces.load(state, workspace)
      } finally {
        ScratchBlocks.Events.enable()
      }
      workspace.scroll(0, 0)
    },
    setToolbox(next) {
      workspace.updateToolbox(next as never)
    },
    describe(id) {
      const block = id ? workspace.getBlockById(id) : null
      if (!block) return null
      const input = (name: string) => block.getInputTargetBlock(name)?.getFieldValue('NUM')
      switch (block.type) {
        case 'thingBotC3_setLed':
          return `set led ${block.getFieldValue('LED') === 'LED_2' ? 2 : 1} ${input('BRIGHTNESS') ?? '…'}`
        case 'control_wait':
          return `đợi ${input('DURATION') ?? '…'} giây`
        case 'thingBotC3_init':
          return 'init ThingBot'
        default:
          return null
      }
    },
    highlight(id) {
      if (id === highlighted) return
      if (highlighted) workspace.highlightBlock(highlighted, false)
      highlighted = id && workspace.getBlockById(id) ? id : undefined
      if (highlighted) workspace.highlightBlock(highlighted, true)
    },
    onChange(cb) {
      workspace.addChangeListener((event: { isUiEvent?: boolean }) => {
        if (!event.isUiEvent) cb()
      })
    },
  }
  return api
}
