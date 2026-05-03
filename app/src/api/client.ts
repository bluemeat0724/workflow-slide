import type {
  ApiErrorResponse,
  CreateDiagramRequest,
  CreateDiagramResponse,
  CreateRevisionRequest,
  CreateRevisionResponse,
  GetDiagramResponse,
  GetRevisionResponse,
  Id,
  ImportDiagramRequest,
  ImportDiagramResponse,
  ListDiagramsQuery,
  ListDiagramsResponse,
  ListRevisionsResponse,
  RestoreRevisionRequest,
  RestoreRevisionResponse,
  UpdateDraftRequest,
  UpdateDraftResponse,
} from './contracts'

type FetchImpl = typeof fetch

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export class ApiClientError extends Error {
  status: number
  payload: ApiErrorResponse | null

  constructor(message: string, status: number, payload: ApiErrorResponse | null) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.payload = payload
  }
}

export type DiagramApiClientConfig = {
  baseUrl?: string
  fetchImpl?: FetchImpl
}

function joinUrl(baseUrl: string, path: string) {
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  return `${trimmedBaseUrl}/${trimmedPath}`
}

function buildQueryString(query: ListDiagramsQuery | { page?: number; pageSize?: number }) {
  const params = new URLSearchParams()

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    params.set(key, String(value))
  })

  const queryString = params.toString()
  return queryString ? `?${queryString}` : ''
}

async function parseJsonSafely(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

export function createDiagramApiClient({ baseUrl = '/api', fetchImpl = fetch }: DiagramApiClientConfig = {}) {
  async function request<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
    const response = await fetchImpl(joinUrl(baseUrl, path), {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })

    if (response.status === 204) {
      return undefined as T
    }

    const payload = await parseJsonSafely(response)
    if (!response.ok) {
      const errorPayload = payload as ApiErrorResponse | null
      const message = errorPayload?.message ?? `Request failed with status ${response.status}`
      throw new ApiClientError(message, response.status, errorPayload)
    }

    return payload as T
  }

  return {
    createDiagram(body: CreateDiagramRequest, signal?: AbortSignal) {
      return request<CreateDiagramResponse>('diagrams', { method: 'POST', body, signal })
    },

    getDiagram(diagramId: Id, signal?: AbortSignal) {
      return request<GetDiagramResponse>(`diagrams/${diagramId}`, { signal })
    },

    updateDraft(diagramId: Id, body: UpdateDraftRequest, signal?: AbortSignal) {
      return request<UpdateDraftResponse>(`diagrams/${diagramId}/draft`, { method: 'PUT', body, signal })
    },

    createRevision(diagramId: Id, body: CreateRevisionRequest, signal?: AbortSignal) {
      return request<CreateRevisionResponse>(`diagrams/${diagramId}/revisions`, { method: 'POST', body, signal })
    },

    listRevisions(diagramId: Id, query: { page?: number; pageSize?: number } = {}, signal?: AbortSignal) {
      return request<ListRevisionsResponse>(`diagrams/${diagramId}/revisions${buildQueryString(query)}`, { signal })
    },

    getRevision(diagramId: Id, revisionId: Id, signal?: AbortSignal) {
      return request<GetRevisionResponse>(`diagrams/${diagramId}/revisions/${revisionId}`, { signal })
    },

    restoreRevision(diagramId: Id, revisionId: Id, body: RestoreRevisionRequest, signal?: AbortSignal) {
      return request<RestoreRevisionResponse>(`diagrams/${diagramId}/restore/${revisionId}`, { method: 'POST', body, signal })
    },

    importDiagram(diagramId: Id, body: ImportDiagramRequest, signal?: AbortSignal) {
      return request<ImportDiagramResponse>(`diagrams/${diagramId}/import`, { method: 'POST', body, signal })
    },

    listDiagrams(query: ListDiagramsQuery = {}, signal?: AbortSignal) {
      return request<ListDiagramsResponse>(`diagrams${buildQueryString(query)}`, { signal })
    },

    deleteDiagram(diagramId: Id, signal?: AbortSignal) {
      return request<void>(`diagrams/${diagramId}`, { method: 'DELETE', signal })
    },
  }
}

export type DiagramApiClient = ReturnType<typeof createDiagramApiClient>
