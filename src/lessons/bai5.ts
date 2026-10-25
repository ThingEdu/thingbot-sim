/**
 * Bài 5 — Servo quét: quay ngay tới một góc, quay từ từ, rồi quét qua lại mãi trong vòng lặp. Hai bước
 * đầu theo bài "Servo ba cách quay" của ThingBlock (`tutorials/servo-ba-cach`) và chấm bằng đúng luật
 * `servo S1 ở … độ`; bước quét do bài này tự chấm.
 *
 * Servo lấy điện từ pin: công tắc nguồn tắt thì chip PCA9685 vẫn nhận lệnh nhưng servo đứng yên — như
 * mạch thật. Vì vậy các bước chỉ ✓ khi đã bật nguồn.
 */
import { makeGrader, ruleResult, servoAngle } from './grader'
import { B, ev, hat, program, S, STARTER, tb, toolbox } from './state'
import type { Card, Lesson } from './types'

const R_90 = 'servo S1 ở 90 độ'
const R_180 = 'servo S1 ở 180 độ'
const RULES = [R_90, R_180]
const S1 = 12

const CARDS: Card[] = [
  {
    title: 'Chào em!',
    body: `<p><b>Servo</b> là động cơ quay tới một <b>góc</b> rồi đứng yên, từ 0 đến 180 độ. Servo của bài cắm vào cổng <b>S1</b> (hàng chân bên trái).</p>
      <p>Servo cần điện từ <b>pin</b>: bấm nút <b>🔋 Nguồn</b> trên mạch để gạt công tắc nguồn sang ON.</p>`,
  },
  {
    title: 'Quay ngay tới 90 độ',
    body: `<p>Kéo ${tb('set servo S1 to angle 90 degrees')} vào ${ev('khi Arduino khởi động')}, dưới ${tb('init ThingBot')}. Bấm <b>▶ Chạy</b> và nhìn cần trắng của servo.</p>`,
    check: 'r90',
  },
  {
    title: 'Quay từ từ',
    body: `<p>Quay ngay thì giật. Đổi sang ${tb('move servo S1 to angle 180 degrees over 2 seconds')}: servo đi từ chỗ đang đứng tới 180 độ trong 2 giây.</p>
      <p class="muted">Khối "move" chờ quay xong rồi mới chạy khối tiếp theo.</p>`,
    check: 'r180',
  },
  {
    title: 'Quét qua lại',
    body: `<p>Cho servo quét mãi như cần gạt nước: trong ${ev('vòng lặp Arduino')}, xếp</p>
      <ol class="todo">
        <li>${tb('move servo S1 to angle 0 … over 1 seconds')}</li>
        <li>${tb('move servo S1 to angle 180 … over 1 seconds')}</li>
      </ol>
      <p>Ô <b>2 · Chip PCA</b> cho thấy con số não gửi cho servo thay đổi theo góc.</p>`,
    check: 'sweep',
  },
  {
    title: 'Xong rồi! 🎉',
    body: `<p>Em đã biết hai cách quay servo: <b>set</b> quay ngay, <b>move</b> quay từ từ và chờ. Góc 0–180 độ được não đổi thành độ rộng xung (102–512) gửi cho chip PCA9685.</p>
      <p>Thả servo khi xong việc để đỡ tốn pin: ${tb('release servo S1')}.</p>`,
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
  badges: ['esp', 'pca'],
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
      if (!o.power) return 'Chip PCA9685 đã gửi lệnh nhưng servo chưa có điện: bấm 🔋 Nguồn để bật công tắc nguồn.'
      if (o.card.check === 'sweep' && run.elapsed > 4_000_000 && Number(run.seen.swings ?? 0) < 2)
        return 'Servo quay tới rồi đứng yên: đặt hai khối «move servo S1» (0 độ, rồi 180 độ) vào trong vòng lặp Arduino.'
      const rule = o.card.check === 'r90' ? R_90 : o.card.check === 'r180' ? R_180 : null
      const res = rule ? ruleResult(RULES, o, rule) : undefined
      return res && !res.ok ? res.message : null
    },
  }),
}
