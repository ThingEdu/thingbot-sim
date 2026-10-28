/**
 * Nối ba phần của bài: cột bài học → vùng khối (ThingBlock) → bộ mô phỏng (Web Worker) → mạch 3D và
 * dải dòng chảy dưới mạch. Mỗi bài (thư mục `lessons/`) tự mang hộp khối, các bước và bộ chấm; file này
 * chỉ đổi bài và vẽ.
 */
import * as ScratchBlocks from '@scratch/scratch-blocks'
import type { Snapshot } from '@thingblock/thingblock-sim'
import type { RuleResult } from '@thingblock/thingblock-sim/checker'
import { createArena, type CarState } from './arena'
import { createBlocks } from './blocks'
import { LESSONS, type Lesson } from './lessons'
import { motorSpeed, pct, servoAngle } from './lessons/grader'
import type { FlowKind, Grader, Part } from './lessons/types'
import { createScene, type TraceName } from './scene'
import { ps2Key, PS2_BUTTONS, SONAR_KEY } from './sim-extra'
import type { Bus, Command, Message } from './sim-worker'
import SimWorker from './sim-worker?worker'

const SW_GPIO = 3
const CH = { L1: 15, L2: 13 } as const
type Led = keyof typeof CH
const STORE = 'thingbot-sim:v1'
const HI = '#e2473b'
const LO = '#2f6fde'
const BUS = '#e59612'
const LED_COLOR: Record<Led, string> = { L1: '#e2473b', L2: '#22a652' }
/** Dải nhịp đèn vẽ lại bao nhiêu giây gần nhất. */
const RHYTHM_S = 4

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T
const IDLE_BUS: Bus = { reads: {}, writes: {}, zeros: {}, ons: {}, sensors: {}, loops: 0, oledText: null }

// --- lưu tiến độ (chỉ là tiện ích; trình duyệt chặn lưu thì vẫn chạy) -------------------------
interface LessonSave {
  workspace?: object
  card?: number
  /** Bài khám phá: bộ phận đã tìm thấy. */
  found?: string[]
}
interface Saved {
  done: string[]
  /** Công tắc nguồn trên mạch ảo (bật thì động cơ, servo có điện). */
  power?: boolean
  current?: string
  lessons: Record<string, LessonSave>
}
const store = {
  get(): Saved {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Saved> & LessonSave
      const lessons = v.lessons ?? {}
      // Bản cũ chỉ có bài 3 và lưu thẳng ở gốc.
      if (!v.lessons && v.workspace) lessons['bai-3'] = { workspace: v.workspace, card: v.card }
      return { done: v.done ?? [], current: v.current, power: v.power, lessons }
    } catch {
      return { done: [], lessons: {} }
    }
  },
  set(value: Saved) {
    try {
      localStorage.setItem(STORE, JSON.stringify(value))
    } catch {
      /* bỏ qua */
    }
  },
}
const saved = store.get()
const showProgress = () => {
  const n = new Set(saved.done).size
  $('#progress-count').textContent = `${n}/10 bài`
  $('#progress-fill').style.width = `${n * 10}%`
}
showProgress()

// --- mạch & khối ------------------------------------------------------------------------------
const scene = createScene($('#stage'), $('#badges'))
const blocks = createBlocks($('#blocks'), LESSONS[0].toolbox)
const arena = createArena($('#stage'))

let lesson: Lesson = LESSONS[0]
let grader: Grader
let card = 0
let passed: ReadonlySet<string> = new Set()
const mine = () => (saved.lessons[lesson.id] ??= {})

// --- chọn bài ---------------------------------------------------------------------------------
const picker = $('#lesson-pick')
const renderPicker = () => {
  picker.replaceChildren(
    ...LESSONS.map((l) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.innerHTML = `<b>Bài ${l.no}</b><span>${l.title}</span>`
      b.title = `Bài ${l.no}: ${l.title}`
      b.setAttribute('aria-current', String(l === lesson))
      b.classList.toggle('done', saved.done.includes(l.id))
      b.addEventListener('click', () => l !== lesson && openLesson(l))
      return b
    }),
  )
  // Màn hẹp: thanh chọn bài cuộn ngang, nên kéo bài đang mở vào tầm nhìn.
  picker.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
}

// --- dải dòng chảy ---------------------------------------------------------------------------
const FLOWS: Record<FlowKind, string[]> = {
  button: ['Nút SW', 'Não', 'Chip PCA', 'Đèn L1'],
  blink: ['Não', 'Chip PCA', 'Đèn L1'],
  explore: [],
  oled: ['Não', 'I2C', 'Màn OLED'],
  servo: ['Não', 'Chip PCA', 'Servo S1'],
  sonar: ['Cảm biến', 'Não', 'Chip PCA', 'Đèn L1'],
  motor: ['Não', 'Chip PCA', 'IC động cơ', 'Bánh M1'],
  car: ['Não', 'Bánh trái M1', 'Bánh phải M2', 'Xe'],
  ps2: ['Tay cầm', 'Não', 'Hai bánh', 'Xe'],
  avoid: ['Cảm biến', 'Não', 'Hai bánh', 'Xe'],
}
const flowEl = $('#flow')
const buildFlow = (kind: FlowKind) => {
  flowEl.className = `flow${FLOWS[kind].length === 3 ? ' three' : ''}`
  flowEl.innerHTML = FLOWS[kind]
    .map((label, i) => `<li id="f${i + 1}"><b><i>${i + 1}</i><span class="l">${label}</span></b><span class="v"></span><span class="t"></span></li>`)
    .join('')
}
const setFlow = (id: string, value: string, tech: string, state: string, label?: string) => {
  const li = $(`#${id}`)
  li.className = state
  li.querySelector('.v')!.textContent = value
  li.querySelector('.t')!.textContent = tech
  if (label) li.querySelector('.l')!.textContent = label
}

