// Cảnh 3D sân FANROC (Three.js): sân, rào, vạch vùng, 4 Ngọn Núi từ đúng lưới CAD mà vật lý dùng, Hộp Phân Phối,
// 300 bóng (2 InstancedMesh), cờ, 4 robot và 3 góc camera. Chỉ vẽ: mọi vị trí đọc từ FanrocWorld / RobotBody / Match.
// Toạ độ cảnh = toạ độ sân (m): gốc tâm sân, +x sang phải nhìn từ Khu Điều Khiển, +z về Khu Điều Khiển, y lên.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BALL_R, FIELD, HOLE, MOUNTAINS, PEAK_Y, TIERS, WALL_H, WALL_T, ZONES, holeCentres, type Rect } from '../layout.ts'
import type { FanrocWorld } from '../world.ts'
import type { RobotBody } from '../robot.ts'
import type { Match } from '../match.ts'
import { servo360, type PortValues } from '../ports.ts'
import { FLAG_LEN, buildRobotModel, makeFlag, type RobotModel } from './robotModels.ts'
import { BALL_TUBE } from './cadModel.ts'
import { TRAIL_COLORS, type Trail } from '../trail.ts'
import mesh from '../assets/mountain-mesh.json' with { type: 'json' }

/** Ba góc chọn được ở ⚙ (`field | follow | driver`) và `orbit`: quay chậm quanh sân, nền của màn chính. */
export type CameraView = 'field' | 'follow' | 'driver' | 'orbit'
/** Vòng quay của camera màn chính, rad/s (một vòng ≈ 2 phút). */
export const ORBIT_SPEED = 0.05

/** Ba mức xa của góc Theo robot (lăn chuột đổi mức). Robot dài ~0,3 m: mức vừa thấy trọn robot ở nửa dưới màn và
 *  đường phía trước; gần để xem cơ cấu; xa để thấy cả một góc sân. */
export const FOLLOW_ZOOM = [0.6, 1, 1.6] as const
/** Camera Theo robot ở mức `zoom`: lùi sau robot `back` m, cao `up` m, nhìn điểm trước mũi `ahead` m. */
export function followOffset(zoom: number): { back: number; up: number; ahead: number } {
  // Cao tối thiểu ~0,55 m: robot sát rào Khu Điều Khiển (cao 0,3 m) vẫn không bị rào che ở mức gần.
  return { back: 0.95 * zoom, up: 0.3 + 0.4 * zoom, ahead: 0.25 + 0.3 * zoom }
}
export type Quality = 'low' | 'high'

export interface FanrocScene {
  /**
   * Cập nhật hình theo trạng thái rồi vẽ một khung. `ports` (không bắt buộc) là giá trị cổng vừa ra lệnh cho từng robot,
   * chỉ để quay con lăn / mở cửa xả / kẹp trên hình.
   */
  sync(world: FanrocWorld, robots: RobotBody[], match: Match, ports?: readonly PortValues[]): void
  camera(view: CameraView, robot?: number): void
  /**
   * Vệt robot (chỉ màn nhiệm vụ con rùa gọi): mỗi đoạn một dải phẳng sát mặt thảm (y = 0,002), màu TRAIL_COLORS;
   * `path` = đường gợi ý trắng nét đứt. `null` xoá cả vệt lẫn đường gợi ý. Gọi mỗi khung được: chỉ dựng lại đoạn có thêm điểm.
   */
  trail(segments: Trail['segments'] | null, path?: { x: number; z: number }[]): void
  /** Số hình vệt + đường gợi ý đang có trên sân (phép thử: 0 ngoài màn nhiệm vụ). */
  readonly trailObjects: number
  quality(q: Quality): void
  dispose(): void
}

