import { describe, expect, it } from 'vitest'
import { generatePresentationHtml } from './exportTemplate.mjs'

describe('generatePresentationHtml', () => {
  it('keeps exported arrow markers aligned with editor proportions', () => {
    const diagram = {
      meta: {
        title: 'Workflow',
        locale: 'en-US',
        edgeAnimationMode: 'sequential',
      },
      theme: {
        accent: '#0093d0',
        accentDeep: '#005bbb',
        textPrimary: '#0b0b0f',
        textMuted: 'rgba(11, 11, 15, 0.56)',
        bgPrimary: '#f3f7fb',
        lineSoft: 'rgba(11, 11, 15, 0.28)',
      },
      lanes: [
        {
          id: 'lane-1',
          title: 'Input',
          subtitle: 'source',
        },
      ],
      nodes: [
        {
          id: 'node-1',
          laneId: 'lane-1',
          type: 'default',
          title: 'Source',
          description: 'Start',
          tag: '',
          x: 10,
          y: 20,
          width: 18,
          height: 16,
        },
        {
          id: 'node-2',
          laneId: 'lane-1',
          type: 'output',
          title: 'Target',
          description: 'End',
          tag: '',
          x: 56,
          y: 20,
          width: 18,
          height: 16,
        },
      ],
      edges: [
        {
          id: 'edge-1',
          fromNodeId: 'node-1',
          toNodeId: 'node-2',
          emphasis: 'theme',
        },
      ],
    }

    const html = generatePresentationHtml(diagram)

    expect(html).toContain('stroke-width: 3;')
    expect(html).toContain('stroke-dasharray: 14 9;')
    expect(html).toContain('data-edge-id="edge-1"')
    expect(html).toContain('data-animation-mode="sequential"')
    expect(html).toContain('data-animation-step="0"')
    expect(html).toContain('stroke-dashoffset: var(--edge-dash-offset, 0);')
    expect(html).toContain('window.__setEdgeAnimationElapsedMs = (elapsedMs) => {')
    expect(html).toContain('const mode = "sequential"')
    expect(html).toContain('refX="7" refY="3"')
    expect(html).toContain('d="M0,0 L0,6 L8,3 z"')
  })
})
