<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { Button, ToggleButton } from 'primevue'
import { importImage } from '../composables/useImageImport'
import { clearAll, hasBeads, saveBoard, setSavePanel, showStatus, store, switchMode } from '../stores/game'
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

/** 视角工具：隐藏棋盘线，左键拖拽旋转视角、WASD 移动视角；再点或点「设计」退出，视角保持不变可继续放豆 */
function toggleView(v: boolean) {
  store.viewMode = v
  // 从熨烫模式进入视角工具：直接切回设计（不走 switchMode，避免清空熨烫成果的熔融度）
  if (v && store.mode === 'ironing') store.mode = 'design'
  showStatus(
    v ? '视角调整：按住左键拖拽旋转视角，WASD 移动视角，调整好点「设计」继续放豆' : '回到设计：视角已保留，可继续放豆',
  )
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
      :model-value="store.viewMode"
      class="mode-btn"
      on-label="视角"
      off-label="视角"
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
      label="恢复"
      icon="pi pi-undo"
      fluid
      variant="outlined"
      severity="info"
      class="mode-btn"
      @click="setSavePanel(true)"
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
