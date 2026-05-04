import crypto from 'node:crypto'
import { assertDiagramPayload, hashDiagram } from '../schema.mjs'
import { getTitle, normalizeDiagramDocument, normalizeDiagramListItem, normalizeRevision, parsePositiveInteger } from './helpers.mjs'

export function createPostgresDiagramRepository({ pool, schemaVersion, defaultUserId }) {

  async function withTransaction(callback) {
    const client = await pool.connect()

    try {
      await client.query('begin')
      const result = await callback(client)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }

  async function getDiagramById(diagramId) {
    const result = await pool.query(
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
    const countResult = await pool.query(`select count(*)::int as total from diagrams d where ${whereClause}`, params)

    const result = await pool.query(
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
      items: result.rows.map((row) => normalizeDiagramListItem(row, defaultUserId)),
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
    const countResult = await pool.query(
      `
        select count(*)::int as total
        from diagram_revisions r
        join diagrams d on d.id = r.diagram_id
        where r.diagram_id = $1 and d.deleted_at is null
      `,
      [diagramId],
    )

    const result = await pool.query(
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
      items: result.rows.map((row) => normalizeRevision(row)),
      page,
      pageSize,
      total: countResult.rows[0]?.total ?? 0,
    }
  }

  async function getRevision(diagramId, revisionId) {
    const result = await pool.query(
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

    return normalizeRevision(row, schemaVersion)
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
    const result = await pool.query(
      `
        update diagrams
        set deleted_at = now()
        where id = $1 and deleted_at is null
      `,
      [diagramId],
    )

    return result.rowCount > 0
  }

  return {
    getDiagramById,
    listDiagrams,
    createDiagram,
    updateDraft,
    listRevisions,
    getRevision,
    createRevision,
    restoreRevision,
    importDiagram,
    softDeleteDiagram,
  }
}
