import { DEFAULT_EDGE_ANIMATION_MODE, type Diagram, type Edge, type EdgeAnimationMode, type Locale, type MultiSelection, type Node, type NodeType, type Selection, type Theme } from '../model/diagram'
import { createId } from '../utils/ids'
import { NODE_MIN_HEIGHT, constrainNodeToCanvas } from '../utils/geometry'
import { rebuildTheme } from '../utils/theme'

export type EditorState = {
  diagram: Diagram
  locale: Locale
  selection: Selection
  multiSelection: MultiSelection
}

type UpdateNodeInput = {
  title?: string
  description?: string
  tag?: string
  type?: NodeType
  laneId?: string | null
}

type UpdateLaneInput = {
  title?: string
  subtitle?: string
}

type UpdateThemeInput = Partial<Pick<Theme, 'name' | 'bgPrimary' | 'textPrimary' | 'textMuted' | 'accent' | 'accentDeep'>>

export type EditorAction =
  | { type: 'replace-diagram'; diagram: Diagram }
  | { type: 'set-locale'; locale: Locale }
  | { type: 'select'; selection: Selection }
  | { type: 'select-node'; nodeId: string; append: boolean }
  | { type: 'set-multi-selection'; nodeIds: string[] }
  | { type: 'add-lane' }
  | { type: 'delete-lane'; laneId: string }
  | { type: 'update-lane'; laneId: string; updates: UpdateLaneInput }
  | { type: 'add-node' }
  | { type: 'update-node'; nodeId: string; updates: UpdateNodeInput }
  | { type: 'update-node-height'; nodeId: string; height: number }
  | { type: 'delete-node'; nodeId: string }
  | { type: 'update-node-position'; nodeId: string; x: number; y: number }
  | { type: 'update-node-width'; nodeId: string; width: number }
  | { type: 'update-canvas-title'; title: string }
  | { type: 'update-edge-animation-mode'; mode: EdgeAnimationMode }
  | { type: 'update-theme'; updates: UpdateThemeInput }
  | { type: 'apply-theme'; theme: Theme }
  | { type: 'update-edge'; edgeId: string; updates: Partial<Edge> }
  | { type: 'add-edge'; edge: Edge }
  | { type: 'delete-edge'; edgeId: string }
  | { type: 'delete-selected-nodes'; nodeIds: string[] }

export function createEditorState(diagram: Diagram): EditorState {
  const normalizedDiagram = normalizeDiagram(diagram)
  return {
    diagram: normalizedDiagram,
    locale: normalizedDiagram.meta.locale,
    selection: { kind: 'canvas' },
    multiSelection: { nodeIds: [] },
  }
}

