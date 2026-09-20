import { createDevHost, type DevHost } from '../../../tools/dev-host.ts'
import { mount, unmount } from './mfe'

const devHost = createDevHost('react-19')

mount(devHost.ctx)

declare global {
  interface Window {
    __devHost?: DevHost
  }
}

// 在浏览器控制台执行下面这行，即可模拟"收到其他子应用的广播"：
//   __devHost.receive('counter:changed', { total: 99, from: 'vue-3' })
window.__devHost = devHost

window.addEventListener('beforeunload', () => {
  unmount()
  devHost.dispose()
})
