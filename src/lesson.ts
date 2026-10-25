/**
 * Chấm bài 3 bằng chính bộ mô phỏng: ✓ chỉ khi đèn thật sự làm đúng lúc em giữ và nhả nút — bấm Chạy
 * không đủ. Mỗi lần chương trình đổi, kết quả chấm làm lại từ đầu.
 *
 * Bộ chấm của ThingBlock (`thingblock-sim/checker`, luật `kiểm:`) chưa có luật "khi giữ SW thì…"
 * chạy được ở đây; spike tự chấm ba bước, về sau thay bằng luật `kiểm:` trong `bai.vi.md`.
 */
export interface Observation {
  running: boolean
  pressed: boolean
  /** Duty kênh L1, 0..4096. */
  duty: number
  /** Thời gian thực, ms. */
  now: number
}

interface Step {
  id: string
  text: string
  optional?: boolean
}

export const STEPS: Step[] = [
  { id: 'run', text: 'Ghép khối vào «vòng lặp Arduino» rồi bấm ▶ Chạy.' },
  { id: 'on', text: 'Giữ nút SW: đèn L1 sáng.' },
  { id: 'off', text: 'Nhả nút SW: đèn L1 tắt.' },
  { id: 'half', text: 'Thử thách: khi giữ nút, đèn chỉ sáng một nửa (≈ 50 %).', optional: true },
]

const HOLD_MS = 250
const STUCK_MS = 1200

export function createLesson(onChange: (passed: Set<string>, hint: string | null, done: boolean) => void) {
  let passed = new Set<string>()
  let hint: string | null = null
  let since = 0
  let lastKey = ''
  let pressedOnce = false

  const emit = () => onChange(passed, hint, passed.has('on') && passed.has('off'))
  const pass = (id: string) => {
    if (passed.has(id)) return
    passed.add(id)
    hint = null
    emit()
  }

  return {
    reset() {
      passed = new Set()
      hint = null
      since = 0
      lastKey = ''
      pressedOnce = false
      emit()
    },
    observe(o: Observation) {
      if (!o.running) return
      pass('run')
      if (o.pressed) pressedOnce = true
      const lit = o.duty > 0
      const key = `${o.pressed}:${lit}:${o.duty}`
      if (key !== lastKey) {
        lastKey = key
        since = o.now
      }
      const held = o.now - since

      if (o.pressed && lit && held >= HOLD_MS) {
        pass('on')
        if (o.duty >= 1500 && o.duty <= 2600) pass('half')
      }
      if (!o.pressed && !lit && pressedOnce && passed.has('on') && held >= HOLD_MS) pass('off')

      let next: string | null = null
      if (o.pressed && !lit && held >= STUCK_MS) {
        next =
          'Giữ nút mà đèn chưa sáng? Khối «set led 1 …» phải nằm trong «nếu ‹read switch› thì», và độ sáng lớn hơn 0.'
      } else if (!o.pressed && lit && pressedOnce && held >= STUCK_MS) {
        next = passed.has('on')
          ? 'Nhả nút mà đèn vẫn sáng? Chương trình mới chỉ có lệnh BẬT. Thử khối «nếu … thì … nếu không thì» để thêm lệnh TẮT.'
          : 'Đèn sáng cả khi không bấm nút. Lệnh bật đèn cần nằm bên trong khối «nếu ‹read switch› thì».'
      } else if (!pressedOnce && passed.has('run') && held >= 2500) {
        next = 'Giờ hãy giữ chuột lên nút đỏ SW trên mạch (hoặc giữ phím Space).'
      }
      if (next !== hint) {
        hint = next
        emit()
      }
    },
  }
}
