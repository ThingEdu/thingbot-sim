// Nối trang với mạng LAN. App desktop: các lệnh lan_* của src-tauri/src/lan.rs (hub 47290, đèn hiệu, ống nối) — trang
// chỉ mở WebSocket tới 127.0.0.1. Trình duyệt (dev / e2e): không mở cổng được, nên nối thẳng hub chạy riêng
// (`cargo run --features lan-hub --bin fanroc-lan-hub`) ở `ws://127.0.0.1:47290` hoặc địa chỉ trong tham số trang `?lanhub=ws://…`.
import { tauriInvoke } from '../ui/external.ts'
import { PROTO } from './room.ts'

export const HUB_PORT = 47290

export interface LanRoom {
  name: string
  addr: string
  proto: number
}

export interface LanBackend {
  /** App desktop (dò phòng, nhập IP) hay trình duyệt (chỉ hub trên máy này). */
  readonly desktop: boolean
  /** Mở phòng: hub + đèn hiệu; trả địa chỉ WebSocket cho trang và các IP LAN của máy để bạn nhập tay. */
  host(name: string): Promise<{ url: string; addrs: string[] }>
  stopHost(): Promise<void>
  /** Phòng nghe được trong vài giây gần nhất. */
  rooms(): Promise<LanRoom[]>
  /** Vào phòng ở `addr` (IP hoặc IP:cổng): trả địa chỉ WebSocket cho trang. */
  join(addr: string): Promise<string>
  leave(): Promise<void>
}

/** Địa chỉ hub cho trình duyệt: `?lanhub=` (phải là ws:// tới 127.0.0.1 / localhost) hoặc mặc định. */
export function browserHub(search: string): string {
  const q = new URLSearchParams(search).get('lanhub')
  if (q && /^ws:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(q)) return q
  return `ws://127.0.0.1:${HUB_PORT}`
}

export function lanBackend(w: { location?: { search: string } } = globalThis as never): LanBackend {
  const invoke = tauriInvoke(w)
  if (!invoke) {
    const hub = browserHub(w.location?.search ?? '')
    return {
      desktop: false,
      host: async () => ({ url: hub, addrs: ['127.0.0.1'] }),
      stopHost: async () => {},
      rooms: async () => [],
      join: async () => hub,
      leave: async () => {},
    }
  }
  return {
    desktop: true,
    async host(name) {
      const r = (await invoke('lan_host_start', { name, proto: PROTO })) as { port: number; addrs: string[] }
      return { url: `ws://127.0.0.1:${r.port}`, addrs: r.addrs }
    },
    stopHost: async () => void (await invoke('lan_host_stop', {})),
    rooms: async () => (await invoke('lan_rooms', {})) as LanRoom[],
    async join(addr) {
      const port = (await invoke('lan_connect', { addr })) as number
      return `ws://127.0.0.1:${port}`
    },
    leave: async () => void (await invoke('lan_disconnect', {})),
  }
}
