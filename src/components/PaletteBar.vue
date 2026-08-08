<script setup lang="ts">
import { selectColor, store, toggleEraser } from '../stores/game'
import { COLORS } from '../utils/color'
</script>

<template>
  <div class="palette-bar">
    <div
      v-for="hex in COLORS"
      :key="hex"
      class="color-swatch"
      :class="{ selected: !store.isEraser && store.selectedColor === hex }"
      :style="{ background: hex }"
      @click="selectColor(hex)"
    />
    <div class="eraser-btn" :class="{ selected: store.isEraser }" @click="toggleEraser()">X</div>
  </div>
</template>
