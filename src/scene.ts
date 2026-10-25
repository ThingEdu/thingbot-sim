/**
 * Cảnh 3D mạch ThingBot dựng từ ẢNH THẬT của mạch đã lắp (khóa ThingBot trên robot.edu.vn, chụp thẳng
 * từ trên xuống, 1600 × 1265 px): mặt Shield và mặt trên của từng linh kiện nổi đều lấy từ ảnh đó, nên
 * bố cục, chữ in và màu khớp kit thật. Core cắm úp trên hai hàng header, cao hơn Shield ~9 mm; ESP32-C3
 * nằm ở mặt dưới Core, còn PCA9685, còi, đèn L1/L2 nằm trên Shield bên dưới Core. Lớp "dưới Core" lấy từ
 * ảnh Shield chưa lắp Core, xoay 180° và ghép theo 4 lỗ vít — bật "nhìn dưới Core" để thấy.
 *
 * Toạ độ trong file này là toạ độ điểm ảnh của ảnh mạch đã lắp. Chưa có file STEP/PCB của bản 2027:
 * khi có, chỉ cần thay ảnh và bảng toạ độ bên dưới.
 */
import * as THREE from 'three'

export type TraceName = 'io3' | 'sda' | 'scl' | 'ch15' | 'ch13'
export type PartName = 'sw' | 'esp' | 'pca' | 'l1' | 'l2'
export type PropName = 'oled' | 'servo' | 'motor' | 'sonar'

export interface SceneApi {
  setSwitch(pressed: boolean): void
  /** Độ sáng đèn, 0..1. */
  setLed(name: 'L1' | 'L2', level: number): void
  pulse(trace: TraceName, color: string): void
  setTrace(trace: TraceName, color: string | null): void
  highlight(parts: PartName[]): void
  addBadge(part: PartName, html: string): HTMLElement
  /** Gỡ mọi nhãn số và điểm bấm (khi đổi bài). */
  clearBadges(): void
  /**
   * Điểm bấm trên linh kiện (px ảnh). `under`: linh kiện nằm dưới Core, chỉ hiện khi nhìn xuyên Core.
   */
  addHotspot(px: number, py: number, html: string, onClick: () => void, under?: boolean): HTMLElement
  /** Linh kiện gắn ngoài mạch mà bài cần (màn OLED, servo, động cơ + bánh, cảm biến siêu âm + vật cản). */
  setProps(props: PropName[]): void
  /** Khung hình OLED đang hiện (bố cục trang SSD1306), hoặc null = màn tắt. */
  setOled(frame: { width: number; height: number; frame: Uint8Array } | null): void
  /** Góc servo S1, 0..180 độ. */
  setServo(deg: number): void
  /** Tốc độ bánh M1, -1..1 (âm = lùi). */
  setWheel(speed: number): void
  /** Khoảng cách tới vật cản trước cảm biến siêu âm, cm. */
  setObstacle(cm: number): void
  /** Hiện/ẩn lớp dây dữ liệu (bài khám phá không cần). */
  showWires(on: boolean): void
  /** Vòng chú ý ở một điểm (px ảnh), hoặc tắt. */
  mark(at: [number, number] | null): void
  /** Bấm lên mặt mạch (ngoài nút SW): báo toạ độ px ảnh. */
  onPick(cb: (px: number, py: number) => void): void
  /** Làm Core trong suốt để thấy linh kiện trên Shield bên dưới. */
  setSeeThrough(on: boolean): void
  onSwitch(cb: (pressed: boolean) => void): void
  zoom(factor: number): void
  reset(): void
}

/** Vùng của ảnh `board/top.webp` trong ảnh gốc (px). */
const TX0 = 390
const TY0 = 130
const TW = 805
const TH = 885
/** Tâm mạch trong ảnh gốc và tỉ lệ px → đơn vị cảnh (≈ mm). */
const CX = 778.5
const CY = 585
const S = 0.09
const W = (px: number, py: number): [number, number] => [(px - CX) * S, (py - CY) * S]

const CORE = { x0: 475, y0: 285, x1: 1075, y1: 885 }
const CORE_BASE = 8.8
const CORE_T = 1.6
const OVER = CORE_BASE + CORE_T + 0.3 // độ cao lớp vẽ dây dữ liệu (trên mặt Core)

const COLOR = {
  pcbEdge: 0x15683a,
  coreEdge: 0x1f7a45,
  white: 0xe9e8e2,
  black: 0x1b1c1f,
  metal: 0xb9bec4,
  wire: 0xffffff,
}

