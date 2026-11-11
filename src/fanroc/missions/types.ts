// Kiểu dữ liệu của nhiệm vụ con rùa (màn ②): mỗi nhiệm vụ là dữ liệu thuần (missions/data.ts), bộ chấm ⭐ là hàm
// thuần (missions/grade.ts) đọc một bản ghi lần chạy. Không phụ thuộc DOM / three.js / Rapier.
import type { Pose, Rect } from '../layout.ts'
import type { RobotConfig } from '../robots.ts'
import type { MatchEvent } from '../match.ts'
import type { FieldTally } from '../scoring.ts'

/**
 * Một điều kiện kiểm trên trạng thái mô phỏng sau lần chạy (spec §6.3). Mọi số đo theo mét / độ / giây.
 * Năm loại cuối (`turn`, `time`, `paramBlock`, `score`, `park.full`, `measure.min`) là phần thêm của người dựng
 * (spec §9: điều kiện ⭐ cụ thể do người dựng chọn).
 */
export type Goal =
  /** Tâm robot lúc chấm nằm trong vùng. */
  | { type: 'reach'; rect: Rect }
  /** Tâm robot lúc chấm cách chỗ xuất phát ≤ `tol` m (khép vòng; hướng cuối không chấm). */
  | { type: 'return'; tol: number }
  /** Không lần nào thân robot chạm hình bao chân núi. */
  | { type: 'noMountain' }
  /** Ô số đo đạt ít nhất `min` (quãng: m, góc đã quay: độ); thiếu `min` ⇒ chỉ cần > 0. */
  | { type: 'measure'; what: 'distance' | 'turned'; min?: number }
  /** Chương trình (phần nối với khối mũ) có đủ các khối này. */
  | { type: 'uses'; opcodes: string[] }
  /** Robot của em (Robot 1, chỉ số 0 trong trận) đã cắm cờ lên núi `mountain` (0..3 = A..D): sự kiện của match.ts. */
  | { type: 'flag'; mountain: number }
  /** Robot của em (Robot 1, đỏ) đỗ trong Vùng Bảo Vệ lúc chấm; `full` ⇒ phải đỗ toàn phần. */
  | { type: 'park'; full?: boolean }
  /** Khu Chữa Cháy còn ≤ `max` bóng xanh. */
  | { type: 'fireClear'; max: number }
  /** Trận đã chạy hết giờ. */
  | { type: 'matchEnd' }
  /** Hướng cuối lệch hướng đầu đúng `deg` độ (dương = quay trái, ngược chiều kim đồng hồ nhìn từ trên), sai ≤ `tol` độ. */
  | { type: 'turn'; deg: number; tol: number }
  /** Robot dừng hẳn (RunRecord.trail.time, R57) trong vòng `max` s kể từ ▶. */
  | { type: 'time'; max: number }
  /** Chương trình gọi khối của em có ít nhất một ô số, ít nhất `calls` lần (mặc định 1). */
  | { type: 'paramBlock'; calls?: number }
  /** Điểm trận (chung cả 4 đội) ≥ `min`. */
  | { type: 'score'; min: number }

/**
 * Tình huống chọn câu gợi ý: loại của điều kiện đầu tiên chưa đạt (xét ⭐ trước, rồi ⭐⭐, ⭐⭐⭐), hoặc dạng chi tiết:
 * `short` / `long` (chưa tới / quá vùng `reach`, theo hướng xuất phát), `turnOver` / `turnUnder` (quay quá / chưa đủ).
 * Câu có `{d}` được thay số: cm (reach, return) hoặc độ (turn).
 */
export type HintWhen = Goal['type'] | 'short' | 'long' | 'turnOver' | 'turnUnder'

export interface Mission {
  id: string
  stage: 1 | 2 | 3 | 4
  n: number
  title: string
  goal: string
  robot: RobotConfig
  start: Pose
  balls: boolean
  toolbox: object
  starter: object | null
  /** Các bước HƯỚNG DẪN. */
  guide: string[]
  /** Đường gợi ý nét đứt vẽ trên sàn. */
  path?: { x: number; z: number }[]
  kind: 'drive' | 'program' | 'match'
  /** Giới hạn thời gian một lần chạy (s, kể từ ▶): hết giờ thì chấm ngay (R57 c). Chặng 4: đồng hồ trận. */
  maxTime: number
  /** ⭐: đạt mọi điều kiện này (nhiệm vụ xong). */
  goals: Goal[]
  /** Điều kiện thêm: ⭐⭐ = ⭐ + `two`; ⭐⭐⭐ = ⭐⭐ + `three`. */
  stars: { two: Goal[]; three: Goal[] }
  hints: { when: HintWhen; text: string }[]
}

/**
 * Bản ghi một lần chạy — hợp đồng với GameSession (Task 10), quyết định R57.
 *
 * Thời điểm chấm (R57, sửa bởi R59) — GameSession gọi `shouldGrade` (grade.ts) mỗi bước:
 *   (b) học sinh bấm Dừng / Chấm — mọi loại nhiệm vụ;
 *   (c) hết `Mission.maxTime` giây kể từ ▶ (nhiệm vụ trận: hết đồng hồ trận) — mọi loại;
 *   (a) robot đứng yên — trong 1,0 s vừa qua tâm dời < 5 mm và hướng đổi < 2° — sau khi đã chạy ít nhất một lần
 *       (`Trail.hasMoved` và `Trail.time − Trail.lastMoveTime ≥ 1`; ngưỡng ở trail.ts MOVE_STEP / MOVE_TURN_DEG,
 *       "hướng đổi" để quay tại chỗ không bị coi là đứng yên, R58):
 *         - `kind: 'program'`: chấm ngay;
 *         - `kind: 'drive'` (lái bàn phím): chỉ chấm khi mọi điều kiện ⭐ đã đạt — em dừng lại suy nghĩ không bị chấm;
 *         - `kind: 'match'`: không dùng.
 * Mọi trường dưới đây lấy ĐÚNG lúc chấm đó (`end`, `tally`, `events`, `touchedMountain` gộp từ ▶ tới lúc chấm),
 * riêng `trail.time` = `Trail.lastMoveTime`: số giây từ ▶ tới lần cuối robot còn chạy (lúc nó dừng hẳn), KHÔNG tính
 * khoảng 1 s chờ xác nhận đứng yên hay lúc bấm Chấm. Điều kiện ⭐ `time` so với số này (thời gian tới nơi).
 */
export type RunRecord = {
  start: Pose
  end: Pose
  /** Số đo của vệt (Trail): `distance` m, `turned` độ, `time` = Trail.lastMoveTime (s, xem trên). */
  trail: { distance: number; turned: number; time: number }
  touchedMountain: boolean
  events: MatchEvent[]
  tally?: FieldTally
  /** Chương trình (serialization JSON của vùng khối) đã chạy, hoặc null khi lái tay. */
  program: object | null
  /** Chương trình dừng vì lỗi (câu tiếng Việt của RobotLink, vd. "Chương trình dừng vì lỗi: chia một số nguyên cho 0"):
   *  lần chạy không đạt dù robot đã tới đâu (anh Tuấn 12/11: chia cho 0 vẫn được 1 sao). */
  error?: string | null
}

export type GradeResult = { done: boolean; stars: 0 | 1 | 2 | 3; goals: { text: string; ok: boolean }[]; hint: string | null }
