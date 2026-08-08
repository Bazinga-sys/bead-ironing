<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useIroning } from '../composables/useIroning'
import { render2D, render2DOverlay, render2DStatic } from '../composables/useRender2D'
import {
  eraseCell,
  expandGridKeep,
  getCellAt,
  MAX_ZOOM,
  MIN_ZOOM,
  placeBead,
  store,
} from '../stores/game'
import { CELL, DISPLAY_CELL } from '../utils/color'

const canvasEl = useTemplateRef<HTMLCanvasElement>('canvasEl')
let ctx: CanvasRenderingContext2D | null = null

/** 离屏静态层缓存：网格底 + 图纸 + 珠子（不随鼠标变化的部分），避免鼠标移动时重复绘制 */
let offscreen: HTMLCanvasElement | null = null
let offCtx: CanvasRenderingContext2D | null = null
/** 缓存内容对应的 gridVersion + 视口快照，不一致说明网格/视口已变，需重建 */
let cachedVersion = -1
let cachedViewKey = ''

/** 画布位图尺寸 = 视口显示尺寸 ×DPR，任何缩放下像素与屏幕 1:1（避免 CSS 缩放插值导致发糊） */
function syncCanvasSize() {
  const c = canvasEl.value
  if (!c) return
  const rect = c.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  ctx = c.getContext('2d')
}

/** 逻辑像素 → 显示像素系数（不含 dpr） */
function scaleK(): number {
  return (DISPLAY_CELL * store.view.zoom) / CELL
}

/** 缩放/平移后，把网格扩容到覆盖整个视口（只增不减、保留已有内容），保证视口内始终有格子可放豆 */
function ensureGridFitsViewport() {
  const wrap = canvasEl.value?.parentElement
  const ww = wrap?.clientWidth || window.innerWidth
  const wh = wrap?.clientHeight || window.innerHeight
  expandGridKeep(
    Math.ceil(ww / (DISPLAY_CELL * store.view.zoom)),
    Math.ceil(wh / (DISPLAY_CELL * store.view.zoom)),
  )
}

/** 确保离屏缓存与可见画布位图同尺寸；尺寸变化（重建过）返回 true，需重绘内容 */
function ensureOffscreen(w: number, h: number): boolean {
  if (!offscreen || offscreen.width !== w || offscreen.height !== h) {
    offscreen = document.createElement('canvas')
    offscreen.width = w
    offscreen.height = h
    offCtx = offscreen.getContext('2d')
    return true
  }
  return false
}

function render() {
  const c = canvasEl.value
  if (!c) return
  // 位图尺寸跟随视口显示尺寸；同时初始化 ctx
  syncCanvasSize()
  if (!ctx) return
  // 熨烫熔融中：珠子每帧变化，全量绘制；缓存置为无效，静止后下一帧重建
  if (store.mode === 'ironing' && store.mouse.down && store.mouse.x >= 0) {
    cachedVersion = -1
    render2D(ctx, c, store.view)
    return
  }
  // 静止路径：静态层贴离屏缓存，鼠标移动只重绘动态层（悬停提示/熨斗光标）
  const viewKey = `${store.view.x}|${store.view.y}|${store.view.zoom}`
  if (ensureOffscreen(c.width, c.height) || cachedVersion !== store.gridVersion || cachedViewKey !== viewKey) {
    if (offscreen && offCtx) {
      render2DStatic(offCtx, offscreen, store.view)
      cachedVersion = store.gridVersion
      cachedViewKey = viewKey
    }
  }
  // 贴缓存前重置变换（上一帧 render2DOverlay 残留了视口缩放，否则会把缓存放大绘制）
  if (offscreen) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(offscreen, 0, 0)
  }
  render2DOverlay(ctx, store.view)
}

/** 鼠标位置映射到世界坐标（逻辑像素），render 用 transform 缩放到屏幕 */
function getCanvasPos(e: MouseEvent) {
  const c = canvasEl.value!
  const rect = c.getBoundingClientRect()
  const k = scaleK()
  return {
    x: store.view.x + (e.clientX - rect.left) / k,
    y: store.view.y + (e.clientY - rect.top) / k,
  }
}

