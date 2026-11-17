// Logo ThingEdu (bản Bridge, ThingEdu-Brand/01-logo/direction-b-bridge — anh Tuấn chọn 18/11 cho 0.9.2) và Maker Việt,
// trên một nền trắng bo tròn (logo Maker Việt nền trắng). Dùng ở màn chính, ⚙ › Nguồn và màn tải lúc mở app.

export interface Logo {
  name: string
  src: string
  /** Chiều cao hiện (px) theo cỡ dải; rộng tự theo tỉ lệ ảnh. */
  scale: number
}

export const LOGOS: readonly Logo[] = [
  { name: 'ThingEdu', src: new URL('../assets/brand/thingedu.svg', import.meta.url).href, scale: 1 },
  { name: 'Maker Việt', src: new URL('../assets/brand/maker-viet.png', import.meta.url).href, scale: 1.2 },
]

/** Dải hai logo; `h` = chiều cao logo (px). */
export function brandStrip(h = 34): HTMLElement {
  const box = document.createElement('div')
  box.className = 'br-strip'
  box.setAttribute('role', 'group')
  box.setAttribute('aria-label', 'ThingEdu · Maker Việt')
  box.style.cssText = `display:inline-flex;align-items:center;gap:${Math.round(h * 0.5)}px;background:#fff;border-radius:${Math.round(h * 0.4)}px;padding:${Math.round(h * 0.18)}px ${Math.round(h * 0.45)}px;box-shadow:0 4px 14px #0005`
  for (const l of LOGOS) {
    const img = document.createElement('img')
    img.src = l.src
    img.alt = l.name
    img.title = l.name
    img.style.cssText = `height:${Math.round(h * l.scale)}px;width:auto;display:block`
    box.append(img)
  }
  return box
}
