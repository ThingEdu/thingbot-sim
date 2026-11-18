// Đọc / ghi xlsx tối thiểu (OOXML) bằng jszip, chạy được cả trong Node lẫn trình duyệt (chỉ dùng Uint8Array).
import JSZip from 'jszip'

export type Cell = string | number | null
export type Sheet = { name: string; rows: Cell[][] }

// ---------- chung ----------
/** Bỏ ký tự không hợp lệ trong XML 1.0. */
const INVALID_XML = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu
const esc = (s: string) =>
  s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const unesc = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')

/** Tên cột Excel: 0 ⇒ A, 25 ⇒ Z, 26 ⇒ AA. */
function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
function colIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}
const attr = (s: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(s)
  return m ? (m[1] ?? m[2]) : undefined
}

function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[\[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31)
  let name = base
  for (let i = 2; used.has(name.toLowerCase()); i++) name = base.slice(0, 31 - String(i).length - 1) + ' ' + i
  used.add(name.toLowerCase())
  return name
}

// ---------- ghi ----------
export async function writeXlsx(sheets: Sheet[]): Promise<Uint8Array> {
  const used = new Set<string>()
  const names = sheets.map((s) => sheetName(s.name, used))
  const strings: string[] = []
  const index = new Map<string, number>()
  const sst = (s: string) => {
    let i = index.get(s)
    if (i === undefined) { i = strings.length; strings.push(s); index.set(s, i) }
    return i
  }
  const zip = new JSZip()
  const n = sheets.length
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  zip.file('xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names.map((nm, i) => `<sheet name="${esc(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>')
  zip.file('xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`)
  // kiểu 0 = thường, kiểu 1 = đậm (dòng đầu)
  zip.file('xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>')
  sheets.forEach((sh, si) => {
    const widths: number[] = []
    const rowsXml = sh.rows.map((row, ri) => {
      const cells = row.map((c, ci) => {
        const ref = `${colName(ci)}${ri + 1}`
        const st = ri === 0 ? ' s="1"' : ''
        if (c === null || c === undefined || (typeof c === 'number' && !Number.isFinite(c))) return `<c r="${ref}"${st}/>`
        if (typeof c === 'number') { widths[ci] = Math.max(widths[ci] ?? 0, String(c).length); return `<c r="${ref}"${st}><v>${c}</v></c>` }
        const len = Math.max(...c.split('\n').map((l) => l.length))
        widths[ci] = Math.max(widths[ci] ?? 0, len)
        return `<c r="${ref}"${st} t="s"><v>${sst(c.replace(INVALID_XML, ''))}</v></c>`
      }).join('')
      return cells ? `<row r="${ri + 1}">${cells}</row>` : `<row r="${ri + 1}"/>`
    }).join('')
    const cols = widths.length
      ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(8, (w ?? 0) + 2))}" customWidth="1"/>`).join('') + '</cols>'
      : ''
    zip.file(`xl/worksheets/sheet${si + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rowsXml}</sheetData></worksheet>`)
  })
  zip.file('xl/sharedStrings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
    strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>')
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// ---------- đọc ----------
/** Nối mọi <t> trong một đoạn (kể cả run định dạng <r><t>), bỏ phiên âm <rPh>. */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  for (const m of clean.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += unesc(m[1] ?? '')
  return out
}

export async function readXlsx(data: Uint8Array): Promise<Sheet[]> {
  const zip = await JSZip.loadAsync(data)
  const read = async (p: string) => {
    const f = zip.file(p.replace(/^\//, ''))
    return f ? f.async('string') : null
  }
  const wb = await read('xl/workbook.xml')
  if (!wb) throw new Error('Tệp không phải xlsx hợp lệ')
  const rels = (await read('xl/_rels/workbook.xml.rels')) ?? ''
  const target = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1], 'Id'), t = attr(m[1], 'Target')
    if (id && t) target.set(id, t.startsWith('/') ? t.slice(1) : 'xl/' + t)
  }
  const sstXml = await read('xl/sharedStrings.xml')
  const shared: string[] = sstXml ? [...sstXml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textOf(m[1] ?? '')) : []
  const out: Sheet[] = []
  let k = 0
  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    k++
    const name = unesc(attr(m[1], 'name') ?? `Sheet${k}`)
    const rid = attr(m[1], 'r:id')
    const path = (rid && target.get(rid)) || `xl/worksheets/sheet${k}.xml`
    const xml = await read(path)
    out.push({ name, rows: xml ? parseSheet(xml, shared) : [] })
  }
  return out
}

function parseSheet(xml: string, shared: string[]): Cell[][] {
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? '' // bỏ <mergeCells> và phần khác
  const rows: Cell[][] = []
  let rowNo = 0
  for (const rm of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = attr(rm[1], 'r')
    rowNo = rAttr ? Number(rAttr) : rowNo + 1
    const row: Cell[] = []
    let col = -1
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r')
      const refCol = ref ? /^([A-Za-z]+)/.exec(ref)?.[1] : undefined
      col = refCol ? colIndex(refCol) : col + 1
      const t = attr(cm[1], 't')
      const body = cm[2] ?? ''
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let val: Cell = null
      if (t === 'inlineStr') val = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '')
      else if (v === undefined) val = null
      else if (t === 's') val = shared[Number(v)] ?? null
      else if (t === 'str') val = unesc(v)
      else if (t === 'b') val = Number(v) ? 1 : 0
      else if (t === 'e') val = null
      else { const x = Number(v); val = v.trim() !== '' && Number.isFinite(x) ? x : null }
      while (row.length < col) row.push(null)
      row[col] = val
    }
    while (rows.length < rowNo - 1) rows.push([])
    rows[rowNo - 1] = row
  }
  return rows
}
