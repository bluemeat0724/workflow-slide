import { describe, expect, it } from 'vitest'
import { createWorkflowJsonSubAgent } from './workflowJsonSubAgent.mjs'

function createClientWithContent(content) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content,
              },
            },
          ],
        }),
      },
    },
  }
}

function createRecordingClient(onCreate, content = '{\n  "meta": { "title": "Test", "locale": "zh-CN", "version": "0.1.0" },\n  "lanes": [{ "key": "a", "title": "A", "subtitle": "" }],\n  "nodes": [],\n  "edges": []\n}\n') {
  return {
    chat: {
      completions: {
        create: async (request) => {
          onCreate(request)
          return {
            choices: [
              {
                message: {
                  content,
                },
              },
            ],
          }
        },
      },
    },
  }
}

describe('createWorkflowJsonSubAgent', () => {
  it('extracts the JSON body from prefix-generated content', async () => {
    const subAgent = createWorkflowJsonSubAgent({
      clientConfig: {
        client: createClientWithContent('{\n  "meta": { "title": "Test", "locale": "zh-CN", "version": "0.1.0" },\n  "lanes": [{ "key": "a", "title": "A", "subtitle": "" }],\n  "nodes": [],\n  "edges": []\n}\n'),
        model: 'deepseek-test',
      },
    })

    const jsonText = await subAgent.generateWorkflowJsonText({
      proposal: {
        title: 'Test',
        summary: 'Test summary',
      },
      locale: 'zh-CN',
      themePresetId: 'violet',
    })

    expect(JSON.parse(jsonText).meta.title).toBe('Test')
  })

  it('includes the current editor diagram as execution reference context when provided', async () => {
    let recordedRequest = null
    const subAgent = createWorkflowJsonSubAgent({
      clientConfig: {
        client: createRecordingClient((request) => {
          recordedRequest = request
        }),
        model: 'deepseek-test',
      },
    })

    await subAgent.generateWorkflowJsonText({
      proposal: {
        title: 'Refine Workflow',
        summary: '在现有流程图基础上增加审批节点。',
      },
      locale: 'zh-CN',
      themePresetId: 'violet',
      referenceDiagram: {
        meta: { title: 'Existing Workflow', locale: 'zh-CN', version: '0.1.0' },
        theme: { name: 'Violet', accent: '#7d2cff' },
        lanes: [{ id: 'lane-1', title: 'Main', subtitle: '', order: 0 }],
        nodes: [{ id: 'node-1', type: 'default', title: 'Start', description: '', tag: '', x: 0, y: 0, width: 18, height: 16 }],
        edges: [],
      },
    })

    expect(recordedRequest.messages[1].content).toContain('Existing editor diagram reference JSON:')
    expect(recordedRequest.messages[1].content).toContain('"title":"Existing Workflow"')
    expect(recordedRequest.messages[0].content).toContain('Use exactly one lane by default.')
    expect(recordedRequest.messages[0].content).toContain('Do not create lanes for sequential processing stages')
    expect(recordedRequest.messages[0].content).toContain('every node must provide a valid laneKey')
    expect(recordedRequest.messages[0].content).toContain('equal-height horizontal sections')
  })

  it('throws AI_RESPONSE_INVALID for malformed JSON', async () => {
    const subAgent = createWorkflowJsonSubAgent({
      clientConfig: {
        client: createClientWithContent('{not valid json'),
        model: 'deepseek-test',
      },
    })

    await expect(subAgent.generateWorkflowJsonText({
      proposal: {
        title: 'Broken',
        summary: 'Broken summary',
      },
      locale: 'en-US',
      themePresetId: 'azure',
    })).rejects.toMatchObject({
      code: 'AI_RESPONSE_INVALID',
      status: 502,
    })
  })
})
