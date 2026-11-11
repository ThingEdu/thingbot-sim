// "Khối của em" (procedures của scratch-blocks) có tham số số cho FANROC.
//
// - Dữ liệu (thuần, Node đọc thẳng được): chuyên mục hộp công cụ, dựng JSON định nghĩa / lời gọi, đọc mutation,
//   bản nháp hộp thoại ↔ mutation, `hasParamProcedures` (cảnh báo khi tải .tb).
// - Bộ sinh mã mô phỏng (R37): ThingBlock sinh khối của em KHÔNG tham số (`function* tên()`, gọi `tên()`, không có mã
//   cho ô tham số). `registerParamProcedures` ghi đè ngay trong kho này — định nghĩa thành `function* tên(a, b)`, lời gọi
//   thành `yield* tên(x, y)`, ô tham số thành tên biến JS — không sửa `thingblock-editor-sim`. Bộ sinh mã Arduino giữ
//   nguyên, nên .tb có khối của em có tham số CHƯA nạp được ThingBot thật (trang báo khi tải, xem editor.ts).
// - Hộp thoại "Tạo khối" tiếng Việt thay cho hộp thoại của scratch-gui, gắn vào nút "Make a Block…" qua
//   `ScratchProcedures.externalProcedureDefCallback` (biến toàn cục của scratch-blocks, scratch-gui đặt nó).
//
// Tệp này chỉ nhập KIỂU của scratch-blocks (Node bỏ được): module thật được truyền vào `registerParamProcedures`.
import type * as ScratchBlocksModule from '@scratch/scratch-blocks'

type SB = typeof ScratchBlocksModule
type Json = Record<string, unknown>

/** Chuyên mục "Khối của em" — danh sách khối do scratch-blocks dựng động (nút tạo khối + một lời gọi mỗi khối). */
export const MY_BLOCKS_CATEGORY = { kind: 'category', name: 'Khối của em', colour: '#FF6680', secondaryColour: '#FF4D6A', custom: 'PROCEDURE' }

/** Bản nháp của hộp thoại: tên khối và tên các ô số. `ids` (nếu có) là id tham số cũ, giữ khi sửa khối đã có. */
export type MakeBlockDraft = { name: string; params: string[]; ids?: string[] }

/** Thuộc tính của `<mutation>` một khối của em (giá trị đúng như XML: mảng là chuỗi JSON). */
export type Mutation = Record<string, string>

// ---------- Mutation ----------
const XML_ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENTITIES[e] ?? all),
  )
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Thuộc tính mutation từ `extraState` của serialization JSON: scratch-blocks lưu chuỗi XML
 * (`<mutation xmlns="…" proccode="…" argumentids="[&quot;…&quot;]" …>`); dạng đối tượng cũng nhận.
 */
export function readMutation(extraState: unknown): Mutation {
  if (typeof extraState === 'string') {
    const out: Mutation = {}
    const open = /<mutation\b([^>]*)>/.exec(extraState)?.[1] ?? ''
    for (const [, key, value] of open.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) if (key !== 'xmlns') out[key] = unescapeXml(value)
    return out
  }
  if (extraState && typeof extraState === 'object') {
    return Object.fromEntries(Object.entries(extraState).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))
  }
  return {}
}

