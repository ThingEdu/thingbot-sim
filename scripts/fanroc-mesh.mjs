// Đổi lưới Ngọn Núi từ CAD sân (mountain_local.obj: mét, tâm chân ở gốc, đáy y = 0, đã giảm tam giác)
// sang JSON {vertices, indices} cho va chạm trimesh của Rapier. Chạy một lần khi có CAD mới:
//   node scripts/fanroc-mesh.mjs <đường dẫn mountain_local.obj> [src/fanroc/assets/mountain-mesh.json]
import { readFileSync, writeFileSync } from 'node:fs'

const [src, out = 'src/fanroc/assets/mountain-mesh.json'] = process.argv.slice(2)
if (!src) {
  console.error('Thiếu đường dẫn mountain_local.obj')
  process.exit(1)
}
const vertices = []
const indices = []
for (const line of readFileSync(src, 'utf8').split('\n')) {
  const p = line.trim().split(/\s+/)
  if (p[0] === 'v') vertices.push(...p.slice(1, 4).map((s) => Math.round(Number(s) * 1e5) / 1e5 || 0))
  else if (p[0] === 'f') {
    // OBJ đánh số từ 1 (cả toạ độ toàn cục lẫn dạng v/vt/vn); mặt nhiều đỉnh chia quạt.
    const f = p.slice(1).map((s) => Number(s.split('/')[0]) - 1)
    for (let k = 1; k + 1 < f.length; k++) indices.push(f[0], f[k], f[k + 1])
  }
}
if (indices.some((i) => i < 0 || i >= vertices.length / 3)) throw new Error('chỉ số mặt ngoài phạm vi')
writeFileSync(out, JSON.stringify({ vertices, indices }) + '\n')
console.log(`${out}: ${vertices.length / 3} đỉnh, ${indices.length / 3} tam giác`)
