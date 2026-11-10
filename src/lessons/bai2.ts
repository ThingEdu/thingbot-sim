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
import { ask, B, bang, ctrl, ev, hat, hieu, program, RA, setLed, STARTER, tb, toolbox, wait } from './state'
import type { Card, Grader, GraderChange, Lesson, Observation } from './types'

const R_1S = 'L1 nhấp nháy, chu kỳ 1 giây ± 20%'
const R_HALF = 'L1 nhấp nháy, chu kỳ 0,5 giây ± 20%'
const R_L2 = 'L2 nhấp nháy, chu kỳ 1 giây ± 20%'
const RULES = [R_1S, R_HALF, R_L2]

const CHANNEL = { L1: 15, L2: 13 } as const

const CARDS: Card[] = [
  {
    title: 'Nhiệm vụ: đèn báo hiệu',
    body: `<p>Đèn <b>xi nhan</b> xe máy, đèn <b>hải đăng</b>, đèn báo <b>pin sắp hết</b>… đều <b>chớp</b> chứ không sáng mãi. Vì sao? Vì mắt người <b>để ý</b> thứ đang thay đổi.</p>
      <p>Nhiệm vụ của em: biến <b>đèn L1</b> (chỗ vòng cam) thành đèn báo hiệu, sáng nửa giây, tắt nửa giây, mãi mãi.</p>
      ${ask('Em xếp chỉ hai khối «bật đèn» rồi «tắt đèn», <b>không có</b> khối đợi. Em sẽ thấy gì?', [
        ['Đèn chớp rõ ràng, dễ nhìn', false, 'Não chạy mỗi vòng chỉ mất vài phần triệu giây, nhanh hơn mắt em rất nhiều. Phải có khối đợi thì mắt mới kịp thấy.'],
        ['Đèn trông như sáng mờ liên tục', true, 'Não bật tắt hàng nghìn lần mỗi giây, mắt em chỉ thấy một đèn mờ. Khối đợi là cách "làm chậm" não cho vừa mắt người.'],
        ['Đèn tắt hẳn', false, 'Đèn có bật, chỉ là bật tắt quá nhanh. Thử ở bước sau sẽ thấy.'],
      ])}`,
    look: ['l1'],
  },
  {
    title: 'Bật rồi tắt',
    body: `<p>Bên trong ${ev('vòng lặp Arduino')}, xếp lần lượt:</p>
      <ol class="todo">
        <li>${tb('set led 1 100')} — bật</li>
        <li>${ctrl('đợi 0.5 giây')} — giữ cho mắt kịp thấy</li>
        <li>${tb('set led 1 0')} — tắt</li>
        <li>${ctrl('đợi 0.5 giây')}</li>
      </ol>
      <p>Bấm <b>▶ Chạy</b> và chờ vài giây để mạch đếm được 3 lần chớp.</p>
      <p class="muted">${ev('vòng lặp Arduino')} chạy các khối từ trên xuống, hết thì quay lại đầu, mãi mãi, nên không cần khối lặp nào khác. Khối ${ctrl('đợi … giây')} ở nhóm Điều khiển màu cam.</p>`,
    check: R_1S,
    look: ['l1'],
  },
  {
    title: 'Hiểu sâu: 0 và 100 là gì?',
    body: `${hieu('Đèn là một đầu ra', `<p>Não <b>ra lệnh</b> cho đèn, đèn không báo gì về cho não. Thứ nhận lệnh như vậy gọi là ${RA}.</p>
      <p>Số trong khối là <b>độ sáng phần trăm</b>: <b>0</b> là tắt, <b>100</b> là sáng hết. Ở mức điện, đèn chỉ có hai trạng thái: <b>không có điện</b> (người ta viết là <b>0</b>) và <b>có điện</b> (viết là <b>1</b>). 0 và 1 ở đây không phải số đếm, mà là <b>tắt / bật</b>, giống công tắc.</p>
      <p>Còn 50 thì sao? Chip bật tắt đèn <b>cực nhanh</b>, bật một nửa thời gian, tắt một nửa, nên mắt thấy đèn mờ.</p>`)}
      ${hieu('Vì sao chọn "đèn 1"?', `${bang(['Trên mạch', 'Nối vào', 'Khối'], [['Đèn L1 (đỏ)', 'chip PCA9685, kênh 15', tb('set led 1 …')], ['Đèn L2 (xanh lá)', 'chip PCA9685, kênh 13', tb('set led 2 …')], ['Còi', 'chip PCA9685, kênh 14', tb('play note …')]])}
      <p>Dây nối đã được <b>hàn sẵn</b> khi làm mạch. Người làm mạch ghi lại "đèn L1 ở kênh 15", và khối ${tb('set led 1')} đã biết điều đó, nên em chỉ cần chọn "đèn 1".</p>`)}
      <p>Dải <b>Nhịp đèn</b> dưới mạch vẽ lại đèn L1 trong 4 giây vừa qua: đoạn đỏ là lúc sáng (1), đoạn trống là lúc tắt (0).</p>`,
  },
  {
    title: 'Chớp nhanh gấp đôi',
    body: `${ask('Đổi <b>cả hai</b> ô đợi từ 0.5 thành 0.25. Đèn sẽ…', [
        ['Chớp nhanh gấp đôi', true, 'Một lần chớp giờ mất 0,25 + 0,25 = 0,5 giây thay vì 1 giây.'],
        ['Chớp chậm gấp đôi', false, 'Đợi ít hơn thì lặp lại sớm hơn, nên nhanh hơn.'],
        ['Sáng mờ hơn', false, 'Độ sáng do số 100 quyết định; khối đợi chỉ đổi nhịp.'],
      ])}
      <p>Giờ đổi thật và bấm Chạy: các vạch đỏ trên dải nhịp sát nhau hơn.</p>`,
    check: R_HALF,
  },
  {
    title: 'Thử thách: xe cứu hoả',
    body: `<p>Cho <b>đèn L2</b> (đèn xanh lá, mép trái dưới Core) chớp, mỗi lần chớp 1 giây. Bấm mũi tên ▾ trong khối ${tb('set led 1 …')} để chọn đèn <b>2</b>.</p>
      <p class="muted">Khó hơn: cho L1 và L2 <b>thay nhau</b> chớp như đèn xe cứu hoả. Gợi ý: lúc L1 bật thì L2 tắt.</p>`,
    check: R_L2,
    optional: true,
    look: ['l2'],
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em vừa làm đúng việc của <b>mạch đèn xi nhan</b>: một đầu ra, bật tắt theo nhịp em chọn.</p>
      <p>Nhưng đèn này chạy một mình, không nghe ai. Bài 3 em cho robot <b>nghe lời người</b> qua một nút bấm.</p>
      <p class="muted">Muốn thử trên kit thật: mở ThingBlock, chọn bo ThingBot, ghép đúng các khối này rồi bấm <b>Nạp</b>.</p>`,
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
