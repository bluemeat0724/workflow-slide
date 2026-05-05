import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const rootEnvFile = path.resolve(projectRoot, '..', '.env')

const serverEnv = {
  ...process.env,
  STORAGE_DRIVER: 'sqlite',
  SQLITE_FILE: path.join(projectRoot, 'data', 'workflow-tool.sqlite'),
  PORT: '3103',
  DEFAULT_USER_ID: '00000000-0000-0000-0000-000000000001',
  DEFAULT_USER_EMAIL: 'local-dev@workflow-tool.local',
  DEFAULT_USER_NAME: 'Local Dev User',
}

const server = spawn('node', ['--env-file', rootEnvFile, 'server/index.mjs'], {
  cwd: projectRoot,
  env: serverEnv,
  stdio: 'inherit',
})

const vite = spawn('npx', ['vite'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    VITE_STORAGE_MODE: 'local-db',
    VITE_API_BASE_URL: '/api',
  },
  stdio: 'inherit',
})

process.on('SIGINT', () => {
  server.kill('SIGINT')
  vite.kill('SIGINT')
  process.exit(0)
})

process.on('SIGTERM', () => {
  server.kill('SIGTERM')
  vite.kill('SIGTERM')
  process.exit(0)
})

server.on('close', (code) => {
  if (code !== 0) {
    vite.kill('SIGTERM')
    process.exit(code ?? 1)
  }
})

vite.on('close', (code) => {
  server.kill('SIGTERM')
  process.exit(code ?? 0)
})