// --- bài học từng bước --------------------------------------------------------------------
const dots = $('#dots')
/** Câu đố: câu trả lời em chọn gần nhất cho mỗi câu. */
let answered: Record<string, string> = {}
$('#step-body').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-answer]')
  if (!b) return
  const q = b.dataset.answer!.split(':')[0]
  // Đã trả lời đúng thì khoá câu hỏi: bấm tiếp không đổi được kết quả.
  if (passed.has(q)) return
  answered[q] = b.dataset.answer!
  grader.event?.('answer', b.dataset.answer!)
})
const renderCard = () => {
  const c = lesson.cards[card]
  $('#step-no').textContent = `Bước ${card + 1}/${lesson.cards.length}${c.optional ? ' · không bắt buộc' : ''}`
  $('#step-title').textContent = c.title
  $('#step-body').innerHTML = c.body
  const ok = c.check ? passed.has(c.check) : false
  const status = $('#step-status')
  status.hidden = !c.check
  status.className = `step-status${ok ? ' ok' : ''}`
  status.textContent = ok ? '✓ Làm được rồi!' : 'Đang chờ em làm…'
  ;[...dots.children].forEach((d, i) => {
    const check = lesson.cards[i].check
    d.className = `${i === card ? 'now' : ''}${check && passed.has(check) ? ' ok' : ''}`
  })
  ;($('#prev') as HTMLButtonElement).disabled = card === 0
  const next = $('#next') as HTMLButtonElement
  next.disabled = card === lesson.cards.length - 1
  next.classList.toggle('ready', ok || !c.check)
  for (const b of document.querySelectorAll<HTMLButtonElement>('#step-body [data-answer]')) {
    const [q] = b.dataset.answer!.split(':')
    if (answered[q] === b.dataset.answer) b.classList.add(passed.has(q) ? 'right' : 'wrong')
  }
  scene.highlight(c.look ?? [])
  mine().card = card
  store.set(saved)
}
const onGrade = (p: ReadonlySet<string>, hint: string | null) => {
  passed = p
  const hintEl = $('#hint')
  hintEl.hidden = !hint
  hintEl.textContent = hint ?? ''
  if (lesson.done.every((d) => p.has(d)) && !saved.done.includes(lesson.id)) {
    saved.done.push(lesson.id)
    showProgress()
    renderPicker()
  }
  renderCard()
}
$('#prev').addEventListener('click', () => {
  card = Math.max(0, card - 1)
  renderCard()
})
$('#next').addEventListener('click', () => {
  card = Math.min(lesson.cards.length - 1, card + 1)
  renderCard()
})

// --- mô phỏng -----------------------------------------------------------------------------
const worker = new SimWorker()
const send = (c: Command) => worker.postMessage(c)
let running = false
let pressed = false
let lastSnap: Snapshot | null = null
let lastRules: RuleResult[] | null = null
/** Số lần chạy hiện tại: thư của worker mang số khác là của lần chạy trước, bỏ qua. */
let runId = 0
const lastPulse = { io3: 0, i2c: 0 }
let readsPerSec = 0

const runBtn = $<HTMLButtonElement>('#run')
const statusEl = $('#status')
/** `reason`: vì sao chương trình dừng (lỗi), hiện thay cho "Đã dừng" để trẻ đọc được. */
const setRunning = (on: boolean, reason?: string) => {
  running = on
  runBtn.textContent = on ? '■ Dừng' : '▶ Chạy'
  runBtn.classList.toggle('stop', on)
  statusEl.textContent = on ? 'Đang chạy' : (reason ?? 'Đã dừng')
  statusEl.classList.toggle('on', on)
  if (!on) {
    blocks.highlight(undefined)
    lastSnap = null
    readsPerSec = 0
    render(null, IDLE_BUS)
  }
}

const start = () => {
  const { code, error } = blocks.simCode()
  if (error) {
    statusEl.textContent = error
    statusEl.classList.remove('on')
    return
  }
  grader.restart()
  lastSnap = null
  lastRules = null
  rhythm.length = 0
  activeLed = lesson.cards[card].check?.startsWith('L2') ? 'L2' : 'L1'
  placeBadges()
  if (lesson.arena) {
    arena.reset()
    car = arena.state()
  }
  carT = -1
  runId++
  send({ type: 'load', code, rules: lesson.rules, run: runId })
  send({ type: 'input', key: `gpio${SW_GPIO}`, value: pressed ? 0 : 1 })
  sendInputs()
  send({ type: 'run' })
  setRunning(true)
}
const stop = () => {
  send({ type: 'stop' })
  setRunning(false)
}
runBtn.addEventListener('click', () => (running ? stop() : start()))

