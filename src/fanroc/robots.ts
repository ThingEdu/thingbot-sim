// 4 robot mẫu FANROC, cách ghép cổng ThingBot theo đế bánh / cơ cấu và kiểm tra theo luật (spec 4.3).
// Đơn vị: mét. Kích thước theo bản dựng thử 3D, sẽ thay khi có STEP.
import type { PortValues } from './ports.ts'
import type { Ps2Button } from './programs.ts'
import { ZONES } from './layout.ts'
import { HOOK_TIP, hookTop } from './ladder.ts'

export type RobotType = 'maker' | 'makerLift' | 'makerIntake' | 'makerPro' | 'ui' | 'co' | 'sort'
export type Drive = 'diff2' | 'omni' | 'mecanum'
export type Actuator = 'tt' | 's360'

export interface RobotDef {
  type: RobotType
  name: string
  /** w ngang, l dài, h cao. */
  size: { w: number; l: number; h: number }
  drives: Drive[]
  /** Cơ cấu gắn vào M3 / M4 khi dùng động cơ TT (hoặc S4 / S5 khi dùng servo 360). */
  mech: Partial<Record<'M3' | 'M4', string>>
  /** Servo cố định của robot. */
  servos: Partial<Record<'S1' | 'S2' | 'S3', string>>
  /** Sức chứa bóng (Xe Phân Loại: 5 + 5 hai ngăn). */
  storage: number
  /** Có chở được bóng nhẹ hai (HP) không. */
  hpLoad: boolean
  /** Có tay kẹp cờ không. */
  flag: boolean
  /**
   * Móc leo Thang Cứu Hỏa (luật V4): servo ở cổng `port`, giữ nút `button` của mẫu TeleOp là giơ móc (180°), nhả là hạ
   * (0°, kéo robot lên xà). Móc đặt ở tâm thân xe, mọi mẫu như nhau.
   */
  hook: { port: 'S1' | 'S2' | 'S4'; button: Ps2Button }
  /** Điểm nhả bóng: độ cao y và tầm với reach phía trước. */
  release: { y: number; reach: number }
  /** Mức mở rộng tối đa ra khỏi kích thước xuất phát. */
  maxExtend: number
  /**
   * Tay kẹp cờ do S1 điều khiển (ruling R17): ở S1 = 180° điểm kẹp vươn thêm `reach` tới trước và cao thêm `up`
   * (tuyến tính theo S1 / 180). Không có thì S1 không làm gì.
   */
  arm?: { reach: number; up: number }
  /**
   * Bóng ra ở cửa máng thay cho `release` (Mẫu Maker: lồng ống cong xuống vòng cửa ra trước thân, servo S3 chặn cửa; không
   * có cơ cấu nâng hạ nên chỉ tới Rãnh 1). `reach` tính từ mũi khung (âm = lùi vào trong thân), `y` là tâm bóng so với sàn.
   */
  chute?: { reach: number; y: number }
  /**
   * Cửa ra của lồng ở ĐUÔI xe (Mẫu Maker vẽ quay đầu, anh Tuấn chốt 10/11: hai càng lõm ủn bóng ở mũi, vòng cửa ra ở
   * đuôi): điểm xả là `chute` lật ra sau tâm xe — `reach` khi đó tính từ mép đuôi; bóng lăn ra phía sau.
   */
  chuteBehind?: boolean
  /**
   * Cửa ra của lồng ở S1 = 180° khi có servo MG996R nâng cửa lồng (mẫu Maker Nâng / Maker Pro): cửa ra đi thẳng từ `chute`
   * (S1 = 0°) tới đây theo S1 / 180 — với tới Rãnh 2–3. Phần vượt mũi khung tính vào mức mở rộng.
   */
  chuteLift?: { reach: number; y: number }
  /**
   * Thanh răng M4 trượt ngang trên nóc (họ Maker, CAD "Bộ thingbot mới"; luật V4 không còn giá cờ trên thanh): `end` = đầu
   * thanh cách tâm xe lúc thu hết, `front` = phần đầu kia nhô khỏi mép khung lúc thu (đẩy thanh thì đầu đó ngắn lại tối đa
   * chừng này), `forward` = thanh đẩy ra mũi (Mẫu Maker vẽ quay đầu, anh Tuấn chốt 10/11) thay vì lùi ra đuôi.
   */
  rack?: { end: number; front: number; forward: boolean }
  /** Dựng hình từ CAD Mẫu Maker (thân, lồng ống, thanh răng, bánh) và các phần cải tiến của nó. */
  cad?: 'maker'
}

