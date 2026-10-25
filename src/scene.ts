/**
 * Cảnh 3D mạch ThingBot, dựng hoàn toàn bằng code (không file mô hình): khối hộp, trụ, viền đen, camera
 * nhìn chéo. Bố cục cổng là TẠM — chờ phần cứng gửi toạ độ đo từ STEP (spec v0.2, mục 3.2, 9).
 *
 * Ngoài linh kiện, cảnh có các **đường mạch** nối nút → ESP32-C3 → PCA9685 → L1. Mỗi khi bộ mô phỏng báo
 * có đọc/ghi, một "hạt dữ liệu" chạy dọc đường mạch đó: đây là phần "dòng chảy dữ liệu" của bài.
 */
import * as THREE from 'three'

export type TraceName = 'io3' | 'sda' | 'scl' | 'ch15'

export interface Tag {
  el: HTMLElement
  anchor: THREE.Vector3
}

export interface SceneApi {
  setSwitch(pressed: boolean): void
  /** Độ sáng đèn, 0..1. */
  setLed(name: 'L1' | 'L2', level: number): void
  /** Một hạt dữ liệu chạy dọc đường mạch. */
  pulse(trace: TraceName, color: string, reverse?: boolean): void
  /** Tô màu đường mạch theo mức tín hiệu (null = không có tín hiệu). */
  setTrace(trace: TraceName, color: string | null): void
  /** Gắn một nhãn HTML vào một điểm của cảnh; trả về phần tử để cập nhật nội dung. */
  addTag(className: string, at: THREE.Vector3Tuple): HTMLElement
  anchors: Record<string, THREE.Vector3Tuple>
  onSwitch(cb: (pressed: boolean) => void): void
  rotate(step: number): void
  zoom(factor: number): void
  reset(): void
  /** Phần cảnh bị thẻ che (px): mạch được canh giữa vùng còn lại. */
  setInset(inset: { top: number; right: number; bottom: number; left: number }): void
}

const PCB_TOP = 0.8
const COLORS = {
  pcb: 0x1f6f8b,
  pcbEdge: 0x14485a,
  mask: 0x2a86a6,
  module: 0x1d2b36,
  shield: 0xc9cfd6,
  chip: 0x22252b,
  pin: 0xb8bcc4,
  connector: 0xf1ece0,
  header: 0x2b2b2b,
  copper: 0xd6a65a,
  outline: 0x1b1f24,
  capRed: 0xe2473b,
  ledOff: 0x7a2a26,
  ledOn: 0xff4a3a,
}

function outlined(geometry: THREE.BufferGeometry, color: number, opts: { outline?: boolean } = {}): THREE.Group {
  const group = new THREE.Group()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }))
  group.add(mesh)
  if (opts.outline !== false) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 30),
      new THREE.LineBasicMaterial({ color: COLORS.outline }),
    )
    group.add(edges)
  }
  return group
}

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, outline = true) {
  const g = outlined(new THREE.BoxGeometry(w, h, d), color, { outline })
  g.position.set(x, y + h / 2, z)
  return g
}

/** Hàng chân cắm (header) n chân theo trục x. */
function headerRow(n: number, x: number, z: number, color = COLORS.header): THREE.Group {
  const g = new THREE.Group()
  g.add(box(n * 2.54, 2.5, 2.54, color, x + (n * 2.54) / 2 - 1.27, PCB_TOP, z))
  for (let i = 0; i < n; i++) g.add(box(0.64, 6, 0.64, COLORS.pin, x + i * 2.54, PCB_TOP + 2.5, z, false))
  return g
}

/** Các đoạn thẳng (x, z) của mỗi đường mạch, từ nguồn đến đích. */
const TRACES: Record<TraceName, [number, number][]> = {
  io3: [
    [34.5, 6],
    [22, 6],
    [22, 3.5],
    [1.5, 3.5],
  ],
  sda: [
    [1.5, -4],
    [7.5, -4],
    [7.5, -8.5],
    [10.6, -8.5],
  ],
  scl: [
    [1.5, -7],
    [5.5, -7],
    [5.5, -11.5],
    [10.6, -11.5],
  ],
  ch15: [
    [17.4, -10],
    [28, -10],
    [28, 18],
    [35.8, 18],
  ],
}

interface Pulse {
  trace: TraceName
  mesh: THREE.Mesh
  t: number
  reverse: boolean
}

