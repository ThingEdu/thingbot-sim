import { test } from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { readXlsx, writeXlsx, type Cell } from './xlsx.ts'

test('ghi rồi đọc lại: chuỗi có dấu và & < > ", số, ô trống, xuống dòng', async () => {
  const rows: Cell[][] = [
    ['Tên đội', 'Điểm', 'Ghi chú'],
    ['Đội "Lửa" & <Nước>', 12.5, null],
    ['Trường Nguyễn Huệ', -3, 'dòng 1\ndòng 2'],
    [null, null, 'cuối'],
    [],
  ]
  const back = await readXlsx(await writeXlsx([{ name: 'Đội', rows }, { name: 'B', rows: [['x']] }]))
  assert.deepEqual(back.map((s) => s.name), ['Đội', 'B'])
  assert.deepEqual(back[0].rows, rows)
})

test('thoát & đúng: chuỗi chứa sẵn "&lt;" / "&amp;" không bị đọc thành ký tự khác, XML ghi ra có &amp;', async () => {
  const rows: Cell[][] = [['&lt;', '&amp;', 'a & b']]
  const data = await writeXlsx([{ name: 'S', rows }])
  assert.deepEqual((await readXlsx(data))[0].rows, rows)
  const xml = await (await JSZip.loadAsync(data)).file('xl/sharedStrings.xml')!.async('string')
  assert.ok(xml.includes('&amp;lt;') && xml.includes('a &amp; b'))
})

test('tên sheet cắt 31 ký tự, bỏ ký tự cấm, không trùng', async () => {
  const back = await readXlsx(await writeXlsx([{ name: 'a/b:c'.padEnd(40, 'x'), rows: [['1']] }, { name: 'a/b:c'.padEnd(40, 'x'), rows: [['2']] }]))
  assert.ok(back.every((s) => s.name.length <= 31 && !/[\/:]/.test(s.name)))
  assert.notEqual(back[0].name, back[1].name)
})

test('ký tự không hợp lệ trong XML bị bỏ, tệp vẫn đọc được', async () => {
  const back = await readXlsx(await writeXlsx([{ name: 'S', rows: [['a\u0001b\u0000c']] }]))
  assert.equal(back[0].rows[0][0], 'abc')
})

test('đọc tệp kiểu Excel/LibreOffice: chuỗi rich text, cột cách quãng, mergeCells, inlineStr, str, bool, dòng không có r', async () => {
  const zip = new JSZip()
  zip.file('xl/workbook.xml', '<workbook xmlns:r="x"><sheets><sheet name="Dữ liệu &amp; số" sheetId="3" r:id="rId7"/></sheets></workbook>')
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Target="worksheets/sheet9.xml" Id="rId7" Type="t"/></Relationships>')
  zip.file('xl/sharedStrings.xml',
    '<sst><si><t>Mã</t></si>' +
    '<si><r><rPr><b/></rPr><t xml:space="preserve">Đội </t></r><r><t>Lửa &amp; Nước</t></r><rPh sb="0" eb="1"><t>PHIENAM</t></rPh></si>' +
    '<si><t/></si></sst>')
  zip.file('xl/worksheets/sheet9.xml',
    '<worksheet><dimension ref="A1:E3"/><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="2"/><c r="D1" t="s"><v>1</v></c></row>' +
    '<row><c t="inlineStr"><is><t>inl</t></is></c><c t="str"><v>công thức</v></c><c t="b"><v>1</v></c><c t="e"><v>#DIV/0!</v></c></row>' +
    '<row r="3"><c r="C3"><v>7.25</v></c><c r="E3" t="s"><v>2</v></c></row>' +
    '</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells></worksheet>')
  const back = await readXlsx(await zip.generateAsync({ type: 'uint8array' }))
  assert.equal(back[0].name, 'Dữ liệu & số')
  assert.deepEqual(back[0].rows, [
    ['Mã', null, null, 'Đội Lửa & Nước'],
    ['inl', 'công thức', 1, null],
    [null, null, 7.25, null, ''],
  ])
})

test('styles.xml có kiểu mặc định Normal (cellStyleXfs + cellStyles) để Excel mở không phải sửa', async () => {
  const data = await writeXlsx([{ name: 'S', rows: [['a']] }])
  const xml = await (await JSZip.loadAsync(data)).file('xl/styles.xml')!.async('string')
  assert.match(xml, /<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"\/><\/cellStyleXfs>/)
  assert.match(xml, /<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"\/><\/cellStyles>/)
  // thứ tự phần tử theo lược đồ: fonts, fills, borders, cellStyleXfs, cellXfs, cellStyles
  const order = ['<fonts', '<fills', '<borders', '<cellStyleXfs', '<cellXfs', '<cellStyles'].map((t) => xml.indexOf(t))
  assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), String(order))
})
