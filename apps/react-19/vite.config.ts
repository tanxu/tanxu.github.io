import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mfeManifest } from '../../tools/mfe-manifest.ts'

const NAME = 'react-19'

export default defineConfig(({ command }) => ({
  base: './',

  plugins: [react(), mfeManifest(NAME)],

  // Vite 的 lib 模式不会自动替换 process.env.NODE_ENV（因为库通常把这件事交给使用方）。
  // 但这里的产物是**自包含的应用包**，没有下游打包器接手，
  // 不显式声明就会把 react / react-dom 的 development 版本打进来 —— 体积翻数倍且带运行时告警。
  define:
    command === 'build'
      ? { 'process.env.NODE_ENV': JSON.stringify('production') }
      : {},

  build: {
    outDir: `../../dist/apps/${NAME}`,
    emptyOutDir: true,
    cssCodeSplit: false,
    target: 'es2022',
    lib: {
      entry: 'src/mfe.tsx',
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

  server: { port: 5175, strictPort: true }
}))
