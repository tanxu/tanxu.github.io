import type { MfeBus, MfeEnv } from '@mfe/contract'

/**
 * 根组件 props。
 *
 * routeState 是一个 **响应式对象**：Shell 调 update({route}) 时只改它上面的 route 字段，
 * Vue 就会重新求值。这是 Vue 侧传递"外部路由变化"最轻量的做法 ——
 * app.mount() 的根 props 在挂载后不再更新，所以必须包一层 reactive。
 */
export interface VueAppProps {
  bus: MfeBus
  env: MfeEnv
  routeState: { route: string }
}
