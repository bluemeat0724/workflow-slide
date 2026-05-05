import { describe, expect, it } from 'vitest'
import { getNodeSidePoint } from './geometry'

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
      laneId: 'lane-2',
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
})
