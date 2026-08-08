<script setup lang="ts">
import PaletteBar from './components/PaletteBar.vue'
import Stage from './components/Stage.vue'
import ToolPanel from './components/ToolPanel.vue'
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <ToolPanel />
      <PaletteBar />
    </aside>
    <Stage />
  </div>
</template>