const loadBlocks = (state: object) => {
  blocks.load(state)
  mine().workspace = state
  store.set(saved)
  if (running) start()
}
$('#example').addEventListener('click', () => loadBlocks(lesson.example))
$('#restart').addEventListener('click', () => {
  if (lesson.flow !== 'explore') loadBlocks(lesson.starter)
  mine().found = []
  answered = {}
  selected = null
  grader.clear()
  if (lesson.flow === 'explore') renderExplore()
  card = 0
  renderCard()
})

let changeTimer = 0
blocks.onChange(() => {
  window.clearTimeout(changeTimer)
  changeTimer = window.setTimeout(() => {
    changeTimer = 0
    mine().workspace = ScratchBlocks.serialization.workspaces.save(blocks.workspace)
    store.set(saved)
    // Khối đổi khi đang chạy: chạy ngay chương trình mới.
    if (running) start()
  }, 250)
})

// Nút SW: chuột/chạm trên mạch, nút ✋, hoặc phím Space
const setPressed = (p: boolean) => {
  if (p === pressed) return
  pressed = p
  scene.setSwitch(p)
  $('#hold').setAttribute('aria-pressed', String(p))
  send({ type: 'input', key: `gpio${SW_GPIO}`, value: p ? 0 : 1 })
  if (!running) render(null, IDLE_BUS)
}
scene.onSwitch(setPressed)
const hold = $('#hold')
hold.addEventListener('pointerdown', (e) => {
  hold.setPointerCapture(e.pointerId)
  setPressed(true)
})
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(type, () => setPressed(false))
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || lesson.flow !== 'button') return
  if ((e.target as HTMLElement).closest('#blocks, input, textarea, dialog')) return
  e.preventDefault()
  setPressed(true)
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') setPressed(false)
})

worker.onmessage = ({ data }: MessageEvent<Message>) => {
  if (data.run !== runId) return
  if (data.type === 'error') {
    setRunning(false, `Lỗi: ${data.message}`)
    return
  }
  if (!running) return
  if (data.type === 'check') {
    lastRules = data.results
    return
  }
  const { snapshot, bus } = data
  const dt = lastSnap ? (snapshot.t - lastSnap.t) / 1e6 : 0
  const reads = bus.reads[SW_GPIO] ?? 0
  if (dt > 0) readsPerSec = readsPerSec ? readsPerSec * 0.8 + (reads / dt) * 0.2 : reads / dt
  lastSnap = snapshot
  if (!snapshot.running && snapshot.phase === 'halted') {
    setRunning(false, snapshot.error ? `Chương trình dừng: ${snapshot.error}` : 'Chương trình đã chạy xong')
    return
  }
  blocks.highlight(snapshot.block)
  if (lesson.arena) stepCar(snapshot)
  render(snapshot, bus)
}

const pctOf = (duty: number) => Math.round((Math.min(duty, 4095) / 4095) * 100)

function render(snap: Snapshot | null, bus: Bus) {
  const on = running && snap !== null
  const pwm = on ? snap.pwm : new Array<number>(16).fill(0)
  scene.setLed('L1', pwm[CH.L1] / 4096)
  scene.setLed('L2', pwm[CH.L2] / 4096)
  const readsSwitch = on && (bus.reads[SW_GPIO] ?? 0) > 0
  const props = lesson.props ?? []
  if (props.includes('oled')) scene.setOled(on ? snap.oled : null)
  if (props.includes('servo') && power) {
    const a = servoAngle(pwm[12])
    if (a !== null) scene.setServo(a)
  }
  if (props.includes('motor')) scene.setWheel(power ? motorSpeed(pwm, 1) : 0)
  switch (lesson.flow) {
    case 'button':
      renderButton(on, pwm, bus, readsSwitch)
      break
    case 'blink':
      renderBlink(snap, on, pwm, bus)
      break
    case 'explore':
      break
    default:
      renderDevice(snap, on, pwm, bus)
  }
  if (lesson.arena) arena.draw()
  grader.observe({
    running: on,
    pressed,
    readsSwitch,
    pwm,
    writes: bus.writes,
    zeros: bus.zeros,
    ons: bus.ons,
    rules: lastRules,
    t: snap?.t ?? 0,
    now: performance.now(),
    card: lesson.cards[card],
    sensors: on ? bus.sensors : {},
    oledText: on ? bus.oledText : null,
    oledOn: on && snap.oled !== null,
    power,
    sonar: sonarCm(),
    pad: { ...pad },
    car: lesson.arena ? car : null,
  })
}