// ---------- Số đo phần hình (không ảnh hưởng vật lý) ----------
/** Hộp Phân Phối theo CAD (FINDINGS.md): hộp mica đứng trên giá móc qua rào phía xa. */
const BOX = { x0: -0.2266, x1: 0.2234, z0: -1.4917, z1: -1.2005, y0: 0.4209, y1: 0.7758 }
/** Đáy tầng dưới (xanh) và tấm giữa (đáy tầng trên, cam): cao độ ở mép trước, độ dốc về phía sau. */
const LOWER = { y: 0.4258, slope: Math.tan((14.9 * Math.PI) / 180) }
const UPPER = { y: 0.617, slope: Math.tan((15.7 * Math.PI) / 180) }
/** Cửa trước nâng lên chừng này khi xả bóng. */
const GATE_OPEN = 0.11
/** Khu Điều Khiển (ngoài sân, phía +z). */
const DRIVER_Z = { z0: 1.2244, z1: 1.8244 }
/** Khay bóng của Human Player: đặt trên bàn ở mép Khu Điều Khiển, mỗi liên minh một bên. */
const TRAY = { red: { x: -1.05, z: 1.32 }, blue: { x: 0.75, z: 1.32 }, cols: 8 }
const COLORS = {
  background: 0xe9e4d8,
  ground: 0xb9b4a6,
  carpet: '#5f6663',
  wall: 0xeef0ee,
  fire: '#f08a24',
  forest: '#2f9e57',
  red: '#e23b32',
  blue: '#2f68e0',
  tape: '#f2f2ee',
  orange: 0xff8a1f,
  green: 0x5fd83a,
  stand: 0x1f4fa8,
}
/** Màu Ngọn Núi theo dải cao độ: đáy từng rãnh (sáng, để bóng xanh nổi lên), thành / gờ (xanh lá). */
const MTN_COLOR = { wall: new THREE.Color(0x3a8a55), lip: new THREE.Color(0x2c6e43), floors: [0xe3d6a4, 0xc9d9a0, 0xe8c98c, 0xf0b27a].map((c) => new THREE.Color(c)) }

const isPhone = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
/** Mức đồ hoạ mặc định: máy ≤ 4 nhân hoặc điện thoại thì Thấp. */
export function defaultQuality(): Quality {
  return (navigator.hardwareConcurrency ?? 8) <= 4 || isPhone() ? 'low' : 'high'
}

const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o })

