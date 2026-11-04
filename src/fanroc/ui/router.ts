// Các màn của ThingBot FanRoc Game và thứ mỗi màn cần từ vỏ giao diện (biểu tượng, thanh chạy, bảng điểm, camera mặc
// định). Thuần, chạy được trong Node; trang (main.ts) giữ `go(screen, arg?)` và dựng lại phiên chơi theo màn.
import type { CameraView } from '../view/scene.ts'
import type { Activity } from './shell.ts'

/** 'tournament' = các màn giải đấu phủ sân (ghi danh, thử phím, lịch, Pit, bục trao giải); 'tmatch' = trận của giải có
 * người chơi; 'treplay' = Xem nhanh một trận máy đã chơi ngầm (×40, không ghi kết quả); 'rules' = Luật chơi, 'robots' =
 * Robot mẫu (hai mục nhỏ của màn chính, phủ sân như màn chính). */
export type Screen = 'home' | 'match' | 'practice' | 'workshop' | 'missions' | 'mission' | 'tournament' | 'tmatch' | 'treplay' | 'rules' | 'robots'

export const SCREENS: readonly Screen[] = ['home', 'match', 'practice', 'workshop', 'missions', 'mission', 'tournament', 'tmatch', 'treplay', 'rules', 'robots']

/**
 * Camera mặc định khi vào màn (spec §6.5; camera không lưu — §8.7): màn chính quay chậm quanh sân, trận / đấu tập /
 * Xưởng theo robot của em, nhiệm vụ toàn sân (thấy rõ vệt), giải đấu (ghi danh, Pit) toàn sân.
 */
export function defaultCamera(s: Screen): CameraView {
  switch (s) {
    case 'home':
    case 'rules':
    case 'robots':
      return 'orbit'
    case 'match':
    case 'practice':
    case 'workshop':
    case 'tmatch':
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
    case 'rules':
    case 'robots':
      return { activity: [], runbar: false, scoreboard: false, live: true }
    case 'match':
    case 'practice':
    case 'tmatch':
      return { activity: ['blocks', 'code', 'serial'], runbar: true, scoreboard: true, live: true }
    case 'treplay':
      return { activity: [], runbar: false, scoreboard: true, live: true }
    case 'workshop':
      return { activity: ['blocks', 'code', 'serial'], runbar: true, scoreboard: false, live: true }
    case 'mission':
      return { activity: ['blocks', 'code', 'serial', 'missions'], runbar: true, scoreboard: false, live: true }
    case 'missions':
    case 'tournament':
      return { activity: [], runbar: false, scoreboard: false, live: true }
  }
}
