import { computed, reactive } from 'vue'
import type { BeadSize, Cell, IronProgress, Mode, MouseState, SavedBoard } from '../types'
import { CELL, COLORS } from '../utils/color'
import { rotForId } from '../utils/rotation'
import { renderThumb } from '../utils/thumbnail'

const STORAGE_KEY = 'bead-iron.savedBoards'

/** 网格上限（防止极端缩放下内存/遍历失控） */
export const MAX_GRID = 200

/** 重新生成缩略图（当前 renderThumb 规则），用于旧数据迁移 */
function regenerateThumb(grid: Cell[][]): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) renderThumb(ctx, grid)
  return canvas.toDataURL('image/png')
}

/** 从 localStorage 读取已保存的作品（容错：损坏/不可用时返回空列表） */
function loadSavedBoards(): SavedBoard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    // 统一迁移：重新生成透明背景缩略图 + 缺失的 x/y 位置补默认落点 + rotation/scale 补默认值
    return (list as SavedBoard[]).map((b, i) => ({
      ...b,
      thumb: regenerateThumb(b.grid),
      x: typeof b.x === 'number' ? b.x : 20 + (i % 4) * 132,
      y: typeof b.y === 'number' ? b.y : 20 + Math.floor(i / 4) * 122,
      rotation: typeof b.rotation === 'number' ? b.rotation : rotForId(b.id),
      scale: typeof b.scale === 'number' ? b.scale : 1,
    }))
  } catch {
    return []
  }
}

function persistBoards() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.savedBoards))
  } catch {
    /* 存储超限等场景静默失败 */
  }
}

function createGrid(cols: number, rows: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ color: null, melt: 0, pixel: null })),
  )
}

/* ---------- 自动保存（每 5 秒 + 关页面前，防止误触/刷新丢豆子） ---------- */

const AUTOSAVE_KEY = 'bead-iron.autosave'

interface AutosaveState {
  cols: number
  rows: number
  grid: Cell[][]
  savedAt: number
}

/** 从 localStorage 读取自动存档（容错：损坏/为空时返回 null） */
function readAutosave(): AutosaveState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as AutosaveState
    if (!d || !Array.isArray(d.grid) || d.grid.length === 0 || !Array.isArray(d.grid[0])) return null
    // 恢复时统一回设计模式：熔融度清零，豆子颜色与图纸像素保留
    return {
      cols: d.cols,
      rows: d.rows,
      grid: d.grid.map((row) =>
        row.map((c) => ({ color: c.color ?? null, melt: 0, pixel: c.pixel ?? null })),
      ),
      savedAt: d.savedAt,
    }
  } catch {
    return null
  }
}

/** 启动时的自动存档（存在则整体恢复，防止刷新后丢豆） */
const autosave = readAutosave()

/** 全局共享状态：网格 / 模式 / 鼠标 / 进度等 */
export const store = reactive({
  cols: autosave?.cols ?? 30,
  rows: autosave?.rows ?? 30,
  grid: (autosave?.grid ?? createGrid(30, 30)) as Cell[][],
  /** 网格内容版本号：任何珠子/图纸变更时 +1，供画布静态层缓存失效检测 */
  gridVersion: 0,
  mode: 'design' as Mode,
  /** 豆子规格：大豆 5mm（新手/手摆）／迷你豆 2.6mm（像素精细、更易烫糊） */
  beadSize: 'big' as BeadSize,
  mouse: { x: -1, y: -1, down: false } as MouseState,
  selectedColor: COLORS[0],
  isEraser: false,
  /** 拖拽工具：开启后左键拖动画布平移（设计模式），关闭时照常放豆 */
  panMode: false,
  status: '',
  statusVisible: false,
  progress: {
    avg: 0, fused: 0, burned: 0, count: 0,
    fillColor: '#41a6f6', label: '熨烫进度',
  } as IronProgress,
  /** 窗口 resize 后 +1，通知画布/3D 重新适配 */
  resizeTick: 0,
  /** 已保存到作品面板的成品（localStorage 持久化） */
  savedBoards: loadSavedBoards(),
  /** 作品面板显示开关（仿 three-container 的 .show 切换） */
  showBoardPanel: false,
  /** 本次启动从自动存档恢复了上次进度（用于提示） */
  restoredFromAutosave: autosave !== null,
})

