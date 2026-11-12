// Màn "Robot mẫu" (spec §6.7): 4 robot mẫu của mùa — hình 3D xoay chậm, kích thước, cổng M1–M4 / S1–S5 dùng làm gì
// (portMap), nút tay PS2 của chương trình TeleOp mẫu, vùng khối TeleOp chỉ xem, nút "Mở trong Xưởng".
// Phần thuần (portRows, controlRows, sizeText) chạy được trong Node (robots-gallery.test.ts); three và scratch-blocks
// chỉ nạp (import động) khi màn hiện ra. Rời màn ⇒ giải phóng WebGL (renderer, hình) và vùng khối.
import { localGripPoint, portMap, ROBOTS, type Actuator, type Drive, type RobotConfig, type RobotDef, type RobotType } from '../robots.ts'
import { sample, teleopButtons, type Ps2Button } from '../programs.ts'
import { injectCss as homeCss, robotStats } from './home.ts'
import { icon } from './icons.ts'

export type PortRow = { port: string; use: string }

const DRIVE_NAME: Record<Drive, string> = { diff2: '2 bánh', omni: '4 bánh omni', mecanum: '4 bánh mecanum' }
const WHEEL_NAME = { L: 'Bánh trái', R: 'Bánh phải', FL: 'Bánh trước trái', FR: 'Bánh trước phải', RL: 'Bánh sau trái', RR: 'Bánh sau phải' } as const
const PORT_ORDER = ['M1', 'M2', 'M3', 'M4', 'S1', 'S2', 'S3', 'S4', 'S5']
const KIND = { motor: 'động cơ TT', s360: 'servo 360' } as const

/** Cổng nào làm gì cho cấu hình `cfg`: bánh và cơ cấu theo `portMap`, servo cố định theo `ROBOTS[...].servos` + móc leo xà. */
export function portRows(cfg: RobotConfig): PortRow[] {
  const def = ROBOTS[cfg.type]
  const m = portMap(cfg)
  const rows: PortRow[] = []
  for (const [k, p] of Object.entries(m.wheels) as [keyof typeof WHEEL_NAME, string | undefined][]) if (p) rows.push({ port: p, use: WHEEL_NAME[k] })
  if (m.intake && def.mech.M3) rows.push({ port: m.intake, use: `${def.mech.M3} · ${KIND[m.intakeKind ?? 'motor']}` })
  if (m.lift && def.mech.M4) rows.push({ port: m.lift, use: `${def.mech.M4} · ${KIND[m.liftKind ?? 'motor']}` })
  for (const [s, what] of Object.entries(def.servos)) if (what) rows.push({ port: s, use: what })
  // Móc leo xà ở cổng ngoài `servos` (Xe Cắm Cờ: S4).
  if (!(def.hook.port in def.servos)) rows.push({ port: def.hook.port, use: 'Móc leo xà' })
  return rows.sort((a, b) => PORT_ORDER.indexOf(a.port) - PORT_ORDER.indexOf(b.port))
}

const BUTTON_NAME: Record<Ps2Button, string> = {
  TRIANGLE: 'Tam giác', CROSS: 'X', SQUARE: 'Vuông', CIRCLE: 'Tròn', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2',
}

/** Tay PS2 trong TeleOp mẫu: dòng đầu là cần lái theo đế, sau đó từng nút (lấy từ `teleopButtons`). */
export function controlRows(cfg: RobotConfig): (PortRow & { name: string })[] {
  const drive =
    cfg.drive === 'diff2'
      ? 'Cần trái lái bánh trái, cần phải lái bánh phải (đẩy lên là tiến)'
      : 'Cần trái: tiến lùi và đi ngang · cần phải: xoay tại chỗ'
  const rows: (PortRow & { name: string })[] = [{ port: 'sticks', name: 'Hai cần', use: drive }]
  for (const [b, use] of Object.entries(teleopButtons(cfg)) as [Ps2Button, string][]) rows.push({ port: b, name: BUTTON_NAME[b], use })
  return rows
}

const mm = (m: number) => Math.round(m * 1000)
export const sizeText = (def: RobotDef): string => `${mm(def.size.w)} × ${mm(def.size.l)} × ${mm(def.size.h)} mm (ngang × dài × cao)`

// ---------- Hình 3D xoay chậm (một canvas nhỏ riêng, giải phóng khi rời màn) ----------
interface Viewer {
  set(cfg: RobotConfig): void
  /** Bật / tắt chạy thử cơ cấu (tay, kẹp, thanh trượt, cửa xả, con lăn chạy lần lượt theo vòng). */
  demo(on: boolean): void
  dispose(): void
}

