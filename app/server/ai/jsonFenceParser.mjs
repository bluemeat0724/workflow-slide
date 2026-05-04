import { createAiResponseInvalidError } from './errors.mjs'

export function extractJsonBodyFromFence(text) {
  const trimmed = text.trim()
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/)

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1).trim()
  }

  throw createAiResponseInvalidError('Workflow JSON response did not contain a JSON object.', {
    rawText: trimmed,
  })
}

export function parseJsonBody(text) {
  const jsonBody = extractJsonBodyFromFence(text)

  try {
    return {
      jsonBody,
      parsed: JSON.parse(jsonBody),
    }
  } catch (error) {
    throw createAiResponseInvalidError('Workflow JSON response could not be parsed.', {
      rawText: text,
      cause: error.message,
    })
  }
}
