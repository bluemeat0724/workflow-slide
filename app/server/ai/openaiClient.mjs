import OpenAI from 'openai'
import { getAiConfig } from '../config.mjs'

function toClientConfig({ model, reasoningEffort, enableThinking, client }) {
  return {
    client,
    model,
    reasoningEffort,
    enableThinking,
  }
}

export function createClient(options) {
  return new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
  })
}

export function createConversationClient() {
  const config = getAiConfig()

  return toClientConfig({
    client: createClient({
      apiKey: config.apiKey,
      baseURL: config.apiBase,
    }),
    model: config.defaultModelName,
    reasoningEffort: config.defaultReasoningEffort,
    enableThinking: config.enableThinking,
  })
}

export function createWorkflowJsonClient() {
  const config = getAiConfig()

  return toClientConfig({
    client: createClient({
      apiKey: config.apiKey,
      baseURL: config.workflowJsonBaseUrl,
    }),
    model: config.workflowJsonModelName,
    reasoningEffort: config.defaultReasoningEffort,
    enableThinking: config.enableThinking,
  })
}
