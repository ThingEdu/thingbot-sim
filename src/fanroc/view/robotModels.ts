// Hình 3D của 4 robot mẫu và Lá Cờ, dựng bằng khối đơn giản theo bản dựng thử docs/superpowers/specs/fanroc-spike/san-3d.html
// (chuyển sang TS, Three 0.180). Chỉ là phần hình: vị trí, hướng và cơ cấu đều lấy từ trạng thái RobotBody mỗi khung.
//
// Khung toạ độ của hình (mm, nhóm `body` thu tỉ lệ 0.001): +z là mũi xe, y lên, +x là BÊN TRÁI xe
// (nhìn từ trên, mũi +z thì tay trái ở +x). Nhóm ngoài (m) đặt ở tâm xe trên sàn; cảnh xoay nó rotation.y = yaw + π
// vì yaw 0 của vật lý là mũi hướng −z.
import * as THREE from 'three'
import type { Alliance } from '../layout.ts'
import { ROBOTS, type RobotConfig } from '../robots.ts'
import { BALL_CHUTE, CAD_WHEELS, cadPart, chuteExitModel, makerCad, TALL_TOP } from './cadModel.ts'

const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o })

const M = {
  plate: mat(0xeceeec, { roughness: 0.5 }),
  grey: mat(0x8a918d),
  dark: mat(0x232624),
  tire: mat(0x1b1b1b, { roughness: 0.95 }),
  hub: mat(0xe0b622),
  alu: mat(0xb9bec0, { metalness: 0.6, roughness: 0.35 }),
  fin: mat(0x2ea84f),
  sensor: mat(0xdddddd),
  acrylic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false }),
  flagBase: mat(0x8b6b3a),
}
const BAND = { red: 0xe23b32, blue: 0x2f68e0 }

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  o.position.set(x, y, z)
  return o
}
const cyl = (r: number, h: number, m: THREE.Material, seg = 24): THREE.Mesh =>
  new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m)

// ---------- Lá Cờ (70–100 mm, tỉ lệ 2:3, cột 120–150 mm), đơn vị m ----------
function flagTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 300
  c.height = 200
  const g = c.getContext('2d')!
  g.fillStyle = '#da251d'
  g.fillRect(0, 0, 300, 200)
  g.fillStyle = '#ffcd00'
  g.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5
    const r = k % 2 ? 26 : 64
    g.lineTo(150 + Math.cos(a) * r, 104 + Math.sin(a) * r)
  }
  g.closePath()
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
let flagMat: THREE.Material | null = null
/** Chiều cao cả lá cờ (đế 45 + cột 135 mm) — khớp trụ va chạm của cờ rơi (halfH 0.09). */
export const FLAG_LEN = 0.18
/** Lá Cờ: gốc ở đáy đế, đế Ø42 cao 45 mm, cột 135 mm, lá 90 × 60 mm. */
export function makeFlag(): THREE.Group {
  flagMat ??= new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.8 })
  const g = new THREE.Group()
  const base = cyl(0.021, 0.045, M.flagBase, 20)
  base.position.y = 0.0225
  const pole = cyl(0.0025, 0.135, M.alu, 8)
  pole.position.y = 0.045 + 0.0675
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.06), flagMat)
  f.position.set(0.045, 0.045 + 0.105, 0)
  g.add(base, pole, f)
  return g
}

// ---------- Bánh xe ----------
type WheelKind = 'plain' | 'omni' | 'mecanum'
interface Wheel { obj: THREE.Group; x: number }

function wheel(r: number, w: number, x: number, z: number, g: THREE.Group, kind: WheelKind = 'plain'): Wheel {
  const p = new THREE.Group()
  p.position.set(x, r, z)
  if (kind === 'plain') {
    // Bánh D65 × 25 từ CAD (lốp có gai, mâm vàng); bản CAD lốp quay ra −x nên bánh bên trái (+x) xoay nửa vòng.
    p.position.y = 35.2
    p.add(cadPart('wheel', 0, 0, 0, x > 0 ? Math.PI : 0))
  } else {
    // Bánh đa hướng: đĩa giữa + con lăn nhỏ quanh vành. Omni: con lăn vuông góc trục; mecanum: nghiêng 45°.
    const hub = cyl(r * 0.7, w * 0.8, M.hub, 20)
    hub.rotation.z = Math.PI / 2
    p.add(hub)
    const n = 10
    const roll = new THREE.CylinderGeometry(5.5, 5.5, w * (kind === 'omni' ? 0.45 : 0.9), 8)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const rl = new THREE.Mesh(roll, M.tire)
      rl.position.set(0, Math.cos(a) * (r - 6), Math.sin(a) * (r - 6))
      rl.quaternion.setFromEuler(new THREE.Euler(a, 0, 0))
      rl.rotateX(Math.PI / 2)
      if (kind === 'mecanum') rl.rotateZ(x > 0 === z > 0 ? Math.PI / 4 : -Math.PI / 4)
      p.add(rl)
    }
  }
  g.add(p)
  return { obj: p, x: x / 1000 }
}

