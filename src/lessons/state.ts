/** Viết tắt để dựng khung khối (định dạng serialization JSON của scratch-blocks) và chip tên khối. */
export type BlockState = Record<string, unknown>

export const num = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } })
const positive = (value: number) => ({ shadow: { type: 'math_positive_number', fields: { NUM: value } } })

const chain = (next?: BlockState) => (next ? { next: { block: next } } : {})

export const hat = (type: string, x: number, y: number, next?: BlockState): BlockState => ({
  type,
  x,
  y,
  ...chain(next),
})

export const setLed = (brightness: number, next?: BlockState, led: 'LED_1' | 'LED_2' = 'LED_1'): BlockState => ({
  type: 'thingBotC3_setLed',
  fields: { LED: led },
  inputs: { BRIGHTNESS: num(brightness) },
  ...chain(next),
})

export const wait = (seconds: number, next?: BlockState): BlockState => ({
  type: 'control_wait',
  inputs: { DURATION: positive(seconds) },
  ...chain(next),
})

export const program = (...blocks: BlockState[]) => ({ blocks: { languageVersion: 0, blocks } })

/** Khung ban đầu chung: hai khối mũ, khối khởi động ThingBot đã đặt sẵn. */
export const STARTER = program(
  hat('event_whenarduinobegin', 30, 30, { type: 'thingBotC3_init' }),
  hat('event_whenarduinoloop', 30, 150),
)

const category = (name: string, colour: string, secondaryColour: string, contents: object[]) => ({
  kind: 'category',
  name,
  colour,
  secondaryColour,
  contents,
})
const block = (type: string, extra: object = {}) => ({ kind: 'block', type, ...extra })

export const extraCategory = category

export const toolbox = (control: object[], thingbot: object[], extra: object[] = []) => ({
  kind: 'categoryToolbox',
  contents: [
    {
      ...category('Sự kiện', '#FFD500', '#CC9900', [block('event_whenarduinobegin'), block('event_whenarduinoloop')]),
      categorystyle: 'events_category',
    },
    category('Điều khiển', '#FFAB19', '#CF8B17', control),
    category('ThingBot', '#6600ff', '#4400aa', thingbot),
    ...extra,
  ],
})
const text = (value: string) => ({ shadow: { type: 'text', fields: { TEXT: value } } })
const whole = (value: number) => ({ shadow: { type: 'math_whole_number', fields: { NUM: value } } })

/** Khung khối (serialization) cho các khối hay dùng, để dựng lời giải mẫu. */
export const S = {
  motor: (m: 1 | 2, dir: 'forward' | 'backward', speed: number, next?: BlockState): BlockState => ({
    type: 'thingBotC3_setMotor',
    fields: { MOTOR: String(m), DIRECTION: dir },
    inputs: { SPEED: num(speed) },
    ...chain(next),
  }),
  moveServo: (deg: number, seconds: number, next?: BlockState): BlockState => ({
    type: 'thingBotC3_moveServoAngle',
    fields: { SERVO: '1' },
    inputs: { ANGLE: num(deg), SECONDS: num(seconds) },
    ...chain(next),
  }),
  setServo: (deg: number, next?: BlockState): BlockState => ({
    type: 'thingBotC3_setServoAngle',
    fields: { SERVO: '1' },
    inputs: { ANGLE: num(deg) },
    ...chain(next),
  }),
  oledInit: (next?: BlockState): BlockState => ({
    type: 'oled_init',
    fields: { ADDR: '0x3c', CHIP: 'SSD1306' },
    inputs: { W: num(128), H: num(64) },
    ...chain(next),
  }),
  oledPrint: (value: string | BlockState, next?: BlockState): BlockState => ({
    type: 'oled_print',
    fields: { EOL: 'warp' },
    inputs: { DATA: typeof value === 'string' ? text(value) : { ...text(''), block: value } },
    ...chain(next),
  }),
  oledCursor: (x: number, y: number, next?: BlockState): BlockState => ({
    type: 'oled_setCursor',
    inputs: { X: num(x), Y: num(y) },
    ...chain(next),
  }),
  plain: (type: string, next?: BlockState): BlockState => ({ type, ...chain(next) }),
  sonar: (): BlockState => ({ type: 'ultrasonic_readDistance', fields: { TRIG: 0, ECHO: 4, UNIT: 'CM' } }),
  lessThan: (a: BlockState, b: number): BlockState => ({
    type: 'operator_lt',
    inputs: { OPERAND1: { ...text(''), block: a }, OPERAND2: text(String(b)) },
  }),
  button: (name: string): BlockState => ({ type: 'ps2_getButton', fields: { BUTTON: name } }),
  ifElse: (cond: BlockState, then: BlockState, otherwise?: BlockState, next?: BlockState): BlockState => ({
    type: 'control_if_else',
    inputs: { CONDITION: { block: cond }, SUBSTACK: { block: then }, ...(otherwise ? { SUBSTACK2: { block: otherwise } } : {}) },
    ...chain(next),
  }),
  repeat: (times: number, body: BlockState, next?: BlockState): BlockState => ({
    type: 'control_repeat',
    inputs: { TIMES: whole(times), SUBSTACK: { block: body } },
    ...chain(next),
  }),
}

