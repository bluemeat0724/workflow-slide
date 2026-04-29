import type { Locale } from '../../model/diagram'
import type { Messages } from '../../i18n'

type ToolbarProps = {
  messages: Messages
  locale: Locale
  onLocaleChange: (locale: Locale) => void
  onImportJson: () => void
  onExportJson: () => void
  onExportHtml: () => void
  onClearDraft: () => void
}

export function Toolbar({ messages, locale, onLocaleChange, onImportJson, onExportJson, onExportHtml, onClearDraft }: ToolbarProps) {
  return (
    <header className="toolbar">
      <div>
        <p className="toolbar__eyebrow">Workflow Tool</p>
        <h1>{messages.appTitle}</h1>
        <p className="toolbar__subtitle">{messages.subtitle}</p>
      </div>
      <div className="toolbar__actions">
        <label className="toolbar__locale">
          <span>{messages.toolbar.locale}</span>
          <select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
            <option value="zh-CN">中文</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onImportJson}>
          {messages.toolbar.importJson}
        </button>
        <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onExportJson}>
          {messages.toolbar.exportJson}
        </button>
        <button type="button" className="toolbar__button toolbar__button--ghost" onClick={onClearDraft}>
          {messages.toolbar.clearDraft}
        </button>
        <button type="button" className="toolbar__button" onClick={onExportHtml}>
          {messages.toolbar.exportHtml}
        </button>
      </div>
    </header>
  )
}
