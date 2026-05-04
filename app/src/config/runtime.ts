export type StorageMode = 'local-db' | 'remote' | 'local-only'

export type RuntimeCapabilities = {
  supportsDatabase: boolean
  supportsDiagramLibrary: boolean
  supportsRevisionHistory: boolean
  supportsCreateRemoteDocument: boolean
}

export type RuntimeConfig = {
  storageMode: StorageMode
  apiBaseUrl: string | null
  capabilities: RuntimeCapabilities
}

function resolveStorageMode(): StorageMode {
  const mode = import.meta.env.VITE_STORAGE_MODE
  if (mode === 'local-db' || mode === 'remote' || mode === 'local-only') {
    return mode
  }

  return 'local-only'
}

function resolveApiBaseUrl(storageMode: StorageMode): string | null {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }

  if (storageMode === 'local-db') {
    return '/api'
  }

  if (storageMode === 'remote') {
    throw new Error('VITE_API_BASE_URL is required when VITE_STORAGE_MODE=remote.')
  }

  return null
}

function deriveCapabilities(storageMode: StorageMode): RuntimeCapabilities {
  const supportsDatabase = storageMode === 'local-db' || storageMode === 'remote'

  return {
    supportsDatabase,
    supportsDiagramLibrary: supportsDatabase,
    supportsRevisionHistory: supportsDatabase,
    supportsCreateRemoteDocument: supportsDatabase,
  }
}

let cachedConfig: RuntimeConfig | null = null

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const storageMode = resolveStorageMode()
  const apiBaseUrl = resolveApiBaseUrl(storageMode)
  const capabilities = deriveCapabilities(storageMode)

  cachedConfig = { storageMode, apiBaseUrl, capabilities }
  return cachedConfig
}
