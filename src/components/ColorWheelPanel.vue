<script setup lang="ts">
import { computed } from 'vue'
import OptionWheel from './bits/OptionWheel.vue'
import { selectColor, store, toggleEraser } from '../stores/game'
import { COLORS } from '../utils/color'

/** 右侧颜色轮（vue-bits OptionWheel）：0 = 橡皮，1..32 = 颜色色块 */
const items = computed(() => ['✕', ...COLORS])

/** 初始选中 = 当前颜色（+1 跳过橡皮） */
const defaultSelected = computed(() => COLORS.indexOf(store.selectedColor) + 1)

/** 受控选中：橡皮模式 → 0；否则当前颜色 */
const selected = computed(() => (store.isEraser ? 0 : COLORS.indexOf(store.selectedColor) + 1))

function onWheelChange(index: number) {
  if (index === 0) toggleEraser()
  else selectColor(COLORS[index - 1])
}
</script>

<template>
  <div class="color-wheel-panel">
    <OptionWheel
      :items="items"
      :swatch="true"
      :eraser-index="0"
      :default-selected="defaultSelected"
      :selected="selected"
      side="right"
      :font-size="1.6"
      :spacing="1.3"
      :tilt="4"
      :curve="0.6"
      :blur="0.8"
      :fade="0.1"
      :min-opacity="0.05"
      :smoothing="160"
      :inset="100"
      text-color="#9a9282"
      active-color="#ef7d57"
      @change="onWheelChange"
    />
  </div>
</template>