/** Bài 3: Nút SW → IO3 → Não → I2C → Chip PCA → Đèn L1. */
function renderButton(on: boolean, pwm: number[], bus: Bus, reads: boolean) {
  const duty = pwm[CH.L1]
  const writes = on && (bus.writes[CH.L1] ?? 0) > 0
  const pct = pctOf(duty)
  const now = performance.now()
  const level = pressed ? LO : HI

  scene.setTrace('io3', on ? level : null)
  scene.setTrace('sda', writes ? BUS : null)
  scene.setTrace('scl', writes ? BUS : null)
  scene.setTrace('ch15', on ? (pct > 0 ? HI : LO) : null)
  scene.setTrace('ch13', null)
  if (reads && now - lastPulse.io3 > 160) {
    scene.pulse('io3', level)
    lastPulse.io3 = now
  }
  if (writes && now - lastPulse.i2c > 240) {
    scene.pulse('sda', BUS)
    scene.pulse('scl', BUS)
    window.setTimeout(() => running && scene.pulse('ch15', pct > 0 ? HI : LO), 420)
    lastPulse.i2c = now
  }

  setFlow('f1', pressed ? 'Đang bấm' : 'Không bấm', `IO3 ${pressed ? 'LOW 0 V' : 'HIGH 3,3 V'}`, pressed ? 'lo' : '')
  if (!on) setFlow('f2', 'Chưa chạy', 'ESP32-C3', 'idle')
  else if (!reads) setFlow('f2', 'Không hỏi nút', 'thiếu «read switch»', 'idle')
  else
    setFlow(
      'f2',
      pressed ? 'Thấy bấm' : 'Thấy nhả',
      readsPerSec > 1 ? `hỏi ${Math.round(readsPerSec).toLocaleString('vi-VN')} lần/giây` : 'đang hỏi nút',
      'active',
    )
  setFlow(
    'f3',
    on ? (writes ? `Lệnh: ${pct} %` : `Giữ lệnh: ${pct} %`) : '—',
    on ? `I2C kênh 15 = ${Math.min(duty, 4095)}` : 'PCA9685 · I2C',
    writes ? 'bus' : on ? '' : 'idle',
  )
  setFlow('f4', pct > 0 ? `SÁNG ${pct} %` : 'TẮT', `PWM ${pct} %`, pct > 0 ? 'lit' : '')
}

// --- bài 2: não lặp → I2C → Chip PCA → đèn, và dải nhịp đèn theo thời gian ------------------------
let activeLed: Led = 'L1'
let usedL2 = false
let lastWrite = 0
const rhythm: { t: number; l1: number; l2: number }[] = []
const rhythmCanvas = $<HTMLCanvasElement>('#rhythm-canvas')

function renderBlink(snap: Snapshot | null, on: boolean, pwm: number[], bus: Bus) {
  const now = performance.now()
  const wrote = (Object.keys(CH) as Led[]).filter((l) => on && (bus.writes[CH[l]] ?? 0) > 0)
  if (wrote.length === 1 && wrote[0] !== activeLed) {
    activeLed = wrote[0]
    placeBadges()
  }
  if (wrote.includes('L2')) usedL2 = true
  if (wrote.length) lastWrite = now
  const ch = CH[activeLed]
  const duty = pwm[ch]
  const pct = pctOf(duty)
  const busy = on && now - lastWrite < 260

  scene.setTrace('io3', null)
  scene.setTrace('sda', busy ? BUS : null)
  scene.setTrace('scl', busy ? BUS : null)
  scene.setTrace('ch15', on ? (pwm[CH.L1] > 0 ? HI : LO) : null)
  scene.setTrace('ch13', on && usedL2 ? (pwm[CH.L2] > 0 ? HI : LO) : null)
  if (wrote.length && now - lastPulse.i2c > 120) {
    scene.pulse('sda', BUS)
    scene.pulse('scl', BUS)
    for (const l of wrote) {
      const trace: TraceName = l === 'L1' ? 'ch15' : 'ch13'
      const lit = pwm[CH[l]] > 0
      window.setTimeout(() => running && scene.pulse(trace, lit ? HI : LO), 380)
    }
    lastPulse.i2c = now
  }

  if (!on) setFlow('f1', 'Chưa chạy', 'ESP32-C3', 'idle')
  else {
    const doing = blocks.describe(snap?.block)
    setFlow('f1', `Vòng thứ ${bus.loops.toLocaleString('vi-VN')}`, doing ? `đang: ${doing}` : 'ESP32-C3 · vòng lặp Arduino', 'active')
  }
  setFlow(
    'f2',
    on ? `Lệnh: ${pct} %` : '—',
    on ? `I2C kênh ${ch} = ${Math.min(duty, 4095)}` : 'PCA9685 · I2C',
    busy ? 'bus' : on ? '' : 'idle',
  )
  setFlow('f3', pct > 0 ? `SÁNG ${pct} %` : 'TẮT', `PWM ${pct} %`, pct > 0 ? 'lit' : '', `Đèn ${activeLed}`)

  if (on && snap) {
    rhythm.push({ t: snap.t, l1: pwm[CH.L1], l2: pwm[CH.L2] })
    while (rhythm.length && rhythm[0].t < snap.t - RHYTHM_S * 1e6 - 1e6) rhythm.shift()
  }
  drawRhythm(on && snap ? snap.t : null)
}

