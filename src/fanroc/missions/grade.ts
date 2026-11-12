// Bộ chấm ⭐ của nhiệm vụ con rùa: hàm thuần trên một bản ghi lần chạy (RunRecord). Không phụ thuộc DOM / Rapier;
// chương trình đọc thẳng từ serialization JSON của vùng khối (không cần nạp scratch-blocks).
//
// ⭐ = đạt mọi `goals`; ⭐⭐ = ⭐ + `stars.two`; ⭐⭐⭐ = ⭐⭐ + `stars.three` (spec §8.3). Gợi ý = câu của điều kiện đầu
// tiên chưa đạt trong mức sao thấp nhất còn thiếu có câu gợi ý hợp tình huống; `{d}` thay bằng số (cm, độ hoặc điểm).
import { procedureArgCount } from '../procedures.ts'
import { scoreTally } from '../scoring.ts'
import type { Climb } from '../ladder.ts'
import { mountainAt, type Pose } from '../layout.ts'
import type { Goal, GradeResult, HintWhen, Mission, RunRecord } from './types.ts'

/** Thứ tự mức leo Thang Cứu Hỏa (luật V4) để so `climb.min`. */
const CLIMB_ORDER: Climb[] = ['none', 'contact', 'ground', 'water']
/** Câu gợi ý theo mức leo còn thiếu (không có câu riêng thì dùng câu `climb`). */
const CLIMB_HINT: Record<Climb, HintWhen> = { none: 'climb', contact: 'climbContact', ground: 'climbGround', water: 'climbWater' }

/** Robot đứng yên bao lâu (s) thì coi là đã dừng hẳn (R57 a). */
export const REST_S = 1

const MOUNTAIN_NAME = 'ABCD'
/** Câu nhật ký trận khi hết giờ (match.ts `finish`). */
const MATCH_END = /^Hết giờ/

type Check = { ok: boolean; when: HintWhen; d: number | null }

// ---------- Đọc chương trình ----------
type Blk = { type?: string; extraState?: unknown; inputs?: Record<string, { block?: Blk; shadow?: Blk }>; next?: { block?: Blk } }
/** Khối mũ: chỉ chồng khối bắt đầu bằng một khối mũ mới chạy; khối rời trên vùng khối không tính. */
const HATS = new Set(['event_whenarduinobegin', 'event_whenarduinoloop', 'procedures_definition'])

/** Mọi khối thật (không tính bóng) trong các chồng bắt đầu bằng khối mũ. */
export function programBlocks(program: object | null): Blk[] {
  const out: Blk[] = []
  const visit = (b: Blk | undefined) => {
    if (!b) return
    out.push(b)
    for (const i of Object.values(b.inputs ?? {})) visit(i.block)
    visit(b.next?.block)
  }
  const stacks = ((program as { blocks?: { blocks?: Blk[] } } | null)?.blocks?.blocks ?? []).filter((b) => HATS.has(b.type ?? ''))
  stacks.forEach(visit)
  return out
}

/** «lặp mãi» (event_whenarduinoloop) không có khối nào nối bên dưới (hoặc không có khối đó). */
export function loopEmpty(program: object | null): boolean {
  const all = (program as { blocks?: { blocks?: Blk[] } } | null)?.blocks?.blocks ?? []
  return !all.some((b) => b.type === 'event_whenarduinoloop' && b.next?.block)
}

/**
 * R95: robot đang đứng yên có chủ đích — khối sắp chạy của bo ảo (`RobotLink.block`) là «đợi» trong lúc chương trình
 * còn chạy. Riêng khi khởi động đã xong (`phase` 'loop') mà «lặp mãi» rỗng thì bo ảo giữ mãi khối cuối đã chạy (có
 * thể là một «đợi» đã hết), nên không tính. `blockType` = loại của khối đó (null: không có / không tìm thấy).
 */
export function restWaits(blockType: string | null | undefined, phase: string | undefined, emptyLoop: boolean): boolean {
  if (blockType !== 'control_wait') return false
  if (phase === 'setup') return true
  return phase === 'loop' && !emptyLoop
}

// ---------- Hình học ----------
/**
 * Thân robot chạm hình bao chân núi: một trong bốn góc hay bốn điểm giữa cạnh của `footprint` (RobotBody.footprint())
 * nằm trong chân một núi. Dùng chung cho bộ chấm trên sân (grade.test.ts) và màn nhiệm vụ.
 */
export function touchesMountain(c: readonly { x: number; z: number }[]): boolean {
  const pts = [...c, ...c.map((p, i) => ({ x: (p.x + c[(i + 1) % c.length].x) / 2, z: (p.z + c[(i + 1) % c.length].z) / 2 }))]
  return pts.some((p) => mountainAt(p.x, p.z) >= 0)
}

