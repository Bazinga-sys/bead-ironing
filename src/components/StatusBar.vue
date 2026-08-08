<script setup lang="ts">
import { store } from '../stores/game'
</script>

<template>
  <div class="status-bar" :class="{ show: store.statusVisible }">{{ store.status }}</div>
</template>
