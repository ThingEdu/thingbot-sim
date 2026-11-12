// Agent đồng đội FANROC mức Dễ / Vừa / Khó (spec §4.6). Agent chỉ ra lệnh qua PortValues — lái M1/M2 (hoặc 4 bánh),
// cơ cấu theo portMap — nên chịu đúng vật lý của chương trình học sinh: không dịch chuyển tức thời, không cầm bóng bằng tay.
// Chiến thuật theo bản thử 2D (docs/superpowers/specs/fanroc-spike/sim.js, decide()): cắm cờ trước, chọn rãnh theo giá trị
// kỳ vọng, gỡ bóng xanh khỏi Khu Chữa Cháy (khó), leo Thang Cứu Hỏa sát giờ (luật V4), không nhận bóng khi không còn đủ giờ
// đi giao.
// Không đồ hoạ: chạy được trong Node.
import { mulberry32, type FanrocWorld } from './world.ts'
import type { RobotBody, Vec2 } from './robot.ts'
import { DEAD_ZONE, V_MAX, ttFraction } from './robot.ts'
import type { Match } from './match.ts'
import type { HumanPlayer } from './human.ts'
import { FIELD, LADDER, MATCH_S, MOUNTAINS, MOUNTAIN_FOOT, ZONES, toMountain, type Rect } from './layout.ts'
import { NEUTRAL, type PortValues } from './ports.ts'
import { LIFT_AXIS, portMap, type PortMap, type RobotConfig } from './robots.ts'
import { HOOK, barYaw, ladderLen, pointAt, project, type Climb } from './ladder.ts'

export type Skill = 'easy' | 'medium' | 'hard'
type Alliance = 'red' | 'blue'
export type AgentView = { world: FanrocWorld; robots: RobotBody[]; match: Match; humans: HumanPlayer[] }

// ---------- Tham số theo mức (gom một chỗ) ----------
interface SkillDef {
  /** Phần tốc độ so với mức khó (tính trên phần vượt vùng chết của động cơ TT). */
  speed: number
  /** Biên độ lệch hướng ngẫu nhiên, rad. */
  noise: number
  /** Xác suất mỗi giây lỡ tay mở cửa xả khi đang chở bóng. */
  dropPerS: number
  /**
   * Mức leo Thang Cứu Hỏa cuối trận: contact = chỉ giơ móc chạm xà, ground = treo Đất (thanh theo CAD lắp sân chỉ vừa một
   * robot treo ở Đất: ô 1 chạm xà), water = treo rồi trượt sang Nước. Mức của từng ô xem CLIMB_PLAN.
   */
  climbTarget: Climb
  /** Đi leo khi thời gian còn ≤ thời gian ước tính (đi + bám + trượt) + chừng này giây. */
  climbMargin: number
  /** Chỉ đi cắm cờ sau chừng này giây thi đấu (khó: ngay từ đầu). */
  flagAfter: number
  /** Mở kẹp khi điểm kẹp cách tâm lỗ ≤ chừng này (luật vật lý: cắm được khi ≤ 0.025). */
  flagTol: number
  flagTries: number
  /** Chỉ hút bóng đúng màu đang gom (người lái tốt nhìn bóng rồi mới bật tay xúc). */
  selective: boolean
  /** Xác suất mỗi chuyến giao bỏ qua màu (đổ cả bóng cam lên núi). */
  wrongColor: number
  /** Các rãnh (0..2) được chọn. */
  grooves: number[]
  /** Chọn rãnh theo giá trị kỳ vọng (phủ đủ 3 rãnh để cờ lên 40). */
  ev: boolean
  /** Ưu tiên gỡ bóng xanh khỏi Khu Chữa Cháy. */
  clearFire: boolean
  /** Biết nhận bóng từ Human Player ở Khu Tiếp Tế. */
  load: boolean
  /** Robot không hút bóng (Mẫu Maker): ủi cả bóng cam vào Khu Chữa Cháy gần nhất khi đường đẩy không vướng bóng xanh. */
  herdOrange: boolean
}

const SKILLS: Record<Skill, SkillDef> = {
  easy: {
    speed: 0.6, noise: 0.3, dropPerS: 0.05, climbTarget: 'contact', climbMargin: 6, flagAfter: 60, flagTol: 0.04, flagTries: 1,
    selective: false, wrongColor: 0.3, grooves: [0, 1], ev: false, clearFire: false, load: false, herdOrange: false,
  },
  medium: {
    speed: 0.75, noise: 0, dropPerS: 0, climbTarget: 'ground', climbMargin: 8, flagAfter: 30, flagTol: 0.024, flagTries: 2,
    selective: false, wrongColor: 0, grooves: [0, 1], ev: false, clearFire: false, load: true, herdOrange: true,
  },
  hard: {
    speed: 1, noise: 0, dropPerS: 0, climbTarget: 'water', climbMargin: 8, flagAfter: 0, flagTol: 0.024, flagTries: 6,
    selective: true, wrongColor: 0, grooves: [0, 1, 2], ev: true, clearFire: true, load: true, herdOrange: true,
  },
}

// ---------- Số đo lái và chiến thuật ----------
/** Lệnh động cơ khi chạy đường dài ở mức khó, khi tiến sát mục tiêu, và khi quay tại chỗ. */
const CMD_CRUISE = 100
const CMD_SLOW = 45
const CMD_TURN = 40
/** Lệnh nhỏ nhất để bánh còn quay (vùng chết 20 %). */
const CMD_MIN = DEAD_ZONE + 5
/** Lệnh bánh nhỏ hơn chừng này coi như muốn dừng bánh đó. */
const WHEEL_OFF = 10
/** Bộ điều khiển P theo sai số hướng (lệnh / rad). */
const K_TURN = 60
/** Sai số hướng lớn hơn chừng này thì quay tại chỗ. */
const TURN_IN_PLACE = 0.8
/** Lúc tiến vào núi: lệch hướng hơn chừng này thì quay tại chỗ. */
const PUSH_TURN = 0.15
const LOOKAHEAD = 0.18
const REPLAN_S = 1.2
/** Kẹt: có lệnh chạy mà tốc độ < STUCK_V quá STUCK_S giây ⇒ lùi gỡ RECOVER_S giây. */
const STUCK_V = 0.03
const STUCK_S = 1.2
const RECOVER_S = 0.7
/** Đi tới đích (goTo) mà NO_PROGRESS_S giây không lại gần thêm NO_PROGRESS_M ⇒ coi như kẹt (lắc qua lại giữa rào và
 *  núi: lúc quay lúc nhích nên bộ "đứng yên" không bắt được) ⇒ lùi gỡ và lập đường lại. */
const NO_PROGRESS_S = 3
const NO_PROGRESS_M = 0.03
/** Tiến vào núi: dừng khi đứng yên chừng này giây (đã chạm gờ). */
const CONTACT_S = 0.3
/** Điểm chờ trước một mặt núi, cách tâm lỗ cờ. */
const APPROACH_R = 0.5
const APPROACH_MIN = 0.4
/**
 * Quay tại chỗ cần tâm xe cách chướng ngại ≥ nửa đường chéo thân (√(0.12² + 0.15²) ≈ 0.19). Hành lang giữa hai núi
 * rộng ≈ 0.29 nên xe chỉ đi thẳng qua được, không quay vào mặt núi trong hành lang được (vd. mặt lỗ cờ của Núi D).
 */
const TURN_CLEAR = 0.2
/** Mức vươn của thanh trượt để bóng rơi vào Rãnh 1 / 2 / 3 khi mũi xe chạm gờ (đo trên sân CAD với Mẫu Maker). */
const DROP_EXTEND = [0, 0.02, 0.08]
/** Servo nâng cửa lồng (S1 / 180) để bóng rơi vào Rãnh 1 / 2 / 3 khi mũi xe chạm gờ (đo trên sân với Maker Nâng). */
const CHUTE_FRAC = [0, 0.67, 1]
/** Cắm cờ: tiến vào mặt 0 của núi (lỗ cờ lệch về phía này) theo đường thẳng qua lỗ; thử lại với các góc lệch (rad). */
const FLAG_OFFSETS = [0, 0.07, -0.07, 0.14]
const POINTS = [5, 10, 15]
/** Ước lượng thời gian đi: hệ số đường vòng so với đường chim bay, và phần cộng thêm cho quay / chỉnh. */
const DETOUR = 1.35
const OVERHEAD_S = 3
/** Không nhận bóng khi thời gian còn < thời gian đi giao + chừng này giây (spec §4.6). */
const LOAD_GUARD_S = 5
/** Lập đường / chọn bóng: coi như đã hết giờ nhận bóng sớm hơn chừng này giây. */
const LOAD_PLAN_S = 15
/** Thời gian đứng chờ Human Player nạp đầy (0.8 s mỗi bóng) cộng dư. */
const LOAD_WAIT_S = 8
/** Ủi bóng: mũi xe đứng cách bóng chừng này trước khi đẩy; vòng lại tối đa HERD_TRIES lần; bỏ sau HERD_MAX_S giây. */
const HERD_BEHIND = 0.09
const HERD_TRIES = 3
const HERD_MAX_S = 25
/** Gom bóng: bỏ bóng sát núi / sát rào hơn chừng này (mũi xe không tới được). */
const BALL_CLEAR_MTN = 0.06
const BALL_CLEAR_WALL = 0.025
const TARGET_TIMEOUT_S = 8
/** Đang chở bóng mà đã gom quá chừng này giây ⇒ đi giao luôn. */
const COLLECT_MAX_S = 25
/** Rãnh 3 có từ chừng này Mầm Cây ⇒ mức khó đổ vào Rãnh 2 (bóng mới dễ tràn). */
const GROOVE3_FULL = 6
/** Vùng miệng hút mà agent canh bóng sai màu (lớn hơn miệng thật trong robot.ts một chút). */
const MOUTH_DEPTH = 0.06
const MOUTH_HALF_W = 0.115
/**
 * Leo Thang Cứu Hỏa: bắt đầu tính giờ khi còn CLIMB_LOOK_S giây; quay theo thanh + giơ / hạ móc mất chừng CLIMB_GRAB_S;
 * đi tới chỗ bám quá CLIMB_GO_MAX_S thì lập lại nhiệm vụ. Tâm xe (điểm móc) phải cách trục thanh ≤ CLIMB_TOL và cách chỗ
 * bám dọc thanh ≤ CLIMB_ALONG mới giơ móc (luật bám: ≤ HOOK.tol); giơ móc giữ CLIMB_UP_S rồi hạ.
 */
const CLIMB_LOOK_S = 60
const CLIMB_GRAB_S = 6
const CLIMB_GO_MAX_S = 20
const CLIMB_TOL = 0.05
const CLIMB_ALONG = 0.05
/** Tới chỗ bám (tâm xe) trong chừng này thì sang quay theo thanh (sai số dọc thanh do bước nhích sửa). */
const CLIMB_GO_TOL = 0.03
/**
 * Quay theo thanh + nhích mà chừng này giây không tiến thêm (sai hướng / sai chỗ không giảm: quay chạm rào, nhích vào robot
 * khác) ⇒ đi lại từ đầu. Ở pha này agent không gỡ kẹt kiểu thường (lùi lúc đang treo là trượt ngược), nên phải tự giới
 * hạn giờ. Tính từ lần tiến gần nhất, không từ đầu pha: đế omni quay chậm (~0,5 rad/s) vẫn quay xong được.
 */
