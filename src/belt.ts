/**
 * Mắt hồng ngoại và dây chuyền phân loại (bài 6, bài 10).
 *
 * Mắt hồng ngoại: một module hồng ngoại phản xạ (cùng loại bốn mắt dưới gầm Cobot) cắm cổng cảm biến,
 * chân tín hiệu IO4, đọc bằng khối «read IR sensor 1 · IO4» → `analogRead(4)`, số 0…4095. Trong mô
 * phỏng: vật hắt lại càng nhiều tia hồng ngoại thì số càng lớn. Mắt hồng ngoại không thấy màu như mắt
 * người — nó chỉ thấy "hắt lại nhiều hay ít", nên các số dưới đây là độ hắt hồng ngoại ước lượng, không
 * phải số đo của một module cụ thể; trên robot thật trẻ đo rồi chọn ngưỡng (bài 6 dạy đúng việc đó).
 *
 * Dây chuyền (bài 10): động cơ M1 kéo băng chuyền, trứng chạy qua mắt hồng ngoại gắn ngay trên cần gạt
 * của servo S1. Lúc tâm quả trứng đi qua cần gạt: servo ≥ 45 độ thì trứng bị gạt xuống thùng loại, còn
 * lại đi tiếp vào thùng trứng tốt. Trứng tốt vỏ sáng, hắt nhiều; trứng hỏng (soi đèn thấy tối đục) hắt ít.
 */

export const IR_PIN = 4
/** Ngưỡng gợi ý: dưới số này là "tối". */
export const IR_DARK = 1500

export interface Ball {
  id: string
  name: string
  /** Màu vẽ; rỗng = không có bóng. */
  color: string
  /** Số mắt hồng ngoại đọc được, 0…4095. */
  ir: number
}

export const BALLS: Ball[] = [
  { id: 'none', name: 'Không có bóng', color: '', ir: 80 },
  { id: 'trang', name: 'Trắng', color: '#f4f2ea', ir: 3500 },
  { id: 'vang', name: 'Vàng', color: '#f2c230', ir: 3100 },
  { id: 'do', name: 'Đỏ', color: '#d23c3c', ir: 2300 },
  { id: 'xanh', name: 'Xanh dương', color: '#2d6fb8', ir: 1100 },
  { id: 'den', name: 'Đen', color: '#262626', ir: 300 },
]
export const ballById = (id: string) => BALLS.find((b) => b.id === id) ?? BALLS[0]

/** Số đọc của mặt băng chuyền cao su xám, trứng tốt, trứng hỏng. */
export const BELT_IR = 2600
export const GOOD_EGG_IR = 3300
export const BAD_EGG_IR = 900

/** Đơn vị: mm dọc băng chuyền. */
const LENGTH = 300
const GATE_X = 200
/** Mắt hồng ngoại ngay trước cần gạt, nên lúc trứng tới cần gạt mắt vẫn đang nhìn quả đó. */
const SENSOR_X = 196
const SENSE_HALF = 10
const SPACING = 50
const EGG_R = 11
/** Băng chuyền ở 100 % chạy 80 mm/s; dưới 15 % động cơ TT không thắng được ma sát. */
const SPEED_MM_S = 80
const DEAD_BAND = 0.15
/** Thứ tự trứng: T = tốt, H = hỏng. */
const PATTERN = 'TTHTHTTHTTTHHT'
/** Cần gạt hạ từ góc này trở lên thì trứng bị gạt xuống thùng loại. */
export const GATE_DEG = 45

export interface Egg {
  id: number
  x: number
  bad: boolean
  /** null: còn trên băng; `reject`: bị gạt xuống thùng loại; `pass`: vào thùng trứng tốt. */
  fate: null | 'reject' | 'pass'
  /** Thời gian rơi (s) để vẽ trứng đang lăn vào thùng. */
  fall: number
}

export interface BeltState {
  /** Quãng băng đã chạy, mm. */
  moved: number
  /** Trứng hỏng đã gạt đúng / trứng tốt đã cho qua đúng. */
  rejectedBad: number
  passedGood: number
  /** Gạt nhầm trứng tốt / để lọt trứng hỏng. */
  rejectedGood: number
  passedBad: number
  /** Kết quả các quả gần nhất, mới nhất cuối: true = đúng. */
  recent: boolean[]
  /** Số mắt hồng ngoại đang đọc. */
  ir: number
  /** Góc cần gạt đang dùng, độ. */
  gate: number
}

