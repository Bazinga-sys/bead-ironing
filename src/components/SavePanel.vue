<script setup lang="ts">
import { deleteBoard, loadBoard, setSavePanel, store } from '../stores/game'

/** 保存时间格式：YYYY-MM-DD HH:mm */
function fmt(t: number) {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<template>
  <div class="save-panel" :class="{ show: store.showSavePanel }" @click.self="setSavePanel(false)">
    <div class="save-panel-inner">
      <header class="save-panel-head">
        <h2 class="save-panel-title">我的作品</h2>
        <button class="save-panel-close" title="关闭" @click="setSavePanel(false)">✕</button>
      </header>

      <p v-if="store.savedBoards.length === 0" class="save-panel-empty">
        还没有作品<br>先在画布上拼好，点「保存」存下来吧
      </p>

      <div v-else class="save-grid">
        <div
          v-for="b in store.savedBoards"
          :key="b.id"
          class="save-card"
          title="点击载入"
          @click="loadBoard(b.id)"
        >
          <img class="save-thumb" :src="b.thumb" :alt="b.name">
          <div class="save-name">{{ b.name }}</div>
          <div class="save-time">{{ fmt(b.savedAt) }}</div>
          <button class="save-del" title="删除" @click.stop="deleteBoard(b.id)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>