/** Mảnh phẳng phủ ảnh, nằm ngang ở độ cao `y`, ứng với hình chữ nhật (px) trong ảnh. */
function photoPlane(map: THREE.Texture, px0: number, py0: number, px1: number, py1: number, y: number) {
  const [x0, z0] = W(px0, py0)
  const [x1, z1] = W(px1, py1)
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
  const u0 = (px0 - TX0) / TW
  const u1 = (px1 - TX0) / TW
  const vt = 1 - (py0 - TY0) / TH
  const vb = 1 - (py1 - TY0) / TH
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, vt, u1, vt, u0, vb, u1, vb], 2))
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  return mesh
}

/** Khối nổi: thân màu `side`, mặt trên là đúng phần ảnh của nó. */
function photoBox(
  map: THREE.Texture,
  px0: number,
  py0: number,
  px1: number,
  py1: number,
  height: number,
  side: number,
  base = 0,
) {
  const g = new THREE.Group()
  const [x0, z0] = W(px0, py0)
  const [x1, z1] = W(px1, py1)
  const geo = new THREE.BoxGeometry(x1 - x0, height, z1 - z0)
  const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: side }))
  body.position.set((x0 + x1) / 2, base + height / 2, (z0 + z1) / 2)
  g.add(body)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x0d1410, transparent: true, opacity: 0.45 }),
  )
  edges.position.copy(body.position)
  g.add(edges)
  g.add(photoPlane(map, px0, py0, px1, py1, base + height + 0.02))
  return g
}

/** Hình chữ nhật bo góc (px) → Shape trong mặt phẳng cảnh (x, -z). */
function roundedShape(px0: number, py0: number, px1: number, py1: number, rpx: number) {
  const [x0, z0] = W(px0, py0)
  const [x1, z1] = W(px1, py1)
  const r = rpx * S
  const s = new THREE.Shape()
  // Shape dùng (x, y) với y = -z, để sau khi xoay -90° quanh X thì nằm đúng chỗ.
  const Y0 = -z0
  const Y1 = -z1
  s.moveTo(x0 + r, Y0)
  s.lineTo(x1 - r, Y0)
  s.quadraticCurveTo(x1, Y0, x1, Y0 - r)
  s.lineTo(x1, Y1 + r)
  s.quadraticCurveTo(x1, Y1, x1 - r, Y1)
  s.lineTo(x0 + r, Y1)
  s.quadraticCurveTo(x0, Y1, x0, Y1 + r)
  s.lineTo(x0, Y0 - r)
  s.quadraticCurveTo(x0, Y0, x0 + r, Y0)
  return s
}

/**
 * Đường dây dữ liệu (px ảnh), từ nguồn đến đích. Điểm nằm trong khung Core thì dây đi trên mặt Core;
 * ngoài khung thì sát mặt Shield, và tự leo lên/xuống ở mép Core.
 */
const TRACES: Record<TraceName, [number, number][]> = {
  io3: [
    [1100, 797],
    [890, 797],
    [890, 470],
    [665, 470],
  ],
  sda: [
    [640, 500],
    [752, 500],
    [752, 580],
  ],
  scl: [
    [640, 516],
    [736, 516],
    [736, 580],
  ],
  ch15: [
    [826, 618],
    [1000, 618],
    [1000, 840],
    [1030, 840],
  ],
  ch13: [
    [701, 632],
    [600, 632],
    [600, 845],
    [548, 845],
  ],
}
/** Vị trí linh kiện (px ảnh). ESP32-C3 ở mặt dưới Core; PCA9685, còi, L1, L2 trên Shield dưới Core. */
const AT = {
  sw: [1150, 797],
  esp: [632, 485],
  pca: [764, 618],
  l1: [1035, 840],
  l2: [532, 845],
} as const
/** Khung đánh dấu chip nằm khuất (px ảnh: tâm, rộng, cao). */
const CHIPS: [number, number, number, number][] = [
  [632, 485, 80, 90],
  [764, 618, 126, 76],
]
const BADGE_AT: Record<PartName, [number, number]> = {
  sw: [1205, 735],
  esp: [590, 420],
  pca: [764, 565],
  l1: [1085, 905],
  l2: [482, 905],
}
const RING: Record<PartName, number> = { sw: 4.6, esp: 5, pca: 3.6, l1: 3.6, l2: 3.6 }

interface Pulse {
  trace: TraceName
  mesh: THREE.Mesh
  t: number
}