const CLIMB_ALIGN_MAX_S = 2.5
/** Chỗ bám cách rào ít hơn chừng này (sát rào, không quay tại chỗ được nếu tới lệch về phía rào) thì vào qua một điểm trong sân. */
const CLIMB_VIA_WALL = 0.25
/** Điểm vào: cách chỗ bám vào trong sân chừng này, rồi đi thẳng ra chỗ bám. */
const CLIMB_VIA_R = 0.3
/** Điểm vào chỗ bám xa rào: xa hơn chỗ bám chừng này dọc thanh. */
const CLIMB_VIA_ALONG = 0.25
/** Robot đi sau chờ khi robot đi trước đang quay ở chỗ bám cách chỗ bám của mình gần hơn chừng này (2 × nửa đường chéo). */
const CLIMB_TURN_CLEAR = 0.42
/** Quay xong mà chỗ bám lệch dọc thanh hơn chừng này thì nhích tới / lùi. */
const CLIMB_NUDGE = 0.008
const CLIMB_UP_S = 0.3
/** Tốc độ ước tính khi đi tới chỗ bám, phần của tốc độ chạy đường dài. */
const CLIMB_V = 0.6
const CLIMB_V_4WD = 0.4
/** Đế 4 bánh quay theo thanh chậm hơn (~0,5 rad/s): cộng thêm chừng này giây vào phần bám. */
const CLIMB_GRAB_4WD_S = 3
/** Phạt mỗi ô hành lang hẹp khi lập đường đi leo (giá ô thường 1…4). */
const CLIMB_NARROW = 8
/** Lề vùng cấm Khu Tiếp Tế khi đi leo: nửa đường chéo thân Maker (0,192) + chút dư. */
const CLIMB_ZONE_PAD = 0.2
/** Dải dưới thanh xà (cách trục) coi như thuộc túi khi lập đường đi leo. */
const CLIMB_BAND = 0.2
/** Robot treo đi sau giữ khoảng này (HOOK.gap + dư) với robot đi trước khi trượt; trên sàn dưới thanh: một thân xe + dư. */
const CLIMB_FOLLOW_GAP = HOOK.gap + 0.02
/** Điểm chờ khi chỗ bám đang có robot đứng: cách chỗ bám vào trong sân chừng này (thử từ xa tới gần cho tới khi quay tại chỗ được). */
const CLIMB_WAIT_R = [0.45, 0.4, 0.35, 0.3]
/** Điểm chờ khi đang ở túi sau thanh: từ chỗ bám dời `along` về phía Nước, rồi `r` về phía góc sân (cách rào ≥ 0,2). */
const CLIMB_WAIT_POCKET = { along: 0.25, r: 0.3 }

type ClimbLevel = Exclude<Climb, 'none'>
/**
 * Chỗ bám ở đoạn Đất (m dọc thanh tính từ tâm cột phía rào), lấy từ vạch: thanh theo CAD lắp sân (12/11, R157) dài 1,338 m
 * giữa hai tâm cột, vạch Đất / Nước ≈ 0,451. Thân Mẫu Maker treo / đứng dọc thanh trong rào khi 0,320 ≤ s ≤ 1,017
 * (slideRange; mẫu khác rộng hơn) nên chỗ bám được ở Đất chỉ còn 0,320…0,451 — vừa MỘT thân: hai robot cùng liên minh bám
 * chung chỗ này, lần lượt (robot sau chờ robot trước treo rồi trượt qua). Chừa 0,06 tới vạch cho sai số nhích (±0,008).
 */
const CLIMB_GRAB = LADDER.divider - 0.06
/** Chỗ dừng xa nhất của robot treo trước (Khó): còn cách max đoạn trượt của Mẫu Maker (1,017) một chút. */
const CLIMB_FAR = 0.98
/**
 * Chỗ đứng sàn chạm xà phía Nước (cách robot treo ở CLIMB_GRAB ≥ một thân). Đo seed 1–6, 4 Mẫu Maker (12/11, thanh CAD
 * lắp sân): 0,72 / 0,80 / 1,00 ⇒ Vừa leo đúng 23 / 22 / 21 trên 24, Dễ 19 / 21 / 21; 0,72 trượt ở seed 1. Chọn 0,80.
 */
const CLIMB_TOUCH = 0.8
/**
 * Chỗ bám `s0`, chỗ dừng `target` và mức leo theo mức chơi và ô robot. Ràng buộc đo trên sân (thanh CAD lắp sân):
 * - chỉ bám được ở đoạn Đất (s ≤ vạch ≈ 0,451); treo ở s > vạch + 0,01 là Nước;
 * - hai robot treo cách nhau ≥ HOOK.gap (0,3); thân treo (đáy y 0,12) thấp hơn nóc xe đứng sàn (0,216) nên robot treo
 *   và robot đứng dưới thanh phải cách nhau ≥ một thân xe (0,3) dọc thanh.
 * Hai robot treo ở Đất là không thể (0,320 + 0,3 > vạch): mức Vừa chỉ ô 0 treo Đất, ô 1 đứng chạm xà ở đoạn Nước.
 * - water: cả hai bám CLIMB_GRAB rồi trượt về CLIMB_FAR; ai bám trước đi trước tới CLIMB_FAR, robot bám sau dừng cách robot
 *   trước CLIMB_FOLLOW_GAP (≈ 0,66 — slideGoal), cả hai ở Nước. Robot tới sau chờ ở điểm chờ tới khi chỗ bám trống (không
 *   ai đứng, không thân treo nào phủ lên). Không ấn định ai trước: chờ một robot ở xa thì robot chờ đứng chắn lối đi của nó
 *   ở hành lang dọc rào. `wait` = ước tính thêm thời gian chờ: ai cũng có thể tới sau, và đã có người treo thì lối hẹp
 *   giữa Núi C / D và thanh (≈ 0,25 m) bị bịt, robot ở phía Hộp Phân Phối phải vòng qua giữa sân.
 * - ground: ô 0 bám CLIMB_GRAB và ở yên đó (Đất, cách vạch 0,06); ô 1 đứng sàn chạm xà ở CLIMB_TOUCH (cách ô 0 ≥ một thân).
 * - contact: đứng sàn, giơ móc chạm xà ở CLIMB_TOUCH / CLIMB_GRAB.
 * Lối giữa góc Núi C / D và thanh chỉ còn ≈ 0,25 m (góc núi chiếu lên thanh ở s ≈ 0,68): robot treo / đứng ở 0,6…1,0 là
 * bịt lối đó, robot ở phía Hộp Phân Phối phải vòng qua giữa sân.
 */
type ClimbPlan = { level: ClimbLevel; s0: number; target: number; wait?: boolean }
const CLIMB_PLAN: Record<ClimbLevel, [ClimbPlan, ClimbPlan]> = {
  water: [{ level: 'water', s0: CLIMB_GRAB, target: CLIMB_FAR, wait: true }, { level: 'water', s0: CLIMB_GRAB, target: CLIMB_FAR, wait: true }],
  ground: [{ level: 'ground', s0: CLIMB_GRAB, target: CLIMB_GRAB }, { level: 'contact', s0: CLIMB_TOUCH, target: CLIMB_TOUCH }],
  contact: [{ level: 'contact', s0: CLIMB_TOUCH, target: CLIMB_TOUCH }, { level: 'contact', s0: CLIMB_GRAB, target: CLIMB_GRAB }],
}

/**
 * Lệnh một bánh sau khi trộn tiến + quay: không bao giờ rơi vào vùng chết của động cơ TT (bánh đứng, xe xoay quanh
 * bánh đó). |v| < WHEEL_OFF ⇒ 0 (dừng hẳn), còn lại |v| ≥ CMD_MIN; kẹp ±100.
 */
export function wheelCmd(v: number): number {
  const a = Math.abs(v)
  if (a < WHEEL_OFF) return 0
  return Math.sign(v) * Math.min(100, Math.max(CMD_MIN, a))
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z)
/** Khoảng cách từ p tới đoạn a–b. */
const segDist = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(p.x - a.x - k * dx, p.z - a.z - k * dz)
}
const rectCentre = (r: Rect): Vec2 => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })
const inRect = (r: Rect, p: Vec2, pad = 0) => p.x >= r.x0 - pad && p.x <= r.x1 + pad && p.z >= r.z0 - pad && p.z <= r.z1 + pad
/** Hướng yaw để mũi xe chỉ từ `from` tới `to` (mũi f = (−sin yaw, −cos yaw)). */
const yawTo = (from: Vec2, to: Vec2) => Math.atan2(-(to.x - from.x), -(to.z - from.z))

/**
 * Điểm p ở trong "túi" sau thanh xà liên minh `al`: phía góc sân của thanh (gồm Khu Chữa Cháy), cách trục ≥ 0,05. Với
 * `band` > 0: thêm dải sát dưới thanh (cách trục < band, cả hai phía) từ chỗ `sFrom` trở đi — robot treo ở đó bịt cả lối
 * chạy dọc ngay dưới thanh.
 */
function inPocket(al: 'red' | 'blue', p: Vec2, band = 0, sFrom = 0): boolean {
  const pr = project(al, p.x, p.z)
  if (pr.s < 0 || pr.s > ladderLen(al)) return false
  if (band > 0 && pr.s >= sFrom && pr.d < band) return true
  if (pr.d < 0.05) return false
  const at = pointAt(al, pr.s)
  return (p.x - at.x) * -at.x + (p.z - at.z) * -at.z < 0
}

/** Khoảng cách từ điểm tới chân núi gần nhất (hình chữ nhật xoay theo CAD), 0 khi nằm trong. */
function mountainClearance(x: number, z: number): number {
  let d = Infinity
  for (const m of MOUNTAINS) {
    const p = toMountain(m, x, z)
    d = Math.min(d, Math.hypot(Math.max(0, Math.abs(p.lx) - MOUNTAIN_FOOT.hx), Math.max(0, Math.abs(p.lz) - MOUNTAIN_FOOT.hz)))
  }
  return d
}
const wallClearance = (x: number, z: number) => FIELD / 2 - Math.max(Math.abs(x), Math.abs(z))

// ---------- Lưới tìm đường A* (tĩnh: núi + rào; động: robot khác, Khu Tiếp Tế) ----------
const CELL = 0.025
const N = Math.round(FIELD / CELL)
/** Tâm xe cách chân núi / rào ít hơn chừng này là chặn (nửa bề ngang xe 0.12 + khe). Hành lang hẹp nhất ≈ 0.143. */
const BLOCK_MTN = 0.13
const BLOCK_WALL = 0.135
/** Phạt đi sát chướng ngại (trong SOFT m) để xe chọn giữa hành lang / làn ngoài rộng. */
const SOFT = 0.3
/** Tránh / cấm một vùng: tâm xe cách mép vùng ≥ nửa đường chéo thân + khe, để không góc nào lọt vào. */
const ZONE_PAD = 0.22
/** Quanh điểm xuất phát luôn đi được (thoát ra khi đang sát núi / đang trong vùng cấm). */
const START_FREE = 0.25
/** Bán kính chặn quanh tâm robot khác; robot đang treo trên thanh xà (thân lơ lửng ngang tầm nóc xe, không đẩy được,
 *  quay chéo theo thanh) chặn rộng hơn để đường không lách sát nó. */
