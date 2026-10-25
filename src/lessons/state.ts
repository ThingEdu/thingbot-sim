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

export const toolbox = (control: object[], thingbot: object[]) => ({
  kind: 'categoryToolbox',
  contents: [
    {
      ...category('Sự kiện', '#FFD500', '#CC9900', [block('event_whenarduinobegin'), block('event_whenarduinoloop')]),
      categorystyle: 'events_category',
    },
    category('Điều khiển', '#FFAB19', '#CF8B17', control),
    category('ThingBot', '#6600ff', '#4400aa', thingbot),
  ],
})
export const B = {
  wait: block('control_wait', { inputs: { DURATION: positive(1) } }),
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
