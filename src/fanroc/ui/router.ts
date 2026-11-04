// Các màn của ThingBot FanRoc Game và thứ mỗi màn cần từ vỏ giao diện (biểu tượng, thanh chạy, bảng điểm, camera mặc
// định). Thuần, chạy được trong Node; trang (main.ts) giữ `go(screen, arg?)` và dựng lại phiên chơi theo màn.
import type { CameraView } from '../view/scene.ts'
import type { Activity } from './shell.ts'

export type Screen = 'home' | 'match' | 'practice' | 'workshop' | 'missions' | 'mission' | 'tournament'

export const SCREENS: readonly Screen[] = ['home', 'match', 'practice', 'workshop', 'missions', 'mission', 'tournament']

/**
 * Camera mặc định khi vào màn (spec §6.5; camera không lưu — §8.7): màn chính quay chậm quanh sân, trận / đấu tập /
 * Xưởng theo robot của em, nhiệm vụ toàn sân (thấy rõ vệt), giải đấu (ghi danh, Pit) toàn sân.
 */
export function defaultCamera(s: Screen): CameraView {
  switch (s) {
    case 'home':
      return 'orbit'
    case 'match':
    case 'practice':
    case 'workshop':
      return 'follow'
    default:
      return 'field'
  }
}

export interface ScreenChrome {
  /** Biểu tượng của cột biểu tượng (⚙ luôn có); [] = ẩn cả cột (màn chính). */
  activity: Activity[]
  /** Thanh chạy nổi trên sân. */
  runbar: boolean
  /** Bảng điểm trận Đỏ | chung | Xanh. */
  scoreboard: boolean
  /** Sân chạy vật lý (màn chính: robot máy chơi nền). */
  live: boolean
}

/** Màn nào hiện phần nào của vỏ. */
export function chrome(s: Screen): ScreenChrome {
  switch (s) {
    case 'home':
      return { activity: [], runbar: false, scoreboard: false, live: true }
    case 'match':
    case 'practice':
      return { activity: ['blocks', 'code', 'serial'], runbar: true, scoreboard: true, live: true }
    case 'workshop':
      return { activity: ['blocks', 'code', 'serial'], runbar: true, scoreboard: false, live: true }
    case 'mission':
      return { activity: ['blocks', 'code', 'serial', 'missions'], runbar: true, scoreboard: false, live: true }
    case 'missions':
    case 'tournament':
      return { activity: [], runbar: false, scoreboard: false, live: true }
  }
}