export const B = {
  wait: block('control_wait', { inputs: { DURATION: positive(1) } }),
  waitFor: (seconds: number) => block('control_wait', { inputs: { DURATION: positive(seconds) } }),
  repeat: block('control_repeat', { inputs: { TIMES: whole(4) } }),
  lessThan: block('operator_lt', { inputs: { OPERAND1: text(''), OPERAND2: text('20') } }),
  greaterThan: block('operator_gt', { inputs: { OPERAND1: text(''), OPERAND2: text('0') } }),
  and: block('operator_and'),
  motor: (m: 1 | 2, dir: 'forward' | 'backward', speed: number) =>
    block('thingBotC3_setMotor', { fields: { MOTOR: String(m), DIRECTION: dir }, inputs: { SPEED: num(speed) } }),
  setServo: (deg: number) => block('thingBotC3_setServoAngle', { inputs: { ANGLE: num(deg) } }),
  moveServo: (deg: number, seconds: number) =>
    block('thingBotC3_moveServoAngle', { inputs: { ANGLE: num(deg), SECONDS: num(seconds) } }),
  releaseServo: block('thingBotC3_releaseServo'),
  playNote: block('thingBotC3_playNote', { fields: { NOTE: 'C', OCTAVE: '5' }, inputs: { BEATS: num(0.25) } }),
  initPS2: block('thingBotC3_initPS2'),
  oledInit: block('oled_init', { inputs: { W: num(128), H: num(64) } }),
  oledPrint: (value: string) => block('oled_print', { inputs: { DATA: text(value) } }),
  oledCursor: (x: number, y: number) => block('oled_setCursor', { inputs: { X: num(x), Y: num(y) } }),
  oledText: block('oled_setText'),
  oledClear: block('oled_clear'),
  oledRefresh: block('oled_refresh'),
  sonar: block('ultrasonic_readDistance', { fields: { TRIG: 0, ECHO: 4, UNIT: 'CM' } }),
  ps2Read: block('ps2_readData'),
  button: (name: string) => block('ps2_getButton', { fields: { BUTTON: name } }),
  forever: block('control_forever'),
  if: block('control_if'),
  ifElse: block('control_if_else'),
  init: block('thingBotC3_init'),
  switch: block('thingBotC3_switch'),
  setLed: (brightness: number) => block('thingBotC3_setLed', { inputs: { BRIGHTNESS: num(brightness) } }),
}

export const ev = (t: string) => `<span class="chip ev">${t}</span>`
export const ctrl = (t: string) => `<span class="chip ctrl">${t}</span>`
export const tb = (t: string) => `<span class="chip tb">${t}</span>`

/** Nhóm hộp khối của các ngoại vi, đúng màu khối trong ThingBlock. */
export const CAT = {
  operators: (contents: object[]) => category('Toán tử', '#59C059', '#389438', contents),
  oled: (contents: object[]) => category('OLED', '#C0C0C0', '#A9A9A9', contents),
  sensor: (contents: object[]) => category('Cảm biến', '#D39DDB', '#BA55D3', contents),
  ps2: (contents: object[]) => category('Tay cầm PS2', '#FF3399', '#C71585', contents),
}
export const op = (t: string) => `<span class="chip op">${t}</span>`
export const per = (t: string) => `<span class="chip per">${t}</span>`

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/**
 * Câu hỏi "Đoán trước": trẻ chọn trước khi chạy thử, bấm là thấy đúng/sai và lời giải thích ngay
 * (main.ts xử lý `data-pick`). Không chấm điểm, không chặn bước — để trẻ có lý do muốn bấm Chạy.
 */
export const ask = (q: string, options: [text: string, right: boolean, why: string][]) =>
  `<div class="ask"><p class="q">🤔 ${q}</p><div class="choices">${options
    .map(([t, r, w]) => `<button type="button" class="choice" data-pick="${r ? 1 : 0}" data-why="${attr(w)}">${t}</button>`)
    .join('')}</div><p class="why" hidden></p></div>`

/** Hộp "Hiểu sâu": một ý nền (0 và 1, đầu vào/đầu ra, vì sao chân này) đặt cạnh việc đang làm. */
export const hieu = (title: string, html: string) => `<div class="hieu"><p class="h">💡 ${title}</p>${html}</div>`

/** Bảng nhỏ "cắm ở đâu, là gì": hàng đầu là tiêu đề. */
export const bang = (head: string[], rows: string[][]) =>
  `<table class="io"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`

/** Nhãn "đầu vào" / "đầu ra" dùng trong bảng và lời giải thích. */
export const VAO = '<span class="tag vao">đầu vào</span>'
export const RA = '<span class="tag ra">đầu ra</span>'

/** Một câu so robot với cơ thể người: da, mắt, tai, miệng, cơ bắp, khớp tay. */
export const giong = (html: string) => `<p class="giong">🧍 <b>Giống cơ thể người:</b> ${html}</p>`
