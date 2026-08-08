import { getCellAt, MIN_GRID_LINE, store } from '../stores/game'
import { BEAD_R, BURN, CELL, DISPLAY_CELL, FUSE_MAX, IRON_RADIUS, beadHash, hexToRgb, shade } from '../utils/color'
import type { ViewState } from '../types'
import ironImgUrl from '../assets/iron.png'

/** 熨斗参考图（已抠透明背景），熨烫光标直接贴图使用 */
const ironImg = new Image()
ironImg.src = ironImgUrl

/** hex → 带 alpha 的 rgba（塑料透光/光晕需要半透明同色） */
function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

/** 珠子显示尺寸低于该值时简化绘制（缩小到看不清细节时省性能、画面干净） */
const MIN_DETAIL_CELL = 10

/**
 * 无限画布渲染：canvas 位图固定 = 视口 CSS × dpr，
 * 用 transform（缩放 k × dpr + 平移 -view）把世界坐标（逻辑像素）映射到位图。
 */
function viewTransform(view: ViewState): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  return (dpr * DISPLAY_CELL * view.zoom) / CELL
}

/**
 * 静态层：白色工作板 + 网格线 + 定位点 + 图纸色块 + 珠子（含熔融形态）。
 * 只绘制视口覆盖的格子范围（网格线/定位点在格子过小时自动隐藏），
 * 内容只随网格数据/视口变化，可渲染到离屏缓存；PixelCanvas 在无变化时直接贴缓存。
 */
export function render2DStatic(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, view: ViewState) {
  const { cols, rows, grid } = store
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const k = (DISPLAY_CELL * view.zoom) / CELL // 逻辑 px → 显示 px（不含 dpr）
  const s = dpr * k
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s)

  // 视口世界范围（逻辑 px），外扩 2px 避免取整缝隙
  const vw = canvas.width / dpr / k
  const vh = canvas.height / dpr / k
  const x0 = view.x - 2
  const y0 = view.y - 2
  const x1 = view.x + vw + 4
  const y1 = view.y + vh + 4

  // 白色工作板（只铺视口覆盖范围）
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0)

  // 格子足够大才画网格线 + 定位点（缩小时隐藏，画面干净且省性能）
  const cellView = DISPLAY_CELL * view.zoom
  if (cellView >= MIN_GRID_LINE) {
    const c0 = Math.max(1, Math.floor(view.x / CELL))
    const c1 = Math.min(cols, Math.ceil((view.x + vw) / CELL))
    const r0 = Math.max(1, Math.floor(view.y / CELL))
    const r1 = Math.min(rows, Math.ceil((view.y + vh) / CELL))
    ctx.fillStyle = '#ece9e2'
    for (let c = c0; c <= c1; c++) ctx.fillRect(c * CELL, y0, 1, y1 - y0)
    for (let r = r0; r <= r1; r++) ctx.fillRect(x0, r * CELL, x1 - x0, 1)
    // 淡定位点（仅可见格子）
    const pc0 = Math.max(0, Math.floor(view.x / CELL))
    const pc1 = Math.min(cols - 1, Math.floor((view.x + vw) / CELL))
    const pr0 = Math.max(0, Math.floor(view.y / CELL))
    const pr1 = Math.min(rows - 1, Math.floor((view.y + vh) / CELL))
    ctx.fillStyle = '#d8d4ca'
    for (let r = pr0; r <= pr1; r++)
      for (let c = pc0; c <= pc1; c++)
        ctx.fillRect(c * CELL + CELL / 2 - 1, r * CELL + CELL / 2 - 1, 2, 2)
  }

  // 可见格子范围（clamp 到网格，视口外的格子不画）
  const cc0 = Math.max(0, Math.floor(view.x / CELL))
  const cc1 = Math.min(cols - 1, Math.floor((view.x + vw) / CELL))
  const cr0 = Math.max(0, Math.floor(view.y / CELL))
  const cr1 = Math.min(rows - 1, Math.floor((view.y + vh) / CELL))

  // 拼豆图纸：全网格统计边界（外框线完整），只画可见格子的色块；放豆后由珠子覆盖
  let pMinC = Infinity
  let pMinR = Infinity
  let pMaxC = -1
  let pMaxR = -1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = grid[r][c].pixel
      if (!px) continue
      if (c < pMinC) pMinC = c
      if (c > pMaxC) pMaxC = c
      if (r < pMinR) pMinR = r
      if (r > pMaxR) pMaxR = r
      if (r >= cr0 && r <= cr1 && c >= cc0 && c <= cc1) {
        ctx.fillStyle = px
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL)
      }
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

  // 珠子（仅可见范围）
  for (let r = cr0; r <= cr1; r++) {
    for (let c = cc0; c <= cc1; c++) {
      const cell = grid[r][c]
      if (!cell.color) continue
      const cx = c * CELL + CELL / 2
      const cy = r * CELL + CELL / 2
      const m = cell.melt
      let color = cell.color
      if (m > BURN) color = shade(color, -0.5)
      else if (m > FUSE_MAX) color = shade(color, -0.12)
      if (m >= 0.3) drawMeltedBead(ctx, cx, cy, r, c, m, color, cellView)
      else drawRoundBead(ctx, cx, cy, color, cellView)
    }
  }
}

