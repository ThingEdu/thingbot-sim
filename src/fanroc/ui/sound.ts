// Âm thanh trận tự tạo bằng WebAudio (không tệp): còi bắt đầu / hết giờ, tiếng "bíp" đếm ngược, "ting" khi ghi điểm.
// AudioContext chỉ được tạo ở lần bấm / gõ phím đầu tiên của người dùng (chính sách tự phát của trình duyệt); trước đó
// và khi `enabled()` là false thì im lặng. Mọi lỗi WebAudio đều nuốt im (âm thanh không bao giờ làm vỡ trận).

/** Phần AudioContext mà mô-đun dùng (để thử trong Node bằng bản giả). */
export interface AudioLike {
  readonly currentTime: number
  readonly destination: unknown
  state?: string
  resume?(): Promise<void> | void
  createOscillator(): {
    type: string
    frequency: { setValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime?(v: number, t: number): void }
    connect(n: unknown): unknown
    start(t?: number): void
    stop(t?: number): void
  }
  createGain(): {
    gain: { setValueAtTime(v: number, t: number): void; linearRampToValueAtTime(v: number, t: number): void; exponentialRampToValueAtTime(v: number, t: number): void }
    connect(n: unknown): unknown
  }
}

export interface Sound {
  /** Còi: ngắn khi bắt đầu, dài (`long`) khi hết giờ. */
  whistle(long?: boolean): void
  /** Đếm ngược 3 · 2 · 1. */
  beep(): void
  /** Ghi điểm. */
  ting(): void
}

const defaultFactory = (): AudioLike | null => {
  const C = (globalThis as { AudioContext?: new () => AudioLike; webkitAudioContext?: new () => AudioLike }).AudioContext ??
    (globalThis as { webkitAudioContext?: new () => AudioLike }).webkitAudioContext
  return C ? new C() : null
}

/**
 * `enabled`: đọc mỗi lần phát (Cài đặt → Âm thanh, `store.settings().sound`). `gesture`: nơi nghe lần bấm / gõ phím
 * đầu tiên để tạo AudioContext (mặc định `document`).
 */
export function createSound(enabled: () => boolean, gesture: EventTarget | null = globalThis.document ?? null, factory: () => AudioLike | null = defaultFactory): Sound {
  let ctx: AudioLike | null = null
  let failed = false
  const unlock = () => {
    if (failed) return
    try {
      ctx ??= factory()
      if (!ctx) failed = true
      else if (ctx.state === 'suspended') void Promise.resolve(ctx.resume?.()).catch(() => {})
    } catch {
      failed = true
      ctx = null
    }
  }
  for (const ev of ['pointerdown', 'keydown']) gesture?.addEventListener(ev, unlock, { capture: true, passive: true } as AddEventListenerOptions)

  /** Một nốt: dao động `type` tần số `f` (Hz), âm lượng `vol`, dài `dur` giây, bắt đầu sau `at` giây; `slide` = tần số cuối. */
  const tone = (f: number, dur: number, vol: number, type = 'sine', at = 0, slide?: number) => {
    if (!ctx) return
    const t0 = ctx.currentTime + at
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(f, t0)
    if (slide) o.frequency.exponentialRampToValueAtTime?.(slide, t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(g)
    g.connect(ctx.destination)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
  }
  const play = (f: () => void) => {
    if (!ctx || !enabled()) return
    try {
      f()
    } catch {
      /* WebAudio lỗi: im lặng */
    }
  }
  return {
    whistle(long = false) {
      // Còi trọng tài: hai dao động gần nhau (rè), ngắt nhịp; hết giờ ba hồi.
      play(() => {
        const n = long ? 3 : 1
        for (let k = 0; k < n; k++) {
          const at = k * 0.42
          const dur = long && k === n - 1 ? 0.8 : 0.32
          tone(2350, dur, 0.12, 'square', at)
          tone(2420, dur, 0.08, 'triangle', at)
        }
      })
    },
    beep() {
      play(() => tone(880, 0.14, 0.2, 'sine'))
    },
    ting() {
      play(() => {
        tone(1568, 0.35, 0.18, 'sine')
        tone(2093, 0.4, 0.12, 'sine', 0.06)
      })
    },
  }
}
