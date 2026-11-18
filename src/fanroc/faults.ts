// Lỗi trọng tài (mã, tên, lời giải thích) — tách khỏi rules-data.ts để trang trọng tài trên điện thoại dùng được mà không
// kéo theo game 3D / vật lý (rules-data.ts dò số trận bằng tournament.ts). rules-data.ts xuất lại nguyên các tên này.
import { teamScore } from './scoring.ts'

/** Số có dấu: +15, −3 (dấu trừ chuẩn), 0. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

// ---------- Lỗi trọng tài tự động: đúng các lỗi match.ts bắt ----------
/**
 * G15: hai robot khác liên minh đứng sát nhau quá chừng này giây. Là hằng riêng `BLOCK_S` của match.ts (không xuất ra
 * được vì lõi trận không sửa); phép thử đọc match.ts để số này không lệch.
 */
export const BLOCK_SECONDS = 5

export type PenKind = 'warn' | 'minor' | 'yellow'
export interface Fault { code: string; name: string; text: string; pens: PenKind[] }

const NO_PEN = { minor: 0, yellow: 0, red: false }
/** Phạt một lỗi nhẹ / một thẻ vàng: dò từ teamScore, giống POINTS.minor / POINTS.yellow của rules-data.ts. */
const MINOR = 100 - teamScore(100, { ...NO_PEN, minor: 1 })
const YELLOW = 100 - teamScore(100, { ...NO_PEN, yellow: 1 })
const PEN_NAME: Record<PenKind, string> = { warn: 'cảnh cáo', minor: `lỗi nhẹ ${signed(-MINOR)}`, yellow: `thẻ vàng ${signed(-YELLOW)}` }

export const FAULTS: Fault[] = [
  { code: 'P12', name: 'Leo núi', pens: ['warn', 'minor'], text: `Robot trèo lên núi. Lần đầu: ${PEN_NAME.warn}; các lần sau: ${PEN_NAME.minor}.` },
  { code: 'S02', name: 'Vươn ra ngoài rào', pens: ['yellow'], text: `Một góc robot thò ra ngoài rào sân: ${PEN_NAME.yellow}.` },
  { code: 'P10', name: 'Cán cờ trên sàn', pens: ['warn'], text: `Đè lên lá cờ của robot khác đang nằm trên sàn: ${PEN_NAME.warn}.` },
  {
    code: 'G15', name: 'Chặn robot đội bạn', pens: ['yellow', 'warn'],
    text: `Đứng sát, chặn robot liên minh kia hơn ${BLOCK_SECONDS} giây: robot tới sau bị ${PEN_NAME.yellow}; không rõ ai chặn thì cả hai bị ${PEN_NAME.warn}. Đang ở Khu Tiếp Tế của mình hay đang treo trên Thang Cứu Hỏa thì không tính.`,
  },
]
