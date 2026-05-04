import crypto from 'node:crypto'
import { createValidationError } from './errors.mjs'
import { createWorkflowConversationAgent } from './workflowConversationAgent.mjs'
import { createWorkflowJsonSubAgent } from './workflowJsonSubAgent.mjs'
import { createWorkflowSessionStore } from './workflowSessionStore.mjs'
import { normalizeWorkflowJson } from './diagramNormalizer.mjs'
import { getThemePresetById } from './serverThemePresets.mjs'

function buildWelcomeMessage(locale) {
  return locale === 'en-US'
    ? 'Describe the workflow you want to generate. I will refine the plan with you before execution.'
    : '请描述你想生成的 workflow，我会先和你确认方案，再进入执行。'
}

function buildSendMessageResponse({ reply, state, proposal }) {
  return {
    ok: true,
    reply,
    state,
    canExecute: state === 'awaiting_execution_confirmation',
    ...(proposal ? { proposal } : {}),
  }
}

function cloneReferenceDiagram(referenceDiagram) {
  return referenceDiagram ? JSON.parse(JSON.stringify(referenceDiagram)) : null
}

function normalizeReferenceDiagram(referenceDiagram) {
  if (!referenceDiagram || typeof referenceDiagram !== 'object' || Array.isArray(referenceDiagram)) {
    return null
  }

  const hasNodes = Array.isArray(referenceDiagram.nodes) && referenceDiagram.nodes.length > 0
  const hasEdges = Array.isArray(referenceDiagram.edges) && referenceDiagram.edges.length > 0

  if (!hasNodes && !hasEdges) {
    return null
  }

  return cloneReferenceDiagram(referenceDiagram)
}

function resolveThemeSelection(themePresetId, currentThemePresetId, currentTheme) {
  if (!themePresetId) {
    return {
      themePresetId: currentThemePresetId ?? null,
      theme: currentTheme ?? null,
    }
  }

  const preset = getThemePresetById(themePresetId)
  if (!preset) {
    return {
      themePresetId: currentThemePresetId ?? null,
      theme: currentTheme ?? null,
    }
  }

  return {
    themePresetId: preset.id,
    theme: preset.theme,
  }
}

function normalizeHistoryMessage(message, index) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw createValidationError('History message must be an object.', {
      field: `history[${index}]`,
    })
  }

  if (message.role !== 'user' && message.role !== 'assistant') {
    throw createValidationError('History message role must be user or assistant.', {
      field: `history[${index}].role`,
    })
  }

  const content = typeof message.content === 'string' ? message.content.trim() : ''
  if (!content) {
    throw createValidationError('History message content must not be empty.', {
      field: `history[${index}].content`,
    })
  }

  return {
    role: message.role,
    content,
  }
}

function normalizeConversationHistory(history, message, maxUserTurns = 10) {
  const normalizedHistory = Array.isArray(history)
    ? history.map((historyMessage, index) => normalizeHistoryMessage(historyMessage, index))
    : []

  const combinedMessages = [
    ...normalizedHistory,
    {
      role: 'user',
      content: message,
    },
  ]

  let userTurnCount = 0
  let startIndex = 0

  for (let index = combinedMessages.length - 1; index >= 0; index -= 1) {
    if (combinedMessages[index].role === 'user') {
      userTurnCount += 1
      if (userTurnCount > maxUserTurns) {
        startIndex = index + 1
        while (startIndex < combinedMessages.length && combinedMessages[startIndex].role !== 'user') {
          startIndex += 1
        }
        break
      }
    }
  }

  return combinedMessages.slice(startIndex)
}

