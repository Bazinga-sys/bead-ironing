<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { Button, ToggleButton } from 'primevue'
import { importImage } from '../composables/useImageImport'
import { clearAll, hasBeads, hasMelt, saveBoard, setBoardPanel, store, switchMode } from '../stores/game'
import type { Mode } from '../types'

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

/** 模式按钮（设计/熨烫/3D） */
const modes: { label: string; value: Mode }[] = [
  { label: '设计', value: 'design' },
  { label: '熨烫', value: 'ironing' },
  { label: '3D', value: 'view3d' },
]

/** 熨烫需有豆子、3D 需有已开始熔融的珠子 */
function isModeDisabled(m: Mode) {
  return (m === 'ironing' && !hasBeads) || (m === 'view3d' && !hasMelt)
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
      v-model="store.panMode"
      class="mode-btn"
      :disabled="store.mode !== 'design'"
      on-label="拖拽"
      off-label="拖拽"
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
