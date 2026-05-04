import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const storageMode = env.VITE_STORAGE_MODE

  const proxy = storageMode === 'local-db'
    ? {
        '/api': 'http://127.0.0.1:3103',
      }
    : undefined

  return {
    plugins: [react()],
    server: {
      proxy,
    },
  }
})
