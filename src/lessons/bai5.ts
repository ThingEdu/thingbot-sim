/**
 * Bài 5 — Servo quét: quay ngay tới một góc, quay từ từ, rồi quét qua lại mãi trong vòng lặp. Hai bước
 * đầu theo bài "Servo ba cách quay" của ThingBlock (`tutorials/servo-ba-cach`) và chấm bằng đúng luật
 * `servo S1 ở … độ`; bước quét do bài này tự chấm.
 *
 * Servo lấy điện từ pin: công tắc nguồn tắt thì chip PCA9685 vẫn nhận lệnh nhưng servo đứng yên — như
 * mạch thật. Vì vậy các bước chỉ ✓ khi đã bật nguồn.
 */
import { makeGrader, ruleResult, servoAngle } from './grader'
import { ask, B, ev, giong, hat, hieu, program, S, STARTER, tb, toolbox } from './state'
import type { Card, Lesson } from './types'

const R_90 = 'servo S1 ở 90 độ'
const R_180 = 'servo S1 ở 180 độ'
const RULES = [R_90, R_180]
const S1 = 12

const CARDS: Card[] = [
  {
    title: 'Nhiệm vụ: barie bãi gửi xe',
    body: `<p>Thanh <b>barie</b> ở bãi gửi xe, <b>cần gạt nước</b> ô tô, nắp <b>hộp quà tự mở</b>: chúng không quay tròn mãi mà quay tới <b>đúng một góc</b> rồi đứng yên. Thứ làm việc đó là <b>servo</b>.</p>
      <p>Nhiệm vụ: làm thanh barie bằng servo cắm ở cổng <b>S1</b> (hàng chân bên trái), mở lên 90 độ, rồi cho nó quét như cần gạt nước.</p>
      ${giong('servo là <b>khớp tay</b>. Em nhắm mắt vẫn giơ tay đúng 90 độ rồi giữ yên được, vì cơ thể tự biết tay đang ở đâu. Servo cũng có bộ đo góc bên trong như vậy.')}
      ${ask('Servo khác động cơ bánh xe ở chỗ nào?', [
        ['Servo quay tới một góc rồi giữ nguyên', true, 'Bên trong servo có bộ đo góc: nó tự quay tới góc em đặt rồi giữ chặt ở đó. Động cơ bánh xe thì quay mãi.'],
        ['Servo quay nhanh hơn', false, 'Tốc độ không phải điểm khác chính. Servo biết mình đang ở góc nào, động cơ bánh xe thì không.'],
        ['Servo không cần điện', false, 'Servo cần điện từ pin, như động cơ. Đó là lý do phải bật công tắc nguồn.'],
      ])}
      <p>Servo cần điện từ <b>pin</b>: bấm nút <b>🔋 Nguồn</b> trên mạch để gạt công tắc nguồn sang ON.</p>`,
  },
  {
    title: 'Mở barie: 90 độ',
    body: `<p>Kéo ${tb('set servo S1 to angle 90 degrees')} vào ${ev('khi Arduino khởi động')}, dưới ${tb('init ThingBot')}. Bấm <b>▶ Chạy</b> và nhìn cần trắng của servo.</p>
      ${hieu('Vì sao chọn S1?', `<p>Mỗi cổng S1–S5 có 3 chân: <b>GND</b> (dây nâu/đen), <b>5V</b> (dây đỏ), <b>tín hiệu</b> (dây cam/vàng). Năm cổng này được hàn sẵn tới năm kênh của mạch công suất. Servo của bài cắm ở <b>S1</b> nên khối chọn S1; cắm sang S3 thì đổi khối thành S3.</p>`)}`,
    check: 'r90',
  },
  {
    title: 'Mở từ từ',
    body: `<p>Barie bật phắt lên thì nguy hiểm. Đổi sang ${tb('move servo S1 to angle 180 degrees over 2 seconds')}: servo đi từ chỗ đang đứng tới 180 độ trong 2 giây.</p>
      <p class="muted">Khối "move" chờ quay xong rồi mới chạy khối tiếp theo.</p>`,
    check: 'r180',
  },
  {
    title: 'Quét qua lại',
    body: `<p>Cho servo quét mãi như <b>cần gạt nước</b>: trong ${ev('vòng lặp Arduino')}, xếp</p>
      <ol class="todo">
        <li>${tb('move servo S1 to angle 0 … over 1 seconds')}</li>
        <li>${tb('move servo S1 to angle 180 … over 1 seconds')}</li>
      </ol>
      ${hieu('Góc nằm trong độ dài xung', `<p>Não không nói "quay 90 độ" bằng lời. Mạch công suất gửi cho servo một <b>xung điện</b> đều đặn 50 lần mỗi giây; <b>xung ngắn</b> nghĩa là góc nhỏ, <b>xung dài</b> nghĩa là góc lớn. Ô <b>2 · Mạch công suất</b> hiện con số này: khoảng <b>102</b> là 0 độ, khoảng <b>512</b> là 180 độ (trên thang 4096).</p>`)}`,
    check: 'sweep',
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em biết hai cách quay servo: <b>set</b> quay ngay, <b>move</b> quay từ từ và chờ. Barie thật cũng vậy, chỉ thêm một cảm biến thấy xe tới.</p>
      <p>Thả servo khi xong việc để đỡ tốn pin: ${tb('release servo S1')}. Bài 6 em làm cho robot <b>tự thấy</b> vật ở gần.</p>`,
  },
]

export const BAI_5: Lesson = {
  id: 'bai-5',
  no: 5,
  title: 'Servo quét',
  toolbox: toolbox([B.wait], [B.init, B.setServo(90), B.moveServo(180, 2), B.moveServo(0, 1), B.releaseServo]),
  starter: STARTER,
  example: program(
    hat('event_whenarduinobegin', 30, 30, S.plain('thingBotC3_init')),
    hat('event_whenarduinoloop', 30, 150, S.moveServo(0, 1, S.moveServo(180, 1))),
  ),
  cards: CARDS,
  rules: RULES,
  flow: 'servo',
  controls: ['power'],
  props: ['servo'],
  badges: ['esp', 'pca', 'servo'],
  done: ['r90', 'r180', 'sweep'],
  createGrader: makeGrader({
    track(o, run) {
      const a = servoAngle(o.pwm[S1])
      if (!o.power || a === null) return
      const last = run.seen.end
      if (a <= 10 && last !== 'low') {
        run.seen.end = 'low'
        run.seen.swings = Number(run.seen.swings ?? 0) + 1
      }
      if (a >= 170 && last !== 'high') {
        run.seen.end = 'high'
        run.seen.swings = Number(run.seen.swings ?? 0) + 1
      }
    },
    checks: {
      r90: { when: (o) => o.power && ruleResult(RULES, o, R_90)?.ok === true },
      r180: { when: (o) => o.power && ruleResult(RULES, o, R_180)?.ok === true },
      sweep: { when: (_o, run) => Number(run.seen.swings ?? 0) >= 4, hold: 0 },
    },
    hint(o, run) {
      if (run.elapsed < 1_500_000) return null
      const a = servoAngle(o.pwm[S1])
      if (a === null) return 'Chưa có lệnh cho servo S1: kéo khối «set servo S1 to angle …» hoặc «move servo S1 …» vào chương trình.'
      if (!o.power) return 'Mạch công suất đã gửi lệnh nhưng servo chưa có điện: bấm 🔋 Nguồn để bật công tắc nguồn.'
      if (o.card.check === 'sweep' && run.elapsed > 4_000_000 && Number(run.seen.swings ?? 0) < 2)
        return 'Servo quay tới rồi đứng yên: đặt hai khối «move servo S1» (0 độ, rồi 180 độ) vào trong vòng lặp Arduino.'
      const rule = o.card.check === 'r90' ? R_90 : o.card.check === 'r180' ? R_180 : null
      const res = rule ? ruleResult(RULES, o, rule) : undefined
      return res && !res.ok ? res.message : null
    },
  }),
}
