import type { Diagram, Edge, Locale, MultiSelection, Node, NodeType, Selection, Theme } from '../model/diagram'
import { createId } from '../utils/ids'
import { NODE_MIN_HEIGHT, constrainNodeToLane, getLaneBounds } from '../utils/geometry'
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
  | { type: 'update-node-position'; nodeId: string; x: number; y: number; laneId: string }
  | { type: 'update-node-width'; nodeId: string; width: number }
  | { type: 'update-canvas-title'; title: string }
  | { type: 'update-theme'; updates: UpdateThemeInput }
  | { type: 'apply-theme'; theme: Theme }
  | { type: 'update-edge'; edgeId: string; updates: Partial<Edge> }
  | { type: 'add-edge'; edge: Edge }
  | { type: 'delete-edge'; edgeId: string }
  | { type: 'delete-selected-nodes'; nodeIds: string[] }

export function createEditorState(diagram: Diagram): EditorState {
  return {
    diagram,
    locale: diagram.meta.locale,
    selection: { kind: 'canvas' },
    multiSelection: { nodeIds: [] },
  }
}

export function editorStateReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'replace-diagram':
      return {
        diagram: action.diagram,
        locale: action.diagram.meta.locale,
        selection: { kind: 'canvas' },
        multiSelection: { nodeIds: [] },
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
      return {
        ...state,
        diagram: {
          ...state.diagram,
          lanes: [
            ...state.diagram.lanes,
            {
              id: createId('lane'),
              title: '',
              subtitle: '',
              order: nextOrder,
            },
          ],
        },
      }
    }

    case 'delete-lane': {
      if (state.diagram.lanes.length === 1) {
        return state
      }

      const ordered = [...state.diagram.lanes].sort((left, right) => left.order - right.order)
      const index = ordered.findIndex((lane) => lane.id === action.laneId)
      if (index === -1) {
        return state
      }

      const fallbackLane = ordered[index - 1] ?? ordered[index + 1]
      const nextLanes = ordered
        .filter((lane) => lane.id !== action.laneId)
        .map((lane, order) => ({ ...lane, order }))
      const nextNodes = state.diagram.nodes.map((node) => {
        if (node.laneId !== action.laneId || !fallbackLane) {
          return node
        }

        return constrainNodeToLane({ ...node, laneId: fallbackLane.id }, nextLanes, fallbackLane.id)
      })

      return {
        ...state,
        diagram: {
          ...state.diagram,
          lanes: nextLanes,
          nodes: nextNodes,
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
      const targetLane = getDefaultLaneForNewNode(state)
      const bounds = getLaneBounds(state.diagram.lanes, targetLane.id)
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
        ...state,
        diagram: {
          ...state.diagram,
          nodes: [...state.diagram.nodes, nextNode],
        },
      }
    }

    case 'update-node':
      return {
        ...state,
        diagram: {
          ...state.diagram,
          nodes: state.diagram.nodes.map((node) => (node.id === action.nodeId ? { ...node, ...action.updates } : node)),
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

            return constrainNodeToLane({ ...node, height: roundedHeight }, state.diagram.lanes, node.laneId)
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
              ? constrainNodeToLane({ ...node, x: action.x, y: action.y, laneId: action.laneId }, state.diagram.lanes, action.laneId)
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
              ? constrainNodeToLane({ ...node, width: action.width }, state.diagram.lanes, node.laneId)
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

function getDefaultLaneForNewNode(state: EditorState) {
  const { selection } = state

  if (selection.kind === 'lane') {
    return state.diagram.lanes.find((lane) => lane.id === selection.id) ?? state.diagram.lanes[0]
  }

  if (selection.kind === 'node') {
    const selectedNode = state.diagram.nodes.find((node) => node.id === selection.id)
    return state.diagram.lanes.find((lane) => lane.id === selectedNode?.laneId) ?? state.diagram.lanes[0]
  }

  return state.diagram.lanes[0]
}
