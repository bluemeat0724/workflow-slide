import { useEffect, useRef, useState } from 'react'
import type { DiagramApiClient } from '../api/client'
import type { Diagram, Locale } from '../model/diagram'
import { getMessages } from '../i18n'
import { createEmptyDiagram } from '../data/createEmptyDiagram'
import {
  createPersistenceService,
  type PersistenceService,
} from '../storage/persistenceService'

type UsePersistenceControllerInput = {
  api: DiagramApiClient | null
  apiBaseUrl: string | null
  remoteDiagramId: string | null
  localDiagramId: string
  schemaVersion: string
  supportsDatabase: boolean
  isRestored: boolean
  initialDiagram: Diagram
  localeRef: React.MutableRefObject<Locale>
  setStatus: (status: string) => void
  disposeAgent: () => void
  onLoadResult: (diagram: Diagram) => void
}

export type UsePersistenceControllerResult = {
  isPersistenceReady: boolean
  persistenceRef: React.MutableRefObject<PersistenceService | null>
  skipNextAutosaveRef: React.MutableRefObject<boolean>
}

export function usePersistenceController({
  api,
  apiBaseUrl,
  remoteDiagramId,
  localDiagramId,
  schemaVersion,
  supportsDatabase,
  isRestored,
  initialDiagram,
  localeRef,
  setStatus,
  disposeAgent,
  onLoadResult,
}: UsePersistenceControllerInput): UsePersistenceControllerResult {
  const [isPersistenceReady, setIsPersistenceReady] = useState(false)
  const persistenceRef = useRef<PersistenceService | null>(null)
  const skipNextAutosaveRef = useRef(false)

  useEffect(() => {
    const persistence = createPersistenceService({
      api: supportsDatabase && remoteDiagramId && apiBaseUrl
        ? api
        : null,
      diagramId: remoteDiagramId ?? localDiagramId,
      schemaVersion,
      createEmptyDiagram: () => createEmptyDiagram(localeRef.current),
      onSaveStateChange: (state) => {
        const nextMessages = getMessages(localeRef.current)

        if (state === 'saving') {
          setStatus(nextMessages.status.persistenceSaving)
          return
        }

        if (state === 'saved') {
          setStatus(nextMessages.status.persistenceSaved)
          return
        }

        if (state === 'offline-draft') {
          setStatus(nextMessages.status.persistenceOfflineDraft)
          return
        }

        if (state === 'conflict') {
          setStatus(nextMessages.status.persistenceConflict)
          return
        }

        if (state === 'error') {
          setStatus(nextMessages.status.persistenceError)
        }
      },
    })

    persistenceRef.current = persistence

    let cancelled = false

    void persistence.load().then((result) => {
      if (cancelled) {
        return
      }

      skipNextAutosaveRef.current = true

      if (result.source === 'server') {
        onLoadResult(result.document.diagram)
      } else if (result.source === 'local-cache') {
        onLoadResult(result.diagram)
        setStatus(getMessages(result.diagram.meta.locale).status.draftRestored)
      } else if (result.source === 'remote-error') {
        onLoadResult(result.diagram)

        const nextMessages = getMessages(result.diagram.meta.locale)
        if (result.error.kind === 'not-found') {
          setStatus(nextMessages.status.remoteLoadNotFound)
        } else if (result.error.kind === 'unauthorized' || result.error.kind === 'forbidden') {
          setStatus(nextMessages.status.remoteLoadForbidden)
        } else if (result.error.kind === 'server') {
          setStatus(nextMessages.status.remoteLoadServerError)
        } else if (result.error.kind === 'network') {
          setStatus(nextMessages.status.remoteLoadNetworkError)
        } else {
          setStatus(nextMessages.status.remoteLoadUnknownError)
        }
      } else if (isRestored) {
        persistence.primeLocalCache(initialDiagram)
        setIsPersistenceReady(true)
        return
      }

      setIsPersistenceReady(result.source !== 'remote-error')
    })

    return () => {
      cancelled = true
      disposeAgent()
      persistence.dispose()
      persistenceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disposeAgent])

  return {
    isPersistenceReady,
    persistenceRef,
    skipNextAutosaveRef,
  }
}
