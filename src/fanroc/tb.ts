// Xuất chương trình khối của một robot ra tệp ".tb" của ThingBlock (zip một tệp project.json, Scratch 3) để học sinh
// mở bằng ThingBlock desktop và nạp lên ThingBot thật.
// Chuyển từ ThingBlock, nhánh feat/examples-library, commit f728263,
// packages/thingblock-resource/scripts/examples/tb-builder.mjs (`toProject`, `toTb`). Đầu vào ở đây là cả trạng thái
// serialization của vùng khối (`{ blocks: { blocks: [...] }, variables?: [...] }`, như `Editors.program(i)` và SAMPLES),
// không phải dạng `{ stacks, variables }` của tb-builder; vị trí x/y của khối mũ giữ nguyên như trên vùng khối.
import JSZip from 'jszip'
import { readMutation } from './procedures.ts'

type Json = Record<string, unknown>
interface SerializedBlock {
  type: string
  x?: number
  y?: number
  fields?: Record<string, unknown>
  inputs?: Record<string, { shadow?: SerializedBlock; block?: SerializedBlock }>
  next?: { block?: SerializedBlock }
  /** Mutation của khối của em: chuỗi XML `<mutation …>` như scratch-blocks lưu (hoặc đối tượng thuộc tính). */
  extraState?: unknown
}
interface VariableRef { id?: string; name?: string }
interface Variable { id?: string; name: string; type?: string }
export interface ProjectJson {
  targets: Json[]
  monitors: unknown[]
  extensions: string[]
  meta: { semver: string; vm: string; agent: string }
  board: { device: string; peripherals: string[] }
}

/** Mã nguyên thuỷ sb3 của các khối bóng (shadow) được ghi thẳng trong ô nhập. */
const PRIMITIVES: Record<string, [number, string]> = {
  math_number: [4, 'NUM'],
  math_positive_number: [5, 'NUM'],
  math_whole_number: [6, 'NUM'],
  math_integer: [7, 'NUM'],
  math_angle: [8, 'NUM'],
  colour_picker: [9, 'COLOUR'],
  text: [10, 'TEXT'],
}

/** Tiền tố opcode của các nhóm khối có sẵn; còn lại là tên extension (thingBotC3, ps2…). */
const CORE_PREFIXES = new Set(['argument', 'colour', 'control', 'data', 'event', 'looks', 'math', 'motion', 'operator', 'procedures', 'sensing', 'sound', 'text'])

/** Ngoại vi bo tự bật, không ghi vào `board.peripherals`. */
const DEVICE_AUTO_PERIPHERALS: Record<string, string[]> = { thingbot: ['thingBotC3', 'ps2'] }
const DEVICE = 'thingbot'

