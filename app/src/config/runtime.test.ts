import { describe, expect, it } from 'vitest'
import { resolveApiBaseUrlFromEnv, resolveStorageModeFromEnv } from './runtime'

describe('runtime config helpers', () => {
  it('ignores VITE_API_BASE_URL in local-only mode', () => {
    expect(resolveApiBaseUrlFromEnv('local-only', {
      VITE_API_BASE_URL: 'https://example.com/api',
    })).toBe(null)
  })

  it('defaults local-db to the local api path', () => {
    expect(resolveApiBaseUrlFromEnv('local-db', {})).toBe('/api')
  })

  it('requires an explicit api base url in remote mode', () => {
    expect(() => resolveApiBaseUrlFromEnv('remote', {})).toThrow('VITE_API_BASE_URL is required when VITE_STORAGE_MODE=remote.')
  })

  it('falls back to local-only for invalid modes', () => {
    expect(resolveStorageModeFromEnv({ VITE_STORAGE_MODE: 'unexpected' })).toBe('local-only')
  })
})
