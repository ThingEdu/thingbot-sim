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
}

export const ROBOTS: Record<RobotType, RobotDef> = {
  maker: {
    type: 'maker', name: 'Mẫu Maker',
    size: { w: 0.24, l: 0.3, h: 0.216 },
    drives: ['diff2', 'omni', 'mecanum'],
    mech: { M3: 'Tay vòng xúc bóng', M4: 'Thanh trượt răng' },
    servos: { S1: 'Nâng tay', S2: 'Kẹp cờ', S3: 'Cửa xả' },
    storage: 6, hpLoad: false, flag: true,
    release: { y: 0.2, reach: 0.05 }, maxExtend: 0.13,
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
    servos: { S1: 'Nâng tay kẹp', S2: 'Kẹp cờ', S3: 'Cửa thùng' },
    storage: 12, hpLoad: true, flag: true,
    release: { y: 0.2, reach: 0.05 }, maxExtend: 0.08,
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

/** Ô "kiểm tra theo luật": kích thước xuất phát, mức mở rộng, số động cơ TT / 4, số servo / 5. */
export function ruleChecks(cfg: RobotConfig, extendNow: number): { ok: boolean | 'note'; text: string }[] {
  const def = ROBOTS[cfg.type]
  const s360 = effectiveActuator(cfg) === 's360'
  const mechCount = Object.keys(def.mech).length
  const motors = (cfg.drive === 'diff2' ? 2 : 4) + (s360 ? 0 : mechCount)
  const servos = Object.keys(def.servos).length + (s360 ? mechCount : 0)
  const { w, l, h } = def.size
  const startOk = Math.max(w, l) <= 0.3 + 1e-9 && h <= 0.85 + 1e-9
  const extent = Math.max(w, l) + extendNow
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