function drawRhythm(tNow: number | null) {
  const c = rhythmCanvas
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = c.clientHeight
  if (!w || !h) return
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const end = tNow ?? rhythm.at(-1)?.t ?? 0
  const t0 = end - RHYTHM_S * 1e6
  const x = (t: number) => ((t - t0) / (RHYTHM_S * 1e6)) * w
  // vạch từng giây
  g.strokeStyle = '#ece6d8'
  g.lineWidth = 1
  for (let s = Math.ceil(t0 / 1e6); s * 1e6 <= end; s++) {
    const px = Math.round(x(s * 1e6)) + 0.5
    g.beginPath()
    g.moveTo(px, 0)
    g.lineTo(px, h)
    g.stroke()
  }
  const key = activeLed === 'L1' ? 'l1' : 'l2'
  const top = 6
  const base = h - 6
  g.fillStyle = LED_COLOR[activeLed]
  // Mỗi đoạn sáng liền (cùng độ sáng) vẽ thành một khối.
  for (let i = 0; i < rhythm.length; ) {
    const level = rhythm[i][key]
    let j = i + 1
    while (j < rhythm.length && rhythm[j][key] === level) j++
    const from = rhythm[i].t
    const to = rhythm[j]?.t ?? end
    if (level > 0 && to >= t0) {
      g.globalAlpha = 0.35 + 0.65 * Math.min(1, level / 4095)
      const a = Math.max(0, x(from))
      g.fillRect(a, top, Math.max(1, x(to) - a), base - top)
    }
    i = j
  }
  g.globalAlpha = 1
  g.strokeStyle = '#c9bfa8'
  g.beginPath()
  g.moveTo(0, base + 0.5)
  g.lineTo(w, base + 0.5)
  g.stroke()

  // đo nhịp: khoảng cách giữa hai lần bật liên tiếp
  const ons: number[] = []
  for (let i = 1; i < rhythm.length; i++) if (rhythm[i][key] > 0 && rhythm[i - 1][key] <= 0 && rhythm[i].t >= t0) ons.push(rhythm[i].t)
  const gaps = ons.slice(1).map((t, i) => t - ons[i]).sort((a, b) => a - b)
  const read = $('#rhythm-read')
  if (gaps.length) {
    const s = gaps[gaps.length >> 1] / 1e6
    read.textContent = `1 lần / ${(Math.round(s * 10) / 10).toFixed(1).replace('.', ',')} giây`
  } else read.textContent = tNow === null ? '' : 'chưa chớp'
  $('#rhythm-label').textContent = `Nhịp đèn ${activeLed}`
}

// --- bài 4–10: màn hình, servo, cảm biến, động cơ, xe --------------------------------------------
let power = saved.power ?? false
let sliderCm = 50
const pad: Record<string, boolean> = {}
let car: CarState = arena.state()
let carT = -1
let lastSonarSent = -1
let lastOled: string | null = null
/** Lần cuối chương trình đọc từng loại cảm biến (ms thực): chương trình đọc mỗi vài chục ms, còn mỗi gói
 *  từ worker chỉ dài một khung hình, nên "đang đọc" được giữ thêm một lúc cho khỏi nhấp nháy. */
const readAt: Record<string, number> = {}
const readsRecently = (bus: Bus, prefix: string) => {
  const now = performance.now()
  if (Object.keys(bus.sensors).some((k) => k.startsWith(prefix))) readAt[prefix] = now
  return now - (readAt[prefix] ?? -1e9) < 400
}

const sonarCm = () => (lesson.arena ? car.sonar : sliderCm)
const sendSonar = () => {
  const cm = Math.round(sonarCm())
  if (cm === lastSonarSent) return
  lastSonarSent = cm
  send({ type: 'input', key: `adc${SONAR_KEY}`, value: cm })
}
function sendInputs() {
  lastSonarSent = -1
  sendSonar()
  for (const b of PS2_BUTTONS) send({ type: 'input', key: `adc${ps2Key(b)}`, value: pad[b] ? 1 : 0 })
}

/** Xe chạy theo thời gian ảo của chương trình, nên nhanh/chậm khớp với các khối «đợi». */
function stepCar(snap: Snapshot) {
  const dt = carT < 0 ? 0 : Math.min(0.1, (snap.t - carT) / 1e6)
  carT = snap.t
  const on = power ? 1 : 0
  car = arena.step(motorSpeed(snap.pwm, 1) * on, motorSpeed(snap.pwm, 2) * on, dt)
  sendSonar()
}

const vn = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',')
const wheelText = (v: number) => (v > 0 ? `TIẾN ${pct(v)} %` : v < 0 ? `LÙI ${pct(v)} %` : 'DỪNG')
const motion = (l: number, r: number) => {
  if (l === 0 && r === 0) return 'Đứng yên'
  if (l * r < 0) return l > r ? 'Xoay phải' : 'Xoay trái'
  if (Math.abs(l - r) < 0.05) return l > 0 ? 'Đi thẳng' : 'Lùi'
  return (l > r) === l + r > 0 ? 'Rẽ phải' : 'Rẽ trái'
}
const doing = (snap: Snapshot | null) => {
  const d = blocks.describe(snap?.block)
  return d ? `đang: ${d}` : 'ESP32-C3'
}

