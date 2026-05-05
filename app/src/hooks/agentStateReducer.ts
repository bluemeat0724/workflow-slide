import type { WorkflowAgentProposal, WorkflowAgentState } from '../api/contracts'
import type { WorkflowAgentMessage } from '../api/contracts'
import { createAgentUiMessage, type AgentLauncherPosition } from '../utils/agentHelpers'

export type AgentState = {
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

export type AgentAction =
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

export function agentStateReducer(state: AgentState, action: AgentAction): AgentState {
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
