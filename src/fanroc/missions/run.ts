// Một lần chạy nhiệm vụ con rùa, từ ▶ tới lúc chấm (màn ②): ghi vệt (Trail) và chạm núi mỗi bước vật lý, hỏi
// `shouldGrade` (R57/R59/R95) đã tới lúc chấm chưa, rồi chấm ⭐ trên bản ghi RunRecord. Thuần — không DOM / three.js;
// trang đưa vào một "khung nhìn" của robot ghế 0 (RobotBody + Match đều khớp kiểu RunView).
import { Trail } from '../trail.ts'
import type { Pose } from '../layout.ts'
import type { PortValues } from '../ports.ts'
import type { MatchEvent } from '../match.ts'
import type { FieldTally } from '../scoring.ts'
import { grade, shouldGrade, touchesMountain, type GradeReason } from './grade.ts'
import type { GradeResult, Mission, RunRecord } from './types.ts'

/** Thứ MissionRun đọc mỗi bước: robot của em (tư thế, thân xe, cổng vừa ra lệnh) và trận (nhật ký, đếm bóng). */
export interface RunView {
  readonly pose: Pose
  readonly ports: PortValues
  readonly events: readonly MatchEvent[]
  footprint(): { x: number; z: number }[]
  /** Đếm bóng trên sân (dò tia trên mọi bóng — tốn, chỉ gọi khi cần). */
  tally(): FieldTally
}

/** Nhiệm vụ lái đứng yên: điều kiện ⭐ xét lại trên bản ghi mới tối đa chừng này lần mỗi giây (tally tốn). */
const RECORD_HZ = 4

export class MissionRun {
  readonly trail = new Trail()
  /** Thân xe đã chạm chân núi lần nào kể từ ▶. */
  touched = false
  result: GradeResult | null = null
  reason: GradeReason | null = null
  record: RunRecord | null = null
  private t = 0
  private cache: { t: number; rec: RunRecord } | null = null

  readonly mission: Mission
  private readonly program: object | null

  /** `program` = chương trình đã chạy (vùng khối lúc ▶); nhiệm vụ lái thì bản ghi luôn để null. `v` = lúc ▶. */
  constructor(mission: Mission, program: object | null, v: RunView) {
    this.mission = mission
    this.program = program
    this.trail.add(0, v.pose, v.ports)
    this.touched = touchesMountain(v.footprint())
  }

  get done(): boolean {
    return this.result !== null
  }

  /** Sau mỗi bước vật lý `dt` giây. `waiting` = bo ảo đang ở khối «đợi» (R95). Trả kết quả khi vừa chấm. */
  step(v: RunView, dt: number, waiting = false): GradeResult | null {
    if (this.result) return null
    this.t += dt
    this.trail.add(this.t, v.pose, v.ports)
    if (!this.touched && touchesMountain(v.footprint())) this.touched = true
    const tr = this.trail
    const why = shouldGrade(this.mission, { elapsed: tr.time, hasMoved: tr.hasMoved, lastMoveTime: tr.lastMoveTime, pressed: false, waiting }, () => this.recent(v))
    return why ? this.finish(why, v) : null
  }

  /** Học sinh bấm Chấm / Dừng: chấm ngay (một lần). */
  press(v: RunView): GradeResult | null {
    return this.result ? null : this.finish('pressed', v)
  }

  /** Chấm thử trên trạng thái hiện tại (thẻ thử thách tự tích ✓ trong lúc chạy); không kết thúc lần chạy. */
  preview(v: RunView): GradeResult {
    return grade(this.mission, this.snapshot(v))
  }

  /** Bản ghi đúng lúc này (hợp đồng RunRecord, types.ts). */
  snapshot(v: RunView): RunRecord {
    const tr = this.trail
    return {
      start: this.mission.start,
      end: { ...v.pose },
      trail: { distance: tr.distance, turned: tr.turned, time: tr.lastMoveTime },
      touchedMountain: this.touched,
      events: [...v.events],
      tally: v.tally(),
      program: this.mission.kind === 'drive' ? null : this.program,
    }
  }

  /** Bản ghi cho shouldGrade (nhiệm vụ lái đứng yên), dựng lại tối đa RECORD_HZ lần mỗi giây. */
  private recent(v: RunView): RunRecord {
    if (!this.cache || this.t - this.cache.t >= 1 / RECORD_HZ) this.cache = { t: this.t, rec: this.snapshot(v) }
    return this.cache.rec
  }

  private finish(why: GradeReason, v: RunView): GradeResult {
    this.record = this.snapshot(v)
    this.reason = why
    this.result = grade(this.mission, this.record)
    return this.result
  }
}
