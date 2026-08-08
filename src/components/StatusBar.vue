<script setup lang="ts">
import { watch } from 'vue'
import { Toast, ToastEventBus } from 'primevue'
import { store } from '../stores/game'

// 状态提示改为 PrimeVue Toast：store.status 数据流不变，仅展示层替换。
// 用全局 ToastEventBus 派发（useToast 依赖 <Toast /> 的后代链，监听器不在其内）
watch(
  [() => store.status, () => store.statusVisible],
  () => {
    if (store.statusVisible && store.status) {
      ToastEventBus.emit('add', {
        severity: 'info',
        summary: store.status,
        closable: false,
        life: 3500,
      })
    }
  },
)
</script>

<template>
  <Toast position="top-center" />
</template>
