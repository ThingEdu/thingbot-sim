// Hình 3D của 4 robot mẫu và Lá Cờ, dựng bằng khối đơn giản theo bản dựng thử docs/superpowers/specs/fanroc-spike/san-3d.html
// (chuyển sang TS, Three 0.180). Chỉ là phần hình: vị trí, hướng và cơ cấu đều lấy từ trạng thái RobotBody mỗi khung.
//
// Khung toạ độ của hình (mm, nhóm `body` thu tỉ lệ 0.001): +z là mũi xe, y lên, +x là BÊN TRÁI xe
// (nhìn từ trên, mũi +z thì tay trái ở +x). Nhóm ngoài (m) đặt ở tâm xe trên sàn; cảnh xoay nó rotation.y = yaw + π
// vì yaw 0 của vật lý là mũi hướng −z.
import * as THREE from 'three'
import type { Alliance } from '../layout.ts'
import { ROBOTS, type RobotConfig } from '../robots.ts'

const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...o })

const M = {
  plate: mat(0xeceeec, { roughness: 0.5 }),
  grey: mat(0x8a918d),
  dark: mat(0x232624),
  tire: mat(0x1b1b1b, { roughness: 0.95 }),
  hub: mat(0xe0b622),
  tt: mat(0xf2c21b),
  pcb: mat(0x1f4fbf),
  servo: mat(0x2b55d6),
  black: mat(0x111111),
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
    const t = cyl(r, w, M.tire, 28)
    t.rotation.z = Math.PI / 2
    const h = cyl(r * 0.62, w + 1, M.hub, 5)
    h.rotation.z = Math.PI / 2
    p.add(t, h)
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

/** Lồng ống cong (Mẫu Maker): n thanh chạy song song quanh đường cong `pts`. */
function railCage(g: THREE.Group, pts: [number, number, number][], n: number, rad: number, m: THREE.Material): THREE.CatmullRomCurve3 {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  const side = new THREE.Vector3(1, 0, 0)
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    const rail: THREE.Vector3[] = []
    for (let i = 0; i <= 24; i++) {
      const u = i / 24
      const p = curve.getPoint(u)
      const nrm = new THREE.Vector3().crossVectors(curve.getTangent(u), side).normalize()
      rail.push(p.clone().addScaledVector(side, Math.cos(a) * rad).addScaledVector(nrm, Math.sin(a) * rad))
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 30, 2.2, 6), m))
  }
  return curve
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
const BASES: Record<RobotConfig['type'], Base> = {
  maker: { track: 107, z: [80, -80], passive: 'omni' },
  ui: { track: 77, z: [50, -60] },
  co: { track: 80, z: [90, -70] },
  sort: { track: 107, z: [70, -60] },
}

function buildDrive(cfg: RobotConfig, g: THREE.Group): Wheel[] {
  const { track, z, passive } = BASES[cfg.type]
  const ws: Wheel[] = []
  if (cfg.drive === 'diff2') {
    // Bánh động cơ M1 (trái, +x) và M2 (phải) ở phía sau; phía trước là 2 bánh omni bị động hoặc bi đỡ.
    ws.push(wheel(32.5, 25, track, z[1], g), wheel(32.5, 25, -track, z[1], g))
    for (const sx of [-1, 1]) g.add(box(65, 22, 19, M.tt, sx * (track - 45), 33, z[1]))
    if (passive === 'omni') ws.push(wheel(32.5, 25, track, z[0], g, 'omni'), wheel(32.5, 25, -track, z[0], g, 'omni'))
    else {
      const c = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 8), M.alu)
      c.position.set(0, 10, z[0])
      g.add(c)
    }
  } else {
    const k: WheelKind = cfg.drive
    for (const zz of z) ws.push(wheel(32.5, 25, track, zz, g, k), wheel(32.5, 25, -track, zz, g, k))
    for (const sx of [-1, 1]) for (const zz of z) g.add(box(65, 22, 19, M.tt, sx * (track - 45), 33, zz))
  }
  return ws
}

/** Hộp cơ cấu M3/M4: động cơ TT (vàng) hoặc servo 360 (đen). */
const actBox = (cfg: RobotConfig, w: number, h: number, d: number, x: number, y: number, z: number) =>
  box(w, h, d, cfg.drive !== 'diff2' || cfg.actuator === 's360' ? M.black : M.tt, x, y, z)

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