/** 存在任意珠子（熨烫按钮可用） */
export const hasBeads = computed(() =>
  store.grid.some((row) => row.some((c) => c.color !== null)),
)
/** 存在已开始熔融的珠子（3D 按钮可用） */
export const hasMelt = computed(() =>
  store.grid.some((row) => row.some((c) => c.color !== null && c.melt > 0.01)),
)

let statusTimer: ReturnType<typeof setTimeout> | undefined

export function showStatus(text: string) {
  store.status = text
  store.statusVisible = true
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    store.statusVisible = false
  }, 3500)
}

/** 画布上是否已有内容（豆子或导入的图纸像素），有内容时 resize/自动保存不覆盖 */
function hasContent(): boolean {
  return store.grid.some((row) => row.some((c) => c.color !== null || c.pixel !== null))
}

/**
 * 无限画布：网格按需扩容到覆盖视口（只增不减、保留已有内容，在右/下侧追加空行/列），
 * 供滚轮缩放 / 平移 / 窗口变化时保证视口内有格子可放豆。
 */
export function expandGridKeep(minCols: number, minRows: number) {
  const nc = Math.min(MAX_GRID, Math.max(store.cols, Math.ceil(minCols)))
  const nr = Math.min(MAX_GRID, Math.max(store.rows, Math.ceil(minRows)))
  if (nc === store.cols && nr === store.rows) return
  const g = createGrid(nc, nr)
  for (let r = 0; r < store.rows; r++)
    for (let c = 0; c < store.cols; c++) g[r][c] = store.grid[r][c]
  store.grid = g
  store.cols = nc
  store.rows = nr
  store.gridVersion++ // 网格线数量变化，静态层缓存失效
}

/**
 * 窗口/容器尺寸变化 → 把网格扩容到覆盖视口（内容坐标不变，只追加空行/列）。
 * 视口状态由 useThreeBoard 维护（scale=1 时每格 DISPLAY_CELL 显示像素），
 * 这里按默认缩放的可见格数估算，棋盘渲染器随后会按实际可见范围再次扩容。
 */
export function setupGrid(w: number, h: number) {
  expandGridKeep(Math.ceil(w / 36), Math.ceil(h / 36))
}

/** 图片导入时按需扩容画布（调用方随后会覆盖全部格子） */
export function expandGrid(minCols: number, minRows: number) {
  if (store.cols < minCols || store.rows < minRows) {
    store.cols = Math.max(store.cols, minCols)
    store.rows = Math.max(store.rows, minRows)
    store.grid = createGrid(store.cols, store.rows)
  }
}

export function getCellAt(x: number, y: number): { r: number; c: number } | null {
  const c = Math.floor(x / CELL)
  const r = Math.floor(y / CELL)
  return r < 0 || r >= store.rows || c < 0 || c >= store.cols ? null : { r, c }
}

/** 画布坐标放置珠子 / 橡皮擦除（内容实际变化时递增 gridVersion，供缓存失效） */
export function placeBead(x: number, y: number) {
  const cell = getCellAt(x, y)
  if (!cell) return
  const target = store.grid[cell.r][cell.c]
  if (store.isEraser) {
    if (target.color === null) return
    target.color = null
    target.melt = 0
  } else {
    if (target.color === store.selectedColor) return
    target.color = store.selectedColor
    target.melt = 0
  }
  store.gridVersion++
}

export function eraseCell(r: number, c: number) {
  const cell = store.grid[r][c]
  if (cell.color === null) return
  cell.color = null
  cell.melt = 0
  store.gridVersion++
}

export function clearAll() {
  for (const row of store.grid)
    for (const cell of row) {
      cell.color = null
      cell.melt = 0
      cell.pixel = null
    }
  store.gridVersion++
  switchMode('design')
}

export function switchMode(m: Mode) {
  store.mode = m
  // 拖拽工具只在设计模式使用，切走时关闭
  if (m !== 'design') store.panMode = false
  // 切回设计模式：全部珠子恢复未熔融
  if (m === 'design') {
    let touched = false
    for (const row of store.grid)
      for (const cell of row)
        if (cell.melt > 0) {
          cell.melt = 0
          touched = true
        }
    if (touched) store.gridVersion++
  }
  showStatus(
    m === 'design' ? '点击/拖拽放置拼豆' : m === 'ironing' ? '按住拖动来熨烫' : '拖拽旋转 3D 视角',
  )
}

export function selectColor(hex: string) {
  store.selectedColor = hex
  store.isEraser = false
}

