import type { Cell } from '../types'
import { shade } from './color'

/**
 * 把拼豆网格绘制成缩略图 PNG：只包含珠子实际占据的区域（裁剪到图案边界），
 * 背景透明、无底板方框。每颗珠子按主画布的画法绘制（渐变高光的圆形拼豆 /
 * 柔和明暗的熔融扁珠），因此图案边缘呈现拼豆本身的圆形轮廓。
 * 高分辨率位图 + 抗锯齿，磁贴显示时平滑缩放，呈现与主画布一致的塑料质感。
 * 不依赖 game store，避免循环导入。
 */
export function renderThumb(
  ctx: CanvasRenderingContext2D,
  grid: Cell[][],
  maxSize = 192,
) {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  // 计算内容边界（珠子实际占用的行列范围）
  let minR = rows, minC = cols, maxR = -1, maxC = -1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c].color) continue
      if (r < minR) minR = r
      if (r > maxR) maxR = r
      if (c < minC) minC = c
      if (c > maxC) maxC = c
    }
  }
  // 空图案：不绘制任何内容
  if (maxR < 0) {
    ctx.canvas.width = 0
    ctx.canvas.height = 0
    return
  }
  const cw = maxC - minC + 1
  const ch = maxR - minR + 1
  // 高分辨率：保证图案最长边接近 maxSize，且每格至少 8px、最多 24px（列表缩略图显示放大也不糊）
  const scale = Math.max(8, Math.min(24, Math.round(maxSize / Math.max(cw, ch))))
  ctx.canvas.width = cw * scale
  ctx.canvas.height = ch * scale
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const cell = grid[r][c]
      if (!cell.color) continue
      const cx = (c - minC + 0.5) * scale
      const cy = (r - minR + 0.5) * scale
      const m = cell.melt
      let color = cell.color
      if (m > 0.85) color = shade(color, -0.5)
      else if (m > 0.3) color = shade(color, -0.12)
      if (m >= 0.3) {
        // 熔融扁珠：柔和明暗渐变圆角方块
        const bs = scale * 0.92
        const rr = Math.max(2, scale * 0.3)
        const g = ctx.createLinearGradient(0, cy - bs / 2, 0, cy + bs / 2)
        g.addColorStop(0, shade(color, 0.2))
        g.addColorStop(0.5, color)
        g.addColorStop(1, shade(color, -0.2))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.roundRect(cx - bs / 2, cy - bs / 2, bs, bs, rr)
        ctx.fill()
      } else {
        // 圆形拼豆（与主画布一致：伪 3D 空心圆柱，微俯视）
        const R = scale * 0.43
        const TILT = 0.86
        const holeR = R * 0.42
        const tx = cx
        const ty = cy - 1.2 * (scale / 14)
        // 侧壁 + 底部
        ctx.fillStyle = shade(color, -0.3)
        ctx.beginPath()
        ctx.ellipse(tx, cy + 1.8 * (scale / 14), R + 0.5, (R + 0.5) * TILT + 2.2 * (scale / 14), 0, 0, Math.PI * 2)
        ctx.fill()
        // 顶面受光渐变
        const g = ctx.createRadialGradient(tx - R * 0.35, ty - R * 0.42, R * 0.15, tx, ty, R)
        g.addColorStop(0, shade(color, 0.35))
        g.addColorStop(0.55, color)
        g.addColorStop(0.85, shade(color, -0.05))
        g.addColorStop(1, shade(color, -0.15))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(tx, ty, R, R * TILT, 0, 0, Math.PI * 2)
        ctx.fill()
        // 高光弧
        const hg = ctx.createRadialGradient(tx - R * 0.38, ty - R * 0.45, R * 0.1, tx - R * 0.38, ty - R * 0.45, R * 1.15)
        hg.addColorStop(0, 'rgba(255,255,255,0.5)')
        hg.addColorStop(0.4, 'rgba(255,255,255,0.16)')
        hg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = hg
        ctx.beginPath()
        ctx.ellipse(tx, ty, R, R * TILT, 0, 0, Math.PI * 2)
        ctx.fill()
        // 珠孔：内壁阴影（中空深度）
        const hg2 = ctx.createRadialGradient(tx, ty, holeR * 0.15, tx, ty, holeR)
        hg2.addColorStop(0, shade(color, -0.1))
        hg2.addColorStop(0.55, shade(color, -0.42))
        hg2.addColorStop(1, shade(color, -0.6))
        ctx.fillStyle = hg2
        ctx.beginPath()
        ctx.ellipse(tx, ty, holeR, holeR * TILT, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}
