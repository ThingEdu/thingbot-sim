/**
 * Nối ba phần của bài: vùng khối (ThingBlock) → bộ mô phỏng (Web Worker) → mạch 3D + sơ đồ dòng chảy.
 */
import * as ScratchBlocks from '@scratch/scratch-blocks'
import type { Snapshot } from '@thingblock/thingblock-sim'
import { createBlocks, EXAMPLE, STARTER } from './blocks'
import { createFlow } from './flow'
import { createLesson, STEPS } from './lesson'
import { createScene } from './scene'
import type { Bus, Command, Message } from './sim-worker'
import SimWorker from './sim-worker?worker'

const SW_GPIO = 3
const L1_CHANNEL = 15
const STORE = 'thingbot-sim:v1'

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T

// --- lưu tiến độ (chỉ là tiện ích, hỏng thì bỏ qua) ----------------------------------------
const store = {
  get(): { done: string[]; workspace?: object } {
    try {
      return JSON.parse(localStorage.getItem(STORE) ?? '') as { done: string[]; workspace?: object }
    } catch {
      return { done: [] }
    }
  },
  set(value: { done: string[]; workspace?: object }) {
    try {
      localStorage.setItem(STORE, JSON.stringify(value))
    } catch {
      /* trình duyệt chặn lưu: vẫn chạy bình thường */
    }
  },
}
const saved = store.get()
const showProgress = () => {
  const n = new Set(saved.done).size
  $('#progress-count').textContent = `${n}/10`
  $('#progress-fill').style.width = `${n * 10}%`
}
showProgress()

// --- nhật ký ---------------------------------------------------------------------------------
const logEl = $('#log')
const log = (text: string, kind = '') => {
  const li = document.createElement('li')
  li.className = kind
  const t = new Date()
  li.innerHTML = `<time>${t.toLocaleTimeString('vi-VN', { hour12: false })}</time> ${text}`
  logEl.prepend(li)
  while (logEl.children.length > 30) logEl.lastChild!.remove()
}

// --- cảnh 3D & sơ đồ --------------------------------------------------------------------------
const scene = createScene($('#stage'), $('#tags'))
const flow = createFlow($('#flow') as unknown as SVGSVGElement)
const a = scene.anchors
scene.addTag('callout', a.core).textContent = 'ThingBot Core · ESP32-C3'
scene.addTag('callout', a.pca).textContent = 'PCA9685'
scene.addTag('callout callout-accent', a.sw).textContent = 'Nút SW · giữ để bấm'
scene.addTag('callout', a.l1).textContent = 'Đèn L1'
const tagIo3 = scene.addTag('wire', a.io3)
const tagI2c = scene.addTag('wire', a.i2c)
const tagCh15 = scene.addTag('wire', a.ch15)

// Khung cảnh thấp (máy tính bảng, màn hình nhỏ): tự ẩn tên linh kiện — sơ đồ dòng chảy đã có tên —
// trừ khi em tự bật/tắt bằng nút ⓘ.
let namesChosen = false
new ResizeObserver(() => {
  if (namesChosen) return
  const hide = $('#stage').clientHeight < 380
  $('#tags').classList.toggle('no-callouts', hide)
  $('[data-view="names"]').setAttribute('aria-pressed', String(!hide))
}).observe($('#stage'))
// Chừa chỗ cho thanh điều khiển góc nhìn ở mép dưới.
scene.setInset({ top: 12, right: 12, bottom: 54, left: 12 })

// --- khối ------------------------------------------------------------------------------------
const blocks = createBlocks($('#blocks'))
blocks.load(saved.workspace ?? STARTER)
const showCode = () => {
  $('#arduino-code').textContent = blocks.arduinoCode()
}
showCode()

