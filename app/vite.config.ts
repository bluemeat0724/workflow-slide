import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const envDir = '..'
  const env = loadEnv(mode, envDir, '')
  const storageMode = env.VITE_STORAGE_MODE

  const proxy = storageMode === 'local-db'
    ? {
        '/api': 'http://127.0.0.1:3103',
      }
    : undefined

  return {
    envDir,
    plugins: [react()],
    server: {
      proxy,
    },
  }
})
