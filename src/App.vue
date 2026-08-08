<script setup lang="ts">
import ColorWheelPanel from './components/ColorWheelPanel.vue'
import Stage from './components/Stage.vue'
import ToolPanel from './components/ToolPanel.vue'
</script>

<template>
  <div class="app">
    <aside class="sidebar sidebar-left">
      <ToolPanel />
    </aside>
    <Stage />
    <aside class="sidebar sidebar-right">
      <ColorWheelPanel />
    </aside>
  </div>
</template>
