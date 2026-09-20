import { ref } from 'vue'
import { defineStore } from 'pinia'

const MAX_LOG = 20

/**
 * 本子应用自己的状态 —— Pinia store。
 *
 * 关键点：Pinia 实例由本子应用在 mount 时自行 createPinia() 创建，
 * 与 Shell、其他子应用完全无关。即使将来两个子应用都用 Pinia，
 * 它们的 store 也落在各自独立的 Pinia 容器里，不会互相可见。
 */
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const log = ref<string[]>([])

  function increment(step = 1): void {
    count.value += step
  }

  function reset(): void {
    count.value = 0
    log.value = []
  }

  function appendLog(text: string): void {
    const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    log.value = [`[${stamp}] ${text}`, ...log.value].slice(0, MAX_LOG)
  }

  return { count, log, increment, reset, appendLog }
})