/**
 * 未熔融圆形拼豆：伪 3D 半透明塑料空心圆柱。
 * 塑料质感 = 底部透光光晕（半透明）+ 顶面受光渐变 + 菲涅尔边缘亮环（斜视反射）
 * + 环境反射带 + 清晰镜面高光斑 + 珠孔透光。
 */
function drawRoundBead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string,
  cellView: number,
) {
  const R = BEAD_R
  const TILT = 0.86 // 顶面椭圆纵轴比例（俯视角度）
  const holeR = R * 0.42 // 珠孔直径（真实拼豆孔/外径 ≈ 0.4）
  // 顶面中心（微俯视下略高于珠体中心）
  const tx = cx
  const ty = cy - 1.2

  // 缩得很小：简化绘制（纯色椭圆 + 孔），保证缩小后画面干净且快
  if (cellView < MIN_DETAIL_CELL) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.ellipse(tx, ty, R, R * TILT, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = shade(color, -0.45)
    ctx.beginPath()
    ctx.ellipse(tx, ty, holeR, holeR * TILT, 0, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  // 1. 侧壁 + 底部：深色，比顶面大一圈并向下偏移（圆柱高度感）
  ctx.fillStyle = shade(color, -0.3)
  ctx.beginPath()
  ctx.ellipse(tx, cy + 1.8, R + 0.5, (R + 0.5) * TILT + 2.2, 0, 0, Math.PI * 2)
  ctx.fill()
  // 2. 底部透光光晕：光从半透明塑料底部渗出（与色同色的柔和晕光）
  const glow = ctx.createRadialGradient(tx, cy + 1.8, R * 0.25, tx, cy + 1.8, (R + 0.5) * 1.6)
  glow.addColorStop(0, withAlpha(color, 0.38))
  glow.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.ellipse(tx, cy + 1.8, (R + 0.5) * 1.6, (R + 0.5) * 1.6 * TILT, 0, 0, Math.PI * 2)
  ctx.fill()
  // 3. 顶面：椭圆受光渐变（光源左上，塑料表面光洁 → 亮区更亮、边缘转折更分明）
  const g = ctx.createRadialGradient(tx - R * 0.35, ty - R * 0.42, R * 0.15, tx, ty, R)
  g.addColorStop(0, shade(color, 0.5))
  g.addColorStop(0.45, shade(color, 0.15))
  g.addColorStop(0.75, color)
  g.addColorStop(1, shade(color, -0.25)) // 顶面外缘转折（暗边缘 + 下方菲涅尔亮环）
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(tx, ty, R, R * TILT, 0, 0, Math.PI * 2)
  ctx.fill()
  // 4. 菲涅尔边缘亮环：斜视处反射环境光（塑料轮廓一圈微光）
  ctx.strokeStyle = 'rgba(255,255,255,0.32)'
  ctx.lineWidth = R * 0.16
  ctx.beginPath()
  ctx.ellipse(tx, ty, R - R * 0.08, (R - R * 0.08) * TILT, 0, 0, Math.PI * 2)
  ctx.stroke()
  // 5. 环境反射带：左上柔光大面积反光（模拟房间环境的漫反射）
  const hg = ctx.createRadialGradient(
    tx - R * 0.38, ty - R * 0.45, R * 0.1,
    tx - R * 0.38, ty - R * 0.45, R * 1.15,
  )
  hg.addColorStop(0, 'rgba(255,255,255,0.28)')
  hg.addColorStop(0.4, 'rgba(255,255,255,0.1)')
  hg.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hg
  ctx.beginPath()
  ctx.ellipse(tx, ty, R, R * TILT, 0, 0, Math.PI * 2)
  ctx.fill()
  // 6. 清晰镜面高光斑：小而亮的塑料镜面反射点
  const spx = tx - R * 0.32
  const spy = ty - R * 0.44
  const sp = ctx.createRadialGradient(spx, spy, R * 0.04, spx, spy, R * 0.32)
  sp.addColorStop(0, 'rgba(255,255,255,0.95)')
  sp.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sp
  ctx.beginPath()
  ctx.ellipse(spx, spy, R * 0.34, R * 0.34 * TILT, 0, 0, Math.PI * 2)
  ctx.fill()
  // 7. 珠孔：椭圆，孔缘内壁阴影深 → 孔中心透光微亮（半透明塑料，光从孔底透出）
  const hg2 = ctx.createRadialGradient(tx, ty, holeR * 0.15, tx, ty, holeR)
  hg2.addColorStop(0, shade(color, 0.25)) // 孔底透光
  hg2.addColorStop(0.5, shade(color, -0.35)) // 内壁
  hg2.addColorStop(1, shade(color, -0.55)) // 孔缘内壁阴影最深
  ctx.fillStyle = hg2
  ctx.beginPath()
  ctx.ellipse(tx, ty, holeR, holeR * TILT, 0, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 熔融扁珠：熨烫后熔融的扁平塑料片（圆角圆盘）。
 * 同样用透光光晕 + 菲涅尔边缘 + 高光带 + 镜面高光斑模拟塑料片的光泽。
 */
function drawMeltedBead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  c: number,
  m: number,
  color: string,
  cellView: number,
) {
  const bh = beadHash(r, c)
  const asp = 0.92 + bh * 0.16
  const bs = CELL * (0.85 + m * 0.4 + bh * 0.06)
  const w = Math.floor(bs * asp)
  const hh = Math.floor(bs / asp)
  const hw = w / 2
  const h2 = hh / 2
  const rr = Math.max(3, Math.floor(m * CELL * 0.22 + bh * 3))

  // 缩得很小：简化绘制（纯色圆角矩形），保证缩小后画面干净且快
  if (cellView < MIN_DETAIL_CELL) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(cx - hw, cy - h2, w, hh, rr)
    ctx.fill()
    return
  }

  // 1. 侧壁：深色底盘向下偏移（熔融后的矮圆盘）
  ctx.fillStyle = shade(color, -0.3)
  ctx.beginPath()
  ctx.roundRect(cx - hw - 1, cy - h2 - 1 + 2, w + 2, hh + 2, rr + 2)
  ctx.fill()
  // 2. 底部透光光晕：半透明塑料片底缘渗光
  const glow = ctx.createRadialGradient(cx, cy, hh * 0.2, cx, cy, Math.max(w, hh) * 0.85)
  glow.addColorStop(0, withAlpha(color, 0.35))
  glow.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.roundRect(cx - hw * 1.4, cy - h2 * 1.4, w * 1.4, hh * 1.4, rr + 4)
  ctx.fill()
  // 3. 顶面：受光渐变（塑料表面光洁，亮区更亮、边缘转折更分明）
  const g = ctx.createRadialGradient(
    cx - w * 0.18, cy - hh * 0.32, hh * 0.08,
    cx, cy, Math.max(w, hh) * 0.62,
  )
  g.addColorStop(0, shade(color, 0.42))
  g.addColorStop(0.55, color)
  g.addColorStop(1, shade(color, -0.25))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(cx - hw, cy - h2, w, hh, rr)
  ctx.fill()
  // 4. 菲涅尔边缘亮环：轮廓一圈微光
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = Math.max(1.2, hh * 0.06)
  ctx.beginPath()
  ctx.roundRect(cx - hw + hh * 0.05, cy - h2 + hh * 0.05, w - hh * 0.1, hh - hh * 0.1, rr)
  ctx.stroke()
  // 5. 塑料高光带：顶部一条清晰反光带（光滑平面反射光源）
  const hg = ctx.createLinearGradient(0, cy - h2, 0, cy - h2 + hh * 0.42)
  hg.addColorStop(0, 'rgba(255,255,255,0.6)')
  hg.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hg
  ctx.beginPath()
  ctx.roundRect(cx - hw + 1, cy - h2 + 1, w - 2, hh * 0.42, rr)
  ctx.fill()
  // 6. 清晰镜面高光斑：小亮斑增强塑料光泽
  const spx = cx - w * 0.2
  const spy = cy - hh * 0.3
  const spr = Math.max(w, hh) * 0.2
  const sp = ctx.createRadialGradient(spx, spy, spr * 0.05, spx, spy, spr)
  sp.addColorStop(0, 'rgba(255,255,255,0.9)')
  sp.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sp
  ctx.beginPath()
  ctx.ellipse(spx, spy, spr * 1.1, spr * 0.8, -0.35, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 动态层：设计模式悬停虚线提示 + 熨烫模式熨斗光标。
 * 随鼠标位置逐帧变化，每帧直接绘制在可见画布上（静态层走离屏缓存）。
 * 坐标均为世界坐标，transform 与静态层一致。
 */
export function render2DOverlay(ctx: CanvasRenderingContext2D, view: ViewState) {
  const { grid, mouse, mode } = store
  const s = viewTransform(view)
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s)

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

/** 全量绘制（静态层 + 动态层）：熨烫熔融动画等珠子逐帧变化的场景使用 */
export function render2D(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, view: ViewState) {
  render2DStatic(ctx, canvas, view)
  render2DOverlay(ctx, view)
}
