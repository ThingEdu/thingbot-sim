// Thông tin trận tiếng Việt ngoài bảng điểm (Task 12: bảng điểm Đỏ | chung | Xanh chuyển sang ui/scoreboard.ts): chữ
// đồng hồ, cảnh báo vùng chết, và thẻ "Sự kiện trận" — nhật ký, ô kiểm tra theo luật của robot đang chọn, bảng đội cuối
// trận. Chỉ đọc Match / RobotBody; không đổi trạng thái trận.
import type { Match } from '../match.ts'
import type { RobotBody } from '../robot.ts'
import { ROBOTS, ruleChecks, type RobotConfig } from '../robots.ts'
import { MATCH_S } from '../layout.ts'
import { DEAD_ZONE } from '../robot.ts'
import type { PortValues } from '../ports.ts'

export interface Hud {
  /** `ports`: lệnh cổng của từng robot ở bước vừa chạy (để báo lệnh động cơ rơi vào vùng chết). */
  update(match: Match, robots: RobotBody[], cfgs: RobotConfig[], ports: PortValues[]): void
  /** Thêm một dòng vào nhật ký (ngoài các sự kiện của trận). */
  log(text: string): void
  /** Robot đang chọn (ô kiểm tra luật). */
  readonly selected: number
  /** Gọi khi người dùng chọn robot khác. */
  onSelect?: (i: number) => void
}

const ALLIANCE = { red: 'Đỏ', blue: 'Xanh' } as const

// Nằm trong thẻ "Sự kiện trận" của khung đáy (nền tối): nhật ký bên trái, kiểm tra theo luật + kết quả các đội bên phải.
const CSS = `
.fr-hud { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 340px); gap: 4px 16px; align-items: start; min-width: 0; color: #d4d4d4; font-family: var(--font); }
@media (max-width: 700px) { .fr-hud { grid-template-columns: minmax(0, 1fr); } }
.fr-card { display: grid; gap: 4px; min-width: 0; }
.fr-card h2 { margin: 2px 0 0; font: 700 11px/1.2 var(--font); letter-spacing: .6px; text-transform: uppercase; color: #969696; }
.fr-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.fr-tabs button { font: 600 11.5px var(--font); border: 1px solid #3c3c3c; background: #252526; color: #ccc; border-radius: 4px; padding: 3px 4px; cursor: pointer; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-tabs button[aria-pressed="true"] { background: #094771; border-color: #007acc; color: #fff; }
.fr-tabs button[data-a="red"] { border-left: 3px solid #e2384d; }
.fr-tabs button[data-a="blue"] { border-left: 3px solid #2463eb; }
.fr-sub { font-size: 12px; color: #969696; }
.fr-checks, .fr-teams { display: grid; gap: 3px; font-size: 12px; }
.fr-chk { display: flex; gap: 8px; align-items: baseline; }
.fr-chk i { font: 700 10.5px var(--font); font-style: normal; padding: 1px 6px; border-radius: 4px; flex: none; }
.fr-chk i.ok { background: #1f9d5533; color: #6fd394; }
.fr-chk i.bad { background: #e2473b33; color: #f48771; }
.fr-chk i.note { background: #ffffff1a; color: #bbb; }
.fr-teams .fr-chk i { min-width: 34px; text-align: center; font-size: 12px; }
.fr-log { font: 12px/1.5 var(--mono); display: grid; gap: 1px; align-content: start; color: #d4d4d4; }
.fr-log span { color: #858585; margin-right: 6px; }
`

function injectCss(): void {
  if (document.getElementById('fr-hud-css')) return
  const s = document.createElement('style')
  s.id = 'fr-hud-css'
  s.textContent = CSS
  document.head.append(s)
}

