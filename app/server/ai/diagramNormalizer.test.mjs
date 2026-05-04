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
})
