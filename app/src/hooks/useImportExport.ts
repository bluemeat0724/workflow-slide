import { useRef, useState, useCallback } from 'react'
import type { DiagramApiClient } from '../api/client'
import type { Diagram } from '../model/diagram'
import type { Messages } from '../i18n'
import { downloadTextFile, slugifyFileName } from '../utils/download'
import { generateStandaloneHtml } from '../utils/exportHtml'
import { parseDiagramJson, serializeDiagramJson } from '../utils/json'

type UseImportExportInput = {
  api: DiagramApiClient | null
  diagram: Diagram
  messages: Messages
  setStatus: (status: string) => void
  onImportDiagram: (diagram: Diagram) => Promise<void>
  onRefreshAfterImport: () => Promise<void>
}

export function useImportExport({
  api,
  diagram,
  messages,
  setStatus,
  onImportDiagram,
  onRefreshAfterImport,
}: UseImportExportInput) {
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [isExportingGif, setIsExportingGif] = useState(false)

  const handleExportJson = useCallback(() => {
    const filename = `${slugifyFileName(diagram.meta.title)}.json`
    downloadTextFile(filename, serializeDiagramJson(diagram), 'application/json;charset=utf-8')
    setStatus(messages.status.jsonExported)
  }, [diagram, messages.status.jsonExported, setStatus])

  const handleExportHtml = useCallback(() => {
    const filename = `${slugifyFileName(diagram.meta.title)}.html`
    downloadTextFile(filename, generateStandaloneHtml(diagram), 'text/html;charset=utf-8')
    setStatus(messages.status.htmlExported)
  }, [diagram, messages.status.htmlExported, setStatus])

  const handleExportGif = useCallback(async () => {
    if (!api || isExportingGif) return

    setIsExportingGif(true)
    setStatus(messages.status.persistenceSaving)

    try {
      const blob = await api.exportGif({ diagram })
      const filename = `${slugifyFileName(diagram.meta.title)}.gif`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      setStatus(messages.status.gifExported)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : messages.status.gifExportFailed)
    } finally {
      setIsExportingGif(false)
    }
  }, [api, diagram, isExportingGif, messages, setStatus])

  const handleImportJsonClick = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const handleImportJsonChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const importedDiagram = parseDiagramJson(await file.text())
      await onImportDiagram(importedDiagram)
      setStatus(messages.status.jsonImported)
      await onRefreshAfterImport()
    } catch {
      setStatus(messages.status.jsonImportFailed)
    } finally {
      event.target.value = ''
    }
  }, [messages, onImportDiagram, onRefreshAfterImport, setStatus])

  return {
    importInputRef,
    isExportingGif,
    handleExportJson,
    handleExportHtml,
    handleExportGif,
    handleImportJsonClick,
    handleImportJsonChange,
  }
}
