// Màn nhiệm vụ con rùa (spec §6.1 ① ②, §6.3): ① danh sách 12 nhiệm vụ theo 4 chặng (thẻ "N – Tên", một câu mục tiêu,
// thanh độ khó 5 ô, ✓, số ⭐; không khoá cứng), ② phần phủ trên sân khi làm nhiệm vụ — dòng tên + HƯỚNG DẪN (trượt
// từng bước) + Chấm, thẻ thử thách góc dưới trái (mục tiêu tự tích ✓ theo bộ chấm, gợi ý gỡ lỗi), ô số đo góc dưới
// phải (khi nhiệm vụ có điều kiện đo), màn sao khi chấm xong. Trang (main.ts) dựng phiên chơi, vệt, lúc chấm.
// Phần thuần (DIFFICULTY, measureText, mergeProgress, saveMissionVerified, missionCards) chạy được trong Node.
import { MISSIONS } from '../missions/data.ts'
import { grade } from '../missions/grade.ts'
import type { GradeResult, Mission } from '../missions/types.ts'
import type { MissionProgress, Store } from '../store.ts'
import { icon } from './icons.ts'

export const STAGE_NAMES: Record<Mission['stage'], string> = { 1: 'Hai bánh xe', 2: 'Con rùa robot', 3: 'Việc trên sân', 4: 'Thi đấu' }

/** Độ khó (1–5 ô) của từng nhiệm vụ theo số thứ tự (R97: người dựng chọn theo số khối và độ chính xác cần). */
export const DIFFICULTY: Record<number, 1 | 2 | 3 | 4 | 5> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 3, 10: 3, 11: 4, 12: 5 }

export const PROGRESS_FAILED = 'Không lưu được tiến độ — trình duyệt đang chặn bộ nhớ hoặc bộ nhớ đã đầy.'

const comma = (s: string) => s.replace('.', ',')

/** Chữ ô số đo: quãng (m, 2 chữ số sau dấu phẩy), góc đã quay (độ nguyên), thời gian (s, 1 chữ số). */
export function measureText(t: { distance: number; turned: number; time: number }): { distance: string; turned: string; time: string } {
  return { distance: `${comma(t.distance.toFixed(2))} m`, turned: `${Math.round(t.turned)}°`, time: `${comma(t.time.toFixed(1))} s` }
}

/** Nhiệm vụ có điều kiện đo (quãng / góc) ở mức sao nào đó ⇒ hiện ô số đo. */
export function hasMeasure(m: Mission): boolean {
  return [...m.goals, ...m.stars.two, ...m.stars.three].some((g) => g.type === 'measure')
}

/** Gộp kết quả lần chạy vào tiến độ: ✓ và số sao tốt nhất không bao giờ giảm; chương trình là bản đang làm. */
export function mergeProgress(prev: MissionProgress, r: { done: boolean; stars: 0 | 1 | 2 | 3 }, program: object | null): MissionProgress {
  return { done: prev.done || r.done, stars: Math.max(prev.stars, r.stars) as MissionProgress['stars'], program }
}

/** Lưu tiến độ một nhiệm vụ rồi đọc lại: chỉ báo đã lưu khi đọc lại đúng nội dung (như saveVerified của Xưởng). */
export function saveMissionVerified(store: Pick<Store, 'saveMission' | 'mission'>, id: string, p: MissionProgress): { ok: boolean; text: string } {
  store.saveMission(id, p)
  return JSON.stringify(store.mission(id)) === JSON.stringify(p) ? { ok: true, text: 'Đã lưu tiến độ' } : { ok: false, text: PROGRESS_FAILED }
}

/** Mục tiêu của nhiệm vụ trước khi chạy (chưa tích): chữ lấy từ bộ chấm, `ok` = null. */
export function pendingGoals(m: Mission): { text: string; ok: null }[] {
  const none = { start: m.start, end: m.start, trail: { distance: 0, turned: 0, time: 0 }, touchedMountain: false, events: [], program: null }
  return grade(m, none).goals.map((g) => ({ text: g.text, ok: null }))
}

export interface MissionCard {
  id: string
  n: number
  stage: Mission['stage']
  title: string
  goal: string
  difficulty: number
  done: boolean
  stars: number
}

