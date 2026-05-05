import { describe, it, expect } from 'vitest'
import { validateEdgeCreate, validateEdgeMutation, buildEdge } from '../domain/edgeValidation'
import type { Edge } from '../../model/diagram'

function makeEdge(id: string, fromNodeId: string, toNodeId: string): Edge {
  return { id, fromNodeId, toNodeId, emphasis: 'theme' }
}

describe('validateEdgeCreate', () => {
  const existing: Edge[] = [
    makeEdge('e1', 'n1', 'n2'),
  ]

  it('returns valid when edge is acceptable', () => {
    expect(validateEdgeCreate(existing, 'n1', 'n3')).toEqual({ valid: true })
  })

  it('rejects empty target', () => {
    expect(validateEdgeCreate(existing, 'n1', '')).toEqual({ valid: false, error: 'missing-target' })
  })

  it('rejects self-reference', () => {
    expect(validateEdgeCreate(existing, 'n1', 'n1')).toEqual({ valid: false, error: 'self-reference' })
  })

  it('rejects duplicate edge', () => {
    expect(validateEdgeCreate(existing, 'n1', 'n2')).toEqual({ valid: false, error: 'duplicate' })
  })
})

describe('validateEdgeMutation', () => {
  const existing: Edge[] = [
    makeEdge('e1', 'n1', 'n2'),
    makeEdge('e2', 'n2', 'n3'),
  ]

  it('returns valid for acceptable mutation', () => {
    expect(validateEdgeMutation(existing, 'e1', { emphasis: 'soft' })).toEqual({ valid: true })
  })

  it('rejects when edge is not found', () => {
    expect(validateEdgeMutation(existing, 'nonexistent', { emphasis: 'soft' })).toEqual({ valid: false, error: 'not-found' })
  })

  it('rejects self-reference mutation', () => {
    expect(validateEdgeMutation(existing, 'e1', { fromNodeId: 'n1', toNodeId: 'n1' })).toEqual({ valid: false, error: 'self-reference' })
  })

  it('rejects duplicate after mutation', () => {
    expect(validateEdgeMutation(existing, 'e1', { fromNodeId: 'n2', toNodeId: 'n3' })).toEqual({ valid: false, error: 'duplicate' })
  })

  it('allows same from/to after mutation if no conflict', () => {
    expect(validateEdgeMutation(existing, 'e1', { fromNodeId: 'n1', toNodeId: 'n3' })).toEqual({ valid: true })
  })
})

describe('buildEdge', () => {
  it('creates an edge with theme emphasis', () => {
    const edge = buildEdge('from-1', 'to-1')
    expect(edge.fromNodeId).toBe('from-1')
    expect(edge.toNodeId).toBe('to-1')
    expect(edge.emphasis).toBe('theme')
    expect(edge.id).toBeTruthy()
  })
})