const OTHER_R = 0.26
const HANG_R = 0.3
const cellX = (i: number) => -FIELD / 2 + (i + 0.5) * CELL
const cellOf = (v: number) => Math.max(0, Math.min(N - 1, Math.floor((v + FIELD / 2) / CELL)))

let staticCost: Float32Array | null = null
/** Hệ số giá mỗi ô (∞ = chặn), tính một lần. */
function grid(): Float32Array {
  if (staticCost) return staticCost
  staticCost = new Float32Array(N * N)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cellX(i)
      const z = cellX(j)
      const dm = mountainClearance(x, z)
      const dw = wallClearance(x, z)
      const blocked = dm < BLOCK_MTN || dw < BLOCK_WALL
      const near = Math.min(dm, dw)
      staticCost[j * N + i] = blocked ? Infinity : 1 + 3 * Math.max(0, (SOFT - near) / SOFT)
    }
  }
  return staticCost
}

/** Hàng đợi ưu tiên nhị phân (giá, ô). */
class Heap {
  private readonly k: number[] = []
  private readonly v: number[] = []
  get size(): number {
    return this.k.length
  }
  push(key: number, val: number): void {
    const k = this.k
    const v = this.v
    let i = k.length
    k.push(key)
    v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= key) break
      k[i] = k[p]
      v[i] = v[p]
      i = p
    }
    k[i] = key
    v[i] = val
  }
  pop(): number {
    const k = this.k
    const v = this.v
    const top = v[0]
    const lk = k.pop()!
    const lv = v.pop()!
    if (k.length) {
      let i = 0
      for (;;) {
        const a = 2 * i + 1
        if (a >= k.length) break
        const c = a + 1 < k.length && k[a + 1] < k[a] ? a + 1 : a
        if (k[c] >= lk) break
        k[i] = k[c]
        v[i] = v[c]
        i = c
      }
      k[i] = lk
      v[i] = lv
    }
    return top
  }
}

interface PlanOpts {
  /** Tâm các robot khác (tránh mềm, chặn sát thân); r = bán kính chặn (mặc định OTHER_R). */
  others: (Vec2 & { r?: number })[]
  /** Vùng cấm đi vào (Khu Tiếp Tế khi đã hết giờ nhận bóng). */
  forbid: Rect[]
  /** Vùng đi qua bị phạt (Khu Tiếp Tế khi không đi nhận bóng). */
  avoid: Rect[]
  /** Ô cấm thêm (vd. "túi" góc sân sau thanh xà khi đi leo). */
  block?: (p: Vec2) => boolean
  /** Lề vùng cấm (mặc định ZONE_PAD). */
  forbidPad?: number
  /** Phạt thêm mỗi ô hành lang hẹp (cách chân núi < TURN_CLEAR: không quay tại chỗ được) — khi đi leo. */
  narrow?: number
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
]

/** Đường đi từ `from` tới `to` (danh sách điểm, điểm cuối = `to`) và độ dài; null khi không có đường. */
function planPath(from: Vec2, to: Vec2, opts: PlanOpts): { path: Vec2[]; len: number } | null {
  const g = grid()
  const extra = new Float32Array(N * N)
  const si = cellOf(from.x)
  const sj = cellOf(from.z)
  const near = (i: number, j: number, p: Vec2, r: number) => Math.hypot(cellX(i) - p.x, cellX(j) - p.z) < r
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = { x: cellX(i), z: cellX(j) }
      let e = 0
      for (const o of opts.others) {
        const d = dist(c, o)
        const r = o.r ?? OTHER_R
        if (d < r) e = Infinity
        else if (d < r + 0.19) e += 4
      }
      for (const r of opts.forbid) if (inRect(r, c, opts.forbidPad ?? ZONE_PAD)) e = Infinity
      for (const r of opts.avoid) if (inRect(r, c, ZONE_PAD)) e += 6
      if (opts.block?.(c)) e = Infinity
      if (opts.narrow && mountainClearance(c.x, c.z) < TURN_CLEAR) e += opts.narrow
      extra[j * N + i] = e
    }
  }
  // Ô xuất phát (và lân cận) luôn đi được để thoát ra khi xe đang sát núi / trong vùng.
  const cost = (i: number, j: number) => {
    if (near(i, j, from, START_FREE)) return 1
    return g[j * N + i] + extra[j * N + i]
  }
  // Đích bị chặn ⇒ lấy ô đi được gần đích nhất.
  let ti = cellOf(to.x)
  let tj = cellOf(to.z)
  if (!Number.isFinite(cost(ti, tj))) {
    let best = Infinity
    for (let j = Math.max(0, tj - 12); j <= Math.min(N - 1, tj + 12); j++) {
      for (let i = Math.max(0, ti - 12); i <= Math.min(N - 1, ti + 12); i++) {
        const d = Math.hypot(i - cellOf(to.x), j - cellOf(to.z))
        if (Number.isFinite(cost(i, j)) && d < best) {
          best = d
          ti = i
          tj = j
        }
      }
    }
    if (!Number.isFinite(best)) return null
  }
  const goal = tj * N + ti
  const gs = new Float32Array(N * N).fill(Infinity)
  const prev = new Int32Array(N * N).fill(-1)
  const heap = new Heap()
  const start = sj * N + si
  gs[start] = 0
  heap.push(0, start)
  const h = (i: number, j: number) => Math.hypot(i - ti, j - tj)
  while (heap.size) {
    const cur = heap.pop()
    if (cur === goal) break
    const ci = cur % N
    const cj = (cur - ci) / N
    for (const [di, dj, step] of DIRS) {
      const ni = ci + di
      const nj = cj + dj
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue
      const c = cost(ni, nj)
      if (!Number.isFinite(c)) continue
      const n = nj * N + ni
      const gn = gs[cur] + step * c
      if (gn >= gs[n]) continue
      gs[n] = gn
      prev[n] = cur
      heap.push(gn + h(ni, nj), n)
    }
  }
  if (!Number.isFinite(gs[goal])) return null
  const cells: Vec2[] = []
  for (let c = goal; c !== -1 && c !== start; c = prev[c]) cells.push({ x: cellX(c % N), z: cellX(Math.floor(c / N)) })
  cells.reverse()
  // Thưa bớt: giữ mỗi điểm thứ 3; điểm cuối là đích thật khi đích đi được.
  const path = cells.filter((_, k) => k % 3 === 2)
  path.push(ti === cellOf(to.x) && tj === cellOf(to.z) ? to : cells[cells.length - 1] ?? to)
  let len = 0
  let p = from
  for (const q of path) {
    len += dist(p, q)
    p = q
  }
  return { path, len }
}

// ---------- Phối hợp đồng đội (mỗi trận một bảng) ----------
interface Board {
  /** Núi → agent đang đi cắm cờ ở đó. */
  flag: Map<number, Agent>
  /** Robot → agent lái nó (đồng đội biết kế hoạch leo của nhau: robot treo gần rào trượt theo sau robot đi xa hơn). */
  agents: Map<RobotBody, Agent>
  /** Bóng → agent đang ủi bóng đó về Khu Xuất Phát (hai robot không tranh một bóng). */
  herd: Map<number, Agent>
}
const boards = new WeakMap<Match, Board>()
function board(m: Match): Board {
  let b = boards.get(m)
  if (!b) boards.set(m, (b = { flag: new Map(), agents: new Map(), herd: new Map() }))
  return b
}

// ---------- Nhiệm vụ ----------
type Task =
  | { kind: 'flag'; m: number; face: Vec2; tries: number; phase: 'go' | 'in' | 'back'; t: number; offset: number }
  | { kind: 'collect'; color: 'o' | 'g'; ball: number; t: number }
  | { kind: 'mtn'; m: number; face: Vec2; plan: number[]; phase: 'go' | 'in' | 'drop' | 'back'; t: number; anyColor: boolean }
  | { kind: 'fire'; spot: Vec2; corner: Vec2; phase: 'go' | 'drop'; t: number; anyColor: boolean }
  | { kind: 'load'; spot: Vec2; phase: 'go' | 'wait'; t: number }
  | { kind: 'herd'; ball: number; goal: Rect; phase: 'go' | 'push'; t: number; tries: number }
  | { kind: 'climb'; s0: number; target: number; phase: 'go' | 'align' | 'up' | 'slide' | 'done'; t: number; via: boolean; best: number }
  | { kind: 'idle'; t: number }

/** hook = góc servo móc leo xà (độ, 180 giơ / 0 hạ), ghi ra cổng `def.hook.port`. */
type Cmd = { fwd: number; turn: number; intake: boolean; lift: -1 | 0 | 1; s1: boolean; chute: number; plant: boolean; release: boolean; sel: 'o' | 'g'; hook: number }

export class Agent {
  readonly robot: RobotBody
  readonly cfg: RobotConfig
  readonly skill: Skill
  private readonly S: SkillDef
  private readonly rnd: () => number
  private readonly ports: PortMap
  private task: Task | null = null
  private path: Vec2[] = []
  private pathGoal: Vec2 | null = null
  private replanIn = 0
  private stuckT = 0
  private recover = 0
  private recoverTurn = 1
  /** Canh tiến độ của goTo: đích đang đi, khoảng cách gần nhất đã đạt, thời gian từ lần gần thêm cuối. */
  private progress: { goal: Vec2; best: number; t: number } | null = null
  private stillT = 0
  private noise = 0
  private noiseIn = 0
  private dropT = 0
  private readonly avoid = new Map<number, number>()
  private readonly giveUp = new Set<number>()
  private time = 0
  private dt = 1 / 60
  private cmd: Cmd = Agent.idleCmd()
  private lastCmd: Cmd = Agent.idleCmd()
  private worldOf: FanrocWorld | null = null
  private boardOf: Board | null = null
  /** Thời gian gom bóng kể từ lần giao gần nhất. */
  private collectT = 0
  /** Thời gian leo xà ước lượng (đi tới chỗ bám + bám + trượt; tính lại mỗi giây khi gần hết trận). */
  private climbEta = Infinity
  private climbEtaIn = 0
  /** Số bóng còn chở ở bước trước (để biết một bóng đã ra và chuyển sang rãnh kế tiếp). */
  private dropCount = 0

  constructor(robot: RobotBody, cfg: RobotConfig, skill: Skill, seed: number) {
    this.robot = robot
    this.cfg = cfg
    this.skill = skill
    this.S = SKILLS[skill]
    this.rnd = mulberry32(seed)
    this.ports = portMap(cfg)
  }

  private static idleCmd(): Cmd {
    return { fwd: 0, turn: 0, intake: false, lift: -1, s1: false, chute: 0, plant: false, release: false, sel: 'o', hook: 0 }
  }

  /** Nhiệm vụ hiện tại (để hiển thị / gỡ lỗi). */
  get doing(): string {
    return this.task ? `${this.task.kind}${'phase' in this.task ? ':' + this.task.phase : ''}` : '—'
  }

