import { useEffect, useReducer, useRef, useState } from 'react'
import type { DiagramListItem } from './api/contracts'
import { WorkflowAgentLauncher } from './components/agent/WorkflowAgentLauncher'
import { WorkflowAgentWindow } from './components/agent/WorkflowAgentWindow'
import { Canvas } from './components/canvas/Canvas'
import { Inspector } from './components/inspector/Inspector'
import { DiagramLibrary } from './components/library/DiagramLibrary'
import { Sidebar } from './components/sidebar/Sidebar'
import { Toolbar } from './components/toolbar/Toolbar'
import { createEmptyDiagram } from './data/createEmptyDiagram'
import { getThemePresetId } from './data/themePresets'
import { createEditorState, editorStateReducer } from './editor/editorState'
import { useAppBootstrap, REMOTE_DIAGRAM_ID, API_CLIENT, API_BASE_URL, SCHEMA_VERSION, LOCAL_DIAGRAM_ID, LOCAL_DRAFT_KEY } from './hooks/useAppBootstrap'
import { useDiagramCommands } from './hooks/useDiagramCommands'
import { useDiagramLibrary } from './hooks/useDiagramLibrary'
import { useGlobalEditorShortcuts } from './hooks/useGlobalEditorShortcuts'
import { useImportExport } from './hooks/useImportExport'
import { usePersistenceController } from './hooks/usePersistenceController'
import { useWorkflowAgent } from './hooks/useWorkflowAgent'
import { getMessages } from './i18n'
import type { Diagram } from './model/diagram'
import { getThemeCssVars } from './utils/theme'

function App() {
  const api = API_CLIENT
  const { initialDiagram, isRestored, capabilities } = useAppBootstrap()
  const [editorState, dispatch] = useReducer(editorStateReducer, initialDiagram, createEditorState)
  const [status, setStatus] = useState(isRestored ? getMessages(initialDiagram.meta.locale).status.draftRestored : '')
  const [isCreatingRemote, setIsCreatingRemote] = useState(false)
  const localeRef = useRef(editorState.locale)
  const { diagram, locale, multiSelection, selection } = editorState
  const messages = getMessages(locale)
  const activeThemePresetId = getThemePresetId(diagram.theme)
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

  const diagramCommands = useDiagramCommands({ dispatch, diagram, setStatus, messages })

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

  const { isPersistenceReady, persistenceRef, skipNextAutosaveRef } = usePersistenceController({
    api,
    apiBaseUrl: API_BASE_URL,
    remoteDiagramId: REMOTE_DIAGRAM_ID,
    localDiagramId: LOCAL_DIAGRAM_ID,
    schemaVersion: SCHEMA_VERSION,
    supportsDatabase: capabilities.supportsDatabase,
    isRestored,
    initialDiagram,
    localeRef,
    setStatus,
    disposeAgent,
    onLoadResult: (loadedDiagram) => {
      dispatch({ type: 'replace-diagram', diagram: loadedDiagram })
    },
  })

  const handleImportToRemote = async (importedDiagram: Diagram) => {
    if (REMOTE_DIAGRAM_ID && persistenceRef.current) {
      await persistenceRef.current.importDiagram({ diagram: importedDiagram })
    }
    skipNextAutosaveRef.current = true
    dispatch({ type: 'replace-diagram', diagram: importedDiagram })
  }

  const handleRefreshAfterImport = async () => {
    if (REMOTE_DIAGRAM_ID && libraryMode === 'revisions') {
      await loadRevisionHistory(revisionPage)
    }
  }

  const {
    importInputRef,
    isExportingGif,
    handleExportJson,
    handleExportHtml,
    handleExportGif,
    handleImportJsonClick,
    handleImportJsonChange,
  } = useImportExport({
    api,
    diagram,
    messages,
    setStatus,
    onImportDiagram: handleImportToRemote,
    onRefreshAfterImport: handleRefreshAfterImport,
  })

  useGlobalEditorShortcuts({ dispatch, selection, multiSelection, messages, setStatus })

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
        onLocaleChange={diagramCommands.handleLocaleChange}
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
          onSelect={diagramCommands.handleSelect}
          onAddLane={diagramCommands.handleAddLane}
          onAddNode={diagramCommands.handleAddNode}
        />
        <Canvas
          diagram={diagram}
          selection={selection}
          multiSelection={multiSelection}
          messages={messages}
          onSelect={diagramCommands.handleSelect}
          onNodeSelect={diagramCommands.handleNodeSelect}
          onSetMultiSelection={diagramCommands.handleSetMultiSelection}
          onUpdateNodePosition={diagramCommands.handleUpdateNodePosition}
          onUpdateNodeWidth={diagramCommands.handleUpdateNodeWidth}
          onUpdateNodeHeight={diagramCommands.handleUpdateNodeHeight}
          onUpdateNodeContent={diagramCommands.handleUpdateNode}
          onCreateEdge={diagramCommands.handleCreateEdge}
          onStatusChange={setStatus}
          onDeleteNode={diagramCommands.handleDeleteNode}
          onDeleteEdge={diagramCommands.handleDeleteEdge}
        />
        <Inspector
          diagram={diagram}
          selection={selection}
          messages={messages}
          onUpdateCanvasTitle={diagramCommands.handleUpdateCanvasTitle}
          onUpdateEdgeAnimationMode={diagramCommands.handleUpdateEdgeAnimationMode}
          onUpdateLane={diagramCommands.handleUpdateLane}
          onDeleteLane={diagramCommands.handleDeleteLane}
          onUpdateNode={diagramCommands.handleUpdateNode}
          onDeleteNode={diagramCommands.handleDeleteNode}
          onUpdateEdge={diagramCommands.handleUpdateEdge}
          onDeleteEdge={diagramCommands.handleDeleteEdge}
          onCreateEdge={diagramCommands.handleCreateEdge}
          onUpdateTheme={diagramCommands.handleUpdateTheme}
          onApplyThemePreset={diagramCommands.handleApplyThemePreset}
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
      {api && capabilities.supportsAi ? (
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
