import { useCallback, useEffect, useReducer, useRef } from 'react'
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

type AgentState = {
  isOpen: boolean
  sessionId: string | null
  messages: WorkflowAgentMessage[]
  state: WorkflowAgentState
  proposal: WorkflowAgentProposal | null
  input: string
  isLoading: boolean
  isExecuting: boolean
  error: string
  launcherPosition: AgentLauncherPosition
}

type AgentAction =
  | { type: 'open-agent' }
  | { type: 'close-agent' }
  | { type: 'set-session'; sessionId: string; state: WorkflowAgentState; welcomeMessage: string }
  | { type: 'set-input'; input: string }
  | { type: 'start-loading' }
  | { type: 'stop-loading' }
  | { type: 'start-executing' }
  | { type: 'stop-executing' }
  | { type: 'set-error'; error: string }
  | { type: 'set-state'; state: WorkflowAgentState }
  | { type: 'set-proposal'; proposal: WorkflowAgentProposal | null }
  | { type: 'add-messages'; messages: WorkflowAgentMessage[] }
  | { type: 'set-launcher-position'; position: AgentLauncherPosition }

function agentStateReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'open-agent':
      return { ...state, isOpen: true }
    case 'close-agent':
      return { ...state, isOpen: false }
    case 'set-session':
      return {
        ...state,
        sessionId: action.sessionId,
        state: action.state,
        proposal: null,
        error: '',
        messages: state.messages.length > 0 ? state.messages : [createAgentUiMessage('assistant', action.welcomeMessage)],
      }
    case 'set-input':
      return { ...state, input: action.input }
    case 'start-loading':
      return { ...state, isLoading: true, error: '' }
    case 'stop-loading':
      return { ...state, isLoading: false }
    case 'start-executing':
      return { ...state, isExecuting: true, error: '' }
    case 'stop-executing':
      return { ...state, isExecuting: false }
    case 'set-error':
      return { ...state, error: action.error, state: 'error' }
    case 'set-state':
      return { ...state, state: action.state }
    case 'set-proposal':
      return { ...state, proposal: action.proposal }
    case 'add-messages':
      return { ...state, messages: [...state.messages, ...action.messages] }
    case 'set-launcher-position':
      return { ...state, launcherPosition: action.position }
  }
}

