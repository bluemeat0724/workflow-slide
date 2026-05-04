import { describe, expect, it } from 'vitest'
import { createWorkflowSessionStore } from './workflowSessionStore.mjs'

function createNowSequence(startAt) {
  let current = startAt
  return () => {
    const value = current
    current += 1000
    return value
  }
}

function captureError(run) {
  try {
    run()
    return null
  } catch (error) {
    return error
  }
}

function createReferenceDiagram() {
  return {
    meta: {
      title: 'Current Workflow',
      locale: 'zh-CN',
      version: '0.1.0',
    },
    theme: {
      name: 'Violet',
      bgPrimary: '#ffffff',
      boardBackground: '#fff',
      laneBackground: '#fff',
      textPrimary: '#000',
      textMuted: '#666',
      accent: '#7d2cff',
      accentDeep: '#5b16c7',
      accentSoft: 'rgba(125, 44, 255, 0.08)',
      lineSoft: 'rgba(0, 0, 0, 0.1)',
    },
    lanes: [
      { id: 'lane-1', title: 'Main', subtitle: '', order: 0 },
    ],
    nodes: [
      {
        id: 'node-1',
        laneId: 'lane-1',
        type: 'default',
        title: 'Start',
        description: '',
        tag: '',
        x: 10,
        y: 10,
        width: 18,
        height: 16,
      },
    ],
    edges: [],
  }
}

describe('createWorkflowSessionStore', () => {
  it('creates sessions with default state and metadata', () => {
    const store = createWorkflowSessionStore({
      now: createNowSequence(Date.UTC(2026, 0, 1, 0, 0, 0)),
    })

    const session = store.createSession({
      locale: 'en-US',
      themePresetId: 'azure',
      theme: {
        name: 'Azure',
        bgPrimary: '#ffffff',
        boardBackground: 'linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))',
        laneBackground: 'linear-gradient(90deg, rgba(0,147,208,0.05), rgba(255,255,255,0.72) 24%, rgba(255,255,255,0.84) 100%)',
        textPrimary: '#0b0b0f',
        textMuted: '#555563',
        accent: '#0093d0',
        accentDeep: '#005bbb',
        accentSoft: 'rgba(0, 147, 208, 0.08)',
        lineSoft: 'rgba(11, 11, 15, 0.28)',
      },
      referenceDiagram: createReferenceDiagram(),
    })

    expect(session.state).toBe('collecting_requirements')
    expect(session.proposalVersion).toBe(0)
    expect(session.locale).toBe('en-US')
    expect(session.themePresetId).toBe('azure')
    expect(session.theme?.accent).toBe('#0093d0')
    expect(session.referenceDiagram?.meta.title).toBe('Current Workflow')
    expect(session.messages).toEqual([])
  })

  it('updates the reference diagram inside the session', () => {
    const store = createWorkflowSessionStore()
    const session = store.createSession()
    const referenceDiagram = createReferenceDiagram()
    const updated = store.setReferenceDiagram(session.sessionId, referenceDiagram)

    expect(updated.referenceDiagram?.meta.title).toBe('Current Workflow')

    referenceDiagram.meta.title = 'Mutated Outside'
    expect(store.getSession(session.sessionId).referenceDiagram?.meta.title).toBe('Current Workflow')
  })

  it('increments proposal version and resets execution gate on new proposal', () => {
    const store = createWorkflowSessionStore()
    const session = store.createSession()

    store.setProposal(session.sessionId, {
      title: 'Initial workflow',
      summary: 'First summary',
    })
    store.markAwaitingExecution(session.sessionId)

    const updated = store.setProposal(session.sessionId, {
      title: 'Updated workflow',
      summary: 'Revised summary',
    })

    expect(updated.state).toBe('collecting_requirements')
    expect(updated.proposalVersion).toBe(2)
    expect(updated.proposal).toEqual({
      version: 2,
      title: 'Updated workflow',
      summary: 'Revised summary',
      themePresetId: null,
    })
  })

  it('blocks execution before confirmation state', () => {
    const store = createWorkflowSessionStore()
    const session = store.createSession()

    store.setProposal(session.sessionId, {
      title: 'Approval flow',
      summary: 'Need review then approve',
    })

    const error = captureError(() => store.markExecuting(session.sessionId, 1))

    expect(error).toMatchObject({
      code: 'WORKFLOW_SESSION_STATE_INVALID',
      status: 409,
    })
  })

  it('rejects stale proposal versions during execution', () => {
    const store = createWorkflowSessionStore()
    const session = store.createSession()

    store.setProposal(session.sessionId, {
      title: 'Approval flow',
      summary: 'Need review then approve',
    })
    store.markAwaitingExecution(session.sessionId)

    const error = captureError(() => store.markExecuting(session.sessionId, 99))

    expect(error).toMatchObject({
      code: 'WORKFLOW_PROPOSAL_VERSION_MISMATCH',
      status: 409,
    })
  })

  it('clears expired sessions using updatedAt ttl', () => {
    let current = Date.UTC(2026, 0, 1, 0, 0, 0)
    const store = createWorkflowSessionStore({
      now: () => current,
      sessionTtlMs: 5_000,
    })

    const active = store.createSession()
    const stale = store.createSession()

    current += 3_000
    store.appendMessage(active.sessionId, {
      role: 'user',
      content: 'Keep this session active',
    })

    current += 4_000
    const removedCount = store.clearExpiredSessions()

    expect(removedCount).toBe(1)
    expect(store.getSession(active.sessionId).sessionId).toBe(active.sessionId)
    const error = captureError(() => store.getSession(stale.sessionId))

    expect(error).toMatchObject({
      code: 'WORKFLOW_SESSION_NOT_FOUND',
      status: 404,
    })
  })

  it('can mark a session as error for upstream failures', () => {
    const store = createWorkflowSessionStore()
    const session = store.createSession()

    const updated = store.markError(session.sessionId)

    expect(updated.state).toBe('error')
  })

  it('can move a session back to collecting requirements', () => {
    const store = createWorkflowSessionStore()
    const session = store.createSession()

    store.setProposal(session.sessionId, {
      title: 'Approval flow',
      summary: 'Need review then approve',
    })
    store.markAwaitingExecution(session.sessionId)
    const updated = store.markCollectingRequirements(session.sessionId)

    expect(updated.state).toBe('collecting_requirements')
  })
})
