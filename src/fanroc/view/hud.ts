// Bảng điểm tiếng Việt của sân FANROC: đồng hồ, pha trận, điểm trận + từng mục, ô kiểm tra luật của robot đang chọn,
// bảng đội cuối trận và nhật ký. Chỉ đọc Match / RobotBody; không đổi trạng thái trận.
import type { Match } from '../match.ts'
import type { RobotBody } from '../robot.ts'
import { ROBOTS, ruleChecks, type RobotConfig } from '../robots.ts'

export interface Hud {
  update(match: Match, robots: RobotBody[], cfgs: RobotConfig[]): void
  /** Thêm một dòng vào nhật ký (ngoài các sự kiện của trận). */
  log(text: string): void
  /** Robot đang chọn (ô kiểm tra luật). */
  readonly selected: number
  /** Gọi khi người dùng chọn robot khác. */
  onSelect?: (i: number) => void
}

const RELEASE_S = 10
const MATCH_S = 180
/** Điểm trận tính lại tối đa chừng này lần mỗi giây (tally dò tia trên 300 bóng). */
const SCORE_HZ = 4
const ALLIANCE = { red: 'Đỏ', blue: 'Xanh' } as const
const BREAKDOWN: [keyof ReturnType<Match['result']>['score'], string][] = [
  ['fire', 'Điểm Cháy'], ['r1', 'Rãnh 1'], ['r2', 'Rãnh 2'], ['r3', 'Rãnh 3'], ['flag', 'Lá Cờ'], ['park', 'Bảo Vệ Xanh'], ['wrong', 'Sai vị trí'],
]

const CSS = `
.fr-hud { display: grid; gap: 12px; align-content: start; padding: 12px; min-width: 0; height: 100%; overflow: auto; background: #fff; border-left: 1px solid var(--line); }
.fr-card { display: grid; gap: 8px; }
.fr-card h2 { margin: 0; font-size: 14px; font-weight: 800; }
.fr-top { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.fr-clock { font: 500 30px/1 var(--mono); font-variant-numeric: tabular-nums; }
.fr-phase { font: 700 12px/1 var(--font); padding: 5px 8px; border-radius: 5px; background: var(--line); }
.fr-phase[data-end="true"] { background: var(--hi); color: #fff; }
.fr-total { font: 800 22px/1 var(--font); margin-left: auto; white-space: nowrap; }
.fr-bk { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 13px; color: var(--muted); }
.fr-bk b { color: var(--ink); font: 500 13px var(--mono); }
.fr-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.fr-tabs button { font: 600 12px var(--font); border: 1px solid var(--line); background: #fff; border-radius: 6px; padding: 5px 4px; cursor: pointer; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-tabs button[aria-pressed="true"] { background: var(--teal); border-color: var(--teal); color: #fff; }
.fr-tabs button[data-a="red"]:not([aria-pressed="true"]) { border-left: 4px solid var(--hi); }
.fr-tabs button[data-a="blue"]:not([aria-pressed="true"]) { border-left: 4px solid var(--lo); }
.fr-sub { font-size: 12px; color: var(--muted); }
.fr-checks, .fr-teams { display: grid; gap: 4px; font-size: 13px; }
.fr-chk { display: flex; gap: 8px; align-items: baseline; }
.fr-chk i { font: 700 11px var(--font); font-style: normal; padding: 2px 6px; border-radius: 4px; flex: none; }
.fr-chk i.ok { background: rgba(31, 157, 85, 0.15); color: var(--ok); }
.fr-chk i.bad { background: rgba(226, 71, 59, 0.15); color: var(--hi); }
.fr-chk i.note { background: var(--line); color: var(--muted); }
.fr-teams .fr-chk i { min-width: 34px; text-align: center; font-size: 13px; }
.fr-log { font-size: 12px; line-height: 1.45; max-height: 260px; overflow: auto; display: grid; gap: 2px; align-content: start; }
.fr-log span { color: var(--muted); font-family: var(--mono); margin-right: 6px; }
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

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

export function createHud(root: HTMLElement): Hud {
  injectCss()
  root.classList.add('fr-hud')
  root.replaceChildren()

  const board = el('section', 'fr-card')
  const top = el('div', 'fr-top')
  const clock = el('span', 'fr-clock', clockAt(-RELEASE_S))
  const phase = el('span', 'fr-phase')
  const total = el('span', 'fr-total', '0 điểm')
  top.append(clock, phase, total)
  const bk = el('div', 'fr-bk')
  board.append(top, bk)

  const robotCard = el('section', 'fr-card')
  const tabs = el('div', 'fr-tabs')
  const sub = el('div', 'fr-sub')
  const checks = el('div', 'fr-checks')
  robotCard.append(el('h2', undefined, 'Kiểm tra theo luật'), tabs, sub, checks)

  const teamCard = el('section', 'fr-card')
  const teams = el('div', 'fr-teams')
  teamCard.append(el('h2', undefined, 'Kết quả các đội'), teams)
  teamCard.hidden = true

  const logCard = el('section', 'fr-card')
  const logBox = el('div', 'fr-log')
  logBox.setAttribute('aria-live', 'polite')
  logCard.append(el('h2', undefined, 'Nhật ký trận'), logBox)

  root.append(board, robotCard, teamCard, logCard)

  let selected = 0
  let shownEvents = 0
  let tabsFor: RobotBody[] | null = null
  let lastScore = -Infinity
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
      addLine(match0 ? clockAt(match0.t) : '', text)
    },
    update(match, robots, cfgs) {
      if (match0 !== match) {
        match0 = match
        shownEvents = 0
        logBox.replaceChildren()
        teamCard.hidden = true
        lastScore = -Infinity
      }
      // Đồng hồ và pha.
      clock.textContent = clockAt(match.t)
      const end = match.phase === 'end'
      const endgame = match.phase === 'play' && match.endgame
      phase.textContent = match.phase === 'release' ? 'Xả bóng · robot đứng yên' : end ? 'Hết giờ' : endgame ? 'End Game' : 'Thi đấu'
      phase.dataset.end = String(endgame)

      // Điểm trận + từng mục.
      const now = performance.now()
      const res = end || now - lastScore >= 1000 / SCORE_HZ ? match.result() : null
      if (res) {
        lastScore = now
        total.textContent = `${res.score.total} điểm`
        bk.replaceChildren(
          ...BREAKDOWN.map(([k, name]) => {
            const s = el('span', undefined, `${name} `)
            const v = res.score[k]
            s.append(el('b', undefined, `${v > 0 ? '+' : ''}${v}`))
            return s
          }),
        )
      }

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
        const list = ruleChecks(cfg, r.forwardExtension)
        const key = JSON.stringify(list) + r.stored.length + r.hasFlag + (r.lastMessage ?? '')
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
            ...(r.lastMessage ? [Object.assign(el('div', 'fr-chk'), { textContent: r.lastMessage })] : []),
          )
        }
      }

      // Nhật ký: sự kiện mới của trận.
      for (; shownEvents < match.events.length; shownEvents++) {
        const e = match.events[shownEvents]
        addLine(clockAt(e.t), e.text)
      }

      // Bảng đội cuối trận.
      if (end && teamCard.hidden && res) {
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
