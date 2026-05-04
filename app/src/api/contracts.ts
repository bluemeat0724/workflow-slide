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
  | 'WORKFLOW_SESSION_NOT_FOUND'
  | 'WORKFLOW_SESSION_STATE_INVALID'
  | 'WORKFLOW_PROPOSAL_VERSION_MISMATCH'
  | 'AI_CONFIGURATION_ERROR'
  | 'AI_UPSTREAM_ERROR'
  | 'AI_RESPONSE_INVALID'
  | 'AI_TIMEOUT'
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

export type HealthCheckResponse = {
  ok: true
  storageDriver: 'sqlite' | 'postgres'
  capabilities: {
    supportsDatabase: boolean
    supportsDiagramLibrary: boolean
    supportsRevisionHistory: boolean
    supportsCreateRemoteDocument: boolean
    supportsAi: boolean
  }
}

export type WorkflowAgentState =
  | 'collecting_requirements'
  | 'awaiting_execution_confirmation'
  | 'executing'
  | 'completed'
  | 'error'

export type WorkflowAgentMessageRole = 'user' | 'assistant' | 'system'

export type WorkflowAgentMessage = {
  id: Id
  role: WorkflowAgentMessageRole
  content: string
  createdAt: IsoDateTime
}

export type WorkflowAgentProposal = {
  version: number
  title: string
  summary: string
  themePresetId?: string | null
}

export type CreateWorkflowSessionRequest = {
  locale?: Diagram['meta']['locale']
  themePresetId?: string
  theme?: Diagram['theme']
  currentDiagram?: Diagram | null
}

export type CreateWorkflowSessionResponse = {
  ok: true
  sessionId: Id
  welcomeMessage: string
  state: WorkflowAgentState
}

export type SendWorkflowMessageRequest = {
  message: string
  history: WorkflowAgentMessage[]
  currentDiagram?: Diagram | null
}

export type SendWorkflowMessageResponse = {
  ok: true
  reply: WorkflowAgentMessage
  state: WorkflowAgentState
  canExecute: boolean
  proposal?: WorkflowAgentProposal
}

export type ExecuteWorkflowSessionRequest = {
  confirmed: true
  proposalVersion: number
  currentDiagram?: Diagram | null
}

export type ExecuteWorkflowSessionResponse = {
  ok: true
  diagram: Diagram
  summary: string
  warnings: string[]
  meta: {
    model: string
    sessionId: Id
    generator: 'sub-agent-prefix'
    normalized: true
  }
}
