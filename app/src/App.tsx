import { useEffect, useRef, useState } from 'react'
import { Canvas } from './components/canvas/Canvas'
import { Inspector } from './components/inspector/Inspector'
import { Sidebar } from './components/sidebar/Sidebar'
import { Toolbar } from './components/toolbar/Toolbar'
import { defaultDiagram } from './data/defaultDiagram'
import { getThemePresetById, getThemePresetId, type ThemePresetId } from './data/themePresets'
import { getMessages } from './i18n'
import type { Diagram, Edge, Lane, Locale, MultiSelection, Node, Selection } from './model/diagram'
import { downloadTextFile, slugifyFileName } from './utils/download'
import { generateStandaloneHtml } from './utils/exportHtml'
import { createId } from './utils/ids'
import { parseDiagramJson, serializeDiagramJson } from './utils/json'
import { NODE_MIN_HEIGHT, constrainNodeToLane, getLaneBounds } from './utils/geometry'
import { rebuildTheme } from './utils/theme'

const LOCAL_DRAFT_KEY = 'workflow-tool-draft'
const initialState = loadInitialDiagram()

function loadInitialDiagram() {
  const draft = window.localStorage.getItem(LOCAL_DRAFT_KEY)
  if (!draft) {
    return { diagram: defaultDiagram, restored: false }
  }

  try {
    const parsed = parseDiagramJson(draft)
    return { diagram: parsed, restored: true }
  } catch {
    window.localStorage.removeItem(LOCAL_DRAFT_KEY)
    return { diagram: defaultDiagram, restored: false }
  }
}

