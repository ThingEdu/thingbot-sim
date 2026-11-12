// Lời giải mẫu của vài nhiệm vụ (serialization JSON của vùng khối), dùng chung cho phép thử giải được trên sân
// (grade.test.ts) và phép thử trình duyệt (scripts/fanroc-e2e.mjs N7, N8, N8c). Không phải dữ liệu cho học sinh.
import { argumentReporter, procedureCall, procedureState } from '../procedures.ts'
import { AUTO_TIMES } from '../programs.ts'
import { ROBOTS } from '../robots.ts'

type B = Record<string, unknown>
const num = (v: number) => ({ shadow: { type: 'math_number', fields: { NUM: v } } })
const chain = (bs: B[]): B | undefined => bs.reduceRight<B | undefined>((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), undefined)
const motor = (m: number, dir: 'forward' | 'backward', speed: number): B => ({ type: 'thingBotC3_setMotor', fields: { MOTOR: String(m), DIRECTION: dir }, inputs: { SPEED: num(speed) } })
const wait = (s: number | B): B => ({
  type: 'control_wait',
  inputs: { DURATION: typeof s === 'number' ? { shadow: { type: 'math_positive_number', fields: { NUM: s } } } : { shadow: { type: 'math_positive_number', fields: { NUM: 1 } }, block: s } },
})
const repeat = (n: number, body: B[]): B => ({ type: 'control_repeat', inputs: { TIMES: { shadow: { type: 'math_whole_number', fields: { NUM: n } } }, SUBSTACK: { block: chain(body) } } })
const defs = (...states: object[]) => states.map((s) => (s as { blocks: { blocks: B[] } }).blocks.blocks[0]).map((b, i) => ({ ...b, x: 460, y: 30 + i * 320 }))
const prog = (begin: B[], extra: B[] = []) => ({
  blocks: { languageVersion: 0, blocks: [{ type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: chain([{ type: 'thingBotC3_init' }, ...begin]) } }, { type: 'event_whenarduinoloop', x: 30, y: 500 }, ...extra] },
})

/** Nhiệm vụ 2: hai động cơ 60, đợi `s` giây, dừng (0,9 s ⇒ dừng ở z ≈ 0,79, 3 sao). */
export const straight = (s = 0.9) => prog([motor(1, 'forward', 60), motor(2, 'forward', 60), wait(s), motor(1, 'forward', 0), motor(2, 'forward', 0)])

/** Quãng đi được trong 1 giây ở tốc độ 60 (số đo nhiệm vụ 4, đã gồm đoạn trôi sau khi dừng). */
export const METRES_PER_S = 0.275
/** Số giây «tiến» cho `m` mét: m ÷ quãng trong 1 giây, làm tròn 2 chữ số như học sinh gõ. */
export const secondsFor = (m: number) => Math.round((m / METRES_PER_S) * 100) / 100
/** Định nghĩa «tiến (giây)» (R161): M1 = M2 = 60, đợi (giây), dừng — robot không có encoder nên đi theo thời gian. */
const tienGiay = (pause: number) =>
  procedureState('tiến', ['giây'], [motor(1, 'forward', 60), motor(2, 'forward', 60), wait(argumentReporter('giây') as B), motor(1, 'forward', 0), motor(2, 'forward', 0), ...(pause > 0 ? [wait(pause)] : [])])

/** Nhiệm vụ 5: gọi «tiến (giây)» lần lượt với từng số giây trong `seconds` (hai lần gọi ⇒ ⭐⭐⭐). */
export const forward = (seconds: number[]) => prog(seconds.map((s) => procedureCall('tiến', [s]) as B), defs(tienGiay(0)))

/**
/** Số giây «rẽ trái» cho `deg` độ: deg ÷ số độ xoay trong 1 giây (nhiệm vụ 4, 131 °/s ở tốc độ 60), làm tròn 2 chữ số. */
export const turnSeconds = (deg: number, degPerS = 131) => Math.round((deg / degPerS) * 100) / 100
/** Định nghĩa «rẽ trái (giây)» (R167): M1 lùi 60, M2 tiến 60, đợi (giây), dừng — không có cảm biến góc nên quay theo thời gian. */
const reTraiGiay = (pause: number) =>
  procedureState('rẽ trái', ['giây'], [motor(1, 'backward', 60), motor(2, 'forward', 60), wait(argumentReporter('giây') as B), motor(1, 'forward', 0), motor(2, 'forward', 0), ...(pause > 0 ? [wait(pause)] : [])])

