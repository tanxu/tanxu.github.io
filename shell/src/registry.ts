import type { AppId } from '@mfe/contract'

/**
 * 子应用注册表 —— 新增一个子应用时，这里是唯一需要改动的地方。
 * dir 相对站点根目录，必须以 `/` 结尾，以便用相对 URL 解析 manifest / 入口 / 样式。
 */
export interface AppDefinition {
  /** 子应用唯一标识，会出现在 hash 路由中：`#/<id>/...` */
  id: AppId
  /** 导航栏展示名 */
  title: string
  /** 技术栈说明，仅用于展示 */
  stack: string
  /** 构建产物部署目录，相对站点根，必须以 `/` 结尾 */
  dir: string
  /** 进入该子应用时的默认内部路由 */
  defaultRoute: string
}

export const APPS: readonly AppDefinition[] = [
  {
    id: 'vanilla',
    title: '原生 JavaScript',
    stack: '原生 ESM + 自研 Store',
    dir: 'apps/vanilla/',
    defaultRoute: '/'
  },
  {
    id: 'react-19',
    title: 'React 19',
    stack: 'React 19 + Zustand',
    dir: 'apps/react-19/',
    defaultRoute: '/'
  },
  {
    id: 'vue-3',
    title: 'Vue 3',
    stack: 'Vue 3 + Pinia',
    dir: 'apps/vue-3/',
    defaultRoute: '/'
  }
]

export function findApp(id: string): AppDefinition | undefined {
  return APPS.find((app) => app.id === id)
}
