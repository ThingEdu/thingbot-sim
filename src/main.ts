/**
 * Nối ba phần của bài: cột bài học → vùng khối (ThingBlock) → bộ mô phỏng (Web Worker) → mạch 3D và
 * dải dòng chảy dưới mạch. Mỗi bài (thư mục `lessons/`) tự mang hộp khối, các bước và bộ chấm; file này
 * chỉ đổi bài và vẽ.
 */
import * as ScratchBlocks from '@scratch/scratch-blocks'
import type { Snapshot } from '@thingblock/thingblock-sim'
import type { RuleResult } from '@thingblock/thingblock-sim/checker'
import { createBlocks } from './blocks'
import { LESSONS, type Lesson } from './lessons'
import type { FlowKind, Grader } from './lessons/types'
import { createScene, type TraceName } from './scene'
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
const IDLE_BUS: Bus = { reads: {}, writes: {}, zeros: {}, ons: {}, loops: 0 }

// --- lưu tiến độ (chỉ là tiện ích; trình duyệt chặn lưu thì vẫn chạy) -------------------------
interface LessonSave {
  workspace?: object
  card?: number
}
interface Saved {
  done: string[]
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
      return { done: v.done ?? [], current: v.current, lessons }
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
      b.setAttribute('aria-current', String(l === lesson))
      b.classList.toggle('done', saved.done.includes(l.id))
      b.addEventListener('click', () => l !== lesson && openLesson(l))
      return b
    }),
  )
}

// --- dải dòng chảy ---------------------------------------------------------------------------
const FLOWS: Record<FlowKind, string[]> = {
  button: ['Nút SW', 'Não', 'Chip PCA', 'Đèn L1'],
  blink: ['Não', 'Chip PCA', 'Đèn L1'],
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
const lastPulse = { io3: 0, i2c: 0 }
let readsPerSec = 0

const runBtn = $<HTMLButtonElement>('#run')
const statusEl = $('#status')
const setRunning = (on: boolean) => {
  running = on
  runBtn.textContent = on ? '■ Dừng' : '▶ Chạy'
  runBtn.classList.toggle('stop', on)
  statusEl.textContent = on ? 'Đang chạy' : 'Đã dừng'
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
  send({ type: 'load', code, rules: lesson.rules })
  send({ type: 'input', key: `gpio${SW_GPIO}`, value: pressed ? 0 : 1 })
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
  loadBlocks(lesson.starter)
  grader.clear()
  card = 0
  renderCard()
})

let changeTimer = 0
blocks.onChange(() => {
  window.clearTimeout(changeTimer)
  changeTimer = window.setTimeout(() => {
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
  if (data.type === 'error') {
    statusEl.textContent = `Lỗi: ${data.message}`
    setRunning(false)
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
  if (snapshot.error) statusEl.textContent = `Chương trình dừng: ${snapshot.error}`
  if (!snapshot.running && snapshot.phase === 'halted') setRunning(false)
  blocks.highlight(snapshot.block)
  render(snapshot, bus)
}

const pctOf = (duty: number) => Math.round((Math.min(duty, 4095) / 4095) * 100)

function render(snap: Snapshot | null, bus: Bus) {
  const on = running && snap !== null
  const pwm = on ? snap.pwm : new Array<number>(16).fill(0)
  scene.setLed('L1', pwm[CH.L1] / 4096)
  scene.setLed('L2', pwm[CH.L2] / 4096)
  const readsSwitch = on && (bus.reads[SW_GPIO] ?? 0) > 0
  if (lesson.flow === 'button') renderButton(on, pwm, bus, readsSwitch)
  else renderBlink(snap, on, pwm, bus)
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

// --- mở bài -----------------------------------------------------------------------------------
/** Nhãn số trên mạch theo ô của dải dòng chảy; ở bài 2, nhãn đèn đi theo đèn đang được ra lệnh. */
function placeBadges() {
  scene.clearBadges()
  lesson.badges.forEach((p, i) => scene.addBadge(p === 'l1' && activeLed === 'L2' ? 'l2' : p, `${i + 1}`))
}

function openLesson(next: Lesson) {
  if (running) stop()
  lesson = next
  saved.current = next.id
  passed = new Set()
  lastRules = null
  rhythm.length = 0
  usedL2 = false
  activeLed = 'L1'
  grader = next.createGrader(onGrade)
  blocks.setToolbox(next.toolbox)
  blocks.load(mine().workspace ?? next.starter)
  card = Math.min(mine().card ?? 0, next.cards.length - 1)
  dots.replaceChildren(...next.cards.map(() => document.createElement('span')))
  placeBadges()
  buildFlow(next.flow)
  $('#hold').hidden = next.flow !== 'button'
  $('#rhythm').hidden = next.flow !== 'blink'
  document.title = `ThingBot Sim · Bài ${next.no}: ${next.title}`
  $('#hint').hidden = true
  renderPicker()
  renderCard()
  render(null, IDLE_BUS)
}
openLesson(LESSONS.find((l) => l.id === saved.current) ?? LESSONS[0])

const see = $('#see')
see.addEventListener('click', () => {
  const on = see.getAttribute('aria-pressed') !== 'true'
  see.setAttribute('aria-pressed', String(on))
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
