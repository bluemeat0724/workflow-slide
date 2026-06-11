import { describe, expect, it } from 'vitest'
import { normalizeWorkflowJson } from './diagramNormalizer.mjs'

describe('normalizeWorkflowJson', () => {
  it('normalizes semantic workflow JSON into a valid diagram', () => {
    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: {
          title: 'RAG Workflow',
          locale: 'zh-CN',
          version: '0.1.0',
        },
        lanes: [
          { key: 'data', title: 'Data', subtitle: '' },
          { key: 'answer', title: 'Answer', subtitle: '' },
        ],
        nodes: [
          { key: 'ingest', laneKey: 'data', type: 'default', title: 'Ingest', description: '', tag: 'input' },
          { key: 'llm', laneKey: 'answer', type: 'output', title: 'LLM', description: '', tag: 'output' },
          { key: 'broken', laneKey: 'missing', type: 'weird', title: '', description: '', tag: '' },
        ],
        edges: [
          { fromKey: 'ingest', toKey: 'llm', emphasis: 'theme' },
          { fromKey: 'broken', toKey: 'broken', emphasis: 'soft' },
        ],
      }),
      locale: 'zh-CN',
      themePresetId: 'unknown-theme',
    })

    expect(result.diagram.lanes).toHaveLength(2)
    expect(result.diagram.nodes).toHaveLength(3)
    expect(result.diagram.nodes.map((node) => node.laneId)).toEqual(['lane-1', 'lane-2', 'lane-1'])
    expect(result.diagram.nodes.every((node) => (
      node.x >= 0 && node.y >= 0 && node.x + node.width <= 100 && node.y + node.height <= 100
    ))).toBe(true)
    expect(result.diagram.edges).toHaveLength(1)
    expect(result.diagram.theme.name).toBe('Violet')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('prefers the provided session theme when normalizing workflow json', () => {
    const sessionTheme = {
      name: 'Teal',
      bgPrimary: '#ffffff',
      boardBackground: 'linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))',
      laneBackground: 'linear-gradient(90deg, rgba(0,163,154,0.05), rgba(255,255,255,0.72) 24%, rgba(255,255,255,0.84) 100%)',
      textPrimary: '#0b0b0f',
      textMuted: '#555563',
      accent: '#00a39a',
      accentDeep: '#0f766e',
      accentSoft: 'rgba(0, 163, 154, 0.08)',
      lineSoft: 'rgba(11, 11, 15, 0.28)',
    }

    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: { title: 'Custom Theme Workflow', locale: 'zh-CN', version: '0.1.0' },
        lanes: [{ key: 'main', title: 'Main', subtitle: '' }],
        nodes: [{ key: 'step-1', laneKey: 'main', type: 'default', title: 'Step', description: '', tag: '' }],
        edges: [],
      }),
      locale: 'zh-CN',
      themePresetId: 'unknown-theme',
      theme: sessionTheme,
    })

    expect(result.diagram.theme.name).toBe('Teal')
    expect(result.diagram.theme.accent).toBe('#00a39a')
    expect(result.warnings).not.toContain('Unknown theme preset "unknown-theme" was replaced with "violet".')
  })

  it('assigns nodes without laneKey to the default lane without warnings', () => {
    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: { title: 'Default Lane', locale: 'en-US', version: '0.1.0' },
        lanes: [{ key: 'main', title: 'Default Lane', subtitle: '' }],
        nodes: [
          { key: 'start', type: 'default', title: 'Start' },
          { key: 'end', laneKey: '', type: 'output', title: 'End' },
        ],
        edges: [{ fromKey: 'start', toKey: 'end', emphasis: 'theme' }],
      }),
      locale: 'en-US',
    })

    expect(result.diagram.nodes.map((node) => node.laneId)).toEqual(['lane-1', 'lane-1'])
    expect(result.warnings).toEqual([])
  })

  it('lays out nodes without shrinking them to assigned lane bounds', () => {
    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: { title: 'Lane Layout', locale: 'en-US', version: '0.1.0' },
        lanes: [
          { key: 'first', title: 'First', subtitle: '' },
          { key: 'second', title: 'Second', subtitle: '' },
        ],
        nodes: Array.from({ length: 5 }, (_, index) => ({
          key: `step-${index + 1}`,
          laneKey: 'second',
          type: 'default',
          title: `Step ${index + 1}`,
          description: '',
          tag: '',
        })),
        edges: [],
      }),
      locale: 'en-US',
    })

    const nodes = result.diagram.nodes
    expect(nodes.every((node) => node.laneId === 'lane-2' && node.width === 16 && node.height === 14)).toBe(true)
    nodes.forEach((node, index) => {
      nodes.slice(index + 1).forEach((other) => {
        const overlaps = node.x < other.x + other.width
          && node.x + node.width > other.x
          && node.y < other.y + other.height
          && node.y + node.height > other.y
        expect(overlaps).toBe(false)
      })
    })
  })

  it('uses edge topology for horizontal levels and vertical branches', () => {
    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: { title: 'Branch Layout', locale: 'en-US', version: '0.1.0' },
        lanes: [{ key: 'main', title: 'Branch Layout', subtitle: '' }],
        nodes: [
          { key: 'start', type: 'default', title: 'Start' },
          { key: 'left', type: 'default', title: 'Left' },
          { key: 'right', type: 'default', title: 'Right' },
          { key: 'end', type: 'output', title: 'End' },
        ],
        edges: [
          { fromKey: 'start', toKey: 'left', emphasis: 'soft' },
          { fromKey: 'start', toKey: 'right', emphasis: 'soft' },
          { fromKey: 'left', toKey: 'end', emphasis: 'theme' },
          { fromKey: 'right', toKey: 'end', emphasis: 'theme' },
        ],
      }),
      locale: 'en-US',
    })

    const [start, left, right, end] = result.diagram.nodes
    expect(start.x).toBeLessThan(left.x)
    expect(left.x).toBe(right.x)
    expect(left.y).not.toBe(right.y)
    expect(left.x).toBeLessThan(end.x)
  })

  it('softly places nodes near their assigned section while preserving topology', () => {
    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: { title: 'Section Layout', locale: 'zh-CN', version: '0.1.0' },
        lanes: [
          { key: 'processing', title: '数据处理', subtitle: '' },
          { key: 'answer', title: '问答', subtitle: '' },
        ],
        nodes: [
          { key: 'input', laneKey: 'processing', type: 'default', title: '文档输入' },
          { key: 'retrieve', laneKey: 'processing', type: 'default', title: '检索' },
          { key: 'generate', laneKey: 'answer', type: 'agent', title: '生成回答' },
          { key: 'output', laneKey: 'answer', type: 'output', title: '输出回答' },
        ],
        edges: [
          { fromKey: 'input', toKey: 'retrieve', emphasis: 'soft' },
          { fromKey: 'retrieve', toKey: 'generate', emphasis: 'theme' },
          { fromKey: 'generate', toKey: 'output', emphasis: 'soft' },
        ],
      }),
      locale: 'zh-CN',
    })

    const [input, retrieve, generate, output] = result.diagram.nodes
    expect(input.y + input.height / 2).toBeLessThan(50)
    expect(retrieve.y + retrieve.height / 2).toBeLessThan(50)
    expect(generate.y + generate.height / 2).toBeGreaterThanOrEqual(50)
    expect(output.y + output.height / 2).toBeGreaterThanOrEqual(50)
    expect(input.x).toBeLessThan(retrieve.x)
    expect(retrieve.x).toBeLessThan(generate.x)
  })

  it('places parallel nodes in their respective sections', () => {
    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: { title: 'Cross Section Branch', locale: 'en-US', version: '0.1.0' },
        lanes: [
          { key: 'system', title: 'System', subtitle: '' },
          { key: 'human', title: 'Human', subtitle: '' },
        ],
        nodes: [
          { key: 'start', laneKey: 'system', type: 'default', title: 'Start' },
          { key: 'auto', laneKey: 'system', type: 'agent', title: 'Automatic check' },
          { key: 'review', laneKey: 'human', type: 'default', title: 'Manual review' },
          { key: 'end', laneKey: 'system', type: 'output', title: 'End' },
        ],
        edges: [
          { fromKey: 'start', toKey: 'auto', emphasis: 'soft' },
          { fromKey: 'start', toKey: 'review', emphasis: 'soft' },
          { fromKey: 'auto', toKey: 'end', emphasis: 'theme' },
          { fromKey: 'review', toKey: 'end', emphasis: 'theme' },
        ],
      }),
      locale: 'en-US',
    })

    const [, automaticCheck, manualReview] = result.diagram.nodes
    expect(automaticCheck.x).toBe(manualReview.x)
    expect(automaticCheck.y + automaticCheck.height / 2).toBeLessThan(50)
    expect(manualReview.y + manualReview.height / 2).toBeGreaterThanOrEqual(50)
  })

  it('allows crowded section nodes to overflow softly without overlap', () => {
    const branchCount = 4
    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: { title: 'Crowded Section', locale: 'en-US', version: '0.1.0' },
        lanes: [
          { key: 'primary', title: 'Primary', subtitle: '' },
          { key: 'secondary', title: 'Secondary', subtitle: '' },
        ],
        nodes: [
          { key: 'start', laneKey: 'primary', type: 'default', title: 'Start' },
          ...Array.from({ length: branchCount }, (_, index) => ({
            key: `branch-${index + 1}`,
            laneKey: 'primary',
            type: 'default',
            title: `Branch ${index + 1}`,
          })),
          { key: 'end', laneKey: 'secondary', type: 'output', title: 'End' },
        ],
        edges: [
          ...Array.from({ length: branchCount }, (_, index) => ({
            fromKey: 'start',
            toKey: `branch-${index + 1}`,
            emphasis: 'soft',
          })),
          ...Array.from({ length: branchCount }, (_, index) => ({
            fromKey: `branch-${index + 1}`,
            toKey: 'end',
            emphasis: 'theme',
          })),
        ],
      }),
      locale: 'en-US',
    })

    const branches = result.diagram.nodes.slice(1, 1 + branchCount)
    branches.forEach((node, index) => {
      branches.slice(index + 1).forEach((other) => {
        expect(Math.abs(node.y - other.y)).toBeGreaterThanOrEqual(node.height)
      })
    })
    expect(branches.some((node) => node.y + node.height / 2 >= 50)).toBe(true)
  })

  it.each([8, 12])('wraps a %i-node linear workflow into multiple rows without overlap', (nodeCount) => {
    const result = normalizeWorkflowJson({
      jsonText: JSON.stringify({
        meta: { title: 'Long Workflow', locale: 'en-US', version: '0.1.0' },
        lanes: [{ key: 'main', title: 'Long Workflow', subtitle: '' }],
        nodes: Array.from({ length: nodeCount }, (_, index) => ({
          key: `step-${index + 1}`,
          type: index === nodeCount - 1 ? 'output' : 'default',
          title: `Step ${index + 1}`,
        })),
        edges: Array.from({ length: nodeCount - 1 }, (_, index) => ({
          fromKey: `step-${index + 1}`,
          toKey: `step-${index + 2}`,
          emphasis: 'theme',
        })),
      }),
      locale: 'en-US',
    })

    const nodes = result.diagram.nodes
    expect(new Set(nodes.map((node) => node.y))).toHaveLength(nodeCount / 4)
    nodes.forEach((node, index) => {
      nodes.slice(index + 1).forEach((other) => {
        const overlaps = node.x < other.x + other.width
          && node.x + node.width > other.x
          && node.y < other.y + other.height
          && node.y + node.height > other.y
        expect(overlaps).toBe(false)
      })
    })

    expect(nodes[3].x).toBe(nodes[4].x)
    expect(nodes[3].y).toBeLessThan(nodes[4].y)
  })
})
