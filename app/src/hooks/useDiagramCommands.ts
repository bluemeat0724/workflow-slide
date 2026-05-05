import { useCallback } from 'react'
import type { Messages } from '../i18n'
import type {
  Diagram,
  Edge,
  EdgeAnimationMode,
  Locale,
  Node,
  Selection,
} from '../model/diagram'
import { getThemePresetById, type ThemePresetId } from '../data/themePresets'
import type { EditorAction } from '../editor/editorState'
import { buildEdge, validateEdgeCreate, validateEdgeMutation } from '../editor/domain/edgeValidation'

type UseDiagramCommandsInput = {
  dispatch: React.Dispatch<EditorAction>
  diagram: Diagram
  setStatus: (status: string) => void
  messages: Messages
}

export function useDiagramCommands({
  dispatch,
  diagram,
  setStatus,
  messages,
}: UseDiagramCommandsInput) {
  const handleLocaleChange = useCallback((nextLocale: Locale) => {
    dispatch({ type: 'set-locale', locale: nextLocale })
  }, [dispatch])

  const handleSelect = useCallback((selectionValue: Selection) => {
    dispatch({ type: 'select', selection: selectionValue })
  }, [dispatch])

  const handleNodeSelect = useCallback((nodeId: string, append: boolean) => {
    dispatch({ type: 'select-node', nodeId, append })
  }, [dispatch])

  const handleSetMultiSelection = useCallback((nodeIds: string[]) => {
    dispatch({ type: 'set-multi-selection', nodeIds })
  }, [dispatch])

  const handleAddLane = useCallback(() => {
    dispatch({ type: 'add-lane' })
  }, [dispatch])

  const handleDeleteLane = useCallback((laneId: string) => {
    if (diagram.lanes.length === 1) {
      setStatus(messages.status.laneDeleteBlocked)
      return
    }

    dispatch({ type: 'delete-lane', laneId })
  }, [dispatch, diagram.lanes.length, messages.status.laneDeleteBlocked, setStatus])

  const handleUpdateLane = useCallback((laneId: string, updates: { title?: string; subtitle?: string }) => {
    dispatch({ type: 'update-lane', laneId, updates })
  }, [dispatch])

  const handleAddNode = useCallback(() => {
    dispatch({ type: 'add-node' })
  }, [dispatch])

  const handleUpdateNode = useCallback((nodeId: string, updates: { title?: string; description?: string; tag?: string; type?: Node['type'] }) => {
    dispatch({ type: 'update-node', nodeId, updates })
  }, [dispatch])

  const handleUpdateNodeHeight = useCallback((nodeId: string, height: number) => {
    dispatch({ type: 'update-node-height', nodeId, height })
  }, [dispatch])

  const handleDeleteNode = useCallback((nodeId: string) => {
    dispatch({ type: 'delete-node', nodeId })
  }, [dispatch])

  const handleUpdateNodePosition = useCallback((nodeId: string, x: number, y: number, laneId: string) => {
    dispatch({ type: 'update-node-position', nodeId, x, y, laneId })
  }, [dispatch])

  const handleUpdateNodeWidth = useCallback((nodeId: string, width: number) => {
    dispatch({ type: 'update-node-width', nodeId, width })
  }, [dispatch])

  const handleUpdateCanvasTitle = useCallback((title: string) => {
    dispatch({ type: 'update-canvas-title', title })
  }, [dispatch])

  const handleUpdateEdgeAnimationMode = useCallback((mode: EdgeAnimationMode) => {
    dispatch({ type: 'update-edge-animation-mode', mode })
  }, [dispatch])

  const handleUpdateTheme = useCallback((updates: Partial<Pick<Diagram['theme'], 'name' | 'bgPrimary' | 'textPrimary' | 'textMuted' | 'accent' | 'accentDeep'>>) => {
    dispatch({ type: 'update-theme', updates })
  }, [dispatch])

  const handleApplyThemePreset = useCallback((presetId: ThemePresetId) => {
    const preset = getThemePresetById(presetId)
    if (!preset) {
      return
    }

    dispatch({ type: 'apply-theme', theme: preset.theme })
  }, [dispatch])

  const handleUpdateEdge = useCallback((edgeId: string, updates: Partial<Edge>) => {
    const validation = validateEdgeMutation(diagram.edges, edgeId, updates)
    if (!validation.valid) {
      if (validation.error === 'self-reference') {
        setStatus(messages.status.edgeUpdateInvalid)
      } else if (validation.error === 'duplicate') {
        setStatus(messages.status.edgeUpdateDuplicate)
      }
      return
    }

    dispatch({ type: 'update-edge', edgeId, updates })
    setStatus('')
  }, [dispatch, diagram.edges, messages.status.edgeUpdateInvalid, messages.status.edgeUpdateDuplicate, setStatus])

  const handleDeleteEdge = useCallback((edgeId: string) => {
    dispatch({ type: 'delete-edge', edgeId })
    setStatus(messages.status.edgeDeleted)
  }, [dispatch, messages.status.edgeDeleted, setStatus])

  const handleCreateEdge = useCallback((fromNodeId: string, toNodeId: string) => {
    const validation = validateEdgeCreate(diagram.edges, fromNodeId, toNodeId)
    if (!validation.valid) {
      if (validation.error === 'missing-target') {
        setStatus(messages.status.edgeTargetMissing)
      } else if (validation.error === 'self-reference') {
        setStatus(messages.status.edgeSelfBlocked)
      } else if (validation.error === 'duplicate') {
        setStatus(messages.status.edgeExists)
      }
      return
    }

    const nextEdge = buildEdge(fromNodeId, toNodeId)
    dispatch({ type: 'add-edge', edge: nextEdge })
    setStatus(messages.status.edgeCreated)
  }, [dispatch, diagram.edges, messages, setStatus])

  return {
    handleLocaleChange,
    handleSelect,
    handleNodeSelect,
    handleSetMultiSelection,
    handleAddLane,
    handleDeleteLane,
    handleUpdateLane,
    handleAddNode,
    handleUpdateNode,
    handleUpdateNodeHeight,
    handleDeleteNode,
    handleUpdateNodePosition,
    handleUpdateNodeWidth,
    handleUpdateCanvasTitle,
    handleUpdateEdgeAnimationMode,
    handleUpdateTheme,
    handleApplyThemePreset,
    handleUpdateEdge,
    handleDeleteEdge,
    handleCreateEdge,
  }
}
