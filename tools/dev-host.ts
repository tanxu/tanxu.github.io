import type { MfeBus, MfeEnv, MfeEvent, MfeMountContext } from '../packages/contract/src/index.ts'

const BASE_STYLE = `:host{display:block;color:#1f2328;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.6;--mfe-surface:#fff;--mfe-surface-alt:#f6f8fa;--mfe-border:#d8dee4;--mfe-text:#1f2328;--mfe-muted:#656d76;--mfe-accent:#0969da;--mfe-radius:8px;--mfe-font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}:host *,:host *::before,:host *::after{box-sizing:border-box}`

type AnyHandler = (event: MfeEvent<unknown>) => void

export interface DevHost {
  /** 可直接传给子应用 mount 的上下文 */
  ctx: MfeMountContext
  /** 手动灌入一条"来自其他子应用"的事件，用于在独立调试时验证事件处理逻辑 */
  receive<T>(type: string, detail: T, source?: string): void
  dispose(): void
}

export interface DevHostOptions {
  /** 宿主节点选择器，默认 #app */
  rootSelector?: string
}

/**
 * 独立开发宿主（仅 `npm run dev:<app>` 使用，不进入任何构建产物）。
 *
 * 刻意复刻 Shell 的运行时环境：Shadow DOM 边界 + 只读 env + 事件总线。
 * 这样在独立调试阶段就能提前暴露 Shadow DOM 相关的样式问题，
 * 而不是等到集成阶段才发现。同时也顺手把 Vite 注入到 document.head 的
 * 开发态样式搬进 ShadowRoot —— 否则 dev 下样式根本进不了隔离边界。
 */
export function createDevHost(appId: string, options: DevHostOptions = {}): DevHost {
  const selector = options.rootSelector ?? '#app'
  const host = document.querySelector<HTMLElement>(selector)
  if (!host) throw new Error(`独立开发宿主缺少节点：${selector}`)

  const shadowRoot = host.attachShadow({ mode: 'open' })
  adoptDevStyles(shadowRoot)

  const baseStyle = document.createElement('style')
  baseStyle.textContent = BASE_STYLE
  shadowRoot.appendChild(baseStyle)

  const container = document.createElement('div')
  container.className = 'mfe-container'
  shadowRoot.appendChild(container)

  const handlers = new Map<string, Set<(event: MfeEvent<unknown>) => void>>()

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

  const bus: MfeBus = {
    emit(type, detail) {
      // 独立模式下没有其他子应用，打印出来便于确认发出的数据
      console.info(`[dev-bus] ${appId} emit`, type, detail)
    },
    on,
    once(type, handler) {
      const wrapped = (event: MfeEvent<unknown>): void => {
        off()
        ;(handler as AnyHandler)(event)
      }
      const off = on(type, wrapped)
      return off
    }
  }

  const env: MfeEnv = {
    appId,
    baseUrl: new URL('./', window.location.href).href,
    builtAt: 'development',
    hash: 'dev'
  }

  const ctx: MfeMountContext = {
    appId,
    shadowRoot,
    container,
    base: env.baseUrl,
    route: '/',
    bus,
    getEnv: () => env
  }

  return {
    ctx,
    receive(type, detail, source = 'dev-remote') {
      const event: MfeEvent<unknown> = { type, detail, source, timestamp: Date.now() }
      // 绕过 source 过滤，直接投递给订阅者
      for (const handler of [...(handlers.get(type) ?? [])]) handler(event)
    },
    dispose() {
      handlers.clear()
    }
  }
}

/**
 * Vite 在 dev 模式下把 CSS 注入 document.head，而 head 里的样式
 * 不会作用到 ShadowRoot 内部。这里把注入的 style 节点搬进 ShadowRoot，
 * 并用 MutationObserver 跟进 HMR 产生的新节点。
 */
function adoptDevStyles(shadowRoot: ShadowRoot): void {
  const adopt = (node: Node): void => {
    if (!(node instanceof HTMLStyleElement)) return
    const id = node.dataset.viteDevId
    if (!id) return
    // 同一个模块的旧样式一并清掉，避免 HMR 后叠加
    shadowRoot.querySelectorAll(`style[data-vite-dev-id="${id}"]`).forEach((stale) => stale.remove())
    shadowRoot.appendChild(node)
  }

  document.head.querySelectorAll('style[data-vite-dev-id]').forEach(adopt)

  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(adopt)
    }
  }).observe(document.head, { childList: true })
}
