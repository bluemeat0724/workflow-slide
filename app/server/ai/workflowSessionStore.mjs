import crypto from 'node:crypto'

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000

function nowIso(now) {
  return new Date(now).toISOString()
}

function cloneReferenceDiagram(referenceDiagram) {
  return referenceDiagram ? JSON.parse(JSON.stringify(referenceDiagram)) : null
}

function cloneSession(session) {
  return {
    ...session,
    messages: session.messages.map((message) => ({ ...message })),
    proposal: session.proposal ? { ...session.proposal } : null,
    theme: session.theme ? { ...session.theme } : null,
    referenceDiagram: cloneReferenceDiagram(session.referenceDiagram),
  }
}

function createSessionNotFoundError(sessionId) {
  return {
    name: 'WorkflowSessionNotFoundError',
    status: 404,
    code: 'WORKFLOW_SESSION_NOT_FOUND',
    message: `Workflow session ${sessionId} was not found.`,
  }
}

function createStateError(sessionId, expectedState, actualState) {
  return {
    name: 'WorkflowSessionStateError',
    status: 409,
    code: 'WORKFLOW_SESSION_STATE_INVALID',
    message: `Workflow session ${sessionId} must be in ${expectedState} before this operation.`,
    details: {
      expectedState,
      actualState,
    },
  }
}

function createProposalVersionError(sessionId, expectedVersion, receivedVersion) {
  return {
    name: 'WorkflowProposalVersionError',
    status: 409,
    code: 'WORKFLOW_PROPOSAL_VERSION_MISMATCH',
    message: `Workflow session ${sessionId} expected proposal version ${expectedVersion}, received ${receivedVersion}.`,
    details: {
      expectedVersion,
      receivedVersion,
    },
  }
}

export function createWorkflowSessionStore({
  now = () => Date.now(),
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
} = {}) {
  const sessions = new Map()

  function requireSession(sessionId) {
    const session = sessions.get(sessionId)
    if (!session) {
      throw createSessionNotFoundError(sessionId)
    }

    return session
  }

  function touchSession(session) {
    session.updatedAt = nowIso(now())
    sessions.set(session.sessionId, session)
    return cloneSession(session)
  }

  return {
    createSession({ locale = 'zh-CN', themePresetId = null, theme = null, referenceDiagram = null } = {}) {
      const timestamp = nowIso(now())
      const session = {
        sessionId: crypto.randomUUID(),
        messages: [],
        state: 'collecting_requirements',
        proposal: null,
        proposalVersion: 0,
        locale,
        themePresetId,
        theme,
        referenceDiagram: cloneReferenceDiagram(referenceDiagram),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      sessions.set(session.sessionId, session)
      return cloneSession(session)
    },

    getSession(sessionId) {
      return cloneSession(requireSession(sessionId))
    },

    appendMessage(sessionId, { role, content, id = crypto.randomUUID(), createdAt }) {
      const session = requireSession(sessionId)
      const message = {
        id,
        role,
        content,
        createdAt: createdAt ?? nowIso(now()),
      }

      session.messages.push(message)
      return touchSession(session)
    },

    setProposal(sessionId, proposal) {
      const session = requireSession(sessionId)
      session.proposalVersion += 1
      session.proposal = {
        version: session.proposalVersion,
        title: proposal.title,
        summary: proposal.summary,
        themePresetId: proposal.themePresetId ?? session.themePresetId ?? null,
      }
      session.state = 'collecting_requirements'
      return touchSession(session)
    },

    setThemeSelection(sessionId, { themePresetId = null, theme = null } = {}) {
      const session = requireSession(sessionId)
      session.themePresetId = themePresetId
      session.theme = theme ? { ...theme } : null
      return touchSession(session)
    },

    setReferenceDiagram(sessionId, referenceDiagram) {
      const session = requireSession(sessionId)
      session.referenceDiagram = cloneReferenceDiagram(referenceDiagram)
      return touchSession(session)
    },

    markAwaitingExecution(sessionId) {
      const session = requireSession(sessionId)
      if (!session.proposal) {
        throw createStateError(sessionId, 'proposal_ready', session.state)
      }

      session.state = 'awaiting_execution_confirmation'
      return touchSession(session)
    },

    markCollectingRequirements(sessionId) {
      const session = requireSession(sessionId)
      session.state = 'collecting_requirements'
      return touchSession(session)
    },

    markExecuting(sessionId, proposalVersion) {
      const session = requireSession(sessionId)

      if (session.state !== 'awaiting_execution_confirmation') {
        throw createStateError(sessionId, 'awaiting_execution_confirmation', session.state)
      }

      if (!session.proposal || session.proposal.version !== proposalVersion) {
        throw createProposalVersionError(sessionId, session.proposal?.version ?? null, proposalVersion)
      }

      session.state = 'executing'
      return touchSession(session)
    },

    markCompleted(sessionId) {
      const session = requireSession(sessionId)
      session.state = 'completed'
      return touchSession(session)
    },

    markError(sessionId) {
      const session = requireSession(sessionId)
      session.state = 'error'
      return touchSession(session)
    },

    clearExpiredSessions() {
      const currentTime = now()
      let removedCount = 0

      for (const [sessionId, session] of sessions.entries()) {
        const lastUpdatedAt = Date.parse(session.updatedAt)
        if (Number.isNaN(lastUpdatedAt)) {
          sessions.delete(sessionId)
          removedCount += 1
          continue
        }

        if (currentTime - lastUpdatedAt > sessionTtlMs) {
          sessions.delete(sessionId)
          removedCount += 1
        }
      }

      return removedCount
    },
  }
}