export function missionCards(store: Pick<Store, 'mission'>): MissionCard[] {
  return MISSIONS.map((m) => {
    const p = store.mission(m.id)
    return { id: m.id, n: m.n, stage: m.stage, title: m.title, goal: m.goal, difficulty: DIFFICULTY[m.n], done: p.done, stars: p.stars }
  })
}

/** Tổng số sao tốt nhất của mọi nhiệm vụ (chip màn chính). */
export function totalStars(store: Pick<Store, 'mission'>): number {
  return MISSIONS.reduce((s, m) => s + store.mission(m.id).stars, 0)
}

// ---------- DOM ----------
const CSS = `
.ml-stage { display: grid; gap: 10px; max-width: 1100px; }
.ml-stage h2 { margin: 6px 0 0; font-size: 15px; letter-spacing: .6px; text-transform: uppercase; color: #ffcf5a; }
.ml-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.ml-card { position: relative; text-align: left; display: grid; gap: 6px; align-content: start; background: #0009; color: #eef2fa; border: 2px solid #fff2; border-radius: 12px; padding: 12px; cursor: pointer; font: inherit; }
.ml-card:hover, .ml-card:focus-visible { border-color: #ffcf5a; }
.ml-card[data-current="true"] { border-color: #ffcf5a; box-shadow: 0 0 0 2px #ffcf5a55; }
.ml-card h3 { margin: 0; font-size: 15px; padding-right: 26px; }
.ml-card p { margin: 0; font-size: 12.5px; line-height: 1.45; color: #c8d0ea; }
.ml-card .ok { position: absolute; right: 10px; top: 10px; width: 22px; height: 22px; border-radius: 50%; background: #1fa860; color: #fff; display: grid; place-items: center; }
.ml-foot { display: flex; align-items: center; gap: 10px; justify-content: space-between; font-size: 11.5px; color: #aab3c7; }
.ml-diff { display: inline-flex; gap: 3px; align-items: center; }
.ml-diff i { width: 12px; height: 6px; border-radius: 2px; background: #333a55; }
.ml-diff i[data-on="true"] { background: #ff7a1a; }
.ml-stars { display: inline-flex; gap: 1px; color: #4a5070; }
.ml-stars svg[data-on="true"] { color: #ffcf5a; }
/* Khung bên "Nhiệm vụ": danh sách gọn. */
.ml-side { flex: 1; overflow: auto; padding: 8px; display: grid; gap: 6px; align-content: start; background: #10183c; font-family: var(--font); }
.ml-side .ml-card { padding: 9px 10px; }
.ml-side .ml-card p { display: none; }
.ml-side h2 { margin: 4px 2px 0; font-size: 11.5px; color: #ffcf5a; letter-spacing: .6px; text-transform: uppercase; }
/* Phần phủ trên sân của màn ②. */
.mi { position: absolute; inset: 0; pointer-events: none; z-index: 12; font-family: var(--font); color: #eef2fa; }
.mi[hidden] { display: none; }
.mi > * { pointer-events: auto; }
.mi-head { position: absolute; left: 10px; top: 56px; max-width: calc(100% - 20px); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; background: #0b1440e0; border-radius: 10px; padding: 6px 8px 6px 12px; box-shadow: 0 4px 14px #0007; }
.mi-head b { font-size: 13.5px; }
.mi-head .st { display: inline-flex; gap: 3px; align-items: center; font-size: 12.5px; color: #ffcf5a; }
.mi-head .tm { font: 12.5px var(--mono); color: #c8d0ea; font-variant-numeric: tabular-nums; }
.mi button { display: inline-flex; gap: 5px; align-items: center; font: 800 12.5px var(--font); border: 1px solid #fff4; background: #ffffff1a; color: #fff; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
.mi button:hover, .mi button:focus-visible { background: #ffffff33; }
.mi button.main { background: #1fa860; border-color: #1fa860; }
.mi-guide { position: absolute; left: 10px; top: 104px; width: min(380px, calc(100% - 20px)); box-sizing: border-box; background: #fffdf6; color: #221; border-radius: 12px; padding: 12px 14px; box-shadow: 0 8px 24px #0009; display: grid; gap: 8px; }
.mi-guide[hidden] { display: none; }
.mi-guide h3 { margin: 0; font-size: 13px; color: #a35f00; }
.mi-guide p { margin: 0; font-size: 14px; line-height: 1.5; min-height: 3em; }
.mi-guide .row { display: flex; gap: 6px; align-items: center; }
.mi-guide .row span { flex: 1; font-size: 12px; color: #776; }
.mi-guide button { background: #f2efe6; color: #221; border-color: #d8d2c2; }
.mi-guide button.main { background: #1fa860; color: #fff; border-color: #1fa860; }
.mi-guide button:disabled { opacity: .4; cursor: default; }
.mi-foot { position: absolute; left: 10px; right: 10px; bottom: 10px; display: flex; flex-wrap: wrap-reverse; gap: 8px; align-items: flex-end; justify-content: space-between; pointer-events: none; }
.mi-foot > * { pointer-events: auto; }
.mi-card { flex: 0 1 340px; min-width: 0; box-sizing: border-box; background: #0b1440e6; border-radius: 12px; padding: 10px 12px; box-shadow: 0 4px 14px #0007; display: grid; gap: 6px; }
.mi-card h4 { margin: 0; font-size: 12px; letter-spacing: .6px; text-transform: uppercase; color: #ffcf5a; }
.mi-card ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 3px; font-size: 13px; }
.mi-card li { display: flex; gap: 6px; align-items: flex-start; line-height: 1.35; }
.mi-card li i { flex: none; width: 16px; height: 16px; margin-top: 1px; border-radius: 50%; border: 2px solid #6b7396; box-sizing: border-box; display: grid; place-items: center; }
.mi-card li[data-ok="true"] i { background: #1fa860; border-color: #1fa860; }
.mi-card li[data-ok="true"] { color: #b9f0cf; }
.mi-hint { font-size: 12.5px; color: #ffd9a0; line-height: 1.45; }
.mi-hint:empty { display: none; }
.mi-meas { flex: none; background: #0b1440e6; border-radius: 12px; padding: 8px 12px; box-shadow: 0 4px 14px #0007; display: grid; gap: 2px; font-size: 12px; color: #aab3c7; }
.mi-meas[hidden] { display: none; }
.mi-meas b { font: 700 16px var(--mono); color: #fff; font-variant-numeric: tabular-nums; }
.mi-meas div { display: flex; gap: 10px; justify-content: space-between; align-items: baseline; }
.mi[data-only="true"] > :not(.mi-res) { display: none; }
.mi-note { font-size: 12px; color: #ff8a7a; font-weight: 700; }
.mi-note:empty { display: none; }
.mi-res { position: absolute; inset: 0; z-index: 45; display: grid; place-items: center; padding: 12px; background: #05060dbb; }
.mi-res[hidden] { display: none; }
.mi-res-card { width: min(440px, 100%); max-height: 100%; overflow: auto; box-sizing: border-box; display: grid; gap: 10px; justify-items: center; text-align: center; padding: 18px; border-radius: 16px; background: #12141f; box-shadow: 0 10px 40px #000a; }
.mi-res-card h2 { margin: 0; font: 900 20px var(--font); letter-spacing: 1px; color: #ffd23f; }
.mi-res-card[data-done="false"] h2 { color: #ff9a7a; }
.mi-res-card p { margin: 0; font-size: 13.5px; line-height: 1.5; color: #d6dbef; }
.mi-res-stars { display: flex; gap: 6px; color: #3a4060; }
.mi-res-stars svg[data-on="true"] { color: #ffcf5a; animation: mi-pop .5s cubic-bezier(.3,1.6,.5,1) both; }
.mi-res-stars svg:nth-child(2) { animation-delay: .25s; }
.mi-res-stars svg:nth-child(3) { animation-delay: .5s; }
@keyframes mi-pop { 0% { transform: scale(0) rotate(-40deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .mi-res-stars svg[data-on="true"] { animation: none; } }
.mi-res-card .acts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.mi-res-card .note { font-size: 12px; color: #aab3c7; }
.mi-res-card .note[data-ok="false"] { color: #ff8a7a; font-weight: 700; }
@media (max-width: 600px) {
  .mi-head { top: 52px; padding: 5px 6px 5px 10px; }
  .mi-head b { font-size: 12.5px; }
  .mi-card { flex-basis: 100%; padding: 8px 10px; }
  .mi-card ul { font-size: 12px; }
}
`