export function createScene(container: HTMLElement, badgeLayer: HTMLElement): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.prepend(renderer.domElement)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe0d8c6, 2.1))
  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.position.set(-30, 90, 50)
  scene.add(sun)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000)
  const view = { azimuth: 0.18, elevation: 0.95, zoom: 1 }

  const loader = new THREE.TextureLoader()
  const photo = loader.load(`${import.meta.env.BASE_URL}board/top.webp`)
  photo.colorSpace = THREE.SRGBColorSpace
  photo.anisotropy = 8
  const underPhoto = loader.load(`${import.meta.env.BASE_URL}board/under.webp`)
  underPhoto.colorSpace = THREE.SRGBColorSpace
  underPhoto.anisotropy = 8

  const board = new THREE.Group()
  scene.add(board)

  // Bóng mềm
  const shadow = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedShape(402, 170, 1155, 1000, 60)),
    new THREE.MeshBasicMaterial({ color: 0x6f6448, transparent: true, opacity: 0.18 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(1.8, -1.8, 2.4)
  board.add(shadow)

  // Shield: thân dày 1,6 + mặt trên là ảnh (UV theo vị trí điểm ảnh)
  const shape = roundedShape(402, 170, 1155, 1000, 60)
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false, curveSegments: 10 }),
    new THREE.MeshLambertMaterial({ color: COLOR.pcbEdge }),
  )
  body.rotation.x = -Math.PI / 2
  body.position.y = -1.6
  board.add(body)
  const topGeo = new THREE.ShapeGeometry(shape, 10)
  const pos = topGeo.getAttribute('position')
  const uv: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) / S + CX
    const py = -pos.getY(i) / S + CY
    uv.push((px - TX0) / TW, 1 - (py - TY0) / TH)
  }
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  const shieldTop = new THREE.Mesh(topGeo, new THREE.MeshLambertMaterial({ map: photo }))
  shieldTop.rotation.x = -Math.PI / 2
  shieldTop.position.y = 0.01
  board.add(shieldTop)

  // Phần Shield dưới Core (từ ảnh Shield chưa lắp Core)
  {
    const [x0, z0] = W(CORE.x0, CORE.y0)
    const [x1, z1] = W(CORE.x1, CORE.y1)
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, z1 - z0),
      new THREE.MeshLambertMaterial({ map: underPhoto }),
    )
    under.rotation.x = -Math.PI / 2
    under.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2)
    board.add(under)
  }

  // Mép trên: M3 · jack nguồn · công tắc ON/OFF · M4
  board.add(photoBox(photo, 500, 140, 602, 265, 6, COLOR.white))
  board.add(photoBox(photo, 607, 140, 742, 285, 11, COLOR.black))
  board.add(photoBox(photo, 763, 152, 927, 242, 4.5, COLOR.metal))
  board.add(photoBox(photo, 946, 140, 1050, 265, 6, COLOR.white))
  // Mép phải: PS2 · I2C · thân nút SW
  board.add(photoBox(photo, 1080, 313, 1160, 556, 6, COLOR.white))
  board.add(photoBox(photo, 1080, 560, 1160, 727, 6, COLOR.white))
  board.add(photoBox(photo, 1093, 748, 1158, 846, 3.6, COLOR.black))
  // Mép trái: cột chân servo; mép dưới: M2 · IO0 · IO4 · M1
  board.add(photoBox(photo, 433, 328, 472, 842, 8.5, COLOR.black))
  board.add(photoBox(photo, 490, 900, 596, 1005, 6, COLOR.white))
  board.add(photoBox(photo, 600, 900, 766, 1005, 6, COLOR.white))
  board.add(photoBox(photo, 770, 900, 936, 1005, 6, COLOR.white))
  board.add(photoBox(photo, 940, 900, 1042, 1005, 6, COLOR.white))
  // Hai hàng header nối Core với Shield
  for (const [a, b] of [
    [505, 540],
    [1012, 1047],
  ])
  {
    const [x0, z0] = W(a, 520)
    const [x1, z1] = W(b, 862)
    const hdr = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, CORE_BASE, z1 - z0), new THREE.MeshLambertMaterial({ color: COLOR.black }))
    hdr.position.set((x0 + x1) / 2, CORE_BASE / 2, (z0 + z1) / 2)
    board.add(hdr)
  }

  // Core: nổi trên header, mặt trên là ảnh
  const coreSideMat = new THREE.MeshLambertMaterial({ color: COLOR.coreEdge, transparent: true })
  const [cx0, cz0] = W(CORE.x0, CORE.y0)
  const [cx1, cz1] = W(CORE.x1, CORE.y1)
  const coreBody = new THREE.Mesh(new THREE.BoxGeometry(cx1 - cx0, CORE_T, cz1 - cz0), coreSideMat)
  coreBody.position.set((cx0 + cx1) / 2, CORE_BASE + CORE_T / 2, (cz0 + cz1) / 2)
  board.add(coreBody)
  const coreTop = photoPlane(photo, CORE.x0, CORE.y0, CORE.x1, CORE.y1, CORE_BASE + CORE_T + 0.02)
  ;(coreTop.material as THREE.MeshLambertMaterial).transparent = true
  board.add(coreTop)

  // Núm nút SW nhô ra cạnh phải; vùng bấm rộng hơn núm cho dễ trúng
  const knob = photoBox(photo, 1158, 776, 1192, 818, 2.6, COLOR.black, 0.6)
  board.add(knob)
  const swHit = new THREE.Mesh(new THREE.BoxGeometry(11, 9, 13), new THREE.MeshBasicMaterial({ visible: false }))
  {
    const [x, z] = W(1150, 797)
    swHit.position.set(x, 3, z)
  }
  board.add(swHit)

  // Đèn L1 (đỏ), L2 (xanh lá): nằm trên Shield sát mép dưới Core; ánh sáng hắt ra khe dưới Core
  const haloTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.3, 'rgba(255,255,255,0.45)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  })()
  const leds = {} as Record<'L1' | 'L2', { lens: THREE.MeshLambertMaterial; glow: THREE.Sprite; light: THREE.PointLight; on: number; off: number }>
  ;(
    [
      ['L1', AT.l1, 0xff3b30, 0x6e2622],
      ['L2', AT.l2, 0x2fd158, 0x1d5a2c],
    ] as const
  ).forEach(([name, [px, py], on, off]) => {
    const [x, z] = W(px, py)
    const lens = new THREE.MeshLambertMaterial({ color: off })
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.1), lens)
    m.position.set(x, 0.45, z)
    board.add(m)
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTex, color: on, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }),
    )
    glow.position.set(x, 2, z)
    glow.scale.set(16, 16, 1)
    glow.renderOrder = 5
    board.add(glow)
    const light = new THREE.PointLight(on, 0, 26, 1.4)
    light.position.set(x, 2.5, z)
    board.add(light)
    leds[name] = { lens, glow, light, on, off }
  })

  // Lớp vẽ trên cùng: dây dữ liệu, hạt dữ liệu, vòng chú ý (luôn nhìn thấy, không bị Core che).
  // Khi nhìn xuyên Core, cả lớp hạ xuống mặt Shield cho khớp với chip bên dưới.
  const overlay = <T extends THREE.Mesh | THREE.LineSegments>(m: T) => {
    const mat = m.material as THREE.Material
    mat.depthTest = false
    mat.transparent = true
    m.renderOrder = 10
    return m
  }
  const inCore = (px: number, py: number) => px >= CORE.x0 && px <= CORE.x1 && py >= CORE.y0 && py <= CORE.y1
  let seeThrough = false
  const heightAt = (px: number, py: number) => (seeThrough ? 1 : inCore(px, py) ? OVER : 1.2)
  const traceMats = {} as Record<TraceName, THREE.MeshBasicMaterial>
  for (const name of Object.keys(TRACES) as TraceName[])
    traceMats[name] = new THREE.MeshBasicMaterial({ color: COLOR.wire, transparent: true, opacity: 0.55 })
  const tracePaths = {} as Record<TraceName, THREE.CurvePath<THREE.Vector3>>
  const wireLayer = new THREE.Group()
  board.add(wireLayer)
  const UP = new THREE.Vector3(0, 1, 0)
  const segment = (a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material) => {
    const len = a.distanceTo(b)
    const m = overlay(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, len + 0.4, 8), mat))
    m.position.copy(a).add(b).multiplyScalar(0.5)
    m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize())
    return m
  }
  /** Điểm đi qua mép Core trên đoạn (a, b), nếu có. */
  const edgeCrossing = ([ax, ay]: [number, number], [bx, by]: [number, number]): [number, number] | null => {
    if (inCore(ax, ay) === inCore(bx, by)) return null
    for (let i = 1; i < 200; i++) {
      const t = i / 200
      const x = ax + (bx - ax) * t
      const y = ay + (by - ay) * t
      if (inCore(x, y) !== inCore(ax, ay)) return [x, y]
    }
    return null
  }
  const buildWires = () => {
    wireLayer.clear()
    for (const name of Object.keys(TRACES) as TraceName[]) {
      const pts: THREE.Vector3[] = []
      const push = (px: number, py: number, h: number) => {
        const [x, z] = W(px, py)
        pts.push(new THREE.Vector3(x, h, z))
      }
      const src = TRACES[name]
      src.forEach((p, i) => {
        if (i > 0) {
          const cross = edgeCrossing(src[i - 1], p)
          if (cross && !seeThrough) {
            push(cross[0], cross[1], heightAt(...src[i - 1]))
            push(cross[0], cross[1], heightAt(...p))
          }
        }
        push(p[0], p[1], heightAt(...p))
      })
      const path = new THREE.CurvePath<THREE.Vector3>()
      for (let i = 0; i < pts.length - 1; i++) {
        if (pts[i].distanceTo(pts[i + 1]) < 1e-3) continue
        path.add(new THREE.LineCurve3(pts[i], pts[i + 1]))
        wireLayer.add(segment(pts[i], pts[i + 1], traceMats[name]))
      }
      tracePaths[name] = path
    }
    for (const [px, py, w, h] of CHIPS) {
      const [x, z] = W(px, py)
      const box = overlay(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(w * S, h * S)),
          new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.8, gapSize: 0.5, opacity: 0.95 }),
        ),
      )
      box.computeLineDistances()
      box.rotation.x = -Math.PI / 2
      box.position.set(x, heightAt(px, py), z)
      wireLayer.add(box)
    }
    for (const name of Object.keys(RING) as PartName[]) {
      const [px, py] = AT[name]
      const [x, z] = W(px, py)
      rings[name].position.set(x, heightAt(px, py) + 0.1, z)
    }
    for (const b of badges) {
      b.at.y = heightAt(b.px, b.py) + 1
      if (b.under) b.el.hidden = !seeThrough
    }
    placeFocus()
  }
  const rings = {} as Record<PartName, THREE.Mesh>
  for (const name of Object.keys(RING) as PartName[]) {
    const ring = overlay(
      new THREE.Mesh(
        new THREE.RingGeometry(RING[name], RING[name] + 0.9, 40),
        new THREE.MeshBasicMaterial({ color: 0xf08a24, opacity: 0 }),
      ),
    )
    ring.rotation.x = -Math.PI / 2
    ring.visible = false
    board.add(ring)
    rings[name] = ring
  }

  const focusRing = overlay(
    new THREE.Mesh(new THREE.RingGeometry(3.6, 4.5, 40), new THREE.MeshBasicMaterial({ color: 0xf08a24, opacity: 0 })),
  )
  focusRing.rotation.x = -Math.PI / 2
  focusRing.visible = false
  board.add(focusRing)
  let focusAt: [number, number] | null = null
  const placeFocus = () => {
    focusRing.visible = focusAt !== null
    if (!focusAt) return
    const [x, z] = W(...focusAt)
    focusRing.position.set(x, heightAt(...focusAt) + 0.1, z)
  }

  const badges: { el: HTMLElement; at: THREE.Vector3; px: number; py: number; under?: boolean }[] = []
  buildWires()


  // --- linh kiện gắn ngoài (minh hoạ, đặt cạnh đúng cổng cắm; kích thước và khoảng cách không theo tỉ lệ) ---
  const propGroups = {} as Record<PropName, THREE.Group>
  const prop = (name: PropName) => {
    const g = new THREE.Group()
    g.visible = false
    board.add(g)
    propGroups[name] = g
    return g
  }
  const mat = (color: number) => new THREE.MeshLambertMaterial({ color })
  const boxAt = (g: THREE.Group, w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
    m.position.set(x, y, z)
    g.add(m)
    return m
  }
  /** Dây cắm (4 sợi màu) từ cổng trên mạch tới linh kiện, px ảnh. */
  const cable = (g: THREE.Group, from: [number, number], to: [number, number], colors = [0x222222, 0xd23c3c, 0xe8c547, 0x3c8de0]) => {
    const [ax, az] = W(...from)
    const [bx, bz] = W(...to)
    const dir = new THREE.Vector2(bx - ax, bz - az)
    const side = new THREE.Vector2(-dir.y, dir.x).normalize()
    colors.forEach((c, i) => {
      const o = (i - (colors.length - 1) / 2) * 0.9
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ax + side.x * o, 2.5, az + side.y * o),
        new THREE.Vector3((ax + bx) / 2 + side.x * o, 5, (az + bz) / 2 + side.y * o),
        new THREE.Vector3(bx + side.x * o, 2.5, bz + side.y * o),
      ])
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.35, 6), mat(c)))
    })
  }

  // OLED 0,96" cắm cổng I2C (cạnh phải).
  const oledGroup = prop('oled')
  // Phóng to ~1,6 lần so với module thật để đọc được chữ trên màn hình.
  const [ox, oz] = W(1440, 630)
  boxAt(oledGroup, 44, 1.6, 40, 0x1f4fa8, ox, 1.6, oz)
  boxAt(oledGroup, 39, 1.2, 22, 0x0a0d12, ox, 3, oz - 1)
  const oledCanvas = document.createElement('canvas')
  oledCanvas.width = 128
  oledCanvas.height = 64
  const oledCtx = oledCanvas.getContext('2d')!
  oledCtx.fillStyle = '#05070a'
  oledCtx.fillRect(0, 0, 128, 64)
  const oledTex = new THREE.CanvasTexture(oledCanvas)
  oledTex.magFilter = THREE.NearestFilter
  oledTex.minFilter = THREE.LinearFilter
  oledTex.colorSpace = THREE.SRGBColorSpace
  const oledScreen = new THREE.Mesh(new THREE.PlaneGeometry(37, 18.5), new THREE.MeshBasicMaterial({ map: oledTex }))
  oledScreen.rotation.x = -Math.PI / 2
  oledScreen.position.set(ox, 3.65, oz - 1)
  oledGroup.add(oledScreen)
  cable(oledGroup, [1150, 630], [1195, 630])

  // Servo SG90 cắm S1 (hàng chân trái): cần trắng quay quanh trục đứng.
  const servoGroup = prop('servo')
  const [sx, sz] = W(225, 420)
  boxAt(servoGroup, 23, 12, 12, 0x2b62c9, sx, 6, sz)
  boxAt(servoGroup, 32, 2, 12, 0x2b62c9, sx, 9, sz)
  const horn = new THREE.Group()
  horn.position.set(sx + 6, 14, sz)
  servoGroup.add(horn)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3, 20), mat(0xf4f4f4))
  horn.add(hub)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(18, 1.6, 4), mat(0xf4f4f4))
  arm.position.x = 8
  horn.add(arm)
  cable(servoGroup, [440, 420], [290, 420], [0x6b4a2b, 0xd23c3c, 0xf08a24])

  // Động cơ TT + bánh cắm M1 (cổng dưới bên trái).
  const motorGroup = prop('motor')
  const [mx, mz] = W(560, 1215)
  boxAt(motorGroup, 40, 18, 20, 0xf2c230, mx + 6, 9, mz)
  const wheel = new THREE.Group()
  wheel.position.set(mx - 22, 17, mz)
  motorGroup.add(wheel)
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 8, 32), mat(0x222222))
  tyre.rotation.z = Math.PI / 2
  wheel.add(tyre)
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(8.4, 26, 3), mat(i === 0 ? 0xf08a24 : 0xf2c230))
    spoke.rotation.x = (i * Math.PI) / 3
    wheel.add(spoke)
  }
  cable(motorGroup, [550, 990], [560, 1110], [0xd23c3c, 0x222222])

  // Cảm biến siêu âm HC-SR04P cắm cổng cảm biến (TRIG IO0, ECHO IO4), nhìn xuống phía dưới mạch.
  const sonarGroup = prop('sonar')
  const [ux, uz] = W(860, 1180)
  boxAt(sonarGroup, 45, 2, 20, 0x2d6fb8, ux, 8, uz)
  for (const dx of [-12, 12]) {
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 12, 24), mat(0xc9ced6))
    eye.rotation.x = Math.PI / 2
    eye.position.set(ux + dx, 10, uz + 6)
    sonarGroup.add(eye)
  }
  const SONAR_SCALE = 0.55
  const obstacle = boxAt(sonarGroup, 70, 34, 6, 0xb07a4f, ux, 17, uz + 40)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x5fb4ff, transparent: true, opacity: 0.18, depthWrite: false })
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), beamMat)
  beam.rotation.x = Math.PI / 2
  sonarGroup.add(beam)
  const placeObstacle = (cm: number) => {
    const d = Math.min(cm, 120) * SONAR_SCALE
    obstacle.position.z = uz + 12 + d + 3
    beam.position.set(ux, 10, uz + 12 + d / 2)
    beam.scale.set(4 + d * 0.25, Math.max(0.1, d), 4 + d * 0.25)
  }
  placeObstacle(40)
  cable(sonarGroup, [855, 990], [860, 1165])

  // --- tương tác ---------------------------------------------------------------------------
  const pointer = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  let switchCb: (pressed: boolean) => void = () => {}
  let holding = false
  const canvas = renderer.domElement
  const hitsSwitch = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    return raycaster.intersectObject(swHit, false).length > 0
  }
  let wheelSpeed = 0
  let pickCb: ((px: number, py: number) => void) | null = null
  const local = new THREE.Vector3()
  canvas.addEventListener('pointerdown', (e) => {
    if (!hitsSwitch(e)) {
      if (!pickCb) return
      // Mặt mạch thật, không tính lớp vẽ đè (dây, vòng) và khối bấm vô hình của nút SW.
      const hit = raycaster
        .intersectObjects(board.children, true)
        .find((h) => {
          const mat = (h.object as THREE.Mesh).material as THREE.Material
          // Khi nhìn xuyên Core, bỏ qua tấm Core trong suốt để chọn được chip bên dưới.
          return h.object.renderOrder !== 10 && mat.visible && !(seeThrough && mat.opacity < 0.5)
        })
      const point = hit?.point ?? raycaster.ray.intersectPlane(new THREE.Plane(UP, 0), local)
      if (point) {
        board.worldToLocal(local.copy(point))
        pickCb(local.x / S + CX, local.z / S + CY)
      }
      return
    }
    holding = true
    canvas.setPointerCapture(e.pointerId)
    switchCb(true)
  })
  canvas.addEventListener('pointermove', (e) => {
    canvas.style.cursor = hitsSwitch(e) ? 'pointer' : 'default'
  })
  const release = () => {
    if (!holding) return
    holding = false
    switchCb(false)
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)

  // --- camera: khớp khung bao của mạch ------------------------------------------------------
  const [bx0, bz0] = W(TX0, TY0)
  const [bx1, bz1] = W(TX0 + TW, TY0 + TH)
  let corners: THREE.Vector3[] = []
  const box = new THREE.Box3()
  const fitBounds = () => {
    box.set(new THREE.Vector3(bx0, -2, bz0), new THREE.Vector3(bx1, 12, bz1))
    for (const g of Object.values(propGroups)) if (g.visible) box.expandByObject(g)
    const { min, max } = box
    corners = [min.x, max.x].flatMap((x) => [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => new THREE.Vector3(x, y, z))))
  }
  fitBounds()
  const tmp = new THREE.Vector3()
  const fit = () => {
    const { clientWidth: w, clientHeight: h } = container
    renderer.setSize(w, h, false)
    camera.updateMatrixWorld()
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    for (const c of corners) {
      tmp.copy(c).applyMatrix4(camera.matrixWorldInverse)
      minX = Math.min(minX, tmp.x)
      maxX = Math.max(maxX, tmp.x)
      minY = Math.min(minY, tmp.y)
      maxY = Math.max(maxY, tmp.y)
    }
    const pad = 22
    const upp = Math.max((maxX - minX) / Math.max(40, w - pad * 2), (maxY - minY) / Math.max(40, h - pad * 2)) / view.zoom
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    camera.left = cx - (w / 2) * upp
    camera.right = cx + (w / 2) * upp
    camera.top = cy + (h / 2) * upp
    camera.bottom = cy - (h / 2) * upp
    camera.updateProjectionMatrix()
  }

  // --- vòng vẽ ------------------------------------------------------------------------------
  const pulses: Pulse[] = []
  const pulseGeo = new THREE.SphereGeometry(0.9, 14, 10)
  const projected = new THREE.Vector3()
  let last = performance.now()
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const dist = 200
    camera.position.set(
      Math.sin(view.azimuth) * Math.cos(view.elevation) * dist,
      Math.sin(view.elevation) * dist,
      Math.cos(view.azimuth) * Math.cos(view.elevation) * dist,
    )
    camera.lookAt(0, 0, 0)
    fit()

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]
      p.t += dt * 1.6
      if (p.t >= 1) {
        board.remove(p.mesh)
        pulses.splice(i, 1)
        continue
      }
      p.mesh.position.copy(tracePaths[p.trace].getPointAt(p.t))
    }
    wheel.rotation.x += wheelSpeed * dt * 9
    const beat = 0.5 + 0.5 * Math.sin(now / 260)
    for (const ring of [...Object.values(rings), focusRing]) {
      if (!ring.visible) continue
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.6 * beat
      ring.scale.setScalar(1 + 0.15 * beat)
    }

    renderer.render(scene, camera)

    const { clientWidth: w, clientHeight: h } = container
    for (const b of badges) {
      projected.copy(b.at).project(camera)
      b.el.style.transform = `translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px)`
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  return {
    setSwitch(pressed) {
      knob.position.x = pressed ? -1.6 : 0
    },
    setLed(name, level) {
      const led = leds[name]
      const l = THREE.MathUtils.clamp(level, 0, 1)
      led.lens.color.setHex(l > 0 ? led.on : led.off)
      led.lens.emissive.setHex(l > 0 ? led.on : 0x000000)
      led.lens.emissiveIntensity = l
      ;(led.glow.material as THREE.SpriteMaterial).opacity = l > 0 ? 0.35 + 0.65 * l : 0
      led.light.intensity = l * 260
    },
    pulse(trace, color) {
      if (pulses.length > 24) return
      const mesh = overlay(new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color })))
      board.add(mesh)
      pulses.push({ trace, mesh, t: 0 })
    },
    setTrace(trace, color) {
      traceMats[trace].color.set(color ?? COLOR.wire)
      traceMats[trace].opacity = color ? 1 : 0.5
    },
    highlight(parts) {
      for (const [name, ring] of Object.entries(rings)) ring.visible = parts.includes(name as PartName)
    },
    setSeeThrough(on) {
      seeThrough = on
      buildWires()
      const o = on ? 0.15 : 1
      coreSideMat.opacity = o
      ;(coreTop.material as THREE.MeshLambertMaterial).opacity = o
      coreSideMat.depthWrite = !on
      ;(coreTop.material as THREE.MeshLambertMaterial).depthWrite = !on
    },
    addBadge(name, html) {
      const el = document.createElement('div')
      el.className = 'badge'
      el.innerHTML = html
      badgeLayer.appendChild(el)
      const [px, py] = BADGE_AT[name]
      const [x, z] = W(px, py)
      badges.push({ el, at: new THREE.Vector3(x, heightAt(px, py) + 1, z), px, py })
      return el
    },
    clearBadges() {
      for (const b of badges) b.el.remove()
      badges.length = 0
    },
    addHotspot(px, py, html, onClick, under) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'badge hot'
      el.innerHTML = html
      el.addEventListener('click', onClick)
      badgeLayer.appendChild(el)
      const [x, z] = W(px, py)
      badges.push({ el, at: new THREE.Vector3(x, heightAt(px, py) + 1, z), px, py, under })
      if (under) el.hidden = !seeThrough
      return el
    },
    setProps(names) {
      for (const [name, g] of Object.entries(propGroups)) g.visible = names.includes(name as PropName)
      fitBounds()
    },
    setOled(f) {
      oledCtx.fillStyle = '#05070a'
      oledCtx.fillRect(0, 0, 128, 64)
      if (f) {
        const img = oledCtx.getImageData(0, 0, 128, 64)
        for (let y = 0; y < Math.min(64, f.height); y++)
          for (let x = 0; x < Math.min(128, f.width); x++) {
            if (!((f.frame[(y >> 3) * f.width + x] >> (y & 7)) & 1)) continue
            const i = (y * 128 + x) * 4
            img.data[i] = 150
            img.data[i + 1] = 225
            img.data[i + 2] = 255
          }
        oledCtx.putImageData(img, 0, 0)
      }
      oledTex.needsUpdate = true
    },
    setServo(deg) {
      // 0° hướng sang phải (+x), 180° sang trái, quay ngược chiều kim đồng hồ khi nhìn từ trên.
      horn.rotation.y = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(deg, 0, 180))
    },
    setWheel(speed) {
      wheelSpeed = THREE.MathUtils.clamp(speed, -1, 1)
    },
    setObstacle(cm) {
      placeObstacle(cm)
    },
    showWires(on) {
      wireLayer.visible = on
    },
    mark(at) {
      focusAt = at
      placeFocus()
    },
    onPick(cb) {
      pickCb = cb
    },
    onSwitch(cb) {
      switchCb = cb
    },
    zoom(factor) {
      view.zoom = THREE.MathUtils.clamp(view.zoom * factor, 0.7, 3)
    },
    reset() {
      view.zoom = 1
    },
  }
}
