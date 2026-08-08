<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { Button, ToggleButton } from 'primevue'
import { importImage } from '../composables/useImageImport'
import { clearAll, hasBeads, saveBoard, setBoardPanel, showStatus, store, switchMode } from '../stores/game'
import type { Mode } from '../types'

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

/** 模式按钮（设计/熨烫） */
const modes: { label: string; value: Mode }[] = [
  { label: '设计', value: 'design' },
  { label: '熨烫', value: 'ironing' },
]

/** 熨烫需有豆子 */
function isModeDisabled(m: Mode) {
  return m === 'ironing' && !hasBeads
}

/** 拖拽平移与完成（旋转查看）模式互斥：开启一个即关闭另一个 */
function togglePan(v: boolean) {
  store.panMode = v
  if (v) store.viewMode = false
}

/** 完成（展示）模式：隐藏棋盘线 + 左键拖拽旋转查看成品，与拖拽平移互斥 */
function toggleView(v: boolean) {
  store.viewMode = v
  if (v) store.panMode = false
  // 从熨烫模式进入完成模式：直接切回设计（不走 switchMode，避免清空熨烫成果的熔融度）
  if (v && store.mode === 'ironing') {
    store.mode = 'design'
    store.panMode = false
  }
  showStatus(v ? '已完成：隐藏棋盘线，拖拽旋转查看成品' : '回到设计：显示棋盘线，可继续放豆')
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) importImage(file)
  input.value = ''
}
</script>

<template>
  <div class="sidebar-tools">
    <Button
      v-for="m in modes"
      :key="m.value"
      :label="m.label"
      fluid
      class="mode-btn"
      :variant="store.mode === m.value ? undefined : 'outlined'"
      :disabled="isModeDisabled(m.value)"
      @click="switchMode(m.value)"
    />

    <ToggleButton
      :model-value="store.panMode"
      class="mode-btn"
      :disabled="store.mode !== 'design'"
      on-label="拖拽"
      off-label="拖拽"
      @update:model-value="togglePan"
    />

    <ToggleButton
      :model-value="store.viewMode"
      class="mode-btn"
      on-label="完成"
      off-label="完成"
      @update:model-value="toggleView"
    />

    <Button
      label="导入图片"
      icon="pi pi-upload"
      fluid
      variant="outlined"
      severity="success"
      class="mode-btn"
      @click="fileInput?.click()"
    />

    <Button
      label="保存"
      icon="pi pi-save"
      fluid
      variant="outlined"
      severity="warn"
      class="mode-btn"
      :disabled="!hasBeads"
      @click="saveBoard()"
    />

    <Button
      label="面板"
      icon="pi pi-images"
      fluid
      variant="outlined"
      severity="info"
      class="mode-btn"
      @click="setBoardPanel(true)"
    />

    <Button
      label="清空"
      icon="pi pi-trash"
      fluid
      variant="outlined"
      severity="danger"
      class="mode-btn"
      @click="clearAll()"
    />

    <input ref="fileInput" type="file" accept="image/*" class="file-input" @change="onFileChange">
  </div>
</template>
