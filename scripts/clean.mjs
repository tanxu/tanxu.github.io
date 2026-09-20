import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT } from '../tools/workspace.mjs'

rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true })
console.log('已清理构建产物（dist/）')
