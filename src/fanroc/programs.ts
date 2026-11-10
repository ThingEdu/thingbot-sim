// Hộp công cụ và chương trình mẫu FANROC (TeleOp lái bằng tay cầm PS2, Auto chạy theo thời gian) cho 4 robot mẫu.
// Chỉ dùng khối ThingBlock thật (thingbot-core, ps2) và khối chuẩn scratch-blocks; định dạng serialization JSON của
// scratch-blocks, giống src/lessons/state.ts.
//
// Bảng nút của mẫu TeleOp (chỉ chương trình khối quyết định nút nào làm gì, không có màn hình gán nút):
// - Lái: đế 2 bánh kiểu xe tăng — cần trái LY → M1 (bánh trái), cần phải RY → M2 (bánh phải); cần trong 120…136 là
//   dừng, ngoài vùng đó «set motor … go forward/backward at (|v − 128| × 100 / 128)» (đẩy cần lên = số nhỏ = tiến).
//   Đế 4 bánh (omni / mecanum): cần trái LY tiến/lùi, LX sang ngang, cần phải RX xoay; M1–M4 = trước trái, trước phải,
//   sau trái, sau phải, mỗi bánh = tiến ± ngang ± xoay (công thức ở `mix`).
// - R1 giữ: cơ cấu hút (M3, hoặc servo 360 ở S4) — robot có hút (Mẫu Maker không hút: Human Player nạp bóng). △ / ✕ giữ: nâng / hạ (M4, hoặc S5); Xe Ủi: △ / ✕ nâng / hạ gàu S1.
// - ○ giữ: mở cửa xả S3. □ giữ: mở kẹp cờ S2 (nhả ra là kẹp lại). L1 / L2: nâng / hạ tay S1 (Mẫu Maker, Xe Cắm Cờ); Maker Nâng / Pro: L2 / R2 / L1 đưa cửa lồng (S1) tới Rãnh 1 / 2 / 3.
// - Xe Phân Loại (chưa có khối cảm biến màu, người lái tự phân loại): L1 = gạt S2 sang ngăn cam (0°), L2 = sang ngăn
//   xanh (180°); servo giữ nguyên chỗ cho tới lần bấm sau. ○ mở cửa S3 của ngăn đang chọn.
//
// Mẫu Auto chạy một lần trong «khi Arduino khởi động» (FANROC không có giai đoạn tự động riêng, RE04): đi thẳng tới
// Ngọn Núi A gần nhất, mở cửa xả 2 giây, lùi lại, sang rào trái, xuôi theo rào rồi vào Vùng Bảo Vệ đỏ.
// Thời gian tính cho Robot 1 (đỏ, ô xuất phát trái); robot ở ô khác phải sửa số giây.
import { LIFT_AXIS, portMap, ROBOTS, type RobotConfig, type RobotType } from './robots.ts'
import { MY_BLOCKS_CATEGORY } from './procedures.ts'

type B = Record<string, unknown>

// ---------- Khối ----------
const shadow = (type: string, field: string, value: unknown) => ({ shadow: { type, fields: { [field]: value } } })
const num = (v: number) => shadow('math_number', 'NUM', v)
/** Ô số (bóng math_number) có thể cắm khối khác vào. */
const slot = (v: number | B) => (typeof v === 'number' ? num(v) : { ...num(0), block: v })
const textSlot = (v: number | B) => (typeof v === 'number' ? shadow('text', 'TEXT', String(v)) : { ...shadow('text', 'TEXT', ''), block: v })

/** Nối các khối lệnh thành một chồng. */
const chain = (...bs: (B | null | undefined)[]): B | undefined =>
  bs.filter((b): b is B => !!b).reduceRight<B | undefined>((next, b) => ({ ...b, ...(next ? { next: { block: next } } : {}) }), undefined)
const hat = (type: string, x: number, y: number, body?: B): B => ({ type, x, y, ...(body ? { next: { block: body } } : {}) })
const plain = (type: string): B => ({ type })