function injectCss(): void {
  if (document.getElementById('ml-css')) return
  const s = document.createElement('style')
  s.id = 'ml-css'
  s.textContent = CSS
  document.head.append(s)
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const btn = (text: string, onClick: () => void, cls?: string, ic?: Parameters<typeof icon>[0]): HTMLButtonElement => {
  const b = el('button', cls)
  b.type = 'button'
  if (ic) b.append(icon(ic, 15))
  b.append(text)
  b.onclick = onClick
  return b
}

/** Ba ngôi sao, `n` sao đầu sáng. */
function stars(n: number, size: number, cls: string): HTMLElement {
  const box = el('span', cls)
  box.setAttribute('aria-label', `${n} trên 3 sao`)
  for (let k = 0; k < 3; k++) {
    const s = icon('star', size)
    s.dataset.on = String(k < n)
    box.append(s)
  }
  return box
}

function cardEl(c: MissionCard, current: string | null, open: (id: string) => void): HTMLButtonElement {
  const b = el('button', 'ml-card')
  b.type = 'button'
  b.dataset.mission = c.id
  b.dataset.n = String(c.n)
  b.dataset.done = String(c.done)
  b.dataset.stars = String(c.stars)
  if (c.id === current) b.dataset.current = 'true'
  b.append(el('h3', undefined, `${c.n} – ${c.title}`), el('p', undefined, c.goal))
  if (c.done) {
    const ok = el('span', 'ok')
    ok.setAttribute('aria-label', 'Đã đạt')
    ok.append(icon('check', 14))
    b.append(ok)
  }
  const diff = el('span', 'ml-diff')
  diff.setAttribute('aria-label', `Độ khó ${c.difficulty} trên 5`)
  diff.title = `Độ khó ${c.difficulty}/5`
  for (let k = 0; k < 5; k++) {
    const i = el('i')
    i.dataset.on = String(k < c.difficulty)
    diff.append(i)
  }
  const foot = el('div', 'ml-foot')
  foot.append(diff, stars(c.stars, 15, 'ml-stars'))
  b.append(foot)
  b.onclick = () => open(c.id)
  return b
}

/** Các chặng, mỗi chặng một danh sách thẻ. */
function stageLists(cards: MissionCard[], current: string | null, open: (id: string) => void): HTMLElement[] {
  return ([1, 2, 3, 4] as const).map((st) => {
    const sec = el('section', 'ml-stage')
    sec.dataset.stage = String(st)
    const list = el('div', 'ml-cards')
    list.append(...cards.filter((c) => c.stage === st).map((c) => cardEl(c, current, open)))
    sec.append(el('h2', undefined, `Chặng ${st} · ${STAGE_NAMES[st]}`), list)
    return sec
  })
}

export interface MissionList {
  readonly shown: boolean
  show(cards: MissionCard[]): void
  hide(): void
}

/** Màn ①: phủ lên sân như màn chính (lớp `.hm` của home.ts). */
export function createMissionList(root: HTMLElement, on: { open(id: string): void; home(): void }): MissionList {
  injectCss()
  const box = el('section', 'hm')
  box.dataset.screen = 'missions'
  box.setAttribute('aria-label', 'Nhiệm vụ con rùa')
  box.hidden = true
  const inner = el('div', 'hm-in')
  box.append(inner)
  root.append(box)
  return {
    get shown() {
      return !box.hidden
    },
    show(cards) {
      const head = el('div', 'hm-top')
      const brand = el('div', 'hm-brand')
      const done = cards.filter((c) => c.done).length
      const total = cards.reduce((s, c) => s + c.stars, 0)
      brand.append(el('h1', undefined, 'Nhiệm vụ con rùa'), el('div', 'hm-sub', `Robot để lại vệt trên sân như bút của con rùa. Đã xong ${done}/${cards.length} nhiệm vụ · ${total} sao. Làm theo thứ tự hay nhảy cóc đều được.`))
      const back = btn('Về màn chính', on.home, undefined, 'home')
      const acts = el('div', 'pk-acts')
      acts.append(back)
      head.append(brand, acts)
      inner.replaceChildren(head, ...stageLists(cards, null, on.open))
      box.hidden = false
      box.scrollTop = 0
      inner.querySelector<HTMLElement>('.ml-card[data-done="false"]')?.focus()
    },
    hide() {
      box.hidden = true
    },
  }
}

/** Khung bên "Nhiệm vụ" của màn ②: danh sách gọn, nhiệm vụ đang làm sáng viền. */
export function renderSideList(container: HTMLElement, cards: MissionCard[], current: string, open: (id: string) => void): void {
  injectCss()
  const box = el('div', 'ml-side')
  for (const sec of stageLists(cards, current, open)) {
    const h = sec.querySelector('h2')!
    box.append(h, ...sec.querySelectorAll('.ml-card'))
  }
  container.replaceChildren(box)
}

export interface MissionHud {
  /** Vào nhiệm vụ: tên, mục tiêu (chưa tích), ô số đo nếu cần, số sao tốt nhất đã đạt. */
  show(m: Mission, best: number): void
  hide(): void
  /** Thẻ thử thách: mục tiêu (ok = null ⇒ chưa chạy) và gợi ý. */
  goals(rows: { text: string; ok: boolean | null }[], hint: string | null): void
  /** Ô số đo và đồng hồ (s kể từ ▶). */
  measure(t: { distance: number; turned: number; time: number }): void
  /** Màn sao sau khi chấm. `saved` = dòng báo lưu tiến độ. */
  result(r: GradeResult, best: number, saved: { ok: boolean; text: string }, actions: { retry(): void; list(): void; next?(): void }): void
  hideResult(): void
  readonly resultShown: boolean
  /** Dòng báo trên đầu (lưu chương trình không được…); null xoá. */
  note(text: string | null): void
}

/** Màn ②: phần phủ trên sân (đặt trong `stage`). */
export function createMissionHud(stage: HTMLElement, on: { grade(): void; list(): void }): MissionHud {
  injectCss()
  const root = el('div', 'mi')
  root.hidden = true
  root.dataset.role = 'mission'
  const head = el('div', 'mi-head')
  const title = el('b')
  const best = el('span', 'st')
  const timer = el('span', 'tm')
  timer.setAttribute('aria-label', 'Thời gian kể từ khi bấm Chạy')
  const guideBtn = btn('HƯỚNG DẪN', () => toggleGuide(), undefined, 'missions')
  guideBtn.dataset.role = 'guide'
  guideBtn.setAttribute('aria-expanded', 'false')
  const gradeBtn = btn('Chấm', () => on.grade(), 'main', 'check')
  gradeBtn.dataset.role = 'grade'
  gradeBtn.title = 'Chấm lần chạy này ngay (không chờ robot đứng yên)'
  const listBtn = btn('Danh sách', () => on.list())
  listBtn.title = 'Về danh sách nhiệm vụ'
  const noteEl = el('span', 'mi-note')
  noteEl.setAttribute('role', 'status')
  head.append(title, best, timer, guideBtn, gradeBtn, listBtn, noteEl)

  const guide = el('div', 'mi-guide')
  guide.hidden = true
  guide.setAttribute('role', 'dialog')
  guide.setAttribute('aria-label', 'Hướng dẫn')
  const gTitle = el('h3')
  const gText = el('p')
  gText.setAttribute('aria-live', 'polite')
  const gPos = el('span')
  const prev = btn('Trước', () => turn(-1))
  const next = btn('Tiếp', () => turn(1), 'main')
  const close = btn('Đóng', () => toggleGuide(false))
  const gRow = el('div', 'row')
  gRow.append(gPos, prev, next, close)
  guide.append(gTitle, gText, gRow)

  const foot = el('div', 'mi-foot')
  const card = el('div', 'mi-card')
  card.dataset.role = 'challenge'
  const list = el('ul')
  const hint = el('div', 'mi-hint')
  hint.dataset.role = 'hint'
  card.append(el('h4', undefined, 'Thử thách'), list, hint)
  const meas = el('div', 'mi-meas')
  meas.dataset.role = 'measure'
  const mDist = el('b')
  const mTurn = el('b')
  const mTime = el('b')
  const mrow = (label: string, v: HTMLElement) => {
    const d = el('div')
    d.append(label, v)
    return d
  }
  meas.append(mrow('Quãng đã đi', mDist), mrow('Góc đã quay', mTurn), mrow('Thời gian', mTime))
  foot.append(card, meas)

  const res = el('div', 'mi-res')
  res.hidden = true
  root.append(head, guide, foot, res)
  stage.append(root)

  let steps: string[] = []
  let at = 0
  const showStep = () => {
    gText.textContent = steps[at] ?? ''
    gPos.textContent = `Bước ${at + 1}/${steps.length}`
    prev.disabled = at === 0
    next.disabled = at >= steps.length - 1
  }
  const turn = (d: number) => {
    at = Math.max(0, Math.min(steps.length - 1, at + d))
    showStep()
  }
  const toggleGuide = (open = guide.hidden) => {
    guide.hidden = !open
    guideBtn.setAttribute('aria-expanded', String(open))
    if (open) {
      at = 0
      showStep()
    }
  }
  const setBest = (n: number) => {
    best.replaceChildren(icon('star', 14), `${n}/3`)
    best.title = `Tốt nhất: ${n} sao`
  }
  let lastRows = ''
  let lastMeas = ''

  const api: MissionHud = {
    show(m, b) {
      title.textContent = `Chặng ${m.stage} · Nhiệm vụ ${m.n} · ${m.title}`
      setBest(b)
      steps = m.guide
      gTitle.textContent = `Hướng dẫn · Nhiệm vụ ${m.n}`
      toggleGuide(false)
      meas.hidden = !hasMeasure(m)
      lastRows = ''
      lastMeas = ''
      api.hideResult()
      api.note(null)
      delete root.dataset.only
      root.hidden = false
    },
    hide() {
      root.hidden = true
      delete root.dataset.only
      api.hideResult()
    },
    note(text) {
      noteEl.textContent = text ?? ''
    },
    goals(rows, h) {
      const key = JSON.stringify([rows, h])
      if (key === lastRows) return
      lastRows = key
      list.replaceChildren(
        ...rows.map((r) => {
          const li = el('li')
          li.dataset.ok = String(r.ok === true)
          const i = el('i')
          if (r.ok) i.append(icon('check', 11))
          li.append(i, r.text)
          return li
        }),
      )
      hint.textContent = h ?? ''
    },
    measure(t) {
      const x = measureText(t)
      const key = `${x.distance}|${x.turned}|${x.time}`
      if (key === lastMeas) return
      lastMeas = key
      mDist.textContent = x.distance
      mTurn.textContent = x.turned
      mTime.textContent = x.time
      timer.textContent = x.time
    },
    result(r, b, saved, actions) {
      // Ngoài màn ② (nhiệm vụ trận: màn Trận lẻ) chỉ hiện màn sao.
      if (root.hidden) {
        root.dataset.only = 'true'
        root.hidden = false
      }
      setBest(b)
      const c = el('div', 'mi-res-card')
      c.dataset.done = String(r.done)
      c.dataset.stars = String(r.stars)
      c.setAttribute('role', 'dialog')
      const h = r.done ? (r.stars === 3 ? 'XUẤT SẮC!' : 'HOÀN THÀNH!') : 'CHƯA ĐẠT'
      c.append(el('h2', undefined, h), stars(r.stars, 44, 'mi-res-stars'))
      c.append(el('p', undefined, r.done ? `Em được ${r.stars} sao${b > r.stars ? ` (tốt nhất: ${b} sao)` : ''}.` : 'Lần này chưa đạt mục tiêu. Xem vệt robot, sửa rồi thử lại nhé.'))
      if (r.hint) c.append(el('p', undefined, r.hint))
      const note = el('div', 'note', saved.text)
      note.dataset.ok = String(saved.ok)
      const acts = el('div', 'acts')
      acts.append(btn(root.dataset.only ? 'Xem kết quả trận' : 'Xem lại vệt', () => api.hideResult()), btn('Làm lại', actions.retry, actions.next ? undefined : 'main', 'reset'))
      if (actions.next) acts.append(btn('Nhiệm vụ tiếp', actions.next, 'main'))
      acts.append(btn('Danh sách', actions.list))
      c.append(acts, note)
      res.replaceChildren(c)
      res.hidden = false
    },
    hideResult() {
      res.hidden = true
      res.replaceChildren()
      if (root.dataset.only) {
        delete root.dataset.only
        root.hidden = true
      }
    },
    get resultShown() {
      return !res.hidden
    },
  }
  return api
}
