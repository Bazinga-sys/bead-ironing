import * as THREE from 'three'
import type { BeadSize } from '../types'

/**
 * 豆子规格参数（相对格子尺寸归一化，行业实测尺寸，含 ±0.2mm 公差）：
 * - s：珠体相对格子的比例（5mm 大豆填满格子；2.6mm 迷你豆略小、更精细）
 * - hole：中心孔径 / 外径——实测 5mm≈0.5、2.6mm≈0.52，此处略放大（+0.05）让空心更明显
 * - tol：生产公差 ±0.2mm 相对外径的比例，用于每颗豆的尺寸抖动
 */
export const BEAD_SCALE: Record<BeadSize, { s: number; hole: number; tol: number }> = {
  big: { s: 1, hole: 0.55, tol: 0.2 / 5 },
  mini: { s: 0.88, hole: 0.57, tol: 0.2 / 2.6 },
}

/** 珠体高度系数：无熔融时珠高 = 规格比例 s × 此系数（熔融时按 1−0.92×melt 压扁） */
export const BEAD_HEIGHT = 2.0

/**
 * 空心珠几何体（EVA 空心短圆筒）：圆环拉伸（高细分、圆润边缘），俯视可见贯穿珠孔。
 * 孔径占比随豆子规格变化。拼豆棋盘（useThreeBoard）专用，
 */
export function createHollowBeadGeometry(size: BeadSize = 'big'): THREE.ExtrudeGeometry {
  const ringShape = new THREE.Shape()
  ringShape.absarc(0, 0, 1, 0, Math.PI * 2, false)
  const hp = new THREE.Path()
  hp.absarc(0, 0, BEAD_SCALE[size].hole, 0, Math.PI * 2, true)
  ringShape.holes.push(hp)
  const geo = new THREE.ExtrudeGeometry(ringShape, {
    depth: 0.55,
    // 不开 bevel：真实 EVA 拼豆是锐利直角切面的中空短管，无内外倒角
    bevelEnabled: false,
    curveSegments: 32,
  })
  geo.center()
  geo.rotateX(Math.PI / 2)
  return geo
}

/**
 * 熔融扁珠几何体：圆角矩形拉伸，中心保留小孔——EVA 熨烫后孔洞不容易完全消失，
 * 只略微收缩（残留孔随 instance 的 y 缩放一起压扁）。
 */
export function createFilledBeadGeometry(_size: BeadSize = 'big'): THREE.ExtrudeGeometry {
  const rw = 0.95
  const rh = 0.95
  const rr = 0.25
  const rrect = new THREE.Shape()
  rrect.moveTo(-rw + rr, -rh)
  rrect.lineTo(rw - rr, -rh)
  rrect.quadraticCurveTo(rw, -rh, rw, -rh + rr)
  rrect.lineTo(rw, rh - rr)
  rrect.quadraticCurveTo(rw, rh, rw - rr, rh)
  rrect.lineTo(-rw + rr, rh)
  rrect.quadraticCurveTo(-rw, rh, -rw, rh - rr)
  rrect.lineTo(-rw, -rh + rr)
  rrect.quadraticCurveTo(-rw, -rh, -rw + rr, -rh)
  // 熨烫残留孔（小于未熨烫时的孔径）
  const hp = new THREE.Path()
  hp.absarc(0, 0, 0.22, 0, Math.PI * 2, true)
  rrect.holes.push(hp)
  const geo = new THREE.ExtrudeGeometry(rrect, {
    depth: 1,
    // 不开 bevel：熔融扁珠的切面同样锐利（俯视圆角矩形仅表示熨烫融合轮廓）
    bevelEnabled: false,
    curveSegments: 32,
  })
  geo.center()
  geo.rotateX(Math.PI / 2)
  return geo
}

/**
 * EVA 表面粗糙度噪声贴图（程序化 value noise，乘法工作流）：
 * base roughness 恒为 1，贴图 green 通道直接承载最终粗糙度——
 * 模拟注塑细微纹理，避免纯色材质在环境高光下显得"死板"。
 * - hollow（未熨烫）：0.70 ± 0.05 均匀波动（EVA 原生哑光，高光大而虚）
 * - filled（熨烫后）：0.62–0.68 为主，随机熔接斑块局部降到 0.45–0.55（略光滑、轻微发亮）
 */
function createRoughnessMap(opts: { center: number; spread: number; glossySpots?: boolean }): THREE.CanvasTexture {
  const SIZE = 128
  const G = 8 // 低分辨率随机网格 + 双线性插值 → 平滑噪声
  const grid = new Float32Array((G + 1) * (G + 1))
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random()
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(SIZE, SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const gx = (x / SIZE) * G
      const gy = (y / SIZE) * G
      const x0 = Math.floor(gx)
      const y0 = Math.floor(gy)
      const fx = smooth(gx - x0)
      const fy = smooth(gy - y0)
      const v =
        (grid[y0 * (G + 1) + x0] * (1 - fx) + grid[y0 * (G + 1) + x0 + 1] * fx) * (1 - fy) +
        (grid[(y0 + 1) * (G + 1) + x0] * (1 - fx) + grid[(y0 + 1) * (G + 1) + x0 + 1] * fx) * fy
      const r = opts.center + (v - 0.5) * 2 * opts.spread
      const g = Math.round(Math.max(0, Math.min(1, r)) * 255)
      const i = (y * SIZE + x) * 4
      img.data[i] = g
      img.data[i + 1] = g
      img.data[i + 2] = g
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  // 熨烫后：随机熔接斑块略微变光滑（粗糙度 0.45–0.55，即比基础 0.65 更暗）
  if (opts.glossySpots) {
    const baseG = Math.round(opts.center * 255)
    const spots = 6
    for (let s = 0; s < spots; s++) {
      const cx = Math.random() * SIZE
      const cy = Math.random() * SIZE
      const r = 8 + Math.random() * 14
      const col = Math.round((0.45 + Math.random() * 0.1) * 255)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, `rgb(${col},${col},${col})`)
      grad.addColorStop(1, `rgba(${baseG},${baseG},${baseG},0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 4) // 单颗豆表面多次周期，弱化跨豆纹理重复感
  return tex
}

/**
 * EVA 空心珠材质（未熨烫原生 EVA，哑光软塑料）：
 * 金属度 0 / 粗糙度 0.70±0.05 / IOR 1.46 / 极微弱半透（transmission 0.08）。
 * 高光模糊、范围大，几乎看不清清晰反射；与亮面 PE（roughness 0.4–0.5）明显区分。
 */
export function createEvaHollowMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: 1, // 乘法工作流：实际值由 roughnessMap 承载
    roughnessMap: createRoughnessMap({ center: 0.7, spread: 0.05 }),
    metalness: 0,
    clearcoat: 0,
    transmission: 0.08,
    ior: 1.46,
    thickness: 1.2,
    envMapIntensity: 1.0,
  })
}

/**
 * EVA 熔融扁珠材质（熨烫完成后的成品）：
 * 大部分区域保持 0.62–0.68 哑光，局部熔接处轻微变光滑发亮（0.45–0.55）；
 * 比未熨烫更不透光，仍无金属感。
 */
export function createEvaFilledMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: 1, // 乘法工作流：实际值由 roughnessMap 承载
    roughnessMap: createRoughnessMap({ center: 0.65, spread: 0.03, glossySpots: true }),
    metalness: 0,
    clearcoat: 0,
    transmission: 0.03,
    ior: 1.46,
    thickness: 1.5,
    envMapIntensity: 0.95,
  })
}
