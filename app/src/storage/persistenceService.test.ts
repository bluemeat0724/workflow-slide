import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiagramApiClient } from '../api/client'
import { createEmptyDiagram } from '../data/createEmptyDiagram'
import { createPersistenceService } from './persistenceService'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

describe('PersistenceService.clearDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns an empty diagram immediately in local-only mode', async () => {
    const storage = createMemoryStorage()
    const diagram = createEmptyDiagram('zh-CN')
    diagram.meta.title = 'Temporary Draft'
    storage.setItem('workflow-tool-diagram:local-test', JSON.stringify({
      diagram,
      latestVersion: null,
      schemaVersion: '1.0',
      updatedAt: '2026-05-05T12:00:00.000Z',
      pendingUpload: false,
    }))
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      localStorage: storage,
    })

    const service = createPersistenceService({
      diagramId: 'local-test',
      schemaVersion: '1.0',
      storage,
      createEmptyDiagram: () => createEmptyDiagram('zh-CN'),
    })

    const result = await service.clearDraft()

    expect(result.source).toBe('empty')
    expect(result.diagram.meta.title).toBe('未命名流程图')
    expect(storage.getItem('workflow-tool-diagram:local-test')).toBe(null)
  })

  it('cancels a pending autosave before clearing the local cache', async () => {
    const storage = createMemoryStorage()
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      localStorage: storage,
    })

    const service = createPersistenceService({
      diagramId: 'local-test',
      schemaVersion: '1.0',
      storage,
      autosaveDelayMs: 50,
      createEmptyDiagram: () => createEmptyDiagram('zh-CN'),
    })

    const diagram = createEmptyDiagram('zh-CN')
    diagram.meta.title = 'Should Not Reappear'
    service.scheduleAutosave({ diagram })

    await service.clearDraft()
    await vi.advanceTimersByTimeAsync(100)

    expect(storage.getItem('workflow-tool-diagram:local-test')).toBe(null)
  })

  it('reloads the remote document after clearing a cached draft', async () => {
    const storage = createMemoryStorage()
    const localDraft = createEmptyDiagram('zh-CN')
    localDraft.meta.title = 'Offline Draft'
    storage.setItem('workflow-tool-diagram:remote-test', JSON.stringify({
      diagram: localDraft,
      latestVersion: 3,
      schemaVersion: '1.0',
      updatedAt: '2026-05-05T12:00:00.000Z',
      pendingUpload: true,
    }))
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      localStorage: storage,
    })

    const remoteDiagram = createEmptyDiagram('en-US')
    remoteDiagram.meta.title = 'Remote Source'
    const api: Partial<DiagramApiClient> = {
      getDiagram: vi.fn().mockResolvedValue({
        id: 'remote-test',
        title: remoteDiagram.meta.title,
        status: 'draft',
        latestVersion: 8,
        schemaVersion: '1.0',
        updatedAt: '2026-05-05T12:05:00.000Z',
        diagram: remoteDiagram,
      }),
    }

    const service = createPersistenceService({
      api: api as DiagramApiClient,
      diagramId: 'remote-test',
      schemaVersion: '1.0',
      storage,
      createEmptyDiagram: () => createEmptyDiagram('zh-CN'),
    })

    const result = await service.clearDraft()

    expect(result.source).toBe('server')
    expect(result.document.diagram.meta.title).toBe('Remote Source')
    expect(api.getDiagram).toHaveBeenCalledWith('remote-test', undefined)
    expect(storage.getItem('workflow-tool-diagram:remote-test')).toContain('Remote Source')
  })
})
