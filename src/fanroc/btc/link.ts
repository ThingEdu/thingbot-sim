// Nối WebSocket tới bộ chuyển thư BTC (src-tauri/src/btc.rs). Trang BTC xưng `{"t":"btc"}` rồi nhận
// `{"from","m"}` / `{"peer","on"}` và gửi `{"to","m"}`; điện thoại / màn chiếu gửi ClientMsg trần và nhận khung nhìn trần.
import type { BtcView, ClientMsg } from './proto.ts'

export const BTC_PORT = 47292

/** Địa chỉ cho trình duyệt (dev / e2e): `?btc=` (phải là ws:// tới 127.0.0.1 / localhost, đường /ws) hoặc mặc định. */
export function browserBtc(search: string): string {
  const q = new URLSearchParams(search).get('btc')
  if (q && /^ws:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/ws$/.test(q)) return q
  return `ws://127.0.0.1:${BTC_PORT}/ws`
}

export type BtcFrame =
  | { t: 'msg'; from: string; m: ClientMsg }
  | { t: 'peer'; id: string; on: boolean }
  | { t: 'reject'; reason: string }

const json = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Thư bộ chuyển gửi tới trang BTC; không hiểu ⇒ null. */
export function parseBtcFrame(raw: string): BtcFrame | null {
  const o = json(raw)
  if (!isObj(o)) return null
  if (typeof o.from === 'string' && isObj(o.m)) return { t: 'msg', from: o.from, m: o.m as ClientMsg }
  if (typeof o.peer === 'string' && typeof o.on === 'boolean') return { t: 'peer', id: o.peer, on: o.on }
  if (o.t === 'reject') return { t: 'reject', reason: String(o.reason ?? '') }
  return null
}

/** Thư khách nhận: `nobtc` hoặc một khung nhìn của BTC; không hiểu ⇒ null. */
export function parseClientFrame(raw: string): { t: 'nobtc' } | { t: 'view'; m: BtcView } | null {
  const o = json(raw)
  if (!isObj(o)) return null
  if (o.t === 'nobtc') return { t: 'nobtc' }
  if (o.t === 'ref' || o.t === 'screen' || o.t === 'deny') return { t: 'view', m: o as BtcView }
  return null
}

export interface BtcLink {
  send(to: string, m: unknown): void
  onPeer?: (id: string, on: boolean) => void
  onMessage?: (from: string, m: ClientMsg) => void
  /** Đã có máy BTC khác giữ bộ chuyển (sau đó onClose cũng được gọi). */
  onReject?: (reason: string) => void
  onClose?: () => void
  close(): void
}

/** Trang BTC: mở WS, xưng BTC. Xong khi đã nối; bị từ chối thì báo qua onReject + onClose. */
export function connectBtc(url: string, timeoutMs = 3000): Promise<BtcLink> {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(url)
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      ws.close()
      fail(new Error('Không nối được máy chủ BTC'))
    }, timeoutMs)
    const link: BtcLink = {
      send: (to, m) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ to, m }))
      },
      close: () => ws.close(),
    }
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      const f = parseBtcFrame(e.data)
      if (!f) return
      if (f.t === 'msg') link.onMessage?.(f.from, f.m)
      else if (f.t === 'peer') link.onPeer?.(f.id, f.on)
      else {
        link.onReject?.(f.reason)
        ws.close()
      }
    }
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'btc' }))
      if (settled) return
      settled = true
      clearTimeout(timer)
      ok(link)
    }
    ws.onclose = () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        fail(new Error('Không nối được máy chủ BTC'))
      } else link.onClose?.()
    }
  })
}

/** Điện thoại / màn chiếu: nối và tự nối lại mỗi 2 s. Thư gửi lúc mất mạng bị bỏ (trang tự giữ và gửi lại). */
export function connectClient(
  url: string,
  onView: (m: BtcView) => void,
  onState: (s: 'online' | 'offline' | 'nobtc') => void,
): { send(m: ClientMsg): void; close(): void; drop(): void } {
  let ws: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | null = null
  const open = () => {
    retry = null
    if (closed) return
    const w = new WebSocket(url)
    ws = w
    w.onopen = () => onState('online')
    w.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      const f = parseClientFrame(e.data)
      if (f?.t === 'nobtc') onState('nobtc')
      else if (f) onView(f.m)
    }
    w.onclose = () => {
      if (ws !== w) return
      ws = null
      if (closed) return
      onState('offline')
      retry = setTimeout(open, 2000)
    }
  }
  open()
  return {
    send: (m) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m))
    },
    close: () => {
      closed = true
      if (retry) clearTimeout(retry)
      ws?.close()
      ws = null
    },
    /** Như rút dây mạng (e2e): đóng ống nối nhưng vẫn tự nối lại sau 2 s. */
    drop: () => ws?.close(),
  }
}
