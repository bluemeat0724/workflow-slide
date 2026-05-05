import type { Diagram } from '../model/diagram'
import { ApiClientError, type DiagramApiClient } from '../api/client'
import type {
  CreateRevisionResponse,
  DiagramDocument,
  Id,
  ImportDiagramResponse,
  RestoreRevisionResponse,
  SchemaVersion,
  UpdateDraftResponse,
  UpdateDraftSuccessResponse,
  VersionConflictResponse,
} from '../api/contracts'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline-draft' | 'conflict'

type LocalCacheRecord = {
  diagram: Diagram
  latestVersion: number | null
  schemaVersion: SchemaVersion
  updatedAt: string
  pendingUpload: boolean
}

export type PersistenceLoadResult =
  | {
      source: 'server'
      document: DiagramDocument
    }
  | {
      source: 'local-cache'
      diagram: Diagram
      latestVersion: number | null
      updatedAt: string
      pendingUpload: boolean
    }
  | {
      source: 'empty'
      diagram: Diagram
    }
  | {
      source: 'remote-error'
      error: RemoteLoadError
      diagram: Diagram
    }

export type RemoteLoadErrorKind = 'not-found' | 'forbidden' | 'unauthorized' | 'server' | 'network' | 'unknown'

export type RemoteLoadError = {
  kind: RemoteLoadErrorKind
  status: number | null
  message: string
}

export type PersistenceServiceConfig = {
  api?: DiagramApiClient | null
  diagramId: Id
  schemaVersion: SchemaVersion
  autosaveDelayMs?: number
  cacheKeyPrefix?: string
  storage?: Storage | null
  createEmptyDiagram: () => Diagram
  onSaveStateChange?: (state: SaveState) => void
  onVersionChange?: (version: number | null) => void
}

export type SaveDraftInput = {
  diagram: Diagram
}

export type SaveRevisionInput = {
  diagram: Diagram
  changeSummary?: string
}

export type ImportDiagramInput = {
  diagram: Diagram
}

function isStorageAvailable(storage: Storage | null | undefined): storage is Storage {
  return Boolean(storage)
}

function getDefaultStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function isConflictResponse(response: UpdateDraftResponse): response is VersionConflictResponse {
  return response.ok === false
}

export class PersistenceService {
  private api: DiagramApiClient | null
  private diagramId: Id
  private schemaVersion: SchemaVersion
  private autosaveDelayMs: number
  private cacheKey: string
  private storage: Storage | null
  private createEmptyDiagram: () => Diagram
  private onSaveStateChange?: (state: SaveState) => void
  private onVersionChange?: (version: number | null) => void
  private saveTimer: number | null = null
  private pendingSave: Diagram | null = null
  private latestVersion: number | null = null
  private autosaveController: AbortController | null = null

  constructor({
    api,
    diagramId,
    schemaVersion,
    autosaveDelayMs = 800,
    cacheKeyPrefix = 'workflow-tool-diagram',
    storage = getDefaultStorage(),
    createEmptyDiagram,
    onSaveStateChange,
    onVersionChange,
  }: PersistenceServiceConfig) {
    this.api = api ?? null
    this.diagramId = diagramId
    this.schemaVersion = schemaVersion
    this.autosaveDelayMs = autosaveDelayMs
    this.cacheKey = `${cacheKeyPrefix}:${diagramId}`
    this.storage = storage
    this.createEmptyDiagram = createEmptyDiagram
    this.onSaveStateChange = onSaveStateChange
    this.onVersionChange = onVersionChange
  }

  async load(signal?: AbortSignal): Promise<PersistenceLoadResult> {
    try {
      if (!this.api) {
        throw new Error('remote persistence disabled')
      }

      const document = await this.api.getDiagram(this.diagramId, signal)
      this.setLatestVersion(document.latestVersion)
      this.writeLocalCache({
        diagram: document.diagram,
        latestVersion: document.latestVersion,
        schemaVersion: document.schemaVersion,
        updatedAt: document.updatedAt,
        pendingUpload: false,
      })
      this.setSaveState('idle')
      return { source: 'server', document }
    } catch (error) {
      if (this.api) {
        this.discardPendingAutosave()
        this.setLatestVersion(null)
        this.setSaveState('error')
        return {
          source: 'remote-error',
          error: classifyRemoteLoadError(error),
          diagram: this.readLocalCache()?.diagram ?? this.createEmptyDiagram(),
        }
      }

      const cached = this.readLocalCache()
      if (cached) {
        this.setLatestVersion(cached.latestVersion)
        this.setSaveState(cached.pendingUpload ? 'offline-draft' : 'idle')
        return {
          source: 'local-cache',
          diagram: cached.diagram,
          latestVersion: cached.latestVersion,
          updatedAt: cached.updatedAt,
          pendingUpload: cached.pendingUpload,
        }
      }

      this.setLatestVersion(null)
      this.setSaveState('idle')
      return {
        source: 'empty',
        diagram: this.createEmptyDiagram(),
      }
    }
  }

