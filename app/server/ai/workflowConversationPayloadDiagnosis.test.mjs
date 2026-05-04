import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createWorkflowConversationAgent } from './workflowConversationAgent.mjs'
import { createWorkflowExecutionService } from './workflowExecutionService.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const payloadFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dev_docs', 'test_payload.json'), 'utf8'),
)

function createRecordingClient(onCreate) {
  return {
    chat: {
      completions: {
        create: async (request) => {
          onCreate(request)

          return {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: '',
                  refusal: null,
                },
              },
            ],
          }
        },
      },
    },
  }
}

describe('workflow conversation payload diagnosis', () => {
  it('reproduces the empty-response error with the captured multi-turn payload and shows the exact upstream request shape', async () => {
    let recordedRequest = null
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const conversationAgent = createWorkflowConversationAgent({
      clientConfig: {
        client: createRecordingClient((request) => {
          recordedRequest = request
        }),
        model: 'gpt-test',
      },
    })

    const service = createWorkflowExecutionService({
      conversationAgent,
      workflowJsonSubAgent: {
        model: 'unused-test-model',
        generateWorkflowJsonText: async () => '{"meta":{"title":"unused","locale":"zh-CN","version":"0.1.0"},"lanes":[],"nodes":[],"edges":[]}',
      },
      workflowJsonNormalizer: () => ({
        diagram: {
          meta: { title: 'unused', locale: 'zh-CN', version: '0.1.0' },
          theme: {
            name: 'unused',
            bgPrimary: '#fff',
            boardBackground: '#fff',
            laneBackground: '#fff',
            textPrimary: '#000',
            textMuted: '#666',
            accent: '#f00',
            accentDeep: '#900',
            accentSoft: 'rgba(255,0,0,0.1)',
            lineSoft: 'rgba(0,0,0,0.1)',
          },
          lanes: [],
          nodes: [],
          edges: [],
        },
        warnings: [],
      }),
    })

    const session = await service.createWorkflowSession({ locale: 'zh-CN' })

    await expect(service.sendWorkflowMessage(session.sessionId, payloadFixture)).rejects.toMatchObject({
      code: 'AI_RESPONSE_INVALID',
      status: 502,
      message: 'Conversation agent returned an empty response.',
      details: {
        finishReason: 'stop',
        messageRole: 'assistant',
        contentType: 'string',
        contentPartTypes: [],
        refusal: null,
      },
    })

    expect(recordedRequest).toBeTruthy()
    expect(recordedRequest.model).toBe('gpt-test')
    expect(recordedRequest.response_format).toBeUndefined()
    expect(recordedRequest.messages).toHaveLength(payloadFixture.history.length + 3)
    expect(recordedRequest.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('Return exactly one ```json fenced block'),
    })
    expect(recordedRequest.messages[1]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('Current session state: collecting_requirements'),
    })
    expect(recordedRequest.messages[1]).toMatchObject({
      content: expect.stringContaining('Current proposal: none'),
    })
    expect(recordedRequest.messages[2]).toMatchObject({
      role: 'assistant',
      content: '请描述你想生成的 workflow，我会先和你确认方案，再进入执行。',
    })
    expect(recordedRequest.messages.at(-1)).toMatchObject({
      role: 'user',
      content: `${payloadFixture.message}\n\nNever response without a fenced JSON block of the specified shape.`,
    })

    expect(logSpy).toHaveBeenCalledWith('[workflow-agent] conversation-agent-raw-response', '')
    logSpy.mockRestore()
  })
})