const MAKER: RobotDef = {
  type: 'maker', name: 'Mẫu Maker',
  size: { w: 0.24, l: 0.3, h: 0.216 },
  drives: ['diff2', 'omni', 'mecanum'],
  // Không xúc bóng trên sân (anh Tuấn chốt 06/11): về Khu Tiếp Tế để Human Player bỏ bóng vào lồng ống, 4 bóng là đầy;
  // servo S3 mở cửa ra cuối lồng; robot mẫu không có cơ cấu nâng hạ lồng nên chỉ tới Rãnh 1 (bậc thấp nhất).
  // Luật V4 (anh Tuấn chốt 12/11): họ Maker bỏ cắm cờ, cổng S2 (trước là kẹp cờ) làm móc leo xà.
  mech: { M4: 'Thanh trượt răng' },
  // S1 trống (luật V4: "nâng tay" chỉ nâng điểm kẹp cờ, họ Maker không còn cờ ⇒ bỏ hẳn, rà soát cuối 12/11).
  servos: { S2: 'Móc leo xà', S3: 'Cửa xả' },
  storage: 4, hpLoad: false, flag: false,
  hook: { port: 'S2', button: 'SQUARE' },
  // Thanh răng 300 mm, bánh răng giữa xe: lùi được ~200 mm (CAD) — đúng trần mở rộng 500 mm của luật.
  release: { y: 0.2, reach: 0.05 }, maxExtend: 0.2,
  // Thanh răng: lúc thu đầu thanh ngang mép khung (CAD 150 mm), đầu kia nhô 39 mm; đẩy hết thì nhô thêm 200 mm.
  rack: { end: 0.15, front: 0.039, forward: true },
  // Vòng cửa ra của lồng (CAD: tâm 68 mm trước tâm khung, cao 93 mm); bóng qua vòng rơi ra ở ~100 mm trước tâm.
  chute: { reach: -0.05, y: 0.093 },
  chuteBehind: true,
  cad: 'maker',
}

/** Cửa ra lồng nâng bằng servo MG996R ở S1 (thay "nâng tay"): S1 = 180° ⇒ cửa ra cao 210 mm, vượt mũi khung 130 mm. */
const CHUTE_LIFT = { reach: 0.13, y: 0.21 }
/** Ống lồng nối dài (in 3D / ống nhựa cùng cỡ) cho 8 bóng: miệng ống cao 350 mm (luật cho tới 850 mm). */
const TALL_H = 0.35

