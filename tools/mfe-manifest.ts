import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

export interface MfeManifestOptions {
  /** 产物中的 manifest 文件名，默认 manifest.json */
  fileName?: string
}

/**
 * 构建期产物清单插件。
 *
 * 为什么需要它：
 * GitHub Pages 是纯静态托管 + CDN，无法主动 purge 缓存。所以把
 *   入口文件      -> 固定文件名 index.js（内容每次构建都会变）
 *   内部 chunk/资源 -> 带 content hash（可长期缓存）
 * 两者用 manifest.json 关联起来，Shell 运行时先拉 manifest 拿到 hash，
 * 再用 `index.js?v=<hash>` 拉入口，从而做到「CDN 缓存永远打不穿、资源又能长期缓存」。
 *
 * 使用方：apps/*\/vite.config.ts
 */
export function mfeManifest(name: string, options: MfeManifestOptions = {}): Plugin {
  const fileName = options.fileName ?? 'manifest.json'

  return {
    name: 'mfe-manifest',
    apply: 'build',
    enforce: 'post',
    generateBundle(_outputOptions, bundle) {
      const files = Object.keys(bundle).sort()

      let entry = ''
      let style = ''

      for (const file of files) {
        const output = bundle[file]
        if (!output) continue
        if (output.type === 'chunk' && output.isEntry && !entry) entry = file
        if (output.type === 'asset' && file.endsWith('.css') && !style) style = file
      }

      if (!entry) {
        this.error(`[mfe-manifest] 未能在 ${name} 的产物中定位 ESM 入口文件`)
      }

      const manifest = {
        name,
        entry,
        ...(style ? { style } : {}),
        hash: createHash('sha256').update(files.join('|')).digest('hex').slice(0, 8),
        builtAt: new Date().toISOString()
      }

      this.emitFile({
        type: 'asset',
        fileName,
        source: `${JSON.stringify(manifest, null, 2)}\n`
      })
    }
  }
}