export function createScene(container: HTMLElement, tagLayer: HTMLElement): SceneApi {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cdb8, 2.2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(-40, 80, 50)
  scene.add(sun)

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000)
  const view = { azimuth: Math.PI / 4.6, elevation: 0.62, zoom: 1 }
  let inset = { top: 0, right: 0, bottom: 0, left: 0 }

  // --- bo mạch -------------------------------------------------------------------------------
  const board = new THREE.Group()
  scene.add(board)

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 70),
    new THREE.MeshBasicMaterial({ color: 0x8a7a5c, transparent: true, opacity: 0.18 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(3, -0.4, 4)
  board.add(shadow)

  const pcbShape = new THREE.Shape()
  const W = 92,
    D = 62,
    R = 4
  pcbShape.moveTo(-W / 2 + R, -D / 2)
  pcbShape.lineTo(W / 2 - R, -D / 2)
  pcbShape.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + R)
  pcbShape.lineTo(W / 2, D / 2 - R)
  pcbShape.quadraticCurveTo(W / 2, D / 2, W / 2 - R, D / 2)
  pcbShape.lineTo(-W / 2 + R, D / 2)
  pcbShape.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - R)
  pcbShape.lineTo(-W / 2, -D / 2 + R)
  pcbShape.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + R, -D / 2)
  const holes: [number, number][] = [
    [-W / 2 + 4, -D / 2 + 4],
    [W / 2 - 4, -D / 2 + 4],
    [-W / 2 + 4, D / 2 - 4],
    [W / 2 - 4, D / 2 - 4],
  ]
  for (const [hx, hz] of holes) {
    const h = new THREE.Path()
    h.absarc(hx, hz, 1.6, 0, Math.PI * 2, true)
    pcbShape.holes.push(h)
  }
  const pcbGeo = new THREE.ExtrudeGeometry(pcbShape, { depth: 1.6, bevelEnabled: false, curveSegments: 6 })
  pcbGeo.rotateX(Math.PI / 2)
  pcbGeo.translate(0, PCB_TOP, 0)
  const pcb = outlined(pcbGeo, COLORS.pcb)
  board.add(pcb)

  // Core ESP32-C3: mạch con + vỏ kim loại
  board.add(box(28, 1.6, 22, COLORS.module, -13, PCB_TOP, 0))
  board.add(box(18, 2.6, 13, COLORS.shield, -15, PCB_TOP + 1.6, -1))
  board.add(box(5, 0.6, 9, 0x111111, -2.5, PCB_TOP + 1.6, 4)) // anten
  // PCA9685
  const pca = box(6.4, 1.3, 4.6, COLORS.chip, 14, PCB_TOP, -10)
  board.add(pca)
  for (let i = 0; i < 6; i++) {
    board.add(box(0.5, 0.4, 1.2, COLORS.pin, 11.6 + i * 0.96, PCB_TOP, -12.8, false))
    board.add(box(0.5, 0.4, 1.2, COLORS.pin, 11.6 + i * 0.96, PCB_TOP, -7.2, false))
  }
  // Cổng motor M1..M4 (JST trắng) dọc mép trên, nguồn + công tắc mép trái
  ;[
    [-30, -27],
    [-16, -27],
    [26, -27],
    [38, -27],
  ].forEach(([x, z]) => board.add(box(8, 6, 5.5, COLORS.connector, x, PCB_TOP, z)))
  board.add(box(9, 7, 11, 0x1a1a1a, -40.5, PCB_TOP, 12))
  board.add(box(6, 4, 4, 0x3a3a3a, -40, PCB_TOP, 24))
  // header servo S1..S5 (3 chân) mép dưới, PS2 (6 chân), I2C (4 chân)
  for (let i = 0; i < 5; i++) {
    for (let r = 0; r < 3; r++) board.add(headerRow(1, -32 + i * 6, 19 + r * 2.54))
  }
  board.add(headerRow(6, -4, 27.5))
  board.add(headerRow(4, 12, 27.5, 0x30406a))

  // Đường mạch (vẽ dưới linh kiện tương tác)
  const traceMats: Record<TraceName, THREE.MeshBasicMaterial> = {} as never
  const tracePaths: Record<TraceName, THREE.CurvePath<THREE.Vector3>> = {} as never
  for (const name of Object.keys(TRACES) as TraceName[]) {
    const pts = TRACES[name]
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.copper })
    traceMats[name] = mat
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i]
      const [x2, z2] = pts[i + 1]
      const a = new THREE.Vector3(x1, PCB_TOP + 0.05, z1)
      const b = new THREE.Vector3(x2, PCB_TOP + 0.05, z2)
      path.add(new THREE.LineCurve3(a, b))
      const len = a.distanceTo(b)
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.12, 1), mat)
      seg.position.copy(a).add(b).multiplyScalar(0.5)
      seg.rotation.y = -Math.atan2(z2 - z1, x2 - x1)
      board.add(seg)
    }
    for (const [x, z] of [pts[0], pts[pts.length - 1]]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.14, 16), mat)
      pad.position.set(x, PCB_TOP + 0.06, z)
      board.add(pad)
    }
    tracePaths[name] = path
  }

  // Nút SW
  const sw = new THREE.Group()
  sw.add(box(8, 3.4, 8, 0x262626, 0, 0, 0))
  const cap = new THREE.Group()
  const capMesh = outlined(new THREE.CylinderGeometry(2.7, 2.7, 2.2, 28), COLORS.capRed)
  capMesh.position.y = 1.1
  cap.add(capMesh)
  cap.position.y = 3.4
  sw.add(cap)
  for (const [px, pz] of [
    [-3.3, -3.3],
    [3.3, -3.3],
    [-3.3, 3.3],
    [3.3, 3.3],
  ])
    sw.add(box(0.9, 0.6, 0.9, COLORS.pin, px, 0, pz, false))
  sw.position.set(38, PCB_TOP, 6)
  board.add(sw)

  // Đèn L1, L2
  const leds: Record<'L1' | 'L2', { lens: THREE.MeshLambertMaterial; halo: THREE.Sprite; light: THREE.PointLight }> =
    {} as never
  const haloTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(255,120,90,1)')
    grd.addColorStop(0.35, 'rgba(255,80,60,0.5)')
    grd.addColorStop(1, 'rgba(255,60,40,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  })()
  ;(
    [
      ['L1', 18],
      ['L2', 24],
    ] as const
  ).forEach(([name, z]) => {
    board.add(box(3.2, 0.5, 2, 0xf4f1ea, 38, PCB_TOP, z))
    const lensMat = new THREE.MeshLambertMaterial({ color: COLORS.ledOff, emissive: 0x000000 })
    const lens = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.6), lensMat)
    lens.position.set(38, PCB_TOP + 1.05, z)
    board.add(lens)
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0 }),
    )
    halo.position.set(38, PCB_TOP + 2, z)
    halo.scale.set(16, 16, 1)
    board.add(halo)
    const light = new THREE.PointLight(0xff5a40, 0, 30, 1.6)
    light.position.set(38, PCB_TOP + 4, z)
    board.add(light)
    leds[name] = { lens: lensMat, halo, light }
  })

  // --- nhãn HTML -----------------------------------------------------------------------------
  const tags: Tag[] = []
  const anchors: Record<string, THREE.Vector3Tuple> = {
    core: [-15, 9, -1],
    pca: [14, 6, -10],
    sw: [38, 11, 6],
    l1: [38, 7, 18],
    io3: [16, 1, 3.5],
    i2c: [4, 1, -16],
    ch15: [30, 1, -12],
  }

  // --- tương tác & camera --------------------------------------------------------------------
  const pointer = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  let switchCb: (pressed: boolean) => void = () => {}
  let holding = false
  let dragging: { x: number; az: number } | null = null

  const hitsSwitch = (e: PointerEvent): boolean => {
    const r = renderer.domElement.getBoundingClientRect()
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    return raycaster.intersectObject(sw, true).length > 0
  }
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (hitsSwitch(e)) {
      holding = true
      switchCb(true)
    } else dragging = { x: e.clientX, az: view.azimuth }
    renderer.domElement.setPointerCapture(e.pointerId)
  })
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (dragging) {
      view.azimuth = dragging.az - (e.clientX - dragging.x) * 0.008
      return
    }
    renderer.domElement.style.cursor = hitsSwitch(e) ? 'pointer' : 'grab'
  })
  const release = () => {
    dragging = null
    if (holding) {
      holding = false
      switchCb(false)
    }
  }
  renderer.domElement.addEventListener('pointerup', release)
  renderer.domElement.addEventListener('pointercancel', release)
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      view.zoom = THREE.MathUtils.clamp(view.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.6, 3)
    },
    { passive: false },
  )

  // Khung bao của mạch (kể cả linh kiện cao nhất), để khớp camera ở mọi cỡ màn hình và mọi góc xoay.
  // Bài 3 chỉ cần phần từ Core sang nút/đèn: khớp camera vào vùng đó (cổng nguồn bên trái bị cắt bớt).
  const corners = [-32, 47].flatMap((x) =>
    [-1, 9].flatMap((y) => [-31, 31].map((z) => new THREE.Vector3(x, y, z))),
  )
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
    const fw = Math.max(80, w - inset.left - inset.right)
    const fh = Math.max(80, h - inset.top - inset.bottom)
    const upp = (Math.max((maxX - minX) / fw, (maxY - minY) / fh) * 1.06) / view.zoom
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const fcx = inset.left + fw / 2
    const fcy = inset.top + fh / 2
    camera.left = cx - fcx * upp
    camera.right = cx + (w - fcx) * upp
    camera.top = cy + fcy * upp
    camera.bottom = cy - (h - fcy) * upp
    camera.updateProjectionMatrix()
  }

  // --- hạt dữ liệu ---------------------------------------------------------------------------
  const pulses: Pulse[] = []
  const pulseGeo = new THREE.SphereGeometry(1.05, 14, 10)
  const PULSE_SPEED = 2.2 // đoạn mạch / giây

  // --- vòng vẽ --------------------------------------------------------------------------------
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
      p.t += dt * PULSE_SPEED
      if (p.t >= 1) {
        board.remove(p.mesh)
        pulses.splice(i, 1)
        continue
      }
      const u = p.reverse ? 1 - p.t : p.t
      p.mesh.position.copy(tracePaths[p.trace].getPointAt(u))
      p.mesh.position.y += 0.9
    }

    renderer.render(scene, camera)

    const { clientWidth: w, clientHeight: h } = container
    // Đặt nhãn theo thứ tự từ trên xuống; nhãn nào đè lên nhãn đã đặt thì đẩy xuống dưới nó.
    const placed: { x1: number; x2: number; y1: number; y2: number }[] = []
    const order = tags
      .map((tag) => {
        projected.copy(tag.anchor).project(camera)
        return { tag, x: ((projected.x + 1) / 2) * w, y: ((1 - projected.y) / 2) * h }
      })
      .sort((p, q) => p.y - q.y)
    for (const { tag, x, y: y0 } of order) {
      if (tag.el.offsetParent === null) continue
      const tw = tag.el.offsetWidth
      const th = tag.el.offsetHeight
      let y = y0
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find((r) => x - tw / 2 < r.x2 && x + tw / 2 > r.x1 && y - th / 2 < r.y2 && y + th / 2 > r.y1)
        if (!hit) break
        y = hit.y2 + th / 2 + 2
      }
      placed.push({ x1: x - tw / 2, x2: x + tw / 2, y1: y - th / 2, y2: y + th / 2 })
      tag.el.style.transform = `translate(${x}px, ${y}px)`
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  return {
    anchors,
    setSwitch(pressed) {
      cap.position.y = pressed ? 2.4 : 3.4
    },
    setLed(name, level) {
      const led = leds[name]
      const l = THREE.MathUtils.clamp(level, 0, 1)
      led.lens.color.setHex(l > 0 ? COLORS.ledOn : COLORS.ledOff)
      led.lens.emissive.setRGB(l * 0.9, l * 0.25, l * 0.15)
      ;(led.halo.material as THREE.SpriteMaterial).opacity = l > 0 ? 0.25 + 0.75 * l : 0
      led.light.intensity = l * 400
    },
    pulse(trace, color, reverse = false) {
      if (pulses.length > 24) return
      const mesh = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color }))
      board.add(mesh)
      pulses.push({ trace, mesh, t: 0, reverse })
    },
    setTrace(trace, color) {
      traceMats[trace].color.set(color ?? COLORS.copper)
    },
    addTag(className, at) {
      const el = document.createElement('div')
      el.className = `tag ${className}`
      tagLayer.appendChild(el)
      tags.push({ el, anchor: new THREE.Vector3(...at) })
      return el
    },
    onSwitch(cb) {
      switchCb = cb
    },
    rotate(step) {
      view.azimuth += step
    },
    zoom(factor) {
      view.zoom = THREE.MathUtils.clamp(view.zoom * factor, 0.6, 3)
    },
    reset() {
      view.azimuth = Math.PI / 4.6
      view.zoom = 1
    },
    setInset(value) {
      inset = value
    },
  }
}
