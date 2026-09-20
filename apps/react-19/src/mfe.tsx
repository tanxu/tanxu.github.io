import { createRoot, type Root } from 'react-dom/client'
import type { MfeMountContext, MicroAppModule } from '@mfe/contract'
import { App } from './App'
import { useCounterStore } from './store'
import './style.css'

/**
 * 子应用 ESM 入口。
 *
 * React 19 与 Shadow DOM：
 * 从 React 17 起事件监听绑定在 root 容器上而非 document，
 * 因此把 createRoot 的容器放在 ShadowRoot 内部即可正常工作，无需任何 polyfill。
 * 唯一需要注意的两点：
 *   1. Portal 的目标节点必须也在同一个 ShadowRoot 内，否则会渲染到 light DOM 丢失样式；
 *   2. 不要在子应用里给 document 绑全局监听（如点击外部关闭），请绑到 ctx.shadowRoot。
 */

let root: Root | null = null
let host: HTMLElement | null = null
let context: MfeMountContext | null = null

function render(route: string): void {
  const ctx = context
  if (!root || !ctx) return
  root.render(<App bus={ctx.bus} env={ctx.getEnv()} route={route} />)
}

export function mount(ctx: MfeMountContext): void {
  context = ctx

  // 每次 mount 新建容器、unmount 整体移除：
  // createRoot 不允许在同一个容器上调用两次，这是反复切换子应用时最容易踩的坑
  host = document.createElement('div')
  host.className = 'react-root'
  ctx.container.appendChild(host)

  root = createRoot(host)
  render(ctx.route)

  useCounterStore.getState().appendLog('挂载完成')
}

export function unmount(): void {
  root?.unmount()
  root = null

  host?.remove()
  host = null
  context = null
}

export function update({ route }: Pick<MfeMountContext, 'route'>): void {
  render(route)
}

export default { mount, unmount, update } satisfies MicroAppModule
