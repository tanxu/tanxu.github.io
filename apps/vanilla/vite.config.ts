import { defineConfig } from 'vite'
import { mfeManifest } from '../../tools/mfe-manifest.ts'

const NAME = 'vanilla'

export default defineConfig({
  // 相对基路径：子应用被部署在站点的任意子目录下都能自洽解析资源
  base: './',

  plugins: [mfeManifest(NAME)],

  build: {
    outDir: `../../dist/apps/${NAME}`,
    emptyOutDir: true,
    // 所有样式合并为单个 css 文件，由 Shell 注入 ShadowRoot
    cssCodeSplit: false,
    target: 'es2022',
    lib: {
      entry: 'src/mfe.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      output: {
        // 入口固定名 + manifest 里的 hash 查询串击穿 CDN 缓存
        entryFileNames: 'index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },

  // 独立开发端口，避免与其他子应用冲突
  server: { port: 5174, strictPort: true }
})