export interface BeltApi {
  reset(): void
  /** Một bước: tốc độ M1 −1…1 (đã tính công tắc nguồn), góc servo S1 (null = chưa có lệnh), dt giây. */
  step(motor: number, servoDeg: number | null, dt: number): BeltState
  state(): BeltState
  draw(): void
}

export function createBelt(host: HTMLElement): BeltApi {
  const canvas = document.createElement('canvas')
  canvas.className = 'belt'
  host.appendChild(canvas)
  const g = canvas.getContext('2d')!
  let eggs: Egg[] = []
  let next = 0
  let st: BeltState

  const addEgg = (x: number) => {
    eggs.push({ id: next, x, bad: PATTERN[next % PATTERN.length] === 'H', fate: null, fall: 0 })
    next++
  }
  const sense = () => {
    const under = eggs.find((e) => e.fate === null && Math.abs(e.x - SENSOR_X) <= SENSE_HALF)
    return under ? (under.bad ? BAD_EGG_IR : GOOD_EGG_IR) : BELT_IR
  }

  const api: BeltApi = {
    reset() {
      eggs = []
      next = 0
      // Ba quả nằm sẵn trên băng để không phải chờ lâu.
      for (const x of [140, 90, 40]) addEgg(x)
      st = { moved: 0, rejectedBad: 0, passedGood: 0, rejectedGood: 0, passedBad: 0, recent: [], ir: BELT_IR, gate: 0 }
      st.ir = sense()
    },
    step(motor, servoDeg, dt) {
      if (servoDeg !== null) st.gate = servoDeg
      const v = Math.abs(motor) < DEAD_BAND ? 0 : Math.max(0, motor) * SPEED_MM_S
      const dx = v * dt
      st.moved += dx
      for (const e of eggs) {
        if (e.fate !== null) {
          e.fall += dt
          continue
        }
        const before = e.x
        e.x += dx
        if (before < GATE_X && e.x >= GATE_X && st.gate >= GATE_DEG) {
          e.fate = 'reject'
          if (e.bad) st.rejectedBad++
          else st.rejectedGood++
          st.recent.push(e.bad)
        } else if (e.x >= LENGTH) {
          e.fate = 'pass'
          if (e.bad) st.passedBad++
          else st.passedGood++
          st.recent.push(!e.bad)
        }
      }
      if (st.recent.length > 12) st.recent.splice(0, st.recent.length - 12)
      eggs = eggs.filter((e) => e.fate === null || e.fall < 1.2)
      const last = eggs.filter((e) => e.fate === null).reduce((m, e) => Math.min(m, e.x), Infinity)
      if (last >= SPACING - EGG_R) addEgg(Math.min(0, last - SPACING))
      st.ir = sense()
      return api.state()
    },
    state: () => ({ ...st, recent: [...st.recent] }),
    draw() {
      const dpr = window.devicePixelRatio || 1
      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      if (!cw || !ch) return
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr)
        canvas.height = Math.round(ch * dpr)
      }
      const W = LENGTH + 70
      const H = 190
      const s = Math.min((cw - 24) / W, (ch - 24) / H)
      const ox = (cw - W * s) / 2 + 10 * s
      const oy = (ch - H * s) / 2
      const X = (mm: number) => ox + mm * s
      const Y = (mm: number) => oy + mm * s
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, cw, ch)
      g.fillStyle = '#fbf8f1'
      g.fillRect(0, 0, cw, ch)
      const beltY = 92
      // băng chuyền: dải cao su, vạch chạy theo quãng đã đi
      g.fillStyle = '#7b7f86'
      g.beginPath()
      g.roundRect(X(-8), Y(beltY), (LENGTH + 16) * s, 14 * s, 7 * s)
      g.fill()
      g.strokeStyle = '#9ea3ab'
      g.lineWidth = 1.5
      for (let m = -(st.moved % 20); m < LENGTH; m += 20) {
        g.beginPath()
        g.moveTo(X(m), Y(beltY + 2))
        g.lineTo(X(m + 6), Y(beltY + 12))
        g.stroke()
      }
      for (const cx of [-1, LENGTH + 1]) {
        g.fillStyle = '#f2c230'
        g.beginPath()
        g.arc(X(cx), Y(beltY + 7), 9 * s, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#555'
      g.font = `${Math.max(10, 11 * s)}px "Be Vietnam Pro", sans-serif`
      g.textAlign = 'center'
      g.textAlign = 'left'
      g.fillText('Động cơ M1', X(-10), Y(beltY + 32))
      g.textAlign = 'center'
      // thùng loại (dưới cần gạt) và thùng trứng tốt (cuối băng)
      const bin = (x: number, y: number, w: number, label: string, n: number, color: string) => {
        g.fillStyle = color
        g.fillRect(X(x), Y(y), w * s, 46 * s)
        g.fillStyle = '#fff'
        g.font = `bold ${Math.max(10, 12 * s)}px "Be Vietnam Pro", sans-serif`
        g.fillText(String(n), X(x + w / 2), Y(y + 28))
        g.fillStyle = '#3d3a35'
        g.font = `${Math.max(10, 11 * s)}px "Be Vietnam Pro", sans-serif`
        g.fillText(label, X(x + w / 2), Y(y + 60))
      }
      bin(GATE_X - 30, beltY + 36, 60, 'Thùng loại', st.rejectedBad + st.rejectedGood, '#b5523b')
      bin(LENGTH + 8, beltY + 36, 52, 'Trứng tốt', st.passedGood + st.passedBad, '#3f8a5a')
      // cần gạt servo S1 + mắt hồng ngoại
      const a = (Math.min(90, Math.max(0, st.gate)) * Math.PI) / 180
      const px = X(GATE_X + 26)
      const py = Y(beltY - 30)
      g.strokeStyle = '#2d6fb8'
      g.lineWidth = 5 * s
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(px - Math.cos(a) * 42 * s, py + Math.sin(a) * 42 * s)
      g.stroke()
      g.fillStyle = '#1e4f8c'
      g.fillRect(px - 9 * s, py - 12 * s, 18 * s, 14 * s)
      g.fillStyle = '#1e4f8c'
      g.font = `bold ${Math.max(10, 11 * s)}px "Be Vietnam Pro", sans-serif`
      g.textAlign = 'left'
      g.fillText(`Servo S1 ${Math.round(st.gate)}°`, px + 13 * s, py - 1 * s)
      g.textAlign = 'center'
      g.fillStyle = '#20232a'
      g.fillRect(X(SENSOR_X - 8), Y(beltY - 58), 16 * s, 12 * s)
      g.fillStyle = 'rgba(226,71,59,0.22)'
      g.beginPath()
      g.moveTo(X(SENSOR_X - 4), Y(beltY - 46))
      g.lineTo(X(SENSOR_X + 4), Y(beltY - 46))
      g.lineTo(X(SENSOR_X + SENSE_HALF), Y(beltY))
      g.lineTo(X(SENSOR_X - SENSE_HALF), Y(beltY))
      g.fill()
      g.fillStyle = '#3d3a35'
      g.fillText(`Mắt hồng ngoại IO4 = ${st.ir}`, X(SENSOR_X - 50), Y(beltY - 64))
      // trứng
      for (const e of eggs) {
        let x = e.x
        let y = beltY - EGG_R + 1
        if (e.fate === 'reject') {
          x = GATE_X + Math.min(e.fall, 0.4) * 10
          y += Math.min(1, e.fall / 0.5) * 70
        } else if (e.fate === 'pass') {
          x = LENGTH + 34
          y += Math.min(1, e.fall / 0.5) * 70
        }
        g.fillStyle = e.bad ? '#8a7a66' : '#f6ead5'
        g.strokeStyle = e.bad ? '#5b4e3f' : '#cdb894'
        g.lineWidth = 1.5
        g.beginPath()
        g.ellipse(X(x), Y(y), EGG_R * 0.8 * s, EGG_R * s, 0, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }
      const wrong = st.rejectedGood + st.passedBad
      g.textAlign = 'left'
      g.fillStyle = wrong ? '#b5523b' : '#3d3a35'
      g.font = `${Math.max(11, 12 * s)}px "Be Vietnam Pro", sans-serif`
      g.fillText(
        `Gạt đúng ${st.rejectedBad} trứng hỏng · cho qua ${st.passedGood} trứng tốt${wrong ? ` · nhầm ${wrong}` : ''}`,
        X(-8),
        Y(12),
      )
    },
  }
  api.reset()
  return api
}
