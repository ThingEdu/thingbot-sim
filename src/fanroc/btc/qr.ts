// Mã QR cho địa chỉ trang trọng tài / màn chiếu (màn Ban tổ chức). Bọc qrcode-generator@1.4.4 (MIT, Kazuhiko Arase):
// tự chọn cỡ mã, mức sửa lỗi M, trả chuỗi <svg> co giãn (có viewBox, nền trắng, viền 4 ô theo chuẩn QR).
import qrcode from 'qrcode-generator'

export function qrSvg(text: string): string {
  const q = qrcode(0, 'M')
  q.addData(text, 'Byte')
  q.make()
  return q.createSvgTag({ cellSize: 4, margin: 16, scalable: true })
}
