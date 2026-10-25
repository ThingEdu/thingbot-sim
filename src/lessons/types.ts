/**
 * Khuôn chung của một bài: hộp công cụ chỉ mở vài khối, khung khối ban đầu, lời giải mẫu, các bước học
 * và bộ chấm. Bộ chấm nhận một quan sát mỗi lần bộ mô phỏng gửi snapshot.
 */
import type { RuleResult } from '@thingblock/thingblock-sim/checker'
import type { PartName } from '../scene'

export interface Card {
  title: string
  body: string
  /** Mã của việc cần làm được; bước có `check` chỉ ✓ khi bộ chấm báo đạt. */
  check?: string
  optional?: boolean
  /** Linh kiện có vòng sáng chú ý trên mạch. */
  look?: PartName[]
}

export interface Observation {
  running: boolean
  pressed: boolean
  /** Chương trình vừa đọc nút SW. */
  readsSwitch: boolean
  /** Duty từng kênh PCA9685, 0..4096. */
  pwm: number[]
  /** Số lần ghi từng kênh qua I2C kể từ snapshot trước, và kênh nào vừa nhận lệnh tắt / lệnh bật. */
  writes: Record<number, number>
  zeros: Record<number, boolean>
  ons: Record<number, boolean>
  /** Kết quả luật `kiểm:` mới nhất (theo thứ tự `Lesson.rules`), hoặc null khi chưa chấm. */
  rules: RuleResult[] | null
  /** Thời gian ảo của bộ mô phỏng, µs. */
  t: number
  /** Thời gian thực, ms. */
  now: number
  /** Bước đang mở. */
  card: Card
}

export type GraderChange = (passed: ReadonlySet<string>, hint: string | null) => void

export interface Grader {
  /** Chương trình mới chạy lại. */
  restart(): void
  /** Học lại từ đầu: xoá mọi ✓. */
  clear(): void
  observe(o: Observation): void
  /** Việc trẻ làm ngoài bộ mô phỏng (bài 1): `pick` một linh kiện, `answer` một câu đố. */
  event?(type: 'pick' | 'answer', value: string): void
}

export type FlowKind = 'button' | 'blink' | 'explore'

export interface Lesson {
  id: string
  no: number
  title: string
  toolbox: object
  starter: object
  example: object
  cards: Card[]
  /** Luật `kiểm:` đúng cú pháp ThingBlock, chấm trong worker. */
  rules?: string[]
  /** Bài khám phá (không ghép khối): các linh kiện bấm được trên mạch. */
  parts?: Part[]
  /** Kiểu dải dòng chảy dưới mạch; `explore` là bài không code. */
  flow: FlowKind
  /** Nhãn số trên mạch, theo thứ tự ô của dải dòng chảy. */
  badges: PartName[]
  /** Bài coi là xong khi đạt các việc này. */
  done: string[]
  createGrader(onChange: GraderChange): Grader
}

export interface Part {
  id: string
  name: string
  /** Một hay nhiều chỗ trên mạch (px ảnh), kèm nhãn riêng nếu có (ví dụ "M3"). */
  at: { px: number; py: number; label?: string }[]
  /** Nằm dưới Core: chỉ bấm được khi nhìn xuyên Core. */
  under?: boolean
  /** Làm gì, nói cho trẻ (HTML). */
  info: string
  /** Khối ThingBlock điều khiển nó, nếu có (HTML chip). */
  block?: string
}
