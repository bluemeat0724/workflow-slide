export type StorageMode = 'local-db' | 'remote' | 'local-only'

export type RuntimeCapabilities = {
  supportsDatabase: boolean
  supportsDiagramLibrary: boolean
  supportsRevisionHistory: boolean
  supportsCreateRemoteDocument: boolean
  supportsAi: boolean
  supportsImportExport: boolean
}

export type RuntimeConfig = {
  storageMode: StorageMode
  apiBaseUrl: string | null
  capabilities: RuntimeCapabilities
}

type RuntimeEnv = {
  [key: string]: unknown
  VITE_STORAGE_MODE?: string
  VITE_API_BASE_URL?: string
  VITE_SHOW_IMPORT_EXPORT?: string
}

export function resolveStorageModeFromEnv(env: RuntimeEnv): StorageMode {
  const mode = env.VITE_STORAGE_MODE
  if (mode === 'local-db' || mode === 'remote' || mode === 'local-only') {
    return mode
  }

  return 'local-only'
}

export function resolveApiBaseUrlFromEnv(storageMode: StorageMode, env: RuntimeEnv): string | null {
  if (storageMode === 'local-only') {
    return null
  }

  if (env.VITE_API_BASE_URL) {
    return env.VITE_API_BASE_URL
  }

  if (storageMode === 'local-db') {
    return '/api'
  }

  if (storageMode === 'remote') {
    throw new Error('VITE_API_BASE_URL is required when VITE_STORAGE_MODE=remote.')
  }

  return null
}

export function resolveImportExportFromEnv(env: RuntimeEnv): boolean {
  return env.VITE_SHOW_IMPORT_EXPORT === 'true'
}

function deriveCapabilities(storageMode: StorageMode, env: RuntimeEnv): RuntimeCapabilities {
  const supportsDatabase = storageMode === 'local-db' || storageMode === 'remote'

  return {
    supportsDatabase,
    supportsDiagramLibrary: supportsDatabase,
    supportsRevisionHistory: supportsDatabase,
    supportsCreateRemoteDocument: supportsDatabase,
    supportsAi: false,
    supportsImportExport: resolveImportExportFromEnv(env),
  }
}

let cachedConfig: RuntimeConfig | null = null

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const storageMode = resolveStorageModeFromEnv(import.meta.env)
  const apiBaseUrl = resolveApiBaseUrlFromEnv(storageMode, import.meta.env)
  const capabilities = deriveCapabilities(storageMode, import.meta.env)

  cachedConfig = { storageMode, apiBaseUrl, capabilities }
  return cachedConfig
}
