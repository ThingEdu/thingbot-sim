/**
 * Nối ba phần của bài: cột bài học → vùng khối (ThingBlock) → bộ mô phỏng (Web Worker) → mạch 3D và
 * dải dòng chảy 1 → 4 dưới mạch.
 */
import * as ScratchBlocks from '@scratch/scratch-blocks'
import type { Snapshot } from '@thingblock/thingblock-sim'
import { createBlocks, EXAMPLE, STARTER } from './blocks'
import { CARDS, createLesson } from './lesson'
import { createScene } from './scene'
import type { Bus, Command, Message } from './sim-worker'
import SimWorker from './sim-worker?worker'

const SW_GPIO = 3
const L1_CHANNEL = 15
const STORE = 'thingbot-sim:v1'
const HI = '#e2473b'
const LO = '#2f6fde'
const BUS = '#e59612'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T

// --- lưu tiến độ (chỉ là tiện ích; trình duyệt chặn lưu thì vẫn chạy) -------------------------
interface Saved {
  done: string[]
  workspace?: object
  card?: number
}
const store = {
  get(): Saved {
    try {
      const v = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Saved>
      return { ...v, done: v.done ?? [] }
    } catch {
      return { done: [] }
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

// --- mạch ---------------------------------------------------------------------------------
const scene = createScene($('#stage'), $('#badges'))
;(['sw', 'esp', 'pca', 'l1'] as const).forEach((p, i) => scene.addBadge(p, `${i + 1}`))

// --- khối ---------------------------------------------------------------------------------
const blocks = createBlocks($('#blocks'))
blocks.load(saved.workspace ?? STARTER)
const showCode = () => {
  $('#arduino-code').textContent = blocks.arduinoCode()
}

// --- bài học từng bước --------------------------------------------------------------------
let card = Math.min(saved.card ?? 0, CARDS.length - 1)
let passed: ReadonlySet<string> = new Set()
const dots = $('#dots')
CARDS.forEach(() => dots.appendChild(document.createElement('span')))

const renderCard = () => {
  const c = CARDS[card]
  $('#step-no').textContent = `Bước ${card + 1}/${CARDS.length}${c.optional ? ' · không bắt buộc' : ''}`
  $('#step-title').textContent = c.title
  $('#step-body').innerHTML = c.body
  const ok = c.check ? passed.has(c.check) : false
  const status = $('#step-status')
  status.hidden = !c.check
  status.className = `step-status${ok ? ' ok' : ''}`
  status.textContent = ok ? '✓ Làm được rồi!' : 'Đang chờ em làm…'
  ;[...dots.children].forEach((d, i) => {
    const check = CARDS[i].check
    d.className = `${i === card ? 'now' : ''}${check && passed.has(check) ? ' ok' : ''}`
  })
  ;($('#prev') as HTMLButtonElement).disabled = card === 0
  const next = $('#next') as HTMLButtonElement
  next.disabled = card === CARDS.length - 1
  next.classList.toggle('ready', ok || !c.check)
  scene.highlight(c.look ?? [])
  saved.card = card
  store.set(saved)
}
const lesson = createLesson((p, hint) => {
  passed = p
  const hintEl = $('#hint')
  hintEl.hidden = !hint
  hintEl.textContent = hint ?? ''
  if (p.has('on') && p.has('off') && !saved.done.includes('bai-3')) {
    saved.done.push('bai-3')
    showProgress()
  }
  renderCard()
})
$('#prev').addEventListener('click', () => {
  card = Math.max(0, card - 1)
  renderCard()
})
$('#next').addEventListener('click', () => {
  card = Math.min(CARDS.length - 1, card + 1)
  renderCard()
})
renderCard()

// --- mô phỏng -----------------------------------------------------------------------------
const worker = new SimWorker()
const send = (c: Command) => worker.postMessage(c)
let running = false
let pressed = false
let lastSnap: Snapshot | null = null
let lastPulse = { io3: 0, i2c: 0 }
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
    render(null, { reads: {}, writes: {} })
  }
}

const start = () => {
  const { code, error } = blocks.simCode()
  if (error) {
    statusEl.textContent = error
    statusEl.classList.remove('on')
    return
  }
  lesson.reset()
  lastSnap = null
  send({ type: 'load', code })
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
  saved.workspace = state
  store.set(saved)
  if (running) start()
}
$('#example').addEventListener('click', () => loadBlocks(EXAMPLE))
$('#restart').addEventListener('click', () => {
  loadBlocks(STARTER)
  card = 0
  renderCard()
})

let changeTimer = 0
blocks.onChange(() => {
  window.clearTimeout(changeTimer)
  changeTimer = window.setTimeout(() => {
    saved.workspace = ScratchBlocks.serialization.workspaces.save(blocks.workspace)
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
  if (!running) render(null, { reads: {}, writes: {} })
}
scene.onSwitch(setPressed)
const hold = $('#hold')
hold.addEventListener('pointerdown', (e) => {
  hold.setPointerCapture(e.pointerId)
  setPressed(true)
})
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) hold.addEventListener(type, () => setPressed(false))
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return
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
  const { snapshot, bus } = data
  const dt = lastSnap ? (snapshot.t - lastSnap.t) / 1e6 : 0
  if (dt > 0) readsPerSec = readsPerSec ? readsPerSec * 0.8 + ((bus.reads[SW_GPIO] ?? 0) / dt) * 0.2 : (bus.reads[SW_GPIO] ?? 0) / dt
  lastSnap = snapshot
  if (snapshot.error) statusEl.textContent = `Chương trình dừng: ${snapshot.error}`
  if (!snapshot.running && snapshot.phase === 'halted') setRunning(false)
  blocks.highlight(snapshot.block)
  render(snapshot, bus)
}

const setFlow = (id: string, value: string, tech: string, state: string) => {
  const li = $(`#${id}`)
  li.className = state
  li.querySelector('.v')!.textContent = value
  li.querySelector('.t')!.textContent = tech
}

function render(snap: Snapshot | null, bus: Bus) {
  const on = running && snap !== null
  const duty = on ? snap.pwm[L1_CHANNEL] : 0
  const reads = on && (bus.reads[SW_GPIO] ?? 0) > 0
  const writes = on && (bus.writes[L1_CHANNEL] ?? 0) > 0
  const pct = Math.round((Math.min(duty, 4095) / 4095) * 100)
  const now = performance.now()
  const level = pressed ? LO : HI

  scene.setLed('L1', duty / 4096)
  scene.setTrace('io3', on ? level : null)
  scene.setTrace('sda', writes ? BUS : null)
  scene.setTrace('scl', writes ? BUS : null)
  scene.setTrace('ch15', on ? (pct > 0 ? HI : LO) : null)
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

  setFlow('f1', pressed ? 'Đang bấm' : 'Không bấm', `IO3 ${pressed ? 'LOW\u00a00\u00a0V' : 'HIGH\u00a03,3\u00a0V'}`, pressed ? 'lo' : '')
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

  lesson.observe({ running: on, pressed, readsSwitch: reads, duty, now })
}
render(null, { reads: {}, writes: {} })

const see = $('#see')
see.addEventListener('click', () => {
  const on = see.getAttribute('aria-pressed') !== 'true'
  see.setAttribute('aria-pressed', String(on))
  scene.setSeeThrough(on)
})

// --- hộp thoại & thu phóng ------------------------------------------------------------------
const openDialog = (id: string) => {
  if (id === '#code-dialog') showCode()
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
