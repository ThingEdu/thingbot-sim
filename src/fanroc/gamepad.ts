// Tay cầm trên máy tính đóng vai tay PS2 (spec §4.2): bố cục chuẩn Gamepad API → tên PS2X (PSB_*, PSS_*).
// Bảng nút / cần chép từ readGamepad() của src/ftc/run.ts (nhánh spike/ursim), sửa cho nhiều tay theo thứ tự cắm.
// Tay giả PS2 cắm USB (0810:0001) có bảng nút riêng đã đo. Tay rút ra hoặc tay lạ khác ⇒ null ⇒ trang đưa mọi khoá ps2_* về trung tính (Review Focus 1).

/** Trạng thái một tay cầm theo khoá ps2_* mà bo ảo đọc (`$.analogRead("ps2_…")`): nút 0/1, cần 0…255 (giữa 128). */
export type Ps2State = Record<string, number>

/** Số nút theo Gamepad API (bố cục "standard"): DualShock 4/5, tay USB bố cục chuẩn. */
const PS2_BUTTONS: Record<string, number> = {
  PSB_CROSS: 0, PSB_CIRCLE: 1, PSB_SQUARE: 2, PSB_TRIANGLE: 3, PSB_L1: 4, PSB_R1: 5, PSB_L2: 6, PSB_R2: 7,
  PSB_SELECT: 8, PSB_START: 9, PSB_L3: 10, PSB_R3: 11, PSB_PAD_UP: 12, PSB_PAD_DOWN: 13, PSB_PAD_LEFT: 14, PSB_PAD_RIGHT: 15,
}
const PS2_AXES: Record<string, number> = { PSS_LX: 0, PSS_LY: 1, PSS_RX: 2, PSS_RY: 3 }

/** Khoá bo ảo đọc để biết trang có gửi cần thật (0 là giá trị hợp lệ, xem sim-extra.ts). */
export const PRESENT_KEY = 'ps2_PRESENT'

/** Mọi nút nhả, mọi cần ở giữa. */
export const PS2_NEUTRAL: Ps2State = Object.freeze({
  ...Object.fromEntries(Object.keys(PS2_BUTTONS).map((k) => [`ps2_${k}`, 0])),
  ...Object.fromEntries(Object.keys(PS2_AXES).map((k) => [`ps2_${k}`, 128])),
}) as Ps2State

type PadLike = (Pick<Gamepad, 'connected' | 'mapping' | 'buttons' | 'axes'> & { id?: string }) | null

/**
 * Tay giả PS2 cắm USB "USB Gamepad" (0810:0001), đo trên Chrome macOS (mapping ""): △ ○ ✕ □ = 0 1 2 3, L1 R1 L2 R2 =
 * 4 5 6 7, Select 8, Start 9, L3 R3 = 10 11; cần trái trục 0/1, cần phải x = trục 5, y = trục 2; 4 mũi tên là một
 * trục "mũ" 8 hướng ở trục 9 (−1 = lên, rồi theo chiều kim đồng hồ mỗi nấc 2/7; ngoài ±1 = không bấm).
 */
const PS2USB_BUTTONS: Record<string, number> = {
  PSB_TRIANGLE: 0, PSB_CIRCLE: 1, PSB_CROSS: 2, PSB_SQUARE: 3, PSB_L1: 4, PSB_R1: 5, PSB_L2: 6, PSB_R2: 7,
  PSB_SELECT: 8, PSB_START: 9, PSB_L3: 10, PSB_R3: 11,
}
const PS2USB_AXES: Record<string, number> = { PSS_LX: 0, PSS_LY: 1, PSS_RX: 5, PSS_RY: 2 }
const PS2USB_HAT = 9
const isPs2Usb = (id = '') => /vendor:\s*0?810\b.*product:\s*0*1\b/i.test(id) || /^0?810-0*1-/i.test(id)

/** Hướng của trục mũ 8 hướng (−1 = lên, theo chiều kim đồng hồ mỗi nấc 2/7); ngoài ±1 là không bấm. */
export function hatPad(v: number): { up: boolean; right: boolean; down: boolean; left: boolean } {
  if (!(Math.abs(v) <= 1.05)) return { up: false, right: false, down: false, left: false }
  const pos = ((Math.round((v + 1) * 3.5) % 8) + 8) % 8
  return { up: pos === 7 || pos <= 1, right: pos >= 1 && pos <= 3, down: pos >= 3 && pos <= 5, left: pos >= 5 && pos <= 7 }
}