// --- bài học ---------------------------------------------------------------------------------
const stepsEl = $('#steps')
STEPS.forEach((s) => {
  const li = document.createElement('li')
  li.dataset.step = s.id
  li.className = s.optional ? 'optional' : ''
  li.textContent = s.text
  stepsEl.appendChild(li)
})
const lesson = createLesson((passed, hint, done) => {
  for (const li of stepsEl.querySelectorAll('li')) li.classList.toggle('ok', passed.has(li.dataset.step!))
  const hintEl = $('#hint')
  const wasHidden = hintEl.hidden
  hintEl.hidden = !hint
  hintEl.textContent = hint ?? ''
  if (hint && wasHidden) hintEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  $('#done').hidden = !done
  if (done) $('#done').scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  if (done && !saved.done.includes('bai-3')) {
    saved.done.push('bai-3')
    store.set(saved)
    showProgress()
    log('✓ Bài 3 hoàn thành', 'ok')
  }
})

// --- mô phỏng --------------------------------------------------------------------------------
const worker = new SimWorker()
const send = (c: Command) => worker.postMessage(c)
let running = false
let pressed = false
let lastSnap: Snapshot | null = null
let lastDuty = 0
let lastPulse = { io3: 0, i2c: 0 }
let readsPerSec = 0

const statusEl = $('#status')
const runBtn = $('#run') as HTMLButtonElement
const setRunning = (on: boolean) => {
  running = on
  runBtn.textContent = on ? '■ Dừng' : '▶ Chạy'
  runBtn.classList.toggle('btn-stop', on)
  statusEl.textContent = on ? 'Đang chạy trên mạch ảo' : 'Đã dừng'
  statusEl.className = `status${on ? ' on' : ''}`
  if (!on) {
    blocks.highlight(undefined)
    render(null, { reads: {}, writes: {} })
  }
}

const start = () => {
  const { code, error } = blocks.simCode()
  if (error) {
    log(`Không chạy được: ${error}`, 'err')
    statusEl.textContent = error
    statusEl.className = 'status err'
    return
  }
  lesson.reset()
  send({ type: 'load', code })
  send({ type: 'input', key: `gpio${SW_GPIO}`, value: pressed ? 0 : 1 })
  send({ type: 'run' })
  setRunning(true)
}
const stop = () => {
  send({ type: 'stop' })
  setRunning(false)
}

runBtn.addEventListener('click', () => {
  if (running) {
    stop()
    log('■ Dừng chương trình')
  } else {
    start()
    log('▶ Chạy chương trình trên mạch ảo')
  }
})
const loadBlocks = (state: object, message: string) => {
  blocks.load(state)
  saved.workspace = state
  store.set(saved)
  showCode()
  log(message)
  if (running) start()
}
$('#example').addEventListener('click', () => loadBlocks(EXAMPLE, 'Đã nạp khối mẫu'))
$('#restart').addEventListener('click', () => loadBlocks(STARTER, 'Đã xoá về khung ban đầu'))

let changeTimer = 0
blocks.onChange(() => {
  window.clearTimeout(changeTimer)
  changeTimer = window.setTimeout(() => {
    showCode()
    saved.workspace = ScratchBlocks.serialization.workspaces.save(blocks.workspace)
    store.set(saved)
    // Khối đổi khi đang chạy: chạy lại ngay chương trình mới, như sửa mạch lúc đang cắm điện.
    if (running) start()
  }, 250)
})

// Nút SW
const setPressed = (p: boolean) => {
  if (p === pressed) return
  pressed = p
  scene.setSwitch(p)
  send({ type: 'input', key: `gpio${SW_GPIO}`, value: p ? 0 : 1 })
  log(p ? 'Nút SW: <b>bấm</b> → IO3 = LOW (0 V)' : 'Nút SW: <b>nhả</b> → IO3 = HIGH (3,3 V)')
  if (!running) render(lastSnap, { reads: {}, writes: {} })
}
scene.onSwitch(setPressed)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement) && document.activeElement?.closest('#blocks') == null) {
    e.preventDefault()
    setPressed(true)
  }
})
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') setPressed(false)
})

worker.onmessage = ({ data }: MessageEvent<Message>) => {
  if (data.type === 'error') {
    log(`Lỗi khi chạy: ${data.message}`, 'err')
    setRunning(false)
    return
  }
  if (!running) return
  const prevT = lastSnap?.t ?? 0
  const { snapshot, bus } = data
  const dt = (snapshot.t - prevT) / 1e6
  if (dt > 0 && prevT > 0) readsPerSec = readsPerSec * 0.8 + ((bus.reads[SW_GPIO] ?? 0) / dt) * 0.2
  lastSnap = snapshot
  if (snapshot.error) log(`Chương trình dừng: ${snapshot.error}`, 'err')
  if (!snapshot.running && snapshot.phase === 'halted') setRunning(false)
  blocks.highlight(snapshot.block)
  render(snapshot, bus)
}

