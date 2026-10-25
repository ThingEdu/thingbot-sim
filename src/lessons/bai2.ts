/**
 * Bài 2 — Đèn nhấp nháy: bật, chờ, tắt, chờ trong **vòng lặp Arduino**. Cùng nội dung và cùng luật
 * `kiểm:` với bài "Đèn nhấp nháy" của ThingBlock (`thingblock-resource/src/tutorials/den-nhap-nhay`),
 * chấm bằng đúng bộ chấm của ThingBlock trong worker.
 *
 * Bộ chấm ThingBlock chỉ nói đèn đã chớp đúng nhịp hay chưa. Phần gợi ý ở đây đọc thêm hoạt động trên
 * bus để chỉ ra năm lỗi hay gặp: vòng lặp trống, khối nằm nhầm trong "khởi động", thiếu lệnh tắt, và
 * thiếu khối chờ sau lệnh bật hoặc lệnh tắt (đèn đổi trong chớp mắt nên mắt không thấy).
 *
 * Luật nhấp nháy của ThingBlock đếm lần bật/tắt trong nhật ký, không đo đèn tắt bao lâu: "bật, đợi 0.25,
 * tắt" (thiếu đợi sau lệnh tắt) vẫn đạt "chu kỳ 0,5 giây" dù mắt chỉ thấy đèn sáng mãi. Vì vậy ở đây
 * một luật chỉ được ✓ khi đèn còn sáng và tắt mỗi thứ ít nhất VISIBLE thời gian quan sát.
 */
import { B, ctrl, ev, hat, program, setLed, STARTER, tb, toolbox, wait } from './state'
import type { Card, Grader, GraderChange, Lesson, Observation } from './types'

const R_1S = 'L1 nhấp nháy, chu kỳ 1 giây ± 20%'
const R_HALF = 'L1 nhấp nháy, chu kỳ 0,5 giây ± 20%'
const R_L2 = 'L2 nhấp nháy, chu kỳ 1 giây ± 20%'
const RULES = [R_1S, R_HALF, R_L2]

const CHANNEL = { L1: 15, L2: 13 } as const

const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p>Hôm nay em làm cho <b>đèn L1</b> (chỗ vòng cam) <b>chớp</b>: sáng nửa giây, tắt nửa giây, rồi cứ thế mãi.</p>
      <p>Bí mật nằm ở khối ${ev('vòng lặp Arduino')}: nó chạy các khối bên trong <b>từ trên xuống dưới</b>, hết thì <b>quay lại đầu</b> — mãi mãi. Vì vậy em không cần thêm khối lặp nào khác.</p>`,
    look: ['l1'],
  },
  {
    title: 'Bật rồi tắt',
    body: `<p>Bên trong ${ev('vòng lặp Arduino')}, xếp lần lượt:</p>
      <ol class="todo">
        <li>${tb('set led 1 100')}</li>
        <li>${ctrl('đợi 0.5 giây')}</li>
        <li>${tb('set led 1 0')}</li>
        <li>${ctrl('đợi 0.5 giây')}</li>
      </ol>
      <p>Bấm <b>▶ Chạy</b> và chờ vài giây để mạch đếm được 3 lần chớp.</p>
      <p class="muted">Khối ${ctrl('đợi … giây')} ở nhóm Điều khiển màu cam. Bấm vào ô số để đổi 1 thành 0.5.</p>`,
    check: R_1S,
    look: ['l1'],
  },
  {
    title: 'Nhìn nhịp đèn',
    body: `<p>Dải <b>Nhịp đèn</b> dưới mạch vẽ lại đèn L1 trong 4 giây vừa qua: đoạn đỏ là lúc sáng.</p>
      <p>Ô <b>1 · Não</b> đếm số vòng. Mỗi vòng là 4 khối của em chạy một lượt — để ý khối đang chạy sáng lên trong vùng khối.</p>`,
  },
  {
    title: 'Chớp nhanh gấp đôi',
    body: `<p>Đổi <b>cả hai</b> ô ${ctrl('đợi')} thành <b>0.25</b>.</p>
      <p>Đèn sẽ chớp nhanh gấp đôi: các vạch đỏ trên dải nhịp sát nhau hơn.</p>`,
    check: R_HALF,
  },
  {
    title: 'Thử thách',
    body: `<p>Cho <b>đèn L2</b> (đèn xanh lá, mép trái dưới Core) chớp, mỗi lần chớp 1 giây.</p>
      <p>Bấm mũi tên ▾ trong khối ${tb('set led 1 …')} để chọn đèn <b>2</b>.</p>
      <p class="muted">Muốn khó hơn: cho L1 và L2 thay nhau chớp như đèn xe cứu hoả.</p>`,
    check: R_L2,
    optional: true,
    look: ['l2'],
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã dùng ${ev('vòng lặp Arduino')} để não lặp lại mãi một việc, và dùng ${ctrl('đợi')} để đặt nhịp.</p>
      <p>Muốn thử trên kit thật: mở ThingBlock, chọn bo ThingBot, ghép đúng các khối này rồi bấm <b>Nạp</b>.</p>`,
  },
]