export const ROBOTS: Record<RobotType, RobotDef> = {
  maker: MAKER,
  // Ba mẫu cải tiến chỉ dùng linh kiện có trong CAD "Bộ thingbot mới" (servo MG996R, động cơ TT, bánh D65, thanh răng).
  makerLift: {
    ...MAKER, chuteBehind: false, rack: { ...MAKER.rack!, forward: false }, type: 'makerLift', name: 'Maker Nâng',
    servos: { S1: 'Nâng cửa lồng (MG996R)', S2: 'Móc leo xà', S3: 'Cửa xả' },
    chuteLift: CHUTE_LIFT,
  },
  makerIntake: {
    ...MAKER, chuteBehind: false, rack: { ...MAKER.rack!, forward: false }, type: 'makerIntake', name: 'Maker Hút',
    size: { ...MAKER.size, h: TALL_H },
    mech: { M3: 'Con lăn hút', M4: 'Thanh trượt răng' },
    storage: 8,
  },
  makerPro: {
    ...MAKER, chuteBehind: false, rack: { ...MAKER.rack!, forward: false }, type: 'makerPro', name: 'Maker Pro',
    size: { ...MAKER.size, h: TALL_H },
    drives: ['omni', 'mecanum', 'diff2'],
    mech: { M3: 'Con lăn hút', M4: 'Thanh trượt răng' },
    servos: { S1: 'Nâng cửa lồng (MG996R)', S2: 'Móc leo xà', S3: 'Cửa xả' },
    storage: 8,
    chuteLift: CHUTE_LIFT,
  },
  ui: {
    type: 'ui', name: 'Xe Ủi',
    size: { w: 0.18, l: 0.24, h: 0.15 },
    drives: ['diff2'],
    mech: {},
    servos: { S1: 'Gàu hớt', S2: 'Móc leo xà' },
    storage: 15, hpLoad: false, flag: false,
    hook: { port: 'S2', button: 'SQUARE' },
    release: { y: 0.1, reach: 0.05 }, maxExtend: 0,
  },
  co: {
    type: 'co', name: 'Xe Cắm Cờ',
    size: { w: 0.185, l: 0.28, h: 0.25 },
    drives: ['diff2', 'omni'],
    mech: { M4: 'Nâng thùng' },
    servos: { S1: 'Vươn tay cờ', S2: 'Kẹp cờ', S3: 'Cửa thùng' },
    storage: 12, hpLoad: true, flag: true,
    // S1–S3 đã dùng cho cờ / thùng: móc ở S4 (bảng cổng ghi "S4: Móc leo xà"), nút R1 (□ vẫn là kẹp cờ).
    hook: { port: 'S4', button: 'R1' },
    release: { y: 0.2, reach: 0.05 }, maxExtend: 0.08,
    arm: { reach: 0.14, up: 0 },
  },
  sort: {
    type: 'sort', name: 'Xe Phân Loại',
    size: { w: 0.24, l: 0.26, h: 0.16 },
    drives: ['diff2', 'mecanum', 'omni'],
    mech: { M3: 'Con lăn hút' },
    // S2 chọn ngăn (< 90° ngăn cam, ≥ 90° ngăn xanh), S3 là cửa xả của ngăn đang chọn.
    servos: { S1: 'Móc leo xà', S2: 'Chọn ngăn', S3: 'Cửa xả ngăn' },
    storage: 10, hpLoad: false, flag: false,
    hook: { port: 'S1', button: 'SQUARE' },
    release: { y: 0.1, reach: 0.05 }, maxExtend: 0,
  },
}

export interface RobotConfig { type: RobotType; drive: Drive; actuator: Actuator }

type Port = keyof PortValues
type WheelKey = 'L' | 'R' | 'FL' | 'FR' | 'RL' | 'RR'

export interface PortMap {
  wheels: Record<WheelKey, Port | undefined>
  intake?: Port
  lift?: Port
  intakeKind?: 'motor' | 's360'
  liftKind?: 'motor' | 's360'
}

/** Đế 4 bánh đa hướng buộc cơ cấu dùng servo 360 (M3/M4 đã thành bánh sau). */
const effectiveActuator = (cfg: RobotConfig): Actuator => (cfg.drive === 'diff2' ? cfg.actuator : 's360')

export function portMap(cfg: RobotConfig): PortMap {
  const def = ROBOTS[cfg.type]
  const four = cfg.drive !== 'diff2'
  const s360 = effectiveActuator(cfg) === 's360'
  const wheels: PortMap['wheels'] = four
    ? { L: undefined, R: undefined, FL: 'M1', FR: 'M2', RL: 'M3', RR: 'M4' }
    : { L: 'M1', R: 'M2', FL: undefined, FR: undefined, RL: undefined, RR: undefined }
  const map: PortMap = { wheels }
  if (def.mech.M3) { map.intake = s360 ? 'S4' : 'M3'; map.intakeKind = s360 ? 's360' : 'motor' }
  if (def.mech.M4) { map.lift = s360 ? 'S5' : 'M4'; map.liftKind = s360 ? 's360' : 'motor' }
  return map
}

const mm = (m: number): number => Math.round(m * 1000)

/**
 * Ô "kiểm tra theo luật": kích thước xuất phát, mức mở rộng, số động cơ TT / 4, số servo / 5.
 * `armFrac` = S1 / 180 của tay kẹp cờ (0…1); phần tay vươn tới trước tính vào mức mở rộng.
 */
