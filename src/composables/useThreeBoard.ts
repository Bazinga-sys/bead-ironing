import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { eraseCell, expandGridKeep, getCellAt, MAX_GRID, placeBead, store } from '../stores/game'
import type { BeadSize } from '../types'
import { CELL, DISPLAY_CELL, FUSE_MAX, IRON_RADIUS, beadHash, burnAt } from '../utils/color'
import {
  BEAD_HEIGHT,
  BEAD_SCALE,
  createEvaFilledMaterial,
  createEvaHollowMaterial,
  createFilledBeadGeometry,
  createHollowBeadGeometry,
} from './useBeadGeometry'
import ironImgUrl from '../assets/iron.png'

export interface ThreeBoardHandle {
  resize(): void
  /** 熨烫动画帧：局部更新鼠标周围珠子的熔融形态 */
  update(): void
  /** 网格内容变化（放豆/导入/清空/载入）→ 重建珠子与图纸实例 */
  rebuild(): void
  /** 豆子规格切换（5mm / 2.6mm）→ 重建几何体与实例 */
  setSize(size: BeadSize): void
  dispose(): void
}

/** 初始俯视角（视线与水平面夹角，°）与相机 fov */
const TILT_DEG = 55
const FOV = 50
/** 缩放范围（1 = 每格 DISPLAY_CELL 显示像素） */
const MIN_SCALE = 0.25
const MAX_SCALE = 12
/** 每格显示像素低于该值时隐藏网格线 */
const MIN_GRID_LINE_PX = 10
/** 视角旋转灵敏度（rad/px）与俯仰角可调范围（10°~85°，初始 55°） */
const ROT_SPEED = 0.006
const PITCH_MIN = (10 * Math.PI) / 180
const PITCH_MAX = (85 * Math.PI) / 180

/**
 * 拼豆棋盘渲染器：three.js 实时光照（EVA 哑光塑料材质），
 * 倾斜俯视角（可旋转）+ 无限画布（滚轮锚点缩放 / 拖拽平移，网格按需扩容）。
 * 世界坐标：X = 列 c、Z = 行 r、Y 向上，格子 (r,c) 中心 = (c, 0, r)。
 */
