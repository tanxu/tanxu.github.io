import { useActionState, useEffect } from 'react'
import type { MfeBus, MfeEnv } from '@mfe/contract'
import { useCounterStore } from './store'

export interface AppProps {
  bus: MfeBus
  env: MfeEnv
  route: string
}

export function App({ bus, env, route }: AppProps) {
  const count = useCounterStore((state) => state.count)
  const log = useCounterStore((state) => state.log)
  const increment = useCounterStore((state) => state.increment)
  const reset = useCounterStore((state) => state.reset)
  const appendLog = useCounterStore((state) => state.appendLog)

  // React 19 的 Action：表单提交不需要手写 onSubmit + preventDefault
  const [noteResult, submitNote, isPending] = useActionState(
    async (_previous: string, formData: FormData) => {
      const text = String(formData.get('note') ?? '').trim()
      if (!text) return '请输入内容'
      appendLog(`记录备注：${text}`)
      return `已记录「${text}」`
    },
    ''
  )

  useEffect(() => {
    appendLog(`Shell 下发路由 ${route}`)
  }, [route, appendLog])

  useEffect(() => {
    // 订阅其他子应用的广播；返回的清理函数交给 React，卸载时自动执行。
    // replayed 为 true 表示这是「离线期间」错过的消息，由 Shell 在挂载后补投。
    return bus.on<{ total: number; from: string }>('counter:changed', (event) => {
      appendLog(
        event.replayed
          ? `离线期间：${event.source} 曾广播计数 ${event.detail.total}`
          : `收到 ${event.source} 的计数 ${event.detail.total}`
      )
    })
  }, [bus, appendLog])

  return (
    <section className="app">
      <header className="app__head">
        <div>
          <h1 className="app__title">React 19</h1>
          <p className="app__desc">React + Zustand · Shadow DOM 隔离 · Action 表单</p>
        </div>
        <span className="app__badge">react-19</span>
      </header>

      <div className="app__body">
        <section className="panel">
          <p className="panel__label">本应用独立计数</p>
          <p className="counter">{count}</p>
          <div className="actions">
            <button type="button" className="btn btn--primary" onClick={() => increment(1)}>
              +1
            </button>
            <button type="button" className="btn" onClick={() => increment(10)}>
              +10
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                bus.emit('counter:changed', { total: count, from: env.appId })
                appendLog(`已广播计数 ${count} 给其他子应用`)
              }}
            >
              广播到其他子应用
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset}>
              重置
            </button>
          </div>

          <form
            className="note"
            action={submitNote}
            style={{ marginTop: 12, display: 'flex', gap: 8 }}
          >
            <input
              className="note__input"
              name="note"
              placeholder="输入备注后回车"
              autoComplete="off"
            />
            <button type="submit" className="btn" disabled={isPending}>
              {isPending ? '提交中…' : '提交'}
            </button>
          </form>
          {noteResult ? <p className="hint">{noteResult}</p> : null}
        </section>

        <section className="panel">
          <p className="panel__label">事件日志</p>
          {log.length === 0 ? (
            <p className="log__empty">暂无事件</p>
          ) : (
            <ul className="log">
              {log.map((text, index) => (
                <li key={`${index}-${text}`}>{text}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="app__foot">
        构建指纹 {env.hash} · 资源基路径 {env.baseUrl}
      </footer>
    </section>
  )
}
