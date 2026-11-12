// 12 nhiệm vụ con rùa (spec §6.3): chặng 1 Hai bánh xe (1–4), chặng 2 Con rùa robot (5–8), chặng 3 Việc trên sân
// (9–11), chặng 4 Thi đấu (12). Thuần dữ liệu — bộ chấm ở grade.ts. Luật V4: nhiệm vụ 10 dùng Xe Cắm Cờ, nhiệm vụ 11 là
// leo Thang Cứu Hỏa.
//
// Số đo của Mẫu Maker 2 bánh trên sân mô phỏng (đo 04/11, đã gồm đoạn trôi sau khi dừng): M1 = M2 = 60 ⇒ 0,275 m/s;
// M1 = −60, M2 = 60 ⇒ quay trái 131 °/s. Học sinh tự đo lại ở nhiệm vụ 4 — chữ ở đây không nói trước số đo.
//
// Hình vuông quanh núi: 4 núi đặt sát nhau, lối giữa hai núi chỉ rộng ~ 25–34 cm cho xe 24 cm. Cạnh và góc nghiêng
// của hình vuông chọn bằng cách dò mọi (góc, cạnh) để thân xe (kể cả lúc xoay tại góc) cách hình bao chân núi xa
// nhất: quanh Núi A cạnh 0,72 m nghiêng −8° (cách ≥ 2,3 cm), quanh Núi D cạnh 0,70 m không nghiêng (≥ 2,0 cm).
import { holeCentres, LADDER, MOUNTAINS, START_POSES, ZONES, fromMountain, type Pose, type Rect } from '../layout.ts'
import { defaultConfig, sample, TOOLBOX } from '../programs.ts'
import { ROBOTS } from '../robots.ts'
import { pointAt } from '../ladder.ts'
import { argumentReporter, MY_BLOCKS_CATEGORY, procedureCall, procedureState } from '../procedures.ts'
import type { Goal, Mission } from './types.ts'

/**
 * Hạt giống sân của mọi nhiệm vụ (R96): cố định để mỗi lần làm lại, bóng xả xuống đúng như lần trước (nhiệm vụ 9–11
 * có bóng) — ngưỡng ⭐ của nhiệm vụ 9 đo trên chính sân này: 47 bóng xanh trong Khu Chữa Cháy khi chạy trong Node (thanh xà/cột CAD mới 12/11 làm bóng xả lệch: trước đó 38), 40–41
 * trên trình duyệt (bóng còn lăn vài khung trước khi em bấm ▶).
 */
export const MISSION_SEED = 2

const MAKER = defaultConfig('maker') // Mẫu Maker 2 bánh: M1 bánh trái, M2 bánh phải
/** Nhiệm vụ 10: Xe Cắm Cờ (luật V4 chỉ xe này còn cắm cờ). */
const CO = defaultConfig('co')
/** Cổng servo của móc leo xà Mẫu Maker ("S2") — chữ của nhiệm vụ 11 lấy từ đây, không gõ tay. */
const HOOK = ROBOTS[MAKER.type].hook.port
const deg = (d: number) => (d * Math.PI) / 180

// ---------- Hộp công cụ ----------
const shadow = (type: string, field: string, value: unknown) => ({ shadow: { type, fields: { [field]: value } } })
const num = (v: number) => shadow('math_number', 'NUM', v)
const block = (type: string, extra: object = {}) => ({ kind: 'block', type, ...extra })
const category = (name: string, colour: string, secondaryColour: string, contents: object[]) => ({ kind: 'category', name, colour, secondaryColour, contents })

const EVENTS = { ...category('Sự kiện', '#FFD500', '#CC9900', [block('event_whenarduinobegin'), block('event_whenarduinoloop')]), categorystyle: 'events_category' }
const WAIT = block('control_wait', { inputs: { DURATION: shadow('math_positive_number', 'NUM', 1) } })
const REPEAT = block('control_repeat', { inputs: { TIMES: shadow('math_whole_number', 'NUM', 4) } })
const MOTORS = category('ThingBot', '#6600ff', '#4400aa', [
  block('thingBotC3_init'),
  block('thingBotC3_setMotor', { fields: { MOTOR: '1', DIRECTION: 'forward' }, inputs: { SPEED: num(60) } }),
  block('thingBotC3_setMotor', { fields: { MOTOR: '2', DIRECTION: 'forward' }, inputs: { SPEED: num(60) } }),
])
const MATH = category('Toán tử', '#59C059', '#389438', ['operator_divide', 'operator_multiply', 'operator_add', 'operator_subtract'].map((t) => block(t, { inputs: { NUM1: num(0), NUM2: num(0) } })))