const wait = (s: number): B => ({ type: 'control_wait', inputs: { DURATION: shadow('math_positive_number', 'NUM', s) } })
const ifThen = (cond: B, then: B | undefined): B => ({ type: 'control_if', inputs: { CONDITION: { block: cond }, ...(then ? { SUBSTACK: { block: then } } : {}) } })
const ifElse = (cond: B, then: B | undefined, otherwise: B | undefined): B => ({
  type: 'control_if_else',
  inputs: { CONDITION: { block: cond }, ...(then ? { SUBSTACK: { block: then } } : {}), ...(otherwise ? { SUBSTACK2: { block: otherwise } } : {}) },
})
const arith = (type: string) => (a: number | B, b: number | B): B => ({ type, inputs: { NUM1: slot(a), NUM2: slot(b) } })
const add = arith('operator_add')
const sub = arith('operator_subtract')
const mul = arith('operator_multiply')
const div = arith('operator_divide')
const compare = (type: string) => (a: number | B, b: number | B): B => ({ type, inputs: { OPERAND1: textSlot(a), OPERAND2: textSlot(b) } })
const lt = compare('operator_lt')
const gt = compare('operator_gt')

const motor = (m: number, dir: 'forward' | 'backward', speed: number | B): B => ({
  type: 'thingBotC3_setMotor',
  fields: { MOTOR: String(m), DIRECTION: dir },
  inputs: { SPEED: slot(speed) },
})
const servo = (s: number, angle: number): B => ({ type: 'thingBotC3_setServoAngle', fields: { SERVO: String(s) }, inputs: { ANGLE: num(angle) } })
const joy = (axis: 'PSS_LX' | 'PSS_LY' | 'PSS_RX' | 'PSS_RY'): B => ({ type: 'ps2_GetJoystick', fields: { JOYSTICK: axis } })
const btn = (name: string): B => ({ type: 'ps2_getButton', fields: { BUTTON: name } })

const program = (...blocks: B[]) => ({ blocks: { languageVersion: 0, blocks } })
/** Toạ độ y của khối mũ thứ hai, đặt ngay dưới chồng khởi động có `n` khối lệnh (không chồng lên nhau). */
const below = (n: number) => 30 + 80 + n * 56 + 40

// ---------- Hộp công cụ (danh sách trong kế hoạch Task 10) ----------
const block = (type: string, extra: object = {}) => ({ kind: 'block', type, ...extra })
const category = (name: string, colour: string, secondaryColour: string, contents: object[]) => ({ kind: 'category', name, colour, secondaryColour, contents })

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { ...category('Sự kiện', '#FFD500', '#CC9900', [block('event_whenarduinobegin'), block('event_whenarduinoloop')]), categorystyle: 'events_category' },
    category('Điều khiển', '#FFAB19', '#CF8B17', [
      block('control_wait', { inputs: { DURATION: shadow('math_positive_number', 'NUM', 0.02) } }),
      block('control_if'),
      block('control_if_else'),
      block('control_repeat', { inputs: { TIMES: shadow('math_whole_number', 'NUM', 4) } }),
      block('control_forever'),
    ]),
    category('Toán tử', '#59C059', '#389438', [
      ...['operator_lt', 'operator_gt', 'operator_equals'].map((t) => block(t, { inputs: { OPERAND1: shadow('text', 'TEXT', ''), OPERAND2: shadow('text', 'TEXT', '128') } })),
      block('operator_and'),
      block('operator_or'),
      block('operator_not'),
      ...['operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide'].map((t) => block(t, { inputs: { NUM1: num(0), NUM2: num(0) } })),
    ]),
    category('ThingBot', '#6600ff', '#4400aa', [
      block('thingBotC3_init'),
      block('thingBotC3_initPS2'),
      block('thingBotC3_setMotor', { fields: { MOTOR: '1', DIRECTION: 'forward' }, inputs: { SPEED: num(50) } }),
      block('thingBotC3_setServoAngle', { inputs: { ANGLE: num(90) } }),
      block('thingBotC3_moveServoAngle', { inputs: { ANGLE: num(90), SECONDS: num(1) } }),
      block('thingBotC3_releaseServo'),
    ]),
    category('Tay cầm PS2', '#FF3399', '#C71585', [block('ps2_readData'), block('ps2_getButton'), block('ps2_GetJoystick')]),
    MY_BLOCKS_CATEGORY,
  ],
}

