/**
 * Cảnh 3D mạch ThingBot, dựng bằng code theo đúng bố cục mạch phẳng của bảng Simulator trong ThingBlock
 * (`scratch-gui/src/components/sim-panel/thingbot-board.jsx`, toạ độ 210 × 240): Shield xanh lá, Core ở
 * giữa (ESP32-C3 và PCA9685 nằm trên Core), M3 · jack · ON/OFF · M4 ở mép trên, cột chân servo S1–S5 bên
 * trái, PS2 · I2C · nút SW bên phải, M2 · IO0 · IO4 · M1 ở mép dưới, L1 góc dưới phải, L2 dưới S1.
 *
 * Chữ in trên mạch vẽ vào texture; linh kiện nổi là khối hộp có viền. Đường "dây dữ liệu" nối
 * SW → ESP32-C3 → PCA9685 → L1 là phần dạy học, không phải đường mạch thật.
 */
import * as THREE from 'three'

export type TraceName = 'io3' | 'sda' | 'scl' | 'ch15'
export type PartName = 'sw' | 'esp' | 'pca' | 'l1'

export interface SceneApi {
  setSwitch(pressed: boolean): void
  /** Độ sáng đèn, 0..1. */
  setLed(name: 'L1' | 'L2', level: number): void
  pulse(trace: TraceName, color: string): void
  setTrace(trace: TraceName, color: string | null): void
  /** Vòng sáng nhấp nháy quanh những linh kiện cần chú ý. */
  highlight(parts: PartName[]): void
  /** Gắn một phần tử HTML vào một linh kiện; trả về phần tử đó. */
  addBadge(part: PartName, html: string): HTMLElement
  onSwitch(cb: (pressed: boolean) => void): void
  zoom(factor: number): void
  reset(): void
}

/** Toạ độ mạch phẳng của ThingBlock (đơn vị SVG) → cảnh. */
const K = 0.3
const P = (sx: number, sy: number): [number, number] => [(sx - 105) * K, (sy - 120) * K]
const BOARD_W = 210
const BOARD_H = 240
const CORE_TOP = 2

const C = {
  pcbEdge: 0x0f5b31,
  coreEdge: 0x147a42,
  socket: 0xf3f2ec,
  socketDark: 0x2a2d31,
  jack: 0x26292d,
  metal: 0xcfd4da,
  chip: 0x1d1f23,
  pin: 0xc9a447,
  outline: 0x16241b,
  wire: 0x9fb8a6,
}

function part(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], outline = true) {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(geometry, material))
  if (outline) {
    g.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 30),
        new THREE.LineBasicMaterial({ color: C.outline, transparent: true, opacity: 0.7 }),
      ),
    )
  }
  return g
}

/** Hộp đặt theo hình chữ nhật (x, y, w, h) của mạch phẳng, đáy ở độ cao `base`. */
function slab(x: number, y: number, w: number, h: number, height: number, color: number, base = 0, outline = true) {
  const [cx, cz] = P(x + w / 2, y + h / 2)
  const g = part(new THREE.BoxGeometry(w * K, height, h * K), new THREE.MeshLambertMaterial({ color }), outline)
  g.position.set(cx, base + height / 2, cz)
  return g
}

const FONT = '"Be Vietnam Pro", system-ui, sans-serif'

