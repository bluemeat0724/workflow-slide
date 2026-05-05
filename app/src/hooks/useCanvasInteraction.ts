import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lane, Node, Selection } from '../model/diagram'
import {
  HORIZONTAL_PADDING,
  NODE_MIN_HEIGHT,
  NODE_MAX_WIDTH,
  NODE_MIN_WIDTH,
  VERTICAL_PADDING,
  clamp,
  getLaneBounds,
  getLaneByY,
} from '../utils/geometry'

type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

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

type UseCanvasInteractionInput = {
  boardRef: React.RefObject<HTMLDivElement | null>
  lanes: Lane[]
  nodes: Node[]
  editingNodeId: string | null
  onUpdateNodePosition: (nodeId: string, x: number, y: number, laneId: string) => void
  onUpdateNodeWidth: (nodeId: string, width: number) => void
  onUpdateNodeHeight: (nodeId: string, height: number) => void
  onCreateEdge: (fromNodeId: string, toNodeId: string) => void
  onSetMultiSelection: (nodeIds: string[]) => void
  onSelect: (selection: Selection) => void
}

export type { InteractionState, ResizeDirection }

export function useCanvasInteraction({
  boardRef,
  lanes,
  nodes,
  editingNodeId,
  onUpdateNodePosition,
  onUpdateNodeWidth,
  onUpdateNodeHeight,
  onCreateEdge,
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
  }, [])

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

  const startConnect = useCallback((event: React.PointerEvent<HTMLButtonElement>, node: Node) => {
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
  }, [getBoardPoint])

  const startMarquee = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || editingNodeId) {
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

      const node = nodes.find((item) => item.id === activeInteraction.nodeId)
      if (!node) {
        return
      }

      if (activeInteraction.mode === 'connect') {
        const targetNode = nodes.find((candidate) => {
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
        const nextLane = getLaneByY(lanes, rawY + node.height / 2)
        const nextBounds = getLaneBounds(lanes, nextLane.id)
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
      const laneBounds = getLaneBounds(lanes, node.laneId)
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

      setInteraction(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [lanes, nodes, interaction, onCreateEdge, onSetMultiSelection, onUpdateNodeHeight, onUpdateNodePosition, onUpdateNodeWidth])

  return {
    interaction,
    getBoardPoint,
    startDrag,
    startResize,
    startConnect,
    startMarquee,
    updateInteraction,
  }
}
