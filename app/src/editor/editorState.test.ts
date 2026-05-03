import { describe, expect, it } from 'vitest'
import { defaultDiagram } from '../data/defaultDiagram'
import { createEditorState, editorStateReducer } from './editorState'

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
