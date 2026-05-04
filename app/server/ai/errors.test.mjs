import { describe, expect, it } from 'vitest'
import { createValidationError, normalizeAiError } from './errors.mjs'

describe('normalizeAiError', () => {
  it('preserves existing ApiError values', () => {
    const error = createValidationError('Message must not be empty.')

    expect(normalizeAiError(error)).toBe(error)
  })

  it('maps upstream auth failures to configuration errors', () => {
    const normalized = normalizeAiError({
      status: 401,
      message: 'Invalid API key',
    }, 'Conversation agent request failed.')

    expect(normalized).toMatchObject({
      status: 500,
      code: 'AI_CONFIGURATION_ERROR',
      message: 'AI provider rejected the request credentials. Verify the API key and base URL configuration.',
      details: {
        cause: 'Invalid API key',
        upstreamStatus: 401,
      },
    })
  })
})