/** Cửa sổ quan sát cho gợi ý (thời gian ảo, µs). */
const WINDOW = 3_000_000
/** Lời của bộ chấm ThingBlock chỉ hiện khi đã đủ thời gian đo (cửa sổ chấm của ThingBlock là 5 giây). */
const RULE_AFTER = 5_000_000
/** Phần thời gian tối thiểu đèn phải sáng, và phải tắt, để mắt kịp thấy chớp. */
const VISIBLE = 0.1
/** Dưới mức này coi như đèn chỉ đổi "trong chớp mắt". */
const BLINK_OF_EYE = 0.05

interface Sample {
  t: number
  /** Duty theo kênh PCA9685. */
  duty: Record<number, number>
  wrote: boolean
  zero: boolean
  on: boolean
}

const ledOf = (rule: string | undefined) => (rule?.startsWith('L2') ? 'L2' : 'L1')

function createGrader(onChange: GraderChange): Grader {
  let passed = new Set<string>()
  let hint: string | null = null
  let samples: Sample[] = []
  let start = -1

  const emit = () => onChange(passed, hint)
  const setHint = (next: string | null) => {
    if (next === hint) return
    hint = next
    emit()
  }

  /** Phần thời gian (theo mẫu) kênh `ch` đang sáng trong cửa sổ quan sát. */
  const onShare = (ch: number) => (samples.length ? samples.filter((s) => s.duty[ch] > 0).length / samples.length : 0)

  const hintFor = (o: Observation): string | null => {
    const rule = o.card.check
    if (!rule || passed.has(rule)) return null
    const elapsed = o.t - start
    if (elapsed < WINDOW) return null
    const led = ledOf(rule)
    const other = led === 'L2' ? 'L1' : 'L2'
    const n = led === 'L2' ? '2' : '1'
    const lit = onShare(CHANNEL[led])
    const otherLit = onShare(CHANNEL[other])
    const wrote = samples.some((s) => s.wrote)
    const zero = samples.some((s) => s.zero)
    const on = samples.some((s) => s.on)

    if (lit === 0 && otherLit > 0 && otherLit < 1)
      return `Đèn ${other} đang chớp. Bước này cần đèn ${led}: bấm ▾ trong khối «set led» và chọn ${n}.`
    if (!wrote && lit === 0) return 'Vòng lặp Arduino còn trống? Kéo các khối «set led» và «đợi» vào bên trong nó.'
    if (!wrote && lit > 0)
      return 'Đèn sáng mãi vì lệnh chỉ chạy một lần: khối trong «khi Arduino khởi động» chạy một lần thôi. Chuyển các khối sang «vòng lặp Arduino».'
    if (lit > 0 && !zero) return `Đèn sáng mãi: vòng lặp chưa có lệnh tắt. Thêm «set led ${n} 0».`
    if (zero && 1 - lit < BLINK_OF_EYE)
      return `Đèn có tắt, nhưng chỉ trong chớp mắt nên em không thấy. Thêm «đợi» ngay sau «set led ${n} 0».`
    if (on && lit < BLINK_OF_EYE)
      return `Đèn có bật, nhưng chỉ trong chớp mắt nên em không thấy. Thêm «đợi» ngay sau «set led ${n} 100».`
    if (lit === 0) return `Đèn ${led} chưa sáng. Khối «set led ${n} …» cần độ sáng lớn hơn 0.`
    const result = o.rules?.[RULES.indexOf(rule)]
    if (result && !result.ok && elapsed >= RULE_AFTER) return result.message
    return null
  }

  return {
    // Bài 2: các bước sau đổi chính chương trình đã đạt ở bước trước, nên ✓ giữ nguyên khi chạy lại.
    restart() {
      samples = []
      start = -1
      setHint(null)
    },
    clear() {
      passed = new Set()
      samples = []
      start = -1
      hint = null
      emit()
    },
    observe(o) {
      if (!o.running) return
      if (start < 0) start = o.t
      const led = CHANNEL[ledOf(o.card.check)]
      samples.push({
        t: o.t,
        duty: { [CHANNEL.L1]: o.pwm[CHANNEL.L1], [CHANNEL.L2]: o.pwm[CHANNEL.L2] },
        wrote: (o.writes[led] ?? 0) > 0,
        zero: Boolean(o.zeros[led]),
        on: Boolean(o.ons[led]),
      })
      while (samples.length && samples[0].t < o.t - WINDOW) samples.shift()
      o.rules?.forEach((r, i) => {
        const rule = RULES[i]
        if (!r.ok || passed.has(rule)) return
        const lit = onShare(CHANNEL[ledOf(rule)])
        if (lit < VISIBLE || 1 - lit < VISIBLE) return
        passed.add(rule)
        hint = null
        emit()
      })
      setHint(hintFor(o))
    },
  }
}

export const BAI_2: Lesson = {
  id: 'bai-2',
  no: 2,
  title: 'Đèn nhấp nháy',
  toolbox: toolbox([B.wait], [B.init, B.setLed(100), B.setLed(0)]),
  starter: STARTER,
  example: program(
    hat('event_whenarduinobegin', 30, 30, { type: 'thingBotC3_init' }),
    hat('event_whenarduinoloop', 30, 150, setLed(100, wait(0.5, setLed(0, wait(0.5))))),
  ),
  cards: CARDS,
  rules: RULES,
  flow: 'blink',
  badges: ['esp', 'pca', 'l1'],
  done: [R_1S, R_HALF],
  createGrader,
}
