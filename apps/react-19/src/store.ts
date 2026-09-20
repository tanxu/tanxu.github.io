import { create } from 'zustand'

/**
 * 本子应用自己的状态 —— Zustand store。
 *
 * 关键点：store 定义在本子应用的模块图内，Shell 和其他子应用都拿不到它。
 * 它是「本应用的」状态容器，不是「微前端的」全局 store。
 */
export interface CounterState {
  count: number
  log: string[]
  increment(step?: number): void
  reset(): void
  appendLog(text: string): void
}

const MAX_LOG = 20

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  log: [],

  increment: (step = 1) =>
    set((state) => ({
      count: state.count + step
    })),

  reset: () => set({ count: 0, log: [] }),

  appendLog: (text) =>
    set((state) => {
      const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      return { log: [`[${stamp}] ${text}`, ...state.log].slice(0, MAX_LOG) }
    })
}))
