import type { DiagramListItem, DiagramRevision } from '../../api/contracts'
import type { Messages } from '../../i18n'

type DiagramLibraryProps = {
  messages: Messages
  mode: 'diagrams' | 'revisions' | null
  currentDiagramId: string | null
  diagrams: DiagramListItem[]
  revisions: DiagramRevision[]
  diagramKeyword: string
  diagramPage: number
  diagramTotalPages: number
  revisionPage: number
  revisionTotalPages: number
  deletingDiagramId: string | null
  onClose: () => void
  onDiagramKeywordChange: (value: string) => void
  onDiagramPageChange: (page: number) => void
  onRevisionPageChange: (page: number) => void
  onOpenDiagram: (diagramId: string) => void
  onDeleteDiagram: (diagram: DiagramListItem) => void
  onRestoreRevision: (revisionId: string) => void
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export function DiagramLibrary({
  messages,
  mode,
  currentDiagramId,
  diagrams,
  revisions,
  diagramKeyword,
  diagramPage,
  diagramTotalPages,
  revisionPage,
  revisionTotalPages,
  deletingDiagramId,
  onClose,
  onDiagramKeywordChange,
  onDiagramPageChange,
  onRevisionPageChange,
  onOpenDiagram,
  onDeleteDiagram,
  onRestoreRevision,
}: DiagramLibraryProps) {
  if (!mode) {
    return null
  }

  return (
    <div className="diagram-library-backdrop" onClick={onClose}>
      <aside className="diagram-library" onClick={(event) => event.stopPropagation()}>
        <div className="diagram-library__header">
          <div>
            <p className="diagram-library__eyebrow">Workflow Tool</p>
            <h2>{mode === 'diagrams' ? messages.library.diagramsTitle : messages.library.revisionsTitle}</h2>
          </div>
          <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onClose}>
            {messages.library.close}
          </button>
        </div>

        {mode === 'diagrams' ? (
          <>
            <label className="diagram-library__search">
              <input
                value={diagramKeyword}
                placeholder={messages.library.searchPlaceholder}
                onChange={(event) => onDiagramKeywordChange(event.target.value)}
              />
            </label>
            <div className="diagram-library__list">
              {diagrams.length === 0 ? <p className="diagram-library__empty">{messages.library.diagramsEmpty}</p> : null}
              {diagrams.map((item) => (
                <article key={item.id} className={`diagram-library__item ${item.id === currentDiagramId ? 'is-active' : ''}`}>
                  <div className="diagram-library__item-main">
                    <strong>{item.title}</strong>
                    <span>{messages.library.revisionVersion} {item.latestVersion}</span>
                    <span>{messages.library.updatedAt}: {formatDate(item.updatedAt)}</span>
                    {item.id === currentDiagramId ? <em>{messages.library.currentDiagram}</em> : null}
                  </div>
                  <div className="diagram-library__item-actions">
                    <button type="button" className="toolbar__button toolbar__button--ghost" onClick={() => onOpenDiagram(item.id)}>
                      {messages.library.openDiagram}
                    </button>
                    <button
                      type="button"
                      className="toolbar__button toolbar__button--ghost diagram-library__delete-button"
                      disabled={deletingDiagramId === item.id}
                      onClick={() => onDeleteDiagram(item)}
                    >
                      {deletingDiagramId === item.id ? messages.library.deletingDiagram : messages.library.deleteDiagram}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <div className="diagram-library__footer">
              <button
                type="button"
                className="toolbar__button toolbar__button--ghost"
                disabled={diagramPage <= 1}
                onClick={() => onDiagramPageChange(diagramPage - 1)}
              >
                {messages.library.previousPage}
              </button>
              <span>{messages.library.pageLabel.replace('{page}', String(diagramPage)).replace('{totalPages}', String(diagramTotalPages))}</span>
              <button
                type="button"
                className="toolbar__button toolbar__button--ghost"
                disabled={diagramPage >= diagramTotalPages}
                onClick={() => onDiagramPageChange(diagramPage + 1)}
              >
                {messages.library.nextPage}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="diagram-library__list">
              {revisions.length === 0 ? <p className="diagram-library__empty">{messages.library.revisionsEmpty}</p> : null}
              {revisions.map((item) => (
                <article key={item.revisionId} className="diagram-library__item">
                  <div className="diagram-library__item-main">
                    <strong>{messages.library.revisionVersion} {item.version}</strong>
                    <span>{messages.library.revisionSource}: {item.source}</span>
                    {item.changeSummary ? <span>{item.changeSummary}</span> : null}
                    <span>{messages.library.createdAt}: {formatDate(item.createdAt)}</span>
                  </div>
                  <button type="button" className="toolbar__button toolbar__button--ghost" onClick={() => onRestoreRevision(item.revisionId)}>
                    {messages.library.restoreRevision}
                  </button>
                </article>
              ))}
            </div>
            <div className="diagram-library__footer">
              <button
                type="button"
                className="toolbar__button toolbar__button--ghost"
                disabled={revisionPage <= 1}
                onClick={() => onRevisionPageChange(revisionPage - 1)}
              >
                {messages.library.previousPage}
              </button>
              <span>{messages.library.pageLabel.replace('{page}', String(revisionPage)).replace('{totalPages}', String(revisionTotalPages))}</span>
              <button
                type="button"
                className="toolbar__button toolbar__button--ghost"
                disabled={revisionPage >= revisionTotalPages}
                onClick={() => onRevisionPageChange(revisionPage + 1)}
              >
                {messages.library.nextPage}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
