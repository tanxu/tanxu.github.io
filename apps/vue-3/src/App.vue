<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import type { VueAppProps } from './props'
import { useCounterStore } from './stores/counter'

const props = defineProps<VueAppProps>()
const counter = useCounterStore()

let offBus: (() => void) | null = null

// immediate: true —— 首次挂载也会记录一次当前路由
watch(
  () => props.routeState.route,
  (route) => counter.appendLog(`Shell 下发路由 ${route}`),
  { immediate: true }
)

onMounted(() => {
  // replayed 为 true 表示这是「离线期间」错过的消息，由 Shell 在挂载后补投
  offBus = props.bus.on<{ total: number; from: string }>('counter:changed', (event) => {
    counter.appendLog(
      event.replayed
        ? `离线期间：${event.source} 曾广播计数 ${event.detail.total}`
        : `收到 ${event.source} 的计数 ${event.detail.total}`
    )
  })
})

// 必须显式取消订阅：组件卸载不会自动摘掉事件总线上的 handler
onUnmounted(() => {
  offBus?.()
  offBus = null
})

function broadcast(): void {
  props.bus.emit('counter:changed', { total: counter.count, from: props.env.appId })
  counter.appendLog(`已广播计数 ${counter.count} 给其他子应用`)
}
</script>

<template>
  <section class="app">
    <header class="app__head">
      <div>
        <h1 class="app__title">Vue 3</h1>
        <p class="app__desc">Composition API + Pinia · Shadow DOM 隔离</p>
      </div>
      <span class="app__badge">vue-3</span>
    </header>

    <div class="app__body">
      <section class="panel">
        <p class="panel__label">本应用独立计数</p>
        <p class="counter">{{ counter.count }}</p>
        <div class="actions">
          <button type="button" class="btn btn--primary" @click="counter.increment(1)">+1</button>
          <button type="button" class="btn" @click="counter.increment(10)">+10</button>
          <button type="button" class="btn" @click="broadcast">广播到其他子应用</button>
          <button type="button" class="btn btn--ghost" @click="counter.reset()">重置</button>
        </div>
        <p class="hint">当前内部路由：{{ props.routeState.route }}</p>
      </section>

      <section class="panel">
        <p class="panel__label">事件日志</p>
        <p v-if="counter.log.length === 0" class="log__empty">暂无事件</p>
        <ul v-else class="log">
          <li v-for="(text, index) in counter.log" :key="`${index}-${text}`">{{ text }}</li>
        </ul>
      </section>
    </div>

    <footer class="app__foot">
      构建指纹 {{ props.env.hash }} · 资源基路径 {{ props.env.baseUrl }}
    </footer>
  </section>
</template>
