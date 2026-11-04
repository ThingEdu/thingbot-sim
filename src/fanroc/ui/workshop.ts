// Xưởng lập trình (spec §6.0): khung Khối mở sẵn với chương trình điều khiển robot của em (bản đã lưu, hoặc Mặc định =
// TeleOp mẫu), sân Đấu tập trống bóng để chạy thử, nút Lưu cho robot của em (phiên bản v1, v2… trong localStorage),
// Về mặc định, Tải .tb; đổi robot / đế ngay ở đây; hai bạn thì chọn Bạn 1 / Bạn 2 (mỗi bạn một chương trình riêng).
// Phần thuần (saveVerified, resetVerified) chạy được trong Node (workshop.test.ts); createWorkshopBar dựng DOM.
import type { RobotConfig } from '../robots.ts'
import type { Store } from '../store.ts'
import { icon } from './icons.ts'

export type SaveResult = { ok: true; version: number; text: string } | { ok: false; text: string }

export const SAVE_FAILED = 'Không lưu được — trình duyệt đang chặn bộ nhớ hoặc bộ nhớ đã đầy. Tải .tb về máy để giữ chương trình.'
export const RESET_FAILED = 'Không xoá được bản đã lưu — trình duyệt đang chặn bộ nhớ.'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Lưu chương trình của bạn p cho robot cfg rồi đọc lại: chỉ báo "Đã lưu vN" khi đọc lại đúng phiên bản N và đúng nội
 * dung (`saveProgram` trả số phiên bản mới cả khi localStorage chặn / đầy — Task 7).
 */
export function saveVerified(store: Pick<Store, 'saveProgram' | 'program'>, p: 0 | 1, cfg: RobotConfig, state: object): SaveResult {
  const version = store.saveProgram(p, cfg, state)
  const back = store.program(p, cfg)
  if (back && back.version === version && same(back.state, state)) return { ok: true, version, text: `Đã lưu v${version}` }
  return { ok: false, text: SAVE_FAILED }
}

/** Về mặc định: xoá bản lưu rồi đọc lại; còn bản lưu ⇒ báo lỗi (nhãn vẫn là "Của em vN"). */
export function resetVerified(store: Pick<Store, 'resetProgram' | 'program'>, p: 0 | 1, cfg: RobotConfig): { ok: boolean; text: string } {
  store.resetProgram(p, cfg)
  return store.program(p, cfg) === null ? { ok: true, text: 'Đã về chương trình mặc định' } : { ok: false, text: RESET_FAILED }
}

// ---------- Bản nháp (R94) ----------
/** Khoá bản nháp: bạn + cấu hình robot (như khoá chương trình của store). */
export const draftKey = (p: 0 | 1, c: RobotConfig) => `${p}:${c.type}/${c.drive}/${c.actuator}`

/**
 * Bản nháp chưa lưu của Xưởng, chỉ trong phiên (không ghi localStorage). Mỗi bản giữ cả `base`: chương trình lúc
 * mở Xưởng (bản đã lưu, hoặc Mặc định như vùng khối đã nạp) — bản nháp giống hệt `base` thì không phải bản nháp.
 */
export class Drafts {
  private readonly m = new Map<string, { state: object; base: object }>()

  /** Ghi lại chương trình đang sửa; giống `base` ⇒ xoá bản nháp (không có gì chưa lưu). */
  keep(p: 0 | 1, cfg: RobotConfig, state: object, base: object): void {
    const k = draftKey(p, cfg)
    if (same(state, base)) this.m.delete(k)
    else this.m.set(k, { state, base })
  }

  get(p: 0 | 1, cfg: RobotConfig): { state: object; base: object } | null {
    return this.m.get(draftKey(p, cfg)) ?? null
  }

  has(p: 0 | 1, cfg: RobotConfig): boolean {
    return this.m.has(draftKey(p, cfg))
  }

  drop(p: 0 | 1, cfg: RobotConfig): void {
    this.m.delete(draftKey(p, cfg))
  }
}

/** Hai chương trình (dạng lưu của vùng khối) giống hệt nhau. */
export const sameProgram = same

// ---------- DOM ----------
export interface WorkshopView {
  player: 0 | 1
  players: 1 | 2
  names: [string, string]
  /** "Của em v2" / "Mặc định". */
  label: string
  /** Vào từ Pit của giải: robot giữ nguyên suốt giải (ẩn ô đổi robot), có nút quay lại Pit. */
  tournament?: boolean
}

