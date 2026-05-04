import crypto from 'node:crypto'
import { assertDiagramPayload, hashDiagram } from '../schema.mjs'
import { getTitle, normalizeDiagramDocument, normalizeDiagramListItem, normalizeRevision, parsePositiveInteger } from './helpers.mjs'

export function createSqliteDiagramRepository({ db, schemaVersion, defaultUserId }) {

  const stmts = {
    getDiagramById: db.prepare(`
      select
        d.id,
        d.title,
        d.status,
        d.latest_version,
        d.updated_at,
        s.schema_version,
        s.latest_draft_json as latest_draft_jsonb
      from diagrams d
      join diagram_snapshots s on s.diagram_id = d.id
      where d.id = ? and d.deleted_at is null
    `),

    insertDiagram: db.prepare(`
      insert into diagrams (id, owner_user_id, title, status, current_revision_id, latest_version)
      values (?, ?, ?, 'draft', ?, ?)
    `),

    insertSnapshot: db.prepare(`
      insert into diagram_snapshots (diagram_id, latest_draft_json, schema_version, updated_by)
      values (?, ?, ?, ?)
    `),

    insertRevision: db.prepare(`
      insert into diagram_revisions (id, diagram_id, version, content_json, content_hash, source, change_summary, created_by)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    insertMember: db.prepare(`
      insert or ignore into diagram_members (diagram_id, user_id, role)
      values (?, ?, 'owner')
    `),

    updateDraftDiagram: db.prepare(`
      update diagrams
      set title = ?,
          latest_version = ?,
          updated_at = datetime('now')
      where id = ?
    `),

    updateDraftSnapshot: db.prepare(`
      update diagram_snapshots
      set latest_draft_json = ?,
          schema_version = ?,
          updated_by = ?,
          updated_at = datetime('now')
      where diagram_id = ?
    `),

    softDeleteDiagram: db.prepare(`
      update diagrams
      set deleted_at = datetime('now')
      where id = ? and deleted_at is null
    `),
  }

  function getDiagramById(diagramId) {
    const row = stmts.getDiagramById.get(diagramId)
    if (!row) return null

    return {
      ...row,
      latest_draft_jsonb: row.latest_draft_jsonb ? JSON.parse(row.latest_draft_jsonb) : null,
    }
  }

  function listDiagrams(query) {
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
      params.push(`%${keyword.toLowerCase()}%`)
      filters.push(`lower(d.title) like ?`)
    }

    if (status) {
      params.push(status)
      filters.push(`d.status = ?`)
    }

    const whereClause = filters.join(' and ')
    const countStmt = db.prepare(`select count(*) as total from diagrams d where ${whereClause}`)
    const countResult = countStmt.get(...params)

    const listStmt = db.prepare(`
      select
        d.id,
        d.title,
        d.status,
        d.latest_version,
        d.updated_at
      from diagrams d
      where ${whereClause}
      order by d.updated_at desc
      limit ? offset ?
    `)
    const rows = listStmt.all(...params, pageSize, offset)

    return {
      items: rows.map((row) => normalizeDiagramListItem(row, defaultUserId)),
      page,
      pageSize,
      total: countResult.total ?? 0,
    }
  }

  function createDiagram(body) {
    const diagram = assertDiagramPayload(body.diagram)
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : getTitle(diagram)
    const documentId = crypto.randomUUID()
    const revisionId = crypto.randomUUID()
    const version = 1
    const diagramHash = hashDiagram(diagram)

    const runInTx = db.transaction(() => {
      stmts.insertDiagram.run(documentId, defaultUserId, title, revisionId, version)
      stmts.insertSnapshot.run(documentId, JSON.stringify(diagram), body.schemaVersion ?? schemaVersion, defaultUserId)
      stmts.insertRevision.run(revisionId, documentId, version, JSON.stringify(diagram), diagramHash, 'manual_save', 'Initial version', defaultUserId)
      stmts.insertMember.run(documentId, defaultUserId)
    })

    runInTx()

    const created = getDiagramById(documentId)
    return normalizeDiagramDocument(created)
  }

  function updateDraft(diagramId, body) {
    const diagram = assertDiagramPayload(body.diagram)

    const runInTx = db.transaction(() => {
      const current = stmts.getDiagramById.get(diagramId)
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

      stmts.updateDraftDiagram.run(title, nextVersion, diagramId)
      stmts.updateDraftSnapshot.run(JSON.stringify(diagram), body.schemaVersion ?? schemaVersion, defaultUserId, diagramId)

      return {
        kind: 'saved',
        latestVersion: nextVersion,
        savedAt: new Date().toISOString(),
      }
    })

    return runInTx()
  }

  function listRevisions(diagramId, query) {
    const page = parsePositiveInteger(query.page, 1)
    const pageSize = Math.min(parsePositiveInteger(query.pageSize, 20), 100)
    const offset = (page - 1) * pageSize

    const countStmt = db.prepare(`
      select count(*) as total
      from diagram_revisions r
      join diagrams d on d.id = r.diagram_id
      where r.diagram_id = ? and d.deleted_at is null
    `)
    const countResult = countStmt.get(diagramId)

    const listStmt = db.prepare(`
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
      where r.diagram_id = ? and d.deleted_at is null
      order by r.version desc
      limit ? offset ?
    `)
    const rows = listStmt.all(diagramId, pageSize, offset)

    return {
      items: rows.map((row) => normalizeRevision(row)),
      page,
      pageSize,
      total: countResult.total ?? 0,
    }
  }

  function getRevision(diagramId, revisionId) {
    const stmt = db.prepare(`
      select
        r.id,
        r.diagram_id,
        r.version,
        r.source,
        r.change_summary,
        r.created_by,
        r.created_at,
        r.content_json as content_jsonb,
        u.name as created_by_name
      from diagram_revisions r
      join diagrams d on d.id = r.diagram_id
      left join users u on u.id = r.created_by
      where r.diagram_id = ? and r.id = ? and d.deleted_at is null
    `)
    const row = stmt.get(diagramId, revisionId)
    if (!row) return null
    return normalizeRevision(row, schemaVersion)
  }

  function createRevision(diagramId, body) {
    const diagram = assertDiagramPayload(body.diagram)

    const runInTx = db.transaction(() => {
      const current = stmts.getDiagramById.get(diagramId)
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

      db.prepare(`
        update diagrams
        set title = ?,
            current_revision_id = ?,
            latest_version = ?,
            updated_at = datetime('now')
        where id = ?
      `).run(title, revisionId, nextVersion, diagramId)

      stmts.updateDraftSnapshot.run(JSON.stringify(diagram), body.schemaVersion ?? schemaVersion, defaultUserId, diagramId)

      stmts.insertRevision.run(revisionId, diagramId, nextVersion, JSON.stringify(diagram), diagramHash, 'manual_save', body.changeSummary ?? null, defaultUserId)

      return {
        kind: 'saved',
        revisionId,
        version: nextVersion,
        createdAt: new Date().toISOString(),
      }
    })

    return runInTx()
  }

  function restoreRevision(diagramId, revisionId, body) {
    const runInTx = db.transaction(() => {
      const current = stmts.getDiagramById.get(diagramId)
      if (!current) {
        return { kind: 'not-found' }
      }

      if (current.latest_version !== body.baseVersion) {
        return { kind: 'conflict' }
      }

      const revisionRow = db.prepare(`
        select id, version, content_json as content_jsonb
        from diagram_revisions
        where diagram_id = ? and id = ?
      `).get(diagramId, revisionId)

      if (!revisionRow) {
        return { kind: 'revision-not-found' }
      }

      const diagram = assertDiagramPayload(JSON.parse(revisionRow.content_jsonb))
      const nextVersion = current.latest_version + 1
      const restoreRevisionId = crypto.randomUUID()
      const title = getTitle(diagram, current.title)
      const diagramHash = hashDiagram(diagram)

      db.prepare(`
        update diagrams
        set title = ?,
            current_revision_id = ?,
            latest_version = ?,
            updated_at = datetime('now')
        where id = ?
      `).run(title, restoreRevisionId, nextVersion, diagramId)

      stmts.updateDraftSnapshot.run(JSON.stringify(diagram), schemaVersion, defaultUserId, diagramId)

      stmts.insertRevision.run(restoreRevisionId, diagramId, nextVersion, JSON.stringify(diagram), diagramHash, 'restore', `Restore revision ${revisionRow.version}`, defaultUserId)

      return {
        kind: 'restored',
        latestVersion: nextVersion,
        savedAt: new Date().toISOString(),
        diagram,
      }
    })

    return runInTx()
  }

  function importDiagram(diagramId, body) {
    const diagram = assertDiagramPayload(body.diagram)

    const runInTx = db.transaction(() => {
      const current = stmts.getDiagramById.get(diagramId)
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

      db.prepare(`
        update diagrams
        set title = ?,
            current_revision_id = ?,
            latest_version = ?,
            updated_at = datetime('now')
        where id = ?
      `).run(title, revisionId, nextVersion, diagramId)

      stmts.updateDraftSnapshot.run(JSON.stringify(diagram), body.schemaVersion ?? schemaVersion, defaultUserId, diagramId)

      stmts.insertRevision.run(revisionId, diagramId, nextVersion, JSON.stringify(diagram), diagramHash, 'import', 'Import JSON', defaultUserId)

      return {
        kind: 'imported',
        latestVersion: nextVersion,
        savedAt: new Date().toISOString(),
      }
    })

    return runInTx()
  }

  function softDeleteDiagram(diagramId) {
    const result = stmts.softDeleteDiagram.run(diagramId)
    return result.changes > 0
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
