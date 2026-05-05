import { describe, expect, it } from 'vitest'
import type { Diagram } from '../model/diagram'
import { getThemePresetById } from '../data/themePresets'
import { buildEdgeAnimationPlan, getEdgeDashOffset } from './edgeAnimation'

const defaultTheme = getThemePresetById('violet')?.theme

const diagram: Diagram = {
  meta: {
    title: 'Parallel Roots',
    locale: 'zh-CN',
    version: '0.1.0',
    edgeAnimationMode: 'sequential',
  },
  theme: defaultTheme!,
  lanes: [
    { id: 'lane-1', title: '', subtitle: '', order: 0 },
  ],
  nodes: [
    { id: 'node-1', laneId: 'lane-1', type: 'default', title: 'A', description: '', tag: '', x: 5, y: 10, width: 10, height: 10 },
    { id: 'node-2', laneId: 'lane-1', type: 'default', title: 'B', description: '', tag: '', x: 25, y: 10, width: 10, height: 10 },
    { id: 'node-3', laneId: 'lane-1', type: 'default', title: 'C', description: '', tag: '', x: 5, y: 30, width: 10, height: 10 },
    { id: 'node-4', laneId: 'lane-1', type: 'default', title: 'D', description: '', tag: '', x: 25, y: 30, width: 10, height: 10 },
    { id: 'node-5', laneId: 'lane-1', type: 'output', title: 'E', description: '', tag: '', x: 50, y: 20, width: 10, height: 10 },
    { id: 'node-6', laneId: 'lane-1', type: 'output', title: 'F', description: '', tag: '', x: 72, y: 20, width: 10, height: 10 },
  ],
  edges: [
    { id: 'edge-1', fromNodeId: 'node-1', toNodeId: 'node-2', emphasis: 'theme' },
    { id: 'edge-2', fromNodeId: 'node-3', toNodeId: 'node-4', emphasis: 'theme' },
    { id: 'edge-3', fromNodeId: 'node-2', toNodeId: 'node-5', emphasis: 'theme' },
    { id: 'edge-4', fromNodeId: 'node-4', toNodeId: 'node-5', emphasis: 'theme' },
    { id: 'edge-5', fromNodeId: 'node-5', toNodeId: 'node-6', emphasis: 'theme' },
  ],
}

describe('edgeAnimation', () => {
  it('groups outgoing edges from multiple root nodes into the same animation step', () => {
    const plan = buildEdgeAnimationPlan(diagram)

    expect(plan.edgeSteps).toEqual({
      'edge-1': 0,
      'edge-2': 0,
      'edge-3': 1,
      'edge-4': 1,
      'edge-5': 2,
    })
    expect(plan.totalSteps).toBe(3)
  })

  it('keeps earlier edges frozen after their active window until the loop restarts', () => {
    const plan = buildEdgeAnimationPlan(diagram)

    expect(getEdgeDashOffset({ mode: 'sequential', plan, edgeId: 'edge-1', elapsedMs: 0 })).toBe(0)
    expect(getEdgeDashOffset({ mode: 'sequential', plan, edgeId: 'edge-1', elapsedMs: 450 })).toBeCloseTo(-22, 2)
    expect(getEdgeDashOffset({ mode: 'sequential', plan, edgeId: 'edge-1', elapsedMs: plan.stepDurationMs })).toBe(-44)
    expect(getEdgeDashOffset({ mode: 'sequential', plan, edgeId: 'edge-3', elapsedMs: 450 })).toBe(0)
    expect(getEdgeDashOffset({ mode: 'sequential', plan, edgeId: 'edge-3', elapsedMs: plan.stepDurationMs + 450 })).toBeCloseTo(-22, 2)
  })

  it('keeps all edges moving together in all-active mode', () => {
    const plan = buildEdgeAnimationPlan(diagram)

    expect(getEdgeDashOffset({ mode: 'all-active', plan, edgeId: 'edge-1', elapsedMs: 1400 })).toBeCloseTo(-22, 2)
    expect(getEdgeDashOffset({ mode: 'all-active', plan, edgeId: 'edge-5', elapsedMs: 1400 })).toBeCloseTo(-22, 2)
  })
})
