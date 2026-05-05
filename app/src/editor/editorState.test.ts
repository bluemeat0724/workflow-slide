import { describe, expect, it } from 'vitest'
import type { Diagram } from '../model/diagram'
import { getThemePresetById } from '../data/themePresets'
import { createEditorState, editorStateReducer } from './editorState'

const defaultTheme = getThemePresetById('violet')?.theme

const defaultDiagram: Diagram = {
  meta: {
    title: 'Knowledge Workflow',
    locale: 'zh-CN',
    version: '0.1.0',
    edgeAnimationMode: 'all-active',
  },
  theme: defaultTheme!,
  lanes: [
    { id: 'lane-1', title: 'Ontology Design', subtitle: 'type schema generation', order: 0 },
    { id: 'lane-2', title: 'Instance Extraction', subtitle: 'instance graph creation', order: 1 },
  ],
  nodes: [
    {
      id: 'node-1',
      laneId: 'lane-1',
      type: 'default',
      title: 'Expert Analysis',
      description: 'Experts define business concepts, boundaries, and constraints before instance creation.',
      tag: 'business input',
      x: 3,
      y: 12,
      width: 18,
      height: 18,
    },
    {
      id: 'node-2',
      laneId: 'lane-1',
      type: 'agent',
      title: 'Instance Analysis Agent',
      description: 'Converts business analysis into a structured ontology type design.',
      tag: 'analysis agent',
      x: 26,
      y: 12,
      width: 19,
      height: 18,
    },
    {
      id: 'node-3',
      laneId: 'lane-1',
      type: 'shared',
      title: 'Ontology Type Schema',
      description: 'Shared artifact connecting upstream modeling with downstream extraction.',
      tag: 'shared contract',
      x: 51,
      y: 18,
      width: 18,
      height: 22,
    },
    {
      id: 'node-4',
      laneId: 'lane-2',
      type: 'default',
      title: 'UKM Knowledge',
      description: 'Uploaded source material for extracting entities and facts.',
      tag: 'user upload',
      x: 3,
      y: 62,
      width: 18,
      height: 18,
    },
    {
      id: 'node-5',
      laneId: 'lane-2',
      type: 'agent',
      title: 'Instance Extraction Agent',
      description: 'Combines schema and knowledge sources to extract entities and relations.',
      tag: 'entity extraction',
      x: 35,
      y: 58,
      width: 21,
      height: 18,
    },
    {
      id: 'node-6',
      laneId: 'lane-2',
      type: 'output',
      title: 'Ontology Instance Graph',
      description: 'Outputs the instance graph with traceable knowledge evidence.',
      tag: 'instance graph',
      x: 70,
      y: 62,
      width: 19,
      height: 18,
    },
  ],
  edges: [
    { id: 'edge-1', fromNodeId: 'node-1', toNodeId: 'node-2', emphasis: 'theme' },
    { id: 'edge-2', fromNodeId: 'node-2', toNodeId: 'node-3', emphasis: 'theme' },
    { id: 'edge-3', fromNodeId: 'node-4', toNodeId: 'node-5', emphasis: 'soft' },
    { id: 'edge-4', fromNodeId: 'node-3', toNodeId: 'node-5', emphasis: 'theme' },
    { id: 'edge-5', fromNodeId: 'node-5', toNodeId: 'node-6', emphasis: 'theme' },
  ],
}

describe('editorStateReducer', () => {
  it('updates locale on both editor state and diagram meta', () => {
    const state = createEditorState(defaultDiagram)

    const nextState = editorStateReducer(state, {
      type: 'set-locale',
      locale: 'en-US',
    })

    expect(nextState.locale).toBe('en-US')
    expect(nextState.diagram.meta.locale).toBe('en-US')
  })

  it('updates edge animation mode on diagram meta', () => {
    const state = createEditorState(defaultDiagram)

    const nextState = editorStateReducer(state, {
      type: 'update-edge-animation-mode',
      mode: 'sequential',
    })

    expect(nextState.diagram.meta.edgeAnimationMode).toBe('sequential')
  })

  it('keeps node selection in sync with multi-select append behavior', () => {
    const state = createEditorState(defaultDiagram)
    const [firstNode, secondNode] = defaultDiagram.nodes

    const firstSelection = editorStateReducer(state, {
      type: 'select-node',
      nodeId: firstNode.id,
      append: false,
    })
    const appendedSelection = editorStateReducer(firstSelection, {
      type: 'select-node',
      nodeId: secondNode.id,
      append: true,
    })

    expect(appendedSelection.selection).toEqual({ kind: 'node', id: secondNode.id })
    expect(appendedSelection.multiSelection.nodeIds).toEqual([firstNode.id, secondNode.id])
  })

  it('reassigns nodes into a fallback lane when deleting a lane', () => {
    const state = createEditorState(defaultDiagram)
    const laneToDelete = defaultDiagram.lanes[1]
    const fallbackLane = defaultDiagram.lanes[0]
    const nodeInDeletedLane = defaultDiagram.nodes.find((node) => node.laneId === laneToDelete.id)

    if (!nodeInDeletedLane) {
      throw new Error('expected fixture node in lane to delete')
    }

    const nextState = editorStateReducer(state, {
      type: 'delete-lane',
      laneId: laneToDelete.id,
    })

    expect(nextState.diagram.lanes).toHaveLength(defaultDiagram.lanes.length - 1)
    expect(nextState.diagram.nodes.find((node) => node.id === nodeInDeletedLane.id)?.laneId).toBe(fallbackLane.id)
    expect(nextState.selection).toEqual({ kind: 'canvas' })
  })

  it('creates a new node in the selected lane', () => {
    const initialState = createEditorState(defaultDiagram)
    const lane = defaultDiagram.lanes[1]
    const selectedLaneState = editorStateReducer(initialState, {
      type: 'select',
      selection: { kind: 'lane', id: lane.id },
    })

    const nextState = editorStateReducer(selectedLaneState, { type: 'add-node' })
    const newNode = nextState.diagram.nodes.at(-1)

    expect(nextState.diagram.nodes).toHaveLength(defaultDiagram.nodes.length + 1)
    expect(newNode?.laneId).toBe(lane.id)
    expect(newNode?.title).toBe('New Node')
  })

  it('creates a new section with empty title and subtitle', () => {
    const state = createEditorState(defaultDiagram)

    const nextState = editorStateReducer(state, { type: 'add-lane' })
    const newLane = nextState.diagram.lanes.at(-1)

    expect(newLane?.title).toBe('')
    expect(newLane?.subtitle).toBe('')
  })

  it('deletes selected nodes and prunes connected edges', () => {
    const state = createEditorState(defaultDiagram)
    const selectedNodeIds = defaultDiagram.nodes.slice(0, 2).map((node) => node.id)

    const nextState = editorStateReducer(state, {
      type: 'delete-selected-nodes',
      nodeIds: selectedNodeIds,
    })

    expect(nextState.diagram.nodes.some((node) => selectedNodeIds.includes(node.id))).toBe(false)
    expect(nextState.diagram.edges.some((edge) => selectedNodeIds.includes(edge.fromNodeId) || selectedNodeIds.includes(edge.toNodeId))).toBe(false)
    expect(nextState.multiSelection.nodeIds).toEqual([])
  })
})
