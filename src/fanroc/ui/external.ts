// Link ra ngoài trang (mã nguồn AGPL, sau này "Tải ThingBlock đầy đủ"). Trên trình duyệt: link `target=_blank` tự mở
// như thường. Trong gói desktop Tauri, WKWebView không mở cửa sổ / trình duyệt cho `target=_blank` ⇒ bắt cú bấm và nhờ
// plugin opener mở bằng trình duyệt của máy (gọi thẳng IPC `plugin:opener|open_url`, như `openUrl` của
// @tauri-apps/plugin-opener, không thêm gói npm). Quyền của app (src-tauri/capabilities/default.json) chỉ cho đúng các
// link trong EXTERNAL_URLS — phép thử external.test.ts giữ hai chỗ khớp nhau.

/** Mã nguồn của trang (AGPL-3.0: người dùng web / bản tải về phải lấy được mã nguồn). */
export const SOURCE_URL = 'https://github.com/ThingEdu/thingbot-sim'

/**
 * Các link app desktop được mở bằng trình duyệt. Khi điền THINGBLOCK_URL (scripts/game-config.ts) thì thêm link đó vào
 * đây VÀ vào phạm vi `opener:allow-open-url` của src-tauri/capabilities/default.json (đúng từng ký tự, không dùng
 * opener:default).
 */
export const EXTERNAL_URLS: readonly string[] = [SOURCE_URL]

export type LinkAction = 'browser' | 'opener' | 'blocked'

/** Trình duyệt ⇒ để link tự mở; app desktop ⇒ opener nếu link được phép, không thì chặn (quyền app cũng chặn). */
export function linkAction(tauri: boolean, href: string, allowed: readonly string[]): LinkAction {
  if (!tauri) return 'browser'
  return allowed.includes(href) ? 'opener' : 'blocked'
}

type Invoke = (cmd: string, args: Record<string, unknown>) => Promise<unknown>

/** Hàm IPC của Tauri khi trang chạy trong app desktop; null trên trình duyệt. */
export function tauriInvoke(w: object = globalThis): Invoke | null {
  const inv = (w as { __TAURI_INTERNALS__?: { invoke?: Invoke } }).__TAURI_INTERNALS__?.invoke
  return typeof inv === 'function' ? inv : null
}

/** Nối cú bấm của một link ra ngoài. Trình duyệt: không đổi gì. */
export function wireExternal(a: HTMLAnchorElement, allowed: readonly string[] = EXTERNAL_URLS): void {
  const invoke = tauriInvoke()
  if (!invoke) return
  a.addEventListener('click', (e) => {
    e.preventDefault()
    // Thuộc tính href đúng như đã đặt (a.href của trình duyệt có thể chuẩn hoá thêm dấu "/").
    const href = a.getAttribute('href') ?? ''
    if (linkAction(true, href, allowed) !== 'opener') return
    invoke('plugin:opener|open_url', { url: href }).catch((err) => {
      // Không mở được: địa chỉ vẫn đọc / chép được ở ⚙ Cài đặt và ở chú thích của link.
      console.warn('Không mở được link', href, err)
    })
  })
}
