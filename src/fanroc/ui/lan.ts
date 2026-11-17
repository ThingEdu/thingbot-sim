// Màn Thi qua mạng LAN (spec 2026-11-18-fanroc-lan-design.md): chọn Tạo phòng / Vào phòng (danh sách phòng nghe được +
// ô nhập IP), rồi phòng chờ hai cột Đỏ (máy chủ) | Xanh (máy khách) với nút Sẵn sàng. Phần thuần (lanSeats, localSeat,
// teamInfo) chạy được trong Node (lan.test.ts); createLanScreen dựng DOM, phủ sân như màn giải đấu.
import type { RobotConfig } from '../robots.ts'
import type { Skill } from '../agent.ts'
import type { LanRoom } from '../net/backend.ts'
import { PROTO, type Stage, type TeamInfo } from '../net/room.ts'
import { robotName } from './home.ts'

export type Role = 'host' | 'guest'

/**
 * Ghế của trận hai máy, thứ tự [Đỏ 0, Xanh 0, Đỏ 1, Xanh 1]: máy chủ = Đỏ (bạn 1 ô 0, bạn 2 hoặc máy ô 2), máy khách =
 * Xanh (ô 1, ô 3). `who` nói ai lái: bạn p của máy nào, hay robot máy (chạy trên máy chủ) theo mức của liên minh đó.
 */
export type SeatWho = { side: Role; player: 0 | 1 } | { side: Role; agent: Skill }
export function lanSeats(host: TeamInfo, guest: TeamInfo): { cfgs: RobotConfig[]; teams: string[]; who: SeatWho[] } {
  const second = (side: Role, t: TeamInfo): SeatWho => (t.players === 2 ? { side, player: 1 } : { side, agent: t.skill })
  return {
    cfgs: [host.robots[0], guest.robots[0], host.robots[1], guest.robots[1]],
    teams: [host.team, guest.team, host.team2, guest.team2],
    who: [{ side: 'host', player: 0 }, { side: 'guest', player: 0 }, second('host', host), second('guest', guest)],
  }
}

/** Ghế của bạn p trên máy này (−1: máy chỉ một bạn mà hỏi bạn 2). */
export function localSeat(role: Role, p: 0 | 1, players: 1 | 2): number {
  if (p === 1 && players !== 2) return -1
  return (role === 'host' ? 0 : 1) + (p === 1 ? 2 : 0)
}

/** Thông tin đội gửi cho máy kia: tên, số bạn, hai robot, mức máy cho ghế trống. */
export function teamInfo(o: { names: readonly [string, string]; players: 1 | 2; robots: [RobotConfig, RobotConfig]; skill: Skill; machine: string; app: string }): TeamInfo {
  return {
    team: o.names[0].trim() || 'Bạn 1',
    team2: o.players === 2 ? o.names[1].trim() || 'Bạn 2' : o.machine,
    players: o.players,
    robots: o.robots,
    skill: o.skill,
    app: o.app,
  }
}

export type LanView =
  | { kind: 'choose'; desktop: boolean; rooms: LanRoom[]; addr: string; note: string | null; busy: boolean }
  | {
      kind: 'lobby'
      role: Role
      stage: Stage
      host: TeamInfo | null
      guest: TeamInfo | null
      ready: [boolean, boolean]
      addrs: string[]
      note: string | null
      rtt: number | null
    }

export interface LanActions {
  create(): void
  join(addr: string): void
  setAddr(addr: string): void
  ready(on: boolean): void
  leave(): void
  home(): void
}

export interface LanScreen {
  readonly shown: boolean
  show(v: LanView): void
  hide(): void
}

