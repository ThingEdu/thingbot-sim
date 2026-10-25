/**
 * Sơ đồ dòng chảy 2D, chạy song song với cảnh 3D và cùng số liệu: Nút → ESP32-C3 → PCA9685 → Đèn.
 * Mỗi mũi tên có tên đường dây (IO3, I2C, kênh 15) và giá trị đang chạy trên đó.
 */
const NS = 'http://www.w3.org/2000/svg'

export interface FlowState {
  running: boolean
  pressed: boolean
  /** Khối "read switch" vừa trả về gì (null = chương trình chưa đọc nút). */
  switchValue: boolean | null
  /** Duty kênh 15, 0..4096. */
  duty: number
  readActive: boolean
  writeActive: boolean
}

const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, parent: Element) => {
  const node = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  parent.appendChild(node)
  return node
}

interface NodeRefs {
  rect: SVGRectElement
  value: SVGTextElement
}
interface EdgeRefs {
  line: SVGPathElement
  value: SVGTextElement
}

export function createFlow(svg: SVGSVGElement) {
  const defs = el('defs', {}, svg)
  const marker = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs)
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor' }, marker)

  const NODE_W = 112
  const NODE_H = 52
  const Y = 40
  const xs = [4, 152, 300, 448]
  const titles = ['Nút SW', 'ESP32-C3 (não)', 'PCA9685', 'Đèn L1']

  const nodes: NodeRefs[] = xs.map((x, i) => {
    const g = el('g', { class: 'flow-node' }, svg)
    const rect = el('rect', { x, y: Y, width: NODE_W, height: NODE_H, rx: 8 }, g)
    el('text', { x: x + NODE_W / 2, y: Y + 20, class: 'flow-title', 'text-anchor': 'middle' }, g).textContent = titles[i]
    const value = el('text', { x: x + NODE_W / 2, y: Y + 39, class: 'flow-value', 'text-anchor': 'middle' }, g)
    return { rect, value }
  })

  const edgeNames = ['IO3', 'I2C · SDA/SCL', 'kênh 15']
  const edges: EdgeRefs[] = edgeNames.map((name, i) => {
    const x1 = xs[i] + NODE_W + 2
    const x2 = xs[i + 1] - 3
    const g = el('g', { class: 'flow-edge' }, svg)
    const line = el('path', { d: `M${x1},${Y + NODE_H / 2} L${x2},${Y + NODE_H / 2}`, 'marker-end': 'url(#arrow)' }, g)
    el('text', { x: (x1 + x2) / 2, y: Y - 8, class: 'flow-edge-name', 'text-anchor': 'middle' }, g).textContent = name
    const value = el('text', { x: (x1 + x2) / 2, y: Y + NODE_H + 22, class: 'flow-edge-value', 'text-anchor': 'middle' }, g)
    return { line, value }
  })

  const setEdge = (e: EdgeRefs, cls: string, value: string) => {
    e.line.parentElement!.setAttribute('class', `flow-edge ${cls}`)
    e.value.textContent = value
  }

  return {
    update(s: FlowState) {
      const pct = Math.round((Math.min(s.duty, 4095) / 4095) * 100)
      const level = s.pressed ? 'LOW · 0 V' : 'HIGH · 3,3 V'
      nodes[0].value.textContent = s.pressed ? 'đang bấm' : 'đang nhả'
      nodes[1].value.textContent = !s.running
        ? 'chưa chạy'
        : s.switchValue === null
          ? 'không đọc nút'
          : `read switch = ${s.switchValue ? 'đúng' : 'sai'}`
      nodes[2].value.textContent = s.running ? `kênh 15 = ${s.duty >= 4096 ? 4095 : s.duty}` : '—'
      nodes[3].value.textContent = pct > 0 ? `sáng ${pct} %` : 'tắt'
      nodes[3].rect.parentElement!.setAttribute('class', `flow-node${pct > 0 ? ' lit' : ''}`)
      nodes[0].rect.parentElement!.setAttribute('class', `flow-node${s.pressed ? ' pressed' : ''}`)

      setEdge(edges[0], `${s.pressed ? 'lo' : 'hi'}${s.running && s.readActive ? ' active' : ''}`, level)
      setEdge(edges[1], s.running && s.writeActive ? 'bus active' : 'bus', s.running && s.writeActive ? 'ghi kênh 15' : '—')
      setEdge(edges[2], `${pct > 0 ? 'hi' : 'lo'}${s.running && s.writeActive ? ' active' : ''}`, `PWM ${pct} %`)
    },
  }
}
