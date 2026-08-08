<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { importImage } from '../composables/useImageImport'
import { clearAll, hasBeads, hasMelt, saveBoard, setBoardPanel, store, switchMode } from '../stores/game'

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) importImage(file)
  input.value = ''
}
</script>

<template>
  <div class="sidebar-tools">
    <button
      class="mode-btn"
      :class="{ active: store.mode === 'design' }"
      @click="switchMode('design')"
    >
      设计
    </button>
    <button
      class="mode-btn"
      :class="{ active: store.mode === 'ironing' }"
      :disabled="!hasBeads"
      @click="switchMode('ironing')"
    >
      熨烫
    </button>
    <button
      class="mode-btn"
      :class="{ active: store.mode === 'view3d' }"
      :disabled="!hasMelt"
      @click="switchMode('view3d')"
    >
      3D
    </button>
    <button
      class="mode-btn"
      :class="{ active: store.panMode }"
      :disabled="store.mode !== 'design'"
      @click="store.panMode = !store.panMode"
    >
      拖拽
    </button>
    <button class="mode-btn btn-import" @click="fileInput?.click()">
      导入图片
    </button>
    <button class="mode-btn btn-save" :disabled="!hasBeads" @click="saveBoard()">
      保存
    </button>
    <button class="mode-btn btn-panel" @click="setBoardPanel(true)">
      面板
    </button>
    <button class="mode-btn btn-clear" @click="clearAll()">
      清空
    </button>
    <input ref="fileInput" type="file" accept="image/*" class="file-input" @change="onFileChange">
  </div>
</template>