  scheduleAutosave(input: SaveDraftInput) {
    this.pendingSave = input.diagram

    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer)
    }

    this.saveTimer = window.setTimeout(() => {
      void this.flushAutosave()
    }, this.autosaveDelayMs)
  }

  async flushAutosave(signal?: AbortSignal): Promise<UpdateDraftSuccessResponse | VersionConflictResponse | null> {
    const pendingSave = this.pendingSave
    if (!pendingSave) {
      return null
    }

    this.pendingSave = null
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer)
      this.saveTimer = null
    }

    this.setSaveState('saving')

    if (!this.api) {
      const savedAt = new Date().toISOString()
      this.writeLocalCache({
        diagram: pendingSave,
        latestVersion: this.latestVersion,
        schemaVersion: this.schemaVersion,
        updatedAt: savedAt,
        pendingUpload: false,
      })
      this.setSaveState('saved')
      return {
        ok: true,
        latestVersion: this.latestVersion ?? 0,
        savedAt,
      }
    }

    if (this.latestVersion === null) {
      this.writeLocalCache({
        diagram: pendingSave,
        latestVersion: null,
        schemaVersion: this.schemaVersion,
        updatedAt: new Date().toISOString(),
        pendingUpload: true,
      })
      this.setSaveState('offline-draft')
      return null
    }

    try {
      this.autosaveController = signal ? null : new AbortController()
      const requestSignal = signal ?? this.autosaveController?.signal
      const response = await this.api.updateDraft(
        this.diagramId,
        {
          baseVersion: this.latestVersion,
          schemaVersion: this.schemaVersion,
          diagram: pendingSave,
        },
        requestSignal,
      )

      if (isConflictResponse(response)) {
        this.writeLocalCache({
          diagram: pendingSave,
          latestVersion: this.latestVersion,
          schemaVersion: this.schemaVersion,
          updatedAt: new Date().toISOString(),
          pendingUpload: true,
        })
        this.setSaveState('conflict')
        return response
      }

      this.setLatestVersion(response.latestVersion)
      this.writeLocalCache({
        diagram: pendingSave,
        latestVersion: response.latestVersion,
        schemaVersion: this.schemaVersion,
        updatedAt: response.savedAt,
        pendingUpload: false,
      })
      this.setSaveState('saved')
      return response
    } catch (error) {
      if (isAbortError(error)) {
        this.setSaveState('idle')
        return null
      }

      this.writeLocalCache({
        diagram: pendingSave,
        latestVersion: this.latestVersion,
        schemaVersion: this.schemaVersion,
        updatedAt: new Date().toISOString(),
        pendingUpload: true,
      })
      this.setSaveState('offline-draft')
      return null
    } finally {
      this.autosaveController = null
    }
  }

  async saveRevision({ diagram, changeSummary }: SaveRevisionInput, signal?: AbortSignal): Promise<CreateRevisionResponse> {
    if (!this.api || this.latestVersion === null) {
      throw new Error('Revision save requires remote persistence with a known version.')
    }

    this.discardPendingAutosave()
    const response = await this.api.createRevision(
      this.diagramId,
      {
        baseVersion: this.latestVersion,
        schemaVersion: this.schemaVersion,
        diagram,
        changeSummary,
      },
      signal,
    )

    this.setLatestVersion(response.version)
    this.writeLocalCache({
      diagram,
      latestVersion: response.version,
      schemaVersion: this.schemaVersion,
      updatedAt: response.createdAt,
      pendingUpload: false,
    })
    this.setSaveState('saved')
    return response
  }

  async importDiagram({ diagram }: ImportDiagramInput, signal?: AbortSignal): Promise<ImportDiagramResponse> {
    if (!this.api || this.latestVersion === null) {
      throw new Error('Import requires remote persistence with a known version.')
    }

    this.discardPendingAutosave()
    const response = await this.api.importDiagram(
      this.diagramId,
      {
        baseVersion: this.latestVersion,
        schemaVersion: this.schemaVersion,
        diagram,
      },
      signal,
    )

    this.setLatestVersion(response.latestVersion)
    this.writeLocalCache({
      diagram,
      latestVersion: response.latestVersion,
      schemaVersion: this.schemaVersion,
      updatedAt: response.savedAt,
      pendingUpload: false,
    })
    this.setSaveState('saved')
    return response
  }

  async restoreRevision(revisionId: Id, signal?: AbortSignal): Promise<RestoreRevisionResponse> {
    if (!this.api || this.latestVersion === null) {
      throw new Error('Restore requires remote persistence with a known version.')
    }

    this.discardPendingAutosave()
    const response = await this.api.restoreRevision(this.diagramId, revisionId, { baseVersion: this.latestVersion }, signal)
    this.setLatestVersion(response.latestVersion)
    this.writeLocalCache({
      diagram: response.diagram,
      latestVersion: response.latestVersion,
      schemaVersion: this.schemaVersion,
      updatedAt: response.savedAt,
      pendingUpload: false,
    })
    this.setSaveState('saved')
    return response
  }

  async clearDraft(signal?: AbortSignal): Promise<PersistenceLoadResult> {
    this.clearLocalCache()

    if (!this.api) {
      this.setLatestVersion(null)
      this.setSaveState('idle')
      return {
        source: 'empty',
        diagram: this.createEmptyDiagram(),
      }
    }

    return this.load(signal)
  }

  clearLocalCache() {
    this.discardPendingAutosave()

    if (!isStorageAvailable(this.storage)) {
      return
    }

    this.storage.removeItem(this.cacheKey)
  }

  primeLocalCache(diagram: Diagram, latestVersion: number | null = null) {
    const updatedAt = new Date().toISOString()
    this.setLatestVersion(latestVersion)
    this.writeLocalCache({
      diagram,
      latestVersion,
      schemaVersion: this.schemaVersion,
      updatedAt,
      pendingUpload: false,
    })
  }

  dispose() {
    this.discardPendingAutosave()
  }

  private setSaveState(state: SaveState) {
    this.onSaveStateChange?.(state)
  }

  private setLatestVersion(version: number | null) {
    this.latestVersion = version
    this.onVersionChange?.(version)
  }

  private readLocalCache(): LocalCacheRecord | null {
    if (!isStorageAvailable(this.storage)) {
      return null
    }

    const raw = this.storage.getItem(this.cacheKey)
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as LocalCacheRecord
    } catch {
      this.storage.removeItem(this.cacheKey)
      return null
    }
  }

  private writeLocalCache(record: LocalCacheRecord) {
    if (!isStorageAvailable(this.storage)) {
      return
    }

    this.storage.setItem(this.cacheKey, JSON.stringify(record))
  }

  private discardPendingAutosave() {
    this.pendingSave = null

    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer)
      this.saveTimer = null
    }

    this.autosaveController?.abort()
    this.autosaveController = null
  }
}

export function createPersistenceService(config: PersistenceServiceConfig) {
  return new PersistenceService(config)
}

function classifyRemoteLoadError(error: unknown): RemoteLoadError {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return { kind: 'unauthorized', status: error.status, message: error.message }
    }

    if (error.status === 403) {
      return { kind: 'forbidden', status: error.status, message: error.message }
    }

    if (error.status === 404) {
      return { kind: 'not-found', status: error.status, message: error.message }
    }

    if (error.status >= 500) {
      return { kind: 'server', status: error.status, message: error.message }
    }
  }

  if (isAbortError(error)) {
    return { kind: 'unknown', status: null, message: 'Request aborted.' }
  }

  if (error instanceof TypeError) {
    return { kind: 'network', status: null, message: error.message }
  }

  return {
    kind: 'unknown',
    status: error instanceof ApiClientError ? error.status : null,
    message: error instanceof Error ? error.message : 'Unknown remote load error.',
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
