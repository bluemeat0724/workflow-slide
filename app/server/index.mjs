import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'
import { getServerConfig, getStorageDriver, hasAiConfig } from './config.mjs'
import { createWorkflowExecutionService } from './ai/workflowExecutionService.mjs'
import { createAiConfigurationError } from './ai/errors.mjs'
import { getPool, getSqliteDb } from './db.mjs'
import { normalizeDiagramDocument } from './repository/helpers.mjs'
import { createPostgresDiagramRepository } from './repository/postgresDiagramRepository.mjs'
import { generateDiagramGif } from './render/gifExporter.mjs'
import { buildRoutes, matchRoute } from './routes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function json(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

function noContent(response) {
  response.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  })
  response.end()
}

async function readJson(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function handleError(response, error) {
  if (error instanceof SyntaxError) {
    return json(response, 400, {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Request body is not valid JSON.',
    })
  }

  if (error && typeof error === 'object' && 'status' in error && 'code' in error) {
    return json(response, error.status, {
      ok: false,
      code: error.code,
      message: error.message,
      details: error.details,
    })
  }

  console.error(error)
  return json(response, 500, {
    ok: false,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error.',
  })
}

async function createDiagramRepository({ storageDriver, schemaVersion, defaultUserId }) {
  if (storageDriver === 'sqlite') {
    const db = getSqliteDb()
    const { createSqliteDiagramRepository } = await import('./repository/sqliteDiagramRepository.mjs')
    return createSqliteDiagramRepository({ db, schemaVersion, defaultUserId })
  }

  const pool = getPool()
  return createPostgresDiagramRepository({ pool, schemaVersion, defaultUserId })
}

function normalizeAiInitializationError(error) {
  if (error instanceof Error && error.message.startsWith('Missing required environment variable:')) {
    return createAiConfigurationError(error.message)
  }

  return error
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function getContentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream'
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}

async function resolveStaticFile(requestPath) {
  const relativePath = decodeURIComponent(requestPath === '/' ? '/index.html' : requestPath).replace(/^\/+/, '')
  const filePath = path.join(DIST_DIR, path.normalize(relativePath))

  if (!isPathInside(DIST_DIR, filePath)) {
    return null
  }

  return await fileExists(filePath) ? filePath : null
}

async function serveFile(response, filePath, method) {
  const content = await fs.readFile(filePath)
  response.writeHead(200, {
    'Content-Type': getContentType(filePath),
    'Content-Length': content.length,
  })

  if (method === 'HEAD') {
    response.end()
    return
  }

  response.end(content)
}

async function tryServeFrontend(requestPath, method, response) {
  if (method !== 'GET' && method !== 'HEAD') {
    return false
  }

  const staticFile = await resolveStaticFile(requestPath)
  if (staticFile) {
    await serveFile(response, staticFile, method)
    return true
  }

  if (path.extname(requestPath)) {
    return false
  }

  const indexFile = path.join(DIST_DIR, 'index.html')
  if (!(await fileExists(indexFile))) {
    return false
  }

  await serveFile(response, indexFile, method)
  return true
}

export function buildHealthPayload({ storageDriver, supportsAi }) {
  return {
    ok: true,
    storageDriver,
    capabilities: {
      supportsDatabase: true,
      supportsDiagramLibrary: true,
      supportsRevisionHistory: true,
      supportsCreateRemoteDocument: true,
      supportsAi,
    },
  }
}

export async function createAppServer({
  repo,
  workflowExecutionService,
  serverConfig = getServerConfig(),
  storageDriver = getStorageDriver(),
} = {}) {
  const { defaultUserId, schemaVersion } = serverConfig
  const resolvedRepo = repo ?? await createDiagramRepository({
    storageDriver,
    schemaVersion,
    defaultUserId,
  })

  let workflowService = workflowExecutionService ?? null
  const supportsAi = Boolean(workflowExecutionService) || hasAiConfig()

  function getWorkflowExecutionServiceInstance() {
    if (workflowService) {
      return workflowService
    }

    try {
      workflowService = createWorkflowExecutionService()
      return workflowService
    } catch (error) {
      throw normalizeAiInitializationError(error)
    }
  }

  const getWf = getWorkflowExecutionServiceInstance

  const routes = buildRoutes({
    handleHealth() {
      return { status: 200, payload: buildHealthPayload({ storageDriver, supportsAi }) }
    },

    async handleCreateWorkflowSession({ body }) {
      const payload = await getWf().createWorkflowSession(body)
      return { status: 201, payload }
    },

    async handleSendWorkflowMessage({ params, body }) {
      const payload = await getWf().sendWorkflowMessage(params.sessionId, body)
      return { status: 200, payload }
    },

    async handleExecuteWorkflowSession({ params, body }) {
      const payload = await getWf().executeWorkflowSession(params.sessionId, body)
      return { status: 200, payload }
    },

    async handleListDiagrams({ url }) {
      const payload = await resolvedRepo.listDiagrams(Object.fromEntries(url.searchParams.entries()))
      return { status: 200, payload }
    },

    async handleCreateDiagram({ body }) {
      const payload = await resolvedRepo.createDiagram(body)
      return { status: 201, payload }
    },

    async handleGetDiagram({ params }) {
      const diagram = await resolvedRepo.getDiagramById(params.diagramId)
      if (!diagram) {
        return { status: 404, payload: { ok: false, code: 'NOT_FOUND', message: 'Diagram not found.' } }
      }
      return { status: 200, payload: normalizeDiagramDocument(diagram) }
    },

    async handleDeleteDiagram({ params }) {
      const deleted = await resolvedRepo.softDeleteDiagram(params.diagramId)
      if (!deleted) {
        return { status: 404, payload: { ok: false, code: 'NOT_FOUND', message: 'Diagram not found.' } }
      }
      return { status: 204 }
    },

    async handleUpdateDraft({ params, body }) {
      const result = await resolvedRepo.updateDraft(params.diagramId, body)

      if (result.kind === 'not-found') {
        return { status: 404, payload: { ok: false, code: 'NOT_FOUND', message: 'Diagram not found.' } }
      }

      if (result.kind === 'conflict') {
        return {
          status: 409,
          payload: {
            ok: false,
            code: 'VERSION_CONFLICT',
            message: 'Draft has been updated by another session.',
            latestVersion: result.document.latestVersion,
            serverDocument: result.document,
          },
        }
      }

      return {
        status: 200,
        payload: { ok: true, latestVersion: result.latestVersion, savedAt: result.savedAt },
      }
    },

    async handleListRevisions({ params, url }) {
      const payload = await resolvedRepo.listRevisions(params.diagramId, Object.fromEntries(url.searchParams.entries()))
      return { status: 200, payload }
    },

    async handleCreateRevision({ params, body }) {
      const result = await resolvedRepo.createRevision(params.diagramId, body)

      if (result.kind === 'not-found') {
        return { status: 404, payload: { ok: false, code: 'NOT_FOUND', message: 'Diagram not found.' } }
      }

      if (result.kind === 'conflict') {
        return { status: 409, payload: { ok: false, code: 'VERSION_CONFLICT', message: 'Draft has been updated by another session.' } }
      }

      return {
        status: 201,
        payload: { revisionId: result.revisionId, version: result.version, createdAt: result.createdAt },
      }
    },

    async handleGetRevisionDetail({ params }) {
      const revision = await resolvedRepo.getRevision(params.diagramId, params.revisionId)
      if (!revision) {
        return { status: 404, payload: { ok: false, code: 'NOT_FOUND', message: 'Revision not found.' } }
      }
      return { status: 200, payload: revision }
    },

    async handleRestoreRevision({ params, body }) {
      const result = await resolvedRepo.restoreRevision(params.diagramId, params.revisionId, body)

      if (result.kind === 'not-found') {
        return { status: 404, payload: { ok: false, code: 'NOT_FOUND', message: 'Diagram not found.' } }
      }

      if (result.kind === 'revision-not-found') {
        return { status: 404, payload: { ok: false, code: 'NOT_FOUND', message: 'Revision not found.' } }
      }

      if (result.kind === 'conflict') {
        return { status: 409, payload: { ok: false, code: 'VERSION_CONFLICT', message: 'Draft has been updated by another session.' } }
      }

      return {
        status: 200,
        payload: { ok: true, latestVersion: result.latestVersion, savedAt: result.savedAt, diagram: result.diagram },
      }
    },

    async handleImportDiagram({ params, body }) {
      const result = await resolvedRepo.importDiagram(params.diagramId, body)

      if (result.kind === 'not-found') {
        return { status: 404, payload: { ok: false, code: 'NOT_FOUND', message: 'Diagram not found.' } }
      }

      if (result.kind === 'conflict') {
        return { status: 409, payload: { ok: false, code: 'VERSION_CONFLICT', message: 'Draft has been updated by another session.' } }
      }

      return {
        status: 200,
        payload: { ok: true, latestVersion: result.latestVersion, savedAt: result.savedAt },
      }
    },

    async handleExportGif({ body, response }) {
      let result
      try {
        result = await generateDiagramGif(body)
      } catch (error) {
        return { status: 500, payload: { ok: false, code: 'GIF_EXPORT_FAILED', message: error instanceof Error ? error.message : 'GIF export failed.' } }
      }
      response.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': result.buffer.length,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      })
      response.end(result.buffer)
      return null
    },
  })

  const server = http.createServer(async (request, response) => {
    if (!request.url || !request.method) {
      json(response, 400, { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid request.' })
      return
    }

    if (request.method === 'OPTIONS') {
      noContent(response)
      return
    }

    const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`)

    try {
      const matched = matchRoute(request.method, url.pathname, routes)

      if (matched) {
        const body = ['POST', 'PUT'].includes(request.method) ? await readJson(request) : {}
        const result = await matched.handler({ params: matched.params, body, url, response })
        if (result) {
          json(response, result.status, result.payload)
        }
        return
      }

      if (await tryServeFrontend(url.pathname, request.method, response)) {
        return
      }

      json(response, 404, {
        ok: false,
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${url.pathname} not found.`,
      })
    } catch (error) {
      handleError(response, error)
    }
  })

  return {
    server,
    port: serverConfig.port,
    storageDriver,
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url)

if (isMainModule) {
  const serverConfig = getServerConfig()
  const storageDriver = getStorageDriver()
  console.log(`Starting server with storage driver: ${storageDriver}`)

  const { server, port } = await createAppServer({
    serverConfig,
    storageDriver,
  })

  server.listen(port, () => {
    console.log(`Workflow server running on http://127.0.0.1:${port}`)
  })
}
