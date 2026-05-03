import crypto from 'node:crypto'
import http from 'node:http'
import { URL } from 'node:url'
import { getServerConfig } from './config.mjs'
import { getPool, withTransaction } from './db.mjs'
import { assertDiagramPayload, hashDiagram } from './schema.mjs'

const { defaultUserId, port, schemaVersion } = getServerConfig()

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

function getTitle(diagram, fallbackTitle = 'Untitled Workflow') {
  return typeof diagram.meta?.title === 'string' && diagram.meta.title.trim()
    ? diagram.meta.title.trim()
    : fallbackTitle
}

function normalizeDiagramDocument(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    latestVersion: row.latest_version,
    schemaVersion: row.schema_version,
    updatedAt: row.updated_at.toISOString(),
    diagram: row.latest_draft_jsonb,
  }
}

function normalizeRevision(row) {
  return {
    revisionId: row.id,
    diagramId: row.diagram_id,
    version: row.version,
    source: row.source,
    changeSummary: row.change_summary,
    createdAt: row.created_at.toISOString(),
    createdBy: {
      id: row.created_by,
      name: row.created_by_name ?? 'Local Dev User',
    },
  }
}

async function getDiagramById(diagramId) {
  const result = await getPool().query(
    `
      select
        d.id,
        d.title,
        d.status,
        d.latest_version,
        d.updated_at,
        s.schema_version,
        s.latest_draft_jsonb
      from diagrams d
      join diagram_snapshots s on s.diagram_id = d.id
      where d.id = $1 and d.deleted_at is null
    `,
    [diagramId],
  )

  return result.rows[0] ?? null
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

async function listDiagrams(query) {
  const page = parsePositiveInteger(query.page, 1)
  const pageSize = Math.min(parsePositiveInteger(query.pageSize, 20), 100)
  const offset = (page - 1) * pageSize
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : ''
  const status = query.status === 'draft' || query.status === 'published' || query.status === 'archived'
    ? query.status
    : ''
  const filters = ['d.deleted_at is null']
  const params = []

  if (keyword) {
    params.push(`%${keyword}%`)
    filters.push(`d.title ilike $${params.length}`)
  }

  if (status) {
    params.push(status)
    filters.push(`d.status = $${params.length}`)
  }

  const whereClause = filters.join(' and ')
  const countResult = await getPool().query(`select count(*)::int as total from diagrams d where ${whereClause}`, params)

  const result = await getPool().query(
    `
      select
        d.id,
        d.title,
        d.status,
        d.latest_version,
        d.updated_at
      from diagrams d
      where ${whereClause}
      order by d.updated_at desc
      limit $${params.length + 1}
      offset $${params.length + 2}
    `,
    [...params, pageSize, offset],
  )

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      latestVersion: row.latest_version,
      updatedAt: row.updated_at.toISOString(),
      owner: {
        id: defaultUserId,
        name: 'Local Dev User',
      },
    })),
    page,
    pageSize,
    total: countResult.rows[0]?.total ?? 0,
  }
}