// ---------- Mặt sân: thảm + vạch vùng vẽ trên canvas ----------
function fieldTexture(): THREE.CanvasTexture {
  const S = 2048
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const k = S / FIELD
  const X = (x: number) => (x + FIELD / 2) * k
  const Z = (z: number) => (z + FIELD / 2) * k // hàng trên canvas = z −1.2 (phía Hộp Phân Phối)
  g.fillStyle = COLORS.carpet
  g.fillRect(0, 0, S, S)
  // Mối nối thảm 600 mm.
  g.strokeStyle = 'rgba(0,0,0,0.25)'
  g.lineWidth = 3
  for (let v = -0.6; v <= 0.61; v += 0.6) {
    g.beginPath()
    g.moveTo(X(v), 0)
    g.lineTo(X(v), S)
    g.moveTo(0, Z(v))
    g.lineTo(S, Z(v))
    g.stroke()
  }
  const fill = (r: Rect, color: string) => {
    g.fillStyle = color
    g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k)
  }
  const tape = (r: Rect, color: string, w: number) => {
    const lw = w * k
    g.strokeStyle = color
    g.lineWidth = lw
    g.strokeRect(X(r.x0) + lw / 2, Z(r.z0) + lw / 2, (r.x1 - r.x0) * k - lw, (r.z1 - r.z0) * k - lw)
  }
  const label = (t: string, x: number, z: number, color: string, size = 40) => {
    g.fillStyle = color
    g.font = `700 ${size}px "Be Vietnam Pro", system-ui, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(t, X(x), Z(z))
  }
  const mid = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })
  // Khu Rừng: ô vuông ±0.5885, nền xanh nhạt + vạch xanh.
  const forest = { x0: -0.5885, x1: 0.5885, z0: -0.5885, z1: 0.5885 }
  fill(forest, 'rgba(47,158,87,0.22)')
  tape(forest, COLORS.forest, 0.03)
  label('KHU RỪNG', 0, -0.545, '#bff0cf', 34)
  // Khu Chữa Cháy: tấm cam.
  for (const r of ZONES.fire) {
    fill(r, COLORS.fire)
    label('KHU CHỮA CHÁY', mid(r).x, r.z1 - 0.06, '#fff4e4', 38)
  }
  for (const a of ['red', 'blue'] as const) {
    const color = COLORS[a]
    tape(ZONES.safe[a], color, 0.03)
    label('BẢO VỆ', mid(ZONES.safe[a]).x, mid(ZONES.safe[a]).z, color, 36)
    tape(ZONES.load[a], COLORS.tape, 0.04)
    label('TIẾP TẾ', mid(ZONES.load[a]).x, ZONES.load[a].z0 + 0.06, COLORS.tape, 34)
    tape(ZONES.start[a], color, 0.03)
    label('XUẤT PHÁT', mid(ZONES.start[a]).x, ZONES.start[a].z0 + 0.05, color, 34)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ---------- Ngọn Núi: đúng lưới va chạm, tô màu theo dải cao độ ----------
function mountainGeometry(): THREE.BufferGeometry {
  const indexed = new THREE.BufferGeometry()
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3))
  indexed.setIndex(mesh.indices)
  // Tách đỉnh theo mặt để mỗi tam giác có pháp tuyến và màu riêng (rãnh phẳng / thành đứng).
  const g = indexed.toNonIndexed()
  g.computeVertexNormals()
  const pos = g.getAttribute('position')
  const nrm = g.getAttribute('normal')
  const col = new Float32Array(pos.count * 3)
  for (let t = 0; t < pos.count; t += 3) {
    const y = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3
    const up = Math.abs(nrm.getY(t)) > 0.9
    let c = MTN_COLOR.wall
    if (up) {
      const k = TIERS.findIndex((tier) => Math.abs(y - tier.floor) < 0.004)
      c = k >= 0 ? MTN_COLOR.floors[k] : MTN_COLOR.lip
    }
    for (let v = 0; v < 3; v++) c.toArray(col, (t + v) * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  indexed.dispose()
  return g
}

// ---------- Hộp Phân Phối ----------
function buildDispenser(): { group: THREE.Group; gate: THREE.Mesh } {
  const group = new THREE.Group()
  const acrylic = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false })
  const frame = mat(0x9fb0b8, { metalness: 0.4, roughness: 0.4 })
  const stand = mat(COLORS.stand)
  const w = BOX.x1 - BOX.x0
  const d = BOX.z1 - BOX.z0
  const cx = (BOX.x0 + BOX.x1) / 2
  const cz = (BOX.z0 + BOX.z1) / 2
  const h = BOX.y1 - BOX.y0
  const add = (o: THREE.Mesh, castShadow = true) => {
    o.castShadow = castShadow
    o.receiveShadow = true
    group.add(o)
    return o
  }
  const box = (sx: number, sy: number, sz: number, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m)
    o.position.set(x, y, z)
    return o
  }
  // Giá đỡ: 4 chân từ sàn ngoài rào lên đáy hộp, móc qua đỉnh rào.
  for (const x of [BOX.x0 + 0.02, BOX.x1 - 0.02]) {
    for (const z of [BOX.z0 + 0.02, -FIELD / 2 - WALL_T - 0.02]) add(box(0.03, BOX.y0, 0.03, stand, x, BOX.y0 / 2, z))
    add(box(0.03, 0.03, -FIELD / 2 - BOX.z0 + 0.01, stand, x, BOX.y0 - 0.015, (BOX.z0 - FIELD / 2) / 2))
  }
  // Vỏ mica: hai bên, sau, nắp trên.
  add(box(0.004, h, d, acrylic, BOX.x0, BOX.y0 + h / 2, cz), false)
  add(box(0.004, h, d, acrylic, BOX.x1, BOX.y0 + h / 2, cz), false)
  add(box(w, h, 0.004, acrylic, cx, BOX.y0 + h / 2, BOX.z0), false)
  add(box(w, 0.004, d, acrylic, cx, BOX.y1, cz), false)
  // Hai đáy dốc về phía sân.
  for (const lv of [LOWER, UPPER]) {
    const tilt = Math.atan(lv.slope)
    const len = d / Math.cos(tilt)
    const plate = add(box(w, 0.005, len, frame, cx, lv.y + (d / 2) * lv.slope, cz))
    plate.rotation.x = tilt // mép sau (−z) cao hơn mép trước
  }
  // Khung cạnh đứng.
  for (const x of [BOX.x0, BOX.x1]) for (const z of [BOX.z0, BOX.z1]) add(box(0.012, h, 0.012, frame, x, BOX.y0 + h / 2, z))
  // Cửa trước trượt (mica), nâng lên khi xả bóng.
  const gate = add(box(w, h * 0.55, 0.004, acrylic, cx, BOX.y0 + (h * 0.55) / 2, BOX.z1), false)
  return { group, gate }
}

/** Tâm bóng thứ k (theo màu) còn trong hộp: xếp theo lớp trên đáy dốc, lớp dưới cùng sát cửa trước. */
function boxSlot(k: number, color: 'o' | 'g', out: THREE.Vector3): THREE.Vector3 {
  const lv = color === 'g' ? LOWER : UPPER
  const step = 2 * BALL_R + 0.001
  const cols = Math.floor((BOX.x1 - BOX.x0 - 0.01) / step)
  const rows = Math.floor((BOX.z1 - BOX.z0 - 0.01) / step)
  const perLayer = cols * rows
  const layer = Math.floor(k / perLayer)
  const r = Math.floor((k % perLayer) / cols)
  const c = k % cols
  const z = BOX.z1 - 0.006 - BALL_R - r * step
  const x = BOX.x0 + 0.006 + BALL_R + c * step
  return out.set(x, lv.y + (BOX.z1 - z) * lv.slope + BALL_R + 0.003 + layer * step * 0.9, z)
}

/** Giải phóng mỗi geometry / material trong cây một lần (núi dùng chung một lưới và một vật liệu). */
function disposeTree(root: THREE.Object3D): void {
  const done = new Set<{ dispose(): void }>()
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    done.add(o.geometry)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) done.add(m)
  })
  for (const d of done) d.dispose()
}

interface RobotView {
  model: RobotModel
  last: { x: number; z: number; yaw: number } | null
  grip: boolean
}

export function createScene(el: HTMLElement): FanrocScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  el.prepend(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 50)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.49
  controls.minDistance = 0.3
  controls.maxDistance = 10

  scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(1.5, 3.5, 2)
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -1.9, right: 1.9, top: 1.9, bottom: -1.9, near: 0.5, far: 8 })
  sun.shadow.bias = -0.0005
  scene.add(sun)

  // Sàn ngoài, thảm sân, rào.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat(COLORS.ground, { roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.002
  ground.receiveShadow = true
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD, FIELD), new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.95 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(ground, floor)
  const wallMat = mat(COLORS.wall, { roughness: 0.6 })
  const h = FIELD / 2 + WALL_T / 2
  const len = FIELD + 2 * WALL_T
  for (const [x, z, sx, sz] of [[0, -h, len, WALL_T], [0, h, len, WALL_T], [-h, 0, WALL_T, len], [h, 0, WALL_T, len]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_H, sz), wallMat)
    wall.position.set(x, WALL_H / 2, z)
    wall.castShadow = wall.receiveShadow = true
    scene.add(wall)
  }
  // Khu Điều Khiển hai liên minh (ngoài rào gần) và bàn khay của Human Player.
  for (const [x0, x1, c] of [[-1.1984, 0.0016, 0xe23b32], [0.0016, 1.2016, 0x2f68e0]] as const) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(x1 - x0, 0.004, DRIVER_Z.z1 - DRIVER_Z.z0),
      mat(c, { transparent: true, opacity: 0.25 }),
    )
    pad.position.set((x0 + x1) / 2, 0.002, (DRIVER_Z.z0 + DRIVER_Z.z1) / 2)
    scene.add(pad)
  }
  for (const a of ['red', 'blue'] as const) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(TRAY.cols * 0.042 + 0.03, 0.01, 0.2), mat(0x7a6a52))
    t.position.set(TRAY[a].x + ((TRAY.cols - 1) * 0.042) / 2, 0.005, TRAY[a].z + 0.06)
    t.receiveShadow = true
    scene.add(t)
  }

  // 4 Ngọn Núi: cùng một lưới CAD với collider, xoay theo yaw của từng núi.
  const mtnGeo = mountainGeometry()
  const mtnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide })
  for (const m of MOUNTAINS) {
    const o = new THREE.Mesh(mtnGeo, mtnMat)
    o.position.set(m.x, 0, m.z)
    o.rotation.y = m.yaw
    o.castShadow = o.receiveShadow = true
    scene.add(o)
  }

  const dispenser = buildDispenser()
  scene.add(dispenser.group)

  // Bóng: 2 InstancedMesh (cam 100, xanh 200); ánh xạ chỉ số bóng → (lưới, ô).
  const sphere = new THREE.SphereGeometry(BALL_R, 16, 12)
  /** Số ô bóng của hai lưới (cam 100 + xanh 200). */
  const BALL_SLOTS = 300
  const orange = new THREE.InstancedMesh(sphere, mat(COLORS.orange, { roughness: 0.35 }), 100)
  const green = new THREE.InstancedMesh(sphere, mat(COLORS.green, { roughness: 0.35 }), 200)
  for (const b of [orange, green]) {
    b.castShadow = true
    b.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Khối bao của InstancedMesh chỉ tính một lần (lúc mọi bóng còn trong hộp) nên sẽ cắt nhầm cả lưới khi hộp ra
    // khỏi khung hình; bóng trải khắp sân nên tắt cắt theo khung nhìn.
    b.frustumCulled = false
    scene.add(b)
  }
  /** Liên minh của khay đang chứa bóng (suy ra từ Khu Xuất Phát nơi bóng được nhặt). */
  const trayOf = new Map<number, 'red' | 'blue'>()
  const lastX = new Float32Array(300)

  // Cờ đã cắm trên núi (A..D) và cờ rơi trên sàn của từng robot.
  const planted = holeCentres().map((c) => {
    const f = makeFlag()
    f.position.set(c.x, PEAK_Y - HOLE.depth, c.z)
    f.visible = false
    scene.add(f)
    return f
  })
  const dropped: THREE.Group[] = []

  // Vệt con rùa + đường gợi ý (nhiệm vụ), sát mặt thảm. Nét WebGL (THREE.Line) chỉ dày 1 px — nhìn toàn sân gần như
  // không thấy — nên vẽ thành dải phẳng (R98): vệt rộng 1,4 cm, đường gợi ý trắng nét đứt 0,8 cm (gạch 4 cm, hở 3 cm).
  const TRAIL_Y = 0.002
  const TRAIL_W = 0.014
  const PATH_W = 0.008
  const DASH = { on: 0.04, off: 0.03 }
  const trailGroup = new THREE.Group()
  scene.add(trailGroup)
  const flat = (color: number, opacity = 1) =>
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const trailMats = TRAIL_COLORS.map((c) => flat(c))
  const pathMat = flat(0xffffff, 0.9)
  /** Đỉnh của dải phẳng rộng `w` theo đường gấp khúc (mỗi đoạn một hình chữ nhật, đầu nối chồng lên nhau). */
  const ribbon = (pts: { x: number; z: number }[], w: number, pos: number[] = []): number[] => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]
      const b = pts[k + 1]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      if (len < 1e-6) continue
      // Pháp tuyến ngang, kéo dài mỗi đầu nửa bề rộng để chỗ gấp không hở.
      const nx = (-(b.z - a.z) / len) * (w / 2)
      const nz = ((b.x - a.x) / len) * (w / 2)
      const ex = ((b.x - a.x) / len) * (w / 2)
      const ez = ((b.z - a.z) / len) * (w / 2)
      const p0 = [a.x - ex + nx, a.z - ez + nz]
      const p1 = [a.x - ex - nx, a.z - ez - nz]
      const p2 = [b.x + ex - nx, b.z + ez - nz]
      const p3 = [b.x + ex + nx, b.z + ez + nz]
      for (const [x, z] of [p0, p1, p2, p0, p2, p3]) pos.push(x, TRAIL_Y, z)
    }
    return pos
  }
  /** Các gạch của đường gợi ý nét đứt. */
  const dashes = (pts: { x: number; z: number }[]): { x: number; z: number }[][] => {
    const out: { x: number; z: number }[][] = []
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k]
      const b = pts[k + 1]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      for (let d = 0; d < len; d += DASH.on + DASH.off) {
        const e = Math.min(len, d + DASH.on)
        const at = (u: number) => ({ x: a.x + ((b.x - a.x) * u) / len, z: a.z + ((b.z - a.z) * u) / len })
        out.push([at(d), at(e)])
      }
    }
    return out
  }
  const meshOf = (pos: number[], m: THREE.Material) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const o = new THREE.Mesh(g, m)
    o.renderOrder = 1
    o.frustumCulled = false
    trailGroup.add(o)
    return o
  }
  const drop = (o: THREE.Mesh) => {
    trailGroup.remove(o)
    o.geometry.dispose()
  }
  /** Một đoạn vệt: bộ đỉnh nới dần (gấp đôi khi đầy), chỉ thêm hình chữ nhật của các điểm mới. */
  type TrailMesh = { mesh: THREE.Mesh; pts: readonly { x: number; z: number }[]; n: number; buf: Float32Array; used: number }
  const trailMeshes: TrailMesh[] = []
  const newTrailMesh = (pts: readonly { x: number; z: number }[], m: THREE.Material): TrailMesh => {
    const buf = new Float32Array(18 * 64)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(buf, 3).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    const mesh = new THREE.Mesh(g, m)
    mesh.renderOrder = 1
    mesh.frustumCulled = false
    trailGroup.add(mesh)
    return { mesh, pts, n: 0, buf, used: 0 }
  }
  /** Thêm hình của các điểm từ `t.n` tới cuối `t.pts` vào bộ đỉnh của đoạn. */
  const growTrail = (t: TrailMesh) => {
    if (t.pts.length <= t.n) return
    const add = ribbon(t.pts.slice(Math.max(0, t.n - 1)), TRAIL_W)
    t.n = t.pts.length
    if (!add.length) return
    if (t.used + add.length > t.buf.length) {
      let cap = t.buf.length
      while (cap < t.used + add.length) cap *= 2
      const next = new Float32Array(cap)
      next.set(t.buf.subarray(0, t.used))
      t.buf = next
      t.mesh.geometry.setAttribute('position', new THREE.BufferAttribute(next, 3).setUsage(THREE.DynamicDrawUsage))
    }
    t.buf.set(add, t.used)
    t.used += add.length
    const attr = t.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    attr.needsUpdate = true
    t.mesh.geometry.setDrawRange(0, t.used / 3)
  }
  let pathMeshes: THREE.Mesh[] = []
  let pathOf: { x: number; z: number }[] | undefined
  function setTrail(segments: Trail['segments'] | null, path?: { x: number; z: number }[]): void {
    if (!segments) {
      for (const t of trailMeshes) drop(t.mesh)
      trailMeshes.length = 0
      for (const o of pathMeshes) drop(o)
      pathMeshes = []
      pathOf = undefined
      return
    }
    if (path !== pathOf) {
      for (const o of pathMeshes) drop(o)
      pathOf = path
      // Một hình cho mọi gạch: dải của từng gạch nối vào một bộ đỉnh.
      const pos: number[] = []
      if (path && path.length >= 2) for (const d of dashes(path)) ribbon(d, PATH_W, pos)
      pathMeshes = pos.length ? [meshOf(pos, pathMat)] : []
    }
    // Vệt đã xoá (lần chạy mới) ⇒ bỏ các đoạn thừa; đoạn đổi mảng điểm thì dựng mới; đoạn có thêm điểm thì nối thêm.
    while (trailMeshes.length > segments.length) drop(trailMeshes.pop()!.mesh)
    segments.forEach((seg, i) => {
      let t = trailMeshes[i]
      if (t && t.pts !== seg.points) {
        drop(t.mesh)
        t = undefined as unknown as TrailMesh
      }
      if (!t) t = trailMeshes[i] = newTrailMesh(seg.points, trailMats[seg.color % trailMats.length])
      growTrail(t)
    })
  }

  const robotViews: RobotView[] = []
  let built: RobotBody[] | null = null
  let view: CameraView = 'field'
  let followIdx = 0
  let followZoom = 1
  let zoomEase = 0
  // Lăn chuột ở góc Theo robot: đổi mức gần / vừa / xa (các góc khác OrbitControls tự phóng to).
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      if (view !== 'follow') return
      e.preventDefault()
      followZoom = Math.max(0, Math.min(FOLLOW_ZOOM.length - 1, followZoom + Math.sign(e.deltaY)))
      zoomEase = 40 // vài chục khung trượt mượt sang mức mới thay vì nhảy
    },
    { passive: false },
  )
  let goal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null
  const dummy = new THREE.Object3D()
  const tmp = new THREE.Vector3()

  /** Toàn sân; khung dọc (điện thoại) thì lùi camera xa hơn để thấy đủ bề ngang sân. */
  function setFieldView(): void {
    const k = Math.max(1, 1.1 / camera.aspect)
    goal = { pos: new THREE.Vector3(0, 3.0 * k, 2.55 * k), target: new THREE.Vector3(0, 0, 0.12) }
  }
  camera.position.set(0, 3.0, 2.55)
  controls.target.set(0, 0, 0.12)
  setFieldView()

  function setQuality(q: Quality): void {
    const high = q === 'high'
    renderer.setPixelRatio(high ? Math.min(2, window.devicePixelRatio) : 1)
    renderer.shadowMap.enabled = high
    sun.castShadow = high
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of ms) m.needsUpdate = true
      }
    })
    resize()
  }

  function resize(): void {
    const w = Math.max(1, el.clientWidth)
    const hh = Math.max(1, el.clientHeight)
    renderer.setSize(w, hh, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    camera.aspect = w / hh
    camera.updateProjectionMatrix()
    if (view === 'field') setFieldView()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(el)
  setQuality(defaultQuality())

  function buildRobots(robots: RobotBody[]): void {
    for (const v of robotViews) {
      scene.remove(v.model.group)
      v.model.dispose()
    }
    robotViews.length = 0
    // Cờ rơi của trận cũ.
    for (const f of dropped) {
      if (!f) continue
      scene.remove(f)
      disposeTree(f)
    }
    dropped.length = 0
    for (const r of robots) {
      const model = buildRobotModel(r.cfg, r.alliance)
      scene.add(model.group)
      robotViews.push({ model, last: null, grip: true })
    }
    built = robots
  }

  /** Đặt ô `slot` của lưới bóng về vị trí p, hoặc ẩn (p = null). */
  function put(i: number, p: THREE.Vector3 | null): void {
    const inst = i < 100 ? orange : green
    const k = i < 100 ? i : i - 100
    if (p) {
      dummy.position.copy(p)
      dummy.scale.setScalar(1)
    } else dummy.scale.setScalar(0)
    dummy.updateMatrix()
    inst.setMatrixAt(k, dummy.matrix)
  }

  function syncBalls(world: FanrocWorld, robots: RobotBody[]): void {
    const inBox = { o: 0, g: 0 }
    const inTray = { red: { o: 0, g: 0 }, blue: { o: 0, g: 0 } }
    const owner = new Map<number, { r: number; n: number }>()
    robots.forEach((r, ri) => r.stored.forEach((i, n) => owner.set(i, { r: ri, n })))
    world.balls.forEach((b, i) => {
      if (b.st === 'field' && b.body) {
        const p = b.body.translation()
        lastX[i] = p.x
        trayOf.delete(i)
        put(i, tmp.set(p.x, p.y, p.z))
      } else if (b.st === 'box') {
        put(i, boxSlot(inBox[b.color]++, b.color, tmp))
      } else if (b.st === 'held') {
        const o = owner.get(i)
        if (!o) return put(i, null)
        const r = robots[o.r]
        // Mẫu Maker: bóng chồng trong lồng chứa bóng (ống đứng của CAD). Robot khác: chồng trên thân, 3 quả một hàng.
        const lift = r.def.type === 'co' ? r.extend : 0
        if (r.def.type === 'maker') tmp.set(BALL_TUBE.x, BALL_TUBE.y0 + o.n * BALL_TUBE.step, BALL_TUBE.z).multiplyScalar(0.001)
        else tmp.set(((o.n % 3) - 1) * 0.042, r.def.size.h + BALL_R + 0.004 + lift + Math.floor(o.n / 3) * 0.042, -0.02)
        put(i, robotViews[o.r].model.group.localToWorld(tmp))
      } else if (b.st === 'tray') {
        let a = trayOf.get(i)
        if (!a) trayOf.set(i, (a = lastX[i] < ZONES.start.red.x1 ? 'red' : 'blue'))
        // Khay: hàng cam phía trước, hàng xanh phía sau.
        const n = inTray[a][b.color]++
        const t = TRAY[a]
        const row = (b.color === 'o' ? 0 : 2) + Math.floor(n / TRAY.cols)
        put(i, tmp.set(t.x + (n % TRAY.cols) * 0.042, 0.01 + BALL_R, t.z + row * 0.042))
      } else put(i, null)
    })
    // Sân không bóng (Xưởng, nhiệm vụ — `balls: false`): ô bóng của sân trước đó phải ẩn đi.
    for (let i = world.balls.length; i < BALL_SLOTS; i++) put(i, null)
    orange.instanceMatrix.needsUpdate = true
    green.instanceMatrix.needsUpdate = true
  }

  function syncRobots(robots: RobotBody[], ports?: readonly PortValues[]): void {
    robots.forEach((r, i) => {
      const v = robotViews[i]
      const p = r.pose
      const g = v.model.group
      g.position.set(p.x, r.body.translation().y, p.z)
      g.rotation.y = p.yaw + Math.PI // hình: mũi +z; vật lý: yaw 0 = mũi −z
      g.updateMatrixWorld()
      let fwd = 0
      let dyaw = 0
      if (v.last) {
        fwd = -(p.x - v.last.x) * Math.sin(p.yaw) - (p.z - v.last.z) * Math.cos(p.yaw)
        dyaw = Math.atan2(Math.sin(p.yaw - v.last.yaw), Math.cos(p.yaw - v.last.yaw))
      }
      v.last = { x: p.x, z: p.z, yaw: p.yaw }
      const pv = ports?.[i]
      if (pv?.S2 != null) v.grip = pv.S2 >= 90
      const gp = r.gripPoint()
      // Con lăn M3 (hoặc servo 360 ở S4 khi đế 4 bánh / chọn servo): chỉ để quay trên hình.
      const s360 = r.cfg.drive !== 'diff2' || r.cfg.actuator === 's360'
      const intake = !r.def.mech.M3 || !pv ? 0 : s360 ? servo360(pv.S4) : Math.max(-1, Math.min(1, pv.M3 / 100))
      v.model.update({
        extend: r.extend,
        armFrac: r.armFrac,
        grip: v.grip,
        gate: (pv?.S3 ?? 0) >= 90,
        intake,
        fwd,
        dyaw,
        hasFlag: r.hasFlag,
        grip3: g.worldToLocal(tmp.set(gp.x, gp.y, gp.z)),
      })
      // Cờ rơi trên sàn: trụ dài FLAG_LEN, tâm ở body (cờ vẽ có gốc ở đáy đế).
      let f = dropped[i]
      if (r.flagBody) {
        if (!f) {
          f = dropped[i] = new THREE.Group()
          const inner = makeFlag()
          inner.position.y = -FLAG_LEN / 2
          f.add(inner)
          scene.add(f)
        }
        const t = r.flagBody.translation()
        const q = r.flagBody.rotation()
        f.position.set(t.x, t.y, t.z)
        f.quaternion.set(q.x, q.y, q.z, q.w)
        f.visible = true
      } else if (f) f.visible = false
    })
  }

  function updateCamera(robots: RobotBody[]): void {
    if (view === 'orbit') {
      const a = (performance.now() / 1000) * ORBIT_SPEED
      const r = Math.max(2.6, 2.6 * (1.1 / camera.aspect))
      camera.position.lerp(tmp.set(Math.sin(a) * r, 1.7, Math.cos(a) * r), 0.04)
      controls.target.lerp(tmp.set(0, 0.05, 0), 0.04)
      return
    }
    if (view === 'follow' && robots[followIdx]) {
      const p = robots[followIdx].pose
      const fx = -Math.sin(p.yaw)
      const fz = -Math.cos(p.yaw)
      // Sau-trên robot; mức vừa trở lên đủ cao để nhìn qua rào (0,3 m) khi robot còn ở ô xuất phát sát rào.
      const o = followOffset(FOLLOW_ZOOM[followZoom])
      const pos = new THREE.Vector3(p.x - fx * o.back, o.up, p.z - fz * o.back)
      const target = new THREE.Vector3(p.x + fx * o.ahead, 0.06, p.z + fz * o.ahead)
      // Ở tốc độ xem cao robot đi xa mỗi khung: bám thẳng khi lệch nhiều, chỉ làm mượt khi lệch ít.
      const k = zoomEase > 0 ? (zoomEase--, 0.12) : camera.position.distanceTo(pos) > 0.12 ? 1 : 0.15
      camera.position.lerp(pos, k)
      controls.target.lerp(target, k)
      return
    }
    if (goal) {
      camera.position.lerp(goal.pos, 0.12)
      controls.target.lerp(goal.target, 0.12)
      if (camera.position.distanceTo(goal.pos) < 0.003) goal = null
    }
  }

  return {
    sync(world, robots, match, ports) {
      if (built !== robots) buildRobots(robots)
      // Robot trước: bóng đang giữ đặt theo matrixWorld của nhóm robot ở khung này (không phải khung trước).
      syncRobots(robots, ports)
      syncBalls(world, robots)
      match.flags.forEach((on, m) => (planted[m].visible = on))
      // Cửa trước của hộp mở trong 10 s xả bóng.
      const open = match.phase === 'release' && world.balls.some((b) => b.st === 'box')
      const gy = BOX.y0 + ((BOX.y1 - BOX.y0) * 0.55) / 2
      dispenser.gate.position.y += ((open ? gy + GATE_OPEN : gy) - dispenser.gate.position.y) * 0.2
      updateCamera(robots)
      controls.enabled = view !== 'follow' && view !== 'orbit'
      controls.update()
      renderer.render(scene, camera)
    },
    camera(v, robot = 0) {
      view = v
      followIdx = robot
      if (v === 'field') setFieldView()
      else if (v === 'driver') {
        // Mắt người lái đứng giữa Khu Điều Khiển của liên minh robot đó.
        const a = built?.[robot]?.alliance ?? (robot % 2 === 0 ? 'red' : 'blue') // ghế [Đỏ 0, Xanh 0, Đỏ 1, Xanh 1]
        const x = a === 'red' ? -0.6 : 0.6
        goal = { pos: new THREE.Vector3(x, 1.45, DRIVER_Z.z0 + 0.35), target: new THREE.Vector3(x * 0.3, 0, -0.2) }
      } else goal = null
    },
    quality: setQuality,
    trail: setTrail,
    get trailObjects() {
      return trailGroup.children.length
    },
    dispose() {
      ro.disconnect()
      controls.dispose()
      // Lưới / vật liệu dùng chung (núi, robot, bóng) chỉ giải phóng một lần.
      setTrail(null)
      for (const m of [...trailMats, pathMat]) m.dispose()
      disposeTree(scene)
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

