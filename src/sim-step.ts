/**
 * Chạy từng khối (⏭) cho worker dùng chung (`sim-worker.ts`, lệnh `step`): chạy hết khối đang trỏ tới (khối `đợi 1
 * giây` thì thời gian ảo trôi 1 giây) và dừng ở dấu khối kế — `snapshot.block` là khối sẽ chạy tiếp, như thanh Debug
 * tô dòng sắp chạy. Mới nạp (chưa tới khối nào) thì chạy luôn khối đầu tiên. Tối đa `maxVirtualMs` thời gian ảo.
 *
 * R36: `Session.step()` của thingblock-sim (`runner.stepBlock()`) CÓ ngủ qua khối `đợi` (nhảy đồng hồ ảo tới hết
 * đợi), nên dùng đúng cơ chế đó — `runner.runUntil(đích, 1)` là `stepBlock()` có giới hạn thời gian. Không gọi thẳng
 * `step()` vì nó không có giới hạn: `loop()` rỗng (chương trình chỉ có "khi Arduino khởi động") không bao giờ tới dấu
 * khối kế, `stepBlock()` quay mãi và treo worker (đã thử: treo thật). Cũng không dùng vòng `tick` 16 ms: một lát 16 ms
 * chạy được hàng trăm khối tức thời (đặt động cơ…), "từng khối" sẽ nhảy cóc nhiều khối, và snapshot cuối mang lệnh
 * động cơ SAU khối đợi trong khi trang cần lệnh TRONG lúc đợi để chạy sân đúng 1 giây.
 *
 * Đọc `runner` / `board` bên trong Session như `instrument` của worker đã làm. Tệp nằm cạnh worker (không trong
 * `src/fanroc/`) để worker dùng chung không phụ thuộc thư mục của trang FanRoc.
 */
import type { Runner, Session, Snapshot } from '@thingblock/thingblock-sim'

interface SessionInternals {
  runner: Runner
  board: { clock: { now: number } }
}

export function stepToNextBlock(s: Session, maxVirtualMs = 5000, sliceMs = 16): Snapshot {
  const { runner, board } = s as unknown as SessionInternals
  const clock = board.clock
  // Snapshot lấy đi chữ Serial đã in: giữ lại để snapshot trả về không mất phần này.
  const from = s.snapshot()
  const end = from.t + maxVirtualMs * 1000
  // Chưa tới khối nào: dấu đầu tiên chỉ là "sắp chạy khối 1" — chạy thêm một dấu để khối 1 chạy xong.
  let markers = from.block === undefined ? 2 : 1
  s.running = false
  // Từng lát `sliceMs` thời gian ảo: runUntil(…, 1) dừng ở dấu khối kế, hoặc ở đích lát khi đang ngủ / chưa tới dấu.
  while (markers > 0 && runner.phase !== 'halted' && clock.now < end) {
    markers -= runner.runUntil(Math.min(end, clock.now + sliceMs * 1000), 1)
  }
  const snap = s.snapshot()
  return { ...snap, running: false, serial: from.serial + snap.serial }
}