function App() {
  const [diagram, setDiagram] = useState<Diagram>(initialState.diagram)
  const [locale, setLocale] = useState<Locale>(initialState.diagram.meta.locale)
  const [selection, setSelection] = useState<Selection>({ kind: 'canvas' })
  const [multiSelection, setMultiSelection] = useState<MultiSelection>({ nodeIds: [] })
  const [status, setStatus] = useState(initialState.restored ? getMessages(initialState.diagram.meta.locale).status.draftRestored : '')
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const messages = getMessages(locale)
  const activeThemePresetId = getThemePresetId(diagram.theme)

  function updateLanes(updater: (lanes: Lane[]) => Lane[]) {
    setDiagram((current) => ({ ...current, lanes: updater(current.lanes) }))
  }

  function updateNodes(updater: (nodes: Node[]) => Node[]) {
    setDiagram((current) => ({ ...current, nodes: updater(current.nodes) }))
  }

  function updateEdges(updater: (edges: Edge[]) => Edge[]) {
    setDiagram((current) => ({ ...current, edges: updater(current.edges) }))
  }

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale)
    setDiagram((current) => ({
      ...current,
      meta: {
        ...current.meta,
        locale: nextLocale,
      },
    }))
  }

  function handleSelect(selectionValue: Selection) {
    setSelection(selectionValue)
    if (selectionValue.kind !== 'node') {
      setMultiSelection({ nodeIds: [] })
    }
  }

  function handleNodeSelect(nodeId: string, append: boolean) {
    setSelection({ kind: 'node', id: nodeId })
    setMultiSelection((current) => {
      if (!append) {
        return { nodeIds: [nodeId] }
      }

      return current.nodeIds.includes(nodeId)
        ? { nodeIds: current.nodeIds.filter((id) => id !== nodeId) }
        : { nodeIds: [...current.nodeIds, nodeId] }
    })
  }

  function handleSetMultiSelection(nodeIds: string[]) {
    setMultiSelection({ nodeIds })
    if (nodeIds.length === 1) {
      setSelection({ kind: 'node', id: nodeIds[0] })
      return
    }

    setSelection({ kind: 'canvas' })
  }

  function handleAddLane() {
    setDiagram((current) => {
      const nextOrder = current.lanes.length
      const nextLane: Lane = {
        id: createId('lane'),
        title: `Lane ${nextOrder + 1}`,
        subtitle: 'new lane',
        order: nextOrder,
      }

      return {
        ...current,
        lanes: [...current.lanes, nextLane],
      }
    })
  }

  function handleDeleteLane(laneId: string) {
    if (diagram.lanes.length === 1) {
      setStatus(messages.status.laneDeleteBlocked)
      return
    }

    setDiagram((current) => {
      const ordered = [...current.lanes].sort((a, b) => a.order - b.order)
      const index = ordered.findIndex((lane) => lane.id === laneId)
      if (index === -1) {
        return current
      }

      const fallbackLane = ordered[index - 1] ?? ordered[index + 1]
      const nextLanes = ordered
        .filter((lane) => lane.id !== laneId)
        .map((lane, order) => ({ ...lane, order }))

      const nextNodes = current.nodes.map((node) => {
        if (node.laneId !== laneId || !fallbackLane) {
          return node
        }

        const adjusted = constrainNodeToLane({ ...node, laneId: fallbackLane.id }, nextLanes, fallbackLane.id)
        return adjusted
      })

      return {
        ...current,
        lanes: nextLanes,
        nodes: nextNodes,
      }
    })
    setSelection({ kind: 'canvas' })
    setMultiSelection({ nodeIds: [] })
  }

  function handleUpdateLane(laneId: string, updates: { title?: string; subtitle?: string }) {
    updateLanes((lanes) => lanes.map((lane) => (lane.id === laneId ? { ...lane, ...updates } : lane)))
  }

  function handleAddNode() {
    setDiagram((current) => {
      const targetLane = selection.kind === 'lane'
        ? current.lanes.find((lane) => lane.id === selection.id) ?? current.lanes[0]
        : selection.kind === 'node'
          ? current.lanes.find((lane) => lane.id === current.nodes.find((node) => node.id === selection.id)?.laneId) ?? current.lanes[0]
          : current.lanes[0]

      const bounds = getLaneBounds(current.lanes, targetLane.id)
      const nextNode: Node = {
        id: createId('node'),
        laneId: targetLane.id,
        type: 'default',
        title: 'New Node',
        description: 'Describe this workflow step.',
        tag: 'new',
        x: 6,
        y: bounds.top + 6,
        width: 18,
        height: 18,
      }

      return {
        ...current,
        nodes: [...current.nodes, nextNode],
      }
    })
  }

  function handleUpdateNode(nodeId: string, updates: { title?: string; description?: string; tag?: string; type?: Node['type'] }) {
    updateNodes((nodes) => nodes.map((node) => (node.id === nodeId ? { ...node, ...updates } : node)))
  }

  function handleUpdateNodeHeight(nodeId: string, height: number) {
    setDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node
        }

        const roundedHeight = Number(Math.max(height, NODE_MIN_HEIGHT).toFixed(2))
        if (Math.abs(node.height - roundedHeight) < 0.15) {
          return node
        }

        return constrainNodeToLane({ ...node, height: roundedHeight }, current.lanes, node.laneId)
      }),
    }))
  }

  function handleDeleteNode(nodeId: string) {
    setDiagram((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      edges: current.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId),
    }))
    setSelection({ kind: 'canvas' })
    setMultiSelection((current) => ({ nodeIds: current.nodeIds.filter((id) => id !== nodeId) }))
  }

  function handleUpdateNodePosition(nodeId: string, x: number, y: number, laneId: string) {
    setDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? constrainNodeToLane({ ...node, x, y, laneId }, current.lanes, laneId) : node)),
    }))
  }

  function handleUpdateNodeWidth(nodeId: string, width: number) {
    setDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== nodeId) {
          return node
        }

        return constrainNodeToLane({ ...node, width }, current.lanes, node.laneId)
      }),
    }))
  }

  function handleUpdateCanvasTitle(title: string) {
    setDiagram((current) => ({
      ...current,
      meta: {
        ...current.meta,
        title,
      },
    }))
  }

  function handleUpdateTheme(updates: Partial<Pick<Diagram['theme'], 'name' | 'bgPrimary' | 'textPrimary' | 'textMuted' | 'accent' | 'accentDeep'>>) {
    setDiagram((current) => ({
      ...current,
      theme: rebuildTheme(current.theme, updates),
    }))
  }

  function handleApplyThemePreset(presetId: ThemePresetId) {
    const preset = getThemePresetById(presetId)
    if (!preset) {
      return
    }

    setDiagram((current) => ({
      ...current,
      theme: preset.theme,
    }))
  }

  function handleUpdateEdge(edgeId: string, updates: Partial<Edge>) {
    setDiagram((current) => ({
      ...current,
      edges: current.edges.map((edge) => {
        if (edge.id !== edgeId) {
          return edge
        }

        const nextEdge = { ...edge, ...updates }
        if (nextEdge.fromNodeId === nextEdge.toNodeId) {
          setStatus(messages.status.edgeUpdateInvalid)
          return edge
        }

        const duplicateExists = current.edges.some(
          (candidate) =>
            candidate.id !== edgeId &&
            candidate.fromNodeId === nextEdge.fromNodeId &&
            candidate.toNodeId === nextEdge.toNodeId,
        )

        if (duplicateExists) {
          setStatus(messages.status.edgeUpdateDuplicate)
          return edge
        }

        setStatus('')
        return nextEdge
      }),
    }))
  }

  function handleDeleteEdge(edgeId: string) {
    updateEdges((edges) => edges.filter((edge) => edge.id !== edgeId))
    setSelection({ kind: 'canvas' })
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

    updateEdges((edges) => [...edges, nextEdge])
    setSelection({ kind: 'edge', id: nextEdge.id })
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

  function handleClearDraft() {
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
      setDiagram(importedDiagram)
      setLocale(importedDiagram.meta.locale)
      setSelection({ kind: 'canvas' })
      setMultiSelection({ nodeIds: [] })
      setStatus(messages.status.jsonImported)
    } catch {
      setStatus(messages.status.jsonImportFailed)
    } finally {
      event.target.value = ''
    }
  }

  useEffect(() => {
    window.localStorage.setItem(LOCAL_DRAFT_KEY, serializeDiagramJson(diagram))
  }, [diagram])

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
        updateEdges((edges) => edges.filter((edge) => edge.id !== selection.id))
        setSelection({ kind: 'canvas' })
        setStatus(messages.status.edgeDeleted)
        return
      }

      if (multiSelection.nodeIds.length > 0) {
        const selectedIds = new Set(multiSelection.nodeIds)
        setDiagram((current) => ({
          ...current,
          nodes: current.nodes.filter((node) => !selectedIds.has(node.id)),
          edges: current.edges.filter((edge) => !selectedIds.has(edge.fromNodeId) && !selectedIds.has(edge.toNodeId)),
        }))
        setSelection({ kind: 'canvas' })
        setMultiSelection({ nodeIds: [] })
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
        onLocaleChange={handleLocaleChange}
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
    </div>
  )
}

export default App
