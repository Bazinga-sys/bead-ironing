import { store } from '../stores/game'
import { BURN, CELL, FUSE_MAX, FUSE_MIN, IRON_RADIUS, IRON_SPEED } from '../utils/color'

/** 统计并刷新熨烫进度（写入 store.progress，供 IronProgress 组件展示） */
function updateIronProgress() {
  let total = 0
  let fused = 0
  let burned = 0
  let count = 0
  for (let r = 0; r < store.rows; r++) {
    for (let c = 0; c < store.cols; c++) {
      const cell = store.grid[r][c]
      if (!cell.color) continue
      count++
      total += cell.melt
      if (cell.melt >= FUSE_MIN && cell.melt <= FUSE_MAX) fused++
      else if (cell.melt > BURN) burned++
    }
  }
  if (count === 0) return
  const avg = total / count
  store.progress.avg = avg
  store.progress.count = count
  store.progress.fused = fused
  store.progress.burned = burned
  store.progress.fillColor =
    avg > BURN ? '#b13e53' : avg > FUSE_MAX ? '#ffcd75' : avg > FUSE_MIN ? '#38b764' : '#41a6f6'
  store.progress.label =
    burned > 0
      ? `!! ${burned} BURNED ${fused}/${count}`
      : fused === count
        ? `OK! ${fused}/${count}`
        : avg > FUSE_MAX
          ? `CAREFUL ${fused}/${count}`
          : `IRONING ${fused}/${count}`
}

/**
 * 熨烫 rAF 循环：按住鼠标时按椭圆衰减半径累计 melt。
 * 仅在 ironing 模式下运行，模式切换后自动退出。
 */
export function useIroning(render: () => void) {
  let raf: number | null = null
  let last = 0

  function loop(ts: number) {
    if (store.mode !== 'ironing') {
      raf = null
      return
    }
    if (!last) last = ts
    const dt = Math.min((ts - last) / 1000, 0.05)
    last = ts

    if (store.mouse.down && store.mouse.x >= 0) {
      for (let r = 0; r < store.rows; r++) {
        for (let c = 0; c < store.cols; c++) {
          const cell = store.grid[r][c]
          if (!cell.color) continue
          const cx = c * CELL + CELL / 2
          const cy = r * CELL + CELL / 2
          const ex = (cx - store.mouse.x) / (IRON_RADIUS * 1.25)
          const ey = (cy - store.mouse.y) / (IRON_RADIUS * 1.15)
          const d2 = ex * ex + ey * ey
          if (d2 < 1) {
            const f = 1 - Math.sqrt(d2)
            cell.melt = Math.min(1, cell.melt + IRON_SPEED * f * dt)
          }
        }
      }
    }
    updateIronProgress()
    render()
    raf = requestAnimationFrame(loop)
  }

  function start() {
    if (raf === null) {
      last = 0
      raf = requestAnimationFrame(loop)
    }
  }

  function stop() {
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
  }

  return { start, stop }
}
