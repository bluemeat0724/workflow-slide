import type { Diagram, Selection } from '../../model/diagram'
import type { Messages } from '../../i18n'
import { getSectionSubtitle, getSectionTitle } from '../../utils/sectionLabels'

type SidebarProps = {
  diagram: Diagram
  messages: Messages
  selection: Selection
  isCollapsed: boolean
  onSelect: (selection: Selection) => void
  onAddLane: () => void
  onAddNode: () => void
  onToggleCollapse: () => void
}

function SidebarToggleIcon({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4.5h12" />
      <path d="M4 10h12" />
      <path d="M4 15.5h12" />
      {isCollapsed ? <path d="m8 6 4 4-4 4" /> : <path d="m12 6-4 4 4 4" />}
    </svg>
  )
}

export function Sidebar({ diagram, messages, selection, isCollapsed, onSelect, onAddLane, onAddNode, onToggleCollapse }: SidebarProps) {
  function getNodeTitle(nodeId: string) {
    return diagram.nodes.find((node) => node.id === nodeId)?.title ?? nodeId
  }

  if (isCollapsed) {
    return (
      <aside className="panel sidebar sidebar--collapsed">
        <button
          type="button"
          className="sidebar__collapse-toggle sidebar__collapse-toggle--collapsed"
          aria-label={messages.sidebar.expand}
          title={messages.sidebar.expand}
          onClick={onToggleCollapse}
        >
          <SidebarToggleIcon isCollapsed />
          <span>{messages.sidebar.title}</span>
        </button>
      </aside>
    )
  }

  return (
    <aside className="panel sidebar">
      <div className="panel__header">
        <div className="sidebar__title-row">
          <h2>{messages.sidebar.title}</h2>
          <button
            type="button"
            className="sidebar__collapse-toggle"
            aria-label={messages.sidebar.collapse}
            title={messages.sidebar.collapse}
            onClick={onToggleCollapse}
          >
            <SidebarToggleIcon isCollapsed={false} />
          </button>
        </div>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__section-header">
          <h3>{messages.sidebar.lanes}</h3>
          <button type="button" className="sidebar__add-button" onClick={onAddLane}>{messages.sidebar.addLane}</button>
        </div>
        <div className="sidebar__list">
          {diagram.lanes.map((lane) => {
            const laneTitle = getSectionTitle(lane) || `Section ${lane.order + 1}`
            const laneSubtitle = getSectionSubtitle(lane)

            return (
              <button
                key={lane.id}
                type="button"
                className={`sidebar__item ${selection.kind === 'lane' && selection.id === lane.id ? 'is-selected' : ''}`}
                onClick={() => onSelect({ kind: 'lane', id: lane.id })}
              >
                <strong>{laneTitle}</strong>
                {laneSubtitle ? <span>{laneSubtitle}</span> : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="sidebar__section">
        <div className="sidebar__section-header">
          <h3>{messages.sidebar.nodes}</h3>
          <button type="button" className="sidebar__add-button" onClick={onAddNode}>{messages.sidebar.addNode}</button>
        </div>
        <div className="sidebar__list">
          {diagram.nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`sidebar__item ${selection.kind === 'node' && selection.id === node.id ? 'is-selected' : ''}`}
              onClick={() => onSelect({ kind: 'node', id: node.id })}
            >
              <strong>{node.title}</strong>
              {node.tag.trim() ? <span>{node.tag}</span> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar__section">
        <div className="sidebar__section-header">
          <h3>{messages.sidebar.edges}</h3>
        </div>
        <div className="sidebar__list">
          {diagram.edges.map((edge) => (
            <button
              key={edge.id}
              type="button"
              className={`sidebar__item ${selection.kind === 'edge' && selection.id === edge.id ? 'is-selected' : ''}`}
              onClick={() => onSelect({ kind: 'edge', id: edge.id })}
            >
              <strong>{getNodeTitle(edge.fromNodeId)} -&gt; {getNodeTitle(edge.toNodeId)}</strong>
              <span>{messages.edgeEmphasis[edge.emphasis]}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