export function createThreeBoard(container: HTMLElement): ThreeBoardHandle {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf5f3ee)

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 600)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  // OrbitControls 仅提供阻尼；旋转/平移/缩放全手写（保证无限画布行为）
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableRotate = false
  controls.enablePan = false
  controls.enableZoom = false
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  // 光照：房间环境贴图（塑料高光的来源）+ 环境光 + 主光（投射阴影）
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  scene.add(key)
  scene.add(key.target) // 阴影相机跟随注视中心，无限画布平移后阴影不丢
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const SHADOW_RANGE = 150
  key.shadow.camera.left = -SHADOW_RANGE
  key.shadow.camera.right = SHADOW_RANGE
  key.shadow.camera.top = SHADOW_RANGE
  key.shadow.camera.bottom = -SHADOW_RANGE
  key.shadow.camera.near = 10
  key.shadow.camera.far = 300
  key.shadow.camera.updateProjectionMatrix()
  key.shadow.bias = -0.002

  // 工作台地面（白色，接收珠子的投影）
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  scene.add(ground)

  // 网格线：MAX_GRID 全范围一次构建，相机自动裁剪
  const linePts: number[] = []
  for (let i = 0; i <= MAX_GRID; i++) {
    linePts.push(i, 0, 0, i, 0, MAX_GRID)
    linePts.push(0, 0, i, MAX_GRID, 0, i)
  }
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3))
  const gridLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xe7e4dc }))
  gridLines.position.y = 0.005
  scene.add(gridLines)

  // 珠子几何体与 EVA 哑光材质（雾面无高光、轻微透光）
  let hollowGeo = createHollowBeadGeometry(store.beadSize)
  let filledGeo = createFilledBeadGeometry(store.beadSize)
  const hollowMat = createEvaHollowMaterial()
  const filledMat = createEvaFilledMaterial()
  let size: BeadSize = store.beadSize
  let hollowMesh: THREE.InstancedMesh | null = null
  let filledMesh: THREE.InstancedMesh | null = null

  // 图纸色块（导入图片的像素参考层，放豆后由珠子盖住）
  const patternGeo = new THREE.PlaneGeometry(0.98, 0.98)
  patternGeo.rotateX(-Math.PI / 2)
  const patternMat = new THREE.MeshBasicMaterial()
  let patternMesh: THREE.InstancedMesh | null = null

  // 悬停格子框（设计模式）
  const hoverBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.05, 1)),
    new THREE.LineBasicMaterial({ color: 0xef7d57, transparent: true, opacity: 0.95 }),
  )
  hoverBox.visible = false
  scene.add(hoverBox)
  // 熨斗光标：透明背景 PNG 直接叠加在画布上方（不做 3D 投影），原图正常显示并跟随鼠标
  const ironImg = document.createElement('img')
  ironImg.src = ironImgUrl
  ironImg.alt = ''
  ironImg.style.cssText =
    'position:absolute;left:0;top:0;width:150px;height:auto;pointer-events:none;' +
    'transform:translate(-50%,-50%);display:none;z-index:2;'
  container.appendChild(ironImg)

  // 视口状态：缩放倍率 + 相机注视的地面中心（世界单位）
  let scale = 1
  let baseDist = 50
  const center = { x: 0, z: 0 }
  // 视角（球坐标）：yaw 绕 Y 轴（0 = 正 +Z 侧看），pitch 与水平面夹角。初始固定 55° 俯视
  let yaw = Math.PI
  let pitch = (TILT_DEG * Math.PI) / 180

  /** 珠子 instance 索引：key = r×MAX_GRID + c → (mesh, idx)，供熨烫局部更新 */
  const beadIndex = new Map<number, { mesh: THREE.InstancedMesh; idx: number }>()

  function viewportSize() {
    return { w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight) }
  }

  /** 标定 scale=1 时相机到注视点的距离，使每格显示 DISPLAY_CELL 像素 */
  function computeBaseDist(vh: number): number {
    const T = (TILT_DEG * Math.PI) / 180
    const a = ((FOV / 2) * Math.PI) / 180
    const f = Math.abs(1 / Math.tan(T + a) - 1 / Math.tan(T - a))
    const H = vh / (DISPLAY_CELL * f)
    return H / Math.sin(T)
  }

  /** 屏幕 NDC → 地面世界点（射线与 y=0 平面求交，精确） */
  function groundPoint(nx: number, ny: number): THREE.Vector3 | null {
    camera.updateMatrixWorld()
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera)
    const dir = v.sub(camera.position).normalize()
    if (dir.y >= -1e-4) return null
    const t = -camera.position.y / dir.y
    return camera.position.clone().addScaledVector(dir, t)
  }

  function groundFromClient(cx: number, cy: number): THREE.Vector3 | null {
    const rect = renderer.domElement.getBoundingClientRect()
    const nx = ((cx - rect.left) / rect.width) * 2 - 1
    const ny = -(((cy - rect.top) / rect.height) * 2 - 1)
    return groundPoint(nx, ny)
  }

  /** 熨斗图片跟随鼠标（相对画布的坐标） */
  function positionIron(cx: number, cy: number) {
    const rect = renderer.domElement.getBoundingClientRect()
    ironImg.style.left = `${cx - rect.left}px`
    ironImg.style.top = `${cy - rect.top}px`
  }

  /** 按当前相机可见范围扩容网格（只增不减、保留内容），保证视口内有格子 */
  function ensureGridFitsViewport() {
    let maxX = -Infinity
    let maxZ = -Infinity
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p = groundPoint(nx, ny)
      if (!p) continue
      maxX = Math.max(maxX, p.x)
      maxZ = Math.max(maxZ, p.z)
    }
    if (maxX === -Infinity) return
    expandGridKeep(Math.ceil(maxX) + 2, Math.ceil(maxZ) + 2)
  }

  /** 网格线显隐：完成（展示）模式隐藏，设计模式按缩放后每格的显示密度决定 */
  function updateGridLines() {
    gridLines.visible = !store.viewMode && DISPLAY_CELL * scale >= MIN_GRID_LINE_PX
  }

  /** 相机按当前 center/scale/yaw/pitch 定位（yaw=π、pitch=55° 时与初始固定视角一致） */
  function applyView() {
    const r = baseDist / scale
    const cp = Math.cos(pitch)
    camera.position.set(
      center.x + r * cp * Math.sin(yaw),
      r * Math.sin(pitch),
      center.z + r * cp * Math.cos(yaw),
    )
    controls.target.set(center.x, 0, center.z)
    controls.update()
    // 主光跟随注视中心，保持一致的阴影方向与覆盖范围
    key.position.set(center.x + 60, 120, center.z + 40)
    key.target.position.set(center.x, 0, center.z)
    updateGridLines()
  }

  /** 写入单个珠子 instance 的矩阵/颜色（熔融形态公式，按豆子规格缩放）。
   *  网格线在整数坐标，格子 (r,c) 的方格中心 = (c+0.5, r+0.5)——拼豆放在格子中间，一格一颗。 */
  function writeInstance(mesh: THREE.InstancedMesh, idx: number, r: number, c: number, melt: number) {
    const { s, tol } = BEAD_SCALE[size]
    // ±0.2mm 生产公差：按 hash 确定性抖动每颗豆的尺寸，大小略有参差
    const jitter = 1 + (beadHash(r, c) - 0.5) * 2 * tol
    const h = s * jitter * BEAD_HEIGHT * (1 - melt * 0.92)
    const rad = s * jitter * (0.48 + melt * 0.18)
    const col = new THREE.Color()
    col.set(store.grid[r][c].color!)
    const pos = new THREE.Vector3(c + 0.5, h / 2, r + 0.5)
    const sc = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const m4 = new THREE.Matrix4()
    if (mesh === filledMesh) {
      const bh2 = beadHash(r, c)
      const ax = 0.94 + bh2 * 0.12
      const az = 0.94 + (1 - bh2) * 0.12
      sc.set(rad * ax, h, rad * az)
      if (melt > burnAt(size)) col.multiplyScalar(0.35)
      else if (melt > FUSE_MAX) col.multiplyScalar(0.78)
    } else {
      sc.set(rad, h, rad)
    }
    m4.compose(pos, q, sc)
    mesh.setMatrixAt(idx, m4)
    mesh.setColorAt(idx, col)
  }

  /** 全量重建珠子实例（放豆/擦除/导入/载入/熔融跨形态边界时调用） */
  function buildBeadInstances() {
    const hollow: { r: number; c: number; m: number }[] = []
    const filled: { r: number; c: number; m: number }[] = []
    for (let r = 0; r < store.rows; r++)
      for (let c = 0; c < store.cols; c++) {
        const cell = store.grid[r][c]
        if (!cell.color) continue
        if (cell.melt < 0.35) hollow.push({ r, c, m: cell.melt })
        else filled.push({ r, c, m: cell.melt })
      }

    if (hollowMesh) scene.remove(hollowMesh)
    if (filledMesh) scene.remove(filledMesh)
    hollowMesh = null
    filledMesh = null
    beadIndex.clear()

    if (hollow.length > 0) {
      hollowMesh = new THREE.InstancedMesh(hollowGeo, hollowMat, Math.max(hollow.length, 1))
      hollowMesh.castShadow = true
      for (let i = 0; i < hollow.length; i++) {
        const { r, c, m } = hollow[i]
        writeInstance(hollowMesh, i, r, c, m)
        beadIndex.set(r * MAX_GRID + c, { mesh: hollowMesh, idx: i })
      }
      hollowMesh.count = hollow.length
      hollowMesh.instanceMatrix.needsUpdate = true
      if (hollowMesh.instanceColor) hollowMesh.instanceColor.needsUpdate = true
      scene.add(hollowMesh)
    }
    if (filled.length > 0) {
      filledMesh = new THREE.InstancedMesh(filledGeo, filledMat, Math.max(filled.length, 1))
      filledMesh.castShadow = true
      for (let i = 0; i < filled.length; i++) {
        const { r, c, m } = filled[i]
        writeInstance(filledMesh, i, r, c, m)
        beadIndex.set(r * MAX_GRID + c, { mesh: filledMesh, idx: i })
      }
      filledMesh.count = filled.length
      filledMesh.instanceMatrix.needsUpdate = true
      if (filledMesh.instanceColor) filledMesh.instanceColor.needsUpdate = true
      scene.add(filledMesh)
    }
  }

  /** 重建图纸色块实例（导入/清空/载入时） */
  function rebuildPattern() {
    const cells: { r: number; c: number; px: string }[] = []
    for (let r = 0; r < store.rows; r++)
      for (let c = 0; c < store.cols; c++) {
        const px = store.grid[r][c].pixel
        if (px) cells.push({ r, c, px })
      }
    if (patternMesh) scene.remove(patternMesh)
    patternMesh = null
    if (cells.length === 0) return
    patternMesh = new THREE.InstancedMesh(patternGeo, patternMat, cells.length)
    const m4 = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const sc = new THREE.Vector3(1, 1, 1)
    const q = new THREE.Quaternion()
    const col = new THREE.Color()
    for (let i = 0; i < cells.length; i++) {
      // 色块同样居中在方格内（+0.5），放豆后由珠子盖住
      pos.set(cells[i].c + 0.5, 0.02, cells[i].r + 0.5)
      m4.compose(pos, q, sc)
      patternMesh.setMatrixAt(i, m4)
      col.set(cells[i].px)
      patternMesh.setColorAt(i, col)
    }
    patternMesh.instanceMatrix.needsUpdate = true
    if (patternMesh.instanceColor) patternMesh.instanceColor.needsUpdate = true
    scene.add(patternMesh)
  }

  /* ---------- 交互：放豆 / 擦除 / 悬停 / 锚点缩放 / 拖拽平移 / 视角旋转 ---------- */

  let panDrag: { sx: number; sy: number; cx: number; cz: number } | null = null
  let rotDrag: { sx: number; sy: number; yaw0: number; pitch0: number } | null = null

  function onPointerDown(e: PointerEvent) {
    if (e.button === 2) return
    positionIron(e.clientX, e.clientY)
    const p = groundFromClient(e.clientX, e.clientY)
    if (!p) return
    store.mouse.x = p.x * CELL
    store.mouse.y = p.z * CELL
    store.mouse.down = true
    if (store.mode !== 'design' || e.button !== 0) return
    if (store.viewMode) {
      // 视角工具：左键拖拽旋转相机（panMode 与之互斥，由侧栏开关保证）
      rotDrag = { sx: e.clientX, sy: e.clientY, yaw0: yaw, pitch0: pitch }
    } else if (store.panMode) {
      panDrag = { sx: e.clientX, sy: e.clientY, cx: center.x, cz: center.z }
    } else {
      placeBead(p.x * CELL, p.z * CELL)
    }
  }

  function onPointerMove(e: PointerEvent) {
    positionIron(e.clientX, e.clientY)
    const p = groundFromClient(e.clientX, e.clientY)
    if (!p) return
    store.mouse.x = p.x * CELL
    store.mouse.y = p.z * CELL
    if (rotDrag) {
      // 视角拖拽（棋盘跟随鼠标的直觉方向）：水平右拖绕 Y 轴右转，向下拖视角变高更俯视
      yaw = rotDrag.yaw0 + (e.clientX - rotDrag.sx) * ROT_SPEED
      pitch = Math.max(
        PITCH_MIN,
        Math.min(PITCH_MAX, rotDrag.pitch0 + (e.clientY - rotDrag.sy) * ROT_SPEED),
      )
      applyView()
      ensureGridFitsViewport()
      return
    }
    if (panDrag) {
      const { w, h } = viewportSize()
      const pl = groundPoint(-1, 0)!
      const pr = groundPoint(1, 0)!
      const pt = groundPoint(0, -1)!
      const pb = groundPoint(0, 1)!
      const perpxX = (pr.x - pl.x) / w
      const perpxZ = (pb.z - pt.z) / h
      center.x = panDrag.cx - (e.clientX - panDrag.sx) * perpxX
      center.z = panDrag.cz - (e.clientY - panDrag.sy) * perpxZ
      applyView()
      ensureGridFitsViewport()
      return
    }
    // 设计模式按住拖拽连续放豆/擦除（placeBead 仅在内容实际变化时递增 gridVersion）
    if (store.mode === 'design' && !store.viewMode && store.mouse.down) placeBead(p.x * CELL, p.z * CELL)
  }

  function onPointerUp() {
    rotDrag = null
    panDrag = null
    store.mouse.down = false
  }

  function onLeave() {
    rotDrag = null
    panDrag = null
    store.mouse.x = -1
    store.mouse.y = -1
    store.mouse.down = false
    hoverBox.visible = false
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const p = groundFromClient(e.clientX, e.clientY)
    if (!p) return
    // 锚点缩放：鼠标下的地面点保持投影位置不变
    const oldDist = baseDist / scale
    const factor = e.deltaY < 0 ? 1.15 : 0.87
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor))
    const r = (baseDist / scale) / oldDist
    camera.position.x = p.x + (camera.position.x - p.x) * r
    camera.position.y = p.y + (camera.position.y - p.y) * r
    camera.position.z = p.z + (camera.position.z - p.z) * r
    center.x = p.x + (center.x - p.x) * r
    center.z = p.z + (center.z - p.z) * r
    controls.target.set(center.x, 0, center.z)
    updateGridLines()
    ensureGridFitsViewport()
  }

  function onContext(e: MouseEvent) {
    if (store.mode !== 'design') return
    e.preventDefault()
    const p = groundFromClient(e.clientX, e.clientY)
    if (!p) return
    const cell = getCellAt(p.x * CELL, p.z * CELL)
    if (cell) eraseCell(cell.r, cell.c)
  }

  /* ---------- 每帧 ---------- */

  function updateHover() {
    if (store.mode !== 'design' || store.viewMode) {
      hoverBox.visible = false
      return
    }
    const cell = getCellAt(store.mouse.x, store.mouse.y)
    if (!cell) {
      hoverBox.visible = false
      return
    }
    const b = store.grid[cell.r][cell.c]
    const m = b?.melt ?? 0
    const s = BEAD_SCALE[size].s
    const h = b?.color ? s * BEAD_HEIGHT * (1 - m * 0.92) + 0.1 : 0.08
    hoverBox.position.set(cell.c + 0.5, h, cell.r + 0.5)
    hoverBox.visible = true
  }

  function updateIronOverlay() {
    ironImg.style.display = store.mode === 'ironing' && store.mouse.x >= 0 ? 'block' : 'none'
  }

  let raf = 0
  function animate() {
    raf = requestAnimationFrame(animate)
    updateIronOverlay()
    updateHover()
    updateGridLines() // 完成模式开关即时隐藏/恢复网格线
    controls.update()
    renderer.render(scene, camera)
  }

  /* ---------- 对外接口 ---------- */

  function resize() {
    const { w, h } = viewportSize()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    baseDist = computeBaseDist(h)
    applyView()
    ensureGridFitsViewport()
  }

  function update() {
    if (store.mode !== 'ironing' || store.mouse.x < 0) return
    const mx = store.mouse.x / CELL
    const mz = store.mouse.y / CELL
    const rad = (IRON_RADIUS * 1.5) / CELL
    const c0 = Math.max(0, Math.floor(mx - rad))
    const c1 = Math.min(store.cols - 1, Math.ceil(mx + rad))
    const r0 = Math.max(0, Math.floor(mz - rad))
    const r1 = Math.min(store.rows - 1, Math.ceil(mz + rad))
    // 有珠子跨过熔融形态边界（hollow ↔ filled）→ 全量重建
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cell = store.grid[r][c]
        if (!cell.color) continue
        const entry = beadIndex.get(r * MAX_GRID + c)
        if (!entry) continue
        if ((cell.melt >= 0.35) !== (entry.mesh === filledMesh)) {
          buildBeadInstances()
          return
        }
      }
    // 局部更新鼠标周围珠子的矩阵/颜色
    let dirty = false
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cell = store.grid[r][c]
        if (!cell.color) continue
        const entry = beadIndex.get(r * MAX_GRID + c)
        if (!entry) continue
        writeInstance(entry.mesh, entry.idx, r, c, cell.melt)
        dirty = true
      }
    if (dirty) {
      if (hollowMesh) {
        hollowMesh.instanceMatrix.needsUpdate = true
        if (hollowMesh.instanceColor) hollowMesh.instanceColor.needsUpdate = true
      }
      if (filledMesh) {
        filledMesh.instanceMatrix.needsUpdate = true
        if (filledMesh.instanceColor) filledMesh.instanceColor.needsUpdate = true
      }
    }
  }

  function rebuild() {
    buildBeadInstances()
    rebuildPattern()
  }

  /** 豆子规格切换：几何体（孔径/壁厚）随规格重建，实例整体重建 */
  function setSize(next: BeadSize) {
    if (next === size) return
    size = next
    hollowGeo.dispose()
    filledGeo.dispose()
    hollowGeo = createHollowBeadGeometry(size)
    filledGeo = createFilledBeadGeometry(size)
    rebuild()
  }

  function dispose() {
    cancelAnimationFrame(raf)
    controls.dispose()
    renderer.dispose()
    renderer.domElement.remove()
    ironImg.remove()
    hollowGeo.dispose()
    filledGeo.dispose()
    lineGeo.dispose()
    patternGeo.dispose()
    hollowMat.dispose()
    filledMat.dispose()
    const el = renderer.domElement
    el.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    container.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('wheel', onWheel)
    el.removeEventListener('contextmenu', onContext)
  }

  /* ---------- 初始化 ---------- */

  const el = renderer.domElement
  el.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  container.addEventListener('pointerleave', onLeave)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('contextmenu', onContext)

  resize()
  ensureGridFitsViewport()
  center.x = store.cols / 2
  center.z = store.rows / 2
  applyView()
  rebuild()
  animate()

  return { resize, update, rebuild, setSize, dispose }
}