function renderDevice(snap: Snapshot | null, on: boolean, pwm: number[], bus: Bus) {
  const now = performance.now()
  const writes = on && Object.keys(bus.writes).length > 0
  if (writes) lastWrite = now
  const busy = on && now - lastWrite < 260
  const brain = () => setFlow(lesson.flow === 'car' ? 'f1' : 'f2', on ? 'Đang chạy' : 'Chưa chạy', on ? doing(snap) : 'ESP32-C3', on ? 'active' : 'idle')
  scene.setTrace('io3', null)
  scene.setTrace('ch13', null)
  scene.setTrace('ch15', on && lesson.flow === 'sonar' ? (pwm[CH.L1] > 0 ? HI : LO) : null)
  scene.setTrace('sda', busy ? BUS : null)
  scene.setTrace('scl', busy ? BUS : null)
  if (writes && now - lastPulse.i2c > 160) {
    scene.pulse('sda', BUS)
    scene.pulse('scl', BUS)
    lastPulse.i2c = now
  }
  const l = power ? motorSpeed(pwm, 1) : 0
  const r = power ? motorSpeed(pwm, 2) : 0
  const carBox = () =>
    setFlow('f4', on ? motion(l, r) : 'Đứng yên', `đã đi ${vn(car.travelled / 100, 2)} m${car.bumps ? ` · đâm ${car.bumps} lần` : ''}`, car.touching ? 'lit' : l || r ? 'active' : '')
  const noPower = !power ? 'Không có điện: bật 🔋 Nguồn' : ''

  switch (lesson.flow) {
    case 'oled': {
      const text = on ? bus.oledText : null
      if (text !== lastOled && text) {
        scene.pulse('sda', BUS)
        scene.pulse('scl', BUS)
      }
      lastOled = text
      setFlow('f1', on ? 'Đang chạy' : 'Chưa chạy', on ? doing(snap) : 'ESP32-C3', on ? 'active' : 'idle')
      setFlow('f2', on && snap?.oled ? 'Màn hình 0x3C' : '—', 'SDA · SCL, chung với PCA9685', on && text ? 'bus' : on ? '' : 'idle')
      const first = (text ?? '').split('\n').filter((s) => s.trim())
      setFlow('f3', first.length ? first.join(' / ') : on && snap?.oled ? 'Đen' : 'Tắt', `${first.length} dòng chữ`, first.length ? 'lit' : '')
      break
    }
    case 'servo': {
      const a = servoAngle(pwm[12])
      setFlow('f1', on ? 'Đang chạy' : 'Chưa chạy', on ? doing(snap) : 'ESP32-C3', on ? 'active' : 'idle')
      setFlow('f2', a === null ? '—' : `Xung ${pwm[12]}`, 'kênh 12 = S1 (102…512)', busy ? 'bus' : on ? '' : 'idle')
      setFlow('f3', a === null ? 'Chưa có lệnh' : power ? `${a}°` : `${a}° · chưa quay`, a !== null && !power ? noPower : 'góc 0…180 độ', a !== null && power ? 'lit' : '')
      break
    }
    case 'sonar': {
      const cm = Math.round(sliderCm)
      const reads = on && readsRecently(bus, 'sonar_')
      setFlow('f1', `Vật cách ${cm} cm`, `tiếng vọng ${(cm * 58).toLocaleString('vi-VN')} µs`, on && reads ? 'lo' : '')
      if (!on) setFlow('f2', 'Chưa chạy', 'ESP32-C3', 'idle')
      else setFlow('f2', reads ? 'Đang đo' : 'Không hỏi cảm biến', reads ? doing(snap) : 'thiếu «ultrasonic … read distance»', reads ? 'active' : 'idle')
      const p = pctOf(pwm[CH.L1])
      setFlow('f3', on ? `Lệnh: ${p} %` : '—', on ? `I2C kênh 15 = ${Math.min(pwm[CH.L1], 4095)}` : 'PCA9685 · I2C', busy ? 'bus' : on ? '' : 'idle')
      setFlow('f4', p > 0 ? `SÁNG ${p} %` : 'TẮT', `PWM ${p} %`, p > 0 ? 'lit' : '')
      break
    }
    case 'motor': {
      const v = motorSpeed(pwm, 1)
      setFlow('f1', on ? 'Đang chạy' : 'Chưa chạy', on ? doing(snap) : 'ESP32-C3', on ? 'active' : 'idle')
      setFlow('f2', on ? `kênh 2 = ${Math.min(pwm[2], 4095)}` : '—', on ? `kênh 3 = ${Math.min(pwm[3], 4095)}` : 'PCA9685 · I2C', busy ? 'bus' : on ? '' : 'idle')
      setFlow('f3', !power ? 'Không có điện' : v > 0 ? 'Đẩy chiều tới' : v < 0 ? 'Đẩy chiều lùi' : 'Không đẩy', power ? 'dòng điện từ pin' : noPower, power && v ? 'active' : '')
      setFlow('f4', power ? wheelText(v) : 'ĐỨNG YÊN', `tốc độ ${pct(v)} %`, power && v ? 'lit' : '')
      break
    }
    case 'car':
      brain()
      setFlow('f2', wheelText(l), noPower || `kênh 2 = ${Math.min(pwm[2], 4095)} · 3 = ${Math.min(pwm[3], 4095)}`, l ? 'active' : '')
      setFlow('f3', wheelText(r), noPower || `kênh 4 = ${Math.min(pwm[4], 4095)} · 5 = ${Math.min(pwm[5], 4095)}`, r ? 'active' : '')
      carBox()
      break
    case 'ps2': {
      const held = PS2_BUTTONS.filter((b) => pad[b]).map((b) => PAD_LABEL[b])
      const reads = on && readsRecently(bus, 'ps2_')
      setFlow('f1', held.length ? `Bấm ${held.join(' ')}` : 'Không bấm', reads ? 'não đang đọc bộ thu' : on ? 'não chưa đọc bộ thu' : 'bộ thu cổng PS2', held.length ? 'lo' : '')
      brain()
      setFlow('f3', `${pct(l)} % · ${pct(r)} %`, noPower || `M1 ${wheelText(l).toLowerCase()} · M2 ${wheelText(r).toLowerCase()}`, l || r ? 'active' : '')
      carBox()
      break
    }
    case 'avoid':
      setFlow('f1', `Vật cách ${Math.round(car.sonar)} cm`, car.sonar < 25 ? 'GẦN!' : 'đường thoáng', car.sonar < 25 ? 'lit' : 'lo')
      brain()
      setFlow('f3', `${pct(l)} % · ${pct(r)} %`, noPower || `M1 ${wheelText(l).toLowerCase()} · M2 ${wheelText(r).toLowerCase()}`, l || r ? 'active' : '')
      carBox()
      break
  }
}