/** 拖拽工具：记录起点鼠标位置与视口起点，拖动时平移视口（经典 grab-to-scroll） */
let panDrag: { startX: number; startY: number; vx: number; vy: number } | null = null

function onMove(e: MouseEvent) {
  if (panDrag) {
    const k = scaleK()
    store.view.x = panDrag.vx - (e.clientX - panDrag.startX) / k
    store.view.y = panDrag.vy - (e.clientY - panDrag.startY) / k
    ensureGridFitsViewport()
    render()
    return
  }
  const p = getCanvasPos(e)
  store.mouse.x = p.x
  store.mouse.y = p.y
  if (store.mode === 'design' && store.mouse.down) placeBead(p.x, p.y)
  render()
}

function onDown(e: MouseEvent) {
  if (e.button === 2) return
  const p = getCanvasPos(e)
  store.mouse.x = p.x
  store.mouse.y = p.y
  store.mouse.down = true
  // 拖拽工具开启：左键拖动平移视口，不放豆
  if (store.mode === 'design' && store.panMode && e.button === 0) {
    panDrag = { startX: e.clientX, startY: e.clientY, vx: store.view.x, vy: store.view.y }
    render()
    return
  }
  if (store.mode === 'design') placeBead(p.x, p.y)
  render()
}

function onUp() {
  panDrag = null
  store.mouse.down = false
}

function onLeave() {
  panDrag = null
  store.mouse.x = -1
  store.mouse.y = -1
  store.mouse.down = false
  render()
}

function onContext(e: MouseEvent) {
  if (store.mode !== 'design') return
  const p = getCanvasPos(e)
  const cell = getCellAt(p.x, p.y)
  if (cell) {
    eraseCell(cell.r, cell.c)
    render()
  }
}

function onWheel(e: WheelEvent) {
  if (store.mode === 'view3d') return
  e.preventDefault()
  const rect = canvasEl.value!.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  // 以鼠标为锚缩放：先取鼠标下的世界坐标，缩放后再把该点对齐回鼠标位置
  const k = scaleK()
  const wx = store.view.x + mx / k
  const wy = store.view.y + my / k
  store.view.zoom = Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, store.view.zoom * (e.deltaY < 0 ? 1.15 : 0.87)),
  )
  const k2 = scaleK()
  store.view.x = wx - mx / k2
  store.view.y = wy - my / k2
  ensureGridFitsViewport()
  render()
}

// 熨烫动画循环：仅 ironing 模式运行
const { start: startIronLoop, stop: stopIronLoop } = useIroning(() => render())

watch(
  () => store.mode,
  (m) => {
    if (m === 'ironing') startIronLoop()
    else stopIronLoop()
  },
)

// 网格尺寸变化（缩放/平移/窗口变化扩容）→ 重绘
watch(
  [() => store.cols, () => store.rows],
  () => render(),
)

watch(
  () => store.resizeTick,
  () => render(),
)

// 网格内容变化（导入/清空/载入/熔融复位等外部操作）→ 立即重绘（版本检测自动重建缓存）
watch(
  () => store.gridVersion,
  () => render(),
)

onMounted(() => {
  ensureGridFitsViewport()
  render()
  canvasEl.value?.addEventListener('wheel', onWheel, { passive: false })
})

onUnmounted(() => {
  stopIronLoop()
  canvasEl.value?.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <div class="scroll-wrap">
    <canvas
      ref="canvasEl"
      class="canvas-pixel"
      :class="{
        'canvas-hidden': store.mode === 'view3d',
        'iron-cursor': store.mode === 'ironing',
        'pan-mode': store.mode === 'design' && store.panMode,
        'pan-dragging': store.mode === 'design' && store.panMode && store.mouse.down,
      }"
      @mousemove="onMove"
      @mousedown="onDown"
      @mouseup="onUp"
      @mouseleave="onLeave"
      @contextmenu.prevent="onContext"
    />
  </div>
</template>
