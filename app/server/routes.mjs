function normalizePath(path) {
  const cleaned = path.replace(/\/+$/, '') || '/'
  return cleaned.replace(/^\/api\/(?!v\d+\/)/, '/api/v1/')
}

function buildPatternRegex(expression) {
  const paramNameByIndex = new Map()
  let index = 0

  const regexSource = expression
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([a-zA-Z_][a-zA-Z0-9_-]*)/g, () => {
      const paramIndex = index
      paramNameByIndex.set(paramIndex, RegExp.$1)
      index += 1
      return '([0-9a-f-]+)'
    })

  const regex = new RegExp(`^${regexSource}$`, 'i')

  return { regex, paramNameByIndex }
}

function createRoute(method, expression, handler) {
  const { regex, paramNameByIndex } = buildPatternRegex(expression)

  return {
    method,
    regex,
    paramNameByIndex,
    handler,
  }
}

export function buildRoutes(handlers) {
  const { handleHealth, handleCreateWorkflowSession, handleSendWorkflowMessage, handleExecuteWorkflowSession,
    handleListDiagrams, handleCreateDiagram, handleGetDiagram, handleDeleteDiagram,
    handleUpdateDraft, handleListRevisions, handleCreateRevision, handleGetRevisionDetail,
    handleRestoreRevision, handleImportDiagram, handleExportGif } = handlers

  return [
    createRoute('GET', '/api/v1/health', handleHealth),

    createRoute('POST', '/api/v1/ai/workflow/sessions', handleCreateWorkflowSession),
    createRoute('POST', '/api/v1/ai/workflow/sessions/:sessionId/messages', handleSendWorkflowMessage),
    createRoute('POST', '/api/v1/ai/workflow/sessions/:sessionId/execute', handleExecuteWorkflowSession),

    createRoute('GET', '/api/v1/diagrams', handleListDiagrams),
    createRoute('POST', '/api/v1/diagrams', handleCreateDiagram),
    createRoute('GET', '/api/v1/diagrams/:diagramId', handleGetDiagram),
    createRoute('DELETE', '/api/v1/diagrams/:diagramId', handleDeleteDiagram),
    createRoute('PUT', '/api/v1/diagrams/:diagramId/draft', handleUpdateDraft),
    createRoute('GET', '/api/v1/diagrams/:diagramId/revisions', handleListRevisions),
    createRoute('POST', '/api/v1/diagrams/:diagramId/revisions', handleCreateRevision),
    createRoute('GET', '/api/v1/diagrams/:diagramId/revisions/:revisionId', handleGetRevisionDetail),
    createRoute('POST', '/api/v1/diagrams/:diagramId/restore/:revisionId', handleRestoreRevision),
    createRoute('POST', '/api/v1/diagrams/:diagramId/import', handleImportDiagram),

    createRoute('POST', '/api/v1/gif', handleExportGif),
  ]
}

export function matchRoute(method, reqPath, routes) {
  const normalizedPath = normalizePath(reqPath)

  for (const route of routes) {
    if (route.method !== method) {
      continue
    }

    const match = normalizedPath.match(route.regex)
    if (!match) {
      continue
    }

    const params = {}
    let paramIndex = 0
    for (const [, paramName] of route.paramNameByIndex.entries()) {
      paramIndex += 1
      params[paramName] = match[paramIndex]
    }

    return { handler: route.handler, params }
  }

  return null
}
