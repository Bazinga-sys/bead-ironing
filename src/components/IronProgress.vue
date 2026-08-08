<script setup lang="ts">
import { ProgressBar } from 'primevue'
import { store } from '../stores/game'
</script>

<template>
  <div
    class="iron-progress"
    :class="{ show: store.mode === 'ironing' }"
    :style="{ '--iron-fill': store.progress.fillColor }"
  >
    <div class="progress-label">{{ store.progress.label }}</div>
    <div class="progress-bar">
      <div class="progress-zone" />
      <ProgressBar :value="Math.round(store.progress.avg * 100)" :show-value="false" />
    </div>
  </div>
</template>