function render(snap: Snapshot | null, bus: Bus) {
  const on = running && snap !== null
  const duty = on ? snap.pwm[L1_CHANNEL] : 0
  const reads = on ? (bus.reads[SW_GPIO] ?? 0) : 0
  const writes = on ? (bus.writes[L1_CHANNEL] ?? 0) : 0
  const pct = Math.round((Math.min(duty, 4095) / 4095) * 100)
  const now = performance.now()

  scene.setLed('L1', duty / 4096)
  const levelColor = pressed ? '#2f6fde' : '#e2473b'
  scene.setTrace('io3', on ? levelColor : null)
  scene.setTrace('sda', on && writes ? '#f0a020' : null)
  scene.setTrace('scl', on && writes ? '#f0a020' : null)
  scene.setTrace('ch15', on ? (pct > 0 ? '#e2473b' : '#2f6fde') : null)

  // Hạt dữ liệu: nút → não khi chương trình đọc nút; não → PCA → đèn khi chương trình ghi đèn.
  if (reads && now - lastPulse.io3 > 160) {
    scene.pulse('io3', levelColor)
    lastPulse.io3 = now
  }
  if (writes && now - lastPulse.i2c > 220) {
    scene.pulse('sda', '#f0a020')
    scene.pulse('scl', '#f0a020')
    window.setTimeout(() => running && scene.pulse('ch15', pct > 0 ? '#ff6a50' : '#5b8ff0'), 380)
    lastPulse.i2c = now
  }

  tagIo3.innerHTML = `<b>IO3</b> ${pressed ? 'LOW' : 'HIGH'}`
  tagIo3.className = `tag wire ${on ? (pressed ? 'lo' : 'hi') : 'idle'}`
  tagI2c.innerHTML = `<b>I2C</b> ${on && writes ? `→ ${Math.min(duty, 4095)}` : '—'}`
  tagI2c.className = `tag wire ${on && writes ? 'bus' : 'idle'}`
  tagCh15.innerHTML = `<b>PWM</b> ${pct} %`
  tagCh15.className = `tag wire ${on ? (pct > 0 ? 'hi' : 'lo') : 'idle'}`

  flow.update({
    running: on,
    pressed,
    switchValue: reads ? pressed : null,
    duty,
    readActive: reads > 0,
    writeActive: writes > 0,
  })
  $('#flow-rate').textContent =
    on && readsPerSec > 1 ? `não hỏi nút ≈ ${Math.round(readsPerSec).toLocaleString('vi-VN')} lần/giây` : ''

  if (on && duty !== lastDuty) {
    log(`Đèn L1: ${Math.round((Math.min(lastDuty, 4095) / 4095) * 100)} % → <b>${pct} %</b>`)
  }
  lastDuty = duty
  lesson.observe({ running: on, pressed, duty, now })
}
render(null, { reads: {}, writes: {} })

// --- tab & góc nhìn ---------------------------------------------------------------------------
for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab))
    document.querySelectorAll<HTMLElement>('.tab-body').forEach((b) => (b.hidden = b.dataset.body !== tab.dataset.tab))
  })
}
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  btn.addEventListener('click', () => {
    const v = btn.dataset.view
    if (v === 'left') scene.rotate(-Math.PI / 8)
    if (v === 'right') scene.rotate(Math.PI / 8)
    if (v === 'in') scene.zoom(1.15)
    if (v === 'out') scene.zoom(1 / 1.15)
    if (v === 'reset') scene.reset()
    if (v === 'names') {
      namesChosen = true
      const hidden = $('#tags').classList.toggle('no-callouts')
      btn.setAttribute('aria-pressed', String(!hidden))
    }
  })
}
log('Chào em! Ghép khối rồi bấm ▶ Chạy.')
