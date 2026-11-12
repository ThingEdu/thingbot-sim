// Một lần chạy nhiệm vụ (MissionRun): ghi vệt + chạm núi mỗi bước, chấm đúng lúc shouldGrade quyết, bản ghi đúng hợp
// đồng RunRecord (trail.time = Trail.lastMoveTime). Dùng tư thế dựng tay, không cần sân Rapier.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MISSIONS } from './data.ts'
import { MissionRun, type RunView } from './run.ts'
import { NEUTRAL } from '../ports.ts'
import { MOUNTAINS, type Pose } from '../layout.ts'
import type { FieldTally } from '../scoring.ts'
import type { Climb } from '../ladder.ts'

const byN = (n: number) => MISSIONS.find((m) => m.n === n)!
const DT = 1 / 240
const tally = (): FieldTally => ({
  fire: { o: 0, g: 0 }, mtn: [0, 1, 2, 3].map(() => [0, 1, 2].map(() => ({ g: 0, o: 0 }))), flags: [false, false, false, false],
  decorO: 0, climbs: { red: ['none', 'none'], blue: ['none', 'none'] },
})
/** Sân giả: robot ở `pose`, thân vuông 24 cm; đếm số lần đọc tally. */
function field(start: Pose) {
  const v = {
    pose: { ...start },
    ports: NEUTRAL,
    events: [] as RunView['events'],
    tallies: 0,
    footprint() {
      const h = 0.12
      return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => ({ x: v.pose.x + x, z: v.pose.z + z }))
    },
    tally() {
      v.tallies++
      return tally()
    },
  }
  return v
}
/** Chạy `s` giây; `move(t)` đổi tư thế mỗi bước. Trả kết quả chấm đầu tiên (nếu có) và thời điểm. */
function drive(run: MissionRun, v: ReturnType<typeof field>, s: number, move: (t: number) => void = () => {}, waiting = false) {
  for (let k = 0; k < Math.round(s / DT); k++) {
    move(k * DT)
    const r = run.step(v, DT, waiting)
    if (r) return { r, t: run.trail.time }
  }
  return null
}

test('nhiệm vụ lập trình: chạy 1 s rồi đứng yên ⇒ chấm "rest" sau 1 s đứng; trail.time = lúc dừng hẳn', () => {
  const m = byN(2)
  const v = field(m.start)
  const prog = { blocks: { blocks: [] } }
  const run = new MissionRun(m, prog, v)
  assert.equal(drive(run, v, 1, () => (v.pose.z -= 0.25 * DT)), null, 'đang chạy không chấm')
  const out = drive(run, v, 3)
  assert.ok(out, 'đứng yên không được chấm')
  assert.equal(run.reason, 'rest')
  assert.ok(out.t > 1.9 && out.t < 2.1, `chấm lúc ${out.t}`)
  assert.ok(Math.abs(run.record!.trail.time - 1) < 0.02, `trail.time ${run.record!.trail.time}`)
  assert.ok(Math.abs(run.record!.trail.distance - 0.25) < 0.01)
  assert.deepEqual(run.record!.program, prog)
  assert.equal(run.result, out.r)
  assert.equal(run.step(v, DT), null, 'đã chấm thì không chấm lại')
})

test('R95: đang ở khối «đợi» thì đứng yên không chấm — chỉ hết giờ (maxTime)', () => {
  const m = byN(4)
  const v = field(m.start)
  const run = new MissionRun(m, null, v)
  drive(run, v, 0.5, () => (v.pose.x += 0.2 * DT))
  const out = drive(run, v, m.maxTime + 1, () => {}, true)
  assert.ok(out)
  assert.equal(run.reason, 'maxTime')
})

