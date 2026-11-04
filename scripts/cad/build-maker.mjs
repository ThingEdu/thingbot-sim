// Chuyển mẫu CAD Onshape "Bộ thingbot mới / vào xem cái này" (glTF) thành hình robot Mẫu Maker gọn cho game:
// gom chi tiết theo nhóm chuyển động, hàn đỉnh, giảm tam giác (meshoptimizer), lượng tử hoá, ghi JSON base64.
// Hệ toạ độ ra: mm, gốc tâm xe trên sàn, +z mũi xe, y lên, +x bên trái (như src/fanroc/view/robotModels.ts).
import fs from 'node:fs'
import * as THREE from 'three'
import { MeshoptSimplifier } from 'meshoptimizer'
import { load, walk } from './gl.mjs'

const [, , SRC, OUT] = process.argv
await MeshoptSimplifier.ready
const { g, acc } = load(SRC)

// CAD: z lên, mũi xe phía −y (lồng + tay vòng xúc bóng). Sàn = đáy lốp (z −17,5 mm). Tâm = giữa cả cụm lúc thu
// (đuôi khung y +92 … mũi thanh răng y −210 ⇒ −59 mm): khớp hộp va chạm 300 mm của game (ROBOTS.maker.size.l).
const FLOOR = -17.5, CY = -59
const toModel = (v) => v.set(v.x * 1000, v.z * 1000 - FLOOR, -(v.y * 1000 - CY))

const top = (p) => p[1] ?? ''
const sub = (p) => p[2] ?? ''
/** Nhóm của một chi tiết theo đường dẫn tên; null = bỏ (dây kéo, bóng mẫu). */
function groupOf(p) {
  if (top(p) === 'base <1>' && sub(p).startsWith('Wheel D65x25')) return 'wheel' + sub(p).match(/<(\d+)>/)[1]
  if (['Part 3 <1>', 'SG90 Servo Assembly <1>', 'Part 1 <2>'].includes(top(p))) return 'rack'
  if (top(p) === 'Part 10 <1>' || (top(p) === 'Assembly 2 <1>' && sub(p) === 'Part 2 <1>')) return 'hoop'
  if (top(p).startsWith('Part 11 ') || top(p).startsWith('Part 13 ')) return null
  return 'body'
}
/** Tỉ lệ giữ tam giác: bo mạch rất chi tiết (93k) giữ ít; lốp giữ vừa để còn gai. */
const keep = (p) => (sub(p) === 'thing board <1>' ? 0.02 : sub(p).startsWith('PS2') || top(p).startsWith('SG90') || sub(p).startsWith('dc motor') ? 0.08 : sub(p).startsWith('Wheel') ? 0.22 : 0.3)

const groups = new Map()
let inTris = 0
walk(g, (mi, W, path) => {
  const grp = groupOf(path)
  if (!grp) return
  for (const pr of g.meshes[mi].primitives) {
    const P = acc(pr.attributes.POSITION).arr
    let I = pr.indices !== undefined ? Uint32Array.from(acc(pr.indices).arr) : Uint32Array.from({ length: P.length / 3 }, (_, k) => k)
    inTris += I.length / 3
    const c = (pr.material !== undefined && g.materials[pr.material].pbrMetallicRoughness?.baseColorFactor) || [0.8, 0.8, 0.8, 1]
    // Hàn đỉnh trùng vị trí (Onshape tách đỉnh theo pháp tuyến) để giảm tam giác được.
    const v = new THREE.Vector3(), map = new Map(), pos = [], remap = new Uint32Array(P.length / 3)
    for (let k = 0; k < P.length / 3; k++) {
      toModel(v.set(P[3 * k], P[3 * k + 1], P[3 * k + 2]).applyMatrix4(W))
      const key = `${Math.round(v.x * 50)},${Math.round(v.y * 50)},${Math.round(v.z * 50)}`
      let j = map.get(key)
      if (j === undefined) map.set(key, (j = pos.length / 3)), pos.push(v.x, v.y, v.z)
      remap[k] = j
    }
    I = I.map((i) => remap[i])
    // Bỏ chi tiết tí hon (linh kiện dán trên bo, ốc nhỏ): đường chéo khối bao < 10 mm trên bo, < 3 mm chỗ khác.
    const bb = new THREE.Box3().setFromArray(pos)
    if (bb.getSize(new THREE.Vector3()).length() < (sub(path) === 'thing board <1>' ? 10 : 3)) continue
    const fp = Float32Array.from(pos)
    const target = Math.max(12, Math.floor((I.length * keep(path)) / 3) * 3)
    let out = I
    if (target < I.length) {
      // Sai số tăng dần tới khi đạt số tam giác đích (chi tiết nhỏ / bo mạch chịu sai số lớn hơn).
      for (const err of [0.01, 0.04, 0.12, 0.3]) {
        ;[out] = MeshoptSimplifier.simplify(I, fp, 3, target, err)
        if (out.length <= target * 1.3) break
      }
    }
    ;(globalThis.PARTSTAT ??= new Map()).set(path.slice(1, 3).join(' / '), ((globalThis.PARTSTAT.get(path.slice(1, 3).join(' / ')) ?? 0) + out.length / 3))
    let gr = groups.get(grp)
    if (!gr) groups.set(grp, (gr = { pos: [], col: [], idx: [] }))
    const base = gr.pos.length / 3
    // Chỉ giữ đỉnh còn dùng.
    const used = new Map()
    for (const i of out) {
      if (!used.has(i)) {
        used.set(i, base + used.size)
        gr.pos.push(fp[3 * i], fp[3 * i + 1], fp[3 * i + 2])
        gr.col.push(...c.slice(0, 3).map((x) => Math.round(Math.pow(x, 1 / 1) * 255)))
      }
      gr.idx.push(used.get(i))
    }
  }
})

const Q = 50 // 1 đơn vị = 0,02 mm
const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64')
const out = { unit: 'mm', q: Q, groups: {} }
let tris = 0
for (const [name, gr] of groups) {
  const p = Float32Array.from(gr.pos)
  const box = new THREE.Box3()
  for (let k = 0; k < p.length; k += 3) box.expandByPoint(new THREE.Vector3(p[k], p[k + 1], p[k + 2]))
  const c = box.getCenter(new THREE.Vector3())
  const pivot = name.startsWith('wheel') ? [c.x, c.y, c.z] : [0, 0, 0]
  const pq = Int16Array.from(p, (x, k) => Math.round((x - pivot[k % 3]) * Q))
  const idx = p.length / 3 > 65535 ? Uint32Array.from(gr.idx) : Uint16Array.from(gr.idx)
  tris += gr.idx.length / 3
  out.groups[name] = { pivot: pivot.map((x) => +x.toFixed(2)), n: p.length / 3, pos: b64(pq), col: b64(Uint8Array.from(gr.col)), idx: b64(idx), i32: idx instanceof Uint32Array, box: [box.min.toArray().map(Math.round), box.max.toArray().map(Math.round)] }
}
fs.writeFileSync(OUT, JSON.stringify(out))
console.log('in tris', inTris, '→ out tris', tris, 'size', (fs.statSync(OUT).size / 1024).toFixed(0), 'KB')
for (const [k, v] of Object.entries(out.groups)) console.log(k.padEnd(8), 'verts', v.n, 'tris', Buffer.from(v.idx, 'base64').length / (v.i32 ? 12 : 6), 'box', JSON.stringify(v.box), 'pivot', JSON.stringify(v.pivot))
if (process.env.STAT) console.log([...globalThis.PARTSTAT].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${v}\t${k}`).join('\n'))
