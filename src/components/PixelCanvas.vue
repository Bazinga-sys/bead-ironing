<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useIroning } from '../composables/useIroning'
import { createThreeBoard, type ThreeBoardHandle } from '../composables/useThreeBoard'
import { store } from '../stores/game'

const wrap = useTemplateRef<HTMLDivElement>('wrap')
let board: ThreeBoardHandle | null = null

// 熨烫动画循环：仅 ironing 模式运行，每帧回调 update() 局部更新熔融珠子
const { start: startIronLoop, stop: stopIronLoop } = useIroning(() => board?.update())

watch(
  () => store.mode,
  (m) => {
    if (m === 'ironing') startIronLoop()
    else stopIronLoop()
  },
)

// 网格内容变化（放豆/擦除/导入/清空/载入/熔融复位）→ 重建珠子与图纸实例
watch(
  () => store.gridVersion,
  () => board?.rebuild(),
)

// 豆子规格切换（5mm / 2.6mm）→ 重建几何体与实例
watch(
  () => store.beadSize,
  (s) => board?.setSize(s),
)

// 窗口 resize（Stage.measure → resizeTick）→ 适配视口并扩容网格
watch(
  () => store.resizeTick,
  () => board?.resize(),
)

onMounted(() => {
  if (wrap.value) {
    board = createThreeBoard(wrap.value)
    board.rebuild() // 初始渲染：autosave 恢复的作品不依赖 resize 扩容也能立即显示
  }
})

onUnmounted(() => {
  stopIronLoop()
  board?.dispose()
  board = null
})
</script>

<template>
  <div
    ref="wrap"
    class="scroll-wrap"
    :class="{
      'iron-cursor': store.mode === 'ironing',
      'pan-mode': store.mode === 'design' && store.panMode,
      'pan-dragging': store.mode === 'design' && store.panMode && store.mouse.down,
      'view-mode': store.mode === 'design' && store.viewMode,
    }"
  />
</template>
