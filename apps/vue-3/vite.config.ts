import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { mfeManifest } from '../../tools/mfe-manifest.ts'

const NAME = 'vue-3'

export default defineConfig(({ command }) => ({
  base: './',

  plugins: [vue(), mfeManifest(NAME)],

  // 同 React 子应用：lib 模式不会自动替换 process.env.NODE_ENV，
  // 不显式声明会打进 Vue 的 development 分支。
  define:
    command === 'build'
      ? { 'process.env.NODE_ENV': JSON.stringify('production') }
      : {},

  build: {
    outDir: `../../dist/apps/${NAME}`,
    emptyOutDir: true,
    // SFC 里的 <style> 与 style.css 都会合并进这一个 css 文件，由 Shell 注入 ShadowRoot
    cssCodeSplit: false,
    target: 'es2022',
    lib: {
      entry: 'src/mfe.ts',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },

  server: { port: 5176, strictPort: true }
}))
