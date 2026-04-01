import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 重要：支持 Electron 相对路径加载
  build: {
    outDir: 'dist'
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 使用现代 Sass API，消除 legacy-js-api 弃用警告
        api: 'modern-compiler',
        silenceDeprecations: ['legacy-js-api']
      }
    }
  }
})
