import { describe, it, expect } from 'vitest'
import { agentStateReducer, type AgentState } from './agentStateReducer'

function createState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    isOpen: false,
    sessionId: null,
    messages: [],
    state: 'collecting_requirements',
    proposal: null,
    input: '',
    isLoading: false,
    isExecuting: false,
    error: '',
    launcherPosition: { x: 100, y: 100 },
    ...overrides,
  }
}

const now = '2026-05-06T00:00:00.000Z'

describe('agentStateReducer', () => {
  it('opens the agent', () => {
    const state = createState({ isOpen: false })
    const next = agentStateReducer(state, { type: 'open-agent' })
    expect(next.isOpen).toBe(true)
  })

  it('closes the agent', () => {
    const state = createState({ isOpen: true })
    const next = agentStateReducer(state, { type: 'close-agent' })
    expect(next.isOpen).toBe(false)
  })

  it('sets session with welcome message', () => {
    const state = createState()
    const next = agentStateReducer(state, {
      type: 'set-session',
      sessionId: 'session-1',
      state: 'collecting_requirements',
      welcomeMessage: 'Hello!',
    })
    expect(next.sessionId).toBe('session-1')
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0].role).toBe('assistant')
    expect(next.error).toBe('')
  })

  it('preserves existing messages when setting session', () => {
    const state = createState({
      messages: [{ id: '1', role: 'user', content: 'hi', createdAt: now }],
    })
    const next = agentStateReducer(state, {
      type: 'set-session',
      sessionId: 'session-2',
      state: 'collecting_requirements',
      welcomeMessage: 'Hello!',
    })
    expect(next.messages).toHaveLength(1)
  })

  it('transitions to loading state', () => {
    const state = createState({ error: 'old error' })
    const next = agentStateReducer(state, { type: 'start-loading' })
    expect(next.isLoading).toBe(true)
    expect(next.error).toBe('')
  })

  it('transitions to executing state', () => {
    const state = createState({ error: 'old error' })
    const next = agentStateReducer(state, { type: 'start-executing' })
    expect(next.isExecuting).toBe(true)
    expect(next.error).toBe('')
  })

  it('sets error state', () => {
    const state = createState()
    const next = agentStateReducer(state, { type: 'set-error', error: 'Something failed' })
    expect(next.error).toBe('Something failed')
    expect(next.state).toBe('error')
  })

  it('adds messages', () => {
    const state = createState({
      messages: [{ id: '1', role: 'user', content: 'hi', createdAt: now }],
    })
    const next = agentStateReducer(state, {
      type: 'add-messages',
      messages: [{ id: '2', role: 'assistant', content: 'hello', createdAt: now }],
    })
    expect(next.messages).toHaveLength(2)
  })
})
