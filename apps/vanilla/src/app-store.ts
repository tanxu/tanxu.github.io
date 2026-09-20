import { createStore, type Store } from './store'

/**
 * 本子应用自己的状态。
 * 注意：这里没有、也不允许出现任何来自其他子应用或 Shell 的字段。
 * 需要跨应用共享的数据一律走事件总线，绝不共享 store 实例。
 */
export interface AppState {
  /** 本应用自己的计数器 —— 与 React / Vue 子应用各自计数，互不影响 */
  count: number
  /** 本应用通过总线收发的消息记录 */
  log: string[]
}

const MAX_LOG = 20

export const appStore: Store<AppState> = createStore<AppState>({
  count: 0,
  log: []
})

export function increment(step = 1): void {
  appStore.set((state) => ({ count: state.count + step }))
}

export function reset(): void {
  appStore.set({ count: 0, log: [] })
}

export function appendLog(text: string): void {
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  appStore.set((state) => ({
    log: [`[${stamp}] ${text}`, ...state.log].slice(0, MAX_LOG)
  }))
}
