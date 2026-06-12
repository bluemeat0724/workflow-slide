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
        <a
          className="toolbar__button toolbar__button--ghost toolbar__icon-link"
          href="https://github.com/bluemeat0724/workflow-slide"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          title="GitHub"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 1.5a10.5 10.5 0 0 0-3.32 20.47c.52.1.7-.22.7-.5l-.01-1.95c-2.87.62-3.48-1.22-3.48-1.22-.47-1.2-1.14-1.52-1.14-1.52-.93-.64.07-.62.07-.62 1.03.07 1.57 1.05 1.57 1.05.91 1.57 2.39 1.12 2.97.86.09-.66.36-1.12.64-1.38-2.29-.26-4.69-1.14-4.69-5.1 0-1.13.4-2.05 1.05-2.77-.1-.26-.46-1.33.1-2.77 0 0 .86-.28 2.82 1.05a9.68 9.68 0 0 1 5.14 0c1.95-1.33 2.81-1.05 2.81-1.05.56 1.44.2 2.51.1 2.77.66.72 1.04 1.64 1.04 2.77 0 3.97-2.4 4.84-4.7 5.09.37.32.7.94.7 1.89l-.01 2.81c0 .28.18.61.71.5A10.5 10.5 0 0 0 12 1.5Z"
              fill="currentColor"
            />
          </svg>
        </a>
      </div>
    </header>
  )
}
