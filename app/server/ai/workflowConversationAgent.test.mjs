import { describe, expect, it, vi } from 'vitest'
import { createWorkflowConversationAgent } from './workflowConversationAgent.mjs'
import { buildWorkflowConversationMessages } from './workflowConversationPrompt.mjs'

function createClientWithMessage(message, finishReason = 'stop') {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              finish_reason: finishReason,
              message,
            },
          ],
        }),
      },
    },
  }
}

function createClientWithContent(content) {
  return createClientWithMessage({ content })
}

describe('createWorkflowConversationAgent', () => {
  it('appends the fenced-json reminder to user messages only in the internal prompt', () => {
    const messages = buildWorkflowConversationMessages({
      state: 'collecting_requirements',
      proposal: null,
      messages: [
        { role: 'assistant', content: 'assistant reply' },
        { role: 'user', content: 'user request' },
      ],
    })

    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: 'assistant reply',
    })
    expect(messages[2]).toMatchObject({
      role: 'user',
      content: 'user request\n\nNever response without a fenced JSON block of the specified shape.',
    })
  })

  it('parses a valid structured response', async () => {
    const agent = createWorkflowConversationAgent({
      clientConfig: {
        client: createClientWithContent(`\`\`\`json
${JSON.stringify({
  reply: '方案已经完整，请确认是否执行。',
  state: 'awaiting_execution_confirmation',
  canExecute: true,
  proposal: {
    title: 'RAG 工作流',
    summary: '四个泳道，包含数据接入、索引、检索增强和答案生成。',
    themePresetId: 'azure',
  },
})}
\`\`\``),
        model: 'gpt-test',
      },
    })

    const result = await agent.generateReply({
      locale: 'zh-CN',
      messages: [],
    })

    expect(result).toMatchObject({
      state: 'awaiting_execution_confirmation',
      canExecute: true,
      proposal: {
        title: 'RAG 工作流',
        themePresetId: 'azure',
      },
    })
  })

  it('parses fenced json even when the model adds extra text outside the block', async () => {
    const agent = createWorkflowConversationAgent({
      clientConfig: {
        client: createClientWithContent([
          'Here is the structured result:',
          '```json',
          JSON.stringify({
            reply: '我先补充一个优化建议。',
            state: 'collecting_requirements',
            canExecute: false,
            proposal: null,
          }),
          '```',
          'End of result.',
        ].join('\n')),
        model: 'gpt-test',
      },
    })

    const result = await agent.generateReply({
      locale: 'zh-CN',
      messages: [],
    })

    expect(result).toMatchObject({
      reply: '我先补充一个优化建议。',
      state: 'collecting_requirements',
      canExecute: false,
      proposal: null,
    })
  })

  it('throws AI_RESPONSE_INVALID when payload shape is wrong', async () => {
    const agent = createWorkflowConversationAgent({
      clientConfig: {
        client: createClientWithContent('```json\n{"reply":"hello","state":"done","canExecute":false,"proposal":null}\n```'),
        model: 'gpt-test',
      },
    })

    await expect(agent.generateReply({
      locale: 'en-US',
      messages: [],
    })).rejects.toMatchObject({
      code: 'AI_RESPONSE_INVALID',
      status: 502,
    })
  })

  it('returns diagnostics for empty upstream content', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const agent = createWorkflowConversationAgent({
      clientConfig: {
        client: createClientWithMessage({
          role: 'assistant',
          content: [],
          refusal: null,
        }, 'length'),
        model: 'gpt-test',
      },
    })

    await expect(agent.generateReply({
      locale: 'en-US',
      messages: [],
    })).rejects.toMatchObject({
      code: 'AI_RESPONSE_INVALID',
      status: 502,
      details: {
        finishReason: 'length',
        contentType: 'array',
        contentPartTypes: [],
      },
    })

    expect(warnSpy).toHaveBeenCalledWith(
      '[workflow-agent] conversation-agent-empty-response',
      expect.objectContaining({
        finishReason: 'length',
        contentType: 'array',
      }),
    )

    warnSpy.mockRestore()
  })
})