const axis = (a: number | undefined) => Math.max(0, Math.min(255, Math.round(((a ?? 0) + 1) * 127.5)))

/** Đọc một tay: bố cục chuẩn, hoặc tay giả PS2 USB đã đo; tay lạ khác không biết nút nào là nút nào ⇒ null. */
export function padState(gp: PadLike): Ps2State | null {
  if (!gp || !gp.connected) return null
  const s: Ps2State = {}
  if (gp.mapping === 'standard') {
    for (const [k, i] of Object.entries(PS2_BUTTONS)) s[`ps2_${k}`] = gp.buttons[i]?.pressed ? 1 : 0
    for (const [k, i] of Object.entries(PS2_AXES)) s[`ps2_${k}`] = axis(gp.axes[i])
    return s
  }
  if (!isPs2Usb(gp.id)) return null
  for (const [k, i] of Object.entries(PS2USB_BUTTONS)) s[`ps2_${k}`] = gp.buttons[i]?.pressed ? 1 : 0
  const hat = hatPad(gp.axes[PS2USB_HAT] ?? 99)
  s.ps2_PSB_PAD_UP = hat.up ? 1 : 0
  s.ps2_PSB_PAD_DOWN = hat.down ? 1 : 0
  s.ps2_PSB_PAD_LEFT = hat.left ? 1 : 0
  s.ps2_PSB_PAD_RIGHT = hat.right ? 1 : 0
  for (const [k, i] of Object.entries(PS2USB_AXES)) s[`ps2_${k}`] = axis(gp.axes[i])
  return s
}

type SeatPad = NonNullable<PadLike> & Pick<Gamepad, 'index' | 'id'>
const browserPads = (): ArrayLike<SeatPad | null> =>
  typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []

/** Tình trạng tay cầm của một ghế người lái. */
export type SeatStatus = 'none' | 'ok' | 'nonstandard' | 'lost'

/**
 * Gắn tay cầm vào ghế người lái theo lần cắm đầu tiên (ruling R26): tay cắm đầu tiên → Robot 1, tay kế → Robot 2,
 * nhớ theo `Gamepad.index` (giữ cả `id` để hiện). Tay của một ghế rút ra ⇒ ghế đó null (trung tính, Review Focus 1),
 * ghế khác giữ nguyên tay của mình; tay cắm lại đúng index đó thì về đúng ghế cũ. Không bao giờ dồn ghế.
 */
export class PadSeats {
  private readonly latched: ({ index: number; id: string } | null)[]

  constructor(seats = 2) {
    this.latched = Array.from({ length: seats }, () => null)
  }

  read(get: () => ArrayLike<SeatPad | null> = browserPads): { pads: (Ps2State | null)[]; status: SeatStatus[]; ids: (string | null)[] } {
    const live = Array.from(get()).filter((p): p is SeatPad => !!p && p.connected)
    for (const p of live) {
      if (this.latched.some((l) => l?.index === p.index)) continue
      const free = this.latched.indexOf(null)
      if (free >= 0) this.latched[free] = { index: p.index, id: p.id }
    }
    const pads: (Ps2State | null)[] = []
    const status: SeatStatus[] = []
    for (const l of this.latched) {
      const p = l ? live.find((q) => q.index === l.index) : undefined
      if (p && l) l.id = p.id
      const state = p ? padState(p) : null
      pads.push(state)
      status.push(!l ? 'none' : !p ? 'lost' : state ? 'ok' : 'nonstandard')
    }
    return { pads, status, ids: this.latched.map((l) => l?.id ?? null) }
  }
}

/**
 * Theo dõi những gì đã gửi cho một bo ảo và cho biết khoá nào cần gửi ở khung hình này: chỉ khoá đã đổi, trừ hai
 * lúc phải gửi đủ mọi khoá — vừa nạp chương trình (`reset`, bo ảo mới chưa có giá trị nào) và lúc tay vừa mất
 * (chuyển sang null), để không khoá nào kẹt ở giá trị cuối của tay đã rút.
 */
export class PadFeed {
  private sent: Ps2State | undefined
  private lost = false

  reset(): void {
    this.sent = undefined
  }

  next(pad: Ps2State | null): Ps2State {
    const target = pad ?? PS2_NEUTRAL
    const full = !this.sent || (pad === null && !this.lost)
    this.lost = pad === null
    const out: Ps2State = {}
    for (const [k, v] of Object.entries(target)) if (full || this.sent![k] !== v) out[k] = v
    this.sent = { ...target }
    return out
  }
}
