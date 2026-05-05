import { describe, expect, it } from 'vitest'
import { createEmptyDiagram } from '../data/createEmptyDiagram'
import { generateStandaloneHtml } from './exportHtml'
import { rebuildTheme } from './theme'

describe('generateStandaloneHtml', () => {
  it('uses theme-driven marker colors in exported html', () => {
    const diagram = createEmptyDiagram('en-US')
    diagram.theme = rebuildTheme(diagram.theme, {
      accent: '#0093d0',
      accentDeep: '#005bbb',
    })
    diagram.nodes = [
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
    ]
    diagram.edges = [
      {
        id: 'edge-1',
        fromNodeId: 'node-1',
        toNodeId: 'node-2',
        emphasis: 'theme',
      },
      {
        id: 'edge-2',
        fromNodeId: 'node-2',
        toNodeId: 'node-1',
        emphasis: 'soft',
      },
    ]

    const html = generateStandaloneHtml(diagram)

    expect(html).toContain('fill="#0093d0"')
    expect(html).toContain('fill="rgba(11, 11, 15, 0.28)"')
    expect(html).toContain('refX="7" refY="3"')
    expect(html).toContain('d="M0,0 L0,6 L8,3 z"')
    expect(html).toContain('const mode = "all-active"')
    expect(html).toContain('data-edge-id="edge-1"')
    expect(html).toContain('data-animation-step="0"')
    expect(html).toContain("edgeElement.style.setProperty('--edge-dash-offset'")
    expect(html).not.toContain('fill="rgba(209,0,0,.76)"')
  })
})
