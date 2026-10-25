/**
 * Sàn chạy xe nhìn từ trên xuống (bài 8–10): xe ThingBot hai bánh, M1 bánh trái, M2 bánh phải — đấu
 * nối của khoá ThingBlock trên robot.edu.vn. Mỗi khung hình, tốc độ hai bánh lấy từ duty PCA9685 mà
 * chương trình đặt; xe chạy theo mô hình hai bánh vi sai, vẽ vệt đường đi, chạm tường thì dừng và đếm
 * va chạm. Cảm biến siêu âm ở mũi xe đo tới vật gần nhất theo hướng xe chạy.
 *
 * Đơn vị: cm, góc theo radian (0 = hướng sang phải, tăng theo chiều kim đồng hồ trên màn hình).
 */

export interface Wall {
  x: number
  y: number
  w: number
  h: number
}

export interface ArenaLayout {
  width: number
  height: number
  start: { x: number; y: number; heading: number }
  walls: Wall[]
}

export interface CarState {
  x: number
  y: number
  heading: number
  /** Quãng đường đã đi từ lúc chạy, cm. */
  travelled: number
  /** Tổng góc đã xoay (giá trị tuyệt đối cộng dồn), độ. */
  turned: number
  /** Số lần đâm vào tường/vật cản. */
  bumps: number
  /** Đang đè vào vật cản. */
  touching: boolean
  /** Tốc độ thật của bánh trái/phải, -1..1 (đuổi theo lệnh, có quán tính). */
  left: number
  right: number
  /** Khoảng cách siêu âm đo được, cm (tối đa SONAR_MAX). */
  sonar: number
}

/** Tốc độ xe ở 100 %: động cơ TT + bánh 65 mm chạy pin 2 × 18650. */
const SPEED_CM_S = 60
/** Khoảng cách hai bánh, cm. */
const TRACK_CM = 13
/** Dưới mức này động cơ TT không thắng được ma sát. */
const DEAD_BAND = 0.15
const CAR_R = 9
/** Quán tính: tốc độ bánh đuổi theo lệnh với hằng số thời gian này (s) — xe cần quãng phanh. */
const LAG_S = 0.2
/** Chỉ trượt dọc vật khi phần đi tiếp được ≥ tỉ lệ này của bước (chạm xiên); đâm thẳng thì dừng. */
const SLIDE_MIN = 0.5
export const SONAR_MAX = 400

export const OPEN_FLOOR: ArenaLayout = {
  width: 300,
  height: 200,
  start: { x: 60, y: 100, heading: 0 },
  walls: [],
}

export const OBSTACLE_COURSE: ArenaLayout = {
  width: 300,
  height: 200,
  start: { x: 40, y: 100, heading: 0 },
  walls: [
    { x: 120, y: 70, w: 22, h: 60 },
    { x: 200, y: 0, w: 20, h: 60 },
    { x: 205, y: 140, w: 40, h: 22 },
    { x: 60, y: 165, w: 40, h: 35 },
  ],
}

export interface ArenaApi {
  canvas: HTMLCanvasElement
  setLayout(layout: ArenaLayout): void
  reset(): void
  /** Chạy một bước: left/right là tốc độ bánh -1..1, dt giây. */
  step(left: number, right: number, dt: number): CarState
  state(): CarState
  draw(note?: string): void
}