/** Mặt in của Shield, vẽ như ThingBlock vẽ trong SVG. */
function shieldTexture(): THREE.CanvasTexture {
  const S = 6
  const c = document.createElement('canvas')
  c.width = BOARD_W * S
  c.height = BOARD_H * S
  const g = c.getContext('2d')!
  g.scale(S, S)
  g.fillStyle = '#1c8a4a'
  g.beginPath()
  g.roundRect(0, 0, BOARD_W, BOARD_H, 24)
  g.fill()
  for (const [x, y] of [
    [11, 22],
    [199, 22],
    [11, 190],
    [199, 190],
  ]) {
    g.beginPath()
    g.arc(x, y, 4, 0, Math.PI * 2)
    g.fillStyle = '#ffffff'
    g.fill()
    g.lineWidth = 2.5
    g.strokeStyle = '#d7b25a'
    g.stroke()
  }
  g.fillStyle = '#eef6ef'
  const silk = (t: string, x: number, y: number, size = 7, align: CanvasTextAlign = 'center') => {
    g.font = `600 ${size}px ${FONT}`
    g.textAlign = align
    g.fillText(t, x, y)
  }
  silk('M3', 37, 26)
  silk('ON ↔ OFF', 122, 25)
  silk('M4', 167, 26)
  for (let n = 1; n <= 5; n++) silk(`S${n}`, 18, 44 + (14 - (n - 1) * 3) * 10.5 + 2.5, 6, 'start')
  silk('PS2', 192, 42)
  silk('I2C', 192, 152)
  silk('SW', 196, 158)
  silk('L1', 186, 213)
  silk('L2', 29, 205, 6, 'start')
  for (const [t, x] of [
    ['M2', 45],
    ['IO0', 82],
    ['IO4', 128],
    ['M1', 165],
  ] as const)
    silk(t, x, 206, 6)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function coreTexture(): THREE.CanvasTexture {
  const S = 6
  const c = document.createElement('canvas')
  c.width = 140 * S
  c.height = 150 * S
  const g = c.getContext('2d')!
  g.scale(S, S)
  g.fillStyle = '#25a35f'
  g.fillRect(0, 0, 140, 150)
  g.fillStyle = '#eef6ef'
  g.font = `700 11px ${FONT}`
  g.fillText('ThingEdu', 50, 16)
  g.font = `600 6px ${FONT}`
  g.fillText('ESP32-C3 · PCA9685', 50, 25)
  g.textAlign = 'center'
  g.font = `700 9px ${FONT}`
  g.fillText('ThingBot Core', 70, 138)
  g.font = `600 5.5px ${FONT}`
  g.fillText('PCA9685', 112, 116)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Đường dây dữ liệu (toạ độ mạch phẳng), từ nguồn đến đích. */
const TRACES: Record<TraceName, [number, number][]> = {
  io3: [
    [196, 173],
    [56, 173],
    [56, 127],
  ],
  sda: [
    [75, 92],
    [133, 92],
    [133, 137],
  ],
  scl: [
    [75, 99],
    [139, 99],
    [139, 137],
  ],
  ch15: [
    [155, 145],
    [178, 145],
    [178, 200],
    [183, 200],
  ],
}

/** Điểm gắn nhãn số ①…④ của từng linh kiện (toạ độ mạch phẳng + độ cao). */
const PART_AT: Record<PartName, [number, number, number]> = {
  sw: [226, 160, 6],
  esp: [56, 72, 6],
  pca: [142, 128, 5],
  l1: [206, 218, 3],
}
/** Tâm vòng chú ý của từng linh kiện. */
const RING_AT: Record<PartName, [number, number, number]> = {
  sw: [205, 173, 5.4],
  esp: [56, 103, 6],
  pca: [142, 145, 3.8],
  l1: [186, 200, 4],
}

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
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c0, 2.4))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4)
  sun.position.set(-30, 90, 60)
  scene.add(sun)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000)
  const view = { azimuth: 0.12, elevation: 0.98, zoom: 1 }

  const board = new THREE.Group()
  scene.add(board)

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_W * K + 6, BOARD_H * K + 6),
    new THREE.MeshBasicMaterial({ color: 0x6f6448, transparent: true, opacity: 0.16 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(2, -1.7, 2.5)
  board.add(shadow)

  // Shield: thân mạch (bo góc) + mặt in
  const [x0, z0] = P(0, 0)
  const [x1, z1] = P(BOARD_W, BOARD_H)
  const r = 24 * K
  const s = new THREE.Shape()
  s.moveTo(x0 + r, z0)
  s.lineTo(x1 - r, z0)
  s.quadraticCurveTo(x1, z0, x1, z0 + r)
  s.lineTo(x1, z1 - r)
  s.quadraticCurveTo(x1, z1, x1 - r, z1)
  s.lineTo(x0 + r, z1)
  s.quadraticCurveTo(x0, z1, x0, z1 - r)
  s.lineTo(x0, z0 + r)
  s.quadraticCurveTo(x0, z0, x0 + r, z0)
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false, curveSegments: 8 })
  bodyGeo.rotateX(Math.PI / 2) // hình (x, y) nằm thành (x, z), đùn xuống dưới mặt y = 0
  board.add(part(bodyGeo, new THREE.MeshLambertMaterial({ color: C.pcbEdge })))
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD_W * K, BOARD_H * K),
    new THREE.MeshLambertMaterial({ map: shieldTexture(), transparent: true }),
  )
  top.rotation.x = -Math.PI / 2
  top.position.y = 0.01
  board.add(top)

  // Mép trên: M3 · jack · ON/OFF · M4
  board.add(slab(22, -8, 30, 18, 5, C.socket))
  board.add(slab(60, -6, 30, 34, 7, C.jack))
  board.add(slab(100, 3, 44, 13, 2.4, C.metal))
  board.add(slab(104, 5, 14, 9, 3.6, C.chip))
  board.add(slab(152, -8, 30, 18, 5, C.socket))
  // Cột chân servo S1–S5 (15 chân)
  board.add(slab(6.5, 39, 9, 157, 2.5, C.chip))
  for (let i = 0; i < 15; i++) board.add(slab(10, 43 + i * 10.5, 2, 2, 6, C.pin, 0, false))
  // Mép phải: PS2 · I2C; mép dưới: M2 · IO0 · IO4 · M1
  board.add(slab(184, 46, 16, 52, 5, C.socket))
  board.add(slab(184, 106, 16, 36, 5, C.socket))
  board.add(slab(32, 210, 26, 22, 5, C.socketDark))
  board.add(slab(60, 210, 44, 22, 5, C.socketDark))
  board.add(slab(106, 210, 44, 22, 5, C.socketDark))
  board.add(slab(152, 210, 26, 22, 5, C.socketDark))

  // ThingBot Core: mạch con, ESP32-C3 (vỏ kim loại), PCA9685, còi, cổng USB-C
  const edge = new THREE.MeshLambertMaterial({ color: C.coreEdge })
  const core = part(new THREE.BoxGeometry(140 * K, CORE_TOP, 150 * K), [
    edge,
    edge,
    new THREE.MeshLambertMaterial({ map: coreTexture() }),
    edge,
    edge,
    edge,
  ])
  const [ccx, ccz] = P(100, 119)
  core.position.set(ccx, CORE_TOP / 2, ccz)
  board.add(core)
  board.add(slab(38, 80, 36, 46, 1.8, C.metal, CORE_TOP))
  board.add(slab(130, 138, 24, 14, 1.0, C.chip, CORE_TOP))
  for (let i = 0; i < 6; i++) {
    board.add(slab(132 + i * 3.6, 136, 1.4, 2, 0.5, C.metal, CORE_TOP, false))
    board.add(slab(132 + i * 3.6, 152, 1.4, 2, 0.5, C.metal, CORE_TOP, false))
  }
  const buzzer = part(new THREE.CylinderGeometry(9 * K, 9 * K, 3, 28), new THREE.MeshLambertMaterial({ color: C.chip }))
  const [bzx, bzz] = P(112, 170)
  buzzer.position.set(bzx, CORE_TOP + 1.5, bzz)
  board.add(buzzer)
  board.add(slab(104, 188, 24, 8, 1.4, C.metal, CORE_TOP))

  // Dây dữ liệu (dạy học), nổi nhẹ trên mặt mạch
  const WIRE_Y = CORE_TOP + 0.6
  const traceMats = {} as Record<TraceName, THREE.MeshBasicMaterial>
  const tracePaths = {} as Record<TraceName, THREE.CurvePath<THREE.Vector3>>
  for (const name of Object.keys(TRACES) as TraceName[]) {
    const mat = new THREE.MeshBasicMaterial({ color: C.wire, transparent: true, opacity: 0.55 })
    traceMats[name] = mat
    const path = new THREE.CurvePath<THREE.Vector3>()
    const pts = TRACES[name].map(([sx, sy]) => {
      const [x, z] = P(sx, sy)
      return new THREE.Vector3(x, WIRE_Y, z)
    })
    for (let i = 0; i < pts.length - 1; i++) {
      path.add(new THREE.LineCurve3(pts[i], pts[i + 1]))
      const seg = new THREE.Mesh(new THREE.BoxGeometry(pts[i].distanceTo(pts[i + 1]) + 0.7, 0.25, 0.7), mat)
      seg.position.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5)
      seg.rotation.y = -Math.atan2(pts[i + 1].z - pts[i].z, pts[i + 1].x - pts[i].x)
      board.add(seg)
    }
    tracePaths[name] = path
  }

  // Nút SW: thân đen ở mép phải, núm nhô ra ngoài cạnh mạch
  board.add(slab(194, 162, 16, 22, 3.6, C.socketDark))
  const knob = slab(206, 166, 8, 14, 2.4, 0x111214, 0.6)
  board.add(knob)
  const knobRestX = knob.position.x
  // Vùng bấm rộng hơn núm, để ngón tay dễ trúng
  const swHit = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 12), new THREE.MeshBasicMaterial({ visible: false }))
  const [hx, hz] = P(205, 173)
  swHit.position.set(hx, 3, hz)
  board.add(swHit)

  // L1 (đỏ), L2 (xanh lá)
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
  const leds = {} as Record<'L1' | 'L2', { lens: THREE.MeshLambertMaterial; glow: THREE.Sprite; on: number; off: number }>
  ;(
    [
      ['L1', 186, 200, 0xff3b30, 0x7c2420],
      ['L2', 23, 203, 0x2fd158, 0x1d5a2c],
    ] as const
  ).forEach(([name, sx, sy, on, off]) => {
    const [x, z] = P(sx, sy)
    board.add(slab(sx - 5, sy - 3.5, 10, 7, 0.5, 0xf4f1ea, 0, false))
    const lens = new THREE.MeshLambertMaterial({ color: off })
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.5), lens)
    m.position.set(x, 1, z)
    board.add(m)
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTex, color: on, transparent: true, depthWrite: false, opacity: 0 }),
    )
    glow.position.set(x, 2.5, z)
    glow.scale.set(14, 14, 1)
    board.add(glow)
    leds[name] = { lens, glow, on, off }
  })

  // Vòng chú ý
  const rings = {} as Record<PartName, THREE.Mesh>
  for (const name of Object.keys(RING_AT) as PartName[]) {
    const [sx, sy, radius] = RING_AT[name]
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius, radius + 0.9, 40),
      new THREE.MeshBasicMaterial({ color: 0xf08a24, transparent: true, opacity: 0, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    const [x, z] = P(sx, sy)
    ring.position.set(x, CORE_TOP + 2.2, z)
    ring.visible = false
    board.add(ring)
    rings[name] = ring
  }

  const badges: { el: HTMLElement; at: THREE.Vector3 }[] = []

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
  canvas.addEventListener('pointerdown', (e) => {
    if (!hitsSwitch(e)) return
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

  // --- camera: khớp khung bao của mạch vào khung vẽ -----------------------------------------
  const corners = [-34, 35].flatMap((x) => [-2, 8].flatMap((y) => [-40, 40].map((z) => new THREE.Vector3(x, y, z))))
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
    const pad = 18
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
  const pulseGeo = new THREE.SphereGeometry(0.85, 14, 10)
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
      p.mesh.position.y += 0.4
    }
    const beat = 0.5 + 0.5 * Math.sin(now / 260)
    for (const ring of Object.values(rings)) {
      if (!ring.visible) continue
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.55 * beat
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
      knob.position.x = pressed ? knobRestX - 1.2 : knobRestX
    },
    setLed(name, level) {
      const led = leds[name]
      const l = THREE.MathUtils.clamp(level, 0, 1)
      led.lens.color.setHex(l > 0 ? led.on : led.off)
      led.lens.emissive.setHex(l > 0 ? led.on : 0x000000)
      led.lens.emissiveIntensity = l
      ;(led.glow.material as THREE.SpriteMaterial).opacity = l > 0 ? 0.3 + 0.7 * l : 0
    },
    pulse(trace, color) {
      if (pulses.length > 24) return
      const mesh = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color }))
      board.add(mesh)
      pulses.push({ trace, mesh, t: 0 })
    },
    setTrace(trace, color) {
      traceMats[trace].color.set(color ?? C.wire)
      traceMats[trace].opacity = color ? 1 : 0.55
    },
    highlight(parts) {
      for (const [name, ring] of Object.entries(rings)) ring.visible = parts.includes(name as PartName)
    },
    addBadge(name, html) {
      const el = document.createElement('div')
      el.className = 'badge'
      el.innerHTML = html
      badgeLayer.appendChild(el)
      const [sx, sy, y] = PART_AT[name]
      const [x, z] = P(sx, sy)
      badges.push({ el, at: new THREE.Vector3(x, y, z) })
      return el
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
