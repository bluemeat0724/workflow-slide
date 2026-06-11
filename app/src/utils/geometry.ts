import { BOARD_HEIGHT, BOARD_WIDTH, type Edge, type Lane, type Node } from '../model/diagram'

export const NODE_MIN_WIDTH = 12
export const NODE_MAX_WIDTH = 36
export const NODE_MIN_HEIGHT = 12
export const HORIZONTAL_PADDING = 2
export const VERTICAL_PADDING = 2

export function percentXToCanvas(value: number): number {
  return (value / 100) * BOARD_WIDTH
}

export function percentYToCanvas(value: number): number {
  return (value / 100) * BOARD_HEIGHT
}

export function getLaneBounds(lanes: Lane[], laneId: string) {
  const ordered = [...lanes].sort((a, b) => a.order - b.order)
  const index = ordered.findIndex((lane) => lane.id === laneId)
  const laneHeight = 100 / Math.max(ordered.length, 1)
  const top = index * laneHeight

  return {
    top,
    height: laneHeight,
  }
}

export function getLaneIdAtPoint(lanes: Lane[], x: number, y: number): string | null {
  if (x < 0 || x > 100 || y < 0 || y > 100) {
    return null
  }

  const ordered = [...lanes].sort((a, b) => a.order - b.order)
  const laneHeight = 100 / Math.max(ordered.length, 1)
  const index = Math.min(Math.floor(y / laneHeight), ordered.length - 1)
  return ordered[index]?.id ?? null
}

export function getNodeLaneId(lanes: Lane[], node: Pick<Node, 'x' | 'y' | 'width' | 'height'>): string | null {
  return getLaneIdAtPoint(lanes, node.x + node.width / 2, node.y + node.height / 2)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function constrainNodeToCanvas(node: Node) {
  const width = clamp(node.width, NODE_MIN_WIDTH, NODE_MAX_WIDTH)
  const maxHeight = Math.max(NODE_MIN_HEIGHT, 100 - VERTICAL_PADDING * 2)
  const height = clamp(node.height, NODE_MIN_HEIGHT, maxHeight)
  const x = clamp(node.x, HORIZONTAL_PADDING, 100 - width - HORIZONTAL_PADDING)
  const y = clamp(node.y, VERTICAL_PADDING, 100 - height - VERTICAL_PADDING)

  return {
    ...node,
    x,
    y,
    width,
    height,
  }
}

function getAxisGap(sourceStart: number, sourceEnd: number, targetStart: number, targetEnd: number) {
  if (sourceEnd < targetStart) {
    return targetStart - sourceEnd
  }

  if (targetEnd < sourceStart) {
    return sourceStart - targetEnd
  }

  return 0
}

export function getNodeSidePoint(source: Node, target: Node) {
  const sourceCx = source.x + source.width / 2
  const sourceCy = source.y + source.height / 2
  const targetCx = target.x + target.width / 2
  const targetCy = target.y + target.height / 2

  const dx = targetCx - sourceCx
  const dy = targetCy - sourceCy
  const horizontalGap = getAxisGap(source.x, source.x + source.width, target.x, target.x + target.width)
  const verticalGap = getAxisGap(source.y, source.y + source.height, target.y, target.y + target.height)

  if (source.y + source.height <= target.y || target.y + target.height <= source.y || verticalGap > horizontalGap) {
    return dy >= 0
      ? {
          startX: sourceCx,
          startY: source.y + source.height,
          endX: targetCx,
          endY: target.y,
          startSide: 'bottom',
          endSide: 'top',
        }
      : {
          startX: sourceCx,
          startY: source.y,
          endX: targetCx,
          endY: target.y + target.height,
          startSide: 'top',
          endSide: 'bottom',
        }
  }

  if (horizontalGap > verticalGap) {
    return dx >= 0
      ? {
          startX: source.x + source.width,
          startY: sourceCy,
          endX: target.x,
          endY: targetCy,
          startSide: 'right',
          endSide: 'left',
        }
      : {
          startX: source.x,
          startY: sourceCy,
          endX: target.x + target.width,
          endY: targetCy,
          startSide: 'left',
          endSide: 'right',
        }
  }

  if (Math.abs(dy) > Math.abs(dx)) {
    return dy >= 0
      ? {
          startX: sourceCx,
          startY: source.y + source.height,
          endX: targetCx,
          endY: target.y,
          startSide: 'bottom',
          endSide: 'top',
        }
      : {
          startX: sourceCx,
          startY: source.y,
          endX: targetCx,
          endY: target.y + target.height,
          startSide: 'top',
          endSide: 'bottom',
        }
  }

  return dx >= 0
    ? {
        startX: source.x + source.width,
        startY: sourceCy,
        endX: target.x,
        endY: targetCy,
        startSide: 'right',
        endSide: 'left',
      }
    : {
        startX: source.x,
        startY: sourceCy,
        endX: target.x + target.width,
        endY: targetCy,
        startSide: 'left',
        endSide: 'right',
      }
}

export function buildEdgePath(edge: Edge, nodes: Node[]): string {
  const source = nodes.find((node) => node.id === edge.fromNodeId)
  const target = nodes.find((node) => node.id === edge.toNodeId)

  if (!source || !target) {
    return ''
  }

  const anchor = getNodeSidePoint(source, target)
  const startX = percentXToCanvas(anchor.startX)
  const startY = percentYToCanvas(anchor.startY)
  const endX = percentXToCanvas(anchor.endX)
  const endY = percentYToCanvas(anchor.endY)
  const dx = endX - startX
  const dy = endY - startY
  const controlX = Math.max(Math.abs(dx) * 0.35, 64)
  const controlY = Math.max(Math.abs(dy) * 0.28, 42)

  const isVertical = anchor.endSide === 'top' || anchor.endSide === 'bottom'

  if (!isVertical) {
    const c1x = startX + (dx >= 0 ? controlX : -controlX)
    const c2x = endX - (dx >= 0 ? controlX : -controlX)
    return `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`
  }

  const c1y = startY + (dy >= 0 ? controlY : -controlY)
  const c2y = endY - (dy >= 0 ? controlY : -controlY)
  return `M ${startX} ${startY} C ${startX} ${c1y}, ${endX} ${c2y}, ${endX} ${endY}`
}