const initialAgentState: AgentState = {
  isOpen: false,
  sessionId: null,
  messages: [],
  state: 'collecting_requirements',
  proposal: null,
  input: '',
  isLoading: false,
  isExecuting: false,
  error: '',
  launcherPosition: loadLauncherPosition(),
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
  const [agentState, dispatch] = useReducer(agentStateReducer, initialAgentState)
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
        x: clampValue(agentState.launcherPosition.x, bounds.minX, bounds.maxX),
        y: clampValue(agentState.launcherPosition.y, bounds.minY, bounds.maxY),
      }

      if (nextPosition.x !== agentState.launcherPosition.x || nextPosition.y !== agentState.launcherPosition.y) {
        dispatch({ type: 'set-launcher-position', position: nextPosition })
        window.localStorage.setItem(AGENT_LAUNCHER_STORAGE_KEY, JSON.stringify(nextPosition))
      }
    }

    clampLauncherPosition()
    window.addEventListener('resize', clampLauncherPosition)
    return () => {
      window.removeEventListener('resize', clampLauncherPosition)
    }
  }, [agentState.launcherPosition.x, agentState.launcherPosition.y])

  const ensureAgentSession = useCallback(async () => {
    if (!api) {
      throw new Error('AI workflow agent requires api access.')
    }

    if (agentState.sessionId) {
      return agentState.sessionId
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

      dispatch({ type: 'set-session', sessionId: response.sessionId, state: response.state, welcomeMessage: response.welcomeMessage })
      return response.sessionId
    })()

    agentSessionPromiseRef.current = promise

    try {
      return await promise
    } finally {
      agentSessionPromiseRef.current = null
    }
  }, [api, agentState.sessionId, locale, activeThemePresetId, diagram])

  const handleCloseAgent = useCallback(() => {
    dispatch({ type: 'close-agent' })
  }, [])

  const handleOpenAgent = useCallback(async () => {
    dispatch({ type: 'open-agent' })

    if (agentState.sessionId || !api) {
      return
    }

    dispatch({ type: 'start-loading' })
    try {
      await ensureAgentSession()
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentSessionCreateFailed)
      dispatch({ type: 'set-error', error: errorMessage })
      dispatch({ type: 'add-messages', messages: [createAgentUiMessage('assistant', errorMessage)] })
      setStatus(errorMessage)
    } finally {
      dispatch({ type: 'stop-loading' })
    }
  }, [agentState.sessionId, api, ensureAgentSession, messages, setStatus])

  const handleExecuteAgentProposal = useCallback(async () => {
    if (!api || !agentState.sessionId || !agentState.proposal || agentState.isExecuting) {
      return
    }

    dispatch({ type: 'start-executing' })
    dispatch({ type: 'set-error', error: '' })

    try {
      agentExecuteAbortRef.current?.abort()
      const controller = new AbortController()
      agentExecuteAbortRef.current = controller
      const response = await api.executeWorkflowSession(agentState.sessionId, {
        confirmed: true,
        proposalVersion: agentState.proposal.version,
        currentDiagram: diagram,
      }, controller.signal)

      await onDiagramApplied(response.diagram)

      dispatch({ type: 'set-state', state: 'completed' })
      const completionMessages = [createAgentUiMessage('assistant', response.summary)]
      if (response.warnings.length > 0) {
        completionMessages.push(createAgentUiMessage('assistant', response.warnings.join('\n')))
      }
      dispatch({ type: 'add-messages', messages: completionMessages })
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentExecuteFailed)
      dispatch({ type: 'set-error', error: errorMessage })
      dispatch({ type: 'add-messages', messages: [createAgentUiMessage('assistant', errorMessage)] })
      setStatus(errorMessage)
    } finally {
      dispatch({ type: 'stop-executing' })
    }
  }, [api, agentState.sessionId, agentState.proposal, agentState.isExecuting, diagram, onDiagramApplied, messages, setStatus])

  const handleSendAgentMessage = useCallback(async () => {
    if (!api) {
      dispatch({ type: 'set-error', error: messages.status.agentSessionCreateFailed })
      return
    }

    const message = agentState.input.trim()
    if (!message || agentState.isLoading || agentState.isExecuting) {
      return
    }

    if (agentState.state === 'awaiting_execution_confirmation' && isExecuteShortcut(message, locale)) {
      dispatch({ type: 'set-input', input: '' })
      await handleExecuteAgentProposal()
      return
    }

    dispatch({ type: 'start-loading' })
    dispatch({ type: 'set-input', input: '' })

    try {
      const sessionId = await ensureAgentSession()
      agentMessageAbortRef.current?.abort()
      const controller = new AbortController()
      agentMessageAbortRef.current = controller
      dispatch({ type: 'add-messages', messages: [createAgentUiMessage('user', message)] })
      const response = await api.sendWorkflowMessage(sessionId, {
        message,
        history: sliceRecentAgentTurns(agentState.messages, AGENT_HISTORY_MAX_TURNS - 1),
        currentDiagram: diagram,
      }, controller.signal)

      dispatch({ type: 'add-messages', messages: [response.reply] })
      dispatch({ type: 'set-state', state: response.state })
      dispatch({ type: 'set-proposal', proposal: response.proposal ?? null })
    } catch (error) {
      const errorMessage = getApiErrorMessage(error, messages.status.agentSendFailed)
      dispatch({ type: 'set-error', error: errorMessage })
      dispatch({ type: 'add-messages', messages: [createAgentUiMessage('assistant', errorMessage)] })
      setStatus(errorMessage)
    } finally {
      dispatch({ type: 'stop-loading' })
    }
  }, [api, agentState.input, agentState.isLoading, agentState.isExecuting, agentState.state, agentState.messages, locale, diagram, messages, ensureAgentSession, setStatus, handleExecuteAgentProposal])

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

      dispatch({ type: 'set-launcher-position', position: nextPosition })
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

  const setAgentInput = useCallback((input: string) => {
    dispatch({ type: 'set-input', input })
  }, [])

  return {
    isAgentOpen: agentState.isOpen,
    agentSessionId: agentState.sessionId,
    agentMessages: agentState.messages,
    agentState: agentState.state,
    agentProposal: agentState.proposal,
    agentInput: agentState.input,
    isAgentLoading: agentState.isLoading,
    isAgentExecuting: agentState.isExecuting,
    agentError: agentState.error,
    agentLauncherPosition: agentState.launcherPosition,
    setAgentInput,
    handleCloseAgent,
    handleAgentLauncherMouseDown,
    handleAgentLauncherClick,
    handleSendAgentMessage,
    handleExecuteAgentProposal,
    dispose,
  }
}