export function createArena(host: HTMLElement): ArenaApi {
  const canvas = document.createElement('canvas')
  canvas.className = 'arena'
  host.appendChild(canvas)
  const g = canvas.getContext('2d')!
  let layout = OPEN_FLOOR
  let car: CarState
  let trail: [number, number][] = []

  const borders = (): Wall[] => [
    { x: -20, y: -20, w: layout.width + 40, h: 20 },
    { x: -20, y: layout.height, w: layout.width + 40, h: 20 },
    { x: -20, y: 0, w: 20, h: layout.height },
    { x: layout.width, y: 0, w: 20, h: layout.height },
  ]
  const solids = () => [...borders(), ...layout.walls]
  /** Thân xe (tròn bán kính CAR_R) chạm vật: khoảng cách từ tâm xe tới điểm gần nhất của hình chữ nhật. */
  const hits = (x: number, y: number) =>
    solids().some((w) => {
      const dx = Math.max(w.x - x, 0, x - (w.x + w.w))
      const dy = Math.max(w.y - y, 0, y - (w.y + w.h))
      return dx * dx + dy * dy < CAR_R * CAR_R
    })

  /** Sóng siêu âm toả hình nón (HC-SR04 khoảng ±15°): lấy vật gần nhất trong 5 tia của nón. */
  const sonar = (x: number, y: number, heading: number) =>
    Math.min(...[-15, -7, 0, 7, 15].map((deg) => ray(x, y, heading, heading + (deg * Math.PI) / 180)))

  /** Tia từ mũi xe theo hướng `dir` tới mặt vật gần nhất. */
  const ray = (x: number, y: number, heading: number, dir: number) => {
    const dx = Math.cos(dir)
    const dy = Math.sin(dir)
    const ox = x + Math.cos(heading) * CAR_R
    const oy = y + Math.sin(heading) * CAR_R
    let best = SONAR_MAX
    for (const w of solids()) {
      // giao tia với hình chữ nhật (phương pháp slab)
      let t0 = 0
      let t1 = SONAR_MAX
      for (const [o, d, lo, hi] of [
        [ox, dx, w.x, w.x + w.w],
        [oy, dy, w.y, w.y + w.h],
      ]) {
        if (Math.abs(d) < 1e-9) {
          if (o < lo || o > hi) t0 = Infinity
          continue
        }
        let a = (lo - o) / d
        let b = (hi - o) / d
        if (a > b) [a, b] = [b, a]
        t0 = Math.max(t0, a)
        t1 = Math.min(t1, b)
      }
      if (t0 <= t1 && t0 < best) best = t0
    }
    return best
  }

  const reset = () => {
    const { x, y, heading } = layout.start
    car = { x, y, heading, travelled: 0, turned: 0, bumps: 0, touching: false, left: 0, right: 0, sonar: sonar(x, y, heading) }
    trail = [[x, y]]
  }
  reset()

  const wheel = (v: number) => (Math.abs(v) < DEAD_BAND ? 0 : v)

  const api: ArenaApi = {
    canvas,
    setLayout(next) {
      layout = next
      reset()
    },
    reset,
    step(left, right, dt) {
      const k = dt > 0 ? 1 - Math.exp(-dt / LAG_S) : 0
      car.left += (wheel(left) - car.left) * k
      car.right += (wheel(right) - car.right) * k
      if (Math.abs(car.left) < 0.01 && wheel(left) === 0) car.left = 0
      if (Math.abs(car.right) < 0.01 && wheel(right) === 0) car.right = 0
      const vl = car.left * SPEED_CM_S
      const vr = car.right * SPEED_CM_S
      const v = (vl + vr) / 2
      // y hướng xuống: bánh trái nhanh hơn thì xe rẽ phải, góc tăng (theo chiều kim đồng hồ)
      const w = (vl - vr) / TRACK_CM
      // chia nhỏ bước để xe không xuyên tường khi khung hình chậm
      const n = Math.max(1, Math.ceil((Math.abs(v) * dt) / 2))
      let touching = false
      for (let i = 0; i < n; i++) {
        const h = car.heading + (w * dt) / n
        const nx = car.x + Math.cos(h) * ((v * dt) / n)
        const ny = car.y + Math.sin(h) * ((v * dt) / n)
        car.turned += Math.abs((w * dt) / n) * (180 / Math.PI)
        car.heading = h
        let tx = nx
        let ty = ny
        if (hits(tx, ty)) {
          // Quệt xiên thì trượt dọc mặt vật (như xe thật); đâm thẳng hay bị chặn cả hai hướng là đâm.
          const step = Math.hypot(nx - car.x, ny - car.y)
          if (!hits(nx, car.y) && Math.abs(nx - car.x) >= step * SLIDE_MIN) ty = car.y
          else if (!hits(car.x, ny) && Math.abs(ny - car.y) >= step * SLIDE_MIN) tx = car.x
          else {
            touching = true
            continue
          }
        }
        car.travelled += Math.hypot(tx - car.x, ty - car.y)
        car.x = tx
        car.y = ty
      }
      if (touching && !car.touching) car.bumps++
      car.touching = touching
      car.sonar = sonar(car.x, car.y, car.heading)
      const last = trail[trail.length - 1]
      if (Math.hypot(last[0] - car.x, last[1] - car.y) > 1.5) trail.push([car.x, car.y])
      if (trail.length > 4000) trail.shift()
      return { ...car }
    },
    state: () => ({ ...car }),
    draw(note) {
      const dpr = window.devicePixelRatio || 1
      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      if (!cw || !ch) return
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr)
        canvas.height = Math.round(ch * dpr)
      }
      const pad = 14
      const s = Math.min((cw - pad * 2) / layout.width, (ch - pad * 2 - 18) / layout.height)
      const ox = (cw - layout.width * s) / 2
      const oy = pad + 18
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, cw, ch)
      // sàn + lưới 20 cm
      g.fillStyle = '#fbf8f1'
      g.fillRect(ox, oy, layout.width * s, layout.height * s)
      g.strokeStyle = '#e8e0cf'
      g.lineWidth = 1
      for (let x = 0; x <= layout.width; x += 20) {
        g.beginPath()
        g.moveTo(ox + x * s + 0.5, oy)
        g.lineTo(ox + x * s + 0.5, oy + layout.height * s)
        g.stroke()
      }
      for (let y = 0; y <= layout.height; y += 20) {
        g.beginPath()
        g.moveTo(ox, oy + y * s + 0.5)
        g.lineTo(ox + layout.width * s, oy + y * s + 0.5)
        g.stroke()
      }
      g.strokeStyle = '#8c7b5e'
      g.lineWidth = 3
      g.strokeRect(ox, oy, layout.width * s, layout.height * s)
      g.fillStyle = '#b07a4f'
      for (const w of layout.walls) g.fillRect(ox + w.x * s, oy + w.y * s, w.w * s, w.h * s)
      // vạch xuất phát
      g.fillStyle = 'rgba(15,139,141,0.18)'
      g.beginPath()
      g.arc(ox + layout.start.x * s, oy + layout.start.y * s, CAR_R * 1.6 * s, 0, Math.PI * 2)
      g.fill()
      // vệt đường đi
      g.strokeStyle = '#0f8b8d'
      g.lineWidth = 2
      g.beginPath()
      trail.forEach(([x, y], i) => (i ? g.lineTo(ox + x * s, oy + y * s) : g.moveTo(ox + x * s, oy + y * s)))
      g.stroke()
      // tia siêu âm
      const near = car.sonar < 25
      g.strokeStyle = near ? 'rgba(226,71,59,0.7)' : 'rgba(47,111,222,0.45)'
      g.setLineDash([5, 4])
      g.lineWidth = 1.5
      const fx = car.x + Math.cos(car.heading) * CAR_R
      const fy = car.y + Math.sin(car.heading) * CAR_R
      const d = Math.min(car.sonar, SONAR_MAX)
      g.beginPath()
      g.moveTo(ox + fx * s, oy + fy * s)
      g.lineTo(ox + (fx + Math.cos(car.heading) * d) * s, oy + (fy + Math.sin(car.heading) * d) * s)
      g.stroke()
      g.setLineDash([])
      // xe
      g.save()
      g.translate(ox + car.x * s, oy + car.y * s)
      g.rotate(car.heading)
      g.scale(s, s)
      g.fillStyle = '#222'
      g.fillRect(-5, -9.5, 10, 3.2) // bánh trái (M1)
      g.fillRect(-5, 6.3, 10, 3.2) // bánh phải (M2)
      g.fillStyle = car.touching ? '#e2473b' : '#1f7a4a'
      g.beginPath()
      g.roundRect(-8, -6.5, 15, 13, 2.5)
      g.fill()
      g.fillStyle = '#c9ced6'
      g.fillRect(7, -4, 2.5, 8) // cảm biến siêu âm
      g.fillStyle = '#fff'
      g.font = 'bold 3.2px sans-serif'
      g.textAlign = 'center'
      g.fillText('M1', 0, -10.5)
      g.fillText('M2', 0, 13.4)
      g.restore()
      // chú thích
      g.fillStyle = '#776f62'
      g.font = '12px "Be Vietnam Pro", sans-serif'
      g.textAlign = 'left'
      g.fillText(note ?? `Sàn ${layout.width / 100} m × ${layout.height / 100} m · ô lưới 20 cm`, ox, oy - 6)
    },
  }
  return api
}
