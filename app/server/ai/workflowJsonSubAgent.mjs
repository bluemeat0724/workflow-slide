import { createWorkflowJsonClient } from './openaiClient.mjs'
import { createAiConfigurationError, normalizeAiError } from './errors.mjs'
import { parseJsonBody } from './jsonFenceParser.mjs'
import { buildWorkflowJsonSystemPrompt, buildWorkflowJsonUserPrompt } from './workflowJsonPrompt.mjs'

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

export function createWorkflowJsonSubAgent({
  clientConfig = createWorkflowJsonClient(),
  requestTimeoutMs = 45_000,
} = {}) {
  if (!clientConfig?.client || !clientConfig.model) {
    throw createAiConfigurationError('Workflow JSON sub-agent client configuration is incomplete.')
  }

  return {
    model: clientConfig.model,

    async generateWorkflowJsonText({ proposal, locale, themePresetId, theme, referenceDiagram }) {
      const baseMessages = [
        {
          role: 'system',
          content: buildWorkflowJsonSystemPrompt(),
        },
        {
          role: 'user',
          content: buildWorkflowJsonUserPrompt({
            proposal,
            locale,
            themePresetId,
            theme,
            referenceDiagram,
          }),
        },
      ]
      const retryCorrections = []
      const maxRetries = 3

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const messages = [
          ...baseMessages,
          ...retryCorrections,
          { role: 'assistant', content: '```json\n', prefix: true },
        ]
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)

        let generatedSuffix = ''

        try {
          const completion = await clientConfig.client.chat.completions.create({
            model: clientConfig.model,
            messages,
            stop: ['```'],
            ...(clientConfig.enableThinking ? { thinking: { type: 'enabled' } } : {}),
            ...(clientConfig.reasoningEffort ? { reasoning_effort: clientConfig.reasoningEffort } : {}),
          }, {
            signal: controller.signal,
          })

          generatedSuffix = extractTextContent(completion?.choices?.[0]?.message?.content)
          const fencedText = `\`\`\`json\n${generatedSuffix}\`\`\``
          return parseJsonBody(fencedText).jsonBody
        } catch (error) {
          clearTimeout(timeoutId)

          if (error && typeof error === 'object' && error.code === 'AI_RESPONSE_INVALID' && attempt < maxRetries) {
            const fencedText = generatedSuffix ? `\`\`\`json\n${generatedSuffix}\`\`\`` : ''
            console.warn('[workflow-json-agent] json-agent-retry', {
              attempt: attempt + 1,
              maxRetries,
              error: error.message,
              rawPreview: fencedText ? fencedText.slice(0, 280) : '(empty)',
            })

            retryCorrections.push(
              { role: 'assistant', content: fencedText || '(empty response)' },
              { role: 'user', content: 'Please return a valid fenced JSON payload.' },
            )
            continue
          }

          throw normalizeAiError(error, 'Workflow JSON generation failed.')
        }
      }
    },
  }
}
