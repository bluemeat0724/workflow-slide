import type { Locale } from '../../model/diagram'
import type { Messages } from '../../i18n'

type ToolbarProps = {
  messages: Messages
  locale: Locale
  showCreateRemote: boolean
  showDiagramList: boolean
  showRevisionActions: boolean
  showExportGif: boolean
  showImportExport: boolean
  isCreatingRemote: boolean
  isExportingGif: boolean
  onCreateNewDiagram: () => void
  onLocaleChange: (locale: Locale) => void
  onCreateRemote: () => void
  onOpenDiagramList: () => void
  onOpenRevisionHistory: () => void
  onSaveRevision: () => void
  onImportJson: () => void
  onExportJson: () => void
  onExportHtml: () => void
  onExportGif: () => void
  onClearDraft: () => void
}

export function Toolbar({
  messages,
  locale,
  showCreateRemote,
  showDiagramList,
  showRevisionActions,
  showExportGif,
  showImportExport,
  isCreatingRemote,
  isExportingGif,
  onCreateNewDiagram,
  onLocaleChange,
  onCreateRemote,
  onOpenDiagramList,
  onOpenRevisionHistory,
  onSaveRevision,
  onImportJson,
  onExportJson,
  onExportHtml,
  onExportGif,
  onClearDraft,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div>
        <p className="toolbar__eyebrow">Workflow Tool</p>
        <h1>{messages.appTitle}</h1>
        <p className="toolbar__subtitle">{messages.subtitle}</p>
      </div>
      <div className="toolbar__actions">
        <label className="toolbar__locale">
          <select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onCreateNewDiagram}>
          {messages.toolbar.newDiagram}
        </button>
        {showCreateRemote ? (
          <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onCreateRemote} disabled={isCreatingRemote}>
            {messages.toolbar.createRemote}
          </button>
        ) : null}
        {showDiagramList ? (
          <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onOpenDiagramList}>
            {messages.toolbar.diagramList}
          </button>
        ) : null}
        {showRevisionActions ? (
          <>
            <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onOpenRevisionHistory}>
              {messages.toolbar.revisionHistory}
            </button>
            <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onSaveRevision}>
              {messages.toolbar.saveRevision}
            </button>
          </>
        ) : null}
        {showImportExport ? (
          <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onImportJson}>
            {messages.toolbar.importJson}
          </button>
        ) : null}
        {showImportExport ? (
          <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onExportJson}>
            {messages.toolbar.exportJson}
          </button>
        ) : null}
        <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onClearDraft}>
          {messages.toolbar.clearDraft}
        </button>
        <button type="button" className="toolbar__button" onClick={onExportHtml}>
          {messages.toolbar.exportHtml}
        </button>
        {showExportGif ? (
          <button type="button" className="toolbar__button" onClick={onExportGif} disabled={isExportingGif}>
            {isExportingGif ? '...' : messages.toolbar.exportGif}
          </button>
        ) : null}
      </div>
    </header>
  )
}
