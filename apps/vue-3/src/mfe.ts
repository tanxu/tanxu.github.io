import { createApp, reactive, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import type { MfeMountContext, MicroAppModule } from '@mfe/contract'
import App from './App.vue'
import './style.css'

/**
 * 子应用 ESM 入口。
 *
 * Vue 3 与 Shadow DOM：
 * - createApp().mount() 直接挂到 ShadowRoot 内的节点即可，不需要额外适配。
 * - **不要把 Teleport 指向 body 或 document 上的节点**，那样会渲染到 light DOM，
 *   丢掉隔离边界与样式；需要弹层时请 teleport 到 ctx.shadowRoot 内的节点。
 * - 全局样式注入（如 Element Plus）默认写 <head>，在 Shadow DOM 下不生效，
 *   需要手动把样式注入到 ctx.shadowRoot。
 */

/** 响应式路由容器，Shell 通过 update() 只改这个对象的 route 字段 */
const routeState = reactive({ route: '/' })

let app: VueApp<Element> | null = null
let host: HTMLElement | null = null

export function mount(ctx: MfeMountContext): void {
  routeState.route = ctx.route

  // 每次 mount 新建容器，unmount 时整体移除并销毁 app 实例
  host = document.createElement('div')
  host.className = 'vue-root'
  ctx.container.appendChild(host)

  app = createApp(App, {
    bus: ctx.bus,
    env: ctx.getEnv(),
    routeState
  })

  // 每个子应用自己一个 Pinia 容器，与其他子应用彻底隔离
  app.use(createPinia())
  app.mount(host)
}

export function unmount(): void {
  app?.unmount()
  app = null

  host?.remove()
  host = null
}

export function update({ route }: Pick<MfeMountContext, 'route'>): void {
  routeState.route = route
}

export default { mount, unmount, update } satisfies MicroAppModule
