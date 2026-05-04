import { createConversationClient } from './openaiClient.mjs'
import { createAiConfigurationError, createAiResponseInvalidError, normalizeAiError } from './errors.mjs'
import { parseJsonBody } from './jsonFenceParser.mjs'
import { getThemePresetById } from './serverThemePresets.mjs'
import { buildWorkflowConversationMessages, buildWorkflowConversationSystemPrompt } from './workflowConversationPrompt.mjs'

function summarizeContentParts(content) {
  if (!Array.isArray(content)) {
    return []
  }

  return content.map((part) => {
    if (typeof part === 'string') {
      return 'string'
    }

    if (!part || typeof part !== 'object') {
      return typeof part
    }

    return typeof part.type === 'string' ? part.type : 'object'
  })
}

function createResponseDiagnostics(completion) {
  const choice = completion?.choices?.[0]
  const message = choice?.message
  const content = message?.content

  return {
    finishReason: choice?.finish_reason ?? null,
    messageRole: message?.role ?? null,
    contentType: Array.isArray(content) ? 'array' : typeof content,
    contentPartTypes: summarizeContentParts(content),
    refusal: message?.refusal ?? null,
  }
}

function logConversationAgentDiagnostic(label, diagnostics) {
  console.warn(`[workflow-agent] ${label}`, diagnostics)
}

function extractTextContent(content) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object' && part.type === 'text') {
          return part.text ?? ''
        }

        return ''
      })
      .join('')
  }

  return ''
}

function extractJsonObjectText(text, diagnostics) {
  const trimmed = text.trim()
  if (!trimmed) {
    logConversationAgentDiagnostic('conversation-agent-empty-response', diagnostics)
    throw createAiResponseInvalidError('Conversation agent returned an empty response.', diagnostics)
  }

  try {
    return parseJsonBody(trimmed).jsonBody
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'AI_RESPONSE_INVALID') {
      logConversationAgentDiagnostic('conversation-agent-invalid-json', {
        ...diagnostics,
        rawPreview: trimmed.slice(0, 280),
      })
      throw createAiResponseInvalidError('Conversation agent did not return a valid fenced JSON payload.', {
        ...diagnostics,
        rawPreview: trimmed.slice(0, 280),
      })
    }

    throw error
  }
}

function parseConversationPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createAiResponseInvalidError('Conversation agent payload must be an object.')
  }

  const reply = typeof payload.reply === 'string' ? payload.reply.trim() : ''
  const state = payload.state
  const canExecute = payload.canExecute
  const proposal = payload.proposal

  if (!reply) {
    throw createAiResponseInvalidError('Conversation agent reply is required.', { payload })
  }

  if (state !== 'collecting_requirements' && state !== 'awaiting_execution_confirmation') {
    throw createAiResponseInvalidError('Conversation agent state is invalid.', { payload })
  }

  if (typeof canExecute !== 'boolean') {
    throw createAiResponseInvalidError('Conversation agent canExecute must be a boolean.', { payload })
  }

  if (canExecute !== (state === 'awaiting_execution_confirmation')) {
    throw createAiResponseInvalidError('Conversation agent state and canExecute do not match.', { payload })
  }

  if (proposal === null || proposal === undefined) {
    if (canExecute) {
      throw createAiResponseInvalidError('Conversation agent proposal is required before execution.', { payload })
    }

    return {
      reply,
      state,
      canExecute,
      proposal: null,
    }
  }

  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    throw createAiResponseInvalidError('Conversation agent proposal is invalid.', { payload })
  }

  if (typeof proposal.title !== 'string' || !proposal.title.trim()) {
    throw createAiResponseInvalidError('Conversation agent proposal title is invalid.', { payload })
  }

  if (typeof proposal.summary !== 'string' || !proposal.summary.trim()) {
    throw createAiResponseInvalidError('Conversation agent proposal summary is invalid.', { payload })
  }

  const themePresetId = typeof proposal.themePresetId === 'string' ? proposal.themePresetId.trim() : ''
  if (!themePresetId) {
    throw createAiResponseInvalidError('Conversation agent proposal themePresetId is required.', { payload })
  }

  const resolvedThemePreset = getThemePresetById(themePresetId)
  if (!resolvedThemePreset) {
    throw createAiResponseInvalidError('Conversation agent proposal themePresetId is invalid.', { payload })
  }

  return {
    reply,
    state,
    canExecute,
    proposal: {
      title: proposal.title.trim(),
      summary: proposal.summary.trim(),
      themePresetId: resolvedThemePreset.id,
    },
  }
}

export function createWorkflowConversationAgent({
  clientConfig = createConversationClient(),
  requestTimeoutMs = 30_000,
} = {}) {
  if (!clientConfig?.client || !clientConfig.model) {
    throw createAiConfigurationError('Conversation agent client configuration is incomplete.')
  }

  return {
    model: clientConfig.model,

    async generateReply(session) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)

      try {
        const completion = await clientConfig.client.chat.completions.create({
          model: clientConfig.model,
          messages: [
            {
              role: 'system',
              content: buildWorkflowConversationSystemPrompt({ locale: session.locale }),
            },
            ...buildWorkflowConversationMessages(session),
          ],
          ...(clientConfig.enableThinking ? { thinking: { type: 'enabled' } } : {}),
          ...(clientConfig.reasoningEffort ? { reasoning_effort: clientConfig.reasoningEffort } : {}),
        }, {
          signal: controller.signal,
        })

        const diagnostics = createResponseDiagnostics(completion)
        const rawContent = extractTextContent(completion?.choices?.[0]?.message?.content)
        console.log('[workflow-agent] conversation-agent-raw-response', rawContent)
        const jsonText = extractJsonObjectText(rawContent, diagnostics)
        return parseConversationPayload(JSON.parse(jsonText))
      } catch (error) {
        throw normalizeAiError(error, 'Conversation agent request failed.')
      } finally {
        clearTimeout(timeoutId)
      }
    },
  }
}
