import fs from 'node:fs'
import * as THREE from 'three'
export function load(path) {
  const g = JSON.parse(fs.readFileSync(path, 'utf8'))
  const bufs = g.buffers.map((b) => Buffer.from(b.uri.split(',', 2)[1], 'base64'))
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }
  const acc = (i) => {
    const a = g.accessors[i], bv = g.bufferViews[a.bufferView], n = N[a.type], C = T[a.componentType]
    const raw = bufs[bv.buffer], off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), isz = C.BYTES_PER_ELEMENT * n
    const stride = bv.byteStride && bv.byteStride !== isz ? bv.byteStride : isz
    const out = new C(a.count * n)
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    for (let k = 0; k < a.count; k++) out.set(new C(ab, off + k * stride, n), k * n)
    return { arr: out, n }
  }
  return { g, acc }
}
export function matOf(n) {
  const m = new THREE.Matrix4()
  if (n.matrix) return m.fromArray(n.matrix)
  return m.compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])))
}
export function walk(g, fn) {
  const rec = (i, P, path) => {
    const n = g.nodes[i], W = P.clone().multiply(matOf(n)), p = [...path, n.name ?? '?']
    if (n.mesh !== undefined) fn(n.mesh, W, p, i)
    for (const c of n.children ?? []) rec(c, W, p)
  }
  for (const r of g.scenes[g.scene ?? 0].nodes) rec(r, new THREE.Matrix4(), [])
}