  update(view: AgentView, dt: number): PortValues {
    const m = view.match
    if (m.phase !== 'play') return { ...NEUTRAL }
    this.worldOf = view.world
    this.boardOf = board(m)
    this.boardOf.agents.set(this.robot, this)
    this.dt = dt
    this.time += dt
    this.lastCmd = this.cmd
    this.cmd = Agent.idleCmd()
    const left = MATCH_S - m.t
    for (const [i, until] of this.avoid) if (until < this.time) this.avoid.delete(i)
    this.refreshClimbEta(view, left)
    // Đã tới chỗ bám (quay theo thanh / móc / treo / trượt): không gỡ kẹt, không đổi nhiệm vụ — lùi gỡ lúc đang treo là trượt ngược.
    const t = this.task
    if (t?.kind === 'climb' && t.phase !== 'go') {
      this.run(view, dt, left)
      return this.toPorts()
    }
    this.watchStuck(dt)
    if (this.recover > 0) {
      this.recover -= dt
      this.cmd.fwd = -CMD_SLOW
      this.cmd.turn = 18 * this.recoverTurn
    } else {
      if (this.task && this.task.kind !== 'climb' && this.shouldClimb(left)) this.setTask(this.climbTask())
      if (!this.task) this.setTask(this.decide(view, left))
      if (this.task?.kind !== 'load' && this.task?.kind !== 'climb' && !this.loadAllowed(left, this.robot.pose) && this.touchesLoad()) {
        // Hết giờ nhận bóng mà thân còn chạm Khu Tiếp Tế (đi lạc vào khi gom / né) ⇒ ra khỏi khu trước đã.
        this.goTo(view, this.loadExit(), 0.05, false)
      } else this.run(view, dt, left)
    }
    this.mistakes(dt)
    return this.toPorts()
  }

  private setTask(t: Task | null): void {
    const b = this.boardOf
    if (b && this.task?.kind === 'flag' && b.flag.get(this.task.m) === this) b.flag.delete(this.task.m)
    if (b && this.task?.kind === 'herd' && b.herd.get(this.task.ball) === this) b.herd.delete(this.task.ball)
    this.task = t
    this.path = []
    this.pathGoal = null
    if (b && t?.kind === 'flag') b.flag.set(t.m, this)
    if (b && t?.kind === 'herd') b.herd.set(t.ball, this)
  }


  // ---------- Quyết định (theo decide() của bản thử 2D) ----------

  private decide(view: AgentView, left: number): Task | null {
    const r = this.robot
    const playT = MATCH_S - left
    if (this.shouldClimb(left)) return this.climbTask()
    // 1. Cắm cờ trước.
    if (r.hasFlag && r.def.flag && playT >= this.S.flagAfter && (this.S.flagAfter === 0 || r.stored.length === 0)) {
      const t = this.flagTask(view)
      if (t) return t
    }
    // 2. Đang chở bóng: đi giao khi đầy hoặc hết bóng để gom.
    const n = this.carried()
    const target = this.hasIntake ? this.pickBall(view) : null
    if (n > 0 && (n >= this.capacity || target === null || this.collectT > COLLECT_MAX_S)) return this.deliverTask(view)
    // 3. Nhận bóng ở Khu Tiếp Tế.
    if (n === 0 && this.wantsLoad(view, left)) return { kind: 'load', spot: this.loadSpot(), phase: 'go', t: 0 }
    // 3b. Không hút bóng trên sân (Mẫu Maker): ủi bóng xanh về Khu Xuất Phát cho Human Player nhặt.
    if (n === 0 && !this.hasIntake && this.canHerd) {
      const h = this.herdBall(view)
      if (h) return { kind: 'herd', ...h, phase: 'go', t: 0, tries: 0 }
      if (this.hpTray(view) > 0 && this.wantsLoad(view, left, true)) return { kind: 'load', spot: this.loadSpot(), phase: 'go', t: 0 }
    }
    // 4. Gom bóng.
    if (target) return { kind: 'collect', color: target.color, ball: target.i, t: 0 }
    if (n > 0) return this.deliverTask(view)
    return { kind: 'idle', t: 0 }
  }

  private get hasIntake(): boolean {
    return this.ports.intake !== undefined
  }

  private get capacity(): number {
    return this.robot.compartments ? 5 : this.robot.def.storage
  }

  private carried(): number {
    return this.robot.stored.length
  }

  /** Màu của bóng sẽ ra cửa xả tiếp theo. */
  private nextOut(sel?: 'o' | 'g'): 'o' | 'g' | null {
    const r = this.robot
    if (r.compartments) {
      const c = sel ?? (r.compartments.g.length >= r.compartments.o.length ? 'g' : 'o')
      return r.compartments[c].length ? c : null
    }
    const i = r.stored[0]
    return i === undefined ? null : this.worldOf!.balls[i].color
  }

  /** Thời gian (s) đi từ robot tới điểm p theo ước lượng đường vòng. */
  private travel(p: Vec2): number {
    const v = V_MAX * ttFraction(this.cruise) * 0.8
    return (dist(this.robot.pose, p) * DETOUR) / v + OVERHEAD_S
  }

  private get cruise(): number {
    return DEAD_ZONE + (CMD_CRUISE - DEAD_ZONE) * this.S.speed
  }

  /** Đang quay theo thanh / móc ở chỗ bám (chưa treo). */
  get turningAt(): boolean {
    const t = this.task
    return t?.kind === 'climb' && (t.phase === 'align' || t.phase === 'up')
  }

  /** Kế hoạch leo của robot này (theo mức và ô); null khi mức không leo. */
  get climbPlan(): ClimbPlan | null {
    const level = this.S.climbTarget
    if (level === 'none') return null
    return CLIMB_PLAN[level][this.robot.slot]
  }

  /** Kế hoạch leo của robot này chỉ chạm xà (đứng sàn, không treo). */
  private get contactOnly(): boolean {
    return this.climbPlan?.level === 'contact'
  }

  /** Đồng đội (agent) treo xa hơn mình trên cùng thanh: khi trượt phải đi sau họ. */
  private leader(): Agent | null {
    const mine = this.climbPlan
    if (!mine || mine.level === 'contact' || !this.boardOf) return null
    for (const [r, a] of this.boardOf.agents) {
      if (a === this || r.alliance !== this.robot.alliance) continue
      const p = a.climbPlan
      if (p && p.level !== 'contact' && p.target > mine.target) return a
    }
    return null
  }

  /** Đi leo chưa: thời gian còn ≤ ETA leo (tính ở refreshClimbEta) + phần dư theo mức. */
  private shouldClimb(left: number): boolean {
    return this.climbPlan !== null && left <= CLIMB_LOOK_S && left <= this.climbEta + this.S.climbMargin
  }

  /** Tính lại ETA leo mỗi giây khi trận còn ≤ CLIMB_LOOK_S; gọi đúng một lần mỗi update. */
  private refreshClimbEta(view: AgentView, left: number): void {
    const plan = this.climbPlan
    if (!plan || left > CLIMB_LOOK_S) return
    this.climbEtaIn -= this.dt
    if (this.climbEtaIn > 0) return
    // Đường A* thật tới chỗ bám, cộng phần quay theo thanh + móc và phần trượt dọc thanh (0,15 m/s).
    this.climbEtaIn = 1
    const r = this.robot
    const at = pointAt(r.alliance, plan.s0)
    const others = this.obstacles(view, true)
    // Cuối trận đường hay vòng (robot treo trên thanh chặn lối dọc rào, hành lang giữa núi): tính chậm hơn đi thường.
    // Đế 4 bánh (omni / mecanum) quay chậm hơn đế 2 bánh ~2 lần (nửa sải bánh (w + l) / 2 so với w / 2): đường cuối trận
    // nhiều khúc quay nên tính chậm hơn nữa.
    const v = V_MAX * ttFraction(this.cruise) * (this.cfg.drive === 'diff2' ? CLIMB_V : CLIMB_V_4WD)
    // Mức treo vào chỗ bám qua điểm vào (climbVia): tính đường tới điểm vào + đoạn thẳng điểm vào → chỗ bám.
    const via = this.needsVia(plan.s0) ? this.climbVia(plan.s0) : at
    const res = planPath(r.pose, via, { others, forbid: [], avoid: [], narrow: CLIMB_NARROW })
    const slide = Math.abs(plan.target - plan.s0) / HOOK.slideV
    const grab = CLIMB_GRAB_S + (this.cfg.drive === 'diff2' ? 0 : CLIMB_GRAB_4WD_S)
    // Robot tới sau phải chờ đồng đội bám xong rồi trượt qua chỗ bám chung.
    const wait = plan.wait ? CLIMB_GRAB_S + CLIMB_FOLLOW_GAP / HOOK.slideV : 0
    this.climbEta = ((res ? res.len : dist(r.pose, via) * 2) + dist(via, at)) / v + grab + slide + wait
  }

  private climbTask(): Task {
    const p = this.climbPlan!
    return { kind: 'climb', s0: p.s0, target: p.target, phase: 'go', t: 0, via: this.needsVia(p.s0), best: Infinity }
  }

  private flagTask(view: AgentView): Task | null {
    const holes = view.world.holeCentres()
    const b = board(view.match)
    let best: Task | null = null
    let bestCost = Infinity
    holes.forEach((h, m) => {
      if (view.match.flags[m] || this.giveUp.has(m)) return
      const owner = b.flag.get(m)
      if (owner && owner !== this) return
      const face = this.face(m, 0)
      if (!face) return
      const c = this.travel(face) + (this.skill === 'easy' ? this.rnd() * 4 : 0)
      if (c < bestCost) {
        bestCost = c
        best = { kind: 'flag', m, face, tries: 0, phase: 'go', t: 0, offset: 0 }
      }
    })
    return best
  }

  /** Điểm chờ trước mặt `k` (0..3, mặt 0 = mặt có lỗ cờ lệch về) của núi m, xoay thêm `offset` rad; null nếu bị chặn. */
  private face(m: number, k: number, offset = 0): Vec2 | null {
    const h = this.worldOf!.holeCentres()[m]
    const a = MOUNTAINS[m].yaw + (k * Math.PI) / 2 + offset
    // Xe phải quay tại chỗ được ở điểm chờ; mặt núi nhìn ra hành lang hẹp (giữa hai núi) thì bỏ.
    for (let R = APPROACH_R; R >= APPROACH_MIN - 1e-9; R -= 0.02) {
      const p = { x: h.x + R * Math.sin(a), z: h.z + R * Math.cos(a) }
      if (mountainClearance(p.x, p.z) >= TURN_CLEAR && wallClearance(p.x, p.z) >= TURN_CLEAR) return p
    }
    return null
  }

  /** Mặt núi gần robot nhất để đổ bóng. */
  private nearestFace(m: number): Vec2 | null {
    let best: Vec2 | null = null
    for (let k = 0; k < 4; k++) {
      const p = this.face(m, k)
      if (p && (!best || dist(p, this.robot.pose) < dist(best, this.robot.pose))) best = p
    }
    return best
  }

  private deliverTask(view: AgentView): Task {
    this.collectT = 0
    const anyColor = this.rnd() < this.S.wrongColor
    const out = this.nextOut()
    const canMtn = this.robot.def.type !== 'ui'
    if ((out === 'g' || anyColor) && canMtn) {
      const t = this.mountainTask(view, anyColor)
      if (t) return t
    }
    // Bóng xanh mà không lên núi được (không mặt núi nào tới được / robot không đổ lên núi): giữ bóng, chờ rồi
    // quyết định lại — không đem bóng xanh tới Khu Chữa Cháy (sai vị trí) và không đổi nhiệm vụ mỗi bước.
    if (out === 'g' && !anyColor) return { kind: 'idle', t: 0 }
    return this.fireTask(view, anyColor)
  }