export function createWorkflowExecutionService({
  sessionStore = createWorkflowSessionStore(),
  conversationAgent = createWorkflowConversationAgent(),
  workflowJsonSubAgent = createWorkflowJsonSubAgent(),
  workflowJsonNormalizer = normalizeWorkflowJson,
} = {}) {
  return {
    async createWorkflowSession({ locale = 'zh-CN', themePresetId = 'violet', theme = null, currentDiagram = null } = {}) {
      const session = sessionStore.createSession({
        locale,
        themePresetId,
        theme,
        referenceDiagram: normalizeReferenceDiagram(currentDiagram),
      })
      const welcomeMessage = buildWelcomeMessage(locale)

      return {
        ok: true,
        sessionId: session.sessionId,
        welcomeMessage,
        state: session.state,
      }
    },

    async sendWorkflowMessage(sessionId, { message, history, currentDiagram = null }) {
      const trimmedMessage = typeof message === 'string' ? message.trim() : ''
      if (!trimmedMessage) {
        throw createValidationError('Message must not be empty.', {
          field: 'message',
        })
      }

      let session = sessionStore.getSession(sessionId)
      const referenceDiagram = normalizeReferenceDiagram(currentDiagram) ?? session.referenceDiagram ?? null
      if (referenceDiagram) {
        session = sessionStore.setReferenceDiagram(sessionId, referenceDiagram)
      }
      const result = await conversationAgent.generateReply({
        ...session,
        referenceDiagram,
        messages: normalizeConversationHistory(history, trimmedMessage),
      })

      const currentProposal = session.proposal
      const nextProposal = result.proposal
      const proposalChanged = !!nextProposal && (
        !currentProposal ||
        currentProposal.title !== nextProposal.title ||
        currentProposal.summary !== nextProposal.summary ||
        currentProposal.themePresetId !== nextProposal.themePresetId
      )

      if (proposalChanged) {
        session = sessionStore.setProposal(sessionId, nextProposal)
      }

      if (nextProposal?.themePresetId) {
        const nextThemeSelection = resolveThemeSelection(nextProposal.themePresetId, session.themePresetId, session.theme)
        session = sessionStore.setThemeSelection(sessionId, nextThemeSelection)
      }

      if (result.state === 'awaiting_execution_confirmation') {
        session = sessionStore.markAwaitingExecution(sessionId)
      } else {
        session = sessionStore.markCollectingRequirements(sessionId)
      }

      const reply = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply,
        createdAt: new Date().toISOString(),
      }
      const responseProposal = result.state === 'awaiting_execution_confirmation'
        ? session.proposal
        : (proposalChanged ? session.proposal : undefined)

      return buildSendMessageResponse({
        reply,
        state: result.state,
        proposal: responseProposal,
      })
    },

    async executeWorkflowSession(sessionId, { confirmed, proposalVersion, currentDiagram = null }) {
      if (confirmed !== true) {
        throw createValidationError('Execution request must include confirmed=true.', {
          field: 'confirmed',
        })
      }

      const referenceDiagram = normalizeReferenceDiagram(currentDiagram)
      if (referenceDiagram) {
        sessionStore.setReferenceDiagram(sessionId, referenceDiagram)
      }

      const executingSession = sessionStore.markExecuting(sessionId, proposalVersion)
      const resolvedReferenceDiagram = referenceDiagram ?? executingSession.referenceDiagram ?? null

      try {
        const jsonText = await workflowJsonSubAgent.generateWorkflowJsonText({
          proposal: executingSession.proposal,
          locale: executingSession.locale,
          themePresetId: executingSession.themePresetId,
          theme: executingSession.theme,
          referenceDiagram: resolvedReferenceDiagram,
        })
        const { diagram, warnings } = workflowJsonNormalizer({
          jsonText,
          locale: executingSession.locale,
          themePresetId: executingSession.themePresetId,
          theme: executingSession.theme,
        })

        sessionStore.markCompleted(sessionId)

        return {
          ok: true,
          diagram,
          summary: executingSession.proposal.summary,
          warnings,
          meta: {
            model: workflowJsonSubAgent.model,
            sessionId,
            generator: 'sub-agent-prefix',
            normalized: true,
          },
        }
      } catch (error) {
        sessionStore.markError(sessionId)
        throw error
      }
    },
  }
}
