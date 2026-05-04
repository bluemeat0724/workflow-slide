import type { WorkflowAgentMessage } from '../api/contracts'
import { ApiClientError } from '../api/client'
import type { Locale } from '../model/diagram'
import { createId } from './ids'

export const AGENT_LAUNCHER_STORAGE_KEY = 'workflow-agent-launcher-position'
export const AGENT_LAUNCHER_MARGIN = 24
export const AGENT_LAUNCHER_FALLBACK_WIDTH = 180
export const AGENT_LAUNCHER_FALLBACK_HEIGHT = 56
export const AGENT_HISTORY_MAX_TURNS = 10

export type AgentLauncherPosition = {
  x: number
  y: number
}

export function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function getLauncherBounds(width: number, height: number) {
  return {
    minX: AGENT_LAUNCHER_MARGIN,
    minY: AGENT_LAUNCHER_MARGIN,
    maxX: Math.max(AGENT_LAUNCHER_MARGIN, window.innerWidth - width - AGENT_LAUNCHER_MARGIN),
    maxY: Math.max(AGENT_LAUNCHER_MARGIN, window.innerHeight - height - AGENT_LAUNCHER_MARGIN),
  }
}

export function getDefaultLauncherPosition(): AgentLauncherPosition {
  const bounds = getLauncherBounds(AGENT_LAUNCHER_FALLBACK_WIDTH, AGENT_LAUNCHER_FALLBACK_HEIGHT)

  return {
    x: bounds.maxX,
    y: bounds.maxY,
  }
}

export function loadLauncherPosition(): AgentLauncherPosition {
  if (typeof window === 'undefined') {
    return getDefaultLauncherPosition()
  }

  const rawValue = window.localStorage.getItem(AGENT_LAUNCHER_STORAGE_KEY)
  if (!rawValue) {
    return getDefaultLauncherPosition()
  }

  try {
    const parsed = JSON.parse(rawValue) as { x?: number; y?: number }
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { x: parsed.x, y: parsed.y }
    }
  } catch {
    window.localStorage.removeItem(AGENT_LAUNCHER_STORAGE_KEY)
  }

  return getDefaultLauncherPosition()
}

export function createAgentUiMessage(role: WorkflowAgentMessage['role'], content: string): WorkflowAgentMessage {
  return {
    id: createId('agent-message'),
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

export function sliceRecentAgentTurns(messages: WorkflowAgentMessage[], maxUserTurns: number) {
  if (maxUserTurns <= 0 || messages.length === 0) {
    return []
  }

  let userTurnCount = 0
  let startIndex = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      userTurnCount += 1
      if (userTurnCount > maxUserTurns) {
        startIndex = index + 1
        while (startIndex < messages.length && messages[startIndex].role !== 'user') {
          startIndex += 1
        }
        break
      }
    }
  }

  return messages.slice(startIndex)
}

export function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiClientError) {
    return error.payload?.message ?? error.message ?? fallbackMessage
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

export function isExecuteShortcut(value: string, locale: Locale) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  const shortcuts = locale === 'zh-CN'
    ? ['执行', '确认执行', '开始执行']
    : ['execute', 'run', 'confirm']

  return shortcuts.includes(normalized)
}