const CSS = `
.ln-in { max-width: 900px; }
.ln-in h1 { font-size: clamp(18px, 3vw, 26px) !important; margin: 0; }
.ln-box { background: #0007; border: 1px solid #fff2; border-radius: 12px; padding: 12px 14px; display: grid; gap: 10px; min-width: 0; }
.ln-box h3 { margin: 0; font-size: 14px; color: #ffcf5a; letter-spacing: .4px; }
.ln-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.ln-side { border-radius: 12px; padding: 12px 14px; display: grid; gap: 6px; border: 2px solid #fff3; }
.ln-side[data-side="host"] { background: linear-gradient(150deg, #e2384d55, #9d153055); }
.ln-side[data-side="guest"] { background: linear-gradient(150deg, #2463eb55, #142f8a55); }
.ln-side h3 { margin: 0; font-size: 16px; }
.ln-side .who { font-size: 13px; color: #dfe6f5; line-height: 1.5; }
.ln-side .rd { font-weight: 800; font-size: 13px; }
.ln-side .rd[data-on="true"] { color: #7be3a6; }
.ln-side .rd[data-on="false"] { color: #ffcf5a; }
.ln-rooms { display: grid; gap: 6px; }
.ln-rooms button { text-align: left; font: 700 14px var(--font); padding: 8px 12px; border-radius: 8px; border: 1px solid #fff3; background: #ffffff12; color: #eef2fa; cursor: pointer; }
.ln-rooms button small { font-weight: 400; color: #aab3c7; margin-left: 8px; }
.ln-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ln-row button { display: inline-flex; gap: 6px; align-items: center; font: 800 15px var(--font); border-radius: 10px; padding: 8px 18px; cursor: pointer; border: 1px solid #1fa860; background: #1fa860; color: #fff; }
.ln-row button:disabled { opacity: .45; cursor: default; }
.ln-row input { font: 700 15px var(--font); padding: 7px 9px; border-radius: 6px; border: 1px solid #fff4; background: #fff; color: #222; width: 220px; max-width: 100%; box-sizing: border-box; }
.ln-cap { font-size: 12.5px; color: #aab3c7; line-height: 1.5; }
.ln-ip { font: 800 22px var(--font); letter-spacing: .5px; color: #fff; }
.ln-note { font-size: 13px; font-weight: 700; color: #ff8a7a; }
.ln-net { font-size: 12.5px; color: #aab3c7; }
`

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const btn = (text: string, onClick: () => void, cls?: string, key?: string): HTMLButtonElement => {
  const b = el('button', cls, text)
  b.type = 'button'
  b.onclick = onClick
  if (key) b.dataset.key = key
  return b
}

