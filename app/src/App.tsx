import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react'
import { ApiClientError, createDiagramApiClient } from './api/client'
import type { DiagramListItem, DiagramRevision, WorkflowAgentMessage, WorkflowAgentProposal, WorkflowAgentState } from './api/contracts'
import { WorkflowAgentLauncher } from './components/agent/WorkflowAgentLauncher'
import { WorkflowAgentWindow } from './components/agent/WorkflowAgentWindow'
import { Canvas } from './components/canvas/Canvas'
import { Inspector } from './components/inspector/Inspector'
import { DiagramLibrary } from './components/library/DiagramLibrary'
import { Sidebar } from './components/sidebar/Sidebar'
import { Toolbar } from './components/toolbar/Toolbar'
import { getRuntimeConfig } from './config/runtime'
import { createEmptyDiagram } from './data/createEmptyDiagram'
import { getThemePresetById, getThemePresetId, type ThemePresetId } from './data/themePresets'
import { createEditorState, editorStateReducer } from './editor/editorState'
import { getMessages } from './i18n'
import type { Diagram, Edge, Locale, Node, Selection } from './model/diagram'
import { createPersistenceService, type PersistenceService } from './storage/persistenceService'
import { downloadTextFile, slugifyFileName } from './utils/download'
import { generateStandaloneHtml } from './utils/exportHtml'
import { createId } from './utils/ids'
import { parseDiagramJson, serializeDiagramJson } from './utils/json'
import { getThemeCssVars } from './utils/theme'

const LOCAL_DRAFT_KEY = 'workflow-tool-draft'
const LOCAL_DIAGRAM_ID = 'local-default'
const LOCAL_PERSISTENCE_CACHE_KEY = `workflow-tool-diagram:${LOCAL_DIAGRAM_ID}`
const SCHEMA_VERSION = '1.0'
const AGENT_HISTORY_MAX_TURNS = 10
const AGENT_LAUNCHER_STORAGE_KEY = 'workflow-agent-launcher-position'
const AGENT_LAUNCHER_MARGIN = 24
const AGENT_LAUNCHER_FALLBACK_WIDTH = 180
const AGENT_LAUNCHER_FALLBACK_HEIGHT = 56
const runtimeConfig = getRuntimeConfig()
const STATIC_CAPABILITIES = runtimeConfig.capabilities
const API_BASE_URL = runtimeConfig.apiBaseUrl
const API_CLIENT = API_BASE_URL
  ? createDiagramApiClient({ baseUrl: API_BASE_URL })
  : null
const SEARCH_PARAMS = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
const REMOTE_DIAGRAM_ID = STATIC_CAPABILITIES.supportsDatabase
  ? (SEARCH_PARAMS.get('diagramId')?.trim() || null)
  : null
const FORCE_NEW_DIAGRAM = !REMOTE_DIAGRAM_ID && SEARCH_PARAMS.get('new') === '1'
const localeFromSearch = SEARCH_PARAMS.get('locale')
const INITIAL_LOCALE: Locale | null = localeFromSearch === 'en-US' || localeFromSearch === 'zh-CN'
  ? localeFromSearch
  : null
const initialState = loadInitialDiagram()

function createAgentUiMessage(role: WorkflowAgentMessage['role'], content: string): WorkflowAgentMessage {
  return {
    id: createId('agent-message'),
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

function sliceRecentAgentTurns(messages: WorkflowAgentMessage[], maxUserTurns: number) {
  if (maxUserTurns <= 0 || messages.length === 0) {
    return []
  }

  let userTurnCount = 0
  let startIndex = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      userTurnCount += 1
      if (userTurnCount > maxUserTurns) {
        startIndex = index + 1
        while (startIndex < messages.length && messages[startIndex].role !== 'user') {
          startIndex += 1
        }
        break
      }
    }
  }

  return messages.slice(startIndex)
}

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) {
    return error.payload?.message ?? error.message ?? fallbackMessage
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

function isExecuteShortcut(value: string, locale: Locale) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  const shortcuts = locale === 'zh-CN'
    ? ['执行', '确认执行', '开始执行']
    : ['execute', 'run', 'confirm']

  return shortcuts.includes(normalized)
}

