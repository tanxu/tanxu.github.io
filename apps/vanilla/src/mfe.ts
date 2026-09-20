import type { MfeMountContext, MicroAppModule } from '@mfe/contract'
import { appStore, appendLog, increment, reset } from './app-store'
import { createView, type View } from './view'
import './style.css'

/**
 * 子应用 ESM 入口。Shell 通过 `import(...)` 拿到这里的导出并驱动生命周期。
 *
 * 状态归属：appStore 定义在本模块图内，Shell 与其他子应用都拿不到它。
 * 跨应用数据只能通过 ctx.bus 以事件形式传递。
 */

let view: View | null = null
let host: HTMLElement | null = null
let disposers: Array<() => void> = []

export function mount(ctx: MfeMountContext): void {
  // 每次 mount 都新建宿主体，unmount 时整体移除，
  // 这样反复 mount / unmount 不会污染 ctx.container
  host = document.createElement('div')
  ctx.container.appendChild(host)

  const env = ctx.getEnv()

  view = createView(appStore, {
    increment: (step) => increment(step),
    reset: () => reset(),
    broadcast: () => {
      const total = appStore.get().count
      ctx.bus.emit('counter:changed', { total, from: env.appId })
      appendLog(`已广播计数 ${total} 给其他子应用`)
    }
  })

  const envLine = view.el.querySelector<HTMLElement>('[data-env]')
  if (envLine) {
    envLine.textContent = `构建指纹 ${env.hash} · 资源基路径 ${env.baseUrl}`
  }

  host.appendChild(view.el)

  // 订阅其他子应用的广播。返回的取消订阅函数必须在 unmount 里执行，
  // 否则子应用被切走后 handler 仍挂在总线上 —— 这是微前端最常见的泄漏点。
  // replayed 为 true 表示这是「离线期间」错过的消息，由 Shell 在挂载后补投。
  disposers.push(
    ctx.bus.on<{ total: number; from: string }>('counter:changed', (event) => {
      appendLog(
        event.replayed
          ? `离线期间：${event.source} 曾广播计数 ${event.detail.total}`
          : `收到 ${event.source} 的计数 ${event.detail.total}`
      )
    })
  )

  appendLog(`挂载完成，Shell 下发的内部路由为 ${ctx.route}`)
}

export function unmount(): void {
  disposers.forEach((dispose) => dispose())
  disposers = []

  view?.destroy()
  view = null

  host?.remove()
  host = null
}

export function update({ route }: Pick<MfeMountContext, 'route'>): void {
  appendLog(`内部路由切换为 ${route}`)
}

export default { mount, unmount, update } satisfies MicroAppModule
