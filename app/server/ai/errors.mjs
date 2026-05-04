export function createApiError(status, code, message, details) {
  return {
    name: 'ApiError',
    status,
    code,
    message,
    ...(details ? { details } : {}),
  }
}

export function createAiConfigurationError(message, details) {
  return createApiError(500, 'AI_CONFIGURATION_ERROR', message, details)
}

export function createAiResponseInvalidError(message, details) {
  return createApiError(502, 'AI_RESPONSE_INVALID', message, details)
}

export function createAiUpstreamError(message, details) {
  return createApiError(502, 'AI_UPSTREAM_ERROR', message, details)
}

export function createAiTimeoutError(message, details) {
  return createApiError(504, 'AI_TIMEOUT', message, details)
}

export function createValidationError(message, details) {
  return createApiError(400, 'VALIDATION_ERROR', message, details)
}

function isApiError(error) {
  return error && typeof error === 'object' && error.name === 'ApiError' && 'status' in error && 'code' in error
}

export function normalizeAiError(error, fallbackMessage = 'AI request failed.') {
  if (isApiError(error)) {
    return error
  }

  if (error?.name === 'AbortError') {
    return createAiTimeoutError(fallbackMessage, {
      cause: error.message,
    })
  }

  if (error?.status === 408 || error?.status === 504) {
    return createAiTimeoutError(fallbackMessage, {
      cause: error.message,
      upstreamStatus: error.status,
    })
  }

  if (error?.status === 401 || error?.status === 403) {
    return createAiConfigurationError('AI provider rejected the request credentials. Verify the API key and base URL configuration.', {
      cause: error.message,
      upstreamStatus: error.status,
    })
  }

  return createAiUpstreamError(fallbackMessage, {
    cause: error?.message ?? String(error),
    upstreamStatus: error?.status,
  })
}
