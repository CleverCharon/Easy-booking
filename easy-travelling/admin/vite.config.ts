import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,//// vite端口是5173，前端端口从5173代理转到3000
    proxy: {
      // 代理所有 /api 请求到后端
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // 不重写路径
        rewrite: (path) => path,
      }
    }
  }

})