export function ruleChecks(cfg: RobotConfig, extendNow: number, armFrac = 0): { ok: boolean | 'note'; text: string }[] {
  const def = ROBOTS[cfg.type]
  const s360 = effectiveActuator(cfg) === 's360'
  const mechCount = Object.keys(def.mech).length
  const motors = (cfg.drive === 'diff2' ? 2 : 4) + (s360 ? 0 : mechCount)
  // Móc ở cổng ngoài `servos` (Xe Cắm Cờ: S4) vẫn là một servo.
  const hookExtra = def.hook.port in def.servos ? 0 : 1
  const servos = Object.keys(def.servos).length + (s360 ? mechCount : 0) + hookExtra
  // R01 tính cả móc đã thu (0°): cần ống lồng đứng ở tâm nóc, thanh ngang chữ J vươn HOOK_TIP.reach khỏi tâm.
  const w = Math.max(def.size.w, 2 * HOOK_TIP.reach)
  const l = Math.max(def.size.l, 2 * HOOK_TIP.reach)
  const h = Math.max(def.size.h, hookTop(def, 0, false))
  const startOk = Math.max(w, l) <= 0.3 + 1e-9 && h <= 0.85 + 1e-9
  const extent = Math.max(w, l) + extendNow + armFrac * (def.arm?.reach ?? 0) + Math.max(0, chuteExit(def, armFrac)?.reach ?? 0)
  const out: { ok: boolean | 'note'; text: string }[] = [
    { ok: startOk, text: `R01 kích thước xuất phát (cả móc đã thu): ${mm(w)} × ${mm(l)} × ${mm(h)} mm (giới hạn 300 × 300 × 850 mm)` },
    { ok: extent <= 0.5 + 1e-9, text: `Mở rộng một chiều: ${mm(extent)} mm / 500 mm` },
    { ok: motors <= 4, text: `Động cơ TT: ${motors} / 4` },
    { ok: servos <= 5, text: `Servo: ${servos} / 5` },
  ]
  if (cfg.type === 'ui') {
    const safe = ZONES.ladder.red.x1 - ZONES.ladder.red.x0
    out.push({ ok: 2 * w <= safe + 1e-9, text: `Hai Xe Ủi cạnh nhau: 2 × ${mm(w)} mm ≤ ${mm(safe)} mm (ô Thang Cứu Hỏa)` })
  }
  return out
}

/**
 * Cơ cấu M4 đẩy điểm kẹp cờ theo hướng nào: Xe Cắm Cờ nâng thùng lên. Họ Maker (luật V4, chốt 12/11) không còn mang cờ:
 * thanh răng M4 giữ nguyên hình CAD nhưng không đẩy điểm kẹp nào nên không có ở đây.
 */
export const LIFT_AXIS: Partial<Record<RobotType, 'forward' | 'up'>> = { co: 'up' }

/** Cửa ra của lồng ở S1 = `frac` × 180° (m, `reach` tính từ mũi khung), hoặc null nếu robot xả bóng theo `release`. */
export function chuteExit(def: RobotDef, frac: number): { reach: number; y: number } | null {
  const c = def.chute
  if (!c) return null
  const t = def.chuteLift
  if (!t) return c
  const f = Math.max(0, Math.min(1, frac))
  return { reach: c.reach + (t.reach - c.reach) * f, y: c.y + (t.y - c.y) * f }
}

/** Điểm kẹp cờ trong hệ toạ độ của hình robot (gốc tâm xe trên sàn, mũi +z), m — như RobotBody.gripPoint. */
export function localGripPoint(def: RobotDef, extend: number, armFrac: number): { x: number; y: number; z: number } {
  const axis = LIFT_AXIS[def.type]
  const up = axis === 'up' ? extend : 0
  const arm = armFrac * (def.arm?.reach ?? 0)
  const y = def.release.y + up + armFrac * (def.arm?.up ?? 0)
  return { x: 0, y, z: def.size.l / 2 + def.release.reach + (axis === 'forward' ? extend : 0) + arm }
}

/** Phần thanh răng M4 nhô khỏi mép khung (ra trước mũi với `rack.forward`, còn lại ra sau đuôi), m; robot không có thanh 0. */
export function rackOverhang(def: RobotDef, extend: number): number {
  return def.rack ? Math.max(0, def.rack.end + extend - def.size.l / 2) : 0
}

/**
 * Mức mở rộng một chiều theo luật của thanh răng: phần nhô ra trừ phần đầu kia ngắn lại (thanh trượt thì đầu bên kia
 * cũng thụt vào), m; robot không có thanh 0.
 */
export function rackExtent(def: RobotDef, extend: number): number {
  return Math.max(0, rackOverhang(def, extend) - Math.min(extend, def.rack?.front ?? 0))
}
