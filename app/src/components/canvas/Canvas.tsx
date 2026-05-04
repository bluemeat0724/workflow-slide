import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Diagram, MultiSelection, Node, Selection } from '../../model/diagram'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../model/diagram'
import type { Messages } from '../../i18n'
import {
  HORIZONTAL_PADDING,
  NODE_MIN_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_WIDTH,
  VERTICAL_PADDING,
  buildEdgePath,
  clamp,
  getLaneBounds,
  getLaneByY,
} from '../../utils/geometry'
import { getSectionSubtitle, getSectionTitle } from '../../utils/sectionLabels'

type CanvasProps = {
  diagram: Diagram
  selection: Selection
  multiSelection: MultiSelection
  messages: Messages
  onSelect: (selection: Selection) => void
  onNodeSelect: (nodeId: string, append: boolean) => void
  onSetMultiSelection: (nodeIds: string[]) => void
  onUpdateNodePosition: (nodeId: string, x: number, y: number, laneId: string) => void
  onUpdateNodeWidth: (nodeId: string, width: number) => void
  onUpdateNodeHeight: (nodeId: string, height: number) => void
  onUpdateNodeContent: (nodeId: string, updates: { title?: string; description?: string; tag?: string }) => void
  onCreateEdge: (fromNodeId: string, toNodeId: string) => void
  onStatusChange: (message: string) => void
  onDeleteNode: (nodeId: string) => void
  onDeleteEdge: (edgeId: string) => void
}

type InteractionState =
  | {
      mode: 'drag'
      nodeId: string
      pointerId: number
      offsetX: number
      offsetY: number
    }
  | {
      mode: 'resize'
      nodeId: string
      pointerId: number
      direction: ResizeDirection
      startPointerX: number
      startPointerY: number
      startX: number
      startY: number
      startWidth: number
      startHeight: number
    }
  | {
      mode: 'connect'
      nodeId: string
      pointerId: number
      startX: number
      startY: number
      currentX: number
      currentY: number
      targetNodeId: string | null
    }
  | {
      mode: 'marquee'
      pointerId: number
      startX: number
      startY: number
      currentX: number
      currentY: number
    }

