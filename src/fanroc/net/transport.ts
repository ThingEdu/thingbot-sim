// Đường truyền của Thi qua mạng LAN: một kênh thư hai chiều (chữ JSON hoặc nhị phân). Trang luôn nối WebSocket tới
// 127.0.0.1 (hub của app Tauri, hay `cargo run --features lan-hub --bin fanroc-lan-hub` khi chạy trên trình duyệt). `pair()` là cặp giả
// trong bộ nhớ cho phép thử (thư tới ở microtask sau, như mạng).

export type Data = string | ArrayBuffer

export interface Transport {
  send(d: Data): void
  close(): void
  onMessage?: (d: Data) => void
  onClose?: () => void
}

/** Hai đầu nối nhau; `close` một đầu thì đầu kia nhận onClose. */
export function pair(): [Transport, Transport] {
  let open = true
  const mk = (): Transport => ({ send: () => {}, close: () => {} })
  const a = mk()
  const b = mk()
  const link = (from: Transport, to: Transport) => {
    from.send = (d) => {
      if (open) queueMicrotask(() => open && to.onMessage?.(d))
    }
    from.close = () => {
      if (!open) return
      open = false
      queueMicrotask(() => (a.onClose?.(), b.onClose?.()))
    }
  }
  link(a, b)
  link(b, a)
  return [a, b]
}

/** Mở WebSocket; xong khi đã nối, lỗi khi không nối được trong `timeoutMs`. */
export function wsTransport(url: string, timeoutMs = 3000): Promise<Transport> {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      ws.close()
      fail(new Error('Không nối được'))
    }, timeoutMs)
    const t: Transport = {
      send: (d) => ws.readyState === WebSocket.OPEN && ws.send(d),
      close: () => ws.close(),
    }
    ws.onmessage = (e) => t.onMessage?.(e.data as Data)
    ws.onopen = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ok(t)
    }
    ws.onclose = () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        fail(new Error('Không nối được'))
      } else t.onClose?.()
    }
  })
}
