import { afterEach, describe, expect, it } from 'vitest'
import { getAiConfig, resolveWorkflowJsonBaseUrl } from './config.mjs'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value
  }
})

describe('resolveWorkflowJsonBaseUrl', () => {
  it('reuses the explicit workflow json base url when provided', () => {
    expect(resolveWorkflowJsonBaseUrl({
      apiBase: 'https://api.deepseek.com',
      workflowJsonBaseUrl: 'https://api.deepseek.com/beta',
    })).toBe('https://api.deepseek.com/beta')
  })

  it('adds /beta for deepseek prefix generation when omitted', () => {
    expect(resolveWorkflowJsonBaseUrl({
      apiBase: 'https://api.deepseek.com',
      workflowJsonBaseUrl: undefined,
    })).toBe('https://api.deepseek.com/beta')
  })

  it('preserves non-deepseek api bases', () => {
    expect(resolveWorkflowJsonBaseUrl({
      apiBase: 'https://api.openai.com/v1',
      workflowJsonBaseUrl: undefined,
    })).toBe('https://api.openai.com/v1')
  })
})

describe('getAiConfig', () => {
  it('derives the workflow json base url from deepseek api base', () => {
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.DEFAULT_MODEL_NAME = 'deepseek-chat'
    process.env.OPENAI_API_BASE = 'https://api.deepseek.com'
    delete process.env.WORKFLOW_JSON_BASE_URL

    expect(getAiConfig().workflowJsonBaseUrl).toBe('https://api.deepseek.com/beta')
  })
})
