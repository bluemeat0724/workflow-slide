import type { Edge } from '../../model/diagram'
import { createId } from '../../utils/ids'

export type EdgeValidationError = 'missing-target' | 'self-reference' | 'duplicate' | 'not-found'

export type EdgeValidationResult =
  | { valid: true }
  | { valid: false; error: EdgeValidationError }

export function validateEdgeCreate(
  edges: Edge[],
  fromNodeId: string,
  toNodeId: string,
): EdgeValidationResult {
  if (!toNodeId) {
    return { valid: false, error: 'missing-target' }
  }

  if (fromNodeId === toNodeId) {
    return { valid: false, error: 'self-reference' }
  }

  const exists = edges.some(
    (edge) => edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId,
  )

  if (exists) {
    return { valid: false, error: 'duplicate' }
  }

  return { valid: true }
}

export function buildEdge(fromNodeId: string, toNodeId: string): Edge {
  return {
    id: createId('edge'),
    fromNodeId,
    toNodeId,
    emphasis: 'theme',
  }
}

export type EdgeMutationValidationResult =
  | { valid: true }
  | { valid: false; error: 'self-reference' | 'duplicate' | 'not-found' }

export function validateEdgeMutation(
  edges: Edge[],
  edgeId: string,
  updates: Partial<Edge>,
): EdgeMutationValidationResult {
  const edge = edges.find((candidate) => candidate.id === edgeId)
  if (!edge) {
    return { valid: false, error: 'not-found' }
  }

  const nextEdge = { ...edge, ...updates }
  if (nextEdge.fromNodeId === nextEdge.toNodeId) {
    return { valid: false, error: 'self-reference' }
  }

  const duplicateExists = edges.some(
    (candidate) =>
      candidate.id !== edgeId &&
      candidate.fromNodeId === nextEdge.fromNodeId &&
      candidate.toNodeId === nextEdge.toNodeId,
  )

  if (duplicateExists) {
    return { valid: false, error: 'duplicate' }
  }

  return { valid: true }
}
