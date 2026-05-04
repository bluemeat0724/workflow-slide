import { useMemo, useState, type ReactNode } from 'react'
import type { Diagram, EdgeEmphasis, NodeType, Selection, Theme } from '../../model/diagram'
import type { Messages } from '../../i18n'
import { themePresets, type ThemePresetId } from '../../data/themePresets'
import { getSectionTitle } from '../../utils/sectionLabels'

type InspectorProps = {
  diagram: Diagram
  selection: Selection
  messages: Messages
  onUpdateCanvasTitle: (title: string) => void
  onUpdateLane: (laneId: string, updates: { title?: string; subtitle?: string }) => void
  onDeleteLane: (laneId: string) => void
  onUpdateNode: (nodeId: string, updates: { title?: string; description?: string; tag?: string; type?: NodeType }) => void
  onDeleteNode: (nodeId: string) => void
  onUpdateEdge: (edgeId: string, updates: { fromNodeId?: string; toNodeId?: string; emphasis?: EdgeEmphasis }) => void
  onDeleteEdge: (edgeId: string) => void
  onCreateEdge: (fromNodeId: string, toNodeId: string) => void
  onUpdateTheme: (updates: Partial<Pick<Theme, 'name' | 'bgPrimary' | 'textPrimary' | 'textMuted' | 'accent' | 'accentDeep'>>) => void
  onApplyThemePreset: (presetId: ThemePresetId) => void
  activeThemePresetId: ThemePresetId | null
}

