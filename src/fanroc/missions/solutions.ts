// Lời giải mẫu của vài nhiệm vụ (serialization JSON của vùng khối), dùng chung cho phép thử giải được trên sân
// (grade.test.ts) và phép thử trình duyệt (scripts/fanroc-e2e.mjs N7, N8). Không phải dữ liệu cho học sinh.
import { argumentReporter, procedureCall, procedureState } from '../procedures.ts'

type B = Record<string, unknown>
const num = (v: number) => ({ shadow: { type: 'math_number', fields: { NUM: v } } })
const chain = (bs: B[]): B | undefined => bs.reduceRight<B | undefined>((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), undefined)
const motor = (m: number, dir: 'forward' | 'backward', speed: number): B => ({ type: 'thingBotC3_setMotor', fields: { MOTOR: String(m), DIRECTION: dir }, inputs: { SPEED: num(speed) } })
const wait = (s: number | B): B => ({
  type: 'control_wait',
  inputs: { DURATION: typeof s === 'number' ? { shadow: { type: 'math_positive_number', fields: { NUM: s } } } : { shadow: { type: 'math_positive_number', fields: { NUM: 1 } }, block: s } },
})
const div = (a: B, b: number): B => ({ type: 'operator_divide', inputs: { NUM1: { ...num(0), block: a }, NUM2: num(b) } })
const repeat = (n: number, body: B[]): B => ({ type: 'control_repeat', inputs: { TIMES: { shadow: { type: 'math_whole_number', fields: { NUM: n } } }, SUBSTACK: { block: chain(body) } } })
const defs = (...states: object[]) => states.map((s) => (s as { blocks: { blocks: B[] } }).blocks.blocks[0]).map((b, i) => ({ ...b, x: 460, y: 30 + i * 320 }))
const prog = (begin: B[], extra: B[] = []) => ({
  blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: chain([{ type: 'thingBotC3_init' }, ...begin]) } }, { type: 'event_whenarduinoloop', x: 30, y: 500 }, ...extra] },
})

/** Nhiệm vụ 2: hai động cơ 60, đợi `s` giây, dừng (0,9 s ⇒ dừng ở z ≈ 0,79, 3 sao). */
export const straight = (s = 0.9) => prog([motor(1, 'forward', 60), motor(2, 'forward', 60), wait(s), motor(1, 'forward', 0), motor(2, 'forward', 0)])

/**
 * Nhiệm vụ 7 (và bản sửa của nhiệm vụ 8): «tiến (mét)» và «rẽ trái (độ)» chia cho đúng số đo của nhiệm vụ 4 ở tốc độ 60
 * (0,275 m/s; 131 °/s), «lặp lại 4».
 */
export const turtle = (side: number, degPerS: number) =>
  prog(
    [repeat(4, [procedureCall('tiến', [side]) as B, procedureCall('rẽ trái', [90]) as B])],
    defs(
      procedureState('tiến', ['mét'], [motor(1, 'forward', 60), motor(2, 'forward', 60), wait(div(argumentReporter('mét') as B, 0.275)), motor(1, 'forward', 0), motor(2, 'forward', 0), wait(0.3)]),
      procedureState('rẽ trái', ['độ'], [motor(1, 'backward', 60), motor(2, 'forward', 60), wait(div(argumentReporter('độ') as B, degPerS)), motor(1, 'forward', 0), motor(2, 'forward', 0), wait(0.3)]),
    ),
  )
