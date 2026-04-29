import type { Diagram, Selection } from '../../model/diagram'
import type { Messages } from '../../i18n'

type SidebarProps = {
  diagram: Diagram
  messages: Messages
  selection: Selection
  onSelect: (selection: Selection) => void
  onAddLane: () => void
  onAddNode: () => void
}

export function Sidebar({ diagram, messages, selection, onSelect, onAddLane, onAddNode }: SidebarProps) {
  function getNodeTitle(nodeId: string) {
    return diagram.nodes.find((node) => node.id === nodeId)?.title ?? nodeId
  }

  return (
    <aside className="panel sidebar">
      <div className="panel__header">
        <h2>{messages.sidebar.title}</h2>
      </div>

      <section className="sidebar__section">
        <div className="sidebar__section-header">
          <h3>{messages.sidebar.lanes}</h3>
          <button type="button" className="sidebar__add-button" onClick={onAddLane}>{messages.sidebar.addLane}</button>
        </div>
        <div className="sidebar__list">
          {diagram.lanes.map((lane) => (
            <button
              key={lane.id}
              type="button"
              className={`sidebar__item ${selection.kind === 'lane' && selection.id === lane.id ? 'is-selected' : ''}`}
              onClick={() => onSelect({ kind: 'lane', id: lane.id })}
            >
              <strong>{lane.title}</strong>
              <span>{lane.subtitle}</span>
            </button>
          ))}
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