// ---------- Robot ----------
/** Trạng thái cơ cấu để vẽ một khung (mọi độ dài theo m, như RobotBody). */
export interface RobotPose {
  /** Mức nâng/vươn hiện tại (RobotBody.extend). */
  extend: number
  /** Tay S1 (RobotBody.armFrac, 0…1). */
  armFrac: number
  /** Kẹp S2 đang đóng. */
  grip: boolean
  /** Cửa xả S3 đang mở. */
  gate: boolean
  /** Con lăn / tay vòng M3 đang quay (−1…1). */
  intake: number
  /** Quãng đường đi tới (m) và góc quay (rad, dương = quay trái) kể từ khung trước — để quay bánh. */
  fwd: number
  dyaw: number
  /** Đang giữ cờ. */
  hasFlag: boolean
  /** Điểm kẹp cờ (RobotBody.gripPoint) trong hệ toạ độ nhóm ngoài, m. */
  grip3: THREE.Vector3
}

export interface RobotModel {
  /** Gốc ở tâm xe trên sàn, mũi xe +z. */
  readonly group: THREE.Group
  update(p: RobotPose): void
  /** Giải phóng geometry của hình và vật liệu riêng của nó (vật liệu dùng chung giữ lại cho robot dựng sau). */
  dispose(): void
}

interface Parts {
  wheels: Wheel[]
  claw?: THREE.Group
  update: (p: RobotPose, dt: number) => void
}

type Base = { track: number; z: [number, number]; passive?: 'omni' }
const BASES: Partial<Record<RobotConfig['type'], Base>> = {
  ui: { track: 77, z: [50, -60] },
  co: { track: 80, z: [90, -70] },
  sort: { track: 107, z: [70, -60] },
}

function buildDrive(cfg: RobotConfig, g: THREE.Group): Wheel[] {
  const { track, z, passive } = BASES[cfg.type]!
  const ws: Wheel[] = []
  if (cfg.drive === 'diff2') {
    // Bánh động cơ M1 (trái, +x) và M2 (phải) ở phía sau; phía trước là 2 bánh omni bị động hoặc bi đỡ.
    ws.push(wheel(32.5, 25, track, z[1], g), wheel(32.5, 25, -track, z[1], g))
    for (const sx of [-1, 1]) g.add(cadPart('motor', sx * (track - 30), 36, z[1]))
    if (passive === 'omni') ws.push(wheel(32.5, 25, track, z[0], g, 'omni'), wheel(32.5, 25, -track, z[0], g, 'omni'))
    else {
      const c = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), M.alu)
      c.position.set(0, 10, z[0])
      g.add(c)
    }
  } else {
    const k: WheelKind = cfg.drive
    for (const zz of z) ws.push(wheel(32.5, 25, track, zz, g, k), wheel(32.5, 25, -track, zz, g, k))
    for (const sx of [-1, 1]) for (const zz of z) g.add(cadPart('motor', sx * (track - 30), 36, zz))
  }
  return ws
}

/** Hộp cơ cấu M3/M4: động cơ TT (vàng) hoặc servo 360 (đen). */
/** Động cơ cơ cấu M3 / M4: động cơ CAD; servo 360 (đế 4 bánh hoặc chọn servo) thì servo CAD. */
const actBox = (cfg: RobotConfig, x: number, y: number, z: number) =>
  cadPart(cfg.drive !== 'diff2' || cfg.actuator === 's360' ? 'servo' : 'motor', x, y, z)

