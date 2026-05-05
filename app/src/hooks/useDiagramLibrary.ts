import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagramApiClient } from '../api/client'
import type { DiagramListItem, DiagramRevision } from '../api/contracts'
import type { Messages } from '../i18n'

type LibraryMode = 'diagrams' | 'revisions' | null

type UseDiagramLibraryInput = {
  api: DiagramApiClient | null
  remoteDiagramId: string | null
  messages: Messages
  setStatus: (status: string) => void
}

export function useDiagramLibrary({
  api,
  remoteDiagramId,
  messages,
  setStatus,
}: UseDiagramLibraryInput) {
  const [libraryMode, setLibraryMode] = useState<LibraryMode>(null)
  const [diagramItems, setDiagramItems] = useState<DiagramListItem[]>([])
  const [revisionItems, setRevisionItems] = useState<DiagramRevision[]>([])
  const [diagramKeyword, setDiagramKeyword] = useState('')
  const [diagramPage, setDiagramPage] = useState(1)
  const [diagramTotalPages, setDiagramTotalPages] = useState(1)
  const [revisionPage, setRevisionPage] = useState(1)
  const [revisionTotalPages, setRevisionTotalPages] = useState(1)
  const [deletingDiagramId, setDeletingDiagramId] = useState<string | null>(null)
  const diagramSearchTimerRef = useRef<number | null>(null)
  const diagramListRequestIdRef = useRef(0)
  const revisionListRequestIdRef = useRef(0)
  const diagramListAbortRef = useRef<AbortController | null>(null)
  const revisionListAbortRef = useRef<AbortController | null>(null)

  const loadDiagramList = useCallback(async (page = 1, keyword = diagramKeyword) => {
    if (!api) {
      return
    }

    diagramListAbortRef.current?.abort()
    const controller = new AbortController()
    diagramListAbortRef.current = controller
    const requestId = ++diagramListRequestIdRef.current

    try {
      const response = await api.listDiagrams({
        page,
        pageSize: 8,
        keyword: keyword.trim() || undefined,
      }, controller.signal)

      if (requestId !== diagramListRequestIdRef.current) {
        return
      }

      setDiagramItems(response.items)
      setDiagramPage(response.page)
      setDiagramTotalPages(Math.max(1, Math.ceil(response.total / response.pageSize)))
      setStatus(messages.status.diagramsLoaded)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setStatus(messages.status.diagramsLoadFailed)
    } finally {
      if (diagramListAbortRef.current === controller) {
        diagramListAbortRef.current = null
      }
    }
  }, [api, diagramKeyword, messages, setStatus])

  const loadRevisionHistory = useCallback(async (page = 1) => {
    if (!remoteDiagramId || !api) {
      return
    }

    revisionListAbortRef.current?.abort()
    const controller = new AbortController()
    revisionListAbortRef.current = controller
    const requestId = ++revisionListRequestIdRef.current

    try {
      const response = await api.listRevisions(remoteDiagramId, { page, pageSize: 8 }, controller.signal)
      if (requestId !== revisionListRequestIdRef.current) {
        return
      }

      setRevisionItems(response.items)
      setRevisionPage(response.page)
      setRevisionTotalPages(Math.max(1, Math.ceil(response.total / response.pageSize)))
      setStatus(messages.status.revisionsLoaded)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      setStatus(messages.status.revisionsLoadFailed)
    } finally {
      if (revisionListAbortRef.current === controller) {
        revisionListAbortRef.current = null
      }
    }
  }, [remoteDiagramId, api, messages, setStatus])

  const handleOpenDiagramList = useCallback(async () => {
    setLibraryMode('diagrams')
    await loadDiagramList(1)
  }, [loadDiagramList])

  const handleOpenRevisionHistory = useCallback(async () => {
    setLibraryMode('revisions')
    await loadRevisionHistory(1)
  }, [loadRevisionHistory])

  const handleDeleteDiagram = useCallback(async (item: DiagramListItem, onDeleted: (deletedId: string) => void) => {
    if (!api) {
      return
    }

    const confirmMessage = messages.library.deleteDiagramConfirm.replace('{title}', item.title)
    if (!window.confirm(confirmMessage)) {
      return
    }

    setDeletingDiagramId(item.id)

    try {
      await api.deleteDiagram(item.id)
      onDeleted(item.id)
      const nextPage = diagramItems.length === 1 && diagramPage > 1 ? diagramPage - 1 : diagramPage
      await loadDiagramList(nextPage)
      setStatus(messages.status.diagramDeleted)
    } catch {
      setStatus(messages.status.diagramDeleteFailed)
    } finally {
      setDeletingDiagramId((current) => (current === item.id ? null : current))
    }
  }, [api, diagramItems.length, diagramPage, loadDiagramList, messages, setStatus])

  const handleDiagramSearch = useCallback((keyword: string) => {
    setDiagramKeyword(keyword)
  }, [])

  const handleDiagramPageChange = useCallback((page: number) => {
    setDiagramPage(page)
  }, [])

  const handleRevisionPageChange = useCallback((page: number) => {
    setRevisionPage(page)
  }, [])

  useEffect(() => {
    if (libraryMode !== 'diagrams') {
      return
    }

    if (diagramSearchTimerRef.current !== null) {
      window.clearTimeout(diagramSearchTimerRef.current)
    }

    diagramSearchTimerRef.current = window.setTimeout(() => {
      void loadDiagramList(1, diagramKeyword)
    }, 250)

    return () => {
      if (diagramSearchTimerRef.current !== null) {
        window.clearTimeout(diagramSearchTimerRef.current)
        diagramSearchTimerRef.current = null
      }
    }
  }, [diagramKeyword, libraryMode, loadDiagramList])

  useEffect(() => {
    if (libraryMode) {
      return
    }

    diagramListAbortRef.current?.abort()
    revisionListAbortRef.current?.abort()
    diagramListRequestIdRef.current += 1
    revisionListRequestIdRef.current += 1
  }, [libraryMode])

  return {
    libraryMode,
    diagramItems,
    revisionItems,
    diagramKeyword,
    diagramPage,
    diagramTotalPages,
    revisionPage,
    revisionTotalPages,
    deletingDiagramId,
    setLibraryMode,
    handleDiagramSearch,
    handleDiagramPageChange,
    handleRevisionPageChange,
    handleOpenDiagramList,
    handleOpenRevisionHistory,
    handleDeleteDiagram,
    loadRevisionHistory,
  }
}