test('luật V4: robot treo ở Nước (RunView.climb) và đứng yên 1 s ⇒ chấm "rest" dù đang ở khối «đợi»; treo Đất thì không', () => {
  const m = byN(11)
  const v = Object.assign(field(m.start), { climb: 'none' as Climb })
  const run = new MissionRun(m, { blocks: { blocks: [] } }, v)
  drive(run, v, 0.5, () => (v.pose.x -= 0.2 * DT))
  assert.equal(drive(run, v, 2, () => {}, true), null, 'đứng sàn, đang đợi: không chấm (R95)')
  v.climb = 'ground' // bám ở Đất, đứng yên trong lúc chương trình còn đợi (sắp cho bánh tiến) ⇒ không chấm
  assert.equal(drive(run, v, 2, () => {}, true), null, 'treo Đất mà đang đợi: không chấm (R95)')
  v.climb = 'water' // vừa sang Nước (tư thế gần như không đổi): đã đứng yên lâu nhưng chưa ở Nước đủ 1 s ⇒ chưa chấm
  assert.equal(drive(run, v, 0.5, () => {}, true), null, 'vừa sang Nước đã chấm')
  const out = drive(run, v, 3, () => {}, true)
  assert.ok(out, 'treo Nước đứng yên mà không được chấm')
  assert.equal(run.reason, 'rest')
  assert.ok(out.t > 5.4 && out.t < 5.6, `chấm lúc ${out.t} (sang Nước lúc 4,5 s)`)
})

test('bấm Chấm: chấm ngay, một lần; chưa chạy cũng chấm được', () => {
  const m = byN(2)
  const v = field(m.start)
  const run = new MissionRun(m, null, v)
  const r = run.press(v)
  assert.ok(r)
  assert.equal(run.reason, 'pressed')
  assert.equal(r.done, false)
  assert.equal(run.press(v), null)
})

test('thân xe chạm chân núi lúc nào đó ⇒ touchedMountain, kể cả khi lùi ra rồi', () => {
  const m = byN(7)
  const v = field(m.start)
  const run = new MissionRun(m, null, v)
  run.step(v, DT)
  v.pose = { x: MOUNTAINS[0].x, z: MOUNTAINS[0].z, yaw: 0 }
  run.step(v, DT)
  v.pose = { ...m.start }
  run.press(v)
  assert.equal(run.record!.touchedMountain, true)
})

test('nhiệm vụ lái: bản ghi không có chương trình; đứng yên khi chưa đạt ⭐ không chấm, đọc tally thưa (≤ 4 lần/giây)', () => {
  const m = byN(9)
  const v = field(m.start)
  const run = new MissionRun(m, { blocks: {} }, v)
  drive(run, v, 1, () => (v.pose.z -= 0.3 * DT))
  const before = v.tallies
  assert.equal(drive(run, v, 3), null, 'chưa dọn xong (tally giả: 0 bóng xanh nhưng quãng < 1 m)')
  assert.ok(v.tallies - before <= 13, `đọc tally ${v.tallies - before} lần trong 3 s`)
  run.press(v)
  assert.equal(run.record!.program, null)
})

test('preview: chấm thử trên trạng thái hiện tại, không kết thúc lần chạy', () => {
  const m = byN(2)
  const v = field(m.start)
  const run = new MissionRun(m, null, v)
  const p = run.preview(v)
  assert.equal(p.goals.length > 0, true)
  assert.equal(run.result, null)
})

test('chương trình lỗi giữa lần chạy ⇒ fail() chấm ngay "error", không đạt; chấm một lần', () => {
  const m = byN(5)
  const v = field(m.start)
  const run = new MissionRun(m, { blocks: { blocks: [] } }, v)
  drive(run, v, 0.5, () => (v.pose.x += 0.2 * DT))
  const r = run.fail(v, 'Chương trình dừng vì lỗi: chia một số nguyên cho 0')
  assert.ok(r && !r.done && r.stars === 0)
  assert.equal(run.reason, 'error')
  assert.equal(run.record?.error, 'Chương trình dừng vì lỗi: chia một số nguyên cho 0')
  assert.equal(run.fail(v, 'x'), null)
  assert.equal(run.press(v), null)
})
