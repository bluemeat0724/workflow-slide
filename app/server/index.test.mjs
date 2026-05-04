import { describe, expect, it } from 'vitest'
import { buildHealthPayload } from './index.mjs'

describe('buildHealthPayload', () => {
  it('reports AI support when the backend enables it', () => {
    expect(buildHealthPayload({
      storageDriver: 'sqlite',
      supportsAi: true,
    })).toMatchObject({
      ok: true,
      storageDriver: 'sqlite',
      capabilities: {
        supportsDatabase: true,
        supportsDiagramLibrary: true,
        supportsRevisionHistory: true,
        supportsCreateRemoteDocument: true,
        supportsAi: true,
      },
    })
  })

  it('reports AI as unavailable when the backend lacks AI configuration', () => {
    expect(buildHealthPayload({
      storageDriver: 'postgres',
      supportsAi: false,
    }).capabilities.supportsAi).toBe(false)
  })
})
