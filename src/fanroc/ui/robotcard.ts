// Thẻ nhỏ "robot của em" góc dưới trái màn trận (spec §6.1 ③): tên robot, nhãn chương trình, cách lái (bàn phím / tay
// PS2), bóng đang chứa, tình trạng tay cầm và cảnh báo vùng chết 20 % của động cơ TT (deadZoneLines). Hai bạn ⇒ hai thẻ.
// Phần thuần (cardText) chạy được trong Node (robotcard.test.ts); createRobotCards dựng DOM, chỉ vẽ lại khi chữ đổi.
import type { SeatStatus } from '../gamepad.ts'
import { icon } from './icons.ts'

export interface CardInfo {
  player: string
  robot: string
  program: string
  /** Tay PS2 thật đang lái (thắng bàn phím khi có tín hiệu) hay bàn phím. */
  input: 'Bàn phím' | 'Tay PS2'
  /** Hai bạn chia đôi bàn phím: phím lái của bạn này ("W A S D" / "↑ ← ↓ →"), hiện cạnh "Bàn phím". */
  keys?: string
  /** Số thứ tự tay cầm của bạn này (1, 2) và tình trạng. */
  pad: { n: number; status: SeatStatus }
  held: number
  storage: number
  warnings: string[]
}

/** Dòng tình trạng tay cầm (null = không có gì để báo: chưa cắm, hoặc đang cắm đúng bố cục). */
export function padLine(n: number, status: SeatStatus): string | null {
  if (status === 'lost') return `Tay cầm ${n} đã rút ra — robot đứng yên, bàn phím vẫn lái được`
  if (status === 'nonstandard') return `Tay cầm ${n} không đúng bố cục chuẩn — robot không nhận tay này, dùng bàn phím`
  return null
}

/** Các dòng của thẻ, theo thứ tự hiện. */
export function cardText(c: CardInfo): string[] {
  const pad = padLine(c.pad.n, c.pad.status)
  return [
    `${c.player} · ${c.robot}`,
    `Chương trình: ${c.program}`,
    `Lái: ${c.input}${c.keys && c.input === 'Bàn phím' ? ` ${c.keys}` : ''} · bóng ${c.held}/${c.storage}`,
    ...(pad ? [pad] : []),
    ...c.warnings,
  ]
}

/** Một dòng cảnh báo ở lại ít nhất bấy lâu sau lần cuối còn đúng, và chữ (số %) đổi tối đa một lần trong bấy lâu, ms. */
export const WARN_HOLD_MS = 2000

/**
 * Giữ dòng cảnh báo khỏi nháy (anh Tuấn 10/11: chữ bên trái nháy quá nhanh): tay cầm quanh ngưỡng 20 % làm dòng
 * "M1 = 12 % < 20 %…" bật / tắt / đổi số mỗi khung hình. Mỗi dòng theo khoá (chữ trước dấu " ", vd "M1") ở lại
 * WARN_HOLD_MS sau lần cuối thấy, và chữ của nó chỉ thay sau WARN_HOLD_MS kể từ lần thay trước.
 */
export class WarningHold {
  private lines = new Map<string, { text: string; seen: number; set: number }>()

  update(now: number, warnings: string[]): string[] {
    for (const w of warnings) {
      const k = w.split(' ')[0]
      const cur = this.lines.get(k)
      if (!cur) this.lines.set(k, { text: w, seen: now, set: now })
      else {
        cur.seen = now
        if (cur.text !== w && now - cur.set >= WARN_HOLD_MS) Object.assign(cur, { text: w, set: now })
      }
    }
    for (const [k, v] of this.lines) if (now - v.seen >= WARN_HOLD_MS) this.lines.delete(k)
    return [...this.lines.values()].map((v) => v.text)
  }
}

const CSS = `
.rc-me { position: absolute; left: 10px; bottom: 10px; z-index: 6; display: grid; gap: 6px; max-width: min(330px, calc(100% - 20px)); pointer-events: none; }
.rc-me[hidden] { display: none; }
/* Chia đôi màn hình (hai bạn): thẻ bạn 1 góc dưới nửa trái, thẻ bạn 2 góc dưới nửa phải. */
/* Dòng điểm bật lên (.fd, dựng sau thẻ) lên trên thẻ bạn 2 để không đè. */
.rc-me[data-split] ~ .fd { bottom: 96px; }
.rc-me[data-split] { right: 10px; max-width: none; grid-template-columns: minmax(0, 330px) minmax(0, 330px); justify-content: space-between; align-items: end; }
.rc-card { display: grid; gap: 2px; padding: 7px 10px; border-radius: 8px; background: #101425e0; color: #eef2fa; border: 1px solid #ffffff22; font: 12px/1.45 var(--font); box-shadow: 0 4px 14px #0007; }
.rc-card b { font-size: 13px; }
.rc-card .rc-in { display: inline-flex; gap: 5px; align-items: center; }
.rc-card .rc-warn { color: #ffcf5a; }
`

export interface RobotCards {
  /** `split`: màn đang chia đôi ⇒ hai thẻ hai góc dưới (thứ tự thẻ = bạn 1, bạn 2 = nửa trái, nửa phải). */
  update(cards: CardInfo[], split?: boolean): void
  visible(v: boolean): void
}

export function createRobotCards(stage: HTMLElement): RobotCards {
  if (!document.getElementById('rc-css')) {
    const s = document.createElement('style')
    s.id = 'rc-css'
    s.textContent = CSS
    document.head.append(s)
  }
  const box = document.createElement('div')
  box.className = 'rc-me'
  box.setAttribute('aria-label', 'Robot của em')
  box.setAttribute('aria-live', 'polite')
  stage.append(box)
  let key = ''
  return {
    update(cards, split = false) {
      box.toggleAttribute('data-split', split && cards.length === 2)
      const k = JSON.stringify(cards.map(cardText).concat([cards.map((c) => c.input)]))
      if (k === key) return
      key = k
      box.replaceChildren(
        ...cards.map((c) => {
          const lines = cardText(c)
          const card = document.createElement('div')
          card.className = 'rc-card'
          const span = (text: string, cls?: string) => Object.assign(document.createElement('span'), { textContent: text, className: cls ?? '' })
          const title = document.createElement('b')
          title.textContent = lines[0]
          const input = span(lines[2], 'rc-in')
          input.prepend(icon(c.input === 'Tay PS2' ? 'gamepad' : 'keyboard', 14))
          card.append(title, span(lines[1]), input, ...lines.slice(3).map((t) => span(t, 'rc-warn')))
          return card
        }),
      )
    },
    visible(v) {
      box.hidden = !v
    },
  }
}