const mmss = (s: number) => {
  const c = Math.max(0, Math.ceil(s - 1e-6))
  return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`
}
/** Đồng hồ theo thời điểm trận: xả bóng đếm 0:10 → 0:00, thi đấu đếm 3:00 → 0:00. */
const clockAt = (t: number) => (t < 0 ? mmss(-t) : mmss(MATCH_S - t))
/** Luyện tập không hết giờ: đếm lên thời gian đã chạy. */
const elapsed = (t: number) => {
  const c = Math.max(0, Math.floor(t + 1e-6))
  return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`
}
/** Đồng hồ trần của bảng điểm: trận đếm ngược (xả bóng 0:10 → 0:00, thi đấu 3:00 → 0:00), luyện tập đếm lên. */
export function matchClock(t: number, practice: boolean): string {
  return practice ? elapsed(t) : clockAt(t)
}
/** Chữ đồng hồ: trận đếm ngược, luyện tập "Luyện tập · m:ss" đếm lên (ruling R31 bỏ hết giờ của luyện tập). */
export function clockText(t: number, practice: boolean): string {
  return practice ? `Luyện tập · ${elapsed(t)}` : clockAt(t)
}
/** Giờ ghi ở đầu dòng nhật ký. */
const stamp = (t: number, practice: boolean) => (practice ? elapsed(t) : clockAt(t))

const MOTORS = ['M1', 'M2', 'M3', 'M4'] as const
/** "10", "−12,5": số phần trăm kiểu Việt, cắt (không làm tròn) còn một chữ số thập phân để 19,96 không thành "20 % < 20 %". */
const pct = (v: number) => String(Math.trunc(v * 10) / 10).replace('-', '−').replace('.', ',')
/**
 * Ruling R32: mỗi động cơ có lệnh trong (0, 20) % (cả hai chiều) một dòng "M1 = 10 % < 20 %: động cơ TT không quay" —
 * động cơ TT có vùng chết 20 %, lệnh nhỏ hơn không làm bánh quay.
 */
