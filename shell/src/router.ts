/**
 * Hash 路由解析。
 *
 * 约定：`#/<appId>/<子应用内部路由>`
 *   `#/react-19`            -> { appId: 'react-19', subPath: '/' }
 *   `#/react-19/todo/42`    -> { appId: 'react-19', subPath: '/todo/42' }
 *
 * 选择 hash 而非 history 的原因：GitHub Pages 没有服务端路由，
 * 深链刷新会 404，只有 hash 能在零配置下做到「任意深链刷新都可用」。
 */
export interface RouteState {
  appId: string
  subPath: string
}

export function parseHash(hash: string): RouteState | null {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw || raw === '/') return null

  const segments = raw.split('/').filter((segment) => segment.length > 0)
  const [appId, ...rest] = segments
  if (!appId) return null

  return {
    appId: decodeURIComponent(appId),
    subPath: rest.length > 0 ? `/${rest.join('/')}` : '/'
  }
}

export function buildHash(appId: string, subPath = '/'): string {
  const clean = subPath.replace(/^\/+/, '')
  return clean ? `#/${encodeURIComponent(appId)}/${clean}` : `#/${encodeURIComponent(appId)}`
}
