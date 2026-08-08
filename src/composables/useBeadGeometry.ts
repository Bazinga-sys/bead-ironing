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
 * 把 ExtrudeGeometry 的侧壁组（materialIndex 1）按顶点半径拆成两段：
 * group 1 = 外壁（清漆反光带）、group 2 = 孔内壁（哑光，俯视时孔洞不发亮）。
 * ExtrudeGeometry 侧壁顶点顺序固定——先外轮廓、后孔轮廓——且顶点半径要么≈外径
 * 要么≈孔径，半径分类天然连续，正好分成两个 run。
 */
function splitSideWallGroups(geo: THREE.BufferGeometry, threshold: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const side = geo.groups.find((g) => g.materialIndex === 1)
  if (!side) return
  const isOuter = (v0: number): boolean => {
    for (let k = 0; k < 3; k++) {
      const i = v0 + k
      if (pos.getX(i) * pos.getX(i) + pos.getZ(i) * pos.getZ(i) < threshold * threshold) return false
    }
    return true
  }
  const groups: { start: number; count: number; materialIndex: number }[] = []
  for (const g of geo.groups) if (g.materialIndex === 0) groups.push({ start: g.start, count: g.count, materialIndex: 0 })
  let runStart = side.start
  let runMat = isOuter(side.start) ? 1 : 2
  for (let i = side.start + 3; i < side.start + side.count; i += 3) {
    const m = isOuter(i) ? 1 : 2
    if (m !== runMat) {
      groups.push({ start: runStart, count: i - runStart, materialIndex: runMat })
      runStart = i
      runMat = m
    }
  }
  groups.push({ start: runStart, count: side.start + side.count - runStart, materialIndex: runMat })
  geo.clearGroups()
  for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex)
}

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
  // 侧壁拆成外壁/内壁两组材质（外壁清漆反光、内壁哑光）
  splitSideWallGroups(geo, (1 + BEAD_SCALE[size].hole) / 2)
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
  // 侧壁拆成外壁/内壁两组材质（圆角矩形的角顶点半径可达 ~1.24，孔半径 0.22，阈值取 0.45）
  splitSideWallGroups(geo, 0.45)
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
 * 豆子顶/底面（cap）材质：哑光、颜色高饱和。
 * 俯视视角下豆子顶部是第一印象——顶层按 EVA 规范做哑光（hollow 0.70±0.04、
 * filled 0.62±0.04 + 局部熔接亮斑），且几乎不吃环境高光（env 0.12、无清漆层）：
 * Neutral 色调映射在 peak>0.76 时会压缩并去饱和，顶部混入白色高光会把颜色冲淡。
 */
function createEvaCapMaterial(opts: { glossySpots: boolean }): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: 1, // 乘法工作流：实际值由 roughnessMap 承载
    roughnessMap: createRoughnessMap(
      opts.glossySpots
        ? { center: 0.62, spread: 0.04, glossySpots: true }
        : { center: 0.7, spread: 0.04 },
    ),
    metalness: 0,
    clearcoat: 0,
    transmission: 0.02,
    ior: 1.46,
    thickness: 1.0,
    envMapIntensity: 0.12,
    specularIntensity: 0.2,
  })
}

/**
 * 豆子外壁材质：清漆反光（clearcoat 0.7、微光）。
 * 圆柱曲面受光形成垂直亮带——侧面的塑料反光感来自这里。
 * 强度刻意不拉满：俯视时外壁边缘是窄环，env 太强会变成每颗豆一圈白色眩光（"很强的反光"）；
 * 调到 ~200-215 亮度仍有清晰塑料感，但俯视不刺眼。
 */
function createEvaSideMaterial(opts: { glossy: boolean }): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: opts.glossy ? 0.25 : 0.3,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.14,
    transmission: 0.03,
    ior: 1.46,
    thickness: 1.2,
    envMapIntensity: 2.2,
    specularIntensity: 1.5,
  })
}

/**
 * 豆子孔内壁材质：哑光、整体压暗（假 AO 模拟孔洞内部阴影）。
 * 俯视透过珠孔看到的应是暗色腔体而不是反光——内壁不再用外壁的清漆材质。
 * 颜色系数乘 instanceColor 一起参与漫反射，孔内壁呈现"变暗的豆色"。
 */
function createEvaInnerMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x6f6f6f,
    roughness: 0.9,
    metalness: 0,
    clearcoat: 0,
    transmission: 0,
    envMapIntensity: 0.15,
    specularIntensity: 0.2,
  })
}

/**
 * 空心珠材质组：[0]=cap 顶/底面（哑光高饱和）、[1]=外壁（清漆反光）、[2]=孔内壁（哑光）。
 * ExtrudeGeometry 的 material groups 与之对应（group 0 = 上下 cap，group 1/2 = 外/内壁）。
 */
export function createEvaHollowMaterials(): THREE.Material[] {
  return [
    createEvaCapMaterial({ glossySpots: false }),
    createEvaSideMaterial({ glossy: false }),
    createEvaInnerMaterial(),
  ]
}

/** 熔融扁珠材质组：顶面带熔接亮斑，侧面比原生豆更光滑 */
export function createEvaFilledMaterials(): THREE.Material[] {
  return [
    createEvaCapMaterial({ glossySpots: true }),
    createEvaSideMaterial({ glossy: true }),
    createEvaInnerMaterial(),
  ]
}
