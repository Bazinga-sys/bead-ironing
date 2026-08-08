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
    <div class="wheel-holder">
      <OptionWheel
        :items="items"
        :swatch="true"
        :eraser-index="0"
        :default-selected="defaultSelected"
        :selected="selected"
        side="right"
        :font-size="2.15"
        :spacing="1.35"
        :tilt="5"
        :curve="0.7"
        :blur="0.7"
        :fade="0.07"
        :min-opacity="0.08"
        :smoothing="180"
        :inset="92"
        text-color="#9a9282"
        active-color="#ef7d57"
        @change="onWheelChange"
      />
    </div>
  </div>
</template>
