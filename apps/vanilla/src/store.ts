/**
 * 极简 store：EventTarget + 不可变快照。
 *
 * 为什么用 EventTarget 而不是自己维护回调数组：
 * 它自带「订阅 / 取消订阅」语义，且与平台其他 API 一致，
 * 子应用内部不引入任何第三方状态库也能拿到完整的响应式能力。
 */
export type StoreListener<T> = (state: Readonly<T>, previous: Readonly<T>) => void

export interface Store<T extends object> {
  get(): Readonly<T>
  set(patch: Partial<T> | ((state: Readonly<T>) => Partial<T>)): void
  subscribe(listener: StoreListener<T>): () => void
}

const CHANGE_EVENT = 'change'

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = { ...initial }
  const channel = new EventTarget()

  return {
    get: () => state,

    set(patch) {
      const previous = state
      const delta = typeof patch === 'function' ? patch(state) : patch
      const next = { ...state, ...delta } as T

      // 浅比较：没有实际变化就不触发订阅者，避免无效渲染
      if (shallowEqual(previous, next)) return

      state = next
      channel.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { state: next, previous } }))
    },

    subscribe(listener) {
      const handler = (event: Event): void => {
        const { state: next, previous } = (event as CustomEvent<{ state: T; previous: T }>).detail
        listener(next, previous)
      }
      channel.addEventListener(CHANGE_EVENT, handler)
      return () => channel.removeEventListener(CHANGE_EVENT, handler)
    }
  }
}

function shallowEqual(a: object, b: object): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  return keysA.every((key) => left[key] === right[key])
}
