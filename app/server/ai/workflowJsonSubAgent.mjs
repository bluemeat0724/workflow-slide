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
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)

      try {
        const completion = await clientConfig.client.chat.completions.create({
          model: clientConfig.model,
          messages: [
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
            {
              role: 'assistant',
              content: '```json\n',
              prefix: true,
            },
          ],
          stop: ['```'],
          ...(clientConfig.enableThinking ? { thinking: { type: 'enabled' } } : {}),
          ...(clientConfig.reasoningEffort ? { reasoning_effort: clientConfig.reasoningEffort } : {}),
        }, {
          signal: controller.signal,
        })

        const generatedSuffix = extractTextContent(completion?.choices?.[0]?.message?.content)
        const fencedText = `\`\`\`json\n${generatedSuffix}\`\`\``
        return parseJsonBody(fencedText).jsonBody
      } catch (error) {
        throw normalizeAiError(error, 'Workflow JSON generation failed.')
      } finally {
        clearTimeout(timeoutId)
      }
    },
  }
}
