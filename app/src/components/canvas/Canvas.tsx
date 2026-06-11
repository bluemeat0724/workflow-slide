import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Diagram, Edge, MultiSelection, Selection } from '../../model/diagram'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../model/diagram'
import type { Messages } from '../../i18n'
import {
  buildEdgePath,
  getEdgeAnchor,
  getLaneBounds,
} from '../../utils/geometry'
import { buildEdgeAnimationPlan, getEdgeDashOffset, resolveEdgeAnimationMode } from '../../utils/edgeAnimation'
import { getSectionSubtitle, getSectionTitle } from '../../utils/sectionLabels'
import {
  useCanvasInteraction,
  type ConnectionSide,
  type ResizeDirection,
} from '../../hooks/useCanvasInteraction'

type CanvasProps = {
  diagram: Diagram
  selection: Selection
  multiSelection: MultiSelection
  messages: Messages
  onSelect: (selection: Selection) => void
  onNodeSelect: (nodeId: string, append: boolean) => void
  onSetMultiSelection: (nodeIds: string[]) => void
  onUpdateNodePosition: (nodeId: string, x: number, y: number) => void
  onUpdateNodeWidth: (nodeId: string, width: number) => void
  onMeasureNodeHeight: (nodeId: string, height: number) => void
  onResizeNodeHeight: (nodeId: string, height: number) => void
  onUpdateNodeContent: (nodeId: string, updates: { title?: string; description?: string; tag?: string }) => void
  onCreateEdge: (fromNodeId: string, toNodeId: string) => void
  onUpdateEdge: (edgeId: string, updates: Partial<Edge>) => void
  onStatusChange: (message: string) => void
  onDeleteNode: (nodeId: string) => void
  onDeleteEdge: (edgeId: string) => void
}

type ContextMenuState =
  | { kind: 'node'; id: string; x: number; y: number }
  | { kind: 'edge'; id: string; x: number; y: number }
  | null

