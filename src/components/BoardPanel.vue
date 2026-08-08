<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { deleteBoard, loadBoard, setBoardPanel, store, updateBoard } from '../stores/game'
import type { SavedBoard } from '../types'

const panelEl = useTemplateRef<HTMLDivElement>('panelEl')

/** 当前正在拖拽的磁贴 id（用于提升 z-index / 光标态） */
const dragId = ref<string | null>(null)
type DragKind = 'move' | 'rot' | 'scale'
let dragKind: DragKind = 'move'
let dragStart = { x: 0, y: 0 }
let dragMoved = false
/** 旋转：磁贴中心（视口坐标）+ 抓取点相对角度，避免拖动瞬间跳变 */
let rotCenter = { x: 0, y: 0 }
let rotGrab = 0
/** 缩放：起始距离/倍率 + 盒子与图元基础尺寸，缩放时保持视觉中心不动 */
let scaleStart = { dist: 1, scale: 1, cx: 0, cy: 0, imgW: 1, imgH: 1, img: null as HTMLImageElement | null }
/** 上一次拖拽结束时间，用于抑制拖拽刚结束后的双击误触 */
let lastDragEnd = 0

/** 磁贴绝对定位 + 旋转（角度来自数据，可自由调整） */
function magnetStyle(b: SavedBoard) {
  return {
    left: `${b.x}px`,
    top: `${b.y}px`,
    transform: `rotate(${b.rotation}deg)`,
  }
}

function startDrag(kind: DragKind, b: SavedBoard, e: MouseEvent) {
  dragKind = kind
  dragId.value = b.id
  dragStart = { x: e.clientX, y: e.clientY }
  dragMoved = false
  // move/up 挂到 window：鼠标移出磁贴也能持续跟踪
  window.addEventListener('mousemove', onWindowMove)
  window.addEventListener('mouseup', onWindowUp)
}

/** 拖拽磁贴本体 = 移动位置 */
function onMouseDown(e: MouseEvent, b: SavedBoard) {
  if (e.button !== 0) return // 仅左键
  startDrag('move', b, e)
}

/** 拖拽 ↻ 操作柄 = 旋转（角度跟随指针绕磁贴中心） */
function onRotDown(e: MouseEvent, b: SavedBoard) {
  if (e.button !== 0) return
  const magnet = (e.currentTarget as HTMLElement).closest<HTMLElement>('.fridge-magnet')
  if (!magnet) return
  const rect = magnet.getBoundingClientRect()
  rotCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  rotGrab = Math.atan2(e.clientY - rotCenter.y, e.clientX - rotCenter.x) * (180 / Math.PI) + 90 - b.rotation
  startDrag('rot', b, e)
}

/** 拖拽 ↗ 操作柄 = 缩放（按指针到中心的距离比例） */
function onScaleDown(e: MouseEvent, b: SavedBoard) {
  if (e.button !== 0) return
  const magnet = (e.currentTarget as HTMLElement).closest<HTMLElement>('.fridge-magnet')
  if (!magnet) return
  const rect = magnet.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const img = magnet.querySelector<HTMLImageElement>('.magnet-thumb')
  scaleStart = {
    dist: Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy)),
    scale: b.scale,
    cx,
    cy,
    imgW: img?.offsetWidth ?? 0,
    imgH: img?.offsetHeight ?? 0,
    img: img ?? null,
  }
  startDrag('scale', b, e)
}

