// Nối màn Ban tổ chức với máy chủ BTC. App desktop: các lệnh btc_* của src-tauri/src/btc.rs (máy chủ 47292, lưu file giải
// trong thư mục dữ liệu app) + save_file (lưu .xlsx / .json vào Downloads). Trình duyệt (dev / e2e): máy chủ chạy riêng
// (`cargo run --features btc-server --bin fanroc-btc-server -- <cổng> dist-game`) ở địa chỉ `?btc=ws://127.0.0.1:<cổng>/ws`;
// giải lưu ở localStorage `fanroc.v1.btc.event`, tệp xuất thì tải về như thường.
import { tauriInvoke } from '../ui/external.ts'
import { BTC_PORT, browserBtc } from './link.ts'

export const EVENT_KEY = 'fanroc.v1.btc.event'

export interface BtcBackend {
  /** App desktop (máy chủ trong app, địa chỉ LAN thật) hay trình duyệt. */
  readonly desktop: boolean
  /** Mở máy chủ: địa chỉ WebSocket cho trang BTC, các IP của máy và cổng để điện thoại mở `http://<ip>:<cổng>/`. */
  start(): Promise<{ url: string; addrs: string[]; port: number }>
  stop(): Promise<void>
  /** Ghi file giải (JSON). Lỗi ⇒ ném. */
  save(json: string): Promise<void>
  /** File giải đã lưu (null: chưa có). */
  load(): Promise<string | null>
  /** Lưu tệp cho người dùng (Excel, sao lưu JSON); trả đường tệp đã lưu (trình duyệt: tên tệp tải về). */
  saveFile(name: string, data: Uint8Array): Promise<string>
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type Env = { location?: { search: string }; localStorage?: StorageLike; document?: Document }

/** Cổng trong địa chỉ ws:// (điện thoại mở trang ở cùng cổng); không ghi cổng ⇒ 80. */
export function wsPort(url: string): number {
  const m = /^ws:\/\/[^/:]+(?::(\d+))?/.exec(url)
  return m ? (m[1] ? Number(m[1]) : 80) : BTC_PORT
}

function download(doc: Document | undefined, name: string, data: Uint8Array): void {
  if (!doc) throw new Error('Không tải tệp được')
  const type = name.endsWith('.json') ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
  const a = doc.createElement('a')
  a.href = url
  a.download = name
  doc.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function btcBackend(w: Env = globalThis as never): BtcBackend {
  const invoke = tauriInvoke(w)
  if (!invoke) {
    const url = browserBtc(w.location?.search ?? '')
    const store = (): StorageLike | null => {
      try {
        return w.localStorage ?? null
      } catch {
        return null
      }
    }
    return {
      desktop: false,
      start: async () => ({ url, addrs: ['127.0.0.1'], port: wsPort(url) }),
      stop: async () => {},
      async save(json) {
        const s = store()
        if (!s) throw new Error('Trình duyệt chặn lưu dữ liệu')
        s.setItem(EVENT_KEY, json) // đầy / bị chặn ⇒ ném, màn BTC báo đỏ
      },
      async load() {
        try {
          return store()?.getItem(EVENT_KEY) ?? null
        } catch {
          return null
        }
      },
      async saveFile(name, data) {
        download(w.document, name, data)
        return name
      },
    }
  }
  return {
    desktop: true,
    async start() {
      const r = (await invoke('btc_start', {})) as { port: number; addrs: string[] }
      return { url: `ws://127.0.0.1:${r.port}/ws`, addrs: r.addrs, port: r.port }
    },
    stop: async () => void (await invoke('btc_stop', {})),
    save: async (json) => void (await invoke('btc_save', { json })),
    load: async () => ((await invoke('btc_load', {})) as string | null) ?? null,
    saveFile: async (name, data) => String(await invoke('save_file', { name, data: Array.from(data) })),
  }
}

/**
 * Lưu tuần tự, không gộp theo thời gian: mỗi lần gọi đều được lưu, nhưng chỉ một lần lưu chạy cùng lúc; trong lúc chờ
 * chỉ giữ bản mới nhất (bản cũ hơn chưa kịp ghi thì bỏ — bản mới đã chứa nó). `done(err)` sau mỗi lần ghi.
 */
export function serialSaver(save: (json: string) => Promise<void>, done: (err: unknown /* null = đã lưu */) => void = () => {}): (json: string) => Promise<void> {
  let latest: string | null = null
  let running: Promise<void> | null = null
  const run = async () => {
    while (latest !== null) {
      const json = latest
      latest = null
      try {
        await save(json)
        done(null)
      } catch (e) {
        done(e)
      }
    }
    running = null
  }
  return (json) => {
    latest = json
    running ??= run()
    return running
  }
}