export function editorStateReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'replace-diagram': {
      const normalizedDiagram = normalizeDiagram(action.diagram)
      return {
        diagram: normalizedDiagram,
        locale: normalizedDiagram.meta.locale,
        selection: { kind: 'canvas' },
        multiSelection: { nodeIds: [] },
      }
    }

    case 'set-locale':
      return {
        ...state,
        locale: action.locale,
        diagram: {
          ...state.diagram,
          meta: {
            ...state.diagram.meta,
            locale: action.locale,
          },
        },
      }

    case 'select':
      return {
        ...state,
        selection: action.selection,
        multiSelection: action.selection.kind === 'node' ? state.multiSelection : { nodeIds: [] },
      }

    case 'select-node':
      return {
        ...state,
        selection: { kind: 'node', id: action.nodeId },
        multiSelection: {
          nodeIds: action.append
            ? toggleNodeId(state.multiSelection.nodeIds, action.nodeId)
            : [action.nodeId],
        },
      }

    case 'set-multi-selection':
      return {
        ...state,
        multiSelection: { nodeIds: action.nodeIds },
        selection: action.nodeIds.length === 1 ? { kind: 'node', id: action.nodeIds[0] } : { kind: 'canvas' },
      }

    case 'add-lane': {
      const nextOrder = state.diagram.lanes.length
      const nextLanes = [
        ...state.diagram.lanes,
        {
          id: createId('lane'),
          title: '',
          subtitle: '',
          order: nextOrder,
        },
      ]
      return {
        ...state,
        diagram: {
          ...state.diagram,
          lanes: nextLanes,
        },
      }
    }

    case 'delete-lane': {
      if (state.diagram.lanes.length === 1) {
        return state
      }

      if (!state.diagram.lanes.some((lane) => lane.id === action.laneId)) {
        return state
      }

      const nextLanes = [...state.diagram.lanes]
        .filter((lane) => lane.id !== action.laneId)
        .map((lane, order) => ({ ...lane, order }))

      return {
        ...state,
        diagram: {
          ...state.diagram,
          lanes: nextLanes,
          nodes: state.diagram.nodes.map((node) => node.laneId === action.laneId ? { ...node, laneId: null } : node),
        },
        selection: { kind: 'canvas' },
        multiSelection: { nodeIds: [] },
      }
    }

    case 'update-lane':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          lanes: state.diagram.lanes.map((lane) => (lane.id === action.laneId ? { ...lane, ...action.updates } : lane)),
        },
      }

    case 'add-node': {
      const selectedLaneId = state.selection.kind === 'lane'
        ? state.selection.id
        : undefined
      const laneId = selectedLaneId ?? [...state.diagram.lanes].sort((a, b) => a.order - b.order)[0]?.id ?? null
      const nextNode: Node = {
        id: createId('node'),
        laneId,
        type: 'default',
        title: 'New Node',
        description: 'Describe this workflow step.',
        tag: 'new',
        x: 20,
        y: 2,
        width: 18,
        height: 18,
      }

      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: [...state.diagram.nodes, constrainNodeToCanvas(nextNode)],
        },
      }
    }

    case 'update-node':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: state.diagram.nodes.map((node) => {
            if (node.id !== action.nodeId) return node
            return { ...node, ...action.updates }
          }),
        },
      }

    case 'update-node-height':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: state.diagram.nodes.map((node) => {
            if (node.id !== action.nodeId) {
              return node
            }

            const roundedHeight = Number(Math.max(action.height, NODE_MIN_HEIGHT).toFixed(2))
            if (Math.abs(node.height - roundedHeight) < 0.15) {
              return node
            }

            return constrainNodeToCanvas({ ...node, height: roundedHeight })
          }),
        },
      }

    case 'delete-node':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: state.diagram.nodes.filter((node) => node.id !== action.nodeId),
          edges: state.diagram.edges.filter((edge) => edge.fromNodeId !== action.nodeId && edge.toNodeId !== action.nodeId),
        },
        selection: { kind: 'canvas' },
        multiSelection: { nodeIds: state.multiSelection.nodeIds.filter((nodeId) => nodeId !== action.nodeId) },
      }

    case 'update-node-position':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: state.diagram.nodes.map((node) => (
            node.id === action.nodeId
              ? constrainNodeToCanvas({ ...node, x: action.x, y: action.y })
              : node
          )),
        },
      }

    case 'update-node-width':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: state.diagram.nodes.map((node) => (
            node.id === action.nodeId
              ? constrainNodeToCanvas({ ...node, width: action.width })
              : node
          )),
        },
      }

    case 'update-canvas-title':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          meta: {
            ...state.diagram.meta,
            title: action.title,
          },
        },
      }

    case 'update-edge-animation-mode':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          meta: {
            ...state.diagram.meta,
            edgeAnimationMode: action.mode,
          },
        },
      }

    case 'update-theme':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          theme: rebuildTheme(state.diagram.theme, action.updates),
        },
      }

    case 'apply-theme':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          theme: action.theme,
        },
      }

    case 'update-edge':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          edges: state.diagram.edges.map((edge) => (edge.id === action.edgeId ? { ...edge, ...action.updates } : edge)),
        },
      }

    case 'add-edge':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          edges: [...state.diagram.edges, action.edge],
        },
        selection: { kind: 'edge', id: action.edge.id },
        multiSelection: { nodeIds: [] },
      }

    case 'delete-edge':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          edges: state.diagram.edges.filter((edge) => edge.id !== action.edgeId),
        },
        selection: { kind: 'canvas' },
      }

    case 'delete-selected-nodes': {
      const selectedIds = new Set(action.nodeIds)
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: state.diagram.nodes.filter((node) => !selectedIds.has(node.id)),
          edges: state.diagram.edges.filter((edge) => !selectedIds.has(edge.fromNodeId) && !selectedIds.has(edge.toNodeId)),
        },
        selection: { kind: 'canvas' },
        multiSelection: { nodeIds: [] },
      }
    }

    default:
      return state
  }
}

function toggleNodeId(nodeIds: string[], nodeId: string) {
  return nodeIds.includes(nodeId)
    ? nodeIds.filter((currentNodeId) => currentNodeId !== nodeId)
    : [...nodeIds, nodeId]
}

function normalizeDiagram(diagram: Diagram): Diagram {
  return {
    ...diagram,
    meta: {
      ...diagram.meta,
      edgeAnimationMode: diagram.meta.edgeAnimationMode ?? DEFAULT_EDGE_ANIMATION_MODE,
    },
  }
}
