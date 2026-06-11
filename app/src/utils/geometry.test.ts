import { describe, expect, it } from 'vitest'
import { constrainNodeToCanvas, getLaneIdAtPoint, getNodeLaneId, getNodeSidePoint } from './geometry'

const lanes = [
  { id: 'lane-1', title: 'A', subtitle: '', order: 0 },
  { id: 'lane-2', title: 'B', subtitle: '', order: 1 },
]

describe('getNodeSidePoint', () => {
  it('prefers top-to-bottom anchors when the source node sits above the target', () => {
    const source = {
      id: 'source',
      laneId: 'lane-1',
      type: 'default',
      title: 'Source',
      description: '',
      tag: '',
      x: 62,
      y: 8,
      width: 18,
      height: 16,
    } as const
    const target = {
      id: 'target',
      laneId: 'lane-2',
      type: 'default',
      title: 'Target',
      description: '',
      tag: '',
      x: 12,
      y: 56,
      width: 24,
      height: 16,
    } as const

    expect(getNodeSidePoint(source, target)).toEqual({
      startX: 71,
      startY: 24,
      endX: 24,
      endY: 56,
      startSide: 'bottom',
      endSide: 'top',
    })
  })

  it('uses side anchors when horizontal separation dominates', () => {
    const source = {
      id: 'source',
      laneId: 'lane-1',
      type: 'default',
      title: 'Source',
      description: '',
      tag: '',
      x: 60,
      y: 18,
      width: 18,
      height: 16,
    } as const
    const target = {
      id: 'target',
      laneId: 'lane-1',
      type: 'default',
      title: 'Target',
      description: '',
      tag: '',
      x: 8,
      y: 24,
      width: 18,
      height: 16,
    } as const

    expect(getNodeSidePoint(source, target)).toEqual({
      startX: 60,
      startY: 26,
      endX: 26,
      endY: 32,
      startSide: 'left',
      endSide: 'right',
    })
  })

  it('constrains nodes to the canvas instead of lane bounds', () => {
    const node = {
      id: 'node',
      laneId: null,
      type: 'default',
      title: 'Node',
      description: '',
      tag: '',
      x: 40,
      y: 70,
      width: 18,
      height: 20,
    } as const

    expect(constrainNodeToCanvas(node)).toMatchObject({ x: 40, y: 70 })
    expect(constrainNodeToCanvas({ ...node, x: 95, y: 95 })).toMatchObject({ x: 80, y: 78 })
  })

  it('resolves lane membership from points and node centers', () => {
    expect(getLaneIdAtPoint(lanes, 20, 49.99)).toBe('lane-1')
    expect(getLaneIdAtPoint(lanes, 20, 50)).toBe('lane-2')
    expect(getNodeLaneId(lanes, { x: 30, y: 41, width: 18, height: 16 })).toBe('lane-1')
    expect(getNodeLaneId(lanes, { x: 30, y: 45, width: 18, height: 16 })).toBe('lane-2')
  })
})
