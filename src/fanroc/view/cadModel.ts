// Hình robot dựng từ mẫu CAD Onshape "Bộ thingbot mới" của anh Tuấn (assets/robot-maker.json, tạo bằng
// scripts/cad/build-maker.mjs): mỗi nhóm chuyển động (thân, 4 bánh, thanh răng, tay vòng) là một lưới màu theo đỉnh,
// toạ độ nguyên 1/q mm quanh `pivot`. Lưới giải mã một lần rồi dùng chung cho mọi robot (không giải phóng theo robot).
import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import maker from '../assets/robot-maker.json' with { type: 'json' }
import parts from '../assets/robot-parts.json' with { type: 'json' }

interface CadGroup {
  pivot: number[]
  n: number
  pos: string
  col: string
  idx: string
  i32: boolean
}
interface CadFile {
  q: number
  groups: Record<string, CadGroup>
}

const bytes = (b64: string): Uint8Array => {
  const s = atob(b64)
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u
}

/** Lưới của một nhóm (mm, gốc ở pivot) — pháp tuyến gãy góc > 30° như mặt CAD, màu đỉnh theo vật liệu CAD. */
export function decodeGroup(g: CadGroup, q: number): THREE.BufferGeometry {
  const pq = new Int16Array(bytes(g.pos).buffer)
  const col = bytes(g.col)
  const idxBytes = bytes(g.idx)
  const idx = g.i32 ? new Uint32Array(idxBytes.buffer) : new Uint16Array(idxBytes.buffer)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(pq, (v) => v / q), 3))
  // Màu CAD là sRGB 0–255; vật liệu làm việc trong không gian tuyến tính.
  const c = new THREE.Color()
  const lin = new Float32Array(col.length)
  for (let i = 0; i < col.length; i += 3) {
    c.setRGB(col[i] / 255, col[i + 1] / 255, col[i + 2] / 255, THREE.SRGBColorSpace)
    lin[i] = c.r
    lin[i + 1] = c.g
    lin[i + 2] = c.b
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(lin, 3))
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  const out = toCreasedNormals(geo, Math.PI / 6)
  geo.dispose()
  out.userData.shared = true
  return out
}

type Decoded = Record<string, { geo: THREE.BufferGeometry; pivot: THREE.Vector3 }>
let cache: Decoded | null = null
let partCache: Decoded | null = null
let cadMat: THREE.MeshStandardMaterial | null = null

const decodeFile = (f: CadFile): Decoded => {
  const out: Decoded = {}
  for (const [name, g] of Object.entries(f.groups)) out[name] = { geo: decodeGroup(g, f.q), pivot: new THREE.Vector3().fromArray(g.pivot) }
  return out
}
const material = () => (cadMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }))

/** Các nhóm của Mẫu Maker CAD (giải mã lần đầu gọi). */
export function makerCad(): { mat: THREE.Material; groups: Decoded } {
  cache ??= decodeFile(maker as CadFile)
  return { mat: material(), groups: cache }
}

/** Linh kiện CAD rời (assets/robot-parts.json, cùng bộ "Bộ thingbot mới") để ghép vào các robot tự dựng. */
export type CadPart = 'wheel' | 'motor' | 'board' | 'servo' | 'battery'
/**
 * Một linh kiện CAD (mm), tâm khối bao đặt tại (x, y, z), xoay quanh trục đứng `rotY`. Hướng gốc như trên Mẫu Maker:
 * bánh (lốp ra phía −x), động cơ dài theo z, bo nằm ngang, servo SG90 đứng (dày theo z), khay pin nằm ngang.
 */
export function cadPart(name: CadPart, x: number, y: number, z: number, rotY = 0): THREE.Object3D {
  partCache ??= decodeFile(parts as CadFile)
  const o = new THREE.Mesh(partCache[name].geo, material())
  if (!rotY) {
    o.position.set(x, y, z)
    return o
  }
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.rotation.y = rotY
  g.add(o)
  return g
}

/** Tên 4 nhóm bánh trong tệp CAD. */
export const CAD_WHEELS = ['wheel1', 'wheel3', 'wheel4', 'wheel5'] as const
/**
 * Khớp quay của tay vòng xúc bóng (mm, hệ toạ độ hình): ước theo hình CAD — cần tay vòng bắt vào giá bên lồng ống.
 * Thanh răng lùi ra sau kéo dây buộc đầu cần ⇒ tay vòng nhấc lên đổ bóng vào lồng (anh Tuấn chốt 05/11).
 */
export const HOOP_PIVOT = new THREE.Vector3(-22, 95, 60)
/** Góc nhấc tối đa của tay vòng khi thanh răng lùi hết, rad. */
export const HOOP_LIFT = 1.1
