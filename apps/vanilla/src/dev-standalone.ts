import { createDevHost, type DevHost } from '../../../tools/dev-host.ts'
import { mount, unmount } from './mfe'

/**
 * 独立开发入口 —— 只被 index.html 引用，**不进入构建产物**。
 * （vite 的 lib 模式只打包 src/mfe.ts，index.html 仅供 dev server 使用。）
 */

const devHost = createDevHost('vanilla')

mount(devHost.ctx)

declare global {
  interface Window {
    __devHost?: DevHost
  }
}

// 在浏览器控制台执行下面这行，即可模拟"收到其他子应用的广播"：
//   __devHost.receive('counter:changed', { total: 99, from: 'react-19' })
window.__devHost = devHost

window.addEventListener('beforeunload', () => {
  unmount()
  devHost.dispose()
})