/** Nhiệm vụ 6: gọi «rẽ trái (giây)» lần lượt với từng số giây trong `seconds` (hai lần gọi ⇒ ⭐⭐⭐). */
export const turnLeft = (seconds: number[]) => prog(seconds.map((s) => procedureCall('rẽ trái', [s]) as B), defs(reTraiGiay(0.3)))

/**
 * Nhiệm vụ 7 (và bản sửa của nhiệm vụ 8): «tiến (giây)» với số giây = cạnh `side` mét ÷ 0,275 m/s, «rẽ trái (`turn`)»,
 * «lặp lại 4». `turn` mặc định 90° ÷ 131 °/s (số đo nhiệm vụ 4) = 0,69 s.
 */
export const turtle = (side: number, turn = turnSeconds(90)) =>
  prog(
    [repeat(4, [procedureCall('tiến', [secondsFor(side)]) as B, procedureCall('rẽ trái', [turn]) as B])],
    defs(tienGiay(0.3), reTraiGiay(0.3)),
  )

const servo = (port: string, angle: number): B => ({ type: 'thingBotC3_setServoAngle', fields: { SERVO: port.slice(1) }, inputs: { ANGLE: num(angle) } })
/** Hai bánh Mẫu Maker (−1…1 × tốc độ Auto): trái, phải. */
const wheels = (l: number, r: number): B[] => [
  motor(1, l < 0 ? 'backward' : 'forward', Math.abs(l) * 60),
  motor(2, r < 0 ? 'backward' : 'forward', Math.abs(r) * 60),
]
const leg = (l: number, r: number, s: number): B[] => [...wheels(l, r), wait(s)]

/**
 * Lùi khỏi rào trái lần đầu (s). Auto dùng AUTO_TIMES.offWall = 0,3 s nhưng ở đó xe vừa chạm Núi A; không chạm núi thì góc
 * quay phải sau đó lệch khác, 0,3 s để xe trôi sát rào, tới ô vàng không quay được (đo 12/11: 0,3 s 0 sao; 0,4–0,6 s với
 * chặng đầu 0,6–0,8 s đều 3 sao).
 */
const OFF_WALL = 0.5

/**
 * Nhiệm vụ 11 (luật V4): leo Thang Cứu Hỏa đỏ từ ô Robot 1 rồi trượt sang Nước — cùng đường và số giây với Auto mẫu của
 * Mẫu Maker (programs.ts AUTO_TIMES, đo trên sân), bỏ đoạn tới Núi A xả bóng (chỉ tiến 1,3 − 0,6 s), lùi khỏi rào lâu
 * hơn (OFF_WALL): tiến ra một đoạn, sang rào trái ép cho thẳng, xuôi theo rào tới ô vàng, ép rào lần nữa, quay theo
 * thanh, giơ móc, tiến chạm thanh, hạ móc, tiến để trượt qua vạch sang Nước. `slide` = số giây «đợi» cho trượt (dài
 * quá thì robot trượt tới cuối thanh rồi treo đứng yên trong lúc chương trình còn đợi — phép thử N8d). `pause` > 0: hạ
 * móc rồi dừng bánh, đợi `pause` giây (treo Đất, đứng yên) rồi mới tiến để trượt.
 */
export const climb = (slide: number = AUTO_TIMES.slide, pause = 0) => {
  const T = AUTO_TIMES
  const turn = Math.round(T.turnPerWidth * ROBOTS.maker.size.w * 100) / 100
  const hook = ROBOTS.maker.hook.port
  return prog([
    ...leg(1, 1, T.toMountain - T.back), ...leg(0, 0, 0.3),
    ...leg(-1, 1, turn), ...leg(1, 1, T.toWall), ...leg(-1, -1, OFF_WALL), ...leg(1, -1, turn),
    ...leg(1, 1, T.toLadder), ...leg(-1, 1, turn), ...leg(1, 1, T.press), ...leg(-1, -1, T.settle),
    ...leg(1, -1, Math.round((turn + T.align * ROBOTS.maker.size.w) * 100) / 100),
    servo(hook, 180), ...leg(1, 1, T.hookUp), servo(hook, 0), ...(pause > 0 ? [...leg(0, 0, pause), ...wheels(1, 1)] : []), wait(slide),
    ...wheels(0, 0),
  ])
}