export interface WorkshopBar {
  readonly el: HTMLElement
  show(v: WorkshopView): void
  hide(): void
  /** Dòng báo sau khi bấm (ok = xanh, không = đỏ); null xoá. */
  message(text: string | null, ok?: boolean): void
}

const CSS = `
.ws-bar { display: grid; gap: 8px; padding: 10px 10px 8px; background: #fff7e6; border-bottom: 1px solid var(--line); color: var(--ink); font: 13px var(--font); }
.ws-bar[hidden] { display: none; }
.ws-hd { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ws-hd h2 { margin: 0; font-size: 14px; flex: 1; min-width: 150px; }
.ws-hd .prog { font: 700 11.5px var(--font); padding: 2px 8px; border-radius: 10px; background: #e5e1d8; color: #333; }
.ws-hd .prog[data-mine="true"] { background: #f2a516; color: #221; }
.ws-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ws-bar button { display: inline-flex; gap: 5px; align-items: center; font: 700 13px var(--font); border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 6px; padding: 5px 10px; cursor: pointer; }
.ws-bar button.main { background: #1fa860; border-color: #1fa860; color: #fff; }
.ws-bar button[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }
.ws-msg { font-weight: 700; font-size: 12.5px; }
.ws-msg[data-ok="true"] { color: #12804a; }
.ws-msg[data-ok="false"] { color: #c0392b; }
.ws-msg:empty { display: none; }
`

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * Thanh Xưởng đặt trên đầu khung Khối. `controls(p)` = ô chọn robot / đế / cơ cấu của bạn p (editor.configControls,
 * dựng sẵn mỗi bạn một bộ).
 */
export function createWorkshopBar(
  controls: (p: 0 | 1) => { el: HTMLElement; refresh(): void },
  on: { setPlayer(p: 0 | 1): void; save(): void; reset(): void; download(): void; back?(): void },
): WorkshopBar {
  if (!document.getElementById('ws-css')) {
    const s = el('style')
    s.id = 'ws-css'
    s.textContent = CSS
    document.head.append(s)
  }
  const bar = el('div', 'ws-bar')
  bar.dataset.role = 'workshop'
  bar.hidden = true
  const msg = el('div', 'ws-msg')
  msg.setAttribute('role', 'status')
  const button = (text: string, onClick: () => void, cls?: string, ic?: Parameters<typeof icon>[0]) => {
    const b = el('button', cls)
    b.type = 'button'
    if (ic) b.append(icon(ic, 16))
    b.append(text)
    b.onclick = onClick
    return b
  }
  const save = button('Lưu cho robot của em', on.save, 'main')
  const reset = button('Về mặc định', on.reset, undefined, 'reset')
  const dl = button('Tải .tb', on.download, undefined, 'download')
  dl.title = 'Tải chương trình về dạng .tb để nạp ThingBot thật bằng ThingBlock'

  return {
    el: bar,
    show(v) {
      const hd = el('div', 'ws-hd')
      const prog = el('span', 'prog', v.label)
      prog.dataset.mine = String(v.label !== 'Mặc định')
      hd.append(el('h2', undefined, `Xưởng lập trình · ${v.names[v.player]}`), prog)
      const rows: HTMLElement[] = [hd]
      if (v.players === 2) {
        const who = el('div', 'ws-row')
        who.setAttribute('aria-label', 'Chương trình của bạn nào')
        for (const p of [0, 1] as const) {
          const b = button(v.names[p], () => on.setPlayer(p))
          b.setAttribute('aria-pressed', String(p === v.player))
          b.dataset.player = String(p)
          who.append(b)
        }
        rows.push(who)
      }
      if (v.tournament) {
        // Giải đấu: robot + đế chọn lúc ghi danh, giữ suốt giải; lưu xong tự về Pit.
        const note = el('div', 'ws-row', 'Giải đấu: robot giữ nguyên như lúc ghi danh. Lưu xong em quay lại Pit.')
        note.dataset.role = 'tour-note'
        rows.push(note)
      } else {
        const c = controls(v.player)
        c.refresh()
        const cfgRow = el('div', 'ws-row')
        cfgRow.append(c.el)
        rows.push(cfgRow)
      }
      const acts = el('div', 'ws-row')
      acts.append(save, reset, dl)
      if (v.tournament && on.back) acts.append(button('Về Pit', on.back, undefined, 'trophy'))
      rows.push(acts, msg)
      bar.replaceChildren(...rows)
      bar.hidden = false
    },
    hide() {
      bar.hidden = true
    },
    message(text, ok = true) {
      msg.textContent = text ?? ''
      msg.dataset.ok = String(ok)
    },
  }
}