export function Inspector({
  diagram,
  selection,
  messages,
  onUpdateCanvasTitle,
  onUpdateLane,
  onDeleteLane,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdge,
  onDeleteEdge,
  onCreateEdge,
  onUpdateTheme,
  onApplyThemePreset,
  activeThemePresetId,
}: InspectorProps) {
  const [targetNodeId, setTargetNodeId] = useState('')
  const selectedNode = selection.kind === 'node' ? diagram.nodes.find((item) => item.id === selection.id) : undefined
  const connectableNodes = useMemo(() => {
    if (!selectedNode) {
      return []
    }

    const sourceCenterX = selectedNode.x + selectedNode.width / 2
    const sourceCenterY = selectedNode.y + selectedNode.height / 2

    return diagram.nodes
      .filter((node) => node.id !== selectedNode.id)
      .sort((left, right) => {
        const leftCenterX = left.x + left.width / 2
        const leftCenterY = left.y + left.height / 2
        const rightCenterX = right.x + right.width / 2
        const rightCenterY = right.y + right.height / 2
        const leftDistance = Math.hypot(leftCenterX - sourceCenterX, leftCenterY - sourceCenterY)
        const rightDistance = Math.hypot(rightCenterX - sourceCenterX, rightCenterY - sourceCenterY)
        return leftDistance - rightDistance
      })
  }, [diagram.nodes, selectedNode])
  const resolvedTargetNodeId = connectableNodes.some((node) => node.id === targetNodeId)
    ? targetNodeId
    : (connectableNodes[0]?.id ?? '')
  const nodeSelectionKey = selectedNode?.id ?? ''

  function getNodeLabel(nodeId: string) {
    const node = diagram.nodes.find((item) => item.id === nodeId)
    if (!node) {
      return nodeId
    }

    const lane = diagram.lanes.find((item) => item.id === node.laneId)
    if (!lane) {
      return node.title
    }

    const laneTitle = getSectionTitle(lane)
    return laneTitle ? `${node.title} (${laneTitle})` : node.title
  }

  // Force remount when switching source node so the select resets cleanly.
  const nodeConnectField = selectedNode ? (
    <label key={nodeSelectionKey} className="inspector__field">
      <span>{messages.inspector.connectToField}</span>
      <select defaultValue={resolvedTargetNodeId} onChange={(event) => setTargetNodeId(event.target.value)}>
        {connectableNodes.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>{getNodeLabel(candidate.id)}</option>
        ))}
      </select>
    </label>
  ) : null

  let content: ReactNode

  if (selection.kind === 'canvas') {
    content = (
      <div className="inspector__group">
        <h3>{messages.inspector.canvas}</h3>
        <div className="inspector__form-grid">
          <label className="inspector__field">
            <span>{messages.inspector.canvasTitle}</span>
            <input value={diagram.meta.title} onChange={(event) => onUpdateCanvasTitle(event.target.value)} />
          </label>
        </div>
        <div className="inspector__group inspector__group--nested">
          <h3>{messages.inspector.theme}</h3>
          <div className="inspector__form-grid">
            <label className="inspector__field">
              <span>{messages.inspector.themePresetField}</span>
              <select value={activeThemePresetId ?? themePresets[0].id} onChange={(event) => {
                onApplyThemePreset(event.target.value as ThemePresetId)
              }}>
                {themePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {messages.themePresets[preset.id] ?? preset.theme.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="inspector__field">
              <span>{messages.inspector.themeNameField}</span>
              <input value={diagram.theme.name} onChange={(event) => onUpdateTheme({ name: event.target.value })} />
            </label>
            <label className="inspector__field inspector__field--color">
              <span>{messages.inspector.bgPrimaryField}</span>
              <input type="color" value={diagram.theme.bgPrimary} onChange={(event) => onUpdateTheme({ bgPrimary: event.target.value })} />
            </label>
            <label className="inspector__field inspector__field--color">
              <span>{messages.inspector.textPrimaryField}</span>
              <input type="color" value={diagram.theme.textPrimary} onChange={(event) => onUpdateTheme({ textPrimary: event.target.value })} />
            </label>
            <label className="inspector__field inspector__field--color">
              <span>{messages.inspector.textMutedField}</span>
              <input type="color" value={diagram.theme.textMuted} onChange={(event) => onUpdateTheme({ textMuted: event.target.value })} />
            </label>
            <label className="inspector__field inspector__field--color">
              <span>{messages.inspector.accentField}</span>
              <input type="color" value={diagram.theme.accent} onChange={(event) => onUpdateTheme({ accent: event.target.value })} />
            </label>
            <label className="inspector__field inspector__field--color">
              <span>{messages.inspector.accentDeepField}</span>
              <input type="color" value={diagram.theme.accentDeep} onChange={(event) => onUpdateTheme({ accentDeep: event.target.value })} />
            </label>
          </div>
        </div>
        <dl className="inspector__details">
          <div>
            <dt>{messages.inspector.laneCount}</dt>
            <dd>{diagram.lanes.length}</dd>
          </div>
        </dl>
      </div>
    )
  } else if (selection.kind === 'lane') {
    const lane = diagram.lanes.find((item) => item.id === selection.id)
    content = lane ? (
      <div className="inspector__group">
        <h3>{messages.inspector.lane}</h3>
        <div className="inspector__form-grid">
          <label className="inspector__field">
            <span>{messages.inspector.titleField}</span>
            <input value={lane.title} onChange={(event) => onUpdateLane(lane.id, { title: event.target.value })} />
          </label>
          <label className="inspector__field">
            <span>{messages.inspector.subtitleField}</span>
            <input value={lane.subtitle} onChange={(event) => onUpdateLane(lane.id, { subtitle: event.target.value })} />
          </label>
        </div>
        <button type="button" className="inspector__danger-button" onClick={() => onDeleteLane(lane.id)}>
          {messages.inspector.deleteLane}
        </button>
      </div>
    ) : (
      <p className="inspector__empty">{messages.inspector.empty}</p>
    )
  } else if (selection.kind === 'node') {
    const node = selectedNode
    content = node ? (
      <div className="inspector__group">
        <h3>{messages.inspector.node}</h3>
        <div className="inspector__form-grid">
          <label className="inspector__field">
            <span>{messages.inspector.titleField}</span>
            <input value={node.title} onChange={(event) => onUpdateNode(node.id, { title: event.target.value })} />
          </label>
          <label className="inspector__field">
            <span>{messages.inspector.descriptionField}</span>
            <textarea rows={4} value={node.description} onChange={(event) => onUpdateNode(node.id, { description: event.target.value })} />
          </label>
          <label className="inspector__field">
            <span>{messages.inspector.tagField}</span>
            <input value={node.tag} onChange={(event) => onUpdateNode(node.id, { tag: event.target.value })} />
          </label>
          <label className="inspector__field">
            <span>{messages.inspector.typeField}</span>
            <select value={node.type} onChange={(event) => onUpdateNode(node.id, { type: event.target.value as NodeType })}>
              <option value="default">{messages.nodeTypes.default}</option>
              <option value="agent">{messages.nodeTypes.agent}</option>
              <option value="shared">{messages.nodeTypes.shared}</option>
              <option value="output">{messages.nodeTypes.output}</option>
            </select>
          </label>
          {nodeConnectField}
        </div>
        <button type="button" className="inspector__action-button" disabled={!resolvedTargetNodeId} onClick={() => onCreateEdge(node.id, resolvedTargetNodeId)}>
          {messages.inspector.createEdge}
        </button>
        <button type="button" className="inspector__danger-button" onClick={() => onDeleteNode(node.id)}>
          {messages.inspector.deleteNode}
        </button>
      </div>
    ) : (
      <p className="inspector__empty">{messages.inspector.empty}</p>
    )
  } else {
    const edge = diagram.edges.find((item) => item.id === selection.id)
    content = edge ? (
      <div className="inspector__group">
        <h3>{messages.inspector.edge}</h3>
        <div className="inspector__form-grid">
          <label className="inspector__field">
            <span>{messages.inspector.fromField}</span>
            <select value={edge.fromNodeId} onChange={(event) => onUpdateEdge(edge.id, { fromNodeId: event.target.value })}>
              {diagram.nodes.filter((node) => node.id !== edge.toNodeId).map((node) => (
                <option key={node.id} value={node.id}>{getNodeLabel(node.id)}</option>
              ))}
            </select>
          </label>
          <label className="inspector__field">
            <span>{messages.inspector.toField}</span>
            <select value={edge.toNodeId} onChange={(event) => onUpdateEdge(edge.id, { toNodeId: event.target.value })}>
              {diagram.nodes.filter((node) => node.id !== edge.fromNodeId).map((node) => (
                <option key={node.id} value={node.id}>{getNodeLabel(node.id)}</option>
              ))}
            </select>
          </label>
          <label className="inspector__field">
            <span>{messages.inspector.emphasisField}</span>
            <select value={edge.emphasis} onChange={(event) => onUpdateEdge(edge.id, { emphasis: event.target.value as EdgeEmphasis })}>
              <option value="soft">{messages.edgeEmphasis.soft}</option>
              <option value="theme">{messages.edgeEmphasis.theme}</option>
            </select>
          </label>
        </div>
        <dl className="inspector__details">
          <div>
            <dt>{messages.inspector.fromField}</dt>
            <dd>{edge.fromNodeId}</dd>
          </div>
          <div>
            <dt>{messages.inspector.toField}</dt>
            <dd>{edge.toNodeId}</dd>
          </div>
        </dl>
        <button type="button" className="inspector__danger-button" onClick={() => onDeleteEdge(edge.id)}>
          {messages.inspector.deleteEdge}
        </button>
      </div>
    ) : (
      <p className="inspector__empty">{messages.inspector.empty}</p>
    )
  }

  return (
    <aside className="panel inspector">
      <div className="panel__header">
        <h2>{messages.inspector.title}</h2>
      </div>
      {content}
    </aside>
  )
}
