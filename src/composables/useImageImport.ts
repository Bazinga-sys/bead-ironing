import { expandGrid, showStatus, store, switchMode } from '../stores/game'
import { COLORS, COLORS_RGB, MAX_PIX } from '../utils/color'

/**
 * 图片导入 → 拼豆图纸：离屏画布缩采样 → 加权 RGB 最近色量化到调色板（豆子颜色）→
 * 写入 pixel 层，每个格子显示对应的豆子颜色方块，不自动摆豆。
 * 对照图纸手动放豆；放下的珠子覆盖图纸格，擦除即露出图纸。
 * 尺寸超出当前画布时自动扩容。
 */
export function importImage(file: File) {
  showStatus('正在读取图片...')
  const url = URL.createObjectURL(file)
  const img = new Image()

  img.onload = () => {
    const ir = img.width / img.height
    let pw: number
    let ph: number
    if (ir >= 1) {
      pw = MAX_PIX
      ph = Math.max(1, Math.round(MAX_PIX / ir))
    } else {
      ph = MAX_PIX
      pw = Math.max(1, Math.round(MAX_PIX * ir))
    }

    expandGrid(pw, ph)

    for (const row of store.grid)
      for (const cell of row) {
        cell.color = null
        cell.melt = 0
        cell.pixel = null
      }

    const oc = document.createElement('canvas')
    oc.width = pw
    oc.height = ph
    const octx = oc.getContext('2d')!
    octx.imageSmoothingEnabled = true
    octx.drawImage(img, 0, 0, pw, ph)
    const data = octx.getImageData(0, 0, pw, ph).data

    const offC = Math.floor((store.cols - pw) / 2)
    const offR = Math.floor((store.rows - ph) / 2)
    for (let r = 0; r < ph; r++) {
      for (let c = 0; c < pw; c++) {
        const i = (r * pw + c) * 4
        if (data[i + 3] < 128) continue
        const cr = data[i]
        const cg = data[i + 1]
        const cb = data[i + 2]
        let best = 0
        let bd = Infinity
        for (let k = 0; k < COLORS_RGB.length; k++) {
          const [pr, pg, pb] = COLORS_RGB[k]
          const d = 0.3 * (cr - pr) ** 2 + 0.59 * (cg - pg) ** 2 + 0.11 * (cb - pb) ** 2
          if (d < bd) {
            bd = d
            best = k
          }
        }
        store.grid[offR + r][offC + c].pixel = COLORS[best]
      }
    }

    switchMode('design')
    showStatus('导入完成：拼豆图纸，可对照放豆')
    URL.revokeObjectURL(url)
  }

  img.onerror = () => {
    showStatus('图片加载失败')
    URL.revokeObjectURL(url)
  }

  img.src = url
}