/** Chặng 1: sự kiện, đợi, hai động cơ. */
const TOOLBOX_WHEELS = { kind: 'categoryToolbox', contents: [EVENTS, category('Điều khiển', '#FFAB19', '#CF8B17', [WAIT]), MOTORS] }
/** Chặng 2: thêm lặp lại, phép tính, khối của em. */
const TOOLBOX_TURTLE = {
  kind: 'categoryToolbox',
  contents: [EVENTS, category('Điều khiển', '#FFAB19', '#CF8B17', [WAIT, REPEAT]), MATH, MOTORS, MY_BLOCKS_CATEGORY],
}
/** Nhiệm vụ 11: như chặng 2, thêm khối «đặt servo» đặt sẵn cổng móc (giơ 180°, hạ 0°). */
const TOOLBOX_CLIMB = {
  kind: 'categoryToolbox',
  contents: [
    EVENTS, category('Điều khiển', '#FFAB19', '#CF8B17', [WAIT, REPEAT]), MATH,
    category('ThingBot', '#6600ff', '#4400aa', [
      ...MOTORS.contents,
      block('thingBotC3_setServoAngle', { fields: { SERVO: HOOK.slice(1) }, inputs: { ANGLE: num(180) } }),
    ]),
    MY_BLOCKS_CATEGORY,
  ],
}

// ---------- Chương trình ban đầu ----------
type B = Record<string, unknown>
const chain = (bs: B[]): B | undefined => bs.reduceRight<B | undefined>((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), undefined)
const program = (begin: B[], extra: B[] = []) => {
  const body = chain([{ type: 'thingBotC3_init' }, ...begin])
  return {
    blocks: {
      languageVersion: 0,
      blocks: [{ type: 'event_whenarduinobegin', x: 30, y: 30, next: { block: body } }, { type: 'event_whenarduinoloop', x: 30, y: 420 }, ...extra],
    },
  }
}
/** «khi Arduino khởi động» → khởi động ThingBot; em ghép tiếp bên dưới. */
const EMPTY = program([])
const TELEOP = sample(MAKER, 'teleop')
const TELEOP_CO = sample(CO, 'teleop')

const motor = (m: 1 | 2, dir: 'forward' | 'backward', speed: number): B => ({ type: 'thingBotC3_setMotor', fields: { MOTOR: String(m), DIRECTION: dir }, inputs: { SPEED: num(speed) } })
const arg = (name: string): B => argumentReporter(name) as B
const waitFor = (value: B): B => ({ type: 'control_wait', inputs: { DURATION: { ...shadow('math_positive_number', 'NUM', 1), block: value } } })
const wait = (s: number): B => ({ type: 'control_wait', inputs: { DURATION: shadow('math_positive_number', 'NUM', s) } })
const divide = (a: B, b: number): B => ({ type: 'operator_divide', inputs: { NUM1: { ...num(0), block: a }, NUM2: num(b) } })
/** Định nghĩa khối của em `name(param)` có thân `body` (khối mũ, đặt bên phải chương trình). */
const define = (name: string, param: string, body: B[], y: number): B => ({
  ...(procedureState(name, [param], body) as { blocks: { blocks: B[] } }).blocks.blocks[0],
  x: 460,
  y,
})
const call = (name: string, value: number): B => procedureCall(name, [value]) as B

/**
 * Nhiệm vụ 8 — chương trình bị sai: «rẽ trái (độ)» chia cho 100 °/s (số đoán, chưa đo) trong khi robot quay ~131 °/s,
 * nên mỗi góc robot quay quá ~ 28° và vệt không khép (phép thử grade.test.ts chạy nó trên sân để chắc chắn).
 */
const BUGGY_SQUARE = program(
  [{ type: 'control_repeat', inputs: { TIMES: shadow('math_whole_number', 'NUM', 4), SUBSTACK: { block: chain([call('tiến', 0.7), call('rẽ trái', 90)]) } } }],
  [
    define('tiến', 'mét', [motor(1, 'forward', 60), motor(2, 'forward', 60), waitFor(divide(arg('mét'), 0.275)), motor(1, 'forward', 0), motor(2, 'forward', 0), wait(0.3)], 30),
    define('rẽ trái', 'độ', [motor(1, 'backward', 60), motor(2, 'forward', 60), waitFor(divide(arg('độ'), 100)), motor(1, 'forward', 0), motor(2, 'forward', 0), wait(0.3)], 330),
  ],
)

