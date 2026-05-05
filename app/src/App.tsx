import { useEffect, useReducer, useRef, useState } from 'react'
import { createDiagramApiClient } from './api/client'
import type { DiagramListItem } from './api/contracts'
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
import { useDiagramLibrary } from './hooks/useDiagramLibrary'
import { useWorkflowAgent } from './hooks/useWorkflowAgent'
import { getMessages } from './i18n'
import type { Diagram, Edge, EdgeAnimationMode, Locale, Node, Selection } from './model/diagram'
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

function loadInitialDiagram() {
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

function App() {
  const api = API_CLIENT
  const [editorState, dispatch] = useReducer(editorStateReducer, initialState.diagram, createEditorState)
  const [status, setStatus] = useState(initialState.restored ? getMessages(initialState.diagram.meta.locale).status.draftRestored : '')
  const [capabilities, setCapabilities] = useState(STATIC_CAPABILITIES)
  const [isCreatingRemote, setIsCreatingRemote] = useState(false)
  const [isExportingGif, setIsExportingGif] = useState(false)
  const [isPersistenceReady, setIsPersistenceReady] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const persistenceRef = useRef<PersistenceService | null>(null)
  const skipNextAutosaveRef = useRef(false)
  const localeRef = useRef(editorState.locale)
  const { diagram, locale, multiSelection, selection } = editorState
  const messages = getMessages(locale)
  const activeThemePresetId = getThemePresetId(diagram.theme)
  const supportsAi = capabilities.supportsAi
  const themeVars = getThemeCssVars(diagram.theme)

  const {
    libraryMode,
    diagramItems,
    revisionItems,
    diagramKeyword,
    diagramPage,
    diagramTotalPages,
    revisionPage,
    revisionTotalPages,
    deletingDiagramId,
    setLibraryMode,
    handleDiagramSearch,
    handleDiagramPageChange,
    handleRevisionPageChange,
    handleOpenDiagramList,
    handleOpenRevisionHistory,
    handleDeleteDiagram,
    loadRevisionHistory,
  } = useDiagramLibrary({
    api,
    remoteDiagramId: REMOTE_DIAGRAM_ID,
    messages,
    setStatus,
  })

  const handleDiagramApplied = async (appliedDiagram: Diagram) => {
    skipNextAutosaveRef.current = true

    if (REMOTE_DIAGRAM_ID && persistenceRef.current) {
      await persistenceRef.current.importDiagram({ diagram: appliedDiagram })
      if (libraryMode === 'revisions') {
        await loadRevisionHistory(revisionPage)
      }
      setStatus(messages.status.agentExecutedRemote)
    } else {
      persistenceRef.current?.primeLocalCache(appliedDiagram)
      setStatus(messages.status.agentExecutedLocal)
    }

    dispatch({ type: 'replace-diagram', diagram: appliedDiagram })
  }

  const {
    isAgentOpen,
    agentSessionId,
    agentMessages,
    agentState,
    agentProposal,
    agentInput,
    isAgentLoading,
    isAgentExecuting,
    agentError,
    agentLauncherPosition,
    setAgentInput,
    handleCloseAgent,
    handleAgentLauncherMouseDown,
    handleAgentLauncherClick,
    handleSendAgentMessage,
    handleExecuteAgentProposal,
    dispose: disposeAgent,
  } = useWorkflowAgent({
    api,
    diagram,
    locale,
    activeThemePresetId: activeThemePresetId ?? 'violet',
    messages,
    setStatus,
    onDiagramApplied: handleDiagramApplied,
  })

  useEffect(() => {
    localeRef.current = locale
  }, [locale])

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

  function handleUpdateEdgeAnimationMode(mode: EdgeAnimationMode) {
    dispatch({ type: 'update-edge-animation-mode', mode })
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

  async function handleExportGif() {
    if (!api || isExportingGif) return

    setIsExportingGif(true)
    setStatus(messages.status.persistenceSaving)

    try {
      const blob = await api.exportGif({ diagram })
      const filename = `${slugifyFileName(diagram.meta.title)}.gif`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      setStatus(messages.status.gifExported)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : messages.status.gifExportFailed)
    } finally {
      setIsExportingGif(false)
    }
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

  async function handleDeleteDiagramWrapper(item: DiagramListItem) {
    await handleDeleteDiagram(item, (deletedId) => {
      if (deletedId === REMOTE_DIAGRAM_ID) {
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.delete('diagramId')
        nextUrl.searchParams.set('new', '1')
        nextUrl.searchParams.set('locale', locale)
        window.location.assign(nextUrl.toString())
      }
    })
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

  async function handleClearDraft() {
    const result = await persistenceRef.current?.clearDraft() ?? {
      source: 'empty' as const,
      diagram: createEmptyDiagram(locale),
    }
    const nextDiagram = result.source === 'server' ? result.document.diagram : result.diagram

    window.localStorage.removeItem(LOCAL_DRAFT_KEY)
    skipNextAutosaveRef.current = true
    dispatch({ type: 'replace-diagram', diagram: nextDiagram })
    setLibraryMode(null)
    setStatus(messages.status.draftCleared)
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

  const healthFetchedRef = useRef(false)

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
      disposeAgent()
      persistence.dispose()
      persistenceRef.current = null
    }
  }, [disposeAgent])

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
        showExportGif={Boolean(api)}
        isCreatingRemote={isCreatingRemote}
        isExportingGif={isExportingGif}
        onCreateNewDiagram={handleCreateNewDiagram}
        onLocaleChange={handleLocaleChange}
        onCreateRemote={handleCreateRemote}
        onOpenDiagramList={handleOpenDiagramList}
        onOpenRevisionHistory={handleOpenRevisionHistory}
        onSaveRevision={handleSaveRevision}
        onImportJson={handleImportJsonClick}
        onExportJson={handleExportJson}
        onExportHtml={handleExportHtml}
        onExportGif={handleExportGif}
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
          onUpdateEdgeAnimationMode={handleUpdateEdgeAnimationMode}
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
        onDiagramKeywordChange={handleDiagramSearch}
        onDiagramPageChange={handleDiagramPageChange}
        onRevisionPageChange={handleRevisionPageChange}
        onOpenDiagram={handleOpenDiagram}
        onDeleteDiagram={(diagramItem) => void handleDeleteDiagramWrapper(diagramItem)}
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