const mutationXml = (m: Mutation) => `<mutation ${Object.entries(m).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ')}></mutation>`
const jsonList = (s: string | undefined): string[] => {
  try {
    const v = JSON.parse(s ?? '[]') as unknown
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

// ---------- Bản nháp ↔ mutation ----------
let idCounter = 0
const newId = () => `ts${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** proccode của khối tên `name` có `n` ô số: "tên %n %n" (scratch-blocks đọc %n là ô số / chữ). */
const procCode = (name: string, n: number) => [name.trim(), ...Array.from({ length: n }, () => '%n')].join(' ')

/** Mutation của prototype từ bản nháp; tham số mới được id mới, tham số cũ giữ id (nối lại khối đã cắm ở lời gọi). */
export function draftMutation(d: MakeBlockDraft): Mutation {
  const params = d.params.map((p) => p.trim())
  const ids = params.map((_, i) => d.ids?.[i] ?? newId())
  return {
    proccode: procCode(d.name, params.length),
    argumentids: JSON.stringify(ids),
    argumentnames: JSON.stringify(params),
    argumentdefaults: JSON.stringify(params.map(() => '')),
    warp: 'false',
  }
}

/** Bản nháp từ mutation của prototype (tên = phần chữ của proccode, bỏ các ô %n/%s/%b). */
export function draftFromMutation(m: Mutation): MakeBlockDraft {
  const name = (m.proccode ?? '').split(/(?<!\\)%[nsb]/).map((s) => s.trim()).filter(Boolean).join(' ')
  return { name, params: jsonList(m.argumentnames), ids: jsonList(m.argumentids) }
}

/** Lỗi của bản nháp bằng lời cho học sinh, hoặc null nếu tạo được. */
export function draftProblem(d: MakeBlockDraft): string | null {
  if (!d.name.trim()) return 'Em đặt tên cho khối nhé.'
  if (d.name.includes('%')) return 'Tên khối không dùng được dấu %.'
  const params = d.params.map((p) => p.trim())
  if (params.some((p) => !p)) return 'Mỗi ô số cần một tên.'
  if (params.some((p) => p.includes('%'))) return 'Tên ô số không dùng được dấu %.'
  if (new Set(params).size !== params.length) return 'Hai ô số bị trùng tên — em đổi một tên nhé.'
  return null
}

// ---------- Dựng JSON (dữ liệu nhiệm vụ, phép thử) ----------
const chain = (blocks: object[]): object | undefined =>
  blocks.reduceRight<object | undefined>((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), undefined)
/** Id tham số cố định theo vị trí, để `procedureCall` cùng tên khớp `procedureState` mà không cần dò. */
const fixedIds = (n: number) => Array.from({ length: n }, (_, i) => `arg${i + 1}`)

/**
 * Vùng khối chỉ có một định nghĩa khối của em: mũ "định nghĩa" + prototype (ô số tên `params`) + thân `body` (các khối
 * lệnh, nối thành một chồng). Đúng dạng serialization JSON mà scratch-blocks lưu trên trang.
 */
export function procedureState(name: string, params: string[], body: object[]): object {
  const ids = fixedIds(params.length)
  const m = draftMutation({ name, params, ids })
  const next = chain(body)
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'procedures_definition',
          x: 420,
          y: 30,
          inputs: {
            custom_block: {
              block: {
                type: 'procedures_prototype',
                extraState: mutationXml(m),
                inputs: Object.fromEntries(ids.map((id, i) => [id, { block: argumentReporter(params[i]) }])),
              },
            },
          },
          ...(next ? { next: { block: next } } : {}),
        },
      ],
    },
  }
}

/** Lời gọi khối của em `name` với các đối số (số, hoặc khối báo giá trị cắm vào ô). */
export function procedureCall(name: string, args: (number | object)[]): object {
  const ids = fixedIds(args.length)
  return {
    type: 'procedures_call',
    extraState: mutationXml({ proccode: procCode(name, args.length), argumentids: JSON.stringify(ids), warp: 'false' }),
    inputs: Object.fromEntries(
      ids.map((id, i) => {
        const a = args[i]
        const shadow = { type: 'math_number', fields: { NUM: typeof a === 'number' ? a : 0 } }
        return [id, typeof a === 'number' ? { shadow } : { shadow, block: a }]
      }),
    ),
  }
}

/** Ô tham số (khối báo giá trị) tên `name`, dùng trong thân định nghĩa. */
export const argumentReporter = (name: string): object => ({ type: 'argument_reporter_string_number', fields: { VALUE: name } })

/** Báo khi tải .tb có khối của em có ô số (R37): vẫn cho tải. */
export const TB_PARAM_WARNING =
  'Lưu ý: chương trình này có khối của em có ô số. Khối kiểu này mới chạy được trong mô phỏng — ThingBlock chưa hỗ trợ, ' +
  'nên tệp .tb này chưa nạp được lên ThingBot thật. Muốn nạp lên robot thật, em làm khối của em không có ô số nhé.'

/** Số ô số (tham số) của một khối của em, đọc từ `extraState` (mutation `argumentids`). */
export function procedureArgCount(extraState: unknown): number {
  return jsonList(readMutation(extraState).argumentids).length
}

/** Chương trình có khối của em có ít nhất một tham số (định nghĩa hoặc lời gọi) — loại .tb ThingBlock chưa nạp được. */
export function hasParamProcedures(state: object): boolean {
  type S = { type?: string; extraState?: unknown; inputs?: Record<string, { shadow?: S; block?: S }>; next?: { block?: S } }
  const visit = (b: S | undefined): boolean => {
    if (!b) return false
    if (b.type?.startsWith('procedures_') && procedureArgCount(b.extraState) > 0) return true
    return Object.values(b.inputs ?? {}).some((i) => visit(i.block) || visit(i.shadow)) || visit(b.next?.block)
  }
  const stacks = (state as { blocks?: { blocks?: S[] } }).blocks?.blocks ?? []
  return stacks.some(visit)
}

// ---------- Bộ sinh mã mô phỏng (R37) ----------
type Block = ScratchBlocksModule.Block
type SimGen = SB['simGenerator']
type Names = { getName(name: string, type: string): string }
const ARGUMENT = 'FANROC_ARGUMENT'

const mutationOf = (block: Block | null): Mutation => {
  const dom = (block as unknown as { mutationToDom?: () => Element } | null)?.mutationToDom?.()
  if (!dom) return {}
  return Object.fromEntries([...dom.attributes].map((a) => [a.name, a.value]))
}
const argName = (gen: SimGen, name: string) => {
  const db = (gen as unknown as { nameDB_?: Names }).nameDB_
  if (!db) throw new Error('Tên tham số chỉ lấy được trong lúc sinh mã')
  return db.getName(name, ARGUMENT)
}

let sb: SB | undefined

/**
 * Ghi đè phần procedures của bộ sinh mã mô phỏng (gọi nhiều lần cũng chỉ ghi một lần). Khối không tham số sinh đúng
 * như ThingBlock (`function* tên()`, `yield* tên();`).
 */
export function registerParamProcedures(ScratchBlocks: SB): void {
  sb = ScratchBlocks
  const gen = ScratchBlocks.simGenerator
  const g = gen as unknown as { __fanrocParams?: boolean; emitProcedureDefinition(hat: Block): void }
  if (g.__fanrocParams) return
  g.__fanrocParams = true

  g.emitProcedureDefinition = function (this: SimGen, hat: Block) {
    const prototype = hat.getInputTargetBlock('custom_block')
    const m = mutationOf(prototype)
    const name = this.getProcedureName(m.proccode ?? 'custom_block')
    const params = jsonList(m.argumentnames).map((p) => argName(this, p))
    const next = hat.getNextBlock()
    const body = next ? this.blockToCodeString(next) : ''
    const indented = body ? `${this.prefixLines(body, this.INDENT)}\n` : ''
    this.globals.set(`proc_${name}`, `function* ${name}(${params.join(', ')}) {\n${indented}}`)
  }

  gen.forBlock.procedures_call = (block, generator) => {
    const m = mutationOf(block)
    const args = jsonList(m.argumentids).map((id) => generator.inputAs(block, id, 'double'))
    return `yield* ${generator.getProcedureName(m.proccode ?? '')}(${args.join(', ')});`
  }

  gen.forBlock.argument_reporter_string_number = (block, generator) => {
    const value = String(block.getFieldValue('VALUE') ?? '')
    const root = block.getRootBlock()
    const owner = root.type === 'procedures_definition' ? jsonList(mutationOf(root.getInputTargetBlock('custom_block')).argumentnames) : []
    if (!owner.includes(value)) {
      generator.fail(block, `Ô "${value}" chỉ dùng được bên trong khối định nghĩa của nó.`)
      return ['0', ScratchBlocks.ArduinoOrder.ATOMIC]
    }
    return [argName(generator, value), ScratchBlocks.ArduinoOrder.ATOMIC]
  }
  gen.typeFor.argument_reporter_string_number = () => 'double'

  // Ô tham số mang hai phần mở rộng output_number rồi output_string: cái sau thắng, đầu ra chỉ còn kiểu 'String', nên
  // không cắm được vào ô có kiểm 'Number' của khối ThingBot (tốc độ động cơ, góc servo…). Cho đầu ra nhận cả hai kiểu,
  // như ý "string_number" của Scratch. Chỉ đổi phép kiểm khi ghép khối; .tb không đổi.
  const def = ScratchBlocks.Blocks.argument_reporter_string_number as { init(this: Block): void }
  const init = def.init
  def.init = function (this: Block) {
    init.call(this)
    this.setOutput(true, ['Number', 'String'])
  }
}

// ---------- Hộp thoại "Tạo khối" ----------
/**
 * Gắn hộp thoại `open` vào nút "Make a Block…" và mục "Sửa" của khối của em, và chuyên mục động "PROCEDURE" của
 * `workspace`. Cần `registerParamProcedures` đã chạy (để có module scratch-blocks).
 */
export function installMakeBlockDialog(
  workspace: ScratchBlocksModule.WorkspaceSvg,
  open: (d: MakeBlockDraft) => Promise<MakeBlockDraft | null>,
): void {
  const S = sb
  if (!S) throw new Error('installMakeBlockDialog: gọi registerParamProcedures trước')
  workspace.registerToolboxCategoryCallback('PROCEDURE', S.ScratchProcedures.getProceduresCategory as never)

  // Một hàm toàn cục cho mọi vùng khối: scratch-blocks gọi kèm mutation (khối mới hoặc khối đang sửa) và hàm nhận kết quả.
  S.ScratchProcedures.externalProcedureDefCallback = (mutation, done) => {
    const before = Object.fromEntries([...mutation.attributes].map((a) => [a.name, a.value]))
    void open(draftFromMutation(before)).then((d) => {
      if (!d) return done()
      const el = mutation.ownerDocument.createElement('mutation')
      for (const [k, v] of Object.entries(draftMutation(d))) el.setAttribute(k, v)
      madeAt = Date.now()
      done(el)
    })
  }

  // Danh sách "Khối của em" dựng lại khi có khối mới / bị xoá / bị sửa (scratch-gui làm việc này qua VM).
  let pending = false
  workspace.addChangeListener((e: { type: string; json?: Json; oldJson?: Json; element?: string; blockId?: string }) => {
    const proc = (j?: Json) => typeof j?.type === 'string' && (j.type as string).startsWith('procedures_')
    if (e.type === S.Events.BLOCK_CREATE && e.json?.type === 'procedures_definition' && e.blockId && Date.now() - madeAt < MADE_MS) {
      madeAt = 0
      const id = e.blockId
      // scratch-blocks đặt khối định nghĩa mới ở góc trên trái vùng khối (khuất sau khay khối, đè chồng khối đang có —
      // anh Tuấn 12/11: học sinh không biết "khối định nghĩa" ở đâu). Đợi nó đặt xong rồi dời xuống dưới mọi chồng khối,
      // cuộn tới và chọn sẵn.
      void S.renderManagement.finishQueuedRenders().then(() => setTimeout(() => placeNewDefinition(workspace, id), PLACE_DELAY_MS))
    }
    const relevant =
      (e.type === S.Events.BLOCK_CREATE && proc(e.json)) ||
      (e.type === S.Events.BLOCK_DELETE && proc(e.oldJson)) ||
      (e.type === S.Events.BLOCK_CHANGE && e.element === 'mutation')
    if (!relevant || pending) return
    pending = true
    setTimeout(() => {
      pending = false
      ;(workspace.getToolbox() as unknown as { forceRerender?: () => void } | null)?.forceRerender?.()
    })
  })
  ;(workspace.getToolbox() as unknown as { forceRerender?: () => void } | null)?.forceRerender?.()
}

/** Lúc hộp thoại vừa trả khối mới (ms); khối định nghĩa đầu tiên tạo ra trong MADE_MS sau đó là của hộp thoại, không phải
 *  nạp tệp (sự kiện tạo khối tới chậm cả giây sau khi hộp thoại đóng, đo 12/11). */
let madeAt = 0
const MADE_MS = 5000
/** Chờ scratch-blocks đặt khối mới và đẩy khối chồng lên nhau ra (bumpDelay của Blockly ~250 ms) rồi mới dời. */
const PLACE_DELAY_MS = 300
/** Khoảng cách (đơn vị vùng khối) giữa khối định nghĩa mới và chồng khối thấp nhất. */
const PLACE_GAP = 48

/** Dời khối định nghĩa `id` xuống dưới mọi chồng khối khác (thẳng cột với chồng trái nhất), cuộn tới và chọn nó. */
function placeNewDefinition(workspace: ScratchBlocksModule.WorkspaceSvg, id: string): void {
  const def = workspace.getBlockById(id)
  if (!def) return
  const others = workspace.getTopBlocks(false).filter((b) => b.id !== id)
  if (others.length) {
    const boxes = others.map((b) => b.getBoundingRectangle())
    const left = Math.min(...boxes.map((r) => r.left))
    const bottom = Math.max(...boxes.map((r) => r.bottom))
    const at = def.getRelativeToSurfaceXY()
    def.moveBy(left - at.x, bottom + PLACE_GAP - at.y)
  }
  workspace.centerOnBlock(id)
  def.select()
}

const DIALOG_CSS = `
.mb-scrim { position: fixed; inset: 0; background: rgba(20, 24, 31, .45); display: grid; place-items: center; z-index: 1000; }
.mb-dialog { background: #fff; border-radius: 10px; padding: 18px; width: min(420px, calc(100vw - 32px)); box-shadow: 0 10px 40px rgba(0,0,0,.25); font: 14px var(--font, system-ui, sans-serif); color: #1d2433; }
.mb-dialog h2 { margin: 0 0 12px; font-size: 18px; }
.mb-dialog label { display: block; font-weight: 600; margin: 8px 0 4px; }
.mb-dialog input { box-sizing: border-box; width: 100%; font: inherit; padding: 6px 8px; border: 1px solid #c9cdd6; border-radius: 6px; }
.mb-params { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 6px; }
.mb-params li { display: flex; gap: 6px; align-items: center; }
.mb-params li span { flex: none; background: #FF6680; color: #fff; border-radius: 10px; padding: 2px 8px; font-size: 12px; }
.mb-dialog button { font: 600 14px inherit; border: 1px solid #c9cdd6; background: #fff; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
.mb-dialog .mb-x { flex: none; padding: 4px 8px; }
.mb-dialog .mb-ok { background: #FF6680; border-color: #FF4D6A; color: #fff; }
.mb-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.mb-error { color: #b3261e; min-height: 1.2em; margin-top: 8px; font-size: 13px; }
`

/** Hộp thoại DOM tiếng Việt: "Tên khối", "+ Thêm ô số", danh sách ô số (đổi tên / xoá), "Tạo khối" / "Huỷ"; Esc = Huỷ. */
export function openMakeBlockDialog(host: HTMLElement): (d: MakeBlockDraft) => Promise<MakeBlockDraft | null> {
  const doc = host.ownerDocument
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const e = doc.createElement(tag)
    if (cls) e.className = cls
    if (text) e.textContent = text
    return e
  }
  return (initial) =>
    new Promise((resolve) => {
      if (!doc.getElementById('mb-style')) {
        const style = make('style')
        style.id = 'mb-style'
        style.textContent = DIALOG_CSS
        doc.head.append(style)
      }
      const params = initial.params.map((name, i) => ({ name, id: initial.ids?.[i] }))
      let name = initial.name

      const scrim = make('div', 'mb-scrim')
      const dialog = make('div', 'mb-dialog')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.setAttribute('aria-labelledby', 'mb-title')
      const title = make('h2', undefined, initial.ids?.length || initial.params.length ? 'Sửa khối của em' : 'Tạo khối của em')
      title.id = 'mb-title'

      const nameLabel = make('label', undefined, 'Tên khối')
      const nameInput = make('input')
      nameInput.name = 'ten-khoi'
      nameInput.value = name
      nameInput.placeholder = 'ví dụ: tiến'
      nameInput.oninput = () => (name = nameInput.value)
      nameLabel.htmlFor = nameInput.id = 'mb-name'

      const list = make('ul', 'mb-params')
      const error = make('div', 'mb-error')
      error.setAttribute('role', 'alert')

      const button = (text: string, onClick: () => void, cls?: string) => {
        const b = make('button', cls, text)
        b.type = 'button'
        b.onclick = onClick
        return b
      }
      const renderParams = () => {
        list.replaceChildren(
          ...params.map((p, i) => {
            const li = make('li')
            const input = make('input')
            input.name = 'tham-so'
            input.value = p.name
            input.setAttribute('aria-label', `Tên ô số ${i + 1}`)
            input.oninput = () => (p.name = input.value)
            const remove = button('Xoá', () => {
              params.splice(i, 1)
              renderParams()
            }, 'mb-x')
            remove.setAttribute('aria-label', `Xoá ô số ${i + 1}`)
            li.append(make('span', undefined, 'ô số'), input, remove)
            return li
          }),
        )
      }
      renderParams()

      const draft = (): MakeBlockDraft => {
        const d: MakeBlockDraft = { name: name.trim(), params: params.map((p) => p.name.trim()) }
        if (params.some((p) => p.id)) d.ids = params.map((p) => p.id ?? newId())
        return d
      }
      const close = (result: MakeBlockDraft | null) => {
        scrim.remove()
        resolve(result)
      }
      const submit = () => {
        const d = draft()
        const problem = draftProblem(d)
        if (problem) {
          error.textContent = problem
          return
        }
        close(d)
      }
      const add = button('+ Thêm ô số', () => {
        params.push({ name: params.length ? `số ${params.length + 1}` : 'số', id: undefined })
        renderParams()
        ;(list.lastElementChild?.querySelector('input') as HTMLInputElement | null)?.focus()
      })
      const actions = make('div', 'mb-actions')
      actions.append(button('Huỷ', () => close(null)), button('Tạo khối', submit, 'mb-ok'))

      dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close(null)
        } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault()
          submit()
        }
      })
      scrim.onclick = (e) => {
        if (e.target === scrim) close(null)
      }
      dialog.append(title, nameLabel, nameInput, list, add, error, actions)
      scrim.append(dialog)
      host.append(scrim)
      nameInput.focus()
      nameInput.select?.()
    })
}
