import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/symbolize/',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { target: 'es2020', sourcemap: false },
})