type AgentLauncherPosition = {
  x: number
  y: number
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getLauncherBounds(width: number, height: number) {
  return {
    minX: AGENT_LAUNCHER_MARGIN,
    minY: AGENT_LAUNCHER_MARGIN,
    maxX: Math.max(AGENT_LAUNCHER_MARGIN, window.innerWidth - width - AGENT_LAUNCHER_MARGIN),
    maxY: Math.max(AGENT_LAUNCHER_MARGIN, window.innerHeight - height - AGENT_LAUNCHER_MARGIN),
  }
}

function getDefaultLauncherPosition(): AgentLauncherPosition {
  const bounds = getLauncherBounds(AGENT_LAUNCHER_FALLBACK_WIDTH, AGENT_LAUNCHER_FALLBACK_HEIGHT)

  return {
    x: bounds.maxX,
    y: bounds.maxY,
  }
}

function loadLauncherPosition(): AgentLauncherPosition {
  if (typeof window === 'undefined') {
    return getDefaultLauncherPosition()
  }

  const rawValue = window.localStorage.getItem(AGENT_LAUNCHER_STORAGE_KEY)
  if (!rawValue) {
    return getDefaultLauncherPosition()
  }

  try {
    const parsed = JSON.parse(rawValue) as { x?: number; y?: number }
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { x: parsed.x, y: parsed.y }
    }
  } catch {
    window.localStorage.removeItem(AGENT_LAUNCHER_STORAGE_KEY)
  }

  return getDefaultLauncherPosition()
}

function loadInitialDiagram() {
  if (FORCE_NEW_DIAGRAM) {
    window.localStorage.removeItem(LOCAL_DRAFT_KEY)
    window.localStorage.removeItem(LOCAL_PERSISTENCE_CACHE_KEY)
    return {
      diagram: createEmptyDiagram(INITIAL_LOCALE ?? 'zh-CN'),
      restored: false,
    }
  }

  // `workflow-tool-draft` is a legacy key from the pre-persistence version.
  // Keep startup deterministic by clearing it and relying on PersistenceService
  // to restore the current local cache instead.
  window.localStorage.removeItem(LOCAL_DRAFT_KEY)
  return { diagram: createEmptyDiagram(INITIAL_LOCALE ?? 'zh-CN'), restored: false }
}

