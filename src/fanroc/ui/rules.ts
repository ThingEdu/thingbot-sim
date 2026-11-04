// Màn "Luật chơi" (spec §6.7): lưới thẻ ngắn phủ lên sân 3D đang quay chậm, như màn chính. Màn này chung cho mọi đề —
// nội dung thẻ (lời, số điểm, hình SVG) do mùa giải cấp (FANROC 2026–2027: ../rules-data.ts), §6.8.
import type { RuleCard } from '../rules-data.ts'
import { injectCss as homeCss } from './home.ts'
import { icon } from './icons.ts'

const CSS = `
.rl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 14px; }
.rl-card { background: #0b1230d9; border: 1px solid #fff2; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rl-card h2 { margin: 0; font-size: 18px; font-weight: 900; color: #ffcf5a; letter-spacing: .3px; }
.rl-card p { margin: 0; font-size: 13.5px; line-height: 1.5; color: #e4e8f5; }
.rl-art { margin: 0; background: #f7f6f1; border-radius: 10px; padding: 6px; }
.rl-art svg { display: block; width: 100%; height: auto; max-height: 300px; }
.rl-card ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.5; color: #dde3f2; }
.rl-card li + li { margin-top: 3px; }
.rl-card table { border-collapse: collapse; width: 100%; font-size: 13px; }
.rl-card td { padding: 5px 6px; border-top: 1px solid #fff1; vertical-align: top; color: #e4e8f5; line-height: 1.4; }
.rl-card td.v { text-align: right; font-weight: 900; color: #ffcf5a; white-space: nowrap; font-size: 14px; }
.rl-card tr[data-wide] td.v { white-space: normal; text-align: left; font-weight: 500; color: #e4e8f5; font-size: 13px; }
.rl-card tr[data-wide] td:first-child { font-weight: 800; color: #fff; width: 38%; }
.rl-note { font-size: 12px !important; color: #aab3c7 !important; }
`

function injectCss(): void {
  homeCss()
  if (document.getElementById('rl-css')) return
  const s = document.createElement('style')
  s.id = 'rl-css'
  s.textContent = CSS
  document.head.append(s)
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** Một thẻ: tiêu đề, hình, câu dẫn, bảng / gạch đầu dòng, ghi chú. */
function card(c: RuleCard): HTMLElement {
  const a = el('article', 'rl-card')
  a.dataset.card = c.id
  a.setAttribute('aria-labelledby', `rl-${c.id}`)
  const h = el('h2', undefined, c.title)
  h.id = `rl-${c.id}`
  const fig = el('figure', 'rl-art')
  fig.innerHTML = c.art // SVG dựng sẵn trong mã mùa giải (không có dữ liệu người dùng)
  fig.querySelector('svg')?.setAttribute('aria-label', c.alt)
  a.append(h, fig, el('p', undefined, c.lead))
  if (c.rows?.length) {
    const t = el('table')
    // Bảng điểm: cột số hẹp bên phải; bảng lỗi: cột thứ hai là lời giải thích.
    const wide = c.rows.some((r) => r.value.length > 12)
    for (const r of c.rows) {
      const tr = el('tr')
      if (wide) tr.dataset.wide = ''
      tr.append(el('td', undefined, r.label), el('td', 'v', r.value))
      t.append(tr)
    }
    a.append(t)
  }
  if (c.bullets?.length) {
    const ul = el('ul')
    for (const b of c.bullets) ul.append(el('li', undefined, b))
    a.append(ul)
  }
  if (c.note) a.append(el('p', 'rl-note', c.note))
  return a
}

export interface RulesScreen {
  readonly shown: boolean
  show(): void
  hide(): void
}

export function createRules(root: HTMLElement, o: { season: string; cards: () => RuleCard[]; home(): void }): RulesScreen {
  injectCss()
  const box = el('section', 'hm')
  box.dataset.screen = 'rules'
  box.setAttribute('aria-label', 'Luật chơi')
  box.hidden = true
  const inner = el('div', 'hm-in')
  box.append(inner)
  root.append(box)
  let built = false
  const back = el('button')
  back.type = 'button'
  back.append(icon('home', 18), 'Về màn chính')
  back.onclick = o.home
  const build = () => {
    const head = el('div', 'hm-brand')
    const h1 = el('h1')
    h1.append('LUẬT ', el('b', undefined, 'CHƠI'))
    head.append(h1, el('div', 'hm-sub', `${o.season} · tóm tắt bằng lời của game để em làm quen trước khi làm robot thật.`))
    const top = el('div', 'hm-top')
    const acts = el('div', 'pk-acts')
    acts.append(back)
    top.append(head, acts)
    const grid = el('div', 'rl-grid')
    for (const c of o.cards()) grid.append(card(c))
    inner.replaceChildren(top, grid)
    built = true
  }
  return {
    get shown() {
      return !box.hidden
    },
    show() {
      if (!built) build()
      box.hidden = false
      box.scrollTop = 0
      back.focus()
    },
    hide() {
      box.hidden = true
    },
  }
}