type ContextMenuState =
  | { kind: 'node'; id: string; x: number; y: number }
  | { kind: 'edge'; id: string; x: number; y: number }
  | null

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_DIRECTIONS: ResizeDirection[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']

function getNodeClassName(type: Diagram['nodes'][number]['type']) {
  if (type === 'agent') return 'node-card node-card--agent'
  if (type === 'shared') return 'node-card node-card--shared'
  if (type === 'output') return 'node-card node-card--output'
  return 'node-card'
}

export function Canvas({
  diagram,
  selection,
  multiSelection,
  messages,
  onSelect,
  onNodeSelect,
  onSetMultiSelection,
  onUpdateNodePosition,
  onUpdateNodeWidth,
  onUpdateNodeHeight,
  onUpdateNodeContent,
  onCreateEdge,
  onStatusChange,
  onDeleteNode,
  onDeleteEdge,
}: CanvasProps) {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  const [interaction, setInteraction] = useState<InteractionState | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const resolvedEditingNodeId = editingNodeId && diagram.nodes.some((node) => node.id === editingNodeId) ? editingNodeId : null

  useEffect(() => {
    if (!boardRef.current || typeof ResizeObserver === 'undefined') {
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const boardRect = boardRef.current?.getBoundingClientRect()
      if (!boardRect || boardRect.height === 0) {
        return
      }

      entries.forEach((entry) => {
        const element = entry.target as HTMLElement
        const nodeId = element.dataset.nodeId
        if (!nodeId) {
          return
        }

        const node = diagram.nodes.find((item) => item.id === nodeId)
        if (!node) {
          return
        }

        const requiredHeight = (element.scrollHeight / boardRect.height) * 100
        if (requiredHeight > node.height + 0.15) {
          onUpdateNodeHeight(nodeId, requiredHeight)
        }
      })
    })

    nodeRefs.current.forEach((element) => observer.observe(element))

    return () => {
      observer.disconnect()
    }
  }, [diagram.nodes, onUpdateNodeHeight])

  useEffect(() => {
    if (!resolvedEditingNodeId) {
      return undefined
    }

    const activeEditingNodeId = resolvedEditingNodeId

    function handleDocumentPointerDown(event: PointerEvent) {
      const activeNodeElement = nodeRefs.current.get(activeEditingNodeId)
      if (!activeNodeElement) {
        setEditingNodeId(null)
        return
      }

      const target = event.target
      if (target instanceof Node && activeNodeElement.contains(target)) {
        return
      }

      setEditingNodeId(null)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setEditingNodeId(null)
      }
    }

    window.addEventListener('pointerdown', handleDocumentPointerDown, true)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointerdown', handleDocumentPointerDown, true)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [resolvedEditingNodeId])

  function setNodeRef(nodeId: string, element: HTMLElement | null) {
    if (!element) {
      nodeRefs.current.delete(nodeId)
      return
    }

    nodeRefs.current.set(nodeId, element)
  }

  useEffect(() => {
    if (!interaction) {
      return undefined
    }

    const activeInteraction = interaction

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== activeInteraction.pointerId || !boardRef.current) {
        return
      }

      const rect = boardRef.current.getBoundingClientRect()
      const pointerX = ((event.clientX - rect.left) / rect.width) * 100
      const pointerY = ((event.clientY - rect.top) / rect.height) * 100

      if (activeInteraction.mode === 'marquee') {
        setInteraction({
          ...activeInteraction,
          currentX: pointerX,
          currentY: pointerY,
        })
        return
      }

      const node = diagram.nodes.find((item) => item.id === activeInteraction.nodeId)
      if (!node) {
        return
      }

      if (activeInteraction.mode === 'connect') {
        const targetNode = diagram.nodes.find((candidate) => {
          if (candidate.id === node.id) {
            return false
          }

          return (
            pointerX >= candidate.x &&
            pointerX <= candidate.x + candidate.width &&
            pointerY >= candidate.y &&
            pointerY <= candidate.y + candidate.height
          )
        })

        setInteraction({
          ...activeInteraction,
          currentX: pointerX,
          currentY: pointerY,
          targetNodeId: targetNode?.id ?? null,
        })
        return
      }

      if (activeInteraction.mode === 'drag') {
        const nextX = clamp(pointerX - activeInteraction.offsetX, HORIZONTAL_PADDING, 100 - node.width - HORIZONTAL_PADDING)
        const rawY = clamp(pointerY - activeInteraction.offsetY, 0, 100 - node.height)
        const nextLane = getLaneByY(diagram.lanes, rawY + node.height / 2)
        const nextBounds = getLaneBounds(diagram.lanes, nextLane.id)
        const nextY = clamp(
          rawY,
          nextBounds.top + VERTICAL_PADDING,
          Math.max(nextBounds.top + VERTICAL_PADDING, nextBounds.top + nextBounds.height - node.height - VERTICAL_PADDING),
        )

        onUpdateNodePosition(node.id, nextX, nextY, nextLane.id)
        return
      }

      const deltaX = ((event.clientX - activeInteraction.startPointerX) / rect.width) * 100
      const deltaY = ((event.clientY - activeInteraction.startPointerY) / rect.height) * 100
      const laneBounds = getLaneBounds(diagram.lanes, node.laneId)
      const maxHeight = Math.max(NODE_MIN_HEIGHT, laneBounds.height - VERTICAL_PADDING * 2)

      let nextX = activeInteraction.startX
      let nextY = activeInteraction.startY
      let nextWidth = activeInteraction.startWidth
      let nextHeight = activeInteraction.startHeight

      if (activeInteraction.direction.includes('e')) {
        nextWidth = clamp(
          activeInteraction.startWidth + deltaX,
          NODE_MIN_WIDTH,
          Math.min(NODE_MAX_WIDTH, 100 - activeInteraction.startX - HORIZONTAL_PADDING),
        )
      }

      if (activeInteraction.direction.includes('w')) {
        const maxLeftX = activeInteraction.startX + activeInteraction.startWidth - NODE_MIN_WIDTH
        nextX = clamp(activeInteraction.startX + deltaX, HORIZONTAL_PADDING, maxLeftX)
        nextWidth = clamp(activeInteraction.startWidth - (nextX - activeInteraction.startX), NODE_MIN_WIDTH, NODE_MAX_WIDTH)
      }

      if (activeInteraction.direction.includes('s')) {
        nextHeight = clamp(
          activeInteraction.startHeight + deltaY,
          NODE_MIN_HEIGHT,
          Math.min(maxHeight, laneBounds.top + laneBounds.height - VERTICAL_PADDING - activeInteraction.startY),
        )
      }

      if (activeInteraction.direction.includes('n')) {
        const maxTopY = activeInteraction.startY + activeInteraction.startHeight - NODE_MIN_HEIGHT
        nextY = clamp(activeInteraction.startY + deltaY, laneBounds.top + VERTICAL_PADDING, maxTopY)
        nextHeight = clamp(activeInteraction.startHeight - (nextY - activeInteraction.startY), NODE_MIN_HEIGHT, maxHeight)
      }

      onUpdateNodePosition(node.id, nextX, nextY, node.laneId)
      onUpdateNodeWidth(node.id, nextWidth)
      onUpdateNodeHeight(node.id, nextHeight)
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.pointerId !== activeInteraction.pointerId) {
        return
      }

      if (activeInteraction.mode === 'marquee') {
        const minX = Math.min(activeInteraction.startX, activeInteraction.currentX)
        const maxX = Math.max(activeInteraction.startX, activeInteraction.currentX)
        const minY = Math.min(activeInteraction.startY, activeInteraction.currentY)
        const maxY = Math.max(activeInteraction.startY, activeInteraction.currentY)
        const selectedNodeIds = diagram.nodes
          .filter(
            (candidate) =>
              candidate.x >= minX &&
              candidate.x + candidate.width <= maxX &&
              candidate.y >= minY &&
              candidate.y + candidate.height <= maxY,
          )
          .map((candidate) => candidate.id)

        onSetMultiSelection(selectedNodeIds)
        setInteraction(null)
        return
      }

      if (activeInteraction.mode === 'connect' && activeInteraction.targetNodeId) {
        onCreateEdge(activeInteraction.nodeId, activeInteraction.targetNodeId)
      }

      setInteraction(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [diagram.lanes, diagram.nodes, interaction, onCreateEdge, onSetMultiSelection, onUpdateNodeHeight, onUpdateNodePosition, onUpdateNodeWidth])

  function getBoardPoint(clientX: number, clientY: number) {
    if (!boardRef.current) {
      return null
    }

    const rect = boardRef.current.getBoundingClientRect()
    return {
      xPercent: ((clientX - rect.left) / rect.width) * 100,
      yPercent: ((clientY - rect.top) / rect.height) * 100,
      xPx: clientX - rect.left,
      yPx: clientY - rect.top,
    }
  }

  function startDrag(event: React.PointerEvent<HTMLElement>, node: Node) {
    const point = getBoardPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    setInteraction({
      mode: 'drag',
      nodeId: node.id,
      pointerId: event.pointerId,
      offsetX: point.xPercent - node.x,
      offsetY: point.yPercent - node.y,
    })
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>, node: Node, direction: ResizeDirection) {
    event.stopPropagation()
    setInteraction({
      mode: 'resize',
      nodeId: node.id,
      pointerId: event.pointerId,
      direction,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: node.x,
      startY: node.y,
      startWidth: node.width,
      startHeight: node.height,
    })
  }

  function startConnect(event: React.PointerEvent<HTMLButtonElement>, node: Node) {
    event.stopPropagation()
    const point = getBoardPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    setInteraction({
      mode: 'connect',
      nodeId: node.id,
      pointerId: event.pointerId,
      startX: node.x,
      startY: node.y + node.height / 2,
      currentX: point.xPercent,
      currentY: point.yPercent,
      targetNodeId: null,
    })
  }

  function startMarquee(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || resolvedEditingNodeId) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest('.node-card, .edge-path, .context-menu, input, textarea, select, button')) {
      return
    }

    const point = getBoardPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    event.preventDefault()
    setContextMenu(null)
    onSelect({ kind: 'canvas' })
    setInteraction({
      mode: 'marquee',
      pointerId: event.pointerId,
      startX: point.xPercent,
      startY: point.yPercent,
      currentX: point.xPercent,
      currentY: point.yPercent,
    })
  }

  function stopInlineEdit() {
    setEditingNodeId(null)
  }

  function openContextMenu(kind: 'node' | 'edge', id: string, clientX: number, clientY: number) {
    const point = getBoardPoint(clientX, clientY)
    if (!point) {
      return
    }

    setContextMenu({ kind, id, x: point.xPx, y: point.yPx })
  }

  function renderDraftEdge() {
    if (!interaction || interaction.mode !== 'connect') {
      return null
    }

    const startX = (interaction.startX / 100) * BOARD_WIDTH
    const startY = (interaction.startY / 100) * BOARD_HEIGHT
    const endX = (interaction.currentX / 100) * BOARD_WIDTH
    const endY = (interaction.currentY / 100) * BOARD_HEIGHT
    const dx = endX - startX
    const control = Math.max(Math.abs(dx) * 0.35, 64)
    const path = `M ${startX} ${startY} C ${startX - control} ${startY}, ${endX + control} ${endY}, ${endX} ${endY}`

    return <path d={path} className={`edge-path edge-path--theme edge-path--draft ${interaction.targetNodeId ? 'is-targeting' : ''}`} markerEnd="url(#arrow-theme)" />
  }

  function renderSelectionBox() {
    if (!interaction || interaction.mode !== 'marquee') {
      return null
    }

    const left = Math.min(interaction.startX, interaction.currentX)
    const top = Math.min(interaction.startY, interaction.currentY)
    const width = Math.abs(interaction.currentX - interaction.startX)
    const height = Math.abs(interaction.currentY - interaction.startY)

    return <div className="selection-box" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />
  }

  function renderContextMenu() {
    if (!contextMenu) {
      return null
    }

    return (
      <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
        {contextMenu.kind === 'node' ? (
          <>
            <button type="button" onClick={() => {
              onNodeSelect(contextMenu.id, false)
              setContextMenu(null)
            }}>{messages.canvas.contextSelectNode}</button>
            <button type="button" onClick={() => {
              onDeleteNode(contextMenu.id)
              setContextMenu(null)
            }}>{messages.canvas.contextDeleteNode}</button>
          </>
        ) : (
          <button type="button" onClick={() => {
            onDeleteEdge(contextMenu.id)
            setContextMenu(null)
          }}>{messages.canvas.contextDeleteEdge}</button>
        )}
      </div>
    )
  }

  return (
    <div
      className="canvas-panel"
      onClick={() => {
        onSelect({ kind: 'canvas' })
        onSetMultiSelection([])
        setContextMenu(null)
      }}
    >
      <div
        ref={boardRef}
        className="board"
        style={{ background: diagram.theme.boardBackground } as CSSProperties}
        onPointerDownCapture={startMarquee}
      >
            {diagram.lanes.map((lane) => {
              const bounds = getLaneBounds(diagram.lanes, lane.id)
              const isSelected = selection.kind === 'lane' && selection.id === lane.id
              const laneTitle = getSectionTitle(lane)
              const laneSubtitle = getSectionSubtitle(lane)

              return (
                <section
                  key={lane.id}
                  className={`lane ${isSelected ? 'is-selected' : ''}`}
                  style={{ top: `${bounds.top}%`, height: `${bounds.height}%`, background: diagram.theme.laneBackground } as CSSProperties}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'lane', id: lane.id })
                    onSetMultiSelection([])
                    setContextMenu(null)
                  }}
                >
                  <div className="lane__label">
                    <span className="lane__title">{laneTitle}</span>
                    {laneSubtitle ? <span className="lane__subtitle">{laneSubtitle}</span> : null}
                  </div>
                </section>
              )
            })}

            <svg className="edge-layer" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <marker id="arrow-theme" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L8,3 z" fill={diagram.theme.accent} />
                </marker>
                <marker id="arrow-soft" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L8,3 z" fill={diagram.theme.lineSoft} />
                </marker>
              </defs>

              {diagram.edges.map((edge) => {
                const isSelected = selection.kind === 'edge' && selection.id === edge.id
                return (
                  <path
                    key={edge.id}
                    d={buildEdgePath(edge, diagram.nodes)}
                    className={`edge-path edge-path--${edge.emphasis} ${isSelected ? 'is-selected' : ''}`}
                    markerEnd={edge.emphasis === 'theme' ? 'url(#arrow-theme)' : 'url(#arrow-soft)'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect({ kind: 'edge', id: edge.id })
                      onSetMultiSelection([])
                      setContextMenu(null)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onSelect({ kind: 'edge', id: edge.id })
                      onSetMultiSelection([])
                      openContextMenu('edge', edge.id, event.clientX, event.clientY)
                    }}
                  />
                )
              })}
              {renderDraftEdge()}
            </svg>
            {renderSelectionBox()}

            {diagram.nodes.map((node) => {
              const isSelected = selection.kind === 'node' && selection.id === node.id
              const isMultiSelected = multiSelection.nodeIds.includes(node.id)
              const isEditing = resolvedEditingNodeId === node.id
              const isTargetNode = interaction?.mode === 'connect' && interaction.targetNodeId === node.id

              return (
                <article
                  key={node.id}
                  ref={(element) => setNodeRef(node.id, element)}
                  data-node-id={node.id}
                  className={`${getNodeClassName(node.type)} ${isSelected || isMultiSelected ? 'is-selected' : ''} ${isTargetNode ? 'is-connect-target' : ''}`}
                  style={{ left: `${node.x}%`, top: `${node.y}%`, width: `${node.width}%`, height: `${node.height}%` }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onNodeSelect(node.id, event.shiftKey || event.ctrlKey || event.metaKey)
                    setContextMenu(null)
                  }}
                  onPointerDown={(event) => {
                    if (isEditing) {
                      return
                    }

                    event.stopPropagation()
                    onNodeSelect(node.id, event.shiftKey || event.ctrlKey || event.metaKey)
                    setContextMenu(null)
                    startDrag(event, node)
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    setEditingNodeId(node.id)
                    onStatusChange('')
                    setContextMenu(null)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onNodeSelect(node.id, false)
                    openContextMenu('node', node.id, event.clientX, event.clientY)
                  }}
                >
                  <button type="button" className="node-card__connect-handle" aria-label="Create edge" onPointerDown={(event) => startConnect(event, node)} />
                  {isEditing ? (
                    <div className="node-card__inline-editor" onPointerDown={(event) => event.stopPropagation()}>
                      <input value={node.title} placeholder={messages.canvas.inlineTitlePlaceholder} onChange={(event) => onUpdateNodeContent(node.id, { title: event.target.value })} />
                      <textarea rows={4} value={node.description} placeholder={messages.canvas.inlineDescriptionPlaceholder} onChange={(event) => onUpdateNodeContent(node.id, { description: event.target.value })} />
                      <input value={node.tag} placeholder={messages.canvas.inlineTagPlaceholder} onChange={(event) => onUpdateNodeContent(node.id, { tag: event.target.value })} onBlur={stopInlineEdit} />
                    </div>
                  ) : (
                    <>
                      <h3>{node.title}</h3>
                      <p>{node.description}</p>
                      {node.tag.trim() ? <span className="node-card__tag">{node.tag}</span> : null}
                    </>
                  )}
                  {RESIZE_DIRECTIONS.map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      className={`node-card__resize-handle node-card__resize-handle--${direction}`}
                      aria-label={`Resize node ${direction}`}
                      onPointerDown={(event) => startResize(event, node, direction)}
                    />
                  ))}
                </article>
              )
            })}
        {renderContextMenu()}
      </div>
    </div>
  )
}