/** 切换豆子规格（5mm / 2.6mm）：几何体与珠体尺寸变化 → gridVersion++ 触发棋盘重建 */
export function setBeadSize(size: BeadSize) {
  if (store.beadSize === size) return
  store.beadSize = size
  store.gridVersion++
  showStatus(
    size === 'big'
      ? '大豆 5mm：新手友好，可手拿摆放'
      : '迷你豆 2.6mm：像素精细，熨烫更容易糊边',
  )
}

export function toggleEraser() {
  store.isEraser = !store.isEraser
}

/* ---------- 作品面板（localStorage 持久化） ---------- */

/** 把当前画布保存为一件作品（含缩略图），并打开面板即时反馈 */
export function saveBoard() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const name = `作品 ${store.savedBoards.length + 1}`
  const grid = store.grid.map((row) => row.map((cell) => ({ ...cell })))
  // 离屏 canvas 生成缩略图 PNG（裁剪到图案边界，透明背景）
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (ctx) renderThumb(ctx, grid)
  // 初始落点：按已有数量错落排布（间距大于磁贴尺寸，避免叠压），之后可自由拖拽
  const n = store.savedBoards.length
  store.savedBoards.push({
    id,
    name,
    cols: store.cols,
    rows: store.rows,
    grid,
    thumb: canvas.toDataURL('image/png'),
    savedAt: Date.now(),
    x: 24 + (n % 4) * 132,
    y: 24 + Math.floor(n / 4) * 122,
    rotation: rotForId(id),
    scale: 1,
  })
  persistBoards()
  store.showBoardPanel = true
  showStatus(`已保存「${name}」到作品墙`)
}

/** 把面板中的一件作品整表载入画布（保留熔融度，不走 switchMode） */
export function loadBoard(id: string) {
  const board = store.savedBoards.find((b) => b.id === id)
  if (!board) return
  store.cols = board.cols
  store.rows = board.rows
  store.grid = board.grid.map((row) => row.map((cell) => ({ ...cell })))
  store.gridVersion++
  store.mode = 'design' // 直接赋值：避免 switchMode 清零 melt
  store.showBoardPanel = false
  showStatus(`已载入「${board.name}」`)
}

export function deleteBoard(id: string) {
  store.savedBoards = store.savedBoards.filter((b) => b.id !== id)
  persistBoards()
}

/** 拖拽/旋转/缩放结束后，更新冰箱贴在墙上的姿态（位置/角度/缩放）并持久化 */
export function updateBoard(id: string, patch: Partial<Pick<SavedBoard, 'x' | 'y' | 'rotation' | 'scale'>>) {
  const board = store.savedBoards.find((b) => b.id === id)
  if (!board) return
  if (typeof patch.x === 'number') board.x = Math.max(0, Math.round(patch.x))
  if (typeof patch.y === 'number') board.y = Math.max(0, Math.round(patch.y))
  if (typeof patch.rotation === 'number') board.rotation = patch.rotation
  if (typeof patch.scale === 'number') board.scale = patch.scale
  persistBoards()
}

export function setBoardPanel(show: boolean) {
  store.showBoardPanel = show
}

/* ---------- 自动保存（每 5 秒 + 关页面前，防止误触/刷新丢豆子） ---------- */

const AUTOSAVE_INTERVAL = 5000

/** 最近一次写入的网格快照，避免无变化时重复写 localStorage */
let autoSnap = ''

/** 把当前画布整体写入自动存档（空板不覆盖旧档，保证误触清空后仍能找回） */
export function autosaveNow() {
  const snap = JSON.stringify({ cols: store.cols, rows: store.rows, grid: store.grid })
  if (snap === autoSnap) return
  autoSnap = snap
  if (!hasContent()) return
  try {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ cols: store.cols, rows: store.rows, grid: store.grid, savedAt: Date.now() } as AutosaveState),
    )
  } catch {
    /* 存储超限等场景静默失败 */
  }
}

let autoTimer: ReturnType<typeof setInterval> | undefined

/** 启动自动保存：定时写入 + 关闭页面/刷新前兜底写一次 */
export function startAutosave() {
  stopAutosave()
  autoTimer = setInterval(autosaveNow, AUTOSAVE_INTERVAL)
  window.addEventListener('beforeunload', autosaveNow)
}

export function stopAutosave() {
  if (autoTimer) clearInterval(autoTimer)
  autoTimer = undefined
  window.removeEventListener('beforeunload', autosaveNow)
}

// 记录初始快照：启动时若已恢复存档，不重复写入
autoSnap = JSON.stringify({ cols: store.cols, rows: store.rows, grid: store.grid })