/** Mọi khối được phép trong chương trình mẫu: khối của hộp công cụ và bóng (ô số / ô chữ) của chúng. */
export const TOOLBOX_OPCODES: ReadonlySet<string> = new Set([
  'event_whenarduinobegin', 'event_whenarduinoloop',
  'control_wait', 'control_if', 'control_if_else', 'control_repeat', 'control_forever',
  'operator_lt', 'operator_gt', 'operator_equals', 'operator_and', 'operator_or', 'operator_not',
  'operator_add', 'operator_subtract', 'operator_multiply', 'operator_divide',
  'thingBotC3_init', 'thingBotC3_initPS2', 'thingBotC3_setMotor', 'thingBotC3_setServoAngle', 'thingBotC3_moveServoAngle', 'thingBotC3_releaseServo',
  'ps2_readData', 'ps2_getButton', 'ps2_GetJoystick',
  'math_number', 'math_positive_number', 'math_whole_number', 'text',
  // Khối của em (chuyên mục động, scratch-blocks tự dựng lời gọi).
  'procedures_definition', 'procedures_prototype', 'procedures_call', 'argument_reporter_string_number',
])

// ---------- Cơ cấu theo cấu hình ----------
type Port = string
/** Bật cơ cấu ở cổng `port`: động cơ TT tiến / lùi 100 hoặc dừng; servo 360: 180° tiến, 0° lùi, 90° dừng. */
const actuate = (port: Port, dir: 1 | 0 | -1): B => {
  if (port.startsWith('M')) return motor(Number(port.slice(1)), dir < 0 ? 'backward' : 'forward', dir === 0 ? 0 : 100)
  return servo(Number(port.slice(1)), dir > 0 ? 180 : dir < 0 ? 0 : 90)
}

/** Một bánh theo giá trị cần đã trộn `w` (−128…128 trở lên): vùng giữa ±`dead` là dừng. */
const wheel = (m: number, w: () => B, dead: number): B =>
  ifElse(
    gt(w(), dead),
    motor(m, 'forward', div(mul(w(), 100), 128)),
    ifElse(lt(w(), -dead), motor(m, 'backward', div(mul(sub(0, w()), 100), 128)), motor(m, 'forward', 0)),
  )

/** Bánh đế 2 bánh theo một cần (đẩy lên = số nhỏ = tiến): dưới 120 tiến, trên 136 lùi, giữa là dừng. */
const tankWheel = (m: number, axis: 'PSS_LY' | 'PSS_RY'): B =>
  ifElse(
    lt(joy(axis), 120),
    motor(m, 'forward', div(mul(sub(128, joy(axis)), 100), 128)),
    ifElse(gt(joy(axis), 136), motor(m, 'backward', div(mul(sub(joy(axis), 128), 100), 128)), motor(m, 'forward', 0)),
  )

/**
 * Đế 4 bánh: F = 128 − LY (tiến), S = LX − 128 (sang phải), T = RX − 128 (xoay phải).
 * Trước trái = F + S + T, trước phải = F − S − T, sau trái = F − S + T, sau phải = F + S − T
 * (ngược của công thức trong robot.ts: tiến = trung bình, ngang = (FL − FR − RL + RR) / 4).
 */
const mix = (fs: 1 | -1, ts: 1 | -1) => () => {
  const f = sub(128, joy('PSS_LY'))
  const s = sub(joy('PSS_LX'), 128)
  const t = sub(joy('PSS_RX'), 128)
  const fsPart = fs > 0 ? add(f, s) : sub(f, s)
  return ts > 0 ? add(fsPart, t) : sub(fsPart, t)
}

/** Góc ban đầu của servo cố định: kẹp cờ đóng, cửa đóng, tay hạ, Xe Phân Loại chọn ngăn cam. */
const servoSetup = (type: RobotType): B[] => {
  const def = ROBOTS[type]
  const out: B[] = []
  if (def.servos.S1) out.push(servo(1, 0))
  if (def.servos.S2) out.push(servo(2, def.flag ? 180 : 0))
  if (def.servos.S3) out.push(servo(3, 0))
  return out
}