function App() {
  const api = API_CLIENT
  const [editorState, dispatch] = useReducer(editorStateReducer, initialState.diagram, createEditorState)
  const [status, setStatus] = useState(initialState.restored ? getMessages(initialState.diagram.meta.locale).status.draftRestored : '')
  const [capabilities, setCapabilities] = useState(STATIC_CAPABILITIES)
  const [isCreatingRemote, setIsCreatingRemote] = useState(false)
  const [libraryMode, setLibraryMode] = useState<'diagrams' | 'revisions' | null>(null)
  const [diagramItems, setDiagramItems] = useState<DiagramListItem[]>([])
  const [revisionItems, setRevisionItems] = useState<DiagramRevision[]>([])
  const [diagramKeyword, setDiagramKeyword] = useState('')
  const [diagramPage, setDiagramPage] = useState(1)
  const [diagramTotalPages, setDiagramTotalPages] = useState(1)
  const [revisionPage, setRevisionPage] = useState(1)
  const [revisionTotalPages, setRevisionTotalPages] = useState(1)
  const [deletingDiagramId, setDeletingDiagramId] = useState<string | null>(null)
  const [isAgentOpen, setIsAgentOpen] = useState(false)
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null)
  const [agentMessages, setAgentMessages] = useState<WorkflowAgentMessage[]>([])
  const [agentState, setAgentState] = useState<WorkflowAgentState>('collecting_requirements')
  const [agentProposal, setAgentProposal] = useState<WorkflowAgentProposal | null>(null)
  const [agentInput, setAgentInput] = useState('')
  const [isAgentLoading, setIsAgentLoading] = useState(false)
  const [isAgentExecuting, setIsAgentExecuting] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [agentLauncherPosition, setAgentLauncherPosition] = useState<AgentLauncherPosition>(loadLauncherPosition)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const agentLauncherRef = useRef<HTMLButtonElement | null>(null)
  const persistenceRef = useRef<PersistenceService | null>(null)
  const skipNextAutosaveRef = useRef(false)
  const localeRef = useRef(editorState.locale)
  const diagramSearchTimerRef = useRef<number | null>(null)
  const diagramListRequestIdRef = useRef(0)
  const revisionListRequestIdRef = useRef(0)
  const diagramListAbortRef = useRef<AbortController | null>(null)
  const revisionListAbortRef = useRef<AbortController | null>(null)
  const agentSessionAbortRef = useRef<AbortController | null>(null)
  const agentMessageAbortRef = useRef<AbortController | null>(null)
  const agentExecuteAbortRef = useRef<AbortController | null>(null)
  const [isPersistenceReady, setIsPersistenceReady] = useState(false)
  const { diagram, locale, multiSelection, selection } = editorState
  const messages = getMessages(locale)
  const activeThemePresetId = getThemePresetId(diagram.theme)
  const supportsAi = capabilities.supportsAi
  const themeVars = getThemeCssVars(diagram.theme)

  useEffect(() => {
    localeRef.current = locale
  }, [locale])

  useEffect(() => {
    function clampLauncherPosition() {
      const launcher = agentLauncherRef.current
      const width = launcher?.offsetWidth ?? AGENT_LAUNCHER_FALLBACK_WIDTH
      const height = launcher?.offsetHeight ?? AGENT_LAUNCHER_FALLBACK_HEIGHT
      const bounds = getLauncherBounds(width, height)
      const nextPosition = {
        x: clampValue(agentLauncherPosition.x, bounds.minX, bounds.maxX),
        y: clampValue(agentLauncherPosition.y, bounds.minY, bounds.maxY),
      }

      if (nextPosition.x !== agentLauncherPosition.x || nextPosition.y !== agentLauncherPosition.y) {
        setAgentLauncherPosition(nextPosition)
        window.localStorage.setItem(AGENT_LAUNCHER_STORAGE_KEY, JSON.stringify(nextPosition))
      }
    }

    clampLauncherPosition()
    window.addEventListener('resize', clampLauncherPosition)
    return () => {
      window.removeEventListener('resize', clampLauncherPosition)
    }
  }, [agentLauncherPosition.x, agentLauncherPosition.y])

  function handleLocaleChange(nextLocale: Locale) {
    dispatch({ type: 'set-locale', locale: nextLocale })
  }

  function handleSelect(selectionValue: Selection) {
    dispatch({ type: 'select', selection: selectionValue })
  }

  function handleNodeSelect(nodeId: string, append: boolean) {
    dispatch({ type: 'select-node', nodeId, append })
  }

  function handleSetMultiSelection(nodeIds: string[]) {
    dispatch({ type: 'set-multi-selection', nodeIds })
  }

  function handleAddLane() {
    dispatch({ type: 'add-lane' })
  }

  function handleDeleteLane(laneId: string) {
    if (diagram.lanes.length === 1) {
      setStatus(messages.status.laneDeleteBlocked)
      return
    }

    dispatch({ type: 'delete-lane', laneId })
  }

  function handleUpdateLane(laneId: string, updates: { title?: string; subtitle?: string }) {
    dispatch({ type: 'update-lane', laneId, updates })
  }

  function handleAddNode() {
    dispatch({ type: 'add-node' })
  }

  function handleUpdateNode(nodeId: string, updates: { title?: string; description?: string; tag?: string; type?: Node['type'] }) {
    dispatch({ type: 'update-node', nodeId, updates })
  }

  function handleUpdateNodeHeight(nodeId: string, height: number) {
    dispatch({ type: 'update-node-height', nodeId, height })
  }

  function handleDeleteNode(nodeId: string) {
    dispatch({ type: 'delete-node', nodeId })
  }

  function handleUpdateNodePosition(nodeId: string, x: number, y: number, laneId: string) {
    dispatch({ type: 'update-node-position', nodeId, x, y, laneId })
  }

  function handleUpdateNodeWidth(nodeId: string, width: number) {
    dispatch({ type: 'update-node-width', nodeId, width })
  }

  function handleUpdateCanvasTitle(title: string) {
    dispatch({ type: 'update-canvas-title', title })
  }

  function handleUpdateTheme(updates: Partial<Pick<Diagram['theme'], 'name' | 'bgPrimary' | 'textPrimary' | 'textMuted' | 'accent' | 'accentDeep'>>) {
    dispatch({ type: 'update-theme', updates })
  }

  function handleApplyThemePreset(presetId: ThemePresetId) {
    const preset = getThemePresetById(presetId)
    if (!preset) {
      return
    }

    dispatch({ type: 'apply-theme', theme: preset.theme })
  }

  function handleUpdateEdge(edgeId: string, updates: Partial<Edge>) {
    const edge = diagram.edges.find((candidate) => candidate.id === edgeId)
    if (!edge) {
      return
    }

    const nextEdge = { ...edge, ...updates }
    if (nextEdge.fromNodeId === nextEdge.toNodeId) {
      setStatus(messages.status.edgeUpdateInvalid)
      return
    }

    const duplicateExists = diagram.edges.some(
      (candidate) =>
        candidate.id !== edgeId &&
        candidate.fromNodeId === nextEdge.fromNodeId &&
        candidate.toNodeId === nextEdge.toNodeId,
    )

    if (duplicateExists) {
      setStatus(messages.status.edgeUpdateDuplicate)
      return
    }

    dispatch({ type: 'update-edge', edgeId, updates })
    setStatus('')
  }

  function handleDeleteEdge(edgeId: string) {
    dispatch({ type: 'delete-edge', edgeId })
    setStatus(messages.status.edgeDeleted)
  }

  function handleCreateEdge(fromNodeId: string, toNodeId: string) {
    if (!toNodeId) {
      setStatus(messages.status.edgeTargetMissing)
      return
    }

    if (fromNodeId === toNodeId) {
      setStatus(messages.status.edgeSelfBlocked)
      return
    }

    const exists = diagram.edges.some((edge) => edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId)
    if (exists) {
      setStatus(messages.status.edgeExists)
      return
    }

    const nextEdge: Edge = {
      id: createId('edge'),
      fromNodeId,
      toNodeId,
      emphasis: 'theme',
    }

    dispatch({ type: 'add-edge', edge: nextEdge })
    setStatus(messages.status.edgeCreated)
  }

  function handleExportJson() {
    const filename = `${slugifyFileName(diagram.meta.title)}.json`
    downloadTextFile(filename, serializeDiagramJson(diagram), 'application/json;charset=utf-8')
    setStatus(messages.status.jsonExported)
  }

  function handleExportHtml() {
    const filename = `${slugifyFileName(diagram.meta.title)}.html`
    downloadTextFile(filename, generateStandaloneHtml(diagram), 'text/html;charset=utf-8')
    setStatus(messages.status.htmlExported)
  }

  function handleImportJsonClick() {
    importInputRef.current?.click()
  }

  function handleCreateNewDiagram() {
    if (!window.confirm(messages.toolbar.newDiagramConfirm)) {
      return
    }

    if (capabilities.supportsDatabase && REMOTE_DIAGRAM_ID) {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('diagramId')
      nextUrl.searchParams.set('new', '1')
      nextUrl.searchParams.set('locale', locale)
      window.location.assign(nextUrl.toString())
      return
    }

    const nextDiagram = createEmptyDiagram(locale)
    persistenceRef.current?.clearLocalCache()
    persistenceRef.current?.primeLocalCache(nextDiagram)
    window.localStorage.removeItem(LOCAL_DRAFT_KEY)
    skipNextAutosaveRef.current = true
    dispatch({ type: 'replace-diagram', diagram: nextDiagram })
    setLibraryMode(null)
    setStatus(messages.status.newDiagramCreated)
  }

  async function handleCreateRemote() {
    if (REMOTE_DIAGRAM_ID || isCreatingRemote || !capabilities.supportsCreateRemoteDocument || !api) {
      return
    }

    setIsCreatingRemote(true)
    setStatus(messages.status.createRemoteCreating)

    try {
      const created = await api.createDiagram({
        title: diagram.meta.title,
        schemaVersion: SCHEMA_VERSION,
        diagram,
      })

      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('new')
      nextUrl.searchParams.delete('locale')
      nextUrl.searchParams.set('diagramId', created.id)
      window.location.assign(nextUrl.toString())
    } catch {
      setStatus(messages.status.createRemoteFailed)
      setIsCreatingRemote(false)
    }
  }

  async function loadDiagramList(page = 1, keyword = diagramKeyword) {
    if (!api) {
      return
    }

    diagramListAbortRef.current?.abort()
    const controller = new AbortController()
    diagramListAbortRef.current = controller
    const requestId = ++diagramListRequestIdRef.current

    try {
      const response = await api.listDiagrams({
        page,
        pageSize: 8,
        keyword: keyword.trim() || undefined,
      }, controller.signal)

      if (requestId !== diagramListRequestIdRef.current) {
        return
      }

      setDiagramItems(response.items)
      setDiagramPage(response.page)
      setDiagramTotalPages(Math.max(1, Math.ceil(response.total / response.pageSize)))
      setStatus(messages.status.diagramsLoaded)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setStatus(messages.status.diagramsLoadFailed)
    } finally {
      if (diagramListAbortRef.current === controller) {
        diagramListAbortRef.current = null
      }
    }
  }

  async function handleOpenDiagramList() {
    setLibraryMode('diagrams')
    await loadDiagramList(1)
  }

  const handleDiagramSearch = useEffectEvent((keyword: string) => {
    void loadDiagramList(1, keyword)
  })

  async function loadRevisionHistory(page = 1) {
    if (!REMOTE_DIAGRAM_ID || !api) {
      return
    }

    revisionListAbortRef.current?.abort()
    const controller = new AbortController()
    revisionListAbortRef.current = controller
    const requestId = ++revisionListRequestIdRef.current

    try {
      const response = await api.listRevisions(REMOTE_DIAGRAM_ID, { page, pageSize: 8 }, controller.signal)
      if (requestId !== revisionListRequestIdRef.current) {
        return
      }

      setRevisionItems(response.items)
      setRevisionPage(response.page)
      setRevisionTotalPages(Math.max(1, Math.ceil(response.total / response.pageSize)))
      setStatus(messages.status.revisionsLoaded)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setStatus(messages.status.revisionsLoadFailed)
    } finally {
      if (revisionListAbortRef.current === controller) {
        revisionListAbortRef.current = null
      }
    }
  }

  async function handleOpenRevisionHistory() {
    setLibraryMode('revisions')
    await loadRevisionHistory(1)
  }

  async function handleSaveRevision() {
    if (!REMOTE_DIAGRAM_ID || !persistenceRef.current || !capabilities.supportsRevisionHistory) {
      return
    }

    const changeSummary = new Date().toLocaleString()

    try {
      await persistenceRef.current.saveRevision({
        diagram,
        changeSummary,
      })
      setStatus(messages.status.revisionSaved)

      if (libraryMode === 'revisions') {
        await loadRevisionHistory(revisionPage)
      }
    } catch {
      setStatus(messages.status.revisionSaveFailed)
    }
  }

  function handleOpenDiagram(diagramId: string) {
    if (diagramId === REMOTE_DIAGRAM_ID) {
      setLibraryMode(null)
      return
    }

    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set('diagramId', diagramId)
    window.location.assign(nextUrl.toString())
  }

  async function handleDeleteDiagram(item: DiagramListItem) {
    if (!api) {
      return
    }

    const confirmMessage = messages.library.deleteDiagramConfirm.replace('{title}', item.title)
    if (!window.confirm(confirmMessage)) {
      return
    }

    setDeletingDiagramId(item.id)

    try {
      await api.deleteDiagram(item.id)

      if (item.id === REMOTE_DIAGRAM_ID) {
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.delete('diagramId')
        nextUrl.searchParams.set('new', '1')
        nextUrl.searchParams.set('locale', locale)
        window.location.assign(nextUrl.toString())
        return
      }

      const nextPage = diagramItems.length === 1 && diagramPage > 1 ? diagramPage - 1 : diagramPage
      await loadDiagramList(nextPage)
      setStatus(messages.status.diagramDeleted)
    } catch {
      setStatus(messages.status.diagramDeleteFailed)
    } finally {
      setDeletingDiagramId((current) => (current === item.id ? null : current))
    }
  }

  async function handleRestoreRevision(revisionId: string) {
    if (!persistenceRef.current) {
      return
    }

    if (!window.confirm(messages.library.restoreRevisionConfirm)) {
      return
    }

    try {
      const response = await persistenceRef.current.restoreRevision(revisionId)
      skipNextAutosaveRef.current = true
      dispatch({ type: 'replace-diagram', diagram: response.diagram })
      setStatus(messages.status.revisionRestored)

      if (REMOTE_DIAGRAM_ID) {
        await loadRevisionHistory(revisionPage)
      }
    } catch {
      setStatus(messages.status.revisionRestoreFailed)
    }
  }

  useEffect(() => {
    if (!FORCE_NEW_DIAGRAM) {
      return
    }

    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('new')
    nextUrl.searchParams.delete('locale')
    window.history.replaceState(null, '', nextUrl.toString())
  }, [])

  useEffect(() => {
    if (libraryMode !== 'diagrams') {
      return
    }

    if (diagramSearchTimerRef.current !== null) {
      window.clearTimeout(diagramSearchTimerRef.current)
    }

    diagramSearchTimerRef.current = window.setTimeout(() => {
      handleDiagramSearch(diagramKeyword)
    }, 250)

    return () => {
      if (diagramSearchTimerRef.current !== null) {
        window.clearTimeout(diagramSearchTimerRef.current)
        diagramSearchTimerRef.current = null
      }
    }
  }, [diagramKeyword, libraryMode])

  useEffect(() => {
    if (libraryMode) {
      return
    }

    diagramListAbortRef.current?.abort()
    revisionListAbortRef.current?.abort()
    diagramListRequestIdRef.current += 1
    revisionListRequestIdRef.current += 1
  }, [libraryMode])

  function handleClearDraft() {
    persistenceRef.current?.clearLocalCache()
    window.localStorage.removeItem(LOCAL_DRAFT_KEY)
    setStatus(messages.status.draftCleared)
  }

  async function ensureAgentSession() {
    if (!api) {
      throw new Error('AI workflow agent requires api access.')
    }

    if (agentSessionId) {
      return agentSessionId
    }

    agentSessionAbortRef.current?.abort()
    const controller = new AbortController()
    agentSessionAbortRef.current = controller

      const response = await api.createWorkflowSession({
      locale,
      themePresetId: activeThemePresetId ?? 'violet',
      theme: diagram.theme,
      currentDiagram: diagram,
    }, controller.signal)

    setAgentSessionId(response.sessionId)
    setAgentState(response.state)
    setAgentProposal(null)
    setAgentMessages((current) => (
      current.length > 0
        ? current
        : [createAgentUiMessage('assistant', response.welcomeMessage)]
    ))
    setAgentError('')
    return response.sessionId
  }

  async function handleOpenAgent() {
    setIsAgentOpen(true)

    if (agentSessionId || !api) {
      return
    }

    setIsAgentLoading(true)
    try {
      await ensureAgentSession()
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentSessionCreateFailed)
      setAgentError(errorMessage)
      setAgentMessages((current) => [...current, createAgentUiMessage('assistant', errorMessage)])
      setStatus(errorMessage)
    } finally {
      setIsAgentLoading(false)
    }
  }

  function handleCloseAgent() {
    setIsAgentOpen(false)
  }

  function handleAgentLauncherMouseDown(event: import('react').MouseEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return
    }

    const launcher = event.currentTarget
    agentLauncherRef.current = launcher
    const rect = launcher.getBoundingClientRect()
    const pointerOffsetX = event.clientX - rect.left
    const pointerOffsetY = event.clientY - rect.top
    let dragged = false

    function handleMouseMove(moveEvent: MouseEvent) {
      const bounds = getLauncherBounds(rect.width, rect.height)
      const nextPosition = {
        x: clampValue(moveEvent.clientX - pointerOffsetX, bounds.minX, bounds.maxX),
        y: clampValue(moveEvent.clientY - pointerOffsetY, bounds.minY, bounds.maxY),
      }

      if (!dragged && (Math.abs(moveEvent.clientX - event.clientX) > 4 || Math.abs(moveEvent.clientY - event.clientY) > 4)) {
        dragged = true
      }

      setAgentLauncherPosition(nextPosition)
      window.localStorage.setItem(AGENT_LAUNCHER_STORAGE_KEY, JSON.stringify(nextPosition))
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      if (dragged) {
        window.setTimeout(() => {
          launcher.dataset.dragging = 'false'
        }, 0)
        return
      }

      launcher.dataset.dragging = 'false'
    }

    launcher.dataset.dragging = 'true'
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleAgentLauncherClick() {
    if (agentLauncherRef.current?.dataset.dragging === 'true') {
      return
    }

    void handleOpenAgent()
  }

  async function handleExecuteAgentProposal() {
    if (!api || !agentSessionId || !agentProposal || isAgentExecuting) {
      return
    }

    setIsAgentExecuting(true)
    setAgentError('')

    try {
      agentExecuteAbortRef.current?.abort()
      const controller = new AbortController()
      agentExecuteAbortRef.current = controller
      const response = await api.executeWorkflowSession(agentSessionId, {
        confirmed: true,
        proposalVersion: agentProposal.version,
        currentDiagram: diagram,
      }, controller.signal)

      if (REMOTE_DIAGRAM_ID && persistenceRef.current) {
        await persistenceRef.current.importDiagram({ diagram: response.diagram })
        if (libraryMode === 'revisions') {
          await loadRevisionHistory(revisionPage)
        }
        setStatus(messages.status.agentExecutedRemote)
      } else {
        persistenceRef.current?.primeLocalCache(response.diagram)
        setStatus(messages.status.agentExecutedLocal)
      }

      skipNextAutosaveRef.current = true
      dispatch({ type: 'replace-diagram', diagram: response.diagram })
      setAgentState('completed')
      setAgentMessages((current) => {
        const nextMessages = [
          ...current,
          createAgentUiMessage('assistant', response.summary),
        ]

        if (response.warnings.length > 0) {
          nextMessages.push(createAgentUiMessage('assistant', response.warnings.join('\n')))
        }

        return nextMessages
      })
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentExecuteFailed)
      setAgentState('error')
      setAgentError(errorMessage)
      setAgentMessages((current) => [...current, createAgentUiMessage('assistant', errorMessage)])
      setStatus(errorMessage)
    } finally {
      setIsAgentExecuting(false)
    }
  }

  async function handleSendAgentMessage() {
    if (!api) {
      setAgentError(messages.status.agentSessionCreateFailed)
      return
    }

    const message = agentInput.trim()
    if (!message || isAgentLoading || isAgentExecuting) {
      return
    }

    if (agentState === 'awaiting_execution_confirmation' && isExecuteShortcut(message, locale)) {
      setAgentInput('')
      await handleExecuteAgentProposal()
      return
    }

    setIsAgentLoading(true)
    setAgentError('')
    setAgentInput('')

    try {
      const sessionId = await ensureAgentSession()
      agentMessageAbortRef.current?.abort()
      const controller = new AbortController()
      agentMessageAbortRef.current = controller
      setAgentMessages((current) => [...current, createAgentUiMessage('user', message)])
      const response = await api.sendWorkflowMessage(sessionId, {
        message,
        history: sliceRecentAgentTurns(agentMessages, AGENT_HISTORY_MAX_TURNS - 1),
        currentDiagram: diagram,
      }, controller.signal)

      setAgentMessages((current) => [...current, response.reply])
      setAgentState(response.state)
      setAgentProposal(response.proposal ?? null)
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentSendFailed)
      setAgentState('error')
      setAgentError(errorMessage)
      setAgentMessages((current) => [...current, createAgentUiMessage('assistant', errorMessage)])
      setStatus(errorMessage)
    } finally {
      setIsAgentLoading(false)
    }
  }

  async function handleImportJsonChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const importedDiagram = parseDiagramJson(await file.text())
      if (REMOTE_DIAGRAM_ID && persistenceRef.current) {
        await persistenceRef.current.importDiagram({ diagram: importedDiagram })
      }

      skipNextAutosaveRef.current = true
      dispatch({ type: 'replace-diagram', diagram: importedDiagram })
      setStatus(messages.status.jsonImported)

      if (REMOTE_DIAGRAM_ID && libraryMode === 'revisions') {
        await loadRevisionHistory(revisionPage)
      }
    } catch {
      setStatus(messages.status.jsonImportFailed)
    } finally {
      event.target.value = ''
    }
  }

  useEffect(() => {
    if (!api) {
      return
    }

    const controller = new AbortController()

    void api.getHealth(controller.signal).then((health) => {
      setCapabilities((current) => ({
        ...current,
        supportsAi: health.capabilities.supportsAi,
      }))
    }).catch(() => {
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
    const persistence = createPersistenceService({
      api: STATIC_CAPABILITIES.supportsDatabase && REMOTE_DIAGRAM_ID && API_BASE_URL
        ? createDiagramApiClient({ baseUrl: API_BASE_URL })
        : null,
      diagramId: REMOTE_DIAGRAM_ID ?? LOCAL_DIAGRAM_ID,
      schemaVersion: SCHEMA_VERSION,
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
        dispatch({ type: 'replace-diagram', diagram: result.document.diagram })
        window.localStorage.removeItem(LOCAL_DRAFT_KEY)
      } else if (result.source === 'local-cache') {
        dispatch({ type: 'replace-diagram', diagram: result.diagram })
        setStatus(getMessages(result.diagram.meta.locale).status.draftRestored)
        window.localStorage.removeItem(LOCAL_DRAFT_KEY)
      } else if (result.source === 'remote-error') {
        dispatch({ type: 'replace-diagram', diagram: result.diagram })

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
      } else if (initialState.restored) {
        persistence.primeLocalCache(initialState.diagram)
        window.localStorage.removeItem(LOCAL_DRAFT_KEY)
        setIsPersistenceReady(true)
        return
      }

      setIsPersistenceReady(result.source !== 'remote-error')
    })

    return () => {
      cancelled = true
      diagramListAbortRef.current?.abort()
      revisionListAbortRef.current?.abort()
      agentSessionAbortRef.current?.abort()
      agentMessageAbortRef.current?.abort()
      agentExecuteAbortRef.current?.abort()
      persistence.dispose()
      persistenceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isPersistenceReady) {
      return
    }

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      return
    }

    persistenceRef.current?.scheduleAutosave({ diagram })
  }, [diagram, isPersistenceReady])

  useEffect(() => {
    function handleDeleteKey(event: KeyboardEvent) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }

      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return
      }

      event.preventDefault()
      if (selection.kind === 'edge') {
        dispatch({ type: 'delete-edge', edgeId: selection.id })
        setStatus(messages.status.edgeDeleted)
        return
      }

      if (multiSelection.nodeIds.length > 0) {
        dispatch({ type: 'delete-selected-nodes', nodeIds: multiSelection.nodeIds })
        setStatus(messages.status.nodesDeleted)
      }
    }

    window.addEventListener('keydown', handleDeleteKey)
    return () => {
      window.removeEventListener('keydown', handleDeleteKey)
    }
  }, [messages.status.edgeDeleted, messages.status.nodesDeleted, multiSelection.nodeIds, selection])

  return (
    <div className="app-shell" style={themeVars}>
      <input ref={importInputRef} type="file" accept="application/json,.json" className="app-hidden-input" onChange={handleImportJsonChange} />
      <Toolbar
        messages={messages}
        locale={locale}
        showCreateRemote={capabilities.supportsCreateRemoteDocument && !REMOTE_DIAGRAM_ID}
        showDiagramList={capabilities.supportsDiagramLibrary}
        showRevisionActions={capabilities.supportsRevisionHistory && Boolean(REMOTE_DIAGRAM_ID && isPersistenceReady)}
        isCreatingRemote={isCreatingRemote}
        onCreateNewDiagram={handleCreateNewDiagram}
        onLocaleChange={handleLocaleChange}
        onCreateRemote={handleCreateRemote}
        onOpenDiagramList={handleOpenDiagramList}
        onOpenRevisionHistory={handleOpenRevisionHistory}
        onSaveRevision={handleSaveRevision}
        onImportJson={handleImportJsonClick}
        onExportJson={handleExportJson}
        onExportHtml={handleExportHtml}
        onClearDraft={handleClearDraft}
      />
      {status ? <p className="app-status">{status}</p> : null}
      <main className="editor-grid">
        <Sidebar
          diagram={diagram}
          messages={messages}
          selection={selection}
          onSelect={handleSelect}
          onAddLane={handleAddLane}
          onAddNode={handleAddNode}
        />
        <Canvas
          diagram={diagram}
          selection={selection}
          multiSelection={multiSelection}
          messages={messages}
          onSelect={handleSelect}
          onNodeSelect={handleNodeSelect}
          onSetMultiSelection={handleSetMultiSelection}
          onUpdateNodePosition={handleUpdateNodePosition}
          onUpdateNodeWidth={handleUpdateNodeWidth}
          onUpdateNodeHeight={handleUpdateNodeHeight}
          onUpdateNodeContent={handleUpdateNode}
          onCreateEdge={handleCreateEdge}
          onStatusChange={setStatus}
          onDeleteNode={handleDeleteNode}
          onDeleteEdge={handleDeleteEdge}
        />
        <Inspector
          diagram={diagram}
          selection={selection}
          messages={messages}
          onUpdateCanvasTitle={handleUpdateCanvasTitle}
          onUpdateLane={handleUpdateLane}
          onDeleteLane={handleDeleteLane}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onUpdateEdge={handleUpdateEdge}
          onDeleteEdge={handleDeleteEdge}
          onCreateEdge={handleCreateEdge}
          onUpdateTheme={handleUpdateTheme}
          onApplyThemePreset={handleApplyThemePreset}
          activeThemePresetId={activeThemePresetId}
        />
      </main>
      <DiagramLibrary
        messages={messages}
        mode={libraryMode}
        currentDiagramId={REMOTE_DIAGRAM_ID}
        diagrams={diagramItems}
        revisions={revisionItems}
        diagramKeyword={diagramKeyword}
        diagramPage={diagramPage}
        diagramTotalPages={diagramTotalPages}
        revisionPage={revisionPage}
        revisionTotalPages={revisionTotalPages}
        deletingDiagramId={deletingDiagramId}
        onClose={() => setLibraryMode(null)}
        onDiagramKeywordChange={setDiagramKeyword}
        onDiagramPageChange={(page) => void loadDiagramList(page)}
        onRevisionPageChange={(page) => void loadRevisionHistory(page)}
        onOpenDiagram={handleOpenDiagram}
        onDeleteDiagram={(diagramItem) => void handleDeleteDiagram(diagramItem)}
        onRestoreRevision={handleRestoreRevision}
      />
      {api && supportsAi ? (
        <>
          <WorkflowAgentLauncher
            label={messages.agent.launcher}
            isOpen={isAgentOpen}
            position={agentLauncherPosition}
            onClick={handleAgentLauncherClick}
            onMouseDown={handleAgentLauncherMouseDown}
          />
          <WorkflowAgentWindow
            messages={messages}
            isOpen={isAgentOpen}
            sessionReady={Boolean(agentSessionId)}
            agentMessages={agentMessages}
            agentInput={agentInput}
            agentState={agentState}
            agentProposal={agentProposal}
            isAgentLoading={isAgentLoading}
            isAgentExecuting={isAgentExecuting}
            agentError={agentError}
            onClose={handleCloseAgent}
            onInputChange={setAgentInput}
            onSend={() => void handleSendAgentMessage()}
            onExecute={() => void handleExecuteAgentProposal()}
            onBackdropClick={handleCloseAgent}
          />
        </>
      ) : null}
    </div>
  )
}

export default App
