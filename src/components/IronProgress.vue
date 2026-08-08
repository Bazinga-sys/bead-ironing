<script setup lang="ts">
import { store } from '../stores/game'
</script>

<template>
  <div class="iron-progress" :class="{ show: store.mode === 'ironing' }">
    <div class="progress-label">{{ store.progress.label }}</div>
    <div class="progress-bar">
      <div class="progress-zone" />
      <div
        class="progress-fill"
        :style="{
          width: `${store.progress.avg * 100}%`,
          background: store.progress.fillColor,
        }"
      />
    </div>
  </div>
</template>
