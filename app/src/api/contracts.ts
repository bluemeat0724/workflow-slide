import type { Diagram } from '../model/diagram'

export type Id = string
export type IsoDateTime = string
export type SchemaVersion = string

export type DiagramStatus = 'draft' | 'published' | 'archived'
export type RevisionSource = 'autosave' | 'manual_save' | 'import' | 'publish' | 'restore'
export type MemberRole = 'owner' | 'editor' | 'viewer'

export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'VERSION_CONFLICT'
  | 'SCHEMA_VERSION_UNSUPPORTED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export type UserSummary = {
  id: Id
  name: string
}

export type OwnerSummary = UserSummary

export type DiagramDocument = {
  id: Id
  title: string
  status: DiagramStatus
  latestVersion: number
  schemaVersion: SchemaVersion
  updatedAt: IsoDateTime
  diagram: Diagram
}

export type DiagramListItem = {
  id: Id
  title: string
  status: DiagramStatus
  latestVersion: number
  updatedAt: IsoDateTime
  owner: OwnerSummary
}

export type DiagramRevision = {
  revisionId: Id
  diagramId: Id
  version: number
  source: RevisionSource
  changeSummary: string | null
  createdAt: IsoDateTime
  createdBy: UserSummary
}

export type DiagramRevisionDetail = DiagramRevision & {
  schemaVersion: SchemaVersion
  diagram: Diagram
}

export type PaginationResponse<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export type ApiErrorResponse = {
  ok: false
  code: ApiErrorCode
  message: string
  details?: Record<string, unknown>
}

export type CreateDiagramRequest = {
  title: string
  schemaVersion: SchemaVersion
  diagram: Diagram
}

export type CreateDiagramResponse = DiagramDocument

export type GetDiagramResponse = DiagramDocument

export type UpdateDraftRequest = {
  baseVersion: number
  schemaVersion: SchemaVersion
  diagram: Diagram
}

export type UpdateDraftSuccessResponse = {
  ok: true
  latestVersion: number
  savedAt: IsoDateTime
}

export type VersionConflictResponse = {
  ok: false
  code: 'VERSION_CONFLICT'
  message: string
  latestVersion: number
  serverDocument: DiagramDocument
}

export type UpdateDraftResponse = UpdateDraftSuccessResponse | VersionConflictResponse

export type CreateRevisionRequest = {
  baseVersion: number
  schemaVersion: SchemaVersion
  diagram: Diagram
  changeSummary?: string
}

export type CreateRevisionResponse = {
  revisionId: Id
  version: number
  createdAt: IsoDateTime
}

export type ListRevisionsResponse = PaginationResponse<DiagramRevision>

export type GetRevisionResponse = DiagramRevisionDetail

export type RestoreRevisionRequest = {
  baseVersion: number
}

export type RestoreRevisionResponse = {
  ok: true
  latestVersion: number
  savedAt: IsoDateTime
  diagram: Diagram
}

export type ImportDiagramRequest = {
  baseVersion: number
  schemaVersion: SchemaVersion
  diagram: Diagram
}

export type ImportDiagramResponse = {
  ok: true
  latestVersion: number
  savedAt: IsoDateTime
}

export type ListDiagramsQuery = {
  page?: number
  pageSize?: number
  keyword?: string
  status?: DiagramStatus
}

export type ListDiagramsResponse = PaginationResponse<DiagramListItem>

export type DeleteDiagramResponse = void