const toRad = (d: number) => (d * Math.PI) / 180
/** Hiệu góc ngắn nhất a − b, độ, trong (−180, 180]. */
const angleDiff = (a: number, b: number): number => {
  let d = ((a - b) * 180) / Math.PI
  d %= 360
  if (d > 180) d -= 360
  else if (d <= -180) d += 360
  return d
}
const cm = (m: number) => Math.round(m * 100)
const inside = (r: { x0: number; x1: number; z0: number; z1: number }, p: { x: number; z: number }) => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1

/** Chưa tới / quá đích theo hướng xuất phát, hay lệch sang ngang. */
function reachWhen(start: Pose, end: Pose, cx: number, cz: number): Check {
  const fx = -Math.sin(start.yaw)
  const fz = -Math.cos(start.yaw)
  const dx = cx - end.x
  const dz = cz - end.z
  const along = dx * fx + dz * fz
  const across = Math.abs(dx * fz - dz * fx)
  if (across > Math.abs(along)) return { ok: false, when: 'reach', d: cm(across) }
  return { ok: false, when: along > 0 ? 'short' : 'long', d: cm(Math.abs(along)) }
}

// ---------- Từng điều kiện ----------
function check(g: Goal, r: RunRecord): Check {
  const ok = (v: boolean, d: number | null = null): Check => ({ ok: v, when: g.type, d })
  switch (g.type) {
    case 'reach': {
      if (inside(g.rect, r.end)) return ok(true)
      return reachWhen(r.start, r.end, (g.rect.x0 + g.rect.x1) / 2, (g.rect.z0 + g.rect.z1) / 2)
    }
    case 'return': {
      const e = Math.hypot(r.end.x - r.start.x, r.end.z - r.start.z)
      return ok(e <= g.tol, cm(e))
    }
    case 'noMountain':
      return ok(!r.touchedMountain)
    case 'measure':
      return ok(g.min === undefined ? r.trail[g.what] > 0 : r.trail[g.what] >= g.min)
    case 'uses': {
      const types = new Set(programBlocks(r.program).map((b) => b.type))
      return ok(g.opcodes.every((op) => types.has(op)))
    }
    case 'paramBlock': {
      const calls = programBlocks(r.program).filter((b) => b.type === 'procedures_call' && procedureArgCount(b.extraState) >= 1).length
      return ok(calls >= (g.calls ?? 1))
    }
    case 'flag': {
      const text = `cắm cờ Núi ${MOUNTAIN_NAME[g.mountain]}`
      // Chỉ cờ do robot của em (Robot 1, chỉ số 0 trong trận) cắm.
      return ok(r.events.some((e) => e.robot === 0 && e.text.endsWith(text)))
    }
    case 'climb': {
      const lv = r.tally?.climbs.red[0] ?? 'none'
      return { ok: CLIMB_ORDER.indexOf(lv) >= CLIMB_ORDER.indexOf(g.min), when: CLIMB_HINT[g.min], d: null }
    }
    case 'fireClear':
      return ok(!!r.tally && r.tally.fire.g <= g.max)
    case 'matchEnd':
      return ok(r.events.some((e) => MATCH_END.test(e.text)))
    case 'turn': {
      const off = angleDiff(r.end.yaw, r.start.yaw + toRad(g.deg)) // > 0: quay trái quá đích
      if (Math.abs(off) <= g.tol) return ok(true)
      const over = g.deg >= 0 ? off > 0 : off < 0
      return { ok: false, when: over ? 'turnOver' : 'turnUnder', d: Math.round(Math.abs(off)) }
    }
    case 'time':
      return ok(r.trail.time <= g.max)
    case 'score': {
      const s = r.tally ? scoreTally(r.tally).total : 0
      return ok(s >= g.min, s)
    }
  }
}

