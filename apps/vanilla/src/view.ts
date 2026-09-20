import type { AppState } from './app-store'
import type { Store } from './store'

export interface View {
  el: HTMLElement
  destroy(): void
}

export interface ViewHandlers {
  increment(step: number): void
  broadcast(): void
  reset(): void
}

const TEMPLATE = `
  <header class="app__head">
    <div class="app__heading">
      <h1 class="app__title">原生 JavaScript</h1>
      <p class="app__desc">无框架 · 自研 EventTarget Store · Shadow DOM 隔离</p>
    </div>
    <span class="app__badge">vanilla</span>
  </header>

  <div class="app__body">
    <section class="panel">
      <p class="panel__label">本应用独立计数</p>
      <p class="counter" data-count>0</p>
      <div class="actions">
        <button type="button" class="btn btn--primary" data-action="increment">+1</button>
        <button type="button" class="btn" data-action="increment10">+10</button>
        <button type="button" class="btn" data-action="broadcast">广播到其他子应用</button>
        <button type="button" class="btn btn--ghost" data-action="reset">重置</button>
      </div>
      <p class="hint">
        切到其他子应用再切回来，计数会保留（卸载只清理副作用，不销毁模块实例）。
        广播出去的计数会进入 Shell 的事件流；当时没打开的子应用，下次打开时
        会以「离线期间」的名义补收到这条消息。
      </p>
    </section>

    <section class="panel">
      <p class="panel__label">事件日志</p>
      <ul class="log" data-log></ul>
    </section>
  </div>

  <footer class="app__foot" data-env></footer>
`

export function createView(store: Store<AppState>, handlers: ViewHandlers): View {
  const el = document.createElement('section')
  el.className = 'app'
  el.innerHTML = TEMPLATE

  const countEl = query<HTMLElement>(el, '[data-count]')
  const logEl = query<HTMLElement>(el, '[data-log]')

  query<HTMLButtonElement>(el, '[data-action="increment"]').addEventListener('click', () =>
    handlers.increment(1)
  )
  query<HTMLButtonElement>(el, '[data-action="increment10"]').addEventListener('click', () =>
    handlers.increment(10)
  )
  query<HTMLButtonElement>(el, '[data-action="broadcast"]').addEventListener('click', () =>
    handlers.broadcast()
  )
  query<HTMLButtonElement>(el, '[data-action="reset"]').addEventListener('click', () =>
    handlers.reset()
  )

  const render = (state: Readonly<AppState>): void => {
    countEl.textContent = String(state.count)

    if (state.log.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'log__empty'
      empty.textContent = '暂无事件'
      logEl.replaceChildren(empty)
      return
    }

    // 一律用 textContent 写入，天然免疫 XSS
    logEl.replaceChildren(
      ...state.log.map((text) => {
        const item = document.createElement('li')
        item.textContent = text
        return item
      })
    )
  }

  const unsubscribe = store.subscribe(render)
  render(store.get())

  return { el, destroy: unsubscribe }
}

function query<T extends Element>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`视图模板缺少必要节点：${selector}`)
  return found
}
