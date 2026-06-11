import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const rootEnvFile = path.resolve(projectRoot, '..', '.env')

export function createDevProcessSpecs() {
  return [
    {
      command: process.execPath,
      args: ['--env-file', rootEnvFile, 'server/index.mjs'],
    },
    {
      command: process.execPath,
      args: ['--env-file', rootEnvFile, 'node_modules/vite/bin/vite.js'],
      env: {
        ...process.env,
        VITE_STORAGE_MODE: 'local-db',
        VITE_API_BASE_URL: '/api',
      },
    },
  ]
}

export function startDevProcesses() {
  const children = createDevProcessSpecs().map(({ command, args, env }) =>
    spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
    }),
  )

  let shuttingDown = false

  function shutdown(signal, exitCode = 0) {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal)
      }
    }
    process.exitCode = exitCode
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  for (const child of children) {
    child.on('error', () => shutdown('SIGTERM', 1))
    child.on('close', (code) => shutdown('SIGTERM', code ?? 0))
  }

  return children
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url)

if (isMainModule) {
  startDevProcesses()
}
