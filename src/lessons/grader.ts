/**
 * Khuôn chấm cho các bài từ 4: mỗi việc là một điều kiện trên quan sát, phải đúng liên tục `hold` µs
 * (thời gian ảo) mới đạt — để một khoảnh khắc chập chờn không được ✓. Việc đã đạt giữ ✓ cả khi chạy
 * lại (các bước sau sửa tiếp chương trình của bước trước). Mỗi lần chạy có một `Run` riêng để các
 * điều kiện ghi nhớ điều đã thấy ("đã thấy bánh quay tới").
 */
import type { RuleResult } from '@thingblock/thingblock-sim/checker'
import type { Grader, GraderChange, Observation } from './types'

export interface Run {
  /** Thời gian ảo lúc bắt đầu chạy, µs. */
  start: number
  /** Thời gian ảo đã chạy, µs. */
  elapsed: number
  /** Bộ nhớ tự do của bài trong lần chạy này. */
  seen: Record<string, number | boolean | string>
  passed: ReadonlySet<string>
}

export interface Check {
  when: (o: Observation, run: Run) => boolean
  /** Thời gian điều kiện phải đúng liên tục, µs (mặc định 300 ms). */
  hold?: number
}

export interface GraderSpec {
  checks: Record<string, Check>
  /** Ghi nhớ trước khi chấm (cập nhật `run.seen`). */
  track?: (o: Observation, run: Run) => void
  /** Gợi ý cho bước đang mở khi chưa đạt; null = không có gì để nói. */
  hint?: (o: Observation, run: Run) => string | null
}

export const makeGrader =
  (spec: GraderSpec) =>
  (onChange: GraderChange): Grader => {
    let passed = new Set<string>()
    let hint: string | null = null
    let run: Run | null = null
    let since: Record<string, number> = {}
    const emit = () => onChange(passed, hint)

    return {
      restart() {
        run = null
        since = {}
        if (hint !== null) {
          hint = null
          emit()
        }
      },
      clear() {
        passed = new Set()
        run = null
        since = {}
        hint = null
        emit()
      },
      observe(o) {
        if (!o.running) return
        run ??= { start: o.t, elapsed: 0, seen: {}, passed }
        run.elapsed = o.t - run.start
        run.passed = passed
        spec.track?.(o, run)
        let changed = false
        for (const [id, check] of Object.entries(spec.checks)) {
          if (passed.has(id)) continue
          if (!check.when(o, run)) {
            delete since[id]
            continue
          }
          since[id] ??= o.t
          if (o.t - since[id] >= (check.hold ?? 300_000)) {
            passed.add(id)
            changed = true
          }
        }
        const id = o.card.check
        const next = id && !passed.has(id) ? (spec.hint?.(o, run) ?? null) : null
        if (changed || next !== hint) {
          hint = next
          emit()
        }
      },
    }
  }

/** Kết quả luật `kiểm:` theo đúng chữ của luật, trong danh sách `rules` của bài. */
export const ruleResult = (rules: string[], o: Observation, text: string): RuleResult | undefined =>
  o.rules?.[rules.indexOf(text)]

/** Tốc độ có dấu của động cơ, -1..1, theo đúng mã ThingBlock sinh: tiến = kênh B có xung, lùi = kênh A. */
const MOTOR_AB: Record<number, [number, number]> = { 1: [2, 3], 2: [4, 5], 3: [7, 6], 4: [1, 0] }
export const motorSpeed = (pwm: number[], motor: 1 | 2 | 3 | 4): number => {
  const [a, b] = MOTOR_AB[motor]
  const da = Math.min(pwm[a], 4095)
  const db = Math.min(pwm[b], 4095)
  if (db > 0 && da === 0) return db / 4095
  if (da > 0 && db === 0) return -da / 4095
  return 0
}

/** Góc servo theo duty kênh (đảo `map(deg, 0, 180, 102, 512)`), hoặc null khi servo đã thả / chưa đặt. */
export const servoAngle = (duty: number): number | null =>
  duty <= 0 || duty >= 4096 ? null : Math.round(((duty - 102) * 180) / 410)

export const pct = (v: number) => Math.round(Math.abs(v) * 100)