function buildMaker(cfg: RobotConfig, g: THREE.Group): Omit<Parts, 'wheels'> {
  g.add(box(184, 4, 245, M.plate, 0, 50, 0), box(184, 4, 230, M.plate, 0, 82, -6))
  for (const sx of [-1, 1]) g.add(box(4, 36, 245, M.plate, sx * 92, 66, 0))
  g.add(box(68, 10, 52, M.pcb, 0, 60, -30), box(78, 20, 40, M.black, 0, 94, -92))
  g.add(box(120, 132, 4, M.plate, 10, 150, -58), box(4, 132, 90, M.plate, 70, 150, -15))
  const curve = railCage(g, [[-20, 38, 128], [-20, 92, 98], [-20, 146, 52], [-20, 178, 8]], 6, 30, M.plate)
  const top = new THREE.Mesh(new THREE.TorusGeometry(34, 4, 8, 32), M.grey)
  top.position.copy(curve.getPoint(1))
  top.rotation.x = Math.PI / 2
  g.add(top)
  // M3 tay vòng xúc bóng.
  const arm = new THREE.Group()
  arm.position.set(-20, 62, 92)
  arm.add(box(6, 6, 52, M.grey, -34, 0, 22))
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(26, 4, 8, 28), M.grey)
  hoop.position.set(-20, -18, 44)
  hoop.rotation.y = Math.PI / 2
  arm.add(hoop)
  g.add(arm, actBox(cfg, 20, 40, 40, -78, 70, 92))
  // M4 thanh trượt răng (250 mm) vươn tới trước, đầu thanh mang kẹp cờ.
  const slide = new THREE.Group()
  slide.add(box(26, 6, 250, M.alu, 0, 0, -125))
  for (let i = 0; i < 11; i++) slide.add(box(14, 3, 6, M.grey, 0, 4, -10 - i * 22))
  g.add(slide)
  const k = claw(g, 22)
  // S3 cửa xả trên đỉnh ống cong.
  const gate = new THREE.Group()
  gate.position.set(30, 196, -40)
  gate.add(box(23, 22, 12, M.servo, 0, 0, 0))
  const flap = box(44, 3, 40, M.alu, 22, 12, 6)
  gate.add(flap)
  g.add(gate)
  return {
    claw: k.claw,
    update: (p, dt) => {
      arm.rotation.x += p.intake * dt * 8
      k.claw.position.copy(p.grip3).multiplyScalar(1000)
      // Đầu thanh trượt ngay sau kẹp, cao hơn điểm kẹp một chút; tay S1 nâng kẹp lên thì thanh nghiêng theo.
      slide.position.set(-62, Math.max(206, k.claw.position.y + 6), k.claw.position.z - 10)
      k.set(p.grip)
      k.flag.visible = p.hasFlag
      flap.rotation.z = p.gate ? 1.3 : 0
    },
  }
}

function buildUi(_cfg: RobotConfig, g: THREE.Group): Omit<Parts, 'wheels'> {
  g.add(box(130, 4, 200, M.plate, 0, 52, -10), box(60, 10, 48, M.pcb, 0, 62, -40), box(70, 18, 38, M.black, 0, 76, -80))
  // S1 gàu hớt.
  const bucket = new THREE.Group()
  bucket.position.set(0, 70, 70)
  bucket.add(box(176, 3, 60, M.plate, 0, -55, 30), box(176, 60, 3, M.plate, 0, -27, 0))
  for (const sx of [-1, 1]) bucket.add(box(3, 60, 60, M.plate, sx * 87, -27, 30))
  bucket.add(box(20, 26, 12, M.servo, -70, 8, -8))
  g.add(bucket)
  return {
    update: (p) => {
      bucket.rotation.x = -p.armFrac * 0.9
    },
  }
}

function buildCo(cfg: RobotConfig, g: THREE.Group): Omit<Parts, 'wheels'> {
  g.add(box(134, 4, 270, M.plate, 0, 52, 0), box(60, 10, 48, M.pcb, 0, 62, -60))
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
  g.add(lift, actBox(cfg, 20, 40, 40, 0, 170, -40))
  // S1 tay kẹp vươn tới trước, S2 kẹp cờ.
  const arm = new THREE.Group()
  arm.position.set(70, 80, 110)
  arm.add(box(6, 6, 50, M.grey, 0, 0, 20), box(20, 26, 12, M.servo, 0, 0, -8))
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
  g.add(box(184, 4, 230, M.plate, 0, 52, -10), box(60, 10, 48, M.pcb, 0, 62, -70))
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
  g.add(roller, actBox(cfg, 40, 22, 20, -100, 40, 120), box(16, 10, 16, M.sensor, 0, 92, 70))
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
  flap.add(box(3, 40, 70, M.alu, 0, 0, -20), box(20, 22, 12, M.servo, 0, 26, 0))
  g.add(flap)
  return {
    update: (p, dt) => {
      roller.rotation.x -= p.intake * dt * 14
      flap.rotation.y = p.grip ? -0.6 : 0.6
    },
  }
}

const BUILD = { maker: buildMaker, ui: buildUi, co: buildCo, sort: buildSort }

export function buildRobotModel(cfg: RobotConfig, alliance: Alliance): RobotModel {
  const def = ROBOTS[cfg.type]
  const group = new THREE.Group()
  const body = new THREE.Group()
  body.scale.setScalar(0.001)
  group.add(body)
  const mech = BUILD[cfg.type](cfg, body)
  const wheels = buildDrive(cfg, body)
  // Dải màu liên minh quanh thân.
  const bandMat = mat(BAND[alliance], { transparent: true, opacity: 0.85 })
  const band = box(def.size.w + 0.004, 0.012, def.size.l * 0.6, bandMat, 0, 0.045, 0)
  group.add(band)
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
        if (o instanceof THREE.Mesh) geos.add(o.geometry)
      })
      for (const g of geos) g.dispose()
      bandMat.dispose()
    },
  }
}