async function createDiagram(body) {
  const diagram = assertDiagramPayload(body.diagram)
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : getTitle(diagram)
  const documentId = crypto.randomUUID()
  const revisionId = crypto.randomUUID()
  const version = 1
  const diagramHash = hashDiagram(diagram)

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into diagrams (id, owner_user_id, title, status, current_revision_id, latest_version)
        values ($1, $2, $3, 'draft', $4, $5)
      `,
      [documentId, defaultUserId, title, revisionId, version],
    )

    await client.query(
      `
        insert into diagram_snapshots (diagram_id, latest_draft_jsonb, schema_version, updated_by)
        values ($1, $2::jsonb, $3, $4)
      `,
      [documentId, JSON.stringify(diagram), body.schemaVersion ?? schemaVersion, defaultUserId],
    )

    await client.query(
      `
        insert into diagram_revisions (id, diagram_id, version, content_jsonb, content_hash, source, change_summary, created_by)
        values ($1, $2, $3, $4::jsonb, $5, 'manual_save', 'Initial version', $6)
      `,
      [revisionId, documentId, version, JSON.stringify(diagram), diagramHash, defaultUserId],
    )

    await client.query(
      `
        insert into diagram_members (diagram_id, user_id, role)
        values ($1, $2, 'owner')
        on conflict (diagram_id, user_id) do nothing
      `,
      [documentId, defaultUserId],
    )
  })

  const created = await getDiagramById(documentId)
  return normalizeDiagramDocument(created)
}

async function updateDraft(diagramId, body) {
  const diagram = assertDiagramPayload(body.diagram)

  return withTransaction(async (client) => {
    const currentResult = await client.query(
      `
        select
          d.id,
          d.title,
          d.status,
          d.latest_version,
          d.updated_at,
          s.schema_version,
          s.latest_draft_jsonb
        from diagrams d
        join diagram_snapshots s on s.diagram_id = d.id
        where d.id = $1 and d.deleted_at is null
        for update
      `,
      [diagramId],
    )

    const current = currentResult.rows[0]
    if (!current) {
      return { kind: 'not-found' }
    }

    if (current.latest_version !== body.baseVersion) {
      return {
        kind: 'conflict',
        document: normalizeDiagramDocument(current),
      }
    }

    const nextVersion = current.latest_version + 1
    const title = getTitle(diagram, current.title)

    await client.query(
      `
        update diagrams
        set title = $2,
            latest_version = $3,
            updated_at = now()
        where id = $1
      `,
      [diagramId, title, nextVersion],
    )

    await client.query(
      `
        update diagram_snapshots
        set latest_draft_jsonb = $2::jsonb,
            schema_version = $3,
            updated_by = $4,
            updated_at = now()
        where diagram_id = $1
      `,
      [diagramId, JSON.stringify(diagram), body.schemaVersion ?? schemaVersion, defaultUserId],
    )

    return {
      kind: 'saved',
      latestVersion: nextVersion,
      savedAt: new Date().toISOString(),
    }
  })
}

async function listRevisions(diagramId, query) {
  const page = parsePositiveInteger(query.page, 1)
  const pageSize = Math.min(parsePositiveInteger(query.pageSize, 20), 100)
  const offset = (page - 1) * pageSize
  const countResult = await getPool().query(
    `
      select count(*)::int as total
      from diagram_revisions r
      join diagrams d on d.id = r.diagram_id
      where r.diagram_id = $1 and d.deleted_at is null
    `,
    [diagramId],
  )

  const result = await getPool().query(
    `
      select
        r.id,
        r.diagram_id,
        r.version,
        r.source,
        r.change_summary,
        r.created_by,
        r.created_at,
        u.name as created_by_name
      from diagram_revisions r
      join diagrams d on d.id = r.diagram_id
      left join users u on u.id = r.created_by
      where r.diagram_id = $1 and d.deleted_at is null
      order by r.version desc
      limit $2
      offset $3
    `,
    [diagramId, pageSize, offset],
  )

  return {
    items: result.rows.map(normalizeRevision),
    page,
    pageSize,
    total: countResult.rows[0]?.total ?? 0,
  }
}

async function getRevision(diagramId, revisionId) {
  const result = await getPool().query(
    `
      select
        r.id,
        r.diagram_id,
        r.version,
        r.source,
        r.change_summary,
        r.created_by,
        r.created_at,
        r.content_jsonb,
        u.name as created_by_name
      from diagram_revisions r
      join diagrams d on d.id = r.diagram_id
      left join users u on u.id = r.created_by
      where r.diagram_id = $1 and r.id = $2 and d.deleted_at is null
    `,
    [diagramId, revisionId],
  )

  const row = result.rows[0]
  if (!row) {
    return null
  }

  return {
    ...normalizeRevision(row),
    schemaVersion: schemaVersion,
    diagram: row.content_jsonb,
  }
}

async function createRevision(diagramId, body) {
  const diagram = assertDiagramPayload(body.diagram)

  return withTransaction(async (client) => {
    const currentResult = await client.query(
      `
        select
          d.id,
          d.title,
          d.latest_version
        from diagrams d
        where d.id = $1 and d.deleted_at is null
        for update
      `,
      [diagramId],
    )

    const current = currentResult.rows[0]
    if (!current) {
      return { kind: 'not-found' }
    }

    if (current.latest_version !== body.baseVersion) {
      return { kind: 'conflict' }
    }

    const nextVersion = current.latest_version + 1
    const revisionId = crypto.randomUUID()
    const title = getTitle(diagram, current.title)
    const diagramHash = hashDiagram(diagram)

    await client.query(
      `
        update diagrams
        set title = $2,
            current_revision_id = $3,
            latest_version = $4,
            updated_at = now()
        where id = $1
      `,
      [diagramId, title, revisionId, nextVersion],
    )

    await client.query(
      `
        update diagram_snapshots
        set latest_draft_jsonb = $2::jsonb,
            schema_version = $3,
            updated_by = $4,
            updated_at = now()
        where diagram_id = $1
      `,
      [diagramId, JSON.stringify(diagram), body.schemaVersion ?? schemaVersion, defaultUserId],
    )

    await client.query(
      `
        insert into diagram_revisions (id, diagram_id, version, content_jsonb, content_hash, source, change_summary, created_by)
        values ($1, $2, $3, $4::jsonb, $5, 'manual_save', $6, $7)
      `,
      [revisionId, diagramId, nextVersion, JSON.stringify(diagram), diagramHash, body.changeSummary ?? null, defaultUserId],
    )

    return {
      kind: 'saved',
      revisionId,
      version: nextVersion,
      createdAt: new Date().toISOString(),
    }
  })
}

async function restoreRevision(diagramId, revisionId, body) {
  return withTransaction(async (client) => {
    const currentResult = await client.query(
      `
        select
          d.id,
          d.title,
          d.latest_version
        from diagrams d
        where d.id = $1 and d.deleted_at is null
        for update
      `,
      [diagramId],
    )

    const current = currentResult.rows[0]
    if (!current) {
      return { kind: 'not-found' }
    }

    if (current.latest_version !== body.baseVersion) {
      return { kind: 'conflict' }
    }

    const revisionResult = await client.query(
      `
        select
          id,
          version,
          content_jsonb
        from diagram_revisions
        where diagram_id = $1 and id = $2
      `,
      [diagramId, revisionId],
    )

    const revision = revisionResult.rows[0]
    if (!revision) {
      return { kind: 'revision-not-found' }
    }

    const diagram = assertDiagramPayload(revision.content_jsonb)
    const nextVersion = current.latest_version + 1
    const restoreRevisionId = crypto.randomUUID()
    const title = getTitle(diagram, current.title)
    const diagramHash = hashDiagram(diagram)

    await client.query(
      `
        update diagrams
        set title = $2,
            current_revision_id = $3,
            latest_version = $4,
            updated_at = now()
        where id = $1
      `,
      [diagramId, title, restoreRevisionId, nextVersion],
    )

    await client.query(
      `
        update diagram_snapshots
        set latest_draft_jsonb = $2::jsonb,
            schema_version = $3,
            updated_by = $4,
            updated_at = now()
        where diagram_id = $1
      `,
      [diagramId, JSON.stringify(diagram), schemaVersion, defaultUserId],
    )

    await client.query(
      `
        insert into diagram_revisions (id, diagram_id, version, content_jsonb, content_hash, source, change_summary, created_by)
        values ($1, $2, $3, $4::jsonb, $5, 'restore', $6, $7)
      `,
      [restoreRevisionId, diagramId, nextVersion, JSON.stringify(diagram), diagramHash, `Restore revision ${revision.version}`, defaultUserId],
    )

    return {
      kind: 'restored',
      latestVersion: nextVersion,
      savedAt: new Date().toISOString(),
      diagram,
    }
  })
}

async function importDiagram(diagramId, body) {
  const diagram = assertDiagramPayload(body.diagram)

  return withTransaction(async (client) => {
    const currentResult = await client.query(
      `
        select
          d.id,
          d.title,
          d.latest_version
        from diagrams d
        where d.id = $1 and d.deleted_at is null
        for update
      `,
      [diagramId],
    )

    const current = currentResult.rows[0]
    if (!current) {
      return { kind: 'not-found' }
    }

    if (current.latest_version !== body.baseVersion) {
      return { kind: 'conflict' }
    }

    const nextVersion = current.latest_version + 1
    const revisionId = crypto.randomUUID()
    const title = getTitle(diagram, current.title)
    const diagramHash = hashDiagram(diagram)

    await client.query(
      `
        update diagrams
        set title = $2,
            current_revision_id = $3,
            latest_version = $4,
            updated_at = now()
        where id = $1
      `,
      [diagramId, title, revisionId, nextVersion],
    )

    await client.query(
      `
        update diagram_snapshots
        set latest_draft_jsonb = $2::jsonb,
            schema_version = $3,
            updated_by = $4,
            updated_at = now()
        where diagram_id = $1
      `,
      [diagramId, JSON.stringify(diagram), body.schemaVersion ?? schemaVersion, defaultUserId],
    )

    await client.query(
      `
        insert into diagram_revisions (id, diagram_id, version, content_jsonb, content_hash, source, change_summary, created_by)
        values ($1, $2, $3, $4::jsonb, $5, 'import', $6, $7)
      `,
      [revisionId, diagramId, nextVersion, JSON.stringify(diagram), diagramHash, 'Import JSON', defaultUserId],
    )

    return {
      kind: 'imported',
      latestVersion: nextVersion,
      savedAt: new Date().toISOString(),
    }
  })
}

async function softDeleteDiagram(diagramId) {
  const result = await getPool().query(
    `
      update diagrams
      set deleted_at = now()
      where id = $1 and deleted_at is null
    `,
    [diagramId],
  )

  return result.rowCount > 0
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
      json(response, 200, await listDiagrams(Object.fromEntries(url.searchParams.entries())))
      return
    }

    if (request.method === 'POST' && path === '/api/diagrams') {
      const body = await readJson(request)
      json(response, 201, await createDiagram(body))
      return
    }

    const diagramMatch = path.match(/^\/api\/diagrams\/([0-9a-f-]+)$/i)
    if (request.method === 'GET' && diagramMatch) {
      const diagram = await getDiagramById(diagramMatch[1])
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

    const draftMatch = path.match(/^\/api\/diagrams\/([0-9a-f-]+)\/draft$/i)
    if (request.method === 'PUT' && draftMatch) {
      const body = await readJson(request)
      const result = await updateDraft(draftMatch[1], body)

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
      json(response, 200, await listRevisions(revisionsMatch[1], Object.fromEntries(url.searchParams.entries())))
      return
    }

    if (request.method === 'POST' && revisionsMatch) {
      const body = await readJson(request)
      const result = await createRevision(revisionsMatch[1], body)

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
      const revision = await getRevision(revisionDetailMatch[1], revisionDetailMatch[2])
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
      const result = await restoreRevision(restoreMatch[1], restoreMatch[2], body)

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
      const result = await importDiagram(importMatch[1], body)

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

    if (request.method === 'DELETE' && diagramMatch) {
      const deleted = await softDeleteDiagram(diagramMatch[1])
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

    json(response, 404, {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Route not found.',
    })
  } catch (error) {
    handleError(response, error)
  }
})

server.listen(port, () => {
  console.log(`Workflow API listening on http://127.0.0.1:${port}`)
})