// ---------- Hình học ----------
/** Hình vuông tâm Núi `m`, nửa cạnh `h`, nghiêng `tilt` (rad): 4 góc theo thứ tự robot đi (rẽ trái), khép lại ở góc đầu. */
function square(m: number, h: number, tilt: number): { start: Pose; path: { x: number; z: number }[] } {
  const frame = { ...MOUNTAINS[m], yaw: tilt }
  // Hệ núi đã xoay `tilt`: góc đầu (+h, +h) phía Khu Điều Khiển, mặt hướng −z; rẽ trái ⇒ (+h, −h), (−h, −h), (−h, +h).
  const corners = [[h, h], [h, -h], [-h, -h], [-h, h], [h, h]].map(([lx, lz]) => fromMountain(frame, lx, lz))
  return { start: { ...corners[0], yaw: tilt }, path: corners }
}
const SQUARE_A = square(0, 0.36, deg(-8))
const SQUARE_D = square(3, 0.35, 0)

const rectAround = (x: number, z: number, hx: number, hz: number): Rect => ({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz })
/** Góc dưới bên trái sân (ngoài các núi): chỗ thử đi thẳng, xoay, đo. */
const CORNER: Pose = { x: -0.9, z: 0.95, yaw: 0 }
/** Nhiệm vụ 2: xuất phát thẳng hàng Núi A, dừng sao cho mũi xe chưa chạm chân núi. */
const BEFORE_A: Pose = { x: MOUNTAINS[0].x, z: 1.04, yaw: 0 }
/** Nhiệm vụ 5: quay sang phải (+x), đi 1 m dọc mép sân phía em. */
const ALONG: Pose = { x: -0.9, z: 0.95, yaw: deg(-90) }
const ROBOT1 = START_POSES.red[0]
const HOLE_A = holeCentres()[0]
/** Ô vàng dưới đoạn Mặt Đất của Thang Cứu Hỏa đỏ (sát rào trái). */
const LADDER_SQ = ZONES.ladder.red
const LADDER_MID = { x: (LADDER_SQ.x0 + LADDER_SQ.x1) / 2, z: (LADDER_SQ.z0 + LADDER_SQ.z1) / 2 }

// ---------- Điều kiện ⭐ hay dùng ----------
const closedLoop = (stepsMin: number): { goals: Goal[]; stars: Mission['stars'] } => ({
  // §8.3: ⭐ sai số vị trí cuối ≤ 15 cm, ⭐⭐ ≤ 7 cm, ⭐⭐⭐ = ⭐⭐ + lặp lại + khối của em có ô số. Quãng / góc tối thiểu để
  // robot đứng yên tại chỗ không "khép vòng" được.
  goals: [{ type: 'return', tol: 0.15 }, { type: 'measure', what: 'distance', min: stepsMin }, { type: 'measure', what: 'turned', min: 300 }],
  stars: { two: [{ type: 'return', tol: 0.07 }], three: [{ type: 'uses', opcodes: ['control_repeat'] }, { type: 'paramBlock' }] },
})

