import { describe, expect, it } from 'vitest'
import { extractJsonBodyFromFence, parseJsonBody } from './jsonFenceParser.mjs'

describe('jsonFenceParser', () => {
  it('extracts json from a fenced block even when extra text exists outside the block', () => {
    const text = [
      'Here is the result you requested:',
      '```json',
      '{"reply":"ok","state":"collecting_requirements","canExecute":false,"proposal":null}',
      '```',
      'Let me know if you want another version.',
    ].join('\n')

    expect(extractJsonBodyFromFence(text)).toBe('{"reply":"ok","state":"collecting_requirements","canExecute":false,"proposal":null}')
  })

  it('parses json from a fenced block even when extra text exists outside the block', () => {
    const text = [
      'prefix text',
      '```json',
      '{"meta":{"title":"Test","locale":"zh-CN","version":"0.1.0"},"lanes":[],"nodes":[],"edges":[]}',
      '```',
      'suffix text',
    ].join('\n')

    expect(parseJsonBody(text).parsed).toEqual({
      meta: {
        title: 'Test',
        locale: 'zh-CN',
        version: '0.1.0',
      },
      lanes: [],
      nodes: [],
      edges: [],
    })
  })
})
