// Tay cầm trên máy tính đóng vai tay PS2 (spec §4.2): bố cục chuẩn Gamepad API → tên PS2X (PSB_*, PSS_*).
// Bảng nút / cần chép từ readGamepad() của src/ftc/run.ts (nhánh spike/ursim), sửa cho nhiều tay theo thứ tự cắm.
// Tay rút ra hoặc không theo bố cục chuẩn ⇒ null ⇒ trang đưa mọi khoá ps2_* về trung tính (Review Focus 1).

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

type PadLike = Pick<Gamepad, 'connected' | 'mapping' | 'buttons' | 'axes'> | null

/** Đọc một tay; tay không theo bố cục chuẩn thì không biết nút nào là nút nào ⇒ null. */
export function padState(gp: PadLike): Ps2State | null {
  if (!gp || !gp.connected || gp.mapping !== 'standard') return null
  const s: Ps2State = {}
  for (const [k, i] of Object.entries(PS2_BUTTONS)) s[`ps2_${k}`] = gp.buttons[i]?.pressed ? 1 : 0
  for (const [k, i] of Object.entries(PS2_AXES)) {
    const a = gp.axes[i] ?? 0
    s[`ps2_${k}`] = Math.max(0, Math.min(255, Math.round((a + 1) * 127.5)))
  }
  return s
}

/**
 * Các tay đang cắm theo thứ tự cắm (bỏ chỗ trống của tay đã rút): phần tử thứ i là bộ thu của robot người lái i + 1.
 * Tay không chuẩn vẫn giữ chỗ nhưng là null.
 */
export function readPads(
  get: () => ArrayLike<PadLike> = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []),
): (Ps2State | null)[] {
  return Array.from(get())
    .filter((p): p is NonNullable<PadLike> => !!p && p.connected)
    .map(padState)
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