function teleop(cfg: RobotConfig): object {
  const def = ROBOTS[cfg.type]
  const ports = portMap(cfg)
  const drive =
    cfg.drive === 'diff2'
      ? [tankWheel(1, 'PSS_LY'), tankWheel(2, 'PSS_RY')]
      : [wheel(1, mix(1, 1), 8), wheel(2, mix(-1, -1), 8), wheel(3, mix(-1, 1), 8), wheel(4, mix(1, -1), 8)]
  const mech: B[] = []
  if (ports.intake) mech.push(ifElse(btn('PSB_R1'), actuate(ports.intake, 1), actuate(ports.intake, 0)))
  if (ports.lift)
    mech.push(ifElse(btn('PSB_TRIANGLE'), actuate(ports.lift, 1), ifElse(btn('PSB_CROSS'), actuate(ports.lift, -1), actuate(ports.lift, 0))))
  if (cfg.type === 'ui') mech.push(ifThen(btn('PSB_TRIANGLE'), servo(1, 180)), ifThen(btn('PSB_CROSS'), servo(1, 0)))
  if (def.arm) mech.push(ifThen(btn('PSB_L1'), servo(1, 180)), ifThen(btn('PSB_L2'), servo(1, 0)))
  // Servo MG996R nâng cửa lồng: L2 Rãnh 1 (0°), R2 Rãnh 2 (120°), L1 Rãnh 3 (180°).
  if (def.chuteLift)
    mech.push(ifThen(btn('PSB_L1'), servo(1, 180)), ifThen(btn('PSB_R2'), servo(1, CHUTE_MID)), ifThen(btn('PSB_L2'), servo(1, 0)))
  if (def.flag) mech.push(ifElse(btn('PSB_SQUARE'), servo(2, 0), servo(2, 180)))
  if (cfg.type === 'sort') mech.push(ifThen(btn('PSB_L1'), servo(2, 0)), ifThen(btn('PSB_L2'), servo(2, 180)))
  if (def.servos.S3) mech.push(ifElse(btn('PSB_CIRCLE'), servo(3, 180), servo(3, 0)))
  const setup = [plain('thingBotC3_init'), plain('thingBotC3_initPS2'), ...servoSetup(cfg.type)]
  return program(
    hat('event_whenarduinobegin', 30, 30, chain(...setup)),
    hat('event_whenarduinoloop', 30, below(setup.length), chain(plain('ps2_readData'), ...drive, ...mech, wait(0.02))),
  )
}

/** Nút PS2 của bảng phím (⚙ › Phím điều khiển). */
export type Ps2Button = 'TRIANGLE' | 'CROSS' | 'SQUARE' | 'CIRCLE' | 'L1' | 'R1' | 'L2' | 'R2'

/**
 * Nút nào làm gì trong mẫu TeleOp của robot `cfg` — cùng điều kiện với `teleop` ngay trên (phép thử programs.test.ts
 * so với các khối `ps2_getButton` của chính mẫu). Nút không có trong bảng là mẫu không dùng.
 */
export function teleopButtons(cfg: RobotConfig): Partial<Record<Ps2Button, string>> {
  const def = ROBOTS[cfg.type]
  const ports = portMap(cfg)
  const out: Partial<Record<Ps2Button, string>> = {}
  if (ports.intake) out.R1 = `Giữ: ${def.mech.M3!.toLowerCase()}`
  if (ports.lift) {
    const what = def.mech.M4!.toLowerCase()
    // Họ Maker: thanh răng mang giá cờ (LIFT_AXIS 'back'), không lên xuống — Mẫu Maker đẩy ra mũi, mẫu cải tiến lùi ra đuôi.
    const back = LIFT_AXIS[cfg.type] === 'back'
    const toward = ROBOTS[cfg.type].flagFront ? 'đẩy ra mũi' : 'lùi ra đuôi'
    out.TRIANGLE = back ? `Giữ: ${what} ${toward}` : `Giữ: ${what} lên`
    out.CROSS = back ? `Giữ: ${what} thu về` : `Giữ: ${what} xuống`
  }
  if (cfg.type === 'ui') {
    out.TRIANGLE = 'Nâng gàu hớt'
    out.CROSS = 'Hạ gàu hớt'
  }
  if (def.arm) {
    out.L1 = cfg.type === 'co' ? 'Vươn tay cờ' : 'Nâng tay'
    out.L2 = cfg.type === 'co' ? 'Thu tay cờ' : 'Hạ tay'
  }
  if (def.chuteLift) {
    out.L1 = 'Nâng cửa lồng: Rãnh 3'
    out.R2 = 'Cửa lồng giữa: Rãnh 2'
    out.L2 = 'Hạ cửa lồng: Rãnh 1'
  }
  if (def.flag) out.SQUARE = 'Giữ: mở kẹp cờ'
  if (cfg.type === 'sort') {
    out.L1 = 'Chọn ngăn cam'
    out.L2 = 'Chọn ngăn xanh'
  }
  if (def.servos.S3) out.CIRCLE = cfg.type === 'sort' ? 'Giữ: mở cửa ngăn đang chọn' : 'Giữ: mở cửa xả'
  return out
}

/** Góc S1 đưa cửa lồng tới Rãnh 2 (S1 / 180 = 0,67 như CHUTE_FRAC của robot máy). */
const CHUTE_MID = 120

