/**
 * Vùng khối: đúng scratch-blocks và đúng định nghĩa khối của gói `thingbot-core` trong ThingBlock —
 * không chép, không định nghĩa lại. Mỗi bài chỉ mở vài khối trong hộp công cụ.
 */
import * as ScratchBlocks from '@scratch/scratch-blocks'
import { registerBlocks } from '@thingblock/resource/extensions/peripheral/thingbot-core/blocks'
import { registerGenerators } from '@thingblock/resource/extensions/peripheral/thingbot-core/generator'
import { registerSimGenerators } from '@thingblock/resource/extensions/peripheral/thingbot-core/sim'
import type { WorkspaceSvg } from '@scratch/scratch-blocks'
import { blockColors } from '@thingblock/block-colors'

type Shadow = { shadow: { type: string; fields: Record<string, string | number> } }

const num = (value: number): Shadow => ({ shadow: { type: 'math_number', fields: { NUM: value } } })

/** Hộp công cụ của bài 3: chỉ những khối cần để "nút bật đèn". */
const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Sự kiện',
      categorystyle: 'events_category',
      colour: '#FFD500',
      secondaryColour: '#CC9900',
      contents: [
        { kind: 'block', type: 'event_whenarduinobegin' },
        { kind: 'block', type: 'event_whenarduinoloop' },
      ],
    },
    {
      kind: 'category',
      name: 'Điều khiển',
      colour: '#FFAB19',
      secondaryColour: '#CF8B17',
      contents: [
        { kind: 'block', type: 'control_if' },
        { kind: 'block', type: 'control_if_else' },
        {
          kind: 'block',
          type: 'control_wait',
          inputs: { DURATION: { shadow: { type: 'math_positive_number', fields: { NUM: 1 } } } },
        },
      ],
    },
    {
      kind: 'category',
      name: 'ThingBot',
      colour: '#6600ff',
      secondaryColour: '#4400aa',
      contents: [
        { kind: 'block', type: 'thingBotC3_init' },
        { kind: 'block', type: 'thingBotC3_switch' },
        { kind: 'block', type: 'thingBotC3_setLed', inputs: { BRIGHTNESS: num(100) } },
        { kind: 'block', type: 'thingBotC3_setLed', inputs: { BRIGHTNESS: num(0) } },
      ],
    },
  ],
}

type BlockState = Record<string, unknown>

const hat = (type: string, x: number, y: number, next?: BlockState): BlockState => ({
  type,
  x,
  y,
  ...(next ? { next: { block: next } } : {}),
})

const setLed = (brightness: number, next?: BlockState): BlockState => ({
  type: 'thingBotC3_setLed',
  fields: { LED: 'LED_1' },
  inputs: { BRIGHTNESS: num(brightness) },
  ...(next ? { next: { block: next } } : {}),
})

/** Khung ban đầu: hai khối mũ, khối khởi động ThingBot đã đặt sẵn. */
export const STARTER = {
  blocks: {
    languageVersion: 0,
    blocks: [
      hat('event_whenarduinobegin', 30, 30, { type: 'thingBotC3_init' }),
      hat('event_whenarduinoloop', 30, 150),
    ],
  },
}

/** Lời giải mẫu: nếu nút được bấm thì L1 sáng 100, không thì 0. */
export const EXAMPLE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      hat('event_whenarduinobegin', 30, 30, { type: 'thingBotC3_init' }),
      hat('event_whenarduinoloop', 30, 150, {
        type: 'control_if_else',
        inputs: {
          CONDITION: { block: { type: 'thingBotC3_switch' } },
          SUBSTACK: { block: setLed(100) },
          SUBSTACK2: { block: setLed(0) },
        },
      }),
    ],
  },
}

export interface BlocksApi {
  workspace: WorkspaceSvg
  /** Mã cho bộ mô phỏng, hoặc lỗi nếu có khối chưa mô phỏng được. */
  simCode(): { code: string; error?: string }
  arduinoCode(): string
  load(state: object): void
  highlight(id: string | undefined): void
  onChange(cb: () => void): void
}

let registered = false

export function createBlocks(container: HTMLElement): BlocksApi {
  ScratchBlocks.ScratchMsgs.setLocale('vi')
  if (!registered) {
    registerBlocks(ScratchBlocks)
    registerGenerators(ScratchBlocks.arduinoGenerator, ScratchBlocks.ArduinoOrder)
    registerSimGenerators(ScratchBlocks.simGenerator, ScratchBlocks.ArduinoOrder)
    registered = true
  }

  const workspace = ScratchBlocks.inject(container, {
    toolbox: TOOLBOX,
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
