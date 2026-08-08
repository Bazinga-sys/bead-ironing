import { getCellAt, store } from '../stores/game'
import { BEAD_R, BURN, CELL, FUSE_MAX, IRON_RADIUS, beadHash, shade } from '../utils/color'
import ironImgUrl from '../assets/iron.png'

/** 熨斗参考图（已抠透明背景），熨烫光标直接贴图使用 */
const ironImg = new Image()
ironImg.src = ironImgUrl

/**
 * 2D 渲染主函数：网格底、珠子（含熔融形态）、设计悬停提示、熨斗光标。
 * 由 PixelCanvas 在事件与动画帧时调用，纯命令式绘制。
 * 画布位图是逻辑坐标 × DPR（高分辨率抗锯齿），入口按比例 setTransform 保持逻辑坐标。
 */
export function render2D(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const { cols, rows, grid, mouse, mode } = store
  const dpr = canvas.width / (cols * CELL) || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // 白色工作板 + 浅灰网格线 + 淡定位点
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#ece9e2'
  for (let i = 1; i < cols; i++) {
    ctx.fillRect(i * CELL, 0, 1, canvas.height)
    ctx.fillRect(0, i * CELL, canvas.width, 1)
  }
  ctx.fillStyle = '#d8d4ca'
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      ctx.fillRect(c * CELL + CELL / 2 - 1, r * CELL + CELL / 2 - 1, 2, 2)

  // 拼豆图纸：导入图片按调色板色块显示（不摆豆），每个格子带外框线；放豆后由珠子覆盖
  let pMinC = Infinity
  let pMinR = Infinity
  let pMaxC = -1
  let pMaxR = -1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = grid[r][c].pixel
      if (!px) continue
      ctx.fillStyle = px
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL)
      if (c < pMinC) pMinC = c
      if (c > pMaxC) pMaxC = c
      if (r < pMinR) pMinR = r
      if (r > pMaxR) pMaxR = r
    }
  }
  if (pMaxC >= 0) {
    // 图纸格子外框线（仅覆盖图纸区域）
    ctx.strokeStyle = 'rgba(40,40,50,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = pMinC; c <= pMaxC + 1; c++) {
      ctx.moveTo(c * CELL, pMinR * CELL)
      ctx.lineTo(c * CELL, (pMaxR + 1) * CELL)
    }
    for (let r = pMinR; r <= pMaxR + 1; r++) {
      ctx.moveTo(pMinC * CELL, r * CELL)
      ctx.lineTo((pMaxC + 1) * CELL, r * CELL)
    }
    ctx.stroke()
  }

  // 珠子
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c]
      if (!cell.color) continue
      const cx = c * CELL + CELL / 2
      const cy = r * CELL + CELL / 2
      const m = cell.melt
      let color = cell.color
      if (m > BURN) color = shade(color, -0.5)
      else if (m > FUSE_MAX) color = shade(color, -0.12)

      if (m >= 0.3) {
        // 熔融扁珠：圆盘状受光（左上亮 → 边缘微暗），熨烫后熔融的扁平塑料片
        const bh = beadHash(r, c)
        const asp = 0.92 + bh * 0.16
        const bs = CELL * (0.85 + m * 0.4 + bh * 0.06)
        const w = Math.floor(bs * asp)
        const hh = Math.floor(bs / asp)
        const hw = w / 2
        const h2 = hh / 2
        const rr = Math.max(3, Math.floor(m * CELL * 0.22 + bh * 3))
        // 侧壁：深色底盘向下偏移（熔融后的矮圆盘）
        ctx.fillStyle = shade(color, -0.3)
        ctx.beginPath()
        ctx.roundRect(cx - hw - 1, cy - h2 - 1 + 2, w + 2, hh + 2, rr + 2)
        ctx.fill()
        // 顶面：受光渐变
        const g = ctx.createRadialGradient(
          cx - w * 0.18, cy - hh * 0.32, hh * 0.08,
          cx, cy, Math.max(w, hh) * 0.62,
        )
        g.addColorStop(0, shade(color, 0.28))
        g.addColorStop(0.55, color)
        g.addColorStop(1, shade(color, -0.2))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.roundRect(cx - hw, cy - h2, w, hh, rr)
        ctx.fill()
        // 顶部柔和高光带（塑料光泽）
        const hg = ctx.createLinearGradient(0, cy - h2, 0, cy - h2 + hh * 0.35)
        hg.addColorStop(0, 'rgba(255,255,255,0.45)')
        hg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = hg
        ctx.beginPath()
        ctx.roundRect(cx - hw + 1, cy - h2 + 1, w - 2, hh * 0.38, rr)
        ctx.fill()
      } else {
        // 圆形珠 = 伪 3D 空心圆柱（微俯视：可见侧壁 + 椭圆顶面 + 内壁珠孔）
        const R = BEAD_R
        const TILT = 0.86 // 顶面椭圆纵轴比例（俯视角度）
        const holeR = R * 0.42 // 珠孔直径（真实拼豆孔/外径 ≈ 0.4）
        // 顶面中心（微俯视下略高于珠体中心）
        const tx = cx
        const ty = cy - 1.2
        // 1. 侧壁 + 底部：深色，比顶面大一圈并向下偏移（圆柱高度感）
        ctx.fillStyle = shade(color, -0.3)
        ctx.beginPath()
        ctx.ellipse(tx, cy + 1.8, R + 0.5, (R + 0.5) * TILT + 2.2, 0, 0, Math.PI * 2)
        ctx.fill()
        // 2. 顶面：椭圆受光渐变（光源左上）
        const g = ctx.createRadialGradient(
          tx - R * 0.35, ty - R * 0.42, R * 0.15,
          tx, ty, R,
        )
        g.addColorStop(0, shade(color, 0.35))
        g.addColorStop(0.55, color)
        g.addColorStop(0.85, shade(color, -0.05))
        g.addColorStop(1, shade(color, -0.15)) // 顶面外缘转折
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(tx, ty, R, R * TILT, 0, 0, Math.PI * 2)
        ctx.fill()
        // 3. 顶面左上弧形高光（塑料光泽）
        const hg = ctx.createRadialGradient(
          tx - R * 0.38, ty - R * 0.45, R * 0.1,
          tx - R * 0.38, ty - R * 0.45, R * 1.15,
        )
        hg.addColorStop(0, 'rgba(255,255,255,0.5)')
        hg.addColorStop(0.4, 'rgba(255,255,255,0.16)')
        hg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = hg
        ctx.beginPath()
        ctx.ellipse(tx, ty, R, R * TILT, 0, 0, Math.PI * 2)
        ctx.fill()
        // 4. 珠孔：椭圆，孔缘内壁阴影深 → 孔中心透光微亮（中空深度）
        const hg2 = ctx.createRadialGradient(
          tx, ty, holeR * 0.15,
          tx, ty, holeR,
        )
        hg2.addColorStop(0, shade(color, -0.1)) // 孔底透光
        hg2.addColorStop(0.55, shade(color, -0.42)) // 内壁
        hg2.addColorStop(1, shade(color, -0.6)) // 孔缘内壁阴影最深
        ctx.fillStyle = hg2
        ctx.beginPath()
        ctx.ellipse(tx, ty, holeR, holeR * TILT, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // 设计模式：悬停虚线提示
  if (mode === 'design' && mouse.x >= 0) {
    const cell = getCellAt(mouse.x, mouse.y)
    if (cell) {
      const cx = cell.c * CELL + CELL / 2
      const cy = cell.r * CELL + CELL / 2
      ctx.strokeStyle =
        store.isEraser || grid[cell.r][cell.c].color ? '#ef7d57' : store.selectedColor
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      // 与伪 3D 圆柱顶面一致的椭圆提示
      ctx.ellipse(cx, cy - 1.2, BEAD_R + 1.5, (BEAD_R + 1.5) * 0.86, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // 熨烫模式：熨斗光标（直接使用参考图素材，原样贴图）
  if (mode === 'ironing' && mouse.x >= 0) {
    if (ironImg.complete && ironImg.naturalWidth > 0) {
      const w = IRON_RADIUS * 2.35 // 显示宽度与熨烫热区大致吻合
      const h = (w * ironImg.naturalHeight) / ironImg.naturalWidth
      ctx.save()
      ctx.shadowColor = 'rgba(130,95,115,0.3)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
      ctx.drawImage(ironImg, mouse.x - w / 2, mouse.y - h / 2, w, h)
      ctx.restore()
    }
  }
}
