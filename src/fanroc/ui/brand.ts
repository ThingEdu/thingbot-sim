// Logo ThingEdu (khối chữ T màu chuyển + chữ THING EDU, đúng ảnh anh Tuấn gửi 18/11; thay bản Bridge của 0.9.2) và Maker
// Việt, cách nhau một vạch mảnh, trên nền trắng bo tròn — theo đúng dải mẫu anh gửi. Dùng ở màn chính, ⚙ › Nguồn, màn tải.

export interface Logo {
  name: string
  src: string
  /** Chiều cao ảnh = h × scale (px); rộng tự theo tỉ lệ ảnh. Tỉ lệ đo trên dải mẫu: phần vẽ ThingEdu cao 48, Maker Việt 41. */
  scale: number
}

export const LOGOS: readonly Logo[] = [
  // thingedu.png có lề 4 px trên / dưới quanh phần vẽ 48 px ⇒ 56 / 48
  { name: 'ThingEdu', src: new URL('../assets/brand/thingedu.png', import.meta.url).href, scale: 56 / 48 },
  { name: 'Maker Việt', src: new URL('../assets/brand/maker-viet.png', import.meta.url).href, scale: 41 / 48 },
]

/** Dải hai logo; `h` = chiều cao logo (px). */
export function brandStrip(h = 34): HTMLElement {
  const box = document.createElement('div')
  box.className = 'br-strip'
  box.setAttribute('role', 'group')
  box.setAttribute('aria-label', 'ThingEdu · Maker Việt')
  box.style.cssText = `display:inline-flex;align-items:center;gap:${Math.round(h * 0.5)}px;background:#fff;border-radius:${Math.round(h * 0.4)}px;padding:${Math.round(h * 0.18)}px ${Math.round(h * 0.45)}px;box-shadow:0 4px 14px #0005`
  LOGOS.forEach((l, k) => {
    if (k > 0) {
      const bar = document.createElement('span')
      bar.style.cssText = `width:1px;height:${Math.round(h * 0.7)}px;background:#d6d9e0`
      box.append(bar)
    }
    const img = document.createElement('img')
    img.src = l.src
    img.alt = l.name
    img.title = l.name
    img.style.cssText = `height:${Math.round(h * l.scale)}px;width:auto;display:block`
    box.append(img)
  })
  return box
}
