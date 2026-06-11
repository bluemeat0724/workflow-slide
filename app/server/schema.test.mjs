import { describe, expect, it } from 'vitest'
import { assertDiagramPayload } from './schema.mjs'

function createDiagram(laneId) {
  return {
    meta: { title: 'Test', locale: 'en-US', version: '0.1.0' },
    theme: {
      name: 'Test',
      bgPrimary: '#fff',
      boardBackground: '#fff',
      laneBackground: '#fff',
      textPrimary: '#000',
      textMuted: '#666',
      accent: '#00f',
      accentDeep: '#008',
      accentSoft: '#eef',
      lineSoft: '#ccc',
    },
    lanes: [{ id: 'lane-1', title: 'Main', subtitle: '', order: 0 }],
    nodes: [{
      id: 'node-1',
      laneId,
      type: 'default',
      title: 'Step',
      description: '',
      tag: '',
      x: 20,
      y: 10,
      width: 18,
      height: 16,
    }],
    edges: [],
  }
}

describe('assertDiagramPayload lane assignments', () => {
  it('accepts assigned and free nodes', () => {
    expect(assertDiagramPayload(createDiagram('lane-1')).nodes[0].laneId).toBe('lane-1')
    expect(assertDiagramPayload(createDiagram(null)).nodes[0].laneId).toBeNull()
  })

  it('rejects lane assignments that reference a missing lane', () => {
    expect(() => assertDiagramPayload(createDiagram('missing'))).toThrow()
  })
})
