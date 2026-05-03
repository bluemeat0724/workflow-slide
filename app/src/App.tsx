import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react'
import { createDiagramApiClient } from './api/client'
import type { DiagramListItem, DiagramRevision } from './api/contracts'
import { Canvas } from './components/canvas/Canvas'
import { Inspector } from './components/inspector/Inspector'
import { RemoteLibrary } from './components/library/RemoteLibrary'
import { Sidebar } from './components/sidebar/Sidebar'
import { Toolbar } from './components/toolbar/Toolbar'
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

const LOCAL_DRAFT_KEY = 'workflow-tool-draft'
const LOCAL_DIAGRAM_ID = 'local-default'
const LOCAL_PERSISTENCE_CACHE_KEY = `workflow-tool-diagram:${LOCAL_DIAGRAM_ID}`
const SCHEMA_VERSION = '1.0'
const SEARCH_PARAMS = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
const REMOTE_DIAGRAM_ID = SEARCH_PARAMS.get('diagramId')?.trim() || null
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

  // `workflow-tool-draft` is a legacy key from the pre-persistence version.
  // Keep startup deterministic by clearing it and relying on PersistenceService
  // to restore the current local cache instead.
  window.localStorage.removeItem(LOCAL_DRAFT_KEY)
  return { diagram: createEmptyDiagram(INITIAL_LOCALE ?? 'zh-CN'), restored: false }
}

function App() {
  const api = createDiagramApiClient()
  const [editorState, dispatch] = useReducer(editorStateReducer, initialState.diagram, createEditorState)
  const [status, setStatus] = useState(initialState.restored ? getMessages(initialState.diagram.meta.locale).status.draftRestored : '')
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
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const persistenceRef = useRef<PersistenceService | null>(null)
  const skipNextAutosaveRef = useRef(false)
  const localeRef = useRef(editorState.locale)
  const diagramSearchTimerRef = useRef<number | null>(null)
  const diagramListRequestIdRef = useRef(0)
  const revisionListRequestIdRef = useRef(0)
  const diagramListAbortRef = useRef<AbortController | null>(null)
  const revisionListAbortRef = useRef<AbortController | null>(null)
  const [isPersistenceReady, setIsPersistenceReady] = useState(false)
  const { diagram, locale, multiSelection, selection } = editorState
  const messages = getMessages(locale)
  const activeThemePresetId = getThemePresetId(diagram.theme)

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

    if (REMOTE_DIAGRAM_ID) {
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
    if (REMOTE_DIAGRAM_ID || isCreatingRemote) {
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
    if (!REMOTE_DIAGRAM_ID) {
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
    if (!REMOTE_DIAGRAM_ID || !persistenceRef.current) {
      return
    }

    const changeSummary = window.prompt(messages.library.saveRevisionPrompt, messages.library.saveRevisionPlaceholder)
    if (changeSummary === null) {
      return
    }

    try {
      await persistenceRef.current.saveRevision({
        diagram,
        changeSummary: changeSummary.trim() || undefined,
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
    const persistence = createPersistenceService({
      api: REMOTE_DIAGRAM_ID ? createDiagramApiClient() : null,
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
    <div className="app-shell">
      <input ref={importInputRef} type="file" accept="application/json,.json" className="app-hidden-input" onChange={handleImportJsonChange} />
      <Toolbar
        messages={messages}
        locale={locale}
        showCreateRemote={!REMOTE_DIAGRAM_ID}
        showDiagramList
        showRevisionActions={Boolean(REMOTE_DIAGRAM_ID && isPersistenceReady)}
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
      <RemoteLibrary
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
    </div>
  )
}

export default App
