// Tốc độ xem của trang (ruling R24): chương trình khối chạy theo giờ thật trong worker, nên khi có chương trình học
// sinh đang chạy (hoặc đã nạp chờ chạy) thì sân phải chạy đúng ×1; chỉ tua nhanh / dừng hình khi toàn agent lái.
export const SPEED_NOTE = 'Chương trình khối chạy theo giờ thật — chỉ tua nhanh khi toàn agent'

/** Tốc độ thật sự áp dụng cho tốc độ xin `requested`. */
export function effectiveSpeed(requested: number, programsActive: boolean): number {
  return programsActive ? 1 : Math.max(0, requested)
}
