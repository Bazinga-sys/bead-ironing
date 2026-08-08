/** 布局与物理常量（与原 HTML 一致） */
export const CELL = 14
export const DISPLAY_CELL = 36
export const BEAD_R = 6
export const IRON_RADIUS = 55
export const FUSE_MIN = 0.3
export const FUSE_MAX = 0.7
export const BURN = 0.85
export const IRON_SPEED = 1.0
export const MAX_PIX = 60

/** 调色板（原应用完整颜色表） */
export const COLORS = [
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
  '#000000', '#ffffff', '#ff004d', '#ff77a8', '#ffa300', '#ffec27', '#00e436', '#29adff',
  '#83769c', '#ffccaa', '#c2c3c7', '#7e2553', '#008751', '#ab5236', '#5f574f', '#ff6e27',
]

export function hexToRgb(h: string): [number, number, number] {
  if (h.startsWith('rgb')) {
    const m = h.match(/\d+/g)!
    return [Number(m[0]), Number(m[1]), Number(m[2])]
  }
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
}

/** 颜色调亮(a>0)/调暗(a<0)，与原实现一致 */
export function shade(h: string, a: number): string {
  let [r, g, b] = hexToRgb(h)
  if (a < 0) {
    r *= 1 + a
    g *= 1 + a
    b *= 1 + a
  } else {
    r += (255 - r) * a
    g += (255 - g) * a
    b += (255 - b) * a
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

/** 珠子尺寸/反光的确定性伪随机散列 */
export function beadHash(r: number, c: number): number {
  return ((r * 73 + c * 37 + r * c * 13) % 100) / 100
}

export const COLORS_RGB = COLORS.map(hexToRgb)
