import type { MfeBus, MfeEvent } from '@mfe/contract'

/** 事件在 document 上使用的通道名，统一加前缀避免与其他库的 CustomEvent 冲突 */
const CHANNEL = 'mfe:bus'

/** 通配订阅键：`bus.on('*', handler)` 可收到所有类型的事件 */
export const WILDCARD = '*'

type AnyHandler = (event: MfeEvent<unknown>) => void

/**
 * 子应用门面额外携带的 Shell 内部能力。
 * 该类型不进入 `@mfe/contract` —— 子应用拿到的 `ctx.bus` 类型始终是 `MfeBus`。
 */
export interface BusFacade extends MfeBus {
  /** 把离线期间的历史事件补投给当前订阅者，由 Shell 在子应用挂载完成后调用 */
  replay(events: readonly MfeEvent<unknown>[]): void
}

/**
 * 创建跨应用事件总线 —— 子应用之间唯一被允许的通信通道。
 *
 * 实现要点：
 * - 底层只有一个 document 上的 CustomEvent 通道，不向 window 挂任何全局变量。
 * - 事件不会回传给发送者自身，避免「自己 emit 又触发自己」造成回声循环。
 * - 所有订阅者拿到的是同一份 detail 引用。**不要就地修改 detail**，
 *   需要派生数据请先拷贝，否则会污染其他订阅者看到的内容。
 * - 支持 `on('*', handler)` 通配订阅，Shell 用它缓存事件、做离线回放与面板展示。
 *
 * @param getSource 返回当前发送方的 appId。Shell 传 'shell'，子应用传自己的 id。
 */
export function createBus(getSource: () => string): BusFacade {
  const handlers = new Map<string, Set<AnyHandler>>()

  const invoke = (event: MfeEvent<unknown>, bucket: Set<AnyHandler> | undefined): void => {
    if (!bucket || bucket.size === 0) return
    // 复制一份再遍历：允许 handler 内部取消订阅而不影响本轮分发
    for (const handler of [...bucket]) {
      try {
        handler(event)
      } catch (error) {
        // 单个订阅者抛错不应中断其余订阅者
        console.error('[mfe:bus] 事件处理函数抛出异常：', event.type, error)
      }
    }
  }

  /** 投递给「精确类型订阅者」与「通配订阅者」各一份 */
  const deliver = (event: MfeEvent<unknown>): void => {
    invoke(event, handlers.get(event.type))
    invoke(event, handlers.get(WILDCARD))
  }

  const dispatch = (rawEvent: Event): void => {
    const detail = (rawEvent as CustomEvent<MfeEvent<unknown>>).detail
    if (!detail || typeof detail.type !== 'string') return
    if (detail.source === getSource()) return
    deliver(detail)
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

  const replay = (events: readonly MfeEvent<unknown>[]): void => {
    for (const event of events) {
      if (event.source === getSource()) continue
      // 复制而非就地改：同一份历史可能被多个门面先后回放
      deliver({ ...event, replayed: true })
    }
  }

  return { emit, on, once, replay }
}
