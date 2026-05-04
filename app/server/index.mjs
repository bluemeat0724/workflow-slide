import http from 'node:http'
import { URL } from 'node:url'
import { getServerConfig, getStorageDriver } from './config.mjs'
import { createPostgresDiagramRepository } from './repository/postgresDiagramRepository.mjs'
import { normalizeDiagramDocument } from './repository/helpers.mjs'
import { getPool, getSqliteDb } from './db.mjs'

const { defaultUserId, port, schemaVersion } = getServerConfig()

const storageDriver = getStorageDriver()
console.log(`Starting server with storage driver: ${storageDriver}`)

let repo

if (storageDriver === 'sqlite') {
  const db = getSqliteDb()
  const { createSqliteDiagramRepository } = await import('./repository/sqliteDiagramRepository.mjs')
  repo = createSqliteDiagramRepository({ db, schemaVersion, defaultUserId })
} else {
  const pool = getPool()
  repo = createPostgresDiagramRepository({ pool, schemaVersion, defaultUserId })
}

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

const server = http.createServer(async (request, response) => {
  if (!request.url || !request.method) {
    json(response, 400, {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request.',
    })
    return
  }

  if (request.method === 'OPTIONS') {
    noContent(response)
    return
  }

  const url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`)
  const path = url.pathname

  try {
    if (request.method === 'GET' && path === '/api/health') {
      json(response, 200, { ok: true })
      return
    }

    if (request.method === 'GET' && path === '/api/diagrams') {
      json(response, 200, await repo.listDiagrams(Object.fromEntries(url.searchParams.entries())))
      return
    }

    if (request.method === 'POST' && path === '/api/diagrams') {
      const body = await readJson(request)
      json(response, 201, await repo.createDiagram(body))
      return
    }

    const diagramMatch = path.match(/^\/api\/diagrams\/([0-9a-f-]+)$/i)
    if (request.method === 'GET' && diagramMatch) {
      const diagram = await repo.getDiagramById(diagramMatch[1])
      if (!diagram) {
        json(response, 404, {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Diagram not found.',
        })
        return
      }

      json(response, 200, normalizeDiagramDocument(diagram))
      return
    }

    if (request.method === 'DELETE' && diagramMatch) {
      const deleted = await repo.softDeleteDiagram(diagramMatch[1])
      if (!deleted) {
        json(response, 404, {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Diagram not found.',
        })
        return
      }

      noContent(response)
      return
    }

    const draftMatch = path.match(/^\/api\/diagrams\/([0-9a-f-]+)\/draft$/i)
    if (request.method === 'PUT' && draftMatch) {
      const body = await readJson(request)
      const result = await repo.updateDraft(draftMatch[1], body)

      if (result.kind === 'not-found') {
        json(response, 404, {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Diagram not found.',
        })
        return
      }

      if (result.kind === 'conflict') {
        json(response, 409, {
          ok: false,
          code: 'VERSION_CONFLICT',
          message: 'Draft has been updated by another session.',
          latestVersion: result.document.latestVersion,
          serverDocument: result.document,
        })
        return
      }

      json(response, 200, {
        ok: true,
        latestVersion: result.latestVersion,
        savedAt: result.savedAt,
      })
      return
    }

    const revisionsMatch = path.match(/^\/api\/diagrams\/([0-9a-f-]+)\/revisions$/i)
    if (request.method === 'GET' && revisionsMatch) {
      json(response, 200, await repo.listRevisions(revisionsMatch[1], Object.fromEntries(url.searchParams.entries())))
      return
    }

    if (request.method === 'POST' && revisionsMatch) {
      const body = await readJson(request)
      const result = await repo.createRevision(revisionsMatch[1], body)

      if (result.kind === 'not-found') {
        json(response, 404, {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Diagram not found.',
        })
        return
      }

      if (result.kind === 'conflict') {
        json(response, 409, {
          ok: false,
          code: 'VERSION_CONFLICT',
          message: 'Draft has been updated by another session.',
        })
        return
      }

      json(response, 201, {
        revisionId: result.revisionId,
        version: result.version,
        createdAt: result.createdAt,
      })
      return
    }

    const revisionDetailMatch = path.match(/^\/api\/diagrams\/([0-9a-f-]+)\/revisions\/([0-9a-f-]+)$/i)
    if (request.method === 'GET' && revisionDetailMatch) {
      const revision = await repo.getRevision(revisionDetailMatch[1], revisionDetailMatch[2])
      if (!revision) {
        json(response, 404, {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Revision not found.',
        })
        return
      }

      json(response, 200, revision)
      return
    }

    const restoreMatch = path.match(/^\/api\/diagrams\/([0-9a-f-]+)\/restore\/([0-9a-f-]+)$/i)
    if (request.method === 'POST' && restoreMatch) {
      const body = await readJson(request)
      const result = await repo.restoreRevision(restoreMatch[1], restoreMatch[2], body)

      if (result.kind === 'not-found') {
        json(response, 404, {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Diagram not found.',
        })
        return
      }

      if (result.kind === 'revision-not-found') {
        json(response, 404, {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Revision not found.',
        })
        return
      }

      if (result.kind === 'conflict') {
        json(response, 409, {
          ok: false,
          code: 'VERSION_CONFLICT',
          message: 'Draft has been updated by another session.',
        })
        return
      }

      json(response, 200, {
        ok: true,
        latestVersion: result.latestVersion,
        savedAt: result.savedAt,
        diagram: result.diagram,
      })
      return
    }

    const importMatch = path.match(/^\/api\/diagrams\/([0-9a-f-]+)\/import$/i)
    if (request.method === 'POST' && importMatch) {
      const body = await readJson(request)
      const result = await repo.importDiagram(importMatch[1], body)

      if (result.kind === 'not-found') {
        json(response, 404, {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Diagram not found.',
        })
        return
      }

      if (result.kind === 'conflict') {
        json(response, 409, {
          ok: false,
          code: 'VERSION_CONFLICT',
          message: 'Draft has been updated by another session.',
        })
        return
      }

      json(response, 200, {
        ok: true,
        latestVersion: result.latestVersion,
        savedAt: result.savedAt,
      })
      return
    }

    json(response, 404, {
      ok: false,
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${path} not found.`,
    })
  } catch (error) {
    handleError(response, error)
  }
})

server.listen(port, () => {
  console.log(`Workflow server running on http://127.0.0.1:${port}`)
})
