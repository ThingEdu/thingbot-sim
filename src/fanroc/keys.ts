// Bàn phím làm tay PS2 ảo (spec §8.4): một bạn dùng cả bàn phím (solo) hoặc hai bạn chia đôi (left / right).
// Module thuần — trang tự gắn keydown/keyup và gọi releaseAll() khi mất tiêu điểm (Review Focus 1).

import { PS2_NEUTRAL, type Ps2State } from './gamepad.ts'
import type { Drive } from './robots.ts'

export type KeyLayout = 'solo' | 'left' | 'right'
type DriveDir = 'up' | 'down' | 'left' | 'right' | 'strafeL' | 'strafeR'

export const KEY_TABLE: Record<KeyLayout, { drive: Record<DriveDir, string[]>; buttons: Record<string, string> }> = {
  solo: {
    drive: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], strafeL: ['KeyQ'], strafeR: ['KeyE'] },
    // Phím số thay nút hình (anh Tuấn 10/11): 1 = △, 2 = ○, 3 = ✕, 4 = □ — cùng nút với I / L / K / J.
    buttons: {
      KeyI: 'TRIANGLE', KeyK: 'CROSS', KeyJ: 'SQUARE', KeyL: 'CIRCLE', KeyU: 'L1', KeyO: 'R1', KeyY: 'L2', KeyP: 'R2',
      Digit1: 'TRIANGLE', Digit2: 'CIRCLE', Digit3: 'CROSS', Digit4: 'SQUARE',
    },
  },
  left: {
    drive: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], strafeL: ['KeyQ'], strafeR: ['KeyE'] },
    buttons: { KeyR: 'TRIANGLE', KeyF: 'CROSS', KeyC: 'SQUARE', KeyV: 'CIRCLE', Digit1: 'L1', Digit2: 'R1', Digit3: 'L2', Digit4: 'R2' },
  },
  right: {
    drive: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], strafeL: ['Comma'], strafeR: ['Period'] },
    buttons: { KeyI: 'TRIANGLE', KeyK: 'CROSS', KeyJ: 'SQUARE', KeyL: 'CIRCLE', KeyU: 'L1', KeyO: 'R1', KeyY: 'L2', KeyP: 'R2' },
  },
}

/** Hướng -1…1 → giá trị cần: tiến (+1) = 0, lùi (-1) = 255, 0 = 128. */
const axis = (v: number) => (v > 0 ? 0 : v < 0 ? 255 : 128)
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

export class KeyPad {
  private readonly pressed = new Set<string>()

  private readonly layout: KeyLayout

  constructor(layout: KeyLayout) { this.layout = layout }

  private owns(code: string): boolean {
    const t = KEY_TABLE[this.layout]
    return code in t.buttons || Object.values(t.drive).some((l) => l.includes(code))
  }

  /** true nếu phím thuộc bảng của bố cục này (để trang preventDefault). */
  down(code: string): boolean {
    if (!this.owns(code)) return false
    this.pressed.add(code)
    return true
  }

  up(code: string): void { this.pressed.delete(code) }

  releaseAll(): void { this.pressed.clear() }

  active(): boolean { return this.pressed.size > 0 }

  private dir(d: DriveDir): boolean {
    return KEY_TABLE[this.layout].drive[d].some((c) => this.pressed.has(c))
  }

  state(drive: Drive): Ps2State {
    const s: Ps2State = { ...PS2_NEUTRAL }
    const fwd = (this.dir('up') ? 1 : 0) - (this.dir('down') ? 1 : 0)
    const turn = (this.dir('right') ? 1 : 0) - (this.dir('left') ? 1 : 0)
    if (drive === 'diff2') {
      // Lái xích: cần trái = bánh trái, cần phải = bánh phải; D quay phải (trái tiến, phải lùi).
      s.ps2_PSS_LY = axis(clamp1(fwd + turn))
      s.ps2_PSS_RY = axis(clamp1(fwd - turn))
    } else {
      s.ps2_PSS_LY = axis(fwd)
      s.ps2_PSS_RX = axis(-turn)
      s.ps2_PSS_LX = axis((this.dir('strafeL') ? 1 : 0) - (this.dir('strafeR') ? 1 : 0))
    }
    for (const [code, name] of Object.entries(KEY_TABLE[this.layout].buttons)) {
      if (this.pressed.has(code)) s[`ps2_PSB_${name}`] = 1
    }
    return s
  }
}

/** Tay thật thắng khi có cần ngoài 120…136 hoặc có nút bấm; ngược lại dùng tay ảo. */
export function mergePad(real: Ps2State | null, virt: Ps2State): Ps2State {
  if (!real) return virt
  const live = Object.entries(real).some(([k, v]) =>
    k.startsWith('ps2_PSS_') ? v < 120 || v > 136 : k.startsWith('ps2_PSB_') && v === 1)
  return live ? real : virt
}

/** Bố cục bàn phím của người chơi `player`: một bạn dùng cả bàn phím, hai bạn chia đôi (bạn 1 trái, bạn 2 phải). */
export function layoutFor(player: 0 | 1, twoPlayers: boolean): KeyLayout {
  return twoPlayers ? (player === 0 ? 'left' : 'right') : 'solo'
}

/** Đích nhận phím trông như một phần tử DOM (chạy được trong Node bằng đối tượng giả). */
type TargetLike = { tagName?: string; isContentEditable?: boolean; classList?: { contains(c: string): boolean } } | null

/**
 * Đang gõ chữ: tiêu điểm ở ô nhập, vùng soạn thảo, ô chọn, hoặc ô sửa chữ / số của Blockly (`blocklyHtmlInput`).
 * Khi đó bàn phím không lái robot và màn chính không đổi ô (spec §6.4).
 */
export function typing(target: EventTarget | TargetLike): boolean {
  const t = target as TargetLike
  if (!t) return false
  const tag = (t.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true || !!t.classList?.contains('blocklyHtmlInput')
}