/** Hai má kẹp và lá cờ ở điểm kẹp; má mở ra khi kẹp nhả. */
function claw(g: THREE.Group, jawH: number): { claw: THREE.Group; flag: THREE.Group; set: (closed: boolean) => void } {
  const c = new THREE.Group()
  const jL = box(4, jawH, 16, M.grey, -8, 0, 0)
  const jR = box(4, jawH, 16, M.grey, 8, 0, 0)
  const flag = makeFlag()
  flag.scale.setScalar(1000)
  flag.position.y = -jawH / 2 // đáy đế cờ ngang điểm kẹp
  c.add(jL, jR, flag)
  g.add(c)
  return {
    claw: c,
    flag,
    set: (closed) => {
      const d = closed ? 8 : 18
      jL.position.x = -d
      jR.position.x = d
    },
  }
}

function buildUi(_cfg: RobotConfig, g: THREE.Group): Omit<Parts, 'wheels'> {
  g.add(box(130, 3, 200, M.plate, 0, 52, -10), cadPart('board', 0, 63, -10), cadPart('battery', 0, 66, -75, Math.PI / 2))
  // S1 gàu hớt.
  const bucket = new THREE.Group()
  bucket.position.set(0, 70, 70)
  bucket.add(box(176, 3, 60, M.plate, 0, -55, 30), box(176, 60, 3, M.plate, 0, -27, 0))
  for (const sx of [-1, 1]) bucket.add(box(3, 60, 60, M.plate, sx * 87, -27, 30))
  bucket.add(cadPart('servo', -70, 8, -8))
  g.add(bucket)
  return {
    update: (p) => {
      bucket.rotation.x = -p.armFrac * 0.9
    },
  }
}

function buildCo(cfg: RobotConfig, g: THREE.Group): Omit<Parts, 'wheels'> {
  g.add(box(134, 3, 270, M.plate, 0, 52, 0), cadPart('board', 0, 63, -70))
  for (const sx of [-1, 1]) g.add(box(4, 170, 20, M.alu, sx * 55, 140, -20))
  // M4 nâng thùng, S3 cửa thùng.
  const lift = new THREE.Group()
  const hop = new THREE.Group()
  hop.position.set(0, 120, -20)
  hop.add(box(104, 3, 100, M.plate, 0, 0, 0))
  for (const [w, d, x, z] of [[104, 3, 0, -50], [3, 100, -52, 0], [3, 100, 52, 0]]) hop.add(box(w, 60, d, M.acrylic, x, 30, z))
  const door = box(104, 60, 3, M.alu, 0, 30, 50)
  hop.add(door)
  lift.add(hop)
  g.add(lift, actBox(cfg, 0, 170, -40))
  // S1 tay kẹp vươn tới trước, S2 kẹp cờ.
  const arm = new THREE.Group()
  arm.position.set(70, 80, 110)
  arm.add(box(6, 6, 50, M.grey, 0, 0, 20), cadPart('servo', 0, 0, -8))
  g.add(arm)
  const k = claw(g, 18)
  return {
    claw: k.claw,
    update: (p) => {
      lift.position.y = p.extend * 1000
      const a = p.gate ? 1.2 : 0
      door.rotation.x = a
      door.position.y = 30 + Math.sin(a) * 25
      door.position.z = 50 + Math.sin(a) * 28
      k.claw.position.copy(p.grip3).multiplyScalar(1000)
      // Cần tay kéo dài từ khớp tới kẹp.
      arm.scale.z = Math.max(1, (k.claw.position.z - arm.position.z) / 46)
      k.set(p.grip)
      k.flag.visible = p.hasFlag
    },
  }
}

