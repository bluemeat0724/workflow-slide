import { describe, expect, it } from 'vitest'
import type { Diagram, Node as DiagramNode } from '../model/diagram'
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

  it('keeps nodes and clears their assignment when deleting a lane', () => {
    const state = createEditorState(defaultDiagram)
    const laneToDelete = defaultDiagram.lanes[1]
    const originalNodes = state.diagram.nodes.map((node) => ({ ...node }))

    const nextState = editorStateReducer(state, {
      type: 'delete-lane',
      laneId: laneToDelete.id,
    })

    expect(nextState.diagram.lanes).toHaveLength(defaultDiagram.lanes.length - 1)
    expect(nextState.diagram.nodes.filter((node) => node.id === 'node-4' || node.id === 'node-5' || node.id === 'node-6')
      .every((node) => node.laneId === null)).toBe(true)
    const getGeometry = (node: DiagramNode) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    })
    expect(nextState.diagram.nodes.map(getGeometry)).toEqual(originalNodes.map(getGeometry))
    expect(nextState.selection).toEqual({ kind: 'canvas' })
  })

  it('creates a new node with lane assignment without constraining its position to the lane', () => {
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
    expect(newNode).toMatchObject({ x: 20, y: 3, width: 16, height: 8.5, heightMode: 'auto' })
    expect(newNode?.title).toBe('New Node')
  })

  it('allows a node to move across lane boundaries', () => {
    const state = createEditorState({
      ...defaultDiagram,
      nodes: defaultDiagram.nodes.map((node) => ({ ...node, heightMode: 'auto' as const })),
    })
    const node = defaultDiagram.nodes[0]

    const nextState = editorStateReducer(state, {
      type: 'update-node-position',
      nodeId: node.id,
      x: 40,
      y: 70,
    })

    expect(nextState.diagram.nodes[0]).toMatchObject({ x: 40, y: 70 })
  })

  it('updates lane assignment from the inspector without moving the node', () => {
    const state = createEditorState(defaultDiagram)
    const originalNode = state.diagram.nodes[0]
    const nextState = editorStateReducer(state, {
      type: 'update-node',
      nodeId: 'node-1',
      updates: { laneId: 'lane-2' },
    })

    expect(nextState.diagram.nodes[0].laneId).toBe('lane-2')
    expect(nextState.diagram.nodes[0]).toMatchObject({
      x: originalNode.x,
      y: originalNode.y,
      width: originalNode.width,
      height: originalNode.height,
    })
  })

  it('preserves free-node assignment while dragging', () => {
    const state = createEditorState(defaultDiagram)
    const detached = editorStateReducer(state, {
      type: 'update-node',
      nodeId: 'node-1',
      updates: { laneId: null },
    })
    const moved = editorStateReducer(detached, {
      type: 'update-node-position',
      nodeId: 'node-1',
      x: 40,
      y: 70,
    })

    expect(moved.diagram.nodes[0]).toMatchObject({ laneId: null, x: 40, y: 70 })
  })

  it('creates a new section with empty title and subtitle', () => {
    const state = createEditorState(defaultDiagram)
    const originalNodes = state.diagram.nodes.map((node) => ({ ...node }))

    const nextState = editorStateReducer(state, { type: 'add-lane' })
    const newLane = nextState.diagram.lanes.at(-1)

    expect(newLane?.title).toBe('')
    expect(newLane?.subtitle).toBe('')
    expect(nextState.diagram.nodes).toEqual(originalNodes)
  })

  it('resizes assigned nodes against canvas bounds instead of lane bounds', () => {
    const state = createEditorState(defaultDiagram)
    const resized = editorStateReducer(state, {
      type: 'resize-node-height',
      nodeId: 'node-1',
      height: 70,
    })

    expect(resized.diagram.nodes[0].height).toBe(70)
    expect(resized.diagram.nodes[0].heightMode).toBe('manual')
  })

  it('only measures automatic nodes and can restore automatic height', () => {
    const state = createEditorState({
      ...defaultDiagram,
      nodes: defaultDiagram.nodes.map((node) => ({ ...node, heightMode: 'auto' as const })),
    })
    const measured = editorStateReducer(state, {
      type: 'measure-node-height',
      nodeId: state.diagram.nodes[0].id,
      height: 9,
    })
    const resized = editorStateReducer(measured, {
      type: 'resize-node-height',
      nodeId: measured.diagram.nodes[0].id,
      height: 20,
    })
    const ignoredMeasurement = editorStateReducer(resized, {
      type: 'measure-node-height',
      nodeId: resized.diagram.nodes[0].id,
      height: 10,
    })
    const restored = editorStateReducer(ignoredMeasurement, {
      type: 'reset-node-height',
      nodeId: ignoredMeasurement.diagram.nodes[0].id,
    })

    expect(measured.diagram.nodes[0].height).toBe(9)
    expect(ignoredMeasurement.diagram.nodes[0].height).toBe(20)
    expect(restored.diagram.nodes[0].heightMode).toBe('auto')
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