const PAD_LABEL: Record<string, string> = { PSB_PAD_UP: '▲', PSB_PAD_DOWN: '▼', PSB_PAD_LEFT: '◀', PSB_PAD_RIGHT: '▶' }
const KEY_PAD: Record<string, string> = { ArrowUp: 'PSB_PAD_UP', ArrowDown: 'PSB_PAD_DOWN', ArrowLeft: 'PSB_PAD_LEFT', ArrowRight: 'PSB_PAD_RIGHT' }
const setPad = (button: string, down: boolean) => {
  if (!!pad[button] === down) return
  pad[button] = down
  document.querySelector(`[data-pad="${button}"]`)?.classList.toggle('on', down)
  send({ type: 'input', key: `adc${ps2Key(button)}`, value: down ? 1 : 0 })
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-pad]')) {
  b.addEventListener('pointerdown', (e) => {
    b.setPointerCapture(e.pointerId)
    setPad(b.dataset.pad!, true)
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(type, () => setPad(b.dataset.pad!, false))
}
window.addEventListener('keydown', (e) => {
  const b = KEY_PAD[e.key]
  if (!b || !(lesson.controls ?? []).includes('pad')) return
  if ((e.target as HTMLElement).closest('#blocks, input, textarea, dialog')) return
  e.preventDefault()
  setPad(b, true)
})
window.addEventListener('keyup', (e) => {
  const b = KEY_PAD[e.key]
  if (b) setPad(b, false)
})

const powerBtn = $('#power')
const showPower = () => {
  powerBtn.textContent = power ? '🔋 Nguồn: BẬT' : '🔋 Nguồn: TẮT'
  powerBtn.setAttribute('aria-pressed', String(power))
}
powerBtn.addEventListener('click', () => {
  power = !power
  saved.power = power
  store.set(saved)
  showPower()
  if (!running) render(null, IDLE_BUS)
})
showPower()

const slider = $<HTMLInputElement>('#sonar')
slider.addEventListener('input', () => {
  sliderCm = Number(slider.value)
  $('#sonar-out').textContent = `${sliderCm} cm`
  scene.setObstacle(sliderCm)
  sendSonar()
  if (!running) render(null, IDLE_BUS)
})
scene.setObstacle(sliderCm)

$('#reset-car').addEventListener('click', () => {
  arena.reset()
  car = arena.state()
  carT = -1
  grader.restart()
  arena.draw()
})

// --- bài 1: khám phá mạch -------------------------------------------------------------------
let selected: Part | null = null
let seeing = false
const hotspots = new Map<string, HTMLElement[]>()
const foundSet = () => new Set(mine().found ?? [])

function pick(part: Part, at = part.at[0]) {
  const found = foundSet()
  if (!found.has(part.id)) {
    mine().found = [...found, part.id]
    store.set(saved)
  }
  selected = part
  scene.mark([at.px, at.py])
  grader.event?.('pick', part.id)
  renderExplore()
}

function renderExplore() {
  const parts = lesson.parts ?? []
  const found = foundSet()
  $('#explore-count').textContent = `Đã tìm ${parts.filter((p) => found.has(p.id)).length}/${parts.length}`
  const info = $('#explore-info')
  info.innerHTML = selected
    ? `<h4>${selected.name}</h4><p>${selected.info}</p>${selected.block ? `<p class="explore-block">Điều khiển bằng: ${selected.block}</p>` : '<p class="explore-block muted">Không có khối lệnh.</p>'}`
    : '<p class="muted">Bấm một chấm cam trên mạch để xem bộ phận đó.</p>'
  $('#explore-list').replaceChildren(
    ...parts.map((p, i) => {
      const li = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      const ok = found.has(p.id)
      b.className = `${ok ? 'found' : ''}${p === selected ? ' sel' : ''}${p.under ? ' under' : ''}`
      b.innerHTML = `<i>${i + 1}</i>${ok ? p.name.split(' — ')[0] : p.under ? '? (dưới Core)' : '?'}`
      b.disabled = !ok
      b.addEventListener('click', () => pick(p))
      li.append(b)
      return li
    }),
  )
  for (const [id, els] of hotspots)
    for (const el of els) {
      el.classList.toggle('found', found.has(id))
      el.classList.toggle('sel', selected?.id === id)
    }
}

scene.onPick((px, py) => {
  if (lesson.flow !== 'explore') return
  let best: { part: Part; at: Part['at'][number]; d: number } | null = null
  for (const part of lesson.parts ?? []) {
    if (part.under && !seeing) continue
    for (const at of part.at) {
      // Khi nhìn xuyên Core, ưu tiên linh kiện bên dưới.
      const d = Math.hypot(at.px - px, at.py - py) * (seeing && part.under ? 0.6 : 1)
      if (d < 70 && (!best || d < best.d)) best = { part, at, d }
    }
  }
  if (best) pick(best.part, best.at)
})

// --- mở bài -----------------------------------------------------------------------------------
/** Nhãn số trên mạch theo ô của dải dòng chảy; ở bài 2, nhãn đèn đi theo đèn đang được ra lệnh. Bài 1: điểm bấm. */
function placeBadges() {
  scene.clearBadges()
  hotspots.clear()
  ;(lesson.parts ?? []).forEach((part, i) => {
    hotspots.set(
      part.id,
      part.at.map((at) => scene.addHotspot(at.px, at.py, at.label ?? `${i + 1}`, () => pick(part, at), part.under)),
    )
  })
  lesson.badges.forEach((p, i) => scene.addBadge(p === 'l1' && activeLed === 'L2' ? 'l2' : p, `${i + 1}`))
}

function openLesson(next: Lesson) {
  if (running) stop()
  // Sửa khối chưa kịp lưu (đang chờ 250 ms) thuộc về bài cũ: lưu ngay trước khi đổi bài.
  if (changeTimer) {
    window.clearTimeout(changeTimer)
    changeTimer = 0
    if (lesson.flow !== 'explore') mine().workspace = ScratchBlocks.serialization.workspaces.save(blocks.workspace)
  }
  lesson = next
  saved.current = next.id
  passed = new Set()
  lastRules = null
  rhythm.length = 0
  usedL2 = false
  activeLed = 'L1'
  grader = next.createGrader(onGrade)
  const explore = next.flow === 'explore'
  document.body.classList.toggle('mode-explore', explore)
  $('#blocks').hidden = explore
  $('#explore').hidden = !explore
  selected = null
  answered = {}
  scene.mark(null)
  scene.showWires(!explore)
  if (!explore) {
    blocks.setToolbox(next.toolbox)
    try {
      blocks.load(mine().workspace ?? next.starter)
    } catch (e) {
      console.warn('openLesson: bài đã lưu không đọc được, mở khung trống', next.id, e)
      mine().workspace = undefined
      blocks.load(next.starter)
    }
    blocks.resize()
  }
  card = Math.min(mine().card ?? 0, next.cards.length - 1)
  dots.replaceChildren(...next.cards.map(() => document.createElement('span')))
  placeBadges()
  buildFlow(next.flow)
  const controls = next.controls ?? []
  $('#hold').hidden = next.flow !== 'button'
  $('#power').hidden = !controls.includes('power')
  $('#sonar-wrap').hidden = !controls.includes('sonar')
  $('#pad').hidden = !controls.includes('pad')
  $('#reset-car').hidden = !next.arena
  $('#see').hidden = !!next.arena
  $('#rhythm').hidden = next.flow !== 'blink'
  scene.setProps(next.props ?? [])
  document.body.classList.toggle('mode-arena', !!next.arena)
  if (next.arena) {
    arena.setLayout(next.arena)
    car = arena.state()
  }
  for (const b of PS2_BUTTONS) pad[b] = false
  document.title = `ThingBot Sim · Bài ${next.no}: ${next.title}`
  // Địa chỉ luôn chỉ đúng bài đang mở (?bai=6) để giáo viên chép gửi cho học sinh.
  const url = new URL(location.href)
  url.searchParams.set('bai', String(next.no))
  history.replaceState(null, '', url)
  $('#hint').hidden = true
  renderPicker()
  renderCard()
  if (explore) {
    // Bộ phận đã tìm ở lần trước: chấm lại cho ✓ đúng.
    for (const id of mine().found ?? []) grader.event?.('pick', id)
    renderExplore()
  } else render(null, IDLE_BUS)
  if (next.arena) requestAnimationFrame(() => arena.draw())
}
// Link từ trang khóa học (?bai=6) mở thẳng bài đó; không có thì mở bài đang làm dở.
const asked = Number(new URLSearchParams(location.search).get('bai'))
openLesson(LESSONS.find((l) => l.no === asked) ?? LESSONS.find((l) => l.id === saved.current) ?? LESSONS[0])

const see = $('#see')
see.addEventListener('click', () => {
  const on = see.getAttribute('aria-pressed') !== 'true'
  see.setAttribute('aria-pressed', String(on))
  seeing = on
  scene.setSeeThrough(on)
})

// --- hộp thoại & thu phóng ------------------------------------------------------------------
const openDialog = (id: string) => {
  if (id === '#code-dialog') $('#arduino-code').textContent = blocks.arduinoCode()
  $<HTMLDialogElement>(id).showModal()
}
$('#show-code').addEventListener('click', () => openDialog('#code-dialog'))
$('#show-pins').addEventListener('click', () => openDialog('#pins-dialog'))
for (const d of document.querySelectorAll<HTMLDialogElement>('dialog')) {
  d.querySelector('.close')!.addEventListener('click', () => d.close())
  d.addEventListener('click', (e) => e.target === d && d.close())
}
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-zoom]')) {
  btn.addEventListener('click', () => scene.zoom(btn.dataset.zoom === 'in' ? 1.15 : 1 / 1.15))
}
