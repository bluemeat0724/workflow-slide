import { useEffect, useRef, useState } from 'react'
import { createDiagramApiClient } from '../api/client'
import type { DiagramApiClient } from '../api/client'
import { getRuntimeConfig } from '../config/runtime'
import type { RuntimeCapabilities } from '../config/runtime'
import { createEmptyDiagram } from '../data/createEmptyDiagram'
import type { Diagram, Locale } from '../model/diagram'

const LOCAL_DRAFT_KEY = 'workflow-tool-draft'
const LOCAL_DIAGRAM_ID = 'local-default'
const LOCAL_PERSISTENCE_CACHE_KEY = `workflow-tool-diagram:${LOCAL_DIAGRAM_ID}`
const SCHEMA_VERSION = '1.0'

const runtimeConfig = getRuntimeConfig()
const STATIC_CAPABILITIES = runtimeConfig.capabilities
const API_BASE_URL = runtimeConfig.apiBaseUrl
const API_CLIENT: DiagramApiClient | null = API_BASE_URL
  ? createDiagramApiClient({ baseUrl: API_BASE_URL })
  : null

const SEARCH_PARAMS = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)

const REMOTE_DIAGRAM_ID: string | null = STATIC_CAPABILITIES.supportsDatabase
  ? (SEARCH_PARAMS.get('diagramId')?.trim() || null)
  : null

const FORCE_NEW_DIAGRAM = !REMOTE_DIAGRAM_ID && SEARCH_PARAMS.get('new') === '1'

const localeFromSearch = SEARCH_PARAMS.get('locale')
const INITIAL_LOCALE: Locale | null = localeFromSearch === 'en-US' || localeFromSearch === 'zh-CN'
  ? localeFromSearch
  : null

export {
  LOCAL_DRAFT_KEY,
  LOCAL_DIAGRAM_ID,
  LOCAL_PERSISTENCE_CACHE_KEY,
  SCHEMA_VERSION,
  API_CLIENT,
  API_BASE_URL,
  REMOTE_DIAGRAM_ID,
  FORCE_NEW_DIAGRAM,
  INITIAL_LOCALE,
}

function loadInitialDiagram(): { diagram: Diagram; restored: boolean } {
  if (FORCE_NEW_DIAGRAM) {
    window.localStorage.removeItem(LOCAL_DRAFT_KEY)
    window.localStorage.removeItem(LOCAL_PERSISTENCE_CACHE_KEY)
    return {
      diagram: createEmptyDiagram(INITIAL_LOCALE ?? 'zh-CN'),
      restored: false,
    }
  }

  window.localStorage.removeItem(LOCAL_DRAFT_KEY)
  return { diagram: createEmptyDiagram(INITIAL_LOCALE ?? 'zh-CN'), restored: false }
}

export type AppBootstrapResult = {
  initialDiagram: Diagram
  isRestored: boolean
  capabilities: RuntimeCapabilities
}

export function useAppBootstrap(): AppBootstrapResult {
  const api = API_CLIENT
  const [capabilities, setCapabilities] = useState(STATIC_CAPABILITIES)
  const healthFetchedRef = useRef(false)
  const initialState = loadInitialDiagram()

  useEffect(() => {
    if (!api || healthFetchedRef.current) {
      return
    }

    const controller = new AbortController()

    void api.getHealth(controller.signal).then((health) => {
      healthFetchedRef.current = true
      setCapabilities((current) => ({
        ...current,
        supportsAi: health.capabilities.supportsAi,
      }))
    }).catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setCapabilities((current) => ({
        ...current,
        supportsAi: false,
      }))
    })

    return () => {
      controller.abort()
    }
  }, [api])

  useEffect(() => {
    if (!FORCE_NEW_DIAGRAM) {
      return
    }

    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('new')
    nextUrl.searchParams.delete('locale')
    window.history.replaceState(null, '', nextUrl.toString())
  }, [])

  return {
    initialDiagram: initialState.diagram,
    isRestored: initialState.restored,
    capabilities,
  }
}