/** Hình nền (costume) giữ chỗ mà mọi bản lưu của ThingBlock đều tham chiếu (trình soạn tự có tệp). */
const COSTUME = { name: 'costume1', assetId: 'cd21514d0531fdffb22204e0ec5ed84a', md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', dataFormat: 'svg' }
const COLUMN_WIDTH = 760

/** Chuyển trạng thái serialization của vùng khối thành `project.json` của ThingBlock. */
export function toProject(state: object): ProjectJson {
  const { blocks: ws, variables = [] } = state as { blocks: { blocks?: SerializedBlock[] }; variables?: Variable[] }
  const stacks = ws?.blocks ?? []
  const blocks: Record<string, Json> = {}
  let counter = 0
  const nextId = (prefix: string) => `${prefix}${++counter}`

  const vars = variables.map((v, i) => ({ ...v, id: v.id ?? `var${i + 1}` }))
  const resolveVar = (ref: VariableRef) => {
    const v = vars.find((x) => x.id === ref.id) ?? vars.find((x) => x.name === ref.name)
    if (!v) throw new Error(`Biến chưa khai báo: ${JSON.stringify(ref)}`)
    return v
  }
  const primitive = (shadow: SerializedBlock): [number, string] => {
    const kind = PRIMITIVES[shadow.type]
    if (!kind) throw new Error(`Không hỗ trợ khối bóng ${shadow.type}`)
    return [kind[0], String(shadow.fields?.[kind[1]] ?? '')]
  }

  const add = (b: SerializedBlock, parent: string | null, pos: { x: number; y: number } | null, parentType?: string): string => {
    const id = nextId('b')
    const out: Json = { opcode: b.type, next: null, parent, inputs: {}, fields: {}, shadow: false, topLevel: pos !== null }
    if (pos) Object.assign(out, pos)
    blocks[id] = out
    const inputs = out.inputs as Record<string, unknown>
    const fields = out.fields as Record<string, unknown>

    for (const [name, value] of Object.entries(b.fields ?? {})) {
      if (name === 'VARIABLE') {
        const v = resolveVar(value as VariableRef)
        fields[name] = [v.name, v.id]
      } else fields[name] = [String(value), null]
    }

    // Khối của em (R38): mutation đọc từ chuỗi XML của scratch-blocks; prototype là khối bóng con của định nghĩa (ô
    // `custom_block`), ô tham số trên prototype là bóng `argument_reporter_string_number` — đúng dạng Scratch 3.
    const m = readMutation(b.extraState)
    const mutation = (keys: string[]) => ({
      tagName: 'mutation', children: [], proccode: m.proccode ?? '',
      ...Object.fromEntries(keys.map((k) => [k, m[k] ?? (k === 'warp' ? 'false' : '[]')])),
    })
    if (b.type === 'procedures_prototype') {
      Object.assign(out, { shadow: true, mutation: mutation(['argumentids', 'argumentnames', 'argumentdefaults', 'warp']) })
    }
    if (b.type === 'procedures_call') out.mutation = mutation(['argumentids', 'warp'])
    if (b.type === 'argument_reporter_string_number' && parentType === 'procedures_prototype') out.shadow = true
    if (b.type === 'procedures_definition' && !b.inputs?.custom_block?.block) {
      // Định nghĩa không kèm prototype (dạng cũ: mutation ghi trên chính định nghĩa): dựng một prototype không tham số.
      const protoId = nextId('p')
      blocks[protoId] = {
        opcode: 'procedures_prototype', next: null, parent: id, inputs: {}, fields: {}, shadow: true, topLevel: false,
        mutation: mutation(['argumentids', 'argumentnames', 'argumentdefaults', 'warp']),
      }
      inputs.custom_block = [1, protoId]
    }

    for (const [name, input] of Object.entries(b.inputs ?? {})) {
      const shadow = input.shadow ? primitive(input.shadow) : null
      if (input.block) {
        let ref: unknown
        if (input.block.type === 'data_variable') {
          const v = resolveVar(input.block.fields?.VARIABLE as VariableRef)
          ref = [12, v.name, v.id]
        } else ref = add(input.block, id, null, b.type)
        // Khối bóng (prototype trong định nghĩa, ô tham số trên prototype) là [1, id] như Scratch 3.
        const isShadow = (blocks[ref as string] as Json | undefined)?.shadow === true
        inputs[name] = shadow ? [3, ref, shadow] : [isShadow ? 1 : 2, ref]
      } else if (shadow) inputs[name] = [1, shadow]
    }

    if (b.next?.block) out.next = add(b.next.block, id, null)
    return id
  }

  stacks.forEach((stack, i) => add(stack, null, { x: stack.x ?? 40 + i * COLUMN_WIDTH, y: stack.y ?? 40 }))

  const extensions: string[] = []
  for (const opcode of new Set(Object.values(blocks).map((b) => b.opcode as string))) {
    const prefix = opcode.split('_')[0]
    if (!CORE_PREFIXES.has(prefix) && !extensions.includes(prefix)) extensions.push(prefix)
  }
  const auto = DEVICE_AUTO_PERIPHERALS[DEVICE] ?? []

  const stageVariables: Record<string, unknown> = {}
  const variableTypes: Record<string, string> = {}
  for (const v of vars) {
    stageVariables[v.id] = [v.name, v.type === 'string' ? '' : 0]
    if (v.type) variableTypes[v.id] = v.type
  }

  return {
    targets: [
      {
        isStage: true, name: 'Stage', variables: stageVariables, lists: {}, broadcasts: {}, variableTypes, blocks: {}, comments: {},
        currentCostume: 0, costumes: [COSTUME], sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null,
      },
      {
        isStage: false, name: 'Sprite1', variables: {}, lists: {}, broadcasts: {}, blocks, comments: {},
        currentCostume: 0, costumes: [COSTUME], sounds: [], volume: 100, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around',
      },
    ],
    monitors: [],
    extensions,
    meta: { semver: '3.0.0', vm: '14.1.0', agent: 'thingbot-sim/fanroc' },
    board: { device: DEVICE, peripherals: extensions.filter((e) => !auto.includes(e)) },
  }
}

/** Nén `project.json` thành tệp `.tb`. */
export async function toTb(state: object): Promise<Blob> {
  const zip = new JSZip()
  zip.file('project.json', JSON.stringify(toProject(state)))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** `fanroc-<robot>-<yyyymmdd-hhmm>.tb`, giờ máy. */
export function tbFileName(robot: string, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `fanroc-${robot}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.tb`
}