function onWindowMove(e: MouseEvent) {
  const id = dragId.value
  const b = id ? store.savedBoards.find((x) => x.id === id) : undefined
  if (!b) return
  if (dragKind === 'move') {
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    // 位移超过 4px 才算拖拽（区分点击）
    if (!dragMoved && Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true
    if (dragMoved) {
      b.x = Math.max(0, b.x + dx)
      b.y = Math.max(0, b.y + dy)
      dragStart = { x: e.clientX, y: e.clientY }
    }
  } else if (dragKind === 'rot') {
    const deg = Math.atan2(e.clientY - rotCenter.y, e.clientX - rotCenter.x) * (180 / Math.PI) + 90 - rotGrab
    b.rotation = Math.round(deg)
    dragMoved = true
  } else if (dragKind === 'scale') {
    const d = Math.hypot(e.clientX - scaleStart.cx, e.clientY - scaleStart.cy)
    const s = Math.min(3, Math.max(0.5, (scaleStart.scale * d) / scaleStart.dist))
    b.scale = Math.round(s * 100) / 100
    // 图元按新倍率缩放（保持像素化最近邻），位置调整使视觉中心不动
    const nw = (scaleStart.imgW * b.scale) / scaleStart.scale
    const nh = (scaleStart.imgH * b.scale) / scaleStart.scale
    if (scaleStart.img) {
      scaleStart.img.style.width = `${Math.round(nw)}px`
      scaleStart.img.style.height = `${Math.round(nh)}px`
    }
    b.x = Math.round(scaleStart.cx - (nw + 14) / 2) // +14 = 水平 padding 10 + 边框 4
    b.y = Math.round(scaleStart.cy - (nh + 12) / 2) // +12 = 垂直 padding 8 + 边框 4
    dragMoved = true
  }
}

function onWindowUp() {
  const id = dragId.value
  if (id && dragMoved) {
    const b = store.savedBoards.find((x) => x.id === id)
    if (b) updateBoard(id, { x: b.x, y: b.y, rotation: b.rotation, scale: b.scale })
    lastDragEnd = Date.now()
  }
  dragId.value = null
  window.removeEventListener('mousemove', onWindowMove)
  window.removeEventListener('mouseup', onWindowUp)
}

function onDblClick(b: SavedBoard) {
  if (Date.now() - lastDragEnd < 350) return // 刚拖完，不算双击
  loadBoard(b.id)
}

/** 磁贴显示尺寸：保持图案比例，最长边至少 96px，并按当前缩放倍率放大 */
function applyThumbSize(img: HTMLImageElement) {
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  if (!nw || !nh) return
  const k = Math.max(1, 96 / Math.max(nw, nh))
  const s = Number(img.closest('.fridge-magnet')?.getAttribute('data-scale')) || 1
  img.style.width = `${Math.round(nw * k * s)}px`
  img.style.height = `${Math.round(nh * k * s)}px`
}

function onThumbLoad(e: Event) {
  applyThumbSize(e.target as HTMLImageElement)
}

/** 已存在的磁贴（如 HMR 重渲染）不会重发 load 事件，这里统一补一遍尺寸 */
function sizeAllThumbs() {
  panelEl.value?.querySelectorAll<HTMLImageElement>('.magnet-thumb').forEach(applyThumbSize)
}

watch(
  () => store.savedBoards.length,
  async () => {
    await nextTick()
    sizeAllThumbs()
  },
)

// 缩放倍率变化时重新应用图元尺寸（程序化改动兜底，拖拽中已实时更新）
watch(
  () => store.savedBoards.map((b) => `${b.id}:${b.scale}`),
  async () => {
    await nextTick()
    sizeAllThumbs()
  },
)

onMounted(sizeAllThumbs)

onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMove)
  window.removeEventListener('mouseup', onWindowUp)
})
</script>

<template>
  <div ref="panelEl" class="board-panel" :class="{ show: store.showBoardPanel }">
    <header class="board-panel-head">
      <h2 class="board-panel-title">作 品 墙</h2>
      <button class="board-panel-close" @click="setBoardPanel(false)">✕</button>
    </header>

    <p v-if="store.savedBoards.length === 0" class="board-panel-empty">
      还没有作品<br>先在画布上拼一个，点「保 存」贴上来吧
    </p>

    <div
      v-for="b in store.savedBoards"
      :key="b.id"
      :data-id="b.id"
      :data-scale="b.scale"
      class="fridge-magnet"
      :class="{ dragging: dragId === b.id }"
      :style="magnetStyle(b)"
      @mousedown="onMouseDown($event, b)"
      @dblclick="onDblClick(b)"
    >
      <img class="magnet-thumb" :src="b.thumb" :alt="b.name" @load="onThumbLoad">
      <button class="magnet-rot" title="旋转" @mousedown.stop="onRotDown($event, b)" @dblclick.stop>↻</button>
      <button class="magnet-scale" title="缩放" @mousedown.stop="onScaleDown($event, b)" @dblclick.stop>↗</button>
      <button class="magnet-del" title="撕下删除" @mousedown.stop @dblclick.stop @click.stop="deleteBoard(b.id)">✕</button>
    </div>
  </div>
</template>
