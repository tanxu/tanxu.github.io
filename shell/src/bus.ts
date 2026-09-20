import type { MfeBus, MfeEvent } from '@mfe/contract'

/** 事件在 document 上使用的通道名，统一加前缀避免与其他库的 CustomEvent 冲突 */
const CHANNEL = 'mfe:bus'

type AnyHandler = (event: MfeEvent<unknown>) => void

/**
 * 创建跨应用事件总线 —— 子应用之间唯一被允许的通信通道。
 *
 * 实现要点：
 * - 底层只有一个 document 上的 CustomEvent 通道，不向 window 挂任何全局变量。
 * - 事件不会回传给发送者自身，避免「自己 emit 又触发自己」造成回声循环。
 * - 所有订阅者拿到的是同一份 detail 引用。**不要就地修改 detail**，
 *   需要派生数据请先拷贝，否则会污染其他订阅者看到的内容。
 *
 * @param getSource 返回当前发送方的 appId。Shell 传 'shell'，子应用传自己的 id。
 */
export function createBus(getSource: () => string): MfeBus {
  const handlers = new Map<string, Set<AnyHandler>>()

  const dispatch = (event: Event): void => {
    const detail = (event as CustomEvent<MfeEvent<unknown>>).detail
    if (!detail || typeof detail.type !== 'string') return
    if (detail.source === getSource()) return

    const bucket = handlers.get(detail.type)
    if (!bucket) return

    // 复制一份再遍历：允许 handler 内部取消订阅而不影响本轮分发
    for (const handler of [...bucket]) {
      try {
        handler(detail)
      } catch (error) {
        // 单个订阅者抛错不应中断其余订阅者
        console.error('[mfe:bus] 事件处理函数抛出异常：', detail.type, error)
      }
    }
  }

  document.addEventListener(CHANNEL, dispatch)

  const on: MfeBus['on'] = (type, handler) => {
    let bucket = handlers.get(type)
    if (!bucket) {
      bucket = new Set<AnyHandler>()
      handlers.set(type, bucket)
    }
    bucket.add(handler as AnyHandler)
    return () => {
      bucket.delete(handler as AnyHandler)
    }
  }

  const once: MfeBus['once'] = (type, handler) => {
    // on() 的泛型在这里没有意义：负载类型在运行时才确定，统一按 unknown 处理
    const wrapped = (event: MfeEvent<unknown>): void => {
      off()
      ;(handler as AnyHandler)(event)
    }
    const off = on(type, wrapped)
    return off
  }

  const emit: MfeBus['emit'] = (type, detail) => {
    const event: MfeEvent<unknown> = {
      type,
      detail,
      source: getSource(),
      timestamp: Date.now()
    }
    document.dispatchEvent(new CustomEvent<MfeEvent<unknown>>(CHANNEL, { detail: event }))
  }

  return { emit, on, once }
}