  private mountainTask(view: AgentView, anyColor: boolean): Task | null {
    const tally = view.match.tally()
    const nGreen = this.robot.stored.filter((i) => view.world.balls[i].color === 'g').length || 1
    // Rãnh với tới được: robot có thanh trượt vươn tới trước (DROP_EXTEND) hoặc servo nâng cửa lồng (CHUTE_FRAC) mới đổ
    // được Rãnh 2 / 3; còn lại (vd. Mẫu Maker: lồng không nâng hạ) thả ở rãnh mũi xe chạm — Rãnh 1.
    const def = this.robot.def
    const reach = LIFT_AXIS[def.type] === 'forward' || def.chuteLift ? [0, 1, 2] : [0]
    let best: Task | null = null
    let bestV = -Infinity
    for (let m = 0; m < MOUNTAINS.length; m++) {
      const face = this.nearestFace(m)
      if (!face) continue
      const counts = tally.mtn[m].map((x) => x.g)
      const flagged = view.match.flags[m] || board(view.match).flag.has(m)
      let plan: number[]
      let value: number
      if (this.S.ev) {
        // Giá trị kỳ vọng: phủ các rãnh còn trống của núi có cờ (cờ 20 → 40) trước, phần còn lại vào rãnh giá trị cao nhất.
        const missing = [0, 1, 2].filter((k) => counts[k] === 0)
        const fill = flagged ? missing.filter((k) => reach.includes(k)).slice(0, nGreen) : []
        const rest = !reach.includes(2) ? reach[reach.length - 1] : counts[2] >= GROOVE3_FULL ? 1 : 2
        plan = [...fill, ...Array(Math.max(0, nGreen - fill.length)).fill(rest)]
        value = plan.reduce((s, k) => s + POINTS[k], 0) + (flagged && fill.length === missing.length && missing.length > 0 ? 20 : 0)
      } else {
        const ks = this.S.grooves.filter((k) => reach.includes(k))
        const k = ks.length ? ks[Math.floor(this.rnd() * ks.length)] : reach[0]
        plan = Array(nGreen).fill(k)
        value = POINTS[k] * nGreen + (this.skill === 'easy' ? this.rnd() * 30 : 0)
      }
      value -= 2 * this.travel(face)
      if (value > bestV) {
        bestV = value
        best = { kind: 'mtn', m, face, plan, phase: 'go', t: 0, anyColor }
      }
    }
    return best
  }

  private fireTask(view: AgentView, anyColor: boolean): Task {
    const zones = ZONES.fire.map((z) => ({ x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2 }))
    const k = dist(zones[0], this.robot.pose) <= dist(zones[1], this.robot.pose) ? 0 : 1
    const corner = { x: k === 0 ? -FIELD / 2 : FIELD / 2, z: -FIELD / 2 }
    return { kind: 'fire', spot: zones[k], corner, phase: 'go', t: 0, anyColor }
  }

  /** Thời gian đi giao từ một điểm (tới núi gần nhất), dùng cho luật không nhận bóng muộn. */
  private deliverTime(from: Vec2): number {
    const v = V_MAX * ttFraction(this.cruise) * 0.8
    const d = Math.min(...MOUNTAINS.map((m) => dist(from, m)))
    return (d * DETOUR) / v + OVERHEAD_S
  }

  private loadSpot(): Vec2 {
    const z = ZONES.load[this.robot.alliance]
    const s = this.robot.alliance === 'red' ? 1 : -1
    // Tâm xe cách mép trong của khu một chút: một góc thân lọt vào khu là được nạp.
    return { x: (s > 0 ? z.x1 : z.x0) + s * 0.02, z: (z.z0 + z.z1) / 2 }
  }

  /** Sắp hết giờ nhận bóng (sớm hơn giờ chót LOAD_PLAN_S giây): không lập đường / chọn bóng sát Khu Tiếp Tế nữa. */
  private loadLate(view: AgentView): boolean {
    return !this.loadAllowed(MATCH_S - view.match.t - LOAD_PLAN_S, this.robot.pose)
  }

  /** Có góc thân nào sát / trong Khu Tiếp Tế của liên minh mình. */
  private touchesLoad(): boolean {
    const z = ZONES.load[this.robot.alliance]
    return this.robot.footprint().some((c) => inRect(z, c, 0.05))
  }

  /** Điểm ra khỏi Khu Tiếp Tế, về phía giữa sân. */
  private loadExit(): Vec2 {
    const z = ZONES.load[this.robot.alliance]
    const s = this.robot.alliance === 'red' ? 1 : -1
    return { x: (s > 0 ? z.x1 : z.x0) + s * 0.3, z: z.z0 - 0.05 }
  }

  /** Còn được phép đứng trong Khu Tiếp Tế nhận bóng không (thời gian còn ≥ thời gian đi giao + 5 s, cộng phần ra khỏi khu). */
  private loadAllowed(left: number, from: Vec2): boolean {
    return left >= this.deliverTime(from) + LOAD_GUARD_S + 2
  }

  private wantsLoad(view: AgentView, left: number, anyTray = false): boolean {
    const hp = view.humans.find((h) => h.alliance === this.robot.alliance)
    if (!hp || this.robot.def.servos.S3 === undefined) return false // R33: không có cửa xả thì Human Player không nạp
    const spot = this.loadSpot()
    if (!this.loadAllowed(left - this.travel(spot) - LOAD_WAIT_S, spot)) return false
    // Không hút bóng trên sân (Mẫu Maker): khay đủ một chuyến (4 bóng) mới về nhận; hết bóng để ủi thì nhận luôn.
    if (!this.hasIntake) return hp.tray.o + hp.tray.g >= (anyTray ? 1 : this.capacity)
    return this.S.load && hp.tray.g >= 4 && hp.tray.g > hp.tray.o
  }

  /** Robot đẩy được bóng bằng mũi xe (không phải Xe Ủi — Xe Ủi hớt bóng vào gàu). */
  private get canHerd(): boolean {
    return this.robot.def.type !== 'ui'
  }

  private hpTray(view: AgentView): number {
    const hp = view.humans.find((h) => h.alliance === this.robot.alliance)
    return hp ? hp.tray.o + hp.tray.g : 0
  }

  /** Điểm đứng sau bóng q (phía xa đích g) để đẩy thẳng q về đích. */
  private herdBehind(q: Vec2, g: Vec2): Vec2 {
    const d = Math.max(1e-6, dist(q, g))
    const k = this.robot.def.size.l / 2 + HERD_BEHIND
    return { x: q.x + ((q.x - g.x) / d) * k, z: q.z + ((q.z - g.z) / d) * k }
  }

  /**
   * Chọn bóng để ủi: bóng xanh về Khu Xuất Phát của mình (Human Player nhặt rồi nạp lại); mức Khó thêm bóng cam vào Khu
   * Chữa Cháy gần nhất nếu dọc đường đẩy không có bóng xanh (kẻo dồn cả bóng xanh vào khu, −3 mỗi quả). Chọn tổng quãng
   * tới chỗ đứng sau bóng + quãng đẩy nhỏ nhất.
   */
  private herdBall(view: AgentView): { ball: number; goal: Rect } | null {
    const r = this.robot
    const start = ZONES.start[r.alliance]
    const claimed = new Set(this.boardOf ? [...this.boardOf.herd.entries()].filter(([, a]) => a !== this).map(([i]) => i) : [])
    const greens = view.world.balls.flatMap((b) => (b.color === 'g' && b.st === 'field' && b.body ? [b.body.translation()] : []))
    let best: { ball: number; goal: Rect } | null = null
    let bestC = Infinity
    view.world.balls.forEach((b, i) => {
      if (b.st !== 'field' || !b.body || this.avoid.has(i) || claimed.has(i)) return
      if (b.color === 'o' && !this.S.herdOrange) return
      const q = b.body.translation()
      if (q.y > 0.03 || inRect(start, q)) return
      if (ZONES.fire.some((z) => inRect(z, q, 0.1))) return // góc rào: không lách ra sau bóng được
      const goal = b.color === 'g' ? start : ZONES.fire[q.x < 0 ? 0 : 1]
      const g = rectCentre(goal)
      if (b.color === 'o' && greens.some((p) => segDist(p, q, g) < r.def.size.w / 2 + 0.05)) return
      if (inRect(ZONES.ladder.red, q) || inRect(ZONES.ladder.blue, q)) return
      if (inRect(ZONES.load.red, q, 0.1) || inRect(ZONES.load.blue, q, 0.1)) return
      const behind = this.herdBehind(q, g)
      if (mountainClearance(q.x, q.z) < 0.15 || wallClearance(q.x, q.z) < 0.15) return
      if (mountainClearance(behind.x, behind.z) < TURN_CLEAR || wallClearance(behind.x, behind.z) < TURN_CLEAR) return
      if (view.robots.some((o) => o !== r && dist(o.pose, q) < 0.3)) return
      const c = dist(r.pose, behind) + dist(q, g)
      if (c < bestC) {
        bestC = c
        best = { ball: i, goal }
      }
    })
    return best
  }

  /** Chọn bóng để gom: gần nhất, ưu tiên xanh (cùng màu với bóng đang chở), khó ưu tiên xanh trong Khu Chữa Cháy. */
  private pickBall(view: AgentView): { i: number; color: 'o' | 'g' } | null {
    const r = this.robot
    const p = r.pose
    const have = this.nextOut()
    const late = this.loadLate(view)
    const want: 'o' | 'g' = r.compartments ? (r.compartments.g.length >= 5 ? 'o' : 'g') : have ?? 'g'
    let best = -1
    let bestC = Infinity
    view.world.balls.forEach((b, i) => {
      if (b.st !== 'field' || !b.body || this.avoid.has(i)) return
      const q = b.body.translation()
      if (q.y > 0.03) return
      const inFire = ZONES.fire.some((z) => inRect(z, q))
      if (b.color === 'o' && inFire) return
      if (mountainClearance(q.x, q.z) < BALL_CLEAR_MTN || wallClearance(q.x, q.z) < BALL_CLEAR_WALL) return
      if (inRect(ZONES.ladder.red, q) || inRect(ZONES.ladder.blue, q)) return
      if (late && inRect(ZONES.load[r.alliance], q, ZONE_PAD + 0.1)) return
      // Bóng phía sau robot khác (≤ 0.3 m) thì bỏ.
      if (view.robots.some((o) => o !== r && dist(o.pose, q) < 0.3)) return
      let c = dist(p, q)
      if (this.S.selective && b.color !== want) c += r.stored.length > 0 ? Infinity : 0.8
      if (this.S.clearFire && b.color === 'g' && inFire) c -= 0.5
      if (c < bestC) {
        bestC = c
        best = i
      }
    })
    if (best < 0) return null
    if (r.stored.length > 0 && bestC > 1.2) return null
    return { i: best, color: this.S.selective ? (view.world.balls[best].color) : want }
  }

  // ---------- Thực hiện ----------