// ---------- Chữ của điều kiện ----------
const CLIMB_GOAL_TEXT: Record<Climb, string> = {
  none: 'Không cần leo',
  contact: 'Chạm Thang Cứu Hỏa',
  ground: 'Treo ở Khu vực Đất',
  water: 'Treo ở Khu vực Nước',
}
const pretty = (v: number) => String(v).replace('.', ',')
function describe(g: Goal): string {
  switch (g.type) {
    case 'reach': return 'Dừng trong vùng đích'
    case 'return': return `Về chỗ xuất phát, sai số ≤ ${cm(g.tol)} cm`
    case 'noMountain': return 'Không chạm chân núi'
    case 'measure': return g.what === 'distance' ? `Đi được ít nhất ${pretty(g.min ?? 0)} m` : `Quay được ít nhất ${g.min ?? 0}°`
    case 'uses': return g.opcodes.includes('control_repeat') ? 'Dùng khối «lặp lại»' : 'Dùng khối «đặt động cơ» và «đợi»'
    case 'paramBlock': return (g.calls ?? 1) > 1 ? `Gọi khối của em có ô số ít nhất ${g.calls} lần` : 'Dùng khối của em có ô số'
    case 'flag': return `Cắm cờ lên Núi ${MOUNTAIN_NAME[g.mountain]}`
    case 'climb': return CLIMB_GOAL_TEXT[g.min]
    case 'fireClear': return g.max === 0 ? 'Khu Chữa Cháy không còn bóng xanh' : `Khu Chữa Cháy còn ≤ ${g.max} bóng xanh`
    case 'matchEnd': return 'Chơi hết trận'
    case 'turn': return `Quay ${g.deg >= 0 ? 'trái' : 'phải'} ${Math.abs(g.deg)}°, sai ≤ ${g.tol}°`
    case 'time': return `Xong trong ${g.max} giây`
    case 'score': return `Điểm trận từ ${g.min} trở lên`
  }
}

export function grade(m: Mission, r: RunRecord): GradeResult {
  const tiers: [Goal[], string][] = [[m.goals, ''], [m.stars.two, '⭐⭐ '], [m.stars.three, '⭐⭐⭐ ']]
  const rows = tiers.map(([gs, mark]) => gs.map((g) => ({ g, mark, c: check(g, r) })))
  const tierOk = rows.map((row) => row.every((x) => x.c.ok))
  const stars = (tierOk[0] ? (tierOk[1] ? (tierOk[2] ? 3 : 2) : 1) : 0) as GradeResult['stars']

  // Gợi ý chỉ lấy trong mức sao đầu tiên chưa đạt (chưa xong ⭐ thì không gợi ý chuyện ⭐⭐⭐).
  let hint: string | null = null
  const first = tierOk.indexOf(false)
  for (const x of first < 0 ? [] : rows[first]) {
    if (x.c.ok) continue
    const h = m.hints.find((k) => k.when === x.c.when) ?? m.hints.find((k) => k.when === x.g.type)
    if (!h) continue
    hint = h.text.replace('{d}', String(x.c.d ?? ''))
    break
  }
  const goals = rows.flat().map((x) => ({ text: x.mark + describe(x.g), ok: x.c.ok }))
  if (r.error) return { done: false, stars: 0, goals, hint: `${r.error}. Sửa chương trình rồi bấm ▶ chạy lại.` }
  return { done: tierOk[0], stars, goals, hint }
}

/** Trạng thái lần chạy mà GameSession đưa vào `shouldGrade` mỗi bước. */
export type RunState = {
  /** s kể từ ▶ (Trail.time). */
  elapsed: number
  /** Trail.hasMoved / Trail.lastMoveTime. */
  hasMoved: boolean
  lastMoveTime: number
  /** Học sinh vừa bấm Dừng / Chấm. */
  pressed: boolean
  /** R95: chương trình đang ở khối «đợi» (`restWaits`) — nhiệm vụ lập trình không chấm vì đứng yên. */
  waiting?: boolean
  /** Robot của em đã treo liên tục trên Thang Cứu Hỏa bao lâu (s; 0 / thiếu = không treo). */
  hangFor?: number
}
export type GradeReason = 'pressed' | 'maxTime' | 'rest' | 'error'

/**
 * Đã tới lúc chấm chưa (R57 + R59 + R95; hợp đồng đầy đủ ở RunRecord, types.ts): trả lý do, hoặc null nếu chạy tiếp.
 * Luật V4: nhiệm vụ lập trình mà robot đã treo ≥ REST_S và đứng yên ≥ REST_S thì chấm cả khi chương trình đang «đợi»
 * (đứng yên từ trước lúc bám không tính: vừa bám chưa chấm, để còn kịp trượt sang Nước).
 * `record` chỉ được gọi khi cần (nhiệm vụ lái đứng yên: xét các điều kiện ⭐ trên trạng thái hiện tại).
 */
export function shouldGrade(m: Mission, s: RunState, record: () => RunRecord): GradeReason | null {
  if (s.pressed) return 'pressed'
  if (s.elapsed >= m.maxTime - 1e-9) return 'maxTime'
  if (m.kind === 'match' || !s.hasMoved || s.elapsed - s.lastMoveTime < REST_S) return null
  if (m.kind === 'program') return s.waiting && (s.hangFor ?? 0) < REST_S - 1e-9 ? null : 'rest'
  return grade(m, record()).done ? 'rest' : null
}