function buildSort(cfg: RobotConfig, g: THREE.Group): Omit<Parts, 'wheels'> {
  g.add(box(184, 3, 230, M.plate, 0, 52, -10), cadPart('board', 0, 63, -80))
  // M3 con lăn hút.
  const roller = new THREE.Group()
  roller.position.set(0, 40, 120)
  const rc = cyl(14, 170, M.dark, 16)
  rc.rotation.z = Math.PI / 2
  roller.add(rc)
  for (let k = 0; k < 6; k++) {
    const fin = box(170, 22, 2, M.fin)
    fin.rotation.x = (k / 6) * Math.PI
    roller.add(fin)
  }
  g.add(roller, actBox(cfg, -100, 40, 120), box(16, 10, 16, M.sensor, 0, 92, 70))
  // Hai ngăn mica (trái: cam, phải: xanh).
  for (const sx of [-1, 1]) {
    const bin = new THREE.Group()
    bin.position.set(sx * 50, 56, -10)
    for (const [w, d, x, z] of [[90, 3, 0, -70], [90, 3, 0, 70], [3, 140, -45, 0], [3, 140, 45, 0]]) bin.add(box(w, 70, d, M.acrylic, x, 35, z))
    g.add(bin)
  }
  // S2 cánh gạt chọn ngăn.
  const flap = new THREE.Group()
  flap.position.set(0, 100, 40)
  flap.add(box(3, 40, 70, M.alu, 0, 0, -20), cadPart('servo', 0, 30, 0))
  g.add(flap)
  return {
    update: (p, dt) => {
      roller.rotation.x -= p.intake * dt * 14
      flap.rotation.y = p.grip ? -0.6 : 0.6
    },
  }
}

const BUILD = { ui: buildUi, co: buildCo, sort: buildSort }

/**
 * Mẫu Maker theo CAD Onshape (cadModel.ts): thân + thanh răng + tay vòng + 4 bánh. Thanh răng lùi ra sau theo
 * `extend` mang servo + giá cờ; tay vòng nhấc theo thanh răng (dây kéo). Đế 4 bánh omni / mecanum: bánh CAD thay bằng
 * bánh đa hướng tự dựng ở đúng chỗ bánh CAD.
 */
/** Thanh tròn nối hai điểm (mm), cập nhật được mỗi khung bằng `set`. */
function rod(r: number, m: THREE.Material, g: THREE.Group): { set: (a: THREE.Vector3, b: THREE.Vector3) => void } {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), m)
  g.add(o)
  const up = new THREE.Vector3(0, 1, 0)
  const d = new THREE.Vector3()
  return {
    set: (a, b) => {
      d.subVectors(b, a)
      o.position.addVectors(a, b).multiplyScalar(0.5)
      o.scale.set(1, Math.max(1e-3, d.length()), 1)
      o.quaternion.setFromUnitVectors(up, d.normalize())
    },
  }
}

/**
 * Mẫu Maker và ba mẫu cải tiến dựng trên CAD "Bộ thingbot mới" (R142): ống lồng nối dài (8 bóng), con lăn hút trước mũi
 * (động cơ TT, M3), servo MG996R ở S1 nâng vòng cửa ra theo RobotDef.chuteLift (máng hai thanh nối cửa ra với chỗ uốn
 * của ống). Mẫu gốc không nâng hạ gì: vòng cửa ra đứng yên.
 */
