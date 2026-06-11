import { describe, expect, it } from 'vitest'
import { createWorkflowExecutionService } from './workflowExecutionService.mjs'

function createDiagram() {
  return {
    meta: {
      title: 'Generated Workflow',
      locale: 'zh-CN',
      version: '0.1.0',
    },
    theme: {
      name: 'Violet',
      bgPrimary: '#ffffff',
      boardBackground: 'linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))',
      laneBackground: 'linear-gradient(90deg, rgba(125, 44, 255, 0.05), rgba(255,255,255,0.72) 24%, rgba(255,255,255,0.84) 100%)',
      textPrimary: '#0b0b0f',
      textMuted: '#555563',
      accent: '#7d2cff',
      accentDeep: '#5b16c7',
      accentSoft: 'rgba(125, 44, 255, 0.08)',
      lineSoft: 'rgba(11, 11, 15, 0.28)',
    },
    lanes: [
      { id: 'lane-1', title: 'A', subtitle: '', order: 0 },
    ],
    nodes: [
      {
        id: 'node-1',
        type: 'default',
        title: 'Start',
        description: '',
        tag: '',
        x: 10,
        y: 10,
        width: 18,
        height: 16,
      },
    ],
    edges: [],
  }
}

function createRefinementDiagram() {
  return {
    ...createDiagram(),
    meta: {
      ...createDiagram().meta,
      title: 'Existing Workflow',
    },
    nodes: [
      {
        ...createDiagram().nodes[0],
        title: 'Existing Start',
      },
      {
        id: 'node-2',
        type: 'output',
        title: 'Existing End',
        description: '',
        tag: '',
        x: 40,
        y: 10,
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
}

describe('createWorkflowExecutionService', () => {
  it('progresses from requirements collection to execution', async () => {
    let conversationCall = 0
    const service = createWorkflowExecutionService({
      conversationAgent: {
        generateReply: async () => {
          conversationCall += 1

          if (conversationCall === 1) {
            return {
              reply: '还需要确认一下输出形式。',
              state: 'collecting_requirements',
              canExecute: false,
              proposal: null,
            }
          }

          return {
            reply: '方案已经整理好，请确认执行。',
            state: 'awaiting_execution_confirmation',
            canExecute: true,
            proposal: {
              title: 'RAG 工作流',
              summary: '四个泳道版本',
            },
          }
        },
      },
      workflowJsonSubAgent: {
        model: 'deepseek-test',
        generateWorkflowJsonText: async () => '{"meta":{"title":"RAG Workflow","locale":"zh-CN","version":"0.1.0"},"lanes":[{"key":"main","title":"Main","subtitle":""}],"nodes":[],"edges":[]}',
      },
      workflowJsonNormalizer: () => ({
        diagram: createDiagram(),
        warnings: [],
      }),
    })

    const session = await service.createWorkflowSession({ locale: 'zh-CN', theme: createDiagram().theme })
    const firstReply = await service.sendWorkflowMessage(session.sessionId, {
      message: '生成一个 RAG workflow',
    })
    const secondReply = await service.sendWorkflowMessage(session.sessionId, {
      message: '最终输出为回答结果',
    })
    const execution = await service.executeWorkflowSession(session.sessionId, {
      confirmed: true,
      proposalVersion: secondReply.proposal.version,
    })

    expect(firstReply.canExecute).toBe(false)
    expect(secondReply.canExecute).toBe(true)
    expect(secondReply.proposal.version).toBe(1)
    expect(execution.diagram.meta.title).toBe('Generated Workflow')
  })

  it('rejects stale proposal versions after requirements change', async () => {
    let conversationCall = 0
    const service = createWorkflowExecutionService({
      conversationAgent: {
        generateReply: async () => {
          conversationCall += 1
          return {
            reply: `第 ${conversationCall} 次提案`,
            state: 'awaiting_execution_confirmation',
            canExecute: true,
            proposal: {
              title: `提案 ${conversationCall}`,
              summary: `摘要 ${conversationCall}`,
            },
          }
        },
      },
      workflowJsonSubAgent: {
        model: 'deepseek-test',
        generateWorkflowJsonText: async () => '{"meta":{"title":"RAG Workflow","locale":"zh-CN","version":"0.1.0"},"lanes":[{"key":"main","title":"Main","subtitle":""}],"nodes":[],"edges":[]}',
      },
      workflowJsonNormalizer: () => ({
        diagram: createDiagram(),
        warnings: [],
      }),
    })

    const session = await service.createWorkflowSession({ locale: 'zh-CN', theme: createDiagram().theme })
    const firstProposal = await service.sendWorkflowMessage(session.sessionId, { message: '第一次需求' })
    const secondProposal = await service.sendWorkflowMessage(session.sessionId, { message: '修改需求' })

    expect(firstProposal.proposal.version).toBe(1)
    expect(secondProposal.proposal.version).toBe(2)

    await expect(service.executeWorkflowSession(session.sessionId, {
      confirmed: true,
      proposalVersion: firstProposal.proposal.version,
    })).rejects.toMatchObject({
      code: 'WORKFLOW_PROPOSAL_VERSION_MISMATCH',
      status: 409,
    })
  })

  it('rejects execute when confirmed is missing', async () => {
    const service = createWorkflowExecutionService({
      conversationAgent: {
        generateReply: async () => ({
          reply: '方案已经整理好，请确认执行。',
          state: 'awaiting_execution_confirmation',
          canExecute: true,
          proposal: {
            title: 'RAG 工作流',
            summary: '四个泳道版本',
          },
        }),
      },
      workflowJsonSubAgent: {
        model: 'deepseek-test',
        generateWorkflowJsonText: async () => '{"meta":{"title":"RAG Workflow","locale":"zh-CN","version":"0.1.0"},"lanes":[{"key":"main","title":"Main","subtitle":""}],"nodes":[],"edges":[]}',
      },
      workflowJsonNormalizer: () => ({
        diagram: createDiagram(),
        warnings: [],
      }),
    })

    const session = await service.createWorkflowSession({ locale: 'zh-CN', theme: createDiagram().theme })
    const proposal = await service.sendWorkflowMessage(session.sessionId, { message: '生成 workflow' })

    await expect(service.executeWorkflowSession(session.sessionId, {
      confirmed: false,
      proposalVersion: proposal.proposal.version,
    })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    })
  })

  it('uses frontend history and keeps only the latest 10 user turns', async () => {
    let capturedMessages = []
    const service = createWorkflowExecutionService({
      conversationAgent: {
        generateReply: async (session) => {
          capturedMessages = session.messages
          return {
            reply: '继续补充一下审批时限。',
            state: 'collecting_requirements',
            canExecute: false,
            proposal: null,
          }
        },
      },
      workflowJsonSubAgent: {
        model: 'deepseek-test',
        generateWorkflowJsonText: async () => '{"meta":{"title":"RAG Workflow","locale":"zh-CN","version":"0.1.0"},"lanes":[{"key":"main","title":"Main","subtitle":""}],"nodes":[],"edges":[]}',
      },
      workflowJsonNormalizer: () => ({
        diagram: createDiagram(),
        warnings: [],
      }),
    })

    const session = await service.createWorkflowSession({ locale: 'zh-CN', theme: createDiagram().theme })
    const history = Array.from({ length: 12 }, (_, index) => ([
      {
        id: `user-${index + 1}`,
        role: 'user',
        content: `需求 ${index + 1}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index, 0)).toISOString(),
      },
      {
        id: `assistant-${index + 1}`,
        role: 'assistant',
        content: `回复 ${index + 1}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index, 30)).toISOString(),
      },
    ])).flat()

    await service.sendWorkflowMessage(session.sessionId, {
      message: '最新需求',
      history,
    })

    expect(capturedMessages.map((message) => message.content)).toEqual([
      '需求 4',
      '回复 4',
      '需求 5',
      '回复 5',
      '需求 6',
      '回复 6',
      '需求 7',
      '回复 7',
      '需求 8',
      '回复 8',
      '需求 9',
      '回复 9',
      '需求 10',
      '回复 10',
      '需求 11',
      '回复 11',
      '需求 12',
      '回复 12',
      '最新需求',
    ])
  })

  it('allows requirement refinement after awaiting execution confirmation', async () => {
    const capturedSessions = []
    let conversationCall = 0
    const service = createWorkflowExecutionService({
      conversationAgent: {
        generateReply: async (session) => {
          capturedSessions.push(session)
          conversationCall += 1

          if (conversationCall === 1) {
            return {
              reply: '方案已经整理好，请确认执行。',
              state: 'awaiting_execution_confirmation',
              canExecute: true,
              proposal: {
                title: 'Chat History Workflow',
                summary: '包含最近消息窗口与基础摘要。',
              },
            }
          }

          return {
            reply: '已根据优化建议更新方案，请再次确认执行。',
            state: 'awaiting_execution_confirmation',
            canExecute: true,
            proposal: {
              title: 'Chat History Workflow v2',
              summary: '加入最近消息窗口、阈值触发摘要和摘要回填策略。',
            },
          }
        },
      },
      workflowJsonSubAgent: {
        model: 'deepseek-test',
        generateWorkflowJsonText: async () => '{"meta":{"title":"unused","locale":"zh-CN","version":"0.1.0"},"lanes":[{"key":"main","title":"Main","subtitle":""}],"nodes":[],"edges":[]}',
      },
      workflowJsonNormalizer: () => ({
        diagram: createDiagram(),
        warnings: [],
      }),
    })

    const session = await service.createWorkflowSession({ locale: 'zh-CN' })
    const firstProposal = await service.sendWorkflowMessage(session.sessionId, {
      message: '设计一份 chat-bot message history 管理流程',
    })
    const refinedProposal = await service.sendWorkflowMessage(session.sessionId, {
      message: '还可以怎么优化',
      history: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '请描述你想生成的 workflow，我会先和你确认方案，再进入执行。',
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString(),
        },
        {
          id: 'user-1',
          role: 'user',
          content: '设计一份 chat-bot message history 管理流程',
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 1)).toISOString(),
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          content: '方案已经整理好，请确认执行。',
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 2)).toISOString(),
        },
      ],
    })

    expect(firstProposal.state).toBe('awaiting_execution_confirmation')
    expect(refinedProposal.state).toBe('awaiting_execution_confirmation')
    expect(refinedProposal.proposal.version).toBe(2)
    expect(capturedSessions[1].state).toBe('awaiting_execution_confirmation')
    expect(capturedSessions[1].proposal).toEqual({
      version: 1,
      title: 'Chat History Workflow',
      summary: '包含最近消息窗口与基础摘要。',
      themePresetId: 'violet',
    })
  })

  it('passes the current diagram through conversation and execution as a reference context', async () => {
    const capturedSessions = []
    const capturedExecutionInputs = []
    const referenceDiagram = createRefinementDiagram()
    const service = createWorkflowExecutionService({
      conversationAgent: {
        generateReply: async (session) => {
          capturedSessions.push(session)
          return {
            reply: '方案已经更新，请确认执行。',
            state: 'awaiting_execution_confirmation',
            canExecute: true,
            proposal: {
              title: 'Existing Workflow v2',
              summary: '在现有 workflow 基础上增加审批分支。',
            },
          }
        },
      },
      workflowJsonSubAgent: {
        model: 'deepseek-test',
        generateWorkflowJsonText: async (input) => {
          capturedExecutionInputs.push(input)
          return '{"meta":{"title":"Existing Workflow v2","locale":"zh-CN","version":"0.1.0"},"lanes":[{"key":"main","title":"Main","subtitle":""}],"nodes":[],"edges":[]}'
        },
      },
      workflowJsonNormalizer: () => ({
        diagram: createDiagram(),
        warnings: [],
      }),
    })

    const session = await service.createWorkflowSession({
      locale: 'zh-CN',
      theme: referenceDiagram.theme,
      currentDiagram: referenceDiagram,
    })

    await service.sendWorkflowMessage(session.sessionId, {
      message: '在当前流程图基础上增加审批分支',
      currentDiagram: referenceDiagram,
    })

    await service.executeWorkflowSession(session.sessionId, {
      confirmed: true,
      proposalVersion: 1,
      currentDiagram: referenceDiagram,
    })

    expect(capturedSessions[0].referenceDiagram?.meta.title).toBe('Existing Workflow')
    expect(capturedSessions[0].referenceDiagram?.nodes).toHaveLength(2)
    expect(capturedExecutionInputs[0].referenceDiagram?.meta.title).toBe('Existing Workflow')
    expect(capturedExecutionInputs[0].referenceDiagram?.edges).toHaveLength(1)
  })

  it('uses the theme selected by the conversation proposal instead of the original diagram theme', async () => {
    const capturedExecutionInputs = []
    const referenceDiagram = createRefinementDiagram()
    const service = createWorkflowExecutionService({
      conversationAgent: {
        generateReply: async () => ({
          reply: '已将主题改为蓝色，请确认执行。',
          state: 'awaiting_execution_confirmation',
          canExecute: true,
          proposal: {
            title: 'Existing Workflow Blue',
            summary: '保持当前流程结构，仅将主题调整为蓝色。',
            themePresetId: 'azure',
          },
        }),
      },
      workflowJsonSubAgent: {
        model: 'deepseek-test',
        generateWorkflowJsonText: async (input) => {
          capturedExecutionInputs.push(input)
          return '{"meta":{"title":"Existing Workflow Blue","locale":"zh-CN","version":"0.1.0"},"lanes":[{"key":"main","title":"Main","subtitle":""}],"nodes":[],"edges":[]}'
        },
      },
      workflowJsonNormalizer: ({ theme }) => ({
        diagram: {
          ...createDiagram(),
          theme,
        },
        warnings: [],
      }),
    })

    const session = await service.createWorkflowSession({
      locale: 'zh-CN',
      themePresetId: 'violet',
      theme: referenceDiagram.theme,
      currentDiagram: referenceDiagram,
    })

    const proposal = await service.sendWorkflowMessage(session.sessionId, {
      message: '改成蓝色主题',
      currentDiagram: referenceDiagram,
    })

    const execution = await service.executeWorkflowSession(session.sessionId, {
      confirmed: true,
      proposalVersion: proposal.proposal.version,
      currentDiagram: referenceDiagram,
    })

    expect(proposal.proposal.themePresetId).toBe('azure')
    expect(capturedExecutionInputs[0].themePresetId).toBe('azure')
    expect(capturedExecutionInputs[0].theme?.name).toBe('Azure')
    expect(execution.diagram.theme.name).toBe('Azure')
    expect(execution.diagram.theme.accent).toBe('#0093d0')
  })
})
