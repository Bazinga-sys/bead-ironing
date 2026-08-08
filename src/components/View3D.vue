<script setup lang="ts">
import { onUnmounted, useTemplateRef, watch } from 'vue'
import type { ThreeHandle } from '../composables/useThreeScene'
import { store } from '../stores/game'

const container = useTemplateRef<HTMLDivElement>('container')
let handle: ThreeHandle | null = null

// 首次进入 3D 时按需加载 three 模块（异步 chunk），之后每次进入按当前熔融状态重建
watch(
  () => store.mode,
  async (m) => {
    if (m !== 'view3d') return
    if (!container.value) return
    if (!handle) {
      const { createThreeScene } = await import('../composables/useThreeScene')
      if (store.mode !== 'view3d') return // 加载期间已切走
      handle = createThreeScene(container.value)
      handle.rebuild() // 首次进入即按当前熔融状态构建珠子网格
    } else {
      handle.resize()
      handle.rebuild()
    }
  },
  { flush: 'post' }, // 等 DOM 更新后再测量容器尺寸（display 已生效）
)

// 窗口 resize 后重适配/重建
watch(
  () => store.resizeTick,
  () => {
    if (!handle || store.mode !== 'view3d') return
    handle.resize()
    handle.rebuild()
  },
)

// 豆子规格切换（5mm / 2.6mm）→ 重建 3D 珠体
watch(
  () => store.beadSize,
  () => {
    if (!handle || store.mode !== 'view3d') return
    handle.rebuild()
  },
)

onUnmounted(() => handle?.dispose())
</script>

<template>
  <div ref="container" class="three-container" :class="{ show: store.mode === 'view3d' }" />
</template>