// ---------- Auto: chuỗi «set motor» + «đợi» ----------
/** Tốc độ của Auto (TT có vùng chết 20 %: 60 % ⇒ ≈ 0,28 m/s). */
const AUTO_SPEED = 60
/**
 * Giây chạy từng chặng, đo trên sân mô phỏng cho Robot 1 (phép thử programs.test.ts kiểm tra robot vào hẳn Vùng Bảo
 * Vệ). Chạy theo giờ thì lệch dần, nên mẫu ép xe vào rào trái hai lần để xe tự thẳng hàng rồi lùi ra một đoạn ngắn.
 */
export const AUTO_TIMES = {
  toMountain: 1.3, dump: 2, back: 0.6,
  /** Quay 90° tại chỗ (đế 2 bánh): tỉ lệ với bề ngang xe, giây cho mỗi mét bề ngang. */
  turnPerWidth: 2.75,
  toWall: 2.4, offWall: 0.3, toSafe: 4.4, press: 1, settle: 0.25,
}

/** Lệnh cho các bánh: đế 2 bánh (trái, phải) hoặc 4 bánh (trước trái, trước phải, sau trái, sau phải), −1…1. */
const wheels = (cfg: RobotConfig, w: number[]): B[] => {
  const ms = cfg.drive === 'diff2' ? [1, 2] : [1, 2, 3, 4]
  return ms.map((m, k) => motor(m, w[k] < 0 ? 'backward' : 'forward', Math.abs(w[k]) * AUTO_SPEED))
}

function auto(cfg: RobotConfig): object {
  const def = ROBOTS[cfg.type]
  const four = cfg.drive !== 'diff2'
  const T = AUTO_TIMES
  const turn = Math.round(T.turnPerWidth * def.size.w * 100) / 100
  const fwd = four ? [1, 1, 1, 1] : [1, 1]
  const back = fwd.map((v) => -v)
  const stop = fwd.map(() => 0)
  const left = [-1, 1] // đế 2 bánh: trái lùi, phải tiến = quay trái
  const right = [1, -1]
  const strafeLeft = [-1, 1, 1, -1] // đế 4 bánh: ngang S < 0 (xem `mix`)
  const strafeRight = [1, -1, -1, 1]
  const leg = (w: number[], s: number) => [...wheels(cfg, w), wait(s)]
  // Sau khi xả: lùi khỏi núi, sang rào trái (ép cho thẳng), lùi ra, xuôi theo rào tới hàng Vùng Bảo Vệ, ép rào lần nữa.
  const route = four
    ? [...leg(back, T.back), ...leg(strafeLeft, T.toWall), ...leg(strafeRight, T.offWall), ...leg(fwd, T.toSafe), ...leg(strafeLeft, T.press), ...leg(strafeRight, T.settle)]
    : [
        ...leg(back, T.back), ...leg(left, turn), ...leg(fwd, T.toWall), ...leg(back, T.offWall), ...leg(right, turn),
        ...leg(fwd, T.toSafe), ...leg(left, turn), ...leg(fwd, T.press), ...leg(back, T.settle),
      ]
  const dump = def.servos.S3 ? [servo(3, 180), wait(T.dump), servo(3, 0)] : [wait(T.dump)]
  const setup = [plain('thingBotC3_init'), ...servoSetup(cfg.type), ...leg(fwd, T.toMountain), ...wheels(cfg, stop), ...dump, ...route, ...wheels(cfg, stop)]
  return program(hat('event_whenarduinobegin', 30, 30, chain(...setup)), hat('event_whenarduinoloop', 30, below(setup.length)))
}

/** Chương trình mẫu cho một cấu hình robot bất kỳ (robot mẫu × đế bánh × cơ cấu M3/M4). */
export function sample(cfg: RobotConfig, kind: 'teleop' | 'auto'): object {
  return kind === 'teleop' ? teleop(cfg) : auto(cfg)
}

/** Cấu hình mặc định của mỗi robot mẫu: đế đầu tiên trong danh sách, cơ cấu động cơ TT. */
export const defaultConfig = (type: RobotType): RobotConfig => ({ type, drive: ROBOTS[type].drives[0], actuator: 'tt' })

export const SAMPLES: Record<RobotType, { teleop: object; auto: object }> = Object.fromEntries(
  (Object.keys(ROBOTS) as RobotType[]).map((t) => [t, { teleop: sample(defaultConfig(t), 'teleop'), auto: sample(defaultConfig(t), 'auto') }]),
) as Record<RobotType, { teleop: object; auto: object }>
