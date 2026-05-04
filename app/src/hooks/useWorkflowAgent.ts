import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagramApiClient } from '../api/client'
import type { WorkflowAgentMessage, WorkflowAgentProposal, WorkflowAgentState } from '../api/contracts'
import type { Messages } from '../i18n'
import type { Diagram, Locale } from '../model/diagram'
import {
  AGENT_HISTORY_MAX_TURNS,
  AGENT_LAUNCHER_FALLBACK_HEIGHT,
  AGENT_LAUNCHER_FALLBACK_WIDTH,
  AGENT_LAUNCHER_STORAGE_KEY,
  type AgentLauncherPosition,
  clampValue,
  createAgentUiMessage,
  getApiErrorMessage,
  getLauncherBounds,
  isExecuteShortcut,
  loadLauncherPosition,
  sliceRecentAgentTurns,
} from '../utils/agentHelpers'

type UseWorkflowAgentConfig = {
  api: DiagramApiClient | null
  diagram: Diagram
  locale: Locale
  activeThemePresetId: string
  messages: Messages
  setStatus: (status: string) => void
  onDiagramApplied: (diagram: Diagram) => Promise<void>
}

export function useWorkflowAgent({
  api,
  diagram,
  locale,
  activeThemePresetId,
  messages,
  setStatus,
  onDiagramApplied,
}: UseWorkflowAgentConfig) {
  const [isAgentOpen, setIsAgentOpen] = useState(false)
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null)
  const [agentMessages, setAgentMessages] = useState<WorkflowAgentMessage[]>([])
  const [agentState, setAgentState] = useState<WorkflowAgentState>('collecting_requirements')
  const [agentProposal, setAgentProposal] = useState<WorkflowAgentProposal | null>(null)
  const [agentInput, setAgentInput] = useState('')
  const [isAgentLoading, setIsAgentLoading] = useState(false)
  const [isAgentExecuting, setIsAgentExecuting] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [agentLauncherPosition, setAgentLauncherPosition] = useState<AgentLauncherPosition>(loadLauncherPosition)
  const agentLauncherRef = useRef<HTMLButtonElement | null>(null)
  const agentSessionAbortRef = useRef<AbortController | null>(null)
  const agentMessageAbortRef = useRef<AbortController | null>(null)
  const agentExecuteAbortRef = useRef<AbortController | null>(null)
  const agentSessionPromiseRef = useRef<Promise<string> | null>(null)

  useEffect(() => {
    function clampLauncherPosition() {
      const launcher = agentLauncherRef.current
      const width = launcher?.offsetWidth ?? AGENT_LAUNCHER_FALLBACK_WIDTH
      const height = launcher?.offsetHeight ?? AGENT_LAUNCHER_FALLBACK_HEIGHT
      const bounds = getLauncherBounds(width, height)
      const nextPosition = {
        x: clampValue(agentLauncherPosition.x, bounds.minX, bounds.maxX),
        y: clampValue(agentLauncherPosition.y, bounds.minY, bounds.maxY),
      }

      if (nextPosition.x !== agentLauncherPosition.x || nextPosition.y !== agentLauncherPosition.y) {
        setAgentLauncherPosition(nextPosition)
        window.localStorage.setItem(AGENT_LAUNCHER_STORAGE_KEY, JSON.stringify(nextPosition))
      }
    }

    clampLauncherPosition()
    window.addEventListener('resize', clampLauncherPosition)
    return () => {
      window.removeEventListener('resize', clampLauncherPosition)
    }
  }, [agentLauncherPosition.x, agentLauncherPosition.y])

  const ensureAgentSession = useCallback(async () => {
    if (!api) {
      throw new Error('AI workflow agent requires api access.')
    }

    if (agentSessionId) {
      return agentSessionId
    }

    if (agentSessionPromiseRef.current) {
      return agentSessionPromiseRef.current
    }

    const promise = (async () => {
      agentSessionAbortRef.current?.abort()
      const controller = new AbortController()
      agentSessionAbortRef.current = controller

      const response = await api.createWorkflowSession({
        locale,
        themePresetId: activeThemePresetId,
        theme: diagram.theme,
        currentDiagram: diagram,
      }, controller.signal)

      setAgentSessionId(response.sessionId)
      setAgentState(response.state)
      setAgentProposal(null)
      setAgentMessages((current) => (
        current.length > 0
          ? current
          : [createAgentUiMessage('assistant', response.welcomeMessage)]
      ))
      setAgentError('')
      return response.sessionId
    })()

    agentSessionPromiseRef.current = promise

    try {
      return await promise
    } finally {
      agentSessionPromiseRef.current = null
    }
  }, [api, agentSessionId, locale, activeThemePresetId, diagram])

  const handleCloseAgent = useCallback(() => {
    setIsAgentOpen(false)
  }, [])

  const handleOpenAgent = useCallback(async () => {
    setIsAgentOpen(true)

    if (agentSessionId || !api) {
      return
    }

    setIsAgentLoading(true)
    try {
      await ensureAgentSession()
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentSessionCreateFailed)
      setAgentError(errorMessage)
      setAgentMessages((current) => [...current, createAgentUiMessage('assistant', errorMessage)])
      setStatus(errorMessage)
    } finally {
      setIsAgentLoading(false)
    }
  }, [agentSessionId, api, ensureAgentSession, messages, setStatus])

  const handleExecuteAgentProposal = useCallback(async () => {
    if (!api || !agentSessionId || !agentProposal || isAgentExecuting) {
      return
    }

    setIsAgentExecuting(true)
    setAgentError('')

    try {
      agentExecuteAbortRef.current?.abort()
      const controller = new AbortController()
      agentExecuteAbortRef.current = controller
      const response = await api.executeWorkflowSession(agentSessionId, {
        confirmed: true,
        proposalVersion: agentProposal.version,
        currentDiagram: diagram,
      }, controller.signal)

      await onDiagramApplied(response.diagram)

      setAgentState('completed')
      setAgentMessages((current) => {
        const nextMessages = [
          ...current,
          createAgentUiMessage('assistant', response.summary),
        ]

        if (response.warnings.length > 0) {
          nextMessages.push(createAgentUiMessage('assistant', response.warnings.join('\n')))
        }

        return nextMessages
      })
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentExecuteFailed)
      setAgentState('error')
      setAgentError(errorMessage)
      setAgentMessages((current) => [...current, createAgentUiMessage('assistant', errorMessage)])
      setStatus(errorMessage)
    } finally {
      setIsAgentExecuting(false)
    }
  }, [api, agentSessionId, agentProposal, isAgentExecuting, diagram, onDiagramApplied, messages, setStatus])

  const handleSendAgentMessage = useCallback(async () => {
    if (!api) {
      setAgentError(messages.status.agentSessionCreateFailed)
      return
    }

    const message = agentInput.trim()
    if (!message || isAgentLoading || isAgentExecuting) {
      return
    }

    if (agentState === 'awaiting_execution_confirmation' && isExecuteShortcut(message, locale)) {
      setAgentInput('')
      await handleExecuteAgentProposal()
      return
    }

    setIsAgentLoading(true)
    setAgentError('')
    setAgentInput('')

    try {
      const sessionId = await ensureAgentSession()
      agentMessageAbortRef.current?.abort()
      const controller = new AbortController()
      agentMessageAbortRef.current = controller
      setAgentMessages((current) => [...current, createAgentUiMessage('user', message)])
      const response = await api.sendWorkflowMessage(sessionId, {
        message,
        history: sliceRecentAgentTurns(agentMessages, AGENT_HISTORY_MAX_TURNS - 1),
        currentDiagram: diagram,
      }, controller.signal)

      setAgentMessages((current) => [...current, response.reply])
      setAgentState(response.state)
      setAgentProposal(response.proposal ?? null)
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentSendFailed)
      setAgentState('error')
      setAgentError(errorMessage)
      setAgentMessages((current) => [...current, createAgentUiMessage('assistant', errorMessage)])
      setStatus(errorMessage)
    } finally {
      setIsAgentLoading(false)
    }
  }, [api, agentInput, isAgentLoading, isAgentExecuting, agentState, locale, ensureAgentSession, agentMessages, diagram, messages, setStatus, handleExecuteAgentProposal])

  const handleAgentLauncherMouseDown = useCallback((event: import('react').MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return
    }

    const launcher = event.currentTarget
    agentLauncherRef.current = launcher
    const rect = launcher.getBoundingClientRect()
    const pointerOffsetX = event.clientX - rect.left
    const pointerOffsetY = event.clientY - rect.top
    let dragged = false

    function handleMouseMove(moveEvent: MouseEvent) {
      const bounds = getLauncherBounds(rect.width, rect.height)
      const nextPosition = {
        x: clampValue(moveEvent.clientX - pointerOffsetX, bounds.minX, bounds.maxX),
        y: clampValue(moveEvent.clientY - pointerOffsetY, bounds.minY, bounds.maxY),
      }

      if (!dragged && (Math.abs(moveEvent.clientX - event.clientX) > 4 || Math.abs(moveEvent.clientY - event.clientY) > 4)) {
        dragged = true
      }

      setAgentLauncherPosition(nextPosition)
      window.localStorage.setItem(AGENT_LAUNCHER_STORAGE_KEY, JSON.stringify(nextPosition))
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      if (dragged) {
        window.setTimeout(() => {
          launcher.dataset.dragging = 'false'
        }, 0)
        return
      }

      launcher.dataset.dragging = 'false'
    }

    launcher.dataset.dragging = 'true'
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleAgentLauncherClick = useCallback(() => {
    if (agentLauncherRef.current?.dataset.dragging === 'true') {
      return
    }

    void handleOpenAgent()
  }, [handleOpenAgent])

  const dispose = useCallback(() => {
    agentSessionAbortRef.current?.abort()
    agentMessageAbortRef.current?.abort()
    agentExecuteAbortRef.current?.abort()
  }, [])

  return {
    isAgentOpen,
    agentSessionId,
    agentMessages,
    agentState,
    agentProposal,
    agentInput,
    isAgentLoading,
    isAgentExecuting,
    agentError,
    agentLauncherPosition,
    setAgentInput,
    handleCloseAgent,
    handleAgentLauncherMouseDown,
    handleAgentLauncherClick,
    handleSendAgentMessage,
    handleExecuteAgentProposal,
    dispose,
  }
}
