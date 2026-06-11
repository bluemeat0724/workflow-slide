import { useCallback, useEffect, useRef, useState } from 'react'
import type { Edge, Node, Selection } from '../model/diagram'
import {
  HORIZONTAL_PADDING,
  NODE_MIN_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_WIDTH,
  VERTICAL_PADDING,
  clamp,
} from '../utils/geometry'

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type ConnectionSide = 'top' | 'right' | 'bottom' | 'left'
type EdgeEndpoint = 'from' | 'to'

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
      mode: 'reconnect'
      edgeId: string
      endpoint: EdgeEndpoint
      pointerId: number
      fixedX: number
      fixedY: number
      currentX: number
      currentY: number
      excludedNodeId: string
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

type UseCanvasInteractionInput = {
  boardRef: React.RefObject<HTMLDivElement | null>
  nodes: Node[]
  editingNodeId: string | null
  onUpdateNodePosition: (nodeId: string, x: number, y: number) => void
  onUpdateNodeWidth: (nodeId: string, width: number) => void
  onResizeNodeHeight: (nodeId: string, height: number) => void
  onCreateEdge: (fromNodeId: string, toNodeId: string) => void
  onUpdateEdge: (edgeId: string, updates: Partial<Edge>) => void
  onSetMultiSelection: (nodeIds: string[]) => void
  onSelect: (selection: Selection) => void
}

export type { InteractionState, ResizeDirection }

export function useCanvasInteraction({
  boardRef,
  nodes,
  editingNodeId,
  onUpdateNodePosition,
  onUpdateNodeWidth,
  onResizeNodeHeight,
  onCreateEdge,
  onUpdateEdge,
  onSetMultiSelection,
  onSelect,
}: UseCanvasInteractionInput) {
  const [interaction, setInteraction] = useState<InteractionState | null>(null)
  const interactionRef = useRef(interaction)

  useEffect(() => {
    interactionRef.current = interaction
  }, [interaction])

  const getBoardPoint = useCallback((clientX: number, clientY: number) => {
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
  }, [boardRef])

  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>, node: Node) => {
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
  }, [getBoardPoint])

  const startResize = useCallback((event: React.PointerEvent<HTMLButtonElement>, node: Node, direction: ResizeDirection) => {
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
  }, [])

  const startConnect = useCallback((event: React.PointerEvent<HTMLButtonElement>, node: Node, side: ConnectionSide) => {
    event.stopPropagation()
    const point = getBoardPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    const sidePoints = {
      top: { x: node.x + node.width / 2, y: node.y },
      right: { x: node.x + node.width, y: node.y + node.height / 2 },
      bottom: { x: node.x + node.width / 2, y: node.y + node.height },
      left: { x: node.x, y: node.y + node.height / 2 },
    }
    const start = sidePoints[side]
    setInteraction({
      mode: 'connect',
      nodeId: node.id,
      pointerId: event.pointerId,
      startX: start.x,
      startY: start.y,
      currentX: point.xPercent,
      currentY: point.yPercent,
      targetNodeId: null,
    })
  }, [getBoardPoint])

  const startReconnect = useCallback((
    event: React.PointerEvent<SVGCircleElement>,
    edge: Edge,
    endpoint: EdgeEndpoint,
    fixedPoint: { x: number; y: number },
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const point = getBoardPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    setInteraction({
      mode: 'reconnect',
      edgeId: edge.id,
      endpoint,
      pointerId: event.pointerId,
      fixedX: fixedPoint.x,
      fixedY: fixedPoint.y,
      currentX: point.xPercent,
      currentY: point.yPercent,
      excludedNodeId: endpoint === 'from' ? edge.toNodeId : edge.fromNodeId,
      targetNodeId: null,
    })
  }, [getBoardPoint])

  const startMarquee = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || editingNodeId) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest('.node-card, .edge-path, .edge-hit-area, .edge-endpoint-handle, .context-menu, input, textarea, select, button')) {
      return
    }

    const point = getBoardPoint(event.clientX, event.clientY)
    if (!point) {
      return
    }

    event.preventDefault()
    onSelect({ kind: 'canvas' })
    setInteraction({
      mode: 'marquee',
      pointerId: event.pointerId,
      startX: point.xPercent,
      startY: point.yPercent,
      currentX: point.xPercent,
      currentY: point.yPercent,
    })
  }, [editingNodeId, onSelect, getBoardPoint])

  const updateInteraction = useCallback((updater: (prev: InteractionState) => InteractionState) => {
    setInteraction((prev) => prev ? updater(prev) : null)
  }, [])

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

      if (activeInteraction.mode === 'connect' || activeInteraction.mode === 'reconnect') {
        const excludedNodeId = activeInteraction.mode === 'connect'
          ? activeInteraction.nodeId
          : activeInteraction.excludedNodeId
        const targetNode = nodes.find((candidate) => {
          if (candidate.id === excludedNodeId) {
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

      const node = nodes.find((item) => item.id === activeInteraction.nodeId)
      if (!node) {
        return
      }

      if (activeInteraction.mode === 'drag') {
        const nextX = clamp(pointerX - activeInteraction.offsetX, HORIZONTAL_PADDING, 100 - node.width - HORIZONTAL_PADDING)
        const nextY = clamp(pointerY - activeInteraction.offsetY, VERTICAL_PADDING, 100 - node.height - VERTICAL_PADDING)

        onUpdateNodePosition(node.id, nextX, nextY)
        return
      }

      const deltaX = ((event.clientX - activeInteraction.startPointerX) / rect.width) * 100
      const deltaY = ((event.clientY - activeInteraction.startPointerY) / rect.height) * 100
      const maxHeight = Math.max(NODE_MIN_HEIGHT, 100 - VERTICAL_PADDING * 2)

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
          Math.min(maxHeight, 100 - VERTICAL_PADDING - activeInteraction.startY),
        )
      }

      if (activeInteraction.direction.includes('n')) {
        const maxTopY = activeInteraction.startY + activeInteraction.startHeight - NODE_MIN_HEIGHT
        nextY = clamp(activeInteraction.startY + deltaY, VERTICAL_PADDING, maxTopY)
        nextHeight = clamp(activeInteraction.startHeight - (nextY - activeInteraction.startY), NODE_MIN_HEIGHT, maxHeight)
      }

      onUpdateNodePosition(node.id, nextX, nextY)
      onUpdateNodeWidth(node.id, nextWidth)
      if (activeInteraction.direction.includes('n') || activeInteraction.direction.includes('s')) {
        onResizeNodeHeight(node.id, nextHeight)
      }
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
        const selectedNodeIds = nodes
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
      if (activeInteraction.mode === 'reconnect' && activeInteraction.targetNodeId) {
        onUpdateEdge(activeInteraction.edgeId, {
          [activeInteraction.endpoint === 'from' ? 'fromNodeId' : 'toNodeId']: activeInteraction.targetNodeId,
        })
      }
      setInteraction(null)
    }

    function handlePointerCancel(event: PointerEvent) {
      if (event.pointerId === activeInteraction.pointerId) {
        setInteraction(null)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setInteraction(null)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [boardRef, nodes, interaction, onCreateEdge, onResizeNodeHeight, onSetMultiSelection, onUpdateEdge, onUpdateNodePosition, onUpdateNodeWidth])

  return {
    interaction,
    getBoardPoint,
    startDrag,
    startResize,
    startConnect,
    startReconnect,
    startMarquee,
    updateInteraction,
  }
}

export type { ConnectionSide, EdgeEndpoint }
