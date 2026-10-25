/**
 * Vùng khối: đúng scratch-blocks và đúng định nghĩa khối của gói `thingbot-core` trong ThingBlock —
 * không chép, không định nghĩa lại. Mỗi bài chỉ mở vài khối trong hộp công cụ (xem `lessons/`).
 */
import * as ScratchBlocks from '@scratch/scratch-blocks'
import { registerBlocks } from '@thingblock/resource/extensions/peripheral/thingbot-core/blocks'
import { registerGenerators } from '@thingblock/resource/extensions/peripheral/thingbot-core/generator'
import { registerSimGenerators } from '@thingblock/resource/extensions/peripheral/thingbot-core/sim'
import { registerBlocks as registerOledBlocks } from '@thingblock/resource/extensions/peripheral/oled/blocks'
import { registerGenerators as registerOledGenerators } from '@thingblock/resource/extensions/peripheral/oled/generator'
import { registerSimGenerators as registerOledSim } from '@thingblock/resource/extensions/peripheral/oled/sim'
import { registerBlocks as registerSonarBlocks } from '@thingblock/resource/extensions/peripheral/ultrasonic/blocks'
import { registerGenerators as registerSonarGenerators } from '@thingblock/resource/extensions/peripheral/ultrasonic/generator'
import { registerBlocks as registerPs2Blocks } from '@thingblock/resource/extensions/peripheral/ps2/blocks'
import { registerGenerators as registerPs2Generators } from '@thingblock/resource/extensions/peripheral/ps2/generator'
import { registerExtraSimGenerators } from './sim-extra'
import type { WorkspaceSvg } from '@scratch/scratch-blocks'
import { blockColors } from '@thingblock/block-colors'

export interface BlocksApi {
  workspace: WorkspaceSvg
  /** Mã cho bộ mô phỏng, hoặc lỗi nếu có khối chưa mô phỏng được. */
  simCode(): { code: string; error?: string }
  arduinoCode(): string
  load(state: object): void
  /** Vẽ lại cho vừa khung (sau khi vùng khối bị ẩn rồi hiện lại). */
  resize(): void
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
    // Khối ThingBot và ba ngoại vi các bài dùng: màn OLED, cảm biến siêu âm, tay cầm PS2.
    for (const register of [registerBlocks, registerOledBlocks, registerSonarBlocks, registerPs2Blocks]) register(ScratchBlocks)
    for (const register of [registerGenerators, registerOledGenerators, registerSonarGenerators, registerPs2Generators])
      register(ScratchBlocks.arduinoGenerator, ScratchBlocks.ArduinoOrder)
    registerSimGenerators(ScratchBlocks.simGenerator, ScratchBlocks.ArduinoOrder)
    registerOledSim(ScratchBlocks.simGenerator, ScratchBlocks.ArduinoOrder)
    registerExtraSimGenerators(ScratchBlocks.simGenerator, ScratchBlocks.ArduinoOrder)
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
    resize() {
      ScratchBlocks.svgResize(workspace)
    },
    setToolbox(next) {
      workspace.updateToolbox(next as never)
      // Hộp công cụ của scratch-blocks không tự vẽ lại khi đổi nội dung (refreshSelection cố ý
      // không làm gì); ThingBlock GUI cũng phải gọi forceRerender sau updateToolbox.
      ;(workspace.getToolbox() as unknown as { forceRerender(): void }).forceRerender()
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
        case 'thingBotC3_setMotor':
          return `set motor M${block.getFieldValue('MOTOR')} go ${block.getFieldValue('DIRECTION')} at ${input('SPEED') ?? '…'}`
        case 'thingBotC3_setServoAngle':
          return `set servo S${block.getFieldValue('SERVO')} to angle ${input('ANGLE') ?? '…'}`
        case 'thingBotC3_moveServoAngle':
          return `move servo S${block.getFieldValue('SERVO')} to angle ${input('ANGLE') ?? '…'}`
        case 'oled_print':
          return 'oled print'
        case 'oled_refresh':
          return 'refresh oled display'
        case 'oled_clear':
          return 'clear oled'
        case 'oled_init':
          return 'init oled'
        case 'ps2_readData':
          return 'read PS2 receiver data'
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
