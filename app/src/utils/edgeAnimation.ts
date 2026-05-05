import { DEFAULT_EDGE_ANIMATION_MODE, type Diagram, type EdgeAnimationMode } from '../model/diagram'

export const EDGE_ANIMATION_TIMING = {
  allActiveDurationMs: 2800,
  activeDurationMs: 900,
  pauseDurationMs: 350,
  dashTotalOffset: 44,
} as const

export type EdgeAnimationPlan = {
  edgeSteps: Record<string, number>
  totalSteps: number
  stepDurationMs: number
  activeDurationMs: number
  totalDurationMs: number
  dashTotalOffset: number
}

type GetEdgeDashOffsetInput = {
  mode: EdgeAnimationMode
  plan: EdgeAnimationPlan
  edgeId: string
  elapsedMs: number
}

export function resolveEdgeAnimationMode(value: unknown): EdgeAnimationMode {
  return value === 'sequential' || value === 'all-active' ? value : DEFAULT_EDGE_ANIMATION_MODE
}

export function buildEdgeAnimationPlan(diagram: Diagram): EdgeAnimationPlan {
  const edgeSteps = resolveEdgeSteps(diagram)
  const stepValues = Object.values(edgeSteps)
  const totalSteps = stepValues.length ? Math.max(...stepValues) + 1 : 0
  const stepDurationMs = EDGE_ANIMATION_TIMING.activeDurationMs + EDGE_ANIMATION_TIMING.pauseDurationMs

  return {
    edgeSteps,
    totalSteps,
    stepDurationMs,
    activeDurationMs: EDGE_ANIMATION_TIMING.activeDurationMs,
    totalDurationMs: Math.max(totalSteps, 1) * stepDurationMs,
    dashTotalOffset: EDGE_ANIMATION_TIMING.dashTotalOffset,
  }
}

export function getEdgeAnimationCycleDurationMs(mode: EdgeAnimationMode, plan: EdgeAnimationPlan) {
  return mode === 'all-active' ? EDGE_ANIMATION_TIMING.allActiveDurationMs : plan.totalDurationMs
}

export function getEdgeDashOffset({ mode, plan, edgeId, elapsedMs }: GetEdgeDashOffsetInput) {
  if (mode === 'all-active') {
    const cycleElapsed = positiveModulo(elapsedMs, EDGE_ANIMATION_TIMING.allActiveDurationMs)
    const progress = cycleElapsed / EDGE_ANIMATION_TIMING.allActiveDurationMs
    return -plan.dashTotalOffset * progress
  }

  const step = plan.edgeSteps[edgeId]
  if (step === undefined || plan.totalSteps === 0) {
    return 0
  }

  const cycleElapsed = positiveModulo(elapsedMs, plan.totalDurationMs)
  const activeStart = step * plan.stepDurationMs
  const activeEnd = activeStart + plan.activeDurationMs

  if (cycleElapsed <= activeStart) {
    return 0
  }

  if (cycleElapsed >= activeEnd) {
    return -plan.dashTotalOffset
  }

  const progress = (cycleElapsed - activeStart) / plan.activeDurationMs
  return -plan.dashTotalOffset * progress
}

function resolveEdgeSteps(diagram: Diagram) {
  const edgeSteps: Record<string, number> = {}
  const nodeLevels = new Map<string, number>()
  const incomingCount = new Map<string, number>()
  const outgoing = new Map<string, Diagram['edges']>()
  const nodeOrder = new Map(diagram.nodes.map((node, index) => [node.id, index]))

  diagram.nodes.forEach((node) => {
    incomingCount.set(node.id, 0)
    outgoing.set(node.id, [])
  })

  diagram.edges.forEach((edge) => {
    if (!outgoing.has(edge.fromNodeId) || !incomingCount.has(edge.toNodeId)) {
      return
    }

    outgoing.get(edge.fromNodeId)?.push(edge)
    incomingCount.set(edge.toNodeId, (incomingCount.get(edge.toNodeId) ?? 0) + 1)
  })

  const queue = diagram.nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .sort((left, right) => (nodeOrder.get(left.id) ?? 0) - (nodeOrder.get(right.id) ?? 0))
    .map((node) => node.id)

  queue.forEach((nodeId) => {
    nodeLevels.set(nodeId, 0)
  })

  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (!nodeId) {
      continue
    }

    const currentLevel = nodeLevels.get(nodeId) ?? 0
    const nextEdges = outgoing.get(nodeId) ?? []

    nextEdges.forEach((edge) => {
      edgeSteps[edge.id] = Math.max(edgeSteps[edge.id] ?? 0, currentLevel)

      const targetLevel = currentLevel + 1
      nodeLevels.set(edge.toNodeId, Math.max(nodeLevels.get(edge.toNodeId) ?? 0, targetLevel))

      const remainingIncoming = (incomingCount.get(edge.toNodeId) ?? 0) - 1
      incomingCount.set(edge.toNodeId, remainingIncoming)
      if (remainingIncoming === 0) {
        queue.push(edge.toNodeId)
      }
    })
  }

  diagram.edges.forEach((edge) => {
    if (edgeSteps[edge.id] !== undefined) {
      return
    }

    edgeSteps[edge.id] = nodeLevels.get(edge.fromNodeId) ?? 0
  })

  return edgeSteps
}

function positiveModulo(value: number, divisor: number) {
  if (divisor <= 0) {
    return 0
  }

  return ((value % divisor) + divisor) % divisor
}
