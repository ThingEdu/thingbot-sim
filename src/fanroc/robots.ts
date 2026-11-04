// 4 robot mẫu FANROC, cách ghép cổng ThingBot theo đế bánh / cơ cấu và kiểm tra theo luật (spec 4.3).
// Đơn vị: mét. Kích thước theo bản dựng thử 3D, sẽ thay khi có STEP.
import type { PortValues } from './ports.ts'
import { ZONES } from './layout.ts'

export type RobotType = 'maker' | 'ui' | 'co' | 'sort'
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
   * Robot cắm cờ bằng đuôi (LIFT_AXIS 'back'): tâm giá giữ cờ lúc thanh răng thu hết cách tâm xe `rest` m về phía sau;
   * `half` = nửa cỡ giá + đế cờ (phần nhô ra sau); `front` = phần thanh răng nhô trước mũi lúc thu (lùi thanh thì mũi
   * ngắn lại tối đa chừng này). CAD Mẫu Maker: cả cụm dài 302 mm (đuôi khung −116 … mũi thanh răng +186 mm quanh tâm khung).
   */
  rearGrip?: { rest: number; half: number; front: number }
}

export const ROBOTS: Record<RobotType, RobotDef> = {
  maker: {
    type: 'maker', name: 'Mẫu Maker',
    size: { w: 0.24, l: 0.3, h: 0.216 },
    drives: ['diff2', 'omni', 'mecanum'],
    mech: { M3: 'Tay vòng xúc bóng', M4: 'Thanh trượt răng' },
    servos: { S1: 'Nâng tay', S2: 'Kẹp cờ', S3: 'Cửa xả' },
    storage: 6, hpLoad: false, flag: true,
    // Thanh răng 300 mm, bánh răng giữa xe: lùi được ~200 mm (CAD) — đúng trần mở rộng 500 mm của luật.
    release: { y: 0.2, reach: 0.05 }, maxExtend: 0.2,
    arm: { reach: 0, up: 0.06 },
    rearGrip: { rest: 0.1265, half: 0.0235, front: 0.039 },
  },
  ui: {
    type: 'ui', name: 'Xe Ủi',
    size: { w: 0.18, l: 0.24, h: 0.15 },
    drives: ['diff2'],
    mech: {},
    servos: { S1: 'Gàu hớt' },
    storage: 15, hpLoad: false, flag: false,
    release: { y: 0.1, reach: 0.05 }, maxExtend: 0,
  },
  co: {
    type: 'co', name: 'Xe Cắm Cờ',
    size: { w: 0.185, l: 0.28, h: 0.25 },
    drives: ['diff2', 'omni'],
    mech: { M4: 'Nâng thùng' },
    servos: { S1: 'Vươn tay cờ', S2: 'Kẹp cờ', S3: 'Cửa thùng' },
    storage: 12, hpLoad: true, flag: true,
    release: { y: 0.2, reach: 0.05 }, maxExtend: 0.08,
    arm: { reach: 0.14, up: 0 },
  },
  sort: {
    type: 'sort', name: 'Xe Phân Loại',
    size: { w: 0.24, l: 0.26, h: 0.16 },
    drives: ['diff2', 'mecanum', 'omni'],
    mech: { M3: 'Con lăn hút' },
    // S2 chọn ngăn (< 90° ngăn cam, ≥ 90° ngăn xanh), S3 là cửa xả của ngăn đang chọn.
    servos: { S2: 'Chọn ngăn', S3: 'Cửa xả ngăn' },
    storage: 10, hpLoad: false, flag: false,
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
  const servos = Object.keys(def.servos).length + (s360 ? mechCount : 0)
  const { w, l, h } = def.size
  const startOk = Math.max(w, l) <= 0.3 + 1e-9 && h <= 0.85 + 1e-9
  const extent = Math.max(w, l) + extendNow + armFrac * (def.arm?.reach ?? 0)
  const out: { ok: boolean | 'note'; text: string }[] = [
    { ok: startOk, text: `R01 kích thước xuất phát: ${mm(w)} × ${mm(l)} × ${mm(h)} mm (giới hạn 300 × 300 × 850 mm)` },
    { ok: extent <= 0.5 + 1e-9, text: `Mở rộng một chiều: ${mm(extent)} mm / 500 mm` },
    { ok: motors <= 4, text: `Động cơ TT: ${motors} / 4` },
    { ok: servos <= 5, text: `Servo: ${servos} / 5` },
  ]
  if (cfg.type === 'ui') {
    const safe = ZONES.safe.red.x1 - ZONES.safe.red.x0
    out.push({ ok: 2 * w <= safe + 1e-9, text: `Hai Xe Ủi cạnh nhau: 2 × ${mm(w)} mm ≤ ${mm(safe)} mm (ô Vùng Bảo Vệ)` })
  }
  return out
}

/**
 * Cơ cấu M4 đẩy điểm kẹp cờ theo hướng nào. Mẫu Maker (CAD Onshape "Bộ thingbot mới"): thanh răng trên nóc lùi ra
 * ĐUÔI xe, mang servo + giá giữ cờ ở đuôi thanh — cắm cờ bằng đuôi xe (anh Tuấn chốt 05/11). Xe Cắm Cờ: nâng thùng lên.
 */
export const LIFT_AXIS: Partial<Record<RobotType, 'forward' | 'back' | 'up'>> = { maker: 'back', co: 'up' }

/** Điểm kẹp cờ trong hệ toạ độ của hình robot (gốc tâm xe trên sàn, mũi +z), m — như RobotBody.gripPoint. */
export function localGripPoint(def: RobotDef, extend: number, armFrac: number): { x: number; y: number; z: number } {
  const axis = LIFT_AXIS[def.type]
  const up = axis === 'up' ? extend : 0
  const arm = armFrac * (def.arm?.reach ?? 0)
  const y = def.release.y + up + armFrac * (def.arm?.up ?? 0)
  if (axis === 'back') return { x: 0, y, z: -((def.rearGrip?.rest ?? def.size.l / 2 + def.release.reach) + extend + arm) }
  return { x: 0, y, z: def.size.l / 2 + def.release.reach + (axis === 'forward' ? extend : 0) + arm }
}

/**
 * Mức mở rộng một chiều tính theo luật của robot cắm cờ bằng đuôi: phần nhô ra sau trừ phần mũi ngắn lại (thanh răng
 * lùi thì đầu trước của nó cũng lùi vào), m; robot khác 0.
 */
export function rearExtent(def: RobotDef, extend: number, armFrac: number): number {
  return Math.max(0, rearOverhang(def, extend, armFrac) - Math.min(extend, def.rearGrip?.front ?? 0))
}

/** Phần nhô ra sau đuôi xe của robot cắm cờ bằng đuôi (giá cờ + đế cờ vượt mép sau), m; robot khác 0. */
export function rearOverhang(def: RobotDef, extend: number, armFrac: number): number {
  if (LIFT_AXIS[def.type] !== 'back') return 0
  return Math.max(0, -localGripPoint(def, extend, armFrac).z + (def.rearGrip?.half ?? 0) - def.size.l / 2)
}