  private run(view: AgentView, dt: number, left: number): void {
    const t = this.task
    if (!t) return
    t.t += dt
    const r = this.robot
    switch (t.kind) {
      case 'idle':
        if (t.t > 1) this.setTask(null)
        return
      case 'collect':
        return this.runCollect(view, t, dt)
      case 'flag':
        return this.runFlag(view, t)
      case 'mtn':
        return this.runMtn(view, t)
      case 'fire':
        return this.runFire(view, t)
      case 'load': {
        const hp = view.humans.find((h) => h.alliance === r.alliance)
        if (!this.loadAllowed(left, r.pose)) return this.setTask(null)
        if (t.phase === 'go') {
          if (this.goTo(view, t.spot, 0.05, true)) t.phase = 'wait'
          return
        }
        const full = this.carried() >= this.capacity
        const noGreen = this.hasIntake && hp !== undefined && (hp.tray.g === 0 || hp.tray.g <= hp.tray.o)
        const empty = hp !== undefined && hp.tray.o + hp.tray.g === 0
        // Không hút bóng trên sân thì đợi Human Player nhặt thêm cho đầy (khay hết bóng quá 4 s mới đi).
        const done = this.hasIntake ? empty : empty && t.t > 4
        if (full || noGreen || done || t.t > 15) this.setTask(null)
        return
      }
      case 'climb':
        return this.runClimb(view, t, left)
      case 'herd':
        return this.runHerd(view, t)
    }
  }

  /** Ủi một bóng xanh về Khu Xuất Phát: tới chỗ đứng sau bóng, rồi tiến thẳng qua bóng tới đích. */
  private runHerd(view: AgentView, t: Extract<Task, { kind: 'herd' }>): void {
    const b = view.world.balls[t.ball]
    const r = this.robot
    const start = t.goal
    const give = () => {
      this.avoid.set(t.ball, this.time + 15)
      this.setTask(null)
    }
    if (b.st !== 'field' || !b.body) return this.setTask(null)
    const q = b.body.translation()
    if (inRect(start, q, -0.03)) {
      // Bóng đã vào hẳn khu: lùi ra (Human Player nhặt được / không đẩy bóng khác ra), rồi quyết định lại.
      this.cmd.fwd = -CMD_SLOW
      if (this.robot.footprint().every((c) => !inRect(start, c))) this.setTask(null)
      else if (t.phase === 'push') t.phase = 'go'
      return
    }
    if (t.t > HERD_MAX_S) return give()
    const g = rectCentre(start)
    if (t.phase === 'go') {
      if (this.goTo(view, this.herdBehind(q, g), 0.06, false)) {
        t.phase = 'push'
        t.tries++
      }
      return
    }
    // Bóng phải nằm trước mũi, gần trục xe; lệch ra thì vòng lại phía sau bóng (tối đa HERD_TRIES lần).
    const f = { x: Math.sin(r.pose.yaw), z: Math.cos(r.pose.yaw) }
    const dx = q.x - r.pose.x
    const dz = q.z - r.pose.z
    const ahead = dx * f.x + dz * f.z
    const side = Math.abs(dx * f.z - dz * f.x)
    if (ahead < r.def.size.l / 2 - 0.02 || ahead > r.def.size.l / 2 + 0.25 || side > r.def.size.w / 2 - 0.02) {
      if (t.tries >= HERD_TRIES) return give()
      t.phase = 'go'
      return
    }
    // Nhắm điểm trên đường bóng → đích, lấn sang phía bóng lệch để kéo bóng về trục xe.
    const aimAt = { x: g.x + (q.x - r.pose.x - f.x * ahead) * 2, z: g.z + (q.z - r.pose.z - f.z * ahead) * 2 }
    this.pushTo(aimAt, CMD_SLOW + 15)
  }

  private runCollect(view: AgentView, t: Extract<Task, { kind: 'collect' }>, dt: number): void {
    this.collectT += dt
    const b = view.world.balls[t.ball]
    if (this.carried() >= this.capacity) return this.setTask(null)
    if (b.st !== 'field' || !b.body || t.t > TARGET_TIMEOUT_S) {
      if (b.st === 'field') this.avoid.set(t.ball, this.time + 10)
      return this.setTask(null)
    }
    const q = b.body.translation()
    const r = this.robot
    // Bóng chọn từ trước nhưng nay đã hết giờ nhận bóng mà bóng sát Khu Tiếp Tế ⇒ bỏ.
    if (this.loadLate(view) && inRect(ZONES.load[r.alliance], q, ZONE_PAD + 0.1)) return this.setTask(null)
    const d = dist(r.pose, q)
    this.cmd.sel = t.color
    this.cmd.intake = this.mouthOk(view, t.color)
    if (d > 0.5) {
      this.goTo(view, q, 0.3, false)
      return
    }
    this.aim(q, CMD_SLOW)
    // Bóng sát mũi mà hướng lệch nhiều ⇒ lùi ra rồi vào lại.
    if (d < 0.2 && Math.abs(wrap(yawTo(r.pose, q) - r.pose.yaw)) > 0.6) this.cmd.fwd = -CMD_SLOW
  }

