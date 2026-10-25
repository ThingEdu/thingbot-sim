/**
 * Bài 3, từng bước một như cột bài học của ThingBlock. Bước có luật chỉ được ✓ khi bộ mô phỏng thấy mạch
 * làm đúng — bấm Chạy không đủ. Mỗi lần chương trình đổi, kết quả chấm làm lại từ đầu.
 *
 * Bộ chấm `kiểm:` của ThingBlock chưa có luật "khi giữ SW thì…", nên spike tự chấm; về sau thay bằng
 * luật trong `bai.vi.md`.
 */
import type { PartName } from './scene'

export interface Observation {
  running: boolean
  pressed: boolean
  /** Chương trình vừa đọc nút SW. */
  readsSwitch: boolean
  /** Duty kênh L1, 0..4096. */
  duty: number
  /** Thời gian thực, ms. */
  now: number
}

type Check = 'build' | 'on' | 'off' | 'half'

export interface Card {
  title: string
  body: string
  check?: Check
  optional?: boolean
  /** Linh kiện có vòng sáng chú ý trên mạch. */
  look?: PartName[]
}

const ev = (t: string) => `<span class="chip ev">${t}</span>`
const ctrl = (t: string) => `<span class="chip ctrl">${t}</span>`
const tb = (t: string) => `<span class="chip tb">${t}</span>`

export const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p>Trên mạch ThingBot có <b>nút SW</b> (cạnh phải) và <b>đèn L1</b> (nằm sát mép dưới tấm Core, gần nút SW) — chỗ có vòng cam nhấp nháy.</p>
      <p>Bấm <b>👁 Dưới Core</b> để thấy những con chip nằm bên dưới.</p>
      <p>Hôm nay em làm cho <b>đèn sáng khi giữ nút, tắt khi nhả nút</b>.</p>`,
    look: ['sw', 'l1'],
  },
  {
    title: 'Ghép khối',
    body: `<ol class="todo">
        <li>Kéo ${ctrl('nếu … thì … nếu không thì')} vào trong ${ev('vòng lặp Arduino')}.</li>
        <li>Đặt ${tb('read switch')} vào ô hình lục giác.</li>
        <li>Đặt ${tb('set led 1 100')} vào chỗ <b>thì</b>, ${tb('set led 1 0')} vào chỗ <b>nếu không thì</b>.</li>
        <li>Bấm <b>▶ Chạy</b> ở trên mạch.</li>
      </ol>`,
    check: 'build',
  },
  {
    title: 'Giữ nút SW',
    body: `<p>Giữ chuột lên nút SW trên mạch, hoặc giữ nút <b>✋ Giữ SW</b>, hoặc giữ phím <kbd>Space</kbd>.</p>
      <p>Nhìn dải <b>1 → 4</b> dưới mạch: dữ liệu đi từ nút vào não, qua chip PCA9685 rồi tới đèn.</p>`,
    check: 'on',
    look: ['sw'],
  },
  {
    title: 'Nhả nút',
    body: `<p>Thả nút ra. Đèn L1 phải <b>tắt</b>.</p>
      <p>Để ý ô <b>2</b>: não hỏi nút liên tục hàng nghìn lần mỗi giây — vì vậy đèn đổi ngay khi em nhả.</p>`,
    check: 'off',
    look: ['l1'],
  },
  {
    title: 'Thử thách',
    body: `<p>Làm cho đèn chỉ <b>sáng một nửa</b> khi giữ nút: đổi số trong ${tb('set led 1 100')} thành <b>50</b>, rồi giữ nút.</p>
      <p>Ô <b>3</b> sẽ cho em thấy chip PCA9685 nhận con số nào.</p>`,
    check: 'half',
    optional: true,
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã cho <b>não</b> đọc nút và ra lệnh cho <b>chip PCA9685</b> bật tắt đèn.</p>
      <p>Muốn thử trên kit thật: mở ThingBlock, chọn bo ThingBot, ghép đúng các khối này rồi bấm <b>Nạp</b>.</p>`,
  },
]

const HOLD_MS = 250
const STUCK_MS = 1200

export function createLesson(onChange: (passed: ReadonlySet<Check>, hint: string | null) => void) {
  let passed = new Set<Check>()
  let hint: string | null = null
  let since = 0
  let lastKey = ''
  let pressedOnce = false

  const emit = () => onChange(passed, hint)
  const pass = (id: Check) => {
    if (passed.has(id)) return
    passed.add(id)
    hint = null
    emit()
  }

  return {
    /** Chương trình mới: chấm lại từ đầu. */
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
      if (o.readsSwitch) pass('build')
      if (o.pressed) pressedOnce = true
      const lit = o.duty > 0
      const key = `${o.pressed}:${o.duty}`
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
      if (!o.readsSwitch && held >= 1500) {
        next = 'Chương trình chưa hỏi nút SW. Em đã đặt khối «read switch» vào ô lục giác của «nếu … thì» chưa?'
      } else if (o.pressed && !lit && held >= STUCK_MS) {
        next = 'Giữ nút mà đèn chưa sáng? Khối «set led 1 …» ở chỗ «thì» cần độ sáng lớn hơn 0.'
      } else if (!o.pressed && lit && pressedOnce && held >= STUCK_MS) {
        next = passed.has('on')
          ? 'Nhả nút mà đèn vẫn sáng? Chương trình mới có lệnh BẬT. Dùng «nếu … thì … nếu không thì» và đặt «set led 1 0» vào chỗ «nếu không thì».'
          : 'Đèn sáng cả khi không bấm nút. Lệnh bật đèn cần nằm trong chỗ «thì».'
      }
      if (next !== hint) {
        hint = next
        emit()
      }
    },
  }
}