const RESIZE_DIRECTIONS: ResizeDirection[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']
const CONNECTION_SIDES: ConnectionSide[] = ['top', 'right', 'bottom', 'left']
const FULLSCREEN_ICON_STROKE_WIDTH = 1.8

function getNodeClassName(type: Diagram['nodes'][number]['type']) {
  if (type === 'agent') return 'node-card node-card--agent'
  if (type === 'shared') return 'node-card node-card--shared'
  if (type === 'output') return 'node-card node-card--output'
  return 'node-card'
}

function FullscreenIcon({ isFullscreen }: { isFullscreen: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={FULLSCREEN_ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {isFullscreen ? (
        <>
          <path d="M7 3.5H3.5V7" />
          <path d="M13 3.5h3.5V7" />
          <path d="M7 16.5H3.5V13" />
          <path d="M13 16.5h3.5V13" />
          <path d="M7.5 7.5 3.5 3.5" />
          <path d="M12.5 7.5 16.5 3.5" />
          <path d="M7.5 12.5 3.5 16.5" />
          <path d="M12.5 12.5 16.5 16.5" />
        </>
      ) : (
        <>
          <path d="M7 3.5H3.5V7" />
          <path d="M13 3.5h3.5V7" />
          <path d="M7 16.5H3.5V13" />
          <path d="M13 16.5h3.5V13" />
          <path d="M3.5 7 8 2.5" />
          <path d="M16.5 7 12 2.5" />
          <path d="M3.5 13 8 17.5" />
          <path d="M16.5 13 12 17.5" />
        </>
      )}
    </svg>
  )
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
  onMeasureNodeHeight,
  onResizeNodeHeight,
  onUpdateNodeContent,
  onCreateEdge,
  onUpdateEdge,
  onStatusChange,
  onDeleteNode,
  onDeleteEdge,
}: CanvasProps) {
  const canvasPanelRef = useRef<HTMLDivElement | null>(null)
  const boardRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [animationElapsed, setAnimationElapsed] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const resolvedEditingNodeId = editingNodeId && diagram.nodes.some((node) => node.id === editingNodeId) ? editingNodeId : null
  const edgeAnimationMode = resolveEdgeAnimationMode(diagram.meta.edgeAnimationMode)
  const edgeAnimationPlan = useMemo(() => buildEdgeAnimationPlan(diagram), [diagram])

  const {
    interaction,
    getBoardPoint,
    startDrag,
    startResize,
    startConnect,
    startReconnect,
    startMarquee,
  } = useCanvasInteraction({
    boardRef,
    nodes: diagram.nodes,
    editingNodeId: resolvedEditingNodeId,
    onUpdateNodePosition,
    onUpdateNodeWidth,
    onResizeNodeHeight,
    onCreateEdge,
    onUpdateEdge,
    onSetMultiSelection,
    onSelect,
  })

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement?.classList.contains('app-shell') ?? false)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (diagram.edges.length === 0) {
      return undefined
    }

    let frameId = 0
    const startedAt = performance.now()

    const tick = (now: number) => {
      setAnimationElapsed(now - startedAt)
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [diagram.edges.length, edgeAnimationPlan.totalSteps])

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
        const content = entry.target as HTMLElement
        const element = content.closest<HTMLElement>('[data-node-id]')
        const nodeId = element?.dataset.nodeId
        if (!nodeId) {
          return
        }

        const node = diagram.nodes.find((item) => item.id === nodeId)
        if (!node) {
          return
        }

        if (!element || node.heightMode !== 'auto' || resolvedEditingNodeId === nodeId) {
          return
        }

        const styles = window.getComputedStyle(element)
        const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)
        const requiredHeight = ((content.scrollHeight + verticalPadding) / boardRect.height) * 100
        if (Math.abs(requiredHeight - node.height) > 0.15) {
          onMeasureNodeHeight(nodeId, requiredHeight)
        }
      })
    })

    nodeRefs.current.forEach((element) => {
      const content = element.querySelector<HTMLElement>('.node-card__content')
      if (content) observer.observe(content)
    })

    return () => {
      observer.disconnect()
    }
  }, [diagram.nodes, onMeasureNodeHeight, resolvedEditingNodeId])

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

  function stopInlineEdit() {
    setEditingNodeId(null)
  }

  function canvasStartMarquee(event: React.PointerEvent<HTMLDivElement>) {
    setContextMenu(null)
    startMarquee(event)
  }

  function openContextMenu(kind: 'node' | 'edge', id: string, clientX: number, clientY: number) {
    const point = getBoardPoint(clientX, clientY)
    if (!point) {
      return
    }

    setContextMenu({ kind, id, x: point.xPx, y: point.yPx })
  }

  function renderDraftEdge() {
    if (!interaction || (interaction.mode !== 'connect' && interaction.mode !== 'reconnect')) {
      return null
    }

    const reconnectingFrom = interaction.mode === 'reconnect' && interaction.endpoint === 'from'
    const fixedX = interaction.mode === 'connect' ? interaction.startX : interaction.fixedX
    const fixedY = interaction.mode === 'connect' ? interaction.startY : interaction.fixedY
    const startX = ((reconnectingFrom ? interaction.currentX : fixedX) / 100) * BOARD_WIDTH
    const startY = ((reconnectingFrom ? interaction.currentY : fixedY) / 100) * BOARD_HEIGHT
    const endX = ((reconnectingFrom ? fixedX : interaction.currentX) / 100) * BOARD_WIDTH
    const endY = ((reconnectingFrom ? fixedY : interaction.currentY) / 100) * BOARD_HEIGHT
    const dx = endX - startX
    const control = Math.max(Math.abs(dx) * 0.35, 64)
    const path = `M ${startX} ${startY} C ${startX + (dx >= 0 ? control : -control)} ${startY}, ${endX - (dx >= 0 ? control : -control)} ${endY}, ${endX} ${endY}`

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
      ref={canvasPanelRef}
      className="canvas-panel"
      onClick={() => {
        onSelect({ kind: 'canvas' })
        onSetMultiSelection([])
        setContextMenu(null)
      }}
    >
      <button
        type="button"
        className="canvas-panel__fullscreen-button"
        aria-pressed={isFullscreen}
        aria-label={isFullscreen ? messages.canvas.exitFullscreen : messages.canvas.enterFullscreen}
        title={isFullscreen ? messages.canvas.exitFullscreen : messages.canvas.enterFullscreen}
        onClick={(event) => {
          event.stopPropagation()
          if (isFullscreen) {
            void document.exitFullscreen()
          } else {
            void canvasPanelRef.current?.closest<HTMLElement>('.app-shell')?.requestFullscreen()
          }
        }}
      >
        <FullscreenIcon isFullscreen={isFullscreen} />
      </button>
      <div className="board-shell">
        <div
          ref={boardRef}
          className="board"
          style={{ background: diagram.theme.boardBackground } as CSSProperties}
          onPointerDownCapture={canvasStartMarquee}
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

            <svg className="edge-layer" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} preserveAspectRatio="none">
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
                const dashOffset = getEdgeDashOffset({ mode: edgeAnimationMode, plan: edgeAnimationPlan, edgeId: edge.id, elapsedMs: animationElapsed })
                const path = buildEdgePath(edge, diagram.nodes)
                const anchor = getEdgeAnchor(edge, diagram.nodes)
                const selectEdge = () => {
                  onSelect({ kind: 'edge', id: edge.id })
                  onSetMultiSelection([])
                  setContextMenu(null)
                }
                return (
                  <g key={edge.id} className={`edge-group ${isSelected ? 'is-selected' : ''}`}>
                    <path
                      d={path}
                      className="edge-hit-area"
                      onClick={(event) => {
                        event.stopPropagation()
                        selectEdge()
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        selectEdge()
                        openContextMenu('edge', edge.id, event.clientX, event.clientY)
                      }}
                    />
                    <path
                      d={path}
                      className={`edge-path edge-path--${edge.emphasis}`}
                      style={{ '--edge-dash-offset': String(dashOffset) } as CSSProperties}
                      markerEnd={edge.emphasis === 'theme' ? 'url(#arrow-theme)' : 'url(#arrow-soft)'}
                      onClick={(event) => {
                        event.stopPropagation()
                        selectEdge()
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        selectEdge()
                        openContextMenu('edge', edge.id, event.clientX, event.clientY)
                      }}
                    />
                    {isSelected && anchor ? (
                      <>
                        <circle
                          className="edge-endpoint-handle edge-endpoint-handle--from"
                          cx={anchor.startXCanvas}
                          cy={anchor.startYCanvas}
                          r="8"
                          role="button"
                          aria-label={messages.canvas.reconnectEdgeFrom}
                          tabIndex={0}
                          onPointerDown={(event) => startReconnect(event, edge, 'from', { x: anchor.endX, y: anchor.endY })}
                        />
                        <circle
                          className="edge-endpoint-handle edge-endpoint-handle--to"
                          cx={anchor.endXCanvas}
                          cy={anchor.endYCanvas}
                          r="8"
                          role="button"
                          aria-label={messages.canvas.reconnectEdgeTo}
                          tabIndex={0}
                          onPointerDown={(event) => startReconnect(event, edge, 'to', { x: anchor.startX, y: anchor.startY })}
                        />
                      </>
                    ) : null}
                  </g>
                )
              })}
              {renderDraftEdge()}
            </svg>
            {renderSelectionBox()}

            {diagram.nodes.map((node) => {
              const isSelected = selection.kind === 'node' && selection.id === node.id
              const isMultiSelected = multiSelection.nodeIds.includes(node.id)
              const isEditing = resolvedEditingNodeId === node.id
              const isTargetNode = (interaction?.mode === 'connect' || interaction?.mode === 'reconnect') && interaction.targetNodeId === node.id

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
                  {CONNECTION_SIDES.map((side) => (
                    <button
                      key={side}
                      type="button"
                      className={`node-card__connect-handle node-card__connect-handle--${side}`}
                      aria-label={messages.canvas.createEdgeFromSide}
                      onPointerDown={(event) => startConnect(event, node, side)}
                    />
                  ))}
                  <div className="node-card__content">
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
                  </div>
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
    </div>
  )
}