  /** Miệng hút không có bóng sai màu (mức dễ: hút tất). */
  private mouthOk(view: AgentView, color: 'o' | 'g'): boolean {
    const r = this.robot
    if (!this.S.selective || r.compartments) return true
    const p = r.body.translation()
    const yaw = r.pose.yaw
    const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) }
    const s = { x: Math.cos(yaw), z: -Math.sin(yaw) }
    const near = r.def.size.l / 2
    for (const b of view.world.balls) {
      if (b.st !== 'field' || !b.body || b.color === color) continue
      const q = b.body.translation()
      const dx = q.x - p.x
      const dz = q.z - p.z
      const a = dx * f.x + dz * f.z
      const side = dx * s.x + dz * s.z
      if (a > near && a < near + MOUTH_DEPTH && Math.abs(side) < MOUTH_HALF_W && q.y - p.y < 0.07) return false
    }
    return true
  }

  private runFlag(view: AgentView, t: Extract<Task, { kind: 'flag' }>): void {
    const r = this.robot
    const h = view.world.holeCentres()[t.m]
    // Luật V4: chỉ Xe Cắm Cờ còn cắm cờ, bằng mũi — rời núi thì lùi ra.
    const away = -CMD_SLOW
    if (!r.hasFlag) {
      // Đã cắm (hoặc làm rơi): rời núi rồi xong.
      this.cmd.fwd = away
      if (t.phase !== 'back') {
        t.phase = 'back'
        t.t = 0
      }
      if (t.t > 0.6) this.setTask(null)
      return
    }
    if (view.match.flags[t.m]) {
      this.giveUp.add(t.m)
      return this.setTask(null)
    }
    if (t.phase === 'go') {
      this.cmd.lift = -1
      if (this.goTo(view, t.face, 0.06, false)) {
        t.phase = 'in'
        t.t = 0
        this.stillT = 0
      }
      if (t.t > 40) this.abandonFlag(t)
      return
    }
    if (t.phase === 'back') {
      this.cmd.fwd = away
      this.cmd.lift = -1
      if (t.t > 0.5) {
        t.phase = 'go'
        t.t = 0
        t.offset = FLAG_OFFSETS[t.tries % FLAG_OFFSETS.length]
        const face = this.face(t.m, 0, t.offset)
        if (face) t.face = face
      }
      return
    }
    // Tiến thẳng vào lỗ, vươn hết, nâng tay; mở kẹp đúng một bước khi điểm kẹp trên lỗ.
    this.cmd.lift = 1
    this.cmd.s1 = true // Xe Cắm Cờ vươn tay cờ (S1); luật V4: họ Maker không còn mang cờ
    const g = r.gripPoint()
    const d = Math.hypot(g.x - h.x, g.z - h.z)
    const ready = r.extend >= r.def.maxExtend - 1e-6 && (r.def.arm?.reach ? r.armFrac > 0.99 : true)
    this.pushTo(h, CMD_SLOW, false)
    if (r.lastMessage) {
      // R16: lỗ có bóng — bỏ núi này.
      this.giveUp.add(t.m)
      return this.abandonFlag(t)
    }
    const stalled = this.stillT > CONTACT_S
    if (ready && (d <= this.S.flagTol || (stalled && d <= Math.max(this.S.flagTol, 0.0245)))) {
      this.cmd.plant = true
      this.cmd.fwd = 0
      return
    }
    if ((stalled && ready && t.t > 1) || t.t > 6) {
      t.tries++
      if (t.tries >= this.S.flagTries) {
        this.giveUp.add(t.m)
        return this.abandonFlag(t)
      }
      t.phase = 'back'
      t.t = 0
    }
  }

  private abandonFlag(t: Extract<Task, { kind: 'flag' }>): void {
    this.giveUp.add(t.m)
    this.setTask(null)
  }

  private runMtn(view: AgentView, t: Extract<Task, { kind: 'mtn' }>): void {
    const r = this.robot
    const h = view.world.holeCentres()[t.m]
    const out = this.nextOut('g')
    if (t.phase === 'go') {
      this.cmd.lift = -1
      if (this.goTo(view, t.face, 0.08, false)) {
        t.phase = 'in'
        t.t = 0
        this.stillT = 0
      }
      if (t.t > 40) this.setTask(null)
      return
    }
    if (t.phase === 'in') {
      this.pushTo(h, CMD_SLOW, r.def.chuteBehind)
      this.cmd.lift = -1
      if ((this.stillT > CONTACT_S && t.t > 0.5) || t.t > 6) {
        t.phase = 'drop'
        t.t = 0
        this.dropCount = this.carried()
      }
      return
    }
    if (t.phase === 'drop') {
      this.cmd.sel = 'g'
      // Giữ mũi (cửa ra ở đuôi: đuôi) tì gờ, chỉnh mức vươn theo rãnh của bóng tiếp theo rồi mở cửa đúng lúc.
      this.pushTo(h, CMD_MIN, r.def.chuteBehind)
      const k = t.plan[0] ?? t.plan[t.plan.length - 1] ?? 1
      // Chỉ robot có thanh trượt vươn tới trước mới đẩy điểm xả ra các rãnh xa; còn lại thả ở rãnh mũi xe chạm.
      const want = LIFT_AXIS[r.def.type] === 'forward' ? DROP_EXTEND[k] : 0
      if (r.def.chuteLift) this.cmd.chute = CHUTE_FRAC[k]
      const err = want - r.extend
      this.cmd.lift = this.ports.lift ? (err > 0.004 ? 1 : err < -0.004 ? -1 : 0) : 0
      const okColor = out === 'g' || (t.anyColor && this.carried() > 0)
      if (!okColor || t.t > 12) {
        t.phase = 'back'
        t.t = 0
        return
      }
      // Một bóng vừa ra ⇒ bóng sau theo rãnh kế tiếp trong kế hoạch.
      if (this.carried() < this.dropCount) t.plan.shift()
      this.dropCount = this.carried()
      if (this.cmd.lift === 0) this.cmd.release = true
      return
    }
    this.cmd.fwd = r.def.chuteBehind ? CMD_SLOW : -CMD_SLOW
    this.cmd.lift = -1
    if (t.t > 0.6) this.setTask(null)
  }

  private runFire(view: AgentView, t: Extract<Task, { kind: 'fire' }>): void {
    if (t.phase === 'go') {
      this.cmd.lift = -1
      if (this.goTo(view, t.spot, 0.12, false)) {
        t.phase = 'drop'
        t.t = 0
      }
      if (t.t > 40) this.setTask(null)
      return
    }
    const r = this.robot
    this.cmd.sel = 'o'
    // Cửa ra ở đuôi (Mẫu Maker): quay đuôi về góc Khu Chữa Cháy.
    const e = wrap(yawTo(r.pose, t.corner) - r.pose.yaw - (r.def.chuteBehind ? Math.PI : 0))
    if (Math.abs(e) > 0.25) {
      this.cmd.turn = Math.sign(e) * CMD_TURN
      return
    }
    const out = this.nextOut('o')
    if ((out === 'o' || (t.anyColor && this.carried() > 0)) && t.t < 10) this.cmd.release = true
    else this.setTask(null)
  }

  /** Điểm chờ đồng đội: từ chỗ bám vào trong sân, xa nhất mà còn quay tại chỗ được. */
  private climbWaitSpot(s0: number): Vec2 {
    const al = this.robot.alliance
    // Đang ở túi sau thanh của mình (gom bóng ở Khu Chữa Cháy): chờ ngay trong túi, phía góc sân, lệch về phía Nước một
    // đoạn — vòng ra trong sân thì đồng đội treo trượt về chỗ dừng xa bịt hành lang giữa núi và thanh, không về kịp.
    if (inPocket(al, this.robot.pose)) {
      const at = pointAt(al, s0 + CLIMB_WAIT_POCKET.along)
      let n = { x: Math.cos(barYaw(al)), z: -Math.sin(barYaw(al)) }
      if (n.x * -at.x + n.z * -at.z > 0) n = { x: -n.x, z: -n.z }
      return { x: at.x + n.x * CLIMB_WAIT_POCKET.r, z: at.z + n.z * CLIMB_WAIT_POCKET.r }
    }
    return this.climbInward(s0, CLIMB_WAIT_R)
  }

  /** Đi tới chỗ bám quá lâu: lập đường lại (giữ nhiệm vụ: bỏ rồi nhận lại thì phải đi lại từ điểm vào). */
  private replanClimb(t: Extract<Task, { kind: 'climb' }>): void {
    t.t = 0
    this.path = []
    this.pathGoal = null
  }

  /** Có vào chỗ bám qua điểm vào không (mức contact đứng sàn: không cần). */
  private needsVia(s0: number): boolean {
    const at = pointAt(this.robot.alliance, s0)
    return !this.contactOnly && wallClearance(at.x, at.z) >= CLIMB_VIA_WALL
  }

  /**
   * Điểm vào chỗ bám: chỗ bám sát rào thì từ phía trong sân (đi dọc rào tới thì tâm xe lệch về phía rào, quay theo thanh
   * là chạm rào); còn lại từ xa hơn dọc thanh, để tới chỗ bám đã gần thẳng theo thanh (mũi hướng b → a) và chỉ phải quay ít —
   * quay nhiều ở chỗ bám là quét vào đồng đội đứng / treo ở chỗ bám bên cạnh.
   */
  private climbVia(s0: number): Vec2 {
    const al = this.robot.alliance
    const at = pointAt(al, s0)
    return wallClearance(at.x, at.z) < CLIMB_VIA_WALL ? this.climbInward(s0, [CLIMB_VIA_R]) : pointAt(al, s0 + CLIMB_VIA_ALONG)
  }

  /** Điểm từ chỗ bám vào trong sân (theo pháp tuyến của thanh), xa nhất trong `rs` mà còn quay tại chỗ được. */
  private climbInward(s0: number, rs: number[]): Vec2 {
    const al = this.robot.alliance
    const at = pointAt(al, s0)
    // Pháp tuyến của thanh hướng về giữa sân.
    const yaw = barYaw(al)
    let n = { x: Math.cos(yaw), z: -Math.sin(yaw) }
    if (n.x * -at.x + n.z * -at.z < 0) n = { x: -n.x, z: -n.z }
    for (const R of rs) {
      const p = { x: at.x + n.x * R, z: at.z + n.z * R }
      if (mountainClearance(p.x, p.z) >= TURN_CLEAR && wallClearance(p.x, p.z) >= TURN_CLEAR) return p
    }
    const R = rs[rs.length - 1]
    return { x: at.x + n.x * R, z: at.z + n.z * R }
  }

  /**
   * Leo Thang Cứu Hỏa (luật V4), chỉ ra lệnh qua cổng: tới chỗ bám dưới đoạn Đất (ô vàng), quay mũi theo thanh, giơ móc
   * (180°) chạm xà; mức contact giữ nguyên đó. Còn lại hạ móc (0°) để treo, rồi lái bánh tiến để trượt tới chỗ dừng.
   * Chỗ bám đang có robot khác đứng sàn thì chờ ở điểm chờ. Robot treo đi sau (chỗ dừng gần hơn) chỉ trượt khi robot
   * đi trước đã treo, và luôn cách robot / thân xe phía trước trên thanh ≥ CLIMB_FOLLOW_GAP.
   */
  private runClimb(view: AgentView, t: Extract<Task, { kind: 'climb' }>, left: number): void {
    const late = left <= CLIMB_GRAB_S + Math.abs(t.target - t.s0) / HOOK.slideV + 1
    const r = this.robot
    const al = r.alliance
    const at = pointAt(al, t.s0)
    const yaw = barYaw(al)
    const contact = this.contactOnly
    if (t.phase === 'go') {
      // Chỗ bám đang có robot khác đứng (chưa treo), hay thân treo còn phủ lên chỗ bám (thanh CAD lắp sân: hai robot cùng
      // liên minh bám chung một chỗ ở Đất), thì chờ ở điểm chờ.
      const busy = view.robots.some((o) =>
        o !== r && (o.climb.mode === 'floor' ? dist(o.pose, at) < 0.25 : o.climb.bar === al && Math.abs(o.climb.s - t.s0) < CLIMB_FOLLOW_GAP))
      const block = this.climbBlock()
      if (busy) {
        this.goTo(view, this.climbWaitSpot(t.s0), 0.08, false, block)
        return
      }
      if (t.via) {
        if (this.goTo(view, this.climbVia(t.s0), 0.06, false, block)) t.via = false
        if (t.t > CLIMB_GO_MAX_S) this.replanClimb(t)
        return
      }
      // Robot đi trước đang quay theo thanh / móc ở chỗ bám bên cạnh: đứng chờ (hai xe cùng quay tại chỗ quét vào nhau).
      const lead = this.leader()
      if (lead && lead.robot.climb.mode === 'floor' && lead.turningAt && dist(lead.robot.pose, at) < CLIMB_TURN_CLEAR && !late) return
      if (this.goTo(view, at, CLIMB_GO_TOL, false, block)) {
        t.phase = 'align'
        t.t = 0
        t.best = Infinity
      }
      if (t.t > CLIMB_GO_MAX_S) this.replanClimb(t)
      return
    }
    const p = project(al, r.pose.x, r.pose.z)
    if (t.phase === 'align') {
      // Quay tại chỗ (tâm xe đứng yên) cho mũi xe theo thanh; lệch khỏi chỗ bám hoặc quá giờ (kẹt) thì đi lại từ đầu.
      // Thân xe dọc thanh theo chiều nào cũng như nhau (lúc bám, thân treo tự quay theo a → b): quay về chiều gần hơn.
      const e0 = wrap(yaw - r.pose.yaw)
      const back = Math.abs(e0) > Math.PI / 2
      const e = back ? wrap(e0 - Math.PI) : e0
      // Tiến độ: sai hướng (rad) + sai chỗ dọc thanh (quy ra rad: 1 cm ~ 0,1).
      const err = Math.abs(e) + 10 * Math.abs(t.s0 - p.s)
      if (err < t.best - 0.02) {
        t.best = err
        t.t = 0
      }
      if (p.d > CLIMB_TOL || Math.abs(p.s - t.s0) > CLIMB_ALONG || t.t > CLIMB_ALIGN_MAX_S) {
        t.phase = 'go'
        t.t = 0
        t.via = this.needsVia(t.s0)
        return
      }
      if (Math.abs(e) > 0.04) {
        this.cmd.turn = Math.sign(e) * (Math.abs(e) > 0.3 ? CMD_TURN : CMD_MIN + 10)
        return
      }
      // Thân đã dọc thanh: nhích tới / lùi cho đúng chỗ bám (sát rào, lệch vài cm là thân treo vươn ra ngoài rào). Mũi hướng
      // a → b thì tiến = s tăng, hướng b → a thì ngược lại.
      const along = t.s0 - p.s
      if (Math.abs(along) > CLIMB_NUDGE) {
        this.cmd.fwd = Math.sign(along) * (back ? -1 : 1) * (CMD_MIN + 12)
        this.cmd.turn = Math.max(-10, Math.min(10, K_TURN * e))
        return
      }
      t.phase = 'up'
      t.t = 0
      return
    }
    if (t.phase === 'up') {
      this.cmd.hook = 180
      if (contact || t.t < CLIMB_UP_S) return
      this.cmd.hook = 0
      t.phase = 'slide'
      t.t = 0
      return
    }
    if (contact) {
      this.cmd.hook = 180
      return
    }
    this.cmd.hook = 0
    if (r.climb.mode !== 'hang') {
      // Không bám được (lệch thanh / thanh đủ 2 robot): thử lại từ đầu.
      if (t.t > 0.2) {
        t.phase = 'go'
        t.t = 0
        t.via = this.needsVia(t.s0)
      }
      return
    }
    if (t.phase === 'slide' || t.phase === 'done') {
      // Lái bánh tiến / lùi đẩy chỗ bám trượt dọc thanh (mũi xe hướng a → b, tiến = s tăng); chậm lại khi gần chỗ dừng.
      const err = this.slideGoal(view, t, left) - r.climb.s
      if (Math.abs(err) <= 0.004) {
        t.phase = 'done'
        return
      }
      t.phase = 'slide'
      const v = Math.abs(err) > 0.05 ? CMD_CRUISE : CMD_MIN + 15
      this.cmd.fwd = Math.sign(err) * v
    }
  }

  /**
   * Chỗ dừng lúc này khi đang treo: chỗ dừng của kế hoạch, nhưng không vượt lên sát robot phía trước trên thanh (treo:
   * cách ≥ CLIMB_FOLLOW_GAP; đứng sàn dưới thanh: cũng vậy, thân treo không qua được nóc xe). Đồng đội đi xa hơn chưa treo
   * thì giữ nguyên chỗ bám để họ còn vào chỗ bám của họ — trừ khi chỉ còn vừa đủ giờ trượt.
   */
  private slideGoal(view: AgentView, t: Extract<Task, { kind: 'climb' }>, left: number): number {
    const r = this.robot
    const al = r.alliance
    const s = r.climb.s
    let goal = t.target
    const lead = this.leader()
    const late = left <= Math.abs(t.target - s) / HOOK.slideV + 1.5
    // Đồng đội đi xa hơn chưa treo: lùi về đúng chỗ bám (bám lệch tới trước vài cm là thân treo chắn chỗ bám của họ).
    if (lead && lead.robot.climb.mode !== 'hang' && !late) goal = Math.min(goal, t.s0)
    for (const o of view.robots) {
      if (o === r) continue
      const os = o.climb.mode === 'hang' ? (o.climb.bar === al ? o.climb.s : null) : (() => {
        const pr = project(al, o.pose.x, o.pose.z)
        return pr.d < 0.25 ? pr.s : null
      })()
      if (os !== null && os > s) goal = Math.min(goal, os - CLIMB_FOLLOW_GAP)
    }
    // Không lùi quá đầu đoạn trượt trong sân (thân treo không xuyên rào).
    return Math.max(goal, Math.min(r.slideRange(al).min, s))
  }

  /**
   * Ô cấm khi đi tới chỗ bám: "túi" góc sân sau thanh xà của liên minh kia và dải ngay dưới thanh đó (robot của họ treo
   * trên thanh là bịt lối ra / lối dọc thanh), và túi sau thanh của mình khi đang ở ngoài.
   */
  private climbBlock(): ((p: Vec2) => boolean) | undefined {
    const own = this.robot.alliance
    const other: Alliance = own === 'red' ? 'blue' : 'red'
    // Đã ở hẳn phía góc của thanh kia (không còn đường khác) thì thôi; đứng trong dải dưới thanh vẫn cấm (ô xuất phát luôn đi được).
    if (inPocket(other, this.robot.pose)) return undefined
    // Túi sau thanh của chính mình cũng cấm khi đang ở ngoài: thanh theo CAD lắp sân sát rào, lối từ túi tới chỗ bám (Đất,
    // sát rào bên) hẹp và đồng đội treo trước là bịt mất (đo: Maker Pro omni Khó seed 1 đi dọc rào xa vào túi rồi kẹt).
    const ownToo = !inPocket(own, this.robot.pose)
    return (p) => inPocket(other, p) || (ownToo && inPocket(own, p))
  }

  /** Robot khác làm chướng ngại cho A* (robot đang treo chặn rộng hơn). */
  private obstacles(view: AgentView, climbing = false): (Vec2 & { r?: number })[] {
    const out: (Vec2 & { r?: number })[] = view.robots.filter((o) => o !== this.robot).map((o) => (o.climb.mode === 'hang' ? { ...o.pose, r: HANG_R } : o.pose))
    // Đi leo: robot máy khác (cả hai liên minh) sắp treo ở chỗ dừng của họ — tính trước như đã treo, kẻo đường đang đi bị
    // bịt giữa chừng (vd. robot treo ở 1,05 chặn dải giữa núi C/D và thanh) rồi phải quay lại vòng đường khác.
    if (climbing && this.boardOf) {
      for (const [o, a] of this.boardOf.agents) {
        const p = a.climbPlan
        if (o === this.robot || !p || p.level === 'contact' || o.climb.mode === 'hang') continue
        out.push({ ...pointAt(o.alliance, p.target), r: HANG_R })
      }
    }
    return out
  }

  /** Lái về `goal` theo đường A*; true khi tới trong `tol`. */
  private goTo(view: AgentView, goal: Vec2, tol: number, toLoad: boolean, block?: (p: Vec2) => boolean): boolean {
    const r = this.robot
    const p = r.pose
    const d0 = dist(p, goal)
    if (d0 <= tol) {
      this.progress = null
      return true
    }
    if (!this.progress || dist(this.progress.goal, goal) > 0.05) this.progress = { goal, best: d0, t: 0 }
    else if (d0 < this.progress.best - NO_PROGRESS_M) {
      this.progress.best = d0
      this.progress.t = 0
    } else if ((this.progress.t += this.dt) > NO_PROGRESS_S && this.recover <= 0) {
      this.progress = { goal, best: d0, t: 0 }
      this.recover = RECOVER_S
      this.recoverTurn = this.rnd() < 0.5 ? -1 : 1
      this.path = []
      this.pathGoal = null
      return false
    }
    this.replanIn -= this.dt
    if (!this.pathGoal || dist(this.pathGoal, goal) > 0.05 || this.replanIn <= 0 || this.path.length === 0) {
      const left = MATCH_S - view.match.t
      const load = ZONES.load[r.alliance]
      // Cấm sớm hơn giờ chót nhận bóng một quãng đi đường, để đường đã lập không cắt qua khu lúc hết giờ nhận.
      const late = !this.loadAllowed(left - LOAD_PLAN_S, p)
      const others = this.obstacles(view, this.task?.kind === 'climb')
      // Đi leo: tránh hành lang hẹp giữa núi (quay tại chỗ là kẹt, đế 4 bánh càng dễ kẹt), đi vòng làn ngoài rộng.
      const narrow = this.task?.kind === 'climb' ? CLIMB_NARROW : 0
      // Đi leo: lề vùng cấm Khu Tiếp Tế chỉ vừa nửa đường chéo thân (không góc nào lọt vào khu), để còn lối dọc rào giữa
      // khu và Núi A xuống chỗ bám (lề ZONE_PAD bịt kín lối đó).
      const forbidPad = this.task?.kind === 'climb' ? CLIMB_ZONE_PAD : ZONE_PAD
      const opts = { others, forbid: !toLoad && late ? [load] : [], avoid: toLoad ? [] : [load], block, narrow, forbidPad }
      // Robot khác chặn kín mọi lối (vd. hành lang giữa núi) ⇒ lập đường bỏ qua robot (chúng còn di chuyển), vẫn giữ vùng cấm.
      const res = planPath(p, goal, opts) ?? (block ? planPath(p, goal, { ...opts, others: [] }) : null)
      this.path = res ? res.path : [goal]
      this.pathGoal = goal
      this.replanIn = REPLAN_S
    }
    // Bỏ các điểm đã qua; nhắm điểm cách xa LOOKAHEAD.
    while (this.path.length > 1 && dist(p, this.path[0]) < LOOKAHEAD) this.path.shift()
    const target = this.path[0]
    const last = this.path.length === 1
    const d = dist(p, target)
    const speed = last && d < 0.35 ? CMD_SLOW : this.cruise
    this.aim(target, speed)
    return false
  }

  /**
   * Tiến thẳng vào lỗ h (mũi xe nhắm tâm lỗ: điểm kẹp / điểm xả nằm trên trục xe nên đi qua lỗ dù xe lệch ngang);
   * lệch hướng quá PUSH_TURN thì quay tại chỗ trước.
   */
  private pushTo(h: Vec2, speed: number, reverse = false): void {
    const p = this.robot.pose
    // Lùi: đuôi xe (hướng yaw + π) nhắm tâm lỗ; quay trái vẫn xoay đuôi cùng chiều nên bộ P giữ nguyên dấu.
    const e = wrap(yawTo(p, h) - p.yaw - (reverse ? Math.PI : 0) + this.noise)
    if (Math.abs(e) > PUSH_TURN) {
      this.cmd.fwd = 0
      this.cmd.turn = Math.sign(e) * CMD_TURN
      return
    }
    this.cmd.fwd = reverse ? -speed : speed
    this.cmd.turn = Math.max(-25, Math.min(25, K_TURN * e))
  }

  /** Lệnh tiến + quay để mũi xe hướng về q (bộ P theo sai số hướng, quay tại chỗ khi lệch nhiều). */
  private aim(q: Vec2, speed: number): void {
    const r = this.robot
    const e = wrap(yawTo(r.pose, q) - r.pose.yaw + this.noise)
    // Đích ở phía sau mà chỗ đứng chật (hành lang giữa hai núi / sát rào: quay tại chỗ là kẹt) ⇒ lùi thẳng về đích.
    const back = wrap(e - Math.PI)
    // Dùng cho mọi việc (không chỉ đi leo): bỏ ra thì robot máy mức Dễ mất hẳn điểm nhiệm vụ (seed 1: 197 → −9).
    const tight = mountainClearance(r.pose.x, r.pose.z) < TURN_CLEAR || wallClearance(r.pose.x, r.pose.z) < TURN_CLEAR
    if (tight && Math.abs(e) > TURN_IN_PLACE && Math.abs(back) <= TURN_IN_PLACE) {
      this.cmd.fwd = -speed * Math.max(0.4, 1 - Math.abs(back) / 1.2)
      this.cmd.turn = Math.max(-35, Math.min(35, K_TURN * back))
      return
    }
    if (Math.abs(e) > TURN_IN_PLACE) {
      this.cmd.fwd = 0
      this.cmd.turn = Math.sign(e) * CMD_TURN
      return
    }
    this.cmd.fwd = speed * Math.max(0.4, 1 - Math.abs(e) / 1.2)
    this.cmd.turn = Math.max(-35, Math.min(35, K_TURN * e))
  }

  /** Kẹt (có lệnh chạy mà đứng yên) ⇒ lùi gỡ; đứng yên lúc tì vào núi thì ghi lại cho bước "chạm gờ". */
  private watchStuck(dt: number): void {
    const v = this.robot.body.linvel()
    const w = Math.abs(this.robot.body.angvel().y)
    const still = Math.hypot(v.x, v.z) < STUCK_V && w < 0.15
    this.stillT = still ? this.stillT + dt : 0
    const t = this.task
    const pushing = t && ((t.kind === 'flag' && t.phase === 'in') || (t.kind === 'mtn' && (t.phase === 'in' || t.phase === 'drop')) ||
      (t.kind === 'fire' && t.phase === 'drop') || t.kind === 'load' || t.kind === 'idle' || (t.kind === 'climb' && t.phase !== 'go'))
    const moving = Math.abs(this.lastCmd.fwd) + Math.abs(this.lastCmd.turn) >= CMD_MIN
    if (!pushing && still && moving && this.recover <= 0) this.stuckT += dt
    else this.stuckT = 0
    if (this.stuckT > STUCK_S) {
      this.stuckT = 0
      this.recover = RECOVER_S
      this.recoverTurn = this.rnd() < 0.5 ? -1 : 1
      this.path = []
      this.pathGoal = null
    }
  }

  /** Lỗi của người lái mức dễ: lệch hướng, lỡ tay mở cửa xả. */
  private mistakes(dt: number): void {
    if (this.S.noise > 0) {
      this.noiseIn -= dt
      if (this.noiseIn <= 0) {
        this.noiseIn = 0.6 + this.rnd()
        this.noise = (this.rnd() * 2 - 1) * this.S.noise
      }
    }
    if (this.S.dropPerS > 0 && this.carried() > 0) {
      if (this.dropT > 0) {
        this.dropT -= dt
        this.cmd.release = true
      } else if (this.rnd() < this.S.dropPerS * dt) this.dropT = 0.3
    }
  }

  // ---------- Ra cổng ----------

  private toPorts(): PortValues {
    const c = this.cmd
    const r = this.robot
    const out: PortValues = { ...NEUTRAL }
    const L = wheelCmd(c.fwd - c.turn)
    const R = wheelCmd(c.fwd + c.turn)
    const w = this.ports.wheels
    if (this.cfg.drive === 'diff2') {
      out[w.L!] = L
      out[w.R!] = R
    } else {
      out[w.FL!] = L
      out[w.RL!] = L
      out[w.FR!] = R
      out[w.RR!] = R
    }
    const p = this.ports
    if (p.intake) {
      if (p.intakeKind === 's360') out[p.intake] = c.intake ? 180 : 90
      else out[p.intake] = c.intake ? 80 : 0
    }
    if (p.lift) {
      if (p.liftKind === 's360') out[p.lift] = c.lift > 0 ? 180 : c.lift < 0 ? 0 : 90
      else out[p.lift] = c.lift * 100
    }
    if (r.def.chuteLift) out.S1 = Math.round(c.chute * 180)
    else if (r.def.servos.S1) out.S1 = c.s1 ? 180 : 0
    if (r.def.flag) out.S2 = c.plant ? 30 : 150
    else if (r.compartments) out.S2 = c.sel === 'g' ? 150 : 30
    out.S3 = c.release ? 150 : 30
    // Cổng móc leo xà chỉ do việc leo điều khiển: ghi sau cùng nên không lệnh servo nào khác (vd. S1 của Xe Phân Loại,
    // S2 kẹp cờ) đè lên được.
    out[r.def.hook.port] = c.hook
    return out
  }
}
