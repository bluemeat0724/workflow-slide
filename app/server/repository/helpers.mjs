function parseJsonValue(value) {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function getTitle(diagram, fallbackTitle = 'Untitled Workflow') {
  return typeof diagram.meta?.title === 'string' && diagram.meta.title.trim()
    ? diagram.meta.title.trim()
    : fallbackTitle
}

export function parsePositiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function normalizeDiagramDocument(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    latestVersion: row.latest_version,
    schemaVersion: row.schema_version,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    diagram: parseJsonValue(row.latest_draft_jsonb ?? row.latest_draft_json),
  }
}

export function normalizeRevision(row, schemaVersion) {
  return {
    revisionId: row.id,
    diagramId: row.diagram_id,
    version: row.version,
    source: row.source,
    changeSummary: row.change_summary,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    createdBy: {
      id: row.created_by,
      name: row.created_by_name ?? 'Local Dev User',
    },
    ...(row.content_jsonb || row.content_json
      ? {
          schemaVersion: schemaVersion ?? '1.0',
          diagram: parseJsonValue(row.content_jsonb ?? row.content_json),
        }
      : {}),
  }
}

export function normalizeDiagramListItem(row, defaultUserId) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    latestVersion: row.latest_version,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    owner: {
      id: defaultUserId,
      name: 'Local Dev User',
    },
  }
}