function side(role: Role, t: TeamInfo | null, ready: boolean, mine: boolean): HTMLElement {
  const box = el('div', 'ln-side')
  box.dataset.side = role
  box.append(el('h3', undefined, `${role === 'host' ? 'Liên minh Đỏ · máy chủ' : 'Liên minh Xanh · máy khách'}${mine ? ' (máy này)' : ''}`))
  if (!t) {
    box.append(el('div', 'who', role === 'guest' ? 'Đang chờ máy bạn vào phòng…' : '…'))
    return box
  }
  const who = el('div', 'who')
  who.append(`${t.team} · ${robotName(t.robots[0])}`, el('br'), `${t.team2} · ${robotName(t.robots[1])}${t.players === 2 ? '' : ' (robot máy)'}`)
  const rd = el('div', 'rd', ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng')
  rd.dataset.on = String(ready)
  box.append(who, rd)
  return box
}

export function createLanScreen(root: HTMLElement, act: LanActions): LanScreen {
  if (!document.getElementById('ln-css')) {
    const s = el('style')
    s.id = 'ln-css'
    s.textContent = CSS
    document.head.append(s)
  }
  const box = el('section', 'hm')
  box.dataset.screen = 'lan'
  box.setAttribute('aria-label', 'Thi qua mạng LAN')
  box.hidden = true
  const inner = el('div', 'hm-in ln-in')
  box.append(inner)
  root.append(box)
  const acts = (...b: HTMLButtonElement[]) => {
    const a = el('div', 'pk-acts')
    a.append(...b)
    return a
  }
  let sig = ''

  const choose = (v: Extract<LanView, { kind: 'choose' }>): HTMLElement[] => {
    const make = el('div', 'ln-box')
    make.append(
      el('h3', undefined, 'Tạo phòng — máy này là máy chủ (liên minh Đỏ)'),
      el('div', 'ln-cap', 'Máy chủ chạy sân, đồng hồ và trọng tài. Máy bạn vào phòng sẽ là liên minh Xanh.'),
      acts(btn('Tạo phòng', act.create, 'main', 'create')),
    )
    const join = el('div', 'ln-box')
    join.append(el('h3', undefined, 'Vào phòng — máy này là máy khách (liên minh Xanh)'))
    if (v.desktop) {
      const list = el('div', 'ln-rooms')
      if (!v.rooms.length) list.append(el('div', 'ln-cap', 'Đang tìm phòng trong mạng… (Wi-Fi chặn tìm phòng thì nhập IP máy chủ ở dưới)'))
      for (const r of v.rooms) {
        const b = btn('', () => act.join(r.addr), undefined, `room-${r.addr}`)
        b.append(r.name, el('small', undefined, r.proto === PROTO ? r.addr : `${r.addr} · khác phiên bản`))
        b.disabled = v.busy || r.proto !== PROTO
        list.append(b)
      }
      join.append(list)
    }
    const row = el('div', 'ln-row')
    const input = el('input')
    input.type = 'text'
    input.placeholder = v.desktop ? 'IP máy chủ, vd. 192.168.1.23' : 'Hub trên máy này (trình duyệt)'
    input.value = v.addr
    input.setAttribute('aria-label', 'Địa chỉ IP máy chủ')
    input.oninput = () => act.setAddr(input.value)
    input.onkeydown = (e) => {
      if (e.key === 'Enter') act.join(input.value)
    }
    const go = btn('Vào phòng', () => act.join(input.value), 'main', 'join')
    go.disabled = v.busy || (v.desktop && !input.value.trim())
    input.addEventListener('input', () => (go.disabled = v.busy || (v.desktop && !input.value.trim())))
    row.append(input, go)
    join.append(row)
    const out: HTMLElement[] = [el('h1', undefined, 'Thi qua mạng LAN'), el('div', 'ln-cap', 'Hai máy cùng một mạng Wi-Fi / LAN, cùng phiên bản TiFa. Mỗi máy một liên minh, một hoặc hai bạn (⚙ › Hai bạn chơi).')]
    if (v.note) out.push(el('div', 'ln-note', v.note))
    out.push(el('div', 'ln-two'), acts(btn('Về màn chính', act.home, undefined, 'home')))
    out[out.length - 2].append(make, join)
    return out
  }

  const lobby = (v: Extract<LanView, { kind: 'lobby' }>): HTMLElement[] => {
    const out: HTMLElement[] = [el('h1', undefined, v.role === 'host' ? 'Phòng của máy này' : 'Đã vào phòng')]
    if (v.role === 'host') {
      const ip = el('div', 'ln-box')
      ip.append(el('h3', undefined, 'Máy bạn nhập địa chỉ này nếu không thấy phòng'), el('div', 'ln-ip', v.addrs.join(' · ') || '(không thấy card mạng)'))
      out.push(ip)
    }
    const two = el('div', 'ln-two')
    two.append(side('host', v.host, v.ready[0], v.role === 'host'), side('guest', v.guest, v.ready[1], v.role === 'guest'))
    out.push(two)
    if (v.note) out.push(el('div', 'ln-note', v.note))
    if (v.rtt !== null) out.push(el('div', 'ln-net', `Mạng: ${Math.round(v.rtt)} ms`))
    const mine = v.ready[v.role === 'host' ? 0 : 1]
    const ready = btn(mine ? 'Bỏ sẵn sàng' : 'Sẵn sàng', () => act.ready(!mine), mine ? undefined : 'main', 'ready')
    ready.disabled = v.stage !== 'lobby'
    out.push(acts(ready, btn('Rời phòng', act.leave, undefined, 'leave')))
    if (v.stage === 'loading') out.push(el('div', 'ln-cap', 'Đang dựng sân…'))
    return out
  }

  return {
    get shown() {
      return !box.hidden
    },
    show(v) {
      // Vẽ lại chỉ khi đổi (danh sách phòng hỏi mỗi giây): không mất chữ đang gõ / tiêu điểm.
      const s = JSON.stringify(v)
      if (s === sig && !box.hidden) return
      const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key
      const typing = document.activeElement instanceof HTMLInputElement && box.contains(document.activeElement)
      sig = s
      box.dataset.view = v.kind
      if (typing && v.kind === 'choose' && inner.dataset.kind === 'choose') {
        // Đang gõ IP: chỉ thay phần danh sách phòng / lời báo, giữ ô nhập.
        const fresh = choose(v)
        const old = inner.querySelector('.ln-rooms')
        const neu = fresh.flatMap((n) => [...n.querySelectorAll('.ln-rooms')])[0]
        if (old && neu) old.replaceWith(neu)
      } else {
        inner.replaceChildren(...(v.kind === 'choose' ? choose(v) : lobby(v)))
        inner.dataset.kind = v.kind
        if (focusKey) inner.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus()
      }
      box.hidden = false
    },
    hide() {
      box.hidden = true
      sig = ''
    },
  }
}

