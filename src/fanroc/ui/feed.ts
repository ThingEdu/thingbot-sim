// Dòng báo cộng / trừ điểm góc dưới phải màn trận (anh Tuấn 10/11): mỗi lần điểm trận đổi ("+5 · Chữa Cháy") hoặc trọng
// tài ghi lỗi ("Kiến Lửa vươn ra ngoài rào (S02): thẻ vàng (−10)") thêm một dòng; các dòng hiện LẦN LƯỢT, dòng sau cách
// dòng trước FEED_GAP_MS để kịp đọc vì sao được / bị trừ điểm, mỗi dòng ở lại FEED_LIFE_MS rồi mờ đi.
// Phần thuần (EventFeed, foulItem) chạy được trong Node (feed.test.ts); createFeed dựng DOM.

/** Khoảng cách tối thiểu giữa hai dòng mới hiện, ms. */
export const FEED_GAP_MS = 1500
/** Mỗi dòng ở lại bấy lâu kể từ lúc hiện, ms. */
export const FEED_LIFE_MS = 6000
/** Số dòng hiện cùng lúc tối đa (cũ nhất bị đẩy ra). */
export const FEED_MAX = 5
/** Hàng chờ tối đa: dồn quá (tốc độ ×40) thì bỏ dòng cũ nhất chưa hiện. */
export const FEED_QUEUE_MAX = 12

export type FeedTone = 'plus' | 'minus' | 'warn'
export interface FeedItem {
  text: string
  tone: FeedTone
}
export type ShownItem = FeedItem & { at: number }

export class EventFeed {
  private queue: FeedItem[] = []
  private shown: ShownItem[] = []
  private lastShow = -Infinity

  push(items: FeedItem[]): void {
    this.queue.push(...items)
    if (this.queue.length > FEED_QUEUE_MAX) this.queue.splice(0, this.queue.length - FEED_QUEUE_MAX)
  }

  clear(): void {
    this.queue = []
    this.shown = []
    this.lastShow = -Infinity
  }

  /** Các dòng đang hiện lúc `now` (cũ trước, mới sau): đưa một dòng chờ ra nếu đã đủ FEED_GAP_MS, bỏ dòng hết hạn. */
  tick(now: number): ShownItem[] {
    if (this.queue.length && now - this.lastShow >= FEED_GAP_MS) {
      this.shown.push({ ...this.queue.shift()!, at: now })
      this.lastShow = now
    }
    this.shown = this.shown.filter((s) => now - s.at < FEED_LIFE_MS).slice(-FEED_MAX)
    return this.shown
  }
}

/** Dòng báo cho điểm trận đổi (chữ của scorePops: "+15 · Rãnh 3", "−3 · Bóng sai chỗ"). */
export function scoreItem(pop: string): FeedItem {
  return { text: pop, tone: pop.startsWith('+') ? 'plus' : 'minus' }
}

/**
 * Dòng báo cho một sự kiện trận nếu đó là lỗi trọng tài ghi (Match.foul: "Robot 2 vươn ra ngoài rào (S02): thẻ vàng
 * (−10)"), "Robot n" đổi thành tên đội; sự kiện khác ⇒ null. Cảnh cáo / luyện tập (không trừ điểm) ⇒ tone 'warn'.
 */
export function foulItem(e: { robot: number | null; text: string }, names: string[]): FeedItem | null {
  if (e.robot === null || !/: (cảnh cáo|lỗi nhẹ|thẻ vàng|thẻ đỏ)/.test(e.text)) return null
  const text = e.text.replace(/^Robot (\d+)/, (all, n) => names[Number(n) - 1] ?? all)
  return { text, tone: /\(−\d+\)/.test(e.text) && !/luyện tập/.test(e.text) ? 'minus' : 'warn' }
}

// ---------- DOM ----------

const CSS = `
.fd { position: absolute; right: 10px; bottom: 10px; z-index: 6; display: grid; gap: 5px; justify-items: end; max-width: min(420px, calc(100% - 20px)); pointer-events: none; }
.fd[hidden] { display: none; }
.fd-it { padding: 5px 12px; border-radius: 8px; color: #fff; font: 700 13px/1.35 var(--font); box-shadow: 0 4px 14px #0007; animation: fd-in 300ms ease-out, fd-out 600ms ease-in ${FEED_LIFE_MS - 600}ms forwards; }
.fd-it[data-tone="plus"] { background: #1f8f4ee8; }
.fd-it[data-tone="minus"] { background: #c92a3fe8; }
.fd-it[data-tone="warn"] { background: #8a6a12e8; }
@keyframes fd-in { from { transform: translateY(14px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes fd-out { to { opacity: 0 } }
`

export interface FeedView {
  render(items: ShownItem[]): void
  visible(v: boolean): void
}

export function createFeed(stage: HTMLElement): FeedView {
  if (!document.getElementById('fd-css')) {
    const s = document.createElement('style')
    s.id = 'fd-css'
    s.textContent = CSS
    document.head.append(s)
  }
  const box = document.createElement('div')
  box.className = 'fd'
  box.setAttribute('aria-label', 'Báo điểm')
  box.setAttribute('aria-live', 'polite')
  stage.append(box)
  // Dòng đã dựng theo lúc hiện: chỉ thêm / bỏ phần tử đổi để hiệu ứng không chạy lại mỗi khung hình.
  const nodes = new Map<ShownItem, HTMLElement>()
  return {
    render(items) {
      for (const [it, n] of nodes) if (!items.includes(it)) (n.remove(), nodes.delete(it))
      for (const it of items) {
        if (nodes.has(it)) continue
        const n = Object.assign(document.createElement('div'), { className: 'fd-it', textContent: it.text })
        n.dataset.tone = it.tone
        box.append(n)
        nodes.set(it, n)
      }
    },
    visible(v) {
      box.hidden = !v
    },
  }
}