export function deadZoneLines(ports: PortValues | undefined): string[] {
  if (!ports) return []
  return MOTORS.filter((m) => ports[m] !== 0 && Math.abs(ports[m]) < DEAD_ZONE).map(
    (m) => `${m} = ${pct(ports[m])} % < ${DEAD_ZONE} %: động cơ TT không quay`,
  )
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * Thông tin trận ngoài bảng điểm (bảng điểm Đỏ | chung | Xanh ở ui/scoreboard.ts): nhật ký trận, ô kiểm tra theo luật
 * của robot đang chọn (kèm cảnh báo vùng chết) và bảng đội cuối trận (lỗi nhẹ / thẻ vàng / thẻ đỏ của từng đội). Dựng
 * vào `root` — thẻ "Sự kiện trận" của khung đáy.
 */
export function createHud(root: HTMLElement): Hud {
  injectCss()
  root.classList.add('fr-hud')
  root.replaceChildren()

  const logCard = el('section', 'fr-card')
  const logBox = el('div', 'fr-log')
  logBox.setAttribute('aria-live', 'polite')
  logCard.append(el('h2', undefined, 'Nhật ký trận'), logBox)

  const right = el('div', 'fr-card')
  const robotCard = el('section', 'fr-card')
  const tabs = el('div', 'fr-tabs')
  const sub = el('div', 'fr-sub')
  const checks = el('div', 'fr-checks')
  robotCard.append(el('h2', undefined, 'Kiểm tra theo luật'), tabs, sub, checks)

  const teamCard = el('section', 'fr-card')
  const teams = el('div', 'fr-teams')
  teamCard.append(el('h2', undefined, 'Kết quả các đội'), teams)
  teamCard.hidden = true
  right.append(teamCard, robotCard)

  root.append(logCard, right)

  let selected = 0
  let shownEvents = 0
  let tabsFor: RobotBody[] | null = null
  let lastChecks = ''
  let match0: Match | null = null

  const addLine = (time: string, text: string) => {
    const div = el('div')
    div.append(el('span', undefined, time), text)
    logBox.prepend(div)
  }

  const hud: Hud = {
    get selected() {
      return selected
    },
    log(text) {
      addLine(match0 ? stamp(match0.t, match0.practice) : '', text)
    },
    update(match, robots, cfgs, ports) {
      if (match0 !== match) {
        match0 = match
        shownEvents = 0
        logBox.replaceChildren()
        teamCard.hidden = true
        lastChecks = ''
      }
      if (selected >= robots.length) selected = 0 // nhiệm vụ: chỉ Robot 1

      // Nút chọn robot.
      if (tabsFor !== robots) {
        tabsFor = robots
        tabs.replaceChildren(
          ...robots.map((r, i) => {
            const b = el('button', undefined, `Robot ${i + 1}`)
            b.type = 'button'
            b.dataset.a = r.alliance
            b.title = `${ROBOTS[r.cfg.type].name} · liên minh ${ALLIANCE[r.alliance]}`
            b.onclick = () => {
              selected = i
              lastChecks = ''
              hud.onSelect?.(i)
            }
            return b
          }),
        )
      }
      tabs.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === selected)))

      // Ô kiểm tra luật của robot đang chọn: mức mở rộng lấy phần nhô ra trước mũi xe (vươn + tay kẹp, ruling R17a).
      const r = robots[selected]
      const cfg = cfgs[selected] ?? r?.cfg
      if (r && cfg) {
        const list = ruleChecks(cfg, r.extension)
        const dead = deadZoneLines(ports[selected])
        const key = JSON.stringify(list) + r.stored.length + r.hasFlag + (r.lastMessage ?? '') + dead.join()
        if (key !== lastChecks) {
          lastChecks = key
          sub.textContent = `${ROBOTS[cfg.type].name} · liên minh ${ALLIANCE[r.alliance]} · chở ${r.stored.length} bóng${r.hasFlag ? ' · đang giữ cờ' : ''}`
          checks.replaceChildren(
            ...list.map((c) => {
              const row = el('div', 'fr-chk')
              const tag = c.ok === 'note' ? 'note' : c.ok ? 'ok' : 'bad'
              row.append(el('i', tag, c.ok === 'note' ? 'Lưu ý' : c.ok ? 'Đạt' : 'Vượt'), el('span', undefined, c.text))
              return row
            }),
            ...dead.map((text) => {
              const row = el('div', 'fr-chk fr-dead')
              row.append(el('i', 'bad', 'Vùng chết'), el('span', undefined, text))
              return row
            }),
            ...(r.lastMessage ? [Object.assign(el('div', 'fr-chk'), { textContent: r.lastMessage })] : []),
          )
        }
      }

      // Nhật ký: sự kiện mới của trận.
      for (; shownEvents < match.events.length; shownEvents++) {
        const e = match.events[shownEvents]
        addLine(stamp(e.t, match.practice), e.text)
      }

      // Bảng đội cuối trận (chi tiết phạt; điểm đội cũng có trên màn kết quả).
      if (match.phase === 'end' && teamCard.hidden) {
        const res = match.result()
        teamCard.hidden = false
        teams.replaceChildren(
          ...res.teams.map((t, i) => {
            const p = match.pens[i]
            const pen = p.red
              ? 'thẻ đỏ'
              : [p.minor ? `${p.minor} lỗi nhẹ (−${5 * p.minor})` : '', p.yellow ? `${p.yellow} thẻ vàng (−${10 * p.yellow})` : '']
                  .filter(Boolean)
                  .join(', ') || 'không bị phạt'
            const row = el('div', 'fr-chk')
            const rb = robots[i]
            row.append(
              el('i', p.red ? 'bad' : 'ok', String(t.score)),
              el('span', undefined, `${t.team} · Robot ${i + 1} (${ROBOTS[rb.cfg.type].name}, ${ALLIANCE[rb.alliance]}) · ${pen}`),
            )
            return row
          }),
        )
      }
    },
  }
  return hud
}
