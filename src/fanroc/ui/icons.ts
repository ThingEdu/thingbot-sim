// Bộ biểu tượng nét mảnh của ThingBot FanRoc Game (kiểu Lucide: khung 24 × 24, nét 2, đầu nét tròn), tự vẽ và nhúng
// sẵn trong mã — không tải phông / ảnh từ mạng, không dùng emoji trên nút (spec §6.1b). Hình đặc (chạy, tạm dừng,
// dừng, sao) tô bằng `currentColor` nên đổi màu theo nút.

export const ICON_NAMES = [
  'blocks', 'code', 'serial', 'missions', 'trophy', 'settings', 'play', 'pause', 'stepOver', 'stop',
  'reset', 'download', 'camera', 'home', 'sound', 'mute', 'keyboard', 'gamepad', 'star', 'check', 'book', 'robot',
] as const
export type IconName = (typeof ICON_NAMES)[number]

const FILL = 'fill="currentColor" stroke="none"'

/** Nét vẽ bên trong `<svg viewBox="0 0 24 24">` của từng biểu tượng. */
export const ICON_PATHS: Record<IconName, string> = {
  // Mảnh ghép (khối lệnh).
  blocks:
    '<path d="M5 7h3.5V5.5a2 2 0 1 1 4 0V7H16a1 1 0 0 1 1 1v3.5h1.5a2 2 0 1 1 0 4H17V19a1 1 0 0 1-1 1h-3.5v-1.5a2 2 0 1 0-4 0V20H5a1 1 0 0 1-1-1v-3.5h1.5a2 2 0 1 0 0-4H4V8a1 1 0 0 1 1-1z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  // Dấu nhắc dòng lệnh (Serial).
  serial: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><polyline points="7 10 10 12.5 7 15"/><line x1="12.5" y1="15" x2="17" y2="15"/>',
  // Cờ chặng (nhiệm vụ).
  missions: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 6h3v1.5a3 3 0 0 1-3 3M7 6H4v1.5a3 3 0 0 0 3 3"/>',
  // Bánh răng: vòng ngoài 8 răng + lỗ giữa.
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/><circle cx="12" cy="12" r="6.9"/>',
  play: `<polygon points="7 4.5 19 12 7 19.5 7 4.5" ${FILL}/>`,
  pause: `<rect x="6" y="5" width="4" height="14" rx="1" ${FILL}/><rect x="14" y="5" width="4" height="14" rx="1" ${FILL}/>`,
  // Mũi tên vòng qua một chấm (Chạy từng khối, như "step over" của trình gỡ lỗi).
  stepOver: '<path d="M4 13a8 8 0 0 1 14.5-4.6"/><polyline points="19.5 3.5 19.5 9 14 9"/><circle cx="12" cy="18" r="2"/>',
  stop: `<rect x="5.5" y="5.5" width="13" height="13" rx="2" ${FILL}/>`,
  // Mũi tên quay ngược (Về chỗ cũ).
  reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><polyline points="3.5 3.5 3.5 8.5 8.5 8.5"/>',
  download: '<path d="M12 3.5v11.5"/><polyline points="7 10 12 15 17 10"/><path d="M4.5 20.5h15"/>',
  camera: '<rect x="2" y="6" width="13.5" height="12" rx="2"/><path d="M15.5 10.5 22 7v10l-6.5-3.5"/>',
  home: '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9.5V20.5h4.5v-6h4v6h4.5V9.5"/>',
  sound: '<path d="M4 9h3.5L12.5 5v14l-5-4H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9h3.5L12.5 5v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
  keyboard:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9"/>',
  gamepad:
    '<path d="M7.5 7.5h9a4.5 4.5 0 0 1 4.5 4.5v1.5a3 3 0 0 1-5.4 1.8l-1-1.3h-5.2l-1 1.3A3 3 0 0 1 3 13.5V12a4.5 4.5 0 0 1 4.5-4.5z"/><path d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01"/>',
  star: `<polygon points="12 2.5 14.9 8.6 21.5 9.4 16.6 13.9 17.9 20.5 12 17.2 6.1 20.5 7.4 13.9 2.5 9.4 9.1 8.6" ${FILL}/>`,
  check: '<polyline points="20 6 9.5 16.5 4 11"/>',
  // Cuốn sách mở (Luật chơi).
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5z"/><path d="M12 6.5V20"/>',
  // Đầu robot có ăng-ten (Robot mẫu).
  robot: '<rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1"/><path d="M9 13h.01M15 13h.01M9.5 16.5h5"/><path d="M2 12.5v3M22 12.5v3"/>',
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Một biểu tượng SVG (`aria-hidden`: chữ nghĩa nằm ở `aria-label` / `title` của nút chứa nó). */
export function icon(name: IconName, size = 20): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.classList.add('ic', `ic-${name}`)
  svg.innerHTML = ICON_PATHS[name]
  return svg
}