function buildMakerCad(cfg: RobotConfig, g: THREE.Group): Parts {
  const def = ROBOTS[cfg.type]
  const { mat, groups } = makerCad()
  const mesh = (name: string) => {
    const o = new THREE.Mesh(groups[name].geo, mat)
    o.position.copy(groups[name].pivot)
    return o
  }
  g.add(mesh('body'))
  const rack = new THREE.Group()
  rack.add(mesh('rack'))
  g.add(rack)
  const hoop = new THREE.Group()
  hoop.add(mesh('hoop'))
  g.add(hoop)
  const tube = new THREE.Vector3(58, 0, 43)
  if (def.storage > 4) {
    // Ống lồng nối dài từ miệng ống CAD (209 mm) lên TALL_TOP: 6 nan + vòng miệng.
    const len = TALL_TOP - 209
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      g.add(box(4, len, 8, M.plate, tube.x + Math.cos(a) * 27, 209 + len / 2, tube.z + Math.sin(a) * 27))
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(28, 3, 8, 24), M.plate)
    ring.rotation.x = Math.PI / 2
    ring.position.set(tube.x, TALL_TOP, tube.z)
    g.add(ring)
  }
  let roller: THREE.Mesh | null = null
  if (def.mech.M3) {
    // Con lăn hút ngang trước mũi, hai má đỡ, động cơ M3 (hoặc servo 360) bên trái.
    roller = cyl(17, 150, M.fin, 16)
    roller.rotation.z = Math.PI / 2
    roller.position.set(0, 24, 168)
    g.add(roller, box(4, 40, 70, M.plate, 79, 30, 140), box(4, 40, 70, M.plate, -79, 30, 140), actBox(cfg, 98, 30, 150))
  }
  let lift: ((frac: number) => void) | null = null
  if (def.chuteLift) {
    // MG996R (40 × 20 × 37 mm) bên ống, cần nâng tới vòng cửa ra; máng hai thanh từ chỗ uốn của ống tới cửa ra.
    g.add(box(20, 37, 40, M.dark, -45, 135, 40))
    const horn = new THREE.Vector3(-45, 150, 55)
    const arm = rod(3, M.alu, g)
    const rails = [rod(2.5, M.plate, g), rod(2.5, M.plate, g)]
    const bend = new THREE.Vector3(...BALL_CHUTE[2])
    const base = new THREE.Vector3(...BALL_CHUTE[0])
    const exit = new THREE.Vector3()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    lift = (frac) => {
      chuteExitModel(def, frac, exit)
      hoop.position.subVectors(exit, base)
      arm.set(horn, exit)
      rails.forEach((r, k) => r.set(a.copy(bend).setX(bend.x + (k ? 14 : -14)).setY(bend.y - 20), b.copy(exit).setX(exit.x + (k ? 14 : -14)).setY(exit.y - 20)))
    }
    lift(0)
  }
  const wheels: Wheel[] = CAD_WHEELS.map((name) => {
    const p = groups[name].pivot
    if (cfg.drive !== 'diff2') return wheel(32.5, 25, p.x, p.z, g, cfg.drive)
    const obj = new THREE.Group()
    obj.position.copy(p)
    const m = mesh(name)
    m.position.set(0, 0, 0)
    obj.add(m)
    g.add(obj)
    return { obj, x: p.x / 1000 }
  })
  // Cờ trong giá cờ: đáy đế cờ dưới điểm kẹp nửa chiều cao đế.
  const flag = makeFlag()
  flag.scale.setScalar(1000)
  g.add(flag)
  return {
    wheels,
    update: (p, dt) => {
      rack.position.z = -p.extend * 1000
      lift?.(p.armFrac)
      if (roller) roller.rotation.x -= p.intake * dt * 14
      flag.position.copy(p.grip3).multiplyScalar(1000)
      flag.position.y -= 22.5
      flag.visible = p.hasFlag
    },
  }
}

export function buildRobotModel(cfg: RobotConfig, alliance: Alliance): RobotModel {
  const def = ROBOTS[cfg.type]
  const group = new THREE.Group()
  const body = new THREE.Group()
  body.scale.setScalar(0.001)
  group.add(body)
  const cad = def.cad === 'maker' ? buildMakerCad(cfg, body) : null
  const mech = cad ?? BUILD[cfg.type as keyof typeof BUILD](cfg, body)
  const wheels = cad ? cad.wheels : buildDrive(cfg, body)
  // Dải màu liên minh quanh thân.
  const bandMat = mat(BAND[alliance], { transparent: true, opacity: 0.85 })
  // Hai dải mỏng ốp ngoài hai bên thân — không phủ khung / linh kiện. Mẫu Maker CAD: tấm bên khung 240 mm, cao ~35 mm.
  if (cad) for (const sx of [-1, 1]) group.add(box(0.003, 0.014, 0.2, bandMat, sx * 0.1215, 0.032, -0.035))
  else for (const sx of [-1, 1]) group.add(box(0.003, 0.012, def.size.l * 0.6, bandMat, sx * (def.size.w / 2 + 0.0015), 0.05, 0))
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material !== M.acrylic) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  let last = performance.now()
  return {
    group,
    update(p) {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // Bánh lăn theo quãng đường của chính nó: bánh bên trái (+x) đi fwd − dyaw·x.
      for (const w of wheels) w.obj.rotation.x += (p.fwd - p.dyaw * w.x) / 0.0325
      mech.update(p, dt)
    },
    dispose() {
      const geos = new Set<THREE.BufferGeometry>()
      group.traverse((o) => {
        // Lưới CAD dùng chung cho mọi robot (cadModel.ts): không giải phóng theo robot.
        if (o instanceof THREE.Mesh && !o.geometry.userData.shared) geos.add(o.geometry)
      })
      for (const g of geos) g.dispose()
      bandMat.dispose()
    },
  }
}
