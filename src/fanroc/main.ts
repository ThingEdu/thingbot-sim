/**
 * Trang FANROC Thanh Hỏa: khởi tạo vật lý Rapier rồi báo trạng thái ở vùng sân.
 * Các vùng #blocks, #arena, #hud sẽ được các bước sau lấp đầy.
 */
import RAPIER from '@dimforge/rapier3d-compat'

const arena = document.querySelector<HTMLElement>('#arena')!

async function start(): Promise<void> {
  arena.textContent = 'Sân đang tải…'
  await RAPIER.init()
  arena.textContent = 'Sẵn sàng'
}

start().catch((e) => {
  arena.textContent = `Không khởi tạo được vật lý: ${e instanceof Error ? e.message : String(e)}`
})