export const MISSIONS: Mission[] = [
  // ---------- Chặng 1 · Hai bánh xe ----------
  {
    id: 'lam-quen', stage: 1, n: 1, title: 'Làm quen robot',
    goal: 'Lái robot bằng bàn phím một vòng hình vuông quanh Núi A rồi về chỗ cũ, xem vệt robot vẽ trên sân.',
    robot: MAKER, start: SQUARE_A.start, balls: false, toolbox: TOOLBOX, starter: TELEOP, kind: 'drive', maxTime: 60, path: SQUARE_A.path,
    guide: [
      'Robot của em có hai bánh: động cơ M1 quay bánh trái, M2 quay bánh phải. Chương trình lái bằng tay cầm đã có sẵn.',
      'Bấm ▶ rồi giữ W để đi tới, S để lùi, A / D để xoay tại chỗ. Thả phím là robot dừng.',
      'Đi theo đường nét đứt: bốn cạnh, bốn lần rẽ trái, vòng quanh Núi A rồi dừng đúng chỗ xuất phát.',
      'Mỗi lần lệnh động cơ đổi, vệt đổi màu. Em nhìn vệt để biết đoạn nào robot đi thẳng, đoạn nào xoay.',
      'Em dừng lại suy nghĩ bao lâu cũng được. Làm xong việc thì robot đứng yên 1 giây là được chấm, hoặc em bấm Chấm.',
    ],
    goals: [{ type: 'measure', what: 'distance', min: 1.5 }, { type: 'measure', what: 'turned', min: 270 }, { type: 'return', tol: 0.25 }],
    stars: { two: [{ type: 'return', tol: 0.12 }], three: [{ type: 'noMountain' }] },
    hints: [
      { when: 'measure', text: 'Robot chưa đi đủ một vòng — giữ W lâu hơn ở mỗi cạnh nhé.' },
      { when: 'return', text: 'Còn cách chỗ xuất phát {d} cm — lái chậm lại ở cạnh cuối, nhích từng chút bằng W.' },
      { when: 'noMountain', text: 'Robot chạm chân núi — đi xa núi hơn một chút ở các cạnh.' },
    ],
  },
  {
    id: 'di-thang', stage: 1, n: 2, title: 'Đi thẳng',
    goal: 'Viết chương trình cho robot đi thẳng tới Núi A và dừng ngay trước chân núi, không chạm núi.',
    robot: MAKER, start: BEFORE_A, balls: false, toolbox: TOOLBOX_WHEELS, starter: EMPTY, kind: 'program', maxTime: 20,
    path: [{ x: BEFORE_A.x, z: BEFORE_A.z }, { x: BEFORE_A.x, z: 0.8 }],
    guide: [
      'Kéo hai khối «đặt động cơ» vào dưới «khởi động ThingBot»: M1 và M2 cùng chiều tiến, cùng tốc độ 60.',
      'Thêm khối «đợi» để robot chạy một lúc. Đợi càng lâu, robot đi càng xa.',
      'Đặt M1 và M2 về tốc độ 0 để robot dừng.',
      'Bấm ▶, xem robot dừng ở đâu. Chưa tới thì tăng thời gian đợi, chạm núi thì giảm.',
    ],
    goals: [{ type: 'reach', rect: rectAround(BEFORE_A.x, 0.82, 0.05, 0.05) }, { type: 'noMountain' }, { type: 'uses', opcodes: ['thingBotC3_setMotor', 'control_wait'] }],
    stars: { two: [{ type: 'reach', rect: rectAround(BEFORE_A.x, 0.79, 0.04, 0.02) }], three: [{ type: 'time', max: 3 }] },
    hints: [
      { when: 'uses', text: 'Chương trình cần khối «đặt động cơ» và khối «đợi».' },
      { when: 'short', text: 'Còn hụt {d} cm — thử tăng thời gian đợi?' },
      { when: 'long', text: 'Robot đi quá {d} cm — thử giảm thời gian đợi?' },
      { when: 'noMountain', text: 'Robot chạm chân núi — đợi ngắn hơn một chút nhé.' },
      { when: 'reach', text: 'Robot lệch khỏi đường thẳng {d} cm — M1 và M2 có cùng tốc độ không?' },
      { when: 'time', text: 'Robot tới nơi chậm quá — thử tốc độ lớn hơn và đợi ngắn hơn.' },
    ],
  },
  {
    id: 'cong-va-xoay', stage: 1, n: 3, title: 'Cong và xoay',
    goal: 'Cho robot quay tại chỗ đúng nửa vòng: cuối cùng robot quay mặt ngược lại mà vẫn đứng đúng chỗ cũ.',
    robot: MAKER, start: CORNER, balls: false, toolbox: TOOLBOX_WHEELS, starter: EMPTY, kind: 'program', maxTime: 20,
    guide: [
      'Thử trước: M1 = 60, M2 = 30 thì robot đi cong — bánh nhanh hơn ở phía ngoài vòng cong.',
      'Cho hai bánh quay ngược chiều (M1 lùi, M2 tiến, cùng tốc độ) thì robot xoay tại chỗ.',
      'Tốc độ nhỏ quá (dưới khoảng 20) động cơ không đủ sức quay — đó là vùng chết. Hãy dùng tốc độ lớn hơn.',
      'Chỉnh thời gian đợi tới khi robot quay đúng nửa vòng (180°) rồi dừng.',
    ],
    goals: [{ type: 'turn', deg: 180, tol: 15 }, { type: 'return', tol: 0.08 }, { type: 'measure', what: 'turned', min: 150 }],
    stars: { two: [{ type: 'turn', deg: 180, tol: 5 }], three: [{ type: 'time', max: 3 }] },
    hints: [
      { when: 'measure', text: 'Robot chưa xoay — hai bánh phải quay ngược chiều nhau, tốc độ lớn hơn vùng chết.' },
      { when: 'return', text: 'Robot trôi khỏi chỗ {d} cm — hai bánh cần cùng tốc độ, ngược chiều.' },
      { when: 'turnOver', text: 'Robot quay quá {d}° — nửa vòng cần ít thời gian đợi hơn.' },
      { when: 'turnUnder', text: 'Robot còn thiếu {d}° — đợi lâu hơn một chút.' },
      { when: 'time', text: 'Quay chậm quá — thử tốc độ lớn hơn và đợi ngắn hơn.' },
    ],
  },
  {
    id: 'do-robot', stage: 1, n: 4, title: 'Đo robot',
    goal: 'Đo xem robot đi được bao xa trong 1 giây và xoay được bao nhiêu độ trong 1 giây, ở tốc độ 60.',
    robot: MAKER, start: CORNER, balls: false, toolbox: TOOLBOX_WHEELS, starter: EMPTY, kind: 'program', maxTime: 20,
    guide: [
      'Cho M1 = M2 = 60 trong 1 giây rồi dừng. Đọc ô "quãng đã đi" — đó là số mét robot đi được trong 1 giây.',
      'Tiếp theo cho M1 lùi 60, M2 tiến 60 trong 1 giây rồi dừng. Đọc ô "góc đã quay" — số độ xoay được trong 1 giây.',
      'Ghi hai số này lại: chặng sau em dùng chúng để robot đi đúng số mét, quay đúng số độ.',
      'Đo vài lần cho chắc. Robot còn trôi một chút sau khi dừng — số đo đã tính cả đoạn trôi đó.',
      'Robot đứng yên quá 1 giây là được chấm luôn, nên giữa hai phép đo chỉ dừng ngắn thôi.',
    ],
    goals: [{ type: 'measure', what: 'distance', min: 0.2 }, { type: 'measure', what: 'turned', min: 90 }, { type: 'uses', opcodes: ['thingBotC3_setMotor', 'control_wait'] }],
    stars: { two: [{ type: 'noMountain' }], three: [{ type: 'time', max: 3.5 }] },
    hints: [
      { when: 'uses', text: 'Chương trình cần khối «đặt động cơ» và khối «đợi».' },
      { when: 'measure', text: 'Chưa đủ hai phép đo — em cho robot đi thẳng 1 giây và xoay 1 giây chưa?' },
      { when: 'noMountain', text: 'Robot chạm núi — đi thẳng trước rồi mới xoay, hoặc xoay trước rồi đi.' },
      { when: 'time', text: 'Chương trình chạy lâu quá — chỉ cần 1 giây đi thẳng, dừng thật ngắn, rồi 1 giây xoay.' },
    ],
  },

  // ---------- Chặng 2 · Con rùa robot ----------
  {
    id: 'khoi-tien', stage: 2, n: 5, title: 'Khối "tiến (m)"',
    goal: 'Tạo khối của em «tiến (mét)» có một ô số, rồi dùng nó cho robot đi đúng 1 mét dọc mép sân.',
    robot: MAKER, start: ALONG, balls: false, toolbox: TOOLBOX_TURTLE, starter: EMPTY, kind: 'program', maxTime: 40,
    path: [{ x: ALONG.x, z: ALONG.z }, { x: ALONG.x + 1, z: ALONG.z }],
    guide: [
      'Bấm mục "Khối của em" (chấm hồng), bấm nút "Tạo một khối". Đặt tên "tiến", bấm "+ Thêm ô số", đổi tên ô thành "mét", rồi bấm "Tạo khối".',
      'Vùng khối hiện khối hồng «định nghĩa tiến (mét)». Kéo khối vào ngay dưới nó: M1 = M2 = 60, đợi (mét ÷ quãng đi được trong 1 giây em đo ở nhiệm vụ 4), rồi dừng. Muốn có ô «mét», kéo ô tròn «mét» trên khối hồng xuống.',
      'Dưới «khởi động ThingBot», gọi «tiến (1)». Robot phải đi đúng 1 mét.',
      'Muốn ⭐⭐⭐: đi 1 mét bằng hai lần gọi, ví dụ «tiến (0.4)» rồi «tiến (0.6)».',
    ],
    goals: [{ type: 'reach', rect: rectAround(ALONG.x + 1, ALONG.z, 0.05, 0.05) }, { type: 'paramBlock' }],
    stars: { two: [{ type: 'reach', rect: rectAround(ALONG.x + 1, ALONG.z, 0.02, 0.03) }], three: [{ type: 'paramBlock', calls: 2 }] },
    hints: [
      { when: 'paramBlock', text: 'Chương trình cần khối của em có ô số — tạo khối «tiến» với ô "mét" rồi gọi nó.' },
      { when: 'short', text: 'Còn hụt {d} cm — thử tăng thời gian đợi? (chia cho số nhỏ hơn)' },
      { when: 'long', text: 'Robot đi quá {d} cm — số em chia có đúng quãng đi trong 1 giây không?' },
      { when: 'reach', text: 'Robot lệch đường {d} cm — M1 và M2 có cùng tốc độ không?' },
    ],
  },
  {
    id: 'khoi-re', stage: 2, n: 6, title: 'Khối "rẽ phải/trái (độ)"',
    goal: 'Tạo khối của em «rẽ trái (độ)» và dùng nó cho robot quay trái đúng 90° tại chỗ.',
    robot: MAKER, start: CORNER, balls: false, toolbox: TOOLBOX_TURTLE, starter: EMPTY, kind: 'program', maxTime: 40,
    guide: [
      'Bấm mục "Khối của em", bấm "Tạo một khối", đặt tên "rẽ trái", bấm "+ Thêm ô số" và đổi tên ô thành "độ".',
      'Kéo khối vào ngay dưới khối hồng «định nghĩa rẽ trái (độ)»: M1 lùi 60, M2 tiến 60, đợi (độ ÷ số độ xoay trong 1 giây em đo), rồi dừng.',
      'Gọi «rẽ trái (90)». Robot phải quay mặt sang trái, vẫn đứng tại chỗ.',
      'Muốn ⭐⭐⭐: quay 90° bằng hai lần gọi, ví dụ «rẽ trái (45)» hai lần. Thử làm thêm «rẽ phải (độ)» nhé.',
    ],
    goals: [{ type: 'turn', deg: 90, tol: 5 }, { type: 'return', tol: 0.05 }, { type: 'paramBlock' }],
    stars: { two: [{ type: 'turn', deg: 90, tol: 2 }], three: [{ type: 'paramBlock', calls: 2 }] },
    hints: [
      { when: 'paramBlock', text: 'Chương trình cần khối của em có ô số — tạo khối «rẽ trái» với ô "độ" rồi gọi nó.' },
      { when: 'turnOver', text: 'Robot quay quá {d}° — 90° cần ít thời gian hơn.' },
      { when: 'turnUnder', text: 'Robot còn thiếu {d}° — thử tăng thời gian đợi.' },
      { when: 'return', text: 'Robot trôi khỏi chỗ {d} cm — hai bánh cần cùng tốc độ, ngược chiều.' },
    ],
  },
  {
    id: 'hinh-vuong', stage: 2, n: 7, title: 'Hình vuông',
    goal: 'Cho robot đi một hình vuông cạnh 0,72 m vòng quanh Núi A rồi về đúng chỗ xuất phát.',
    robot: MAKER, start: SQUARE_A.start, balls: false, toolbox: TOOLBOX_TURTLE, starter: EMPTY, kind: 'program', maxTime: 40, path: SQUARE_A.path,
    guide: [
      'Một hình vuông là 4 lần: đi một cạnh rồi rẽ trái 90°. Robot rẽ trái nên đi ngược chiều kim đồng hồ quanh núi.',
      'Tạo lại hai khối của em «tiến (mét)» và «rẽ trái (độ)» như nhiệm vụ 5 và 6.',
      'Dùng «lặp lại 4» bọc quanh «tiến (0.72)» và «rẽ trái (90)».',
      'Bấm ▶, xem vệt có khép lại không. Robot về càng sát chỗ cũ, em càng được nhiều sao.',
    ],
    ...closedLoop(2.4),
    hints: [
      { when: 'measure', text: 'Robot chưa đi hết vòng — có đủ 4 cạnh và 4 lần rẽ chưa?' },
      { when: 'return', text: 'Còn cách chỗ xuất phát {d} cm — xem vệt: cạnh ngắn thì tăng thời gian đợi, góc rẽ quá thì giảm.' },
      { when: 'uses', text: 'Đã khép vòng! Muốn ⭐⭐⭐ hãy dùng «lặp lại 4» thay cho chép 4 lần.' },
      { when: 'paramBlock', text: 'Đã khép vòng! Muốn ⭐⭐⭐ hãy dùng khối của em có ô số, như «tiến (mét)».' },
    ],
  },
  {
    id: 'go-loi', stage: 2, n: 8, title: 'Gỡ lỗi',
    goal: 'Chương trình có sẵn muốn đi hình vuông quanh Núi D nhưng vệt không khép. Tìm chỗ sai và sửa.',
    robot: MAKER, start: SQUARE_D.start, balls: false, toolbox: TOOLBOX_TURTLE, starter: BUGGY_SQUARE, kind: 'program', maxTime: 40, path: SQUARE_D.path,
    guide: [
      'Bấm ▶ và quan sát vệt. Robot sai ở cạnh hay ở góc rẽ?',
      'Mỗi màu vệt là một lệnh động cơ. Đếm xem robot quay được bao nhiêu độ ở mỗi góc.',
      'Đọc lại từng khối của em: số em chia có đúng với số đo ở nhiệm vụ 4 không?',
      'Sửa một chỗ, chạy lại, so vệt mới với vệt cũ.',
    ],
    ...closedLoop(2.3),
    hints: [
      { when: 'measure', text: 'Robot chưa đi hết vòng — có đủ 4 cạnh và 4 lần rẽ chưa?' },
      { when: 'return', text: 'Vệt chưa khép, còn cách chỗ xuất phát {d} cm. Robot quay quá — 90° cần ít thời gian hơn?' },
      { when: 'uses', text: 'Đã khép vòng! Giữ «lặp lại 4» để được ⭐⭐⭐.' },
      { when: 'paramBlock', text: 'Đã khép vòng! Giữ khối của em có ô số để được ⭐⭐⭐.' },
    ],
  },

  // ---------- Chặng 3 · Việc trên sân ----------
  {
    id: 'don-khu-chua-chay', stage: 3, n: 9, title: 'Dọn Khu Chữa Cháy',
    goal: 'Lái robot đẩy bóng xanh ra khỏi Khu Chữa Cháy, tới khi hai khu còn không quá 28 quả xanh (lúc đầu có khoảng 40 quả).',
    robot: MAKER, start: ROBOT1, balls: true, toolbox: TOOLBOX, starter: TELEOP, kind: 'drive', maxTime: 90,
    guide: [
      'Khu Chữa Cháy là hai ô vuông ở hai góc xa, phía Hộp Phân Phối. Bóng xanh nằm trong đó bị trừ điểm.',
      'Lái robot tới Khu Chữa Cháy, dùng thân xe đẩy bóng xanh ra ngoài vạch.',
      'Đi sát rào, đẩy cả hàng bóng ra phía giữa sân: bóng nằm giữa robot và góc rào thì không ra được.',
      'Cẩn thận đừng đẩy bóng cam ra theo — bóng cam trong khu được cộng điểm.',
      'Em dừng lại suy nghĩ bao lâu cũng được. Làm xong việc thì robot đứng yên 1 giây là được chấm, hoặc em bấm Chấm.',
    ],
    // R96: sân đầy 300 bóng, quét dọc rào hai khu (đặt robot thẳng vào từng làn, không tính lúc quay xe) mất 21 s lái
    // mà mới bớt từ 47 còn 29 quả (trước CAD sân mới 12/11: 38 còn 24) (trình duyệt: 40 → 17…27); ba lượt (64 s) còn 13 — "không còn quả nào" trong 90 s là
    // không làm được. ⭐ = còn ≤ 33: khoảng một lượt quét dọc rào.
    goals: [{ type: 'fireClear', max: 33 }, { type: 'measure', what: 'distance', min: 1 }],
    stars: { two: [{ type: 'time', max: 60 }], three: [{ type: 'time', max: 40 }, { type: 'noMountain' }] },
    hints: [
      { when: 'fireClear', text: 'Khu Chữa Cháy còn nhiều bóng xanh quá — đi sát rào, đẩy cả hàng ra ngoài vạch nhé.' },
      { when: 'measure', text: 'Robot chưa tới Khu Chữa Cháy — khu ở góc xa, phía Hộp Phân Phối.' },
      { when: 'time', text: 'Xong rồi! Thử lại nhanh hơn: đi đường ngắn nhất, đẩy nhiều bóng một lần.' },
      { when: 'noMountain', text: 'Xong rồi! Thử lại mà không chạm núi.' },
    ],
  },
  {
    id: 'cam-co', stage: 3, n: 10, title: 'Cắm cờ',
    goal: 'Lái Xe Cắm Cờ tới Núi A, vươn tay cờ ra trên lỗ rồi thả cờ vào lỗ trên đỉnh núi.',
    robot: CO, start: ROBOT1, balls: true, toolbox: TOOLBOX, starter: TELEOP_CO, kind: 'drive', maxTime: 60,
    path: [{ x: ROBOT1.x, z: ROBOT1.z }, { x: HOLE_A.x, z: HOLE_A.z }],
    // Nút lấy theo TeleOp mẫu của Xe Cắm Cờ (programs.ts teleopButtons): L1 / L2 vươn / thu tay cờ (S1), □ giữ là mở
    // kẹp cờ (S2), R1 là móc leo xà. △ / ✕ nâng thùng bóng, không dùng ở đây.
    guide: [
      'Nhiệm vụ này dùng Xe Cắm Cờ. Tay cờ trước mũi xe đang kẹp sẵn một lá cờ.',
      'Bấm L1 để tay cờ vươn ra trước mũi xe, bấm L2 để thu tay về. Giữ □ là mở kẹp, nhả □ là kẹp lại.',
      'Lái robot tới Núi A, hướng mũi xe vào đỉnh núi. Tiến sát chân núi để cờ nằm ngay trên lỗ.',
      'Giữ □ mở kẹp: cờ rơi vào lỗ trên đỉnh núi.',
      'Em dừng lại suy nghĩ bao lâu cũng được. Làm xong việc thì robot đứng yên 1 giây là được chấm, hoặc em bấm Chấm.',
    ],
    goals: [{ type: 'flag', mountain: 0 }],
    stars: { two: [{ type: 'time', max: 45 }], three: [{ type: 'time', max: 25 }] },
    hints: [
      { when: 'flag', text: 'Cờ chưa vào lỗ Núi A — bấm L1 vươn tay cờ, hướng mũi xe vào núi cho cờ ở ngay trên lỗ rồi mới giữ □.' },
      { when: 'time', text: 'Cắm được rồi! Thử lại nhanh hơn: bấm L1 vươn tay cờ ngay từ lúc xuất phát.' },
    ],
  },
  {
    id: 'leo-thang', stage: 3, n: 11, title: 'Leo Thang Cứu Hỏa',
    goal: 'Viết chương trình đưa robot từ ô xuất phát tới Thang Cứu Hỏa đỏ, móc lên thanh xà rồi trượt sang Khu vực Nước.',
    robot: MAKER, start: ROBOT1, balls: false, toolbox: TOOLBOX_CLIMB, starter: EMPTY, kind: 'program', maxTime: 60,
    path: [
      { x: ROBOT1.x, z: ROBOT1.z }, { x: ROBOT1.x, z: 0.85 }, { x: LADDER_MID.x, z: 0.85 }, LADDER_MID,
      pointAt('red', LADDER.divider + 0.2),
    ],
    guide: [
      'Lái robot tới ô vàng sát rào trái: ô này nằm ngay dưới đoạn Đất của thanh xà đỏ.',
      'Quay mũi xe xuôi theo thanh xà, hướng về phía Hộp Phân Phối.',
      `Đặt servo ${HOOK} = 180° để giơ móc lên, rồi tiến chậm cho móc chạm thanh.`,
      `Đặt ${HOOK} = 0° để hạ móc: robot tự kéo mình lên, treo ở Khu vực Đất.`,
      'Cho hai bánh chạy tiến thêm vài giây: robot trượt dọc thanh, qua vạch sang Khu vực Nước.',
    ],
    goals: [{ type: 'climb', min: 'contact' }],
    stars: { two: [{ type: 'climb', min: 'ground' }], three: [{ type: 'climb', min: 'water' }] },
    hints: [
      { when: 'climbContact', text: `Móc chưa chạm thanh xà — vào giữa ô vàng, quay mũi xe xuôi theo thanh, đặt ${HOOK} = 180° rồi tiến chậm.` },
      { when: 'climbGround', text: `Móc đã chạm thanh! Giờ đặt ${HOOK} = 0° để hạ móc, robot sẽ treo lên thanh.` },
      { when: 'climbWater', text: 'Robot đã treo ở Khu vực Đất! Sau khi hạ móc, cho hai bánh chạy tiến lâu hơn để trượt sang Khu vực Nước.' },
    ],
  },

  // ---------- Chặng 4 · Thi đấu ----------
  {
    id: 'tran-dau-tien', stage: 4, n: 12, title: 'Trận đầu tiên',
    goal: 'Chơi một trận đầy đủ cùng ba robot máy mức Dễ: em lái Robot 1 bằng bàn phím, cả bốn đội chung một điểm trận.',
    robot: MAKER, start: ROBOT1, balls: true, toolbox: TOOLBOX, starter: TELEOP, kind: 'match', maxTime: 190,
    guide: [
      '10 giây đầu bóng được xả xuống sân, robot chưa chạy. Sau đó có 180 giây thi đấu.',
      'Bóng cam vào Khu Chữa Cháy, bóng xanh lên rãnh núi, cắm cờ lên đỉnh núi đều được điểm.',
      'Robot không tự xúc bóng: dùng thân xe ủi bóng xanh về Khu Xuất Phát cho Human Player nhặt, rồi vào Khu Tiếp Tế nhận bóng (4 quả là đầy) và đổ vào Rãnh 1 — bậc thấp nhất của núi.',
      'Cuối trận, giữ □ giơ móc dưới Thang Cứu Hỏa đỏ rồi nhả □ để treo lên thanh. Robot treo càng xa (Khu vực Nước), điểm trận được nhân càng nhiều.',
    ],
    goals: [{ type: 'matchEnd' }],
    // Cách đo của R141: trận 4 robot máy Mẫu Maker mức Dễ, ghế như trang (SEATS), seed 1–12 (trang tăng seed mỗi trận
    // mới). Đo 12/11 (luật V4, agent leo xà của Task 5): 150 / 28 / 40 / 178 / 238 / 52 / 4 / 131 / 122 / 56 / 180 / 93,
    // trung bình 106,0 (seed 1–6: 114,3) — lệch rất mạnh theo seed. ⭐⭐ ≈ 106 × 0,85 ⇒ 90, ⭐⭐⭐ ≈ 106 × 1,1 ⇒ 120: em
    // thay một robot máy, nên 90 / 120 điểm nghĩa là em góp được bằng / hơn một robot máy.
    stars: { two: [{ type: 'score', min: 90 }], three: [{ type: 'score', min: 120 }] },
    hints: [
      { when: 'matchEnd', text: 'Chơi tới hết giờ để được chấm nhé.' },
      { when: 'score', text: 'Trận được {d} điểm. Muốn nhiều sao hơn: chở bóng nhiều chuyến hơn và nhớ leo Thang Cứu Hỏa cuối trận.' },
    ],
  },
]