/** Tư thế cơ cấu lúc `t` giây khi chạy thử: chu kỳ 6 s — vươn / nâng, kẹp đóng mở, cửa xả, con lăn quay. */
export function demoPose(def: RobotDef, t: number): { extend: number; armFrac: number; grip: boolean; gate: boolean; intake: number } {
  const w = (Math.sin((t / 6) * Math.PI * 2 - Math.PI / 2) + 1) / 2
  return { extend: def.maxExtend * w, armFrac: w, grip: t % 3 < 1.5, gate: t % 6 > 3, intake: 1 }
}

let liveViewers = 0
/** Số canvas 3D của màn Robot mẫu đang sống (kiểm thử trình duyệt dò rò WebGL). */
export const viewerCount = () => liveViewers

async function createViewer(host: HTMLElement, cfg: RobotConfig): Promise<Viewer> {
  const THREE = await import('three')
  const { buildRobotModel } = await import('../view/robotModels.ts')
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  liveViewers++
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  host.append(renderer.domElement)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.8))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(0.6, 1.2, 0.8)
  scene.add(sun)
  const groundGeo = new THREE.CircleGeometry(0.26, 48)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a4466, roughness: 0.9 })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10)
  const pose = { extend: 0, armFrac: 0, grip: true, gate: false, intake: 0, fwd: 0, dyaw: 0, hasFlag: false, grip3: new THREE.Vector3() }
  let model: ReturnType<typeof buildRobotModel> | null = null
  let def = ROBOTS[cfg.type]
  let demoT: number | null = null
  const setPose = () => {
    Object.assign(pose, demoT === null ? { extend: 0, armFrac: 0, grip: true, gate: false, intake: 0 } : demoPose(def, demoT))
    const g = localGripPoint(def, pose.extend, pose.armFrac)
    pose.grip3.set(g.x, g.y, g.z)
    pose.hasFlag = def.flag && pose.grip
  }
  // Khung robot vừa khung hình: lùi camera theo cỡ robot (kể cả phần vươn tối đa) thay vì một khoảng cố định.
  const frame3 = () => {
    // Bán kính khối bao (xoay quanh trục đứng nên lấy cả đường chéo đáy) / tan(nửa góc nhìn), thêm lề.
    const rad = Math.hypot(def.size.w, def.size.l + 2 * def.maxExtend, def.size.h) / 2
    const d = (rad / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.3 // lề: gàu / tay nhô khỏi cỡ xuất phát
    camera.position.set(0.62, 0.5, 0.62).normalize().multiplyScalar(d)
    camera.lookAt(0, def.size.h * 0.45, 0)
  }
  const set = (c: RobotConfig) => {
    if (model) {
      scene.remove(model.group)
      model.dispose()
    }
    def = ROBOTS[c.type]
    model = buildRobotModel(c, 'red')
    setPose()
    model.update(pose)
    scene.add(model.group)
    frame3()
  }
  set(cfg)
  const fit = () => {
    const w = Math.max(1, host.clientWidth)
    const h = Math.max(1, host.clientHeight)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  fit()
  const ro = new ResizeObserver(fit)
  ro.observe(host)
  let last = performance.now()
  let raf = 0
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (model) {
      model.group.rotation.y += dt * (demoT === null ? 0.6 : 0.25)
      if (demoT !== null) {
        demoT += dt
        setPose()
        model.update(pose)
      }
    }
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  let alive = true
  return {
    set,
    demo(on) {
      demoT = on ? 0 : null
      setPose()
      model?.update(pose)
    },
    dispose() {
      if (!alive) return
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (model) model.dispose()
      groundGeo.dispose()
      groundMat.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      liveViewers--
    },
  }
}

// ---------- Vùng khối chỉ xem ----------
interface CodeView {
  load(state: object): void
  dispose(): void
}

/** Vùng khối scratch-blocks chỉ đọc (không hộp công cụ, không kéo sửa), cùng khối và màu của ThingBlock (src/blocks.ts). */
async function createCodeView(host: HTMLElement): Promise<CodeView> {
  const ScratchBlocks = await import('@scratch/scratch-blocks')
  const { registerThingBlocks } = await import('../../blocks.ts')
  const { blockColors } = await import('@thingblock/block-colors')
  ScratchBlocks.ScratchMsgs.setLocale('vi')
  registerThingBlocks()
  const ws = ScratchBlocks.inject(host, {
    readOnly: true,
    theme: new ScratchBlocks.Theme('thingblock-readonly', blockColors as never, undefined, {
      workspaceBackgroundColour: '#ffffff',
      flyoutBackgroundColour: '#f4f2ee',
      flyoutOpacity: 1,
      toolboxBackgroundColour: '#ffffff',
    }),
    media: `${import.meta.env.BASE_URL}media/`,
    zoom: { controls: true, wheel: false, startScale: 0.5 },
    move: { scrollbars: true, drag: true, wheel: true },
    grid: { spacing: 40, length: 2, colour: '#eee' },
    trashcan: false,
    sounds: false,
    comments: false,
    collapse: false,
  } as never)
  return {
    load(state) {
      ScratchBlocks.Events.disable()
      try {
        ws.clear()
        ScratchBlocks.serialization.workspaces.load(state, ws)
      } finally {
        ScratchBlocks.Events.enable()
      }
      ScratchBlocks.svgResize(ws)
      ws.scroll(0, 0)
    },
    dispose: () => ws.dispose(),
  }
}

// ---------- DOM ----------
const CSS = `
.rg-pick { display: flex; flex-wrap: wrap; gap: 10px; }
.rg-pick .pk-card { flex: 1 1 150px; max-width: 220px; }
.rg-pick .pk-card small { display: block; font-size: 11.5px; color: #aab3c7; margin-top: 2px; }
.rg-body { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr) minmax(0, 1.2fr); gap: 14px; align-items: start; }
.rg-box { background: #0b1230d9; border: 1px solid #fff2; border-radius: 14px; padding: 12px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.rg-box h2 { margin: 0; font-size: 18px; font-weight: 900; color: #ffcf5a; }
.rg-box h3 { margin: 4px 0 0; font-size: 13px; font-weight: 800; color: #c2cbea; text-transform: uppercase; letter-spacing: .5px; }
.rg-box p { margin: 0; font-size: 13px; line-height: 1.5; color: #e4e8f5; }
.rg-3d { position: relative; height: 300px; border-radius: 10px; background: radial-gradient(circle at 50% 40%, #2a3a78, #0b1230); overflow: hidden; }
.rg-demo { margin-top: 8px; }
.rg-demo button { padding: 7px 14px; font-size: 13.5px; }
.rg-demo button[aria-pressed="true"] { background: #f2a516; border-color: #f2a516; color: #221; }
.rg-3d canvas { display: block; width: 100% !important; height: 100% !important; }
.rg-box table { border-collapse: collapse; width: 100%; font-size: 13px; }
.rg-box td { padding: 4px 6px; border-top: 1px solid #fff1; color: #e4e8f5; vertical-align: top; line-height: 1.4; }
.rg-box td:first-child { font-weight: 900; color: #ffcf5a; white-space: nowrap; width: 1%; }
.rg-ws { height: 380px; border-radius: 10px; overflow: hidden; background: #fff; position: relative; }
.rg-fail { margin: 0; padding: 14px; font-size: 13.5px; line-height: 1.5; color: #ffcf5a; }
.rg-ws .rg-fail { color: #7a4b00; }
.rg-ws-note { font-size: 12px !important; color: #aab3c7 !important; }
@media (max-width: 1100px) { .rg-body { grid-template-columns: minmax(0, 300px) minmax(0, 1fr); } .rg-body .rg-code { grid-column: 1 / -1; } }
@media (max-width: 700px) { .rg-body { grid-template-columns: minmax(0, 1fr); } .rg-3d { height: 200px; } .rg-ws { height: 320px; } }
`

function injectCss(): void {
  homeCss()
  if (document.getElementById('rg-css')) return
  const s = document.createElement('style')
  s.id = 'rg-css'
  s.textContent = CSS
  document.head.append(s)
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const btn = (text: string, onClick: () => void, cls?: string): HTMLButtonElement => {
  const b = el('button', cls, text)
  b.type = 'button'
  b.onclick = onClick
  return b
}
const table = (rows: [string, string][]) => {
  const t = el('table')
  for (const [a, b] of rows) {
    const tr = el('tr')
    tr.append(el('td', undefined, a), el('td', undefined, b))
    t.append(tr)
  }
  return t
}
function segment<T extends string>(label: string, items: [T, string][], value: T, onPick: (v: T) => void, disabled = false): HTMLElement {
  const box = el('div', 'pk-row')
  const seg = el('span', 'pk-seg pk-row')
  for (const [v, text] of items) {
    const b = btn(text, () => onPick(v))
    b.setAttribute('aria-pressed', String(v === value))
    b.dataset.value = v
    b.disabled = disabled
    seg.append(b)
  }
  box.append(el('b', undefined, label), seg)
  return box
}

export interface RobotsGallery {
  readonly shown: boolean
  /** Hiện màn, chọn sẵn robot `cfg` (robot của em). */
  show(cfg: RobotConfig): void
  /** Ẩn màn và giải phóng canvas 3D + vùng khối. */
  hide(): void
  /** Robot đang xem. */
  readonly cfg: RobotConfig
}

export function createRobotsGallery(root: HTMLElement, o: { season: string; open(cfg: RobotConfig): void; home(): void }): RobotsGallery {
  injectCss()
  const box = el('section', 'hm')
  box.dataset.screen = 'robots'
  box.setAttribute('aria-label', 'Robot mẫu')
  box.hidden = true
  const inner = el('div', 'hm-in')
  box.append(inner)
  root.append(box)

  let cfg: RobotConfig = { type: 'maker', drive: 'diff2', actuator: 'tt' }
  let viewer: Viewer | null = null
  /** Đang chạy thử cơ cấu (giữ khi đổi robot / đế: robot mới chạy thử luôn). */
  let demoOn = false
  let code: CodeView | null = null
  /** Lần hiện màn: kết quả import động đến sau khi đã rời màn thì giải phóng ngay. */
  let token = 0
  const view3d = el('div', 'rg-3d')
  view3d.setAttribute('role', 'img')
  const wsHost = el('div', 'rg-ws')
  wsHost.setAttribute('aria-label', 'Chương trình TeleOp mẫu (chỉ xem)')

  const pick = (next: RobotConfig) => {
    // Vẽ lại thay nút: giữ tiêu điểm bàn phím ở đúng nút vừa bấm.
    const a = document.activeElement instanceof HTMLElement && box.contains(document.activeElement) ? document.activeElement.dataset : null
    cfg = next
    render()
    const again = a?.robot ? `.rg-pick [data-robot="${a.robot}"]` : a?.value ? `.pk-seg [data-value="${a.value}"]` : null
    if (again) box.querySelector<HTMLElement>(again)?.focus()
    viewer?.set(cfg)
    if (demoOn) viewer?.demo(true)
    code?.load(sample(cfg, 'teleop'))
  }

  const render = () => {
    const def = ROBOTS[cfg.type]
    const head = el('div', 'hm-brand')
    const h1 = el('h1')
    h1.append('ROBOT ', el('b', undefined, 'MẪU'))
    head.append(h1, el('div', 'hm-sub', `${o.season} · xoay xem robot, cổng nào làm gì, chương trình TeleOp mẫu. Chọn một robot rồi mở trong Xưởng để sửa.`))
    const back = btn('', o.home)
    back.append(icon('home', 18), 'Về màn chính')
    const topActs = el('div', 'pk-acts')
    topActs.append(back)
    const top = el('div', 'hm-top')
    top.append(head, topActs)

    const cards = el('div', 'rg-pick')
    cards.setAttribute('role', 'group')
    cards.setAttribute('aria-label', 'Chọn robot mẫu')
    for (const t of Object.keys(ROBOTS) as RobotType[]) {
      const d = ROBOTS[t]
      const c = btn('', () => pick({ type: t, drive: d.drives[0], actuator: cfg.actuator }), 'pk-card')
      c.dataset.robot = t
      c.setAttribute('aria-pressed', String(t === cfg.type))
      c.append(el('h4', undefined, d.name), el('small', undefined, `${d.drives.map((x) => DRIVE_NAME[x]).join(' · ')}`))
      cards.append(c)
    }

    // Cột 1: hình 3D + đế / cơ cấu.
    const st = robotStats(cfg)
    view3d.setAttribute('aria-label', `${def.name} xoay chậm`)
    const left = el('div', 'rg-box')
    const demo = btn(demoOn ? 'Dừng thử cơ cấu' : 'Thử cơ cấu', () => {
      demoOn = !demoOn
      demo.textContent = demoOn ? 'Dừng thử cơ cấu' : 'Thử cơ cấu'
      demo.setAttribute('aria-pressed', String(demoOn))
      viewer?.demo(demoOn)
    })
    demo.setAttribute('aria-pressed', String(demoOn))
    const demoRow = el('div', 'pk-acts rg-demo')
    demoRow.append(demo)
    left.append(view3d, demoRow)
    if (def.drives.length > 1) left.append(segment('Đế bánh', def.drives.map((d) => [d, DRIVE_NAME[d]] as [Drive, string]), cfg.drive, (d) => pick({ ...cfg, drive: d })))
    const hasMech = Object.keys(def.mech).length > 0
    if (hasMech) {
      const four = cfg.drive !== 'diff2'
      left.append(
        segment('Cơ cấu chạy bằng', [['tt', 'động cơ TT'], ['s360', 'servo 360']] as [Actuator, string][], four ? 's360' : cfg.actuator, (a) => pick({ ...cfg, actuator: a }), four),
      )
      if (four) left.append(el('p', 'rg-ws-note', 'Đế 4 bánh dùng hết M1–M4 cho bánh, nên cơ cấu chuyển sang servo 360 ở S4 / S5.'))
    }

    // Cột 2: thông số + cổng + tay PS2.
    const info = el('div', 'rg-box')
    info.dataset.role = 'info'
    info.append(
      el('h2', undefined, def.name),
      table([
        ['Kích thước', sizeText(def)],
        ['Đế bánh', DRIVE_NAME[cfg.drive]],
        ['Tốc độ', st.speedText],
        ['Chứa bóng', st.storageText],
        ['Cắm cờ', st.flagText],
      ]),
      el('h3', undefined, 'Cổng trên ThingBot'),
    )
    const ports = table(portRows(cfg).map((r) => [r.port, r.use]))
    ports.dataset.role = 'ports'
    info.append(ports, el('h3', undefined, 'Tay PS2 trong chương trình mẫu'), table(controlRows(cfg).map((r) => [r.name, r.use])))

    // Cột 3: vùng khối chỉ xem.
    const codeBox = el('div', 'rg-box rg-code')
    const openBtn = btn('', () => o.open({ ...cfg }), 'main')
    openBtn.dataset.role = 'open-workshop'
    openBtn.append(icon('blocks', 18), 'Mở trong Xưởng')
    const acts = el('div', 'pk-acts')
    acts.append(openBtn)
    codeBox.append(
      el('h3', undefined, 'Chương trình TeleOp mẫu · chỉ xem'),
      wsHost,
      el('p', 'rg-ws-note', 'Kéo để xem hết chương trình. Muốn sửa thì mở trong Xưởng: Xưởng nạp đúng robot này (bản em đang sửa dở của robot khác vẫn được giữ).'),
      acts,
    )

    const body = el('div', 'rg-body')
    body.append(left, info, codeBox)
    inner.replaceChildren(top, cards, body)
  }

  const release = () => {
    token++
    viewer?.dispose()
    viewer = null
    code?.dispose()
    code = null
    wsHost.replaceChildren()
    view3d.querySelector('.rg-fail')?.remove()
  }

  return {
    get shown() {
      return !box.hidden
    },
    get cfg() {
      return { ...cfg }
    },
    show(start) {
      release()
      cfg = { ...start }
      render()
      box.hidden = false
      box.scrollTop = 0
      box.querySelector<HTMLButtonElement>(`.rg-pick .pk-card[data-robot="${cfg.type}"]`)?.focus()
      const mine = token
      // Máy không có WebGL / tải mô-đun hỏng: báo một câu thay cho hình, phần thông tin bên cạnh vẫn dùng được.
      const fail = (host: HTMLElement, text: string) => (e: unknown) => {
        if (mine !== token) return
        console.warn('Robot mẫu:', e)
        host.replaceChildren(el('p', 'rg-fail', text))
      }
      createViewer(view3d, cfg)
        .then((v) => {
          if (mine !== token) return v.dispose()
          viewer = v
          if (demoOn) v.demo(true)
          if (JSON.stringify(cfg) !== JSON.stringify(start)) v.set(cfg) // em đã chọn robot khác lúc đang nạp
        })
        .catch(fail(view3d, 'Máy này chưa vẽ được robot 3D. Em xem thông tin và cổng ở bên cạnh nhé.'))
      createCodeView(wsHost)
        .then((c) => {
          if (mine !== token) return c.dispose()
          code = c
          c.load(sample(cfg, 'teleop'))
        })
        .catch(fail(wsHost, 'Chưa mở được vùng khối. Em bấm «Mở trong Xưởng» để xem chương trình mẫu.'))
    },
    hide() {
      box.hidden = true
      release()
    },
  }
}
