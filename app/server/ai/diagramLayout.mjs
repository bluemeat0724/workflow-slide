const HORIZONTAL_PADDING = 3
const TOP_PADDING = 9
const BOTTOM_PADDING = 3
const DEFAULT_NODE_WIDTH = 16
const MIN_NODE_WIDTH = 12
const NODE_HEIGHT = 14
const MIN_HORIZONTAL_GAP = 3
const MIN_VERTICAL_GAP = 3
const MAX_LEVELS_PER_ROW = 4

function getTopologicalLevels(nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(nodes.map((node) => [node.id, []]))

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) return
    outgoing.get(edge.fromNodeId).push(edge.toNodeId)
    incomingCount.set(edge.toNodeId, incomingCount.get(edge.toNodeId) + 1)
  })

  const queue = nodes.filter((node) => incomingCount.get(node.id) === 0).map((node) => node.id)
  const levelById = new Map(queue.map((nodeId) => [nodeId, 0]))
  let cursor = 0

  while (cursor < queue.length) {
    const nodeId = queue[cursor]
    cursor += 1
    const nextLevel = levelById.get(nodeId) + 1

    outgoing.get(nodeId).forEach((targetId) => {
      levelById.set(targetId, Math.max(levelById.get(targetId) ?? 0, nextLevel))
      const remaining = incomingCount.get(targetId) - 1
      incomingCount.set(targetId, remaining)
      if (remaining === 0) queue.push(targetId)
    })
  }

  return levelById.size === nodes.length ? levelById : null
}

function getLaneBounds(lanes, laneId) {
  const ordered = [...lanes].sort((left, right) => left.order - right.order)
  const index = ordered.findIndex((lane) => lane.id === laneId)
  const resolvedIndex = Math.max(index, 0)
  const height = 100 / Math.max(ordered.length, 1)
  return {
    top: resolvedIndex * height,
    bottom: (resolvedIndex + 1) * height,
  }
}

function distributeVertically(nodes, lanes, bounds, preferredCenter) {
  const usableTop = bounds.top + NODE_HEIGHT / 2
  const usableBottom = bounds.bottom - NODE_HEIGHT / 2

  if (nodes.length === 1) {
    const node = nodes[0]
    return [{ node, centerY: Math.max(usableTop, Math.min(usableBottom, preferredCenter)) }]
  }

  const sorted = [...nodes].sort((left, right) => left.index - right.index)
  const gap = MIN_VERTICAL_GAP + NODE_HEIGHT
  const totalHeight = gap * (sorted.length - 1)
  const preferredStart = preferredCenter - totalHeight / 2
  const laneMaxStart = usableBottom - totalHeight
  const globalTop = TOP_PADDING + NODE_HEIGHT / 2
  const globalBottom = 100 - BOTTOM_PADDING - NODE_HEIGHT / 2
  const start = laneMaxStart >= usableTop
    ? Math.max(usableTop, Math.min(laneMaxStart, preferredStart))
    : Math.max(globalTop, Math.min(globalBottom - totalHeight, preferredStart))

  return sorted.map((node, index) => ({
    node,
    centerY: start + index * gap,
  }))
}

function distributeLevelNodes(nodes, lanes, row, rowCount, rowBounds) {
  if (lanes.length <= 1) {
    return distributeVertically(nodes, lanes, rowBounds, (rowBounds.top + rowBounds.bottom) / 2)
  }

  const nodesByLane = new Map()
  nodes.forEach((node) => {
    const laneNodes = nodesByLane.get(node.laneId) ?? []
    laneNodes.push(node)
    nodesByLane.set(node.laneId, laneNodes)
  })

  return [...nodesByLane.entries()].flatMap(([laneId, laneNodes]) => {
    const laneBounds = getLaneBounds(lanes, laneId)
    const laneTop = Math.max(TOP_PADDING, laneBounds.top)
    const laneBottom = Math.min(100 - BOTTOM_PADDING, laneBounds.bottom)
    const preferredCenter = laneTop + ((row + 0.5) / rowCount) * (laneBottom - laneTop)
    return distributeVertically(
      laneNodes,
      lanes,
      { top: laneTop, bottom: laneBottom },
      preferredCenter,
    )
  })
}

function layoutByLevels(nodes, lanes, levelById) {
  const indexedNodes = nodes.map((node, index) => ({ ...node, index }))
  const levels = new Map()
  indexedNodes.forEach((node) => {
    const level = levelById.get(node.id) ?? 0
    const group = levels.get(level) ?? []
    group.push(node)
    levels.set(level, group)
  })

  const orderedLevels = [...levels.keys()].sort((left, right) => left - right)
  const levelsPerRow = Math.min(MAX_LEVELS_PER_ROW, orderedLevels.length)
  const rowCount = Math.ceil(orderedLevels.length / levelsPerRow)
  const nodeWidth = Math.max(MIN_NODE_WIDTH, Math.min(
    DEFAULT_NODE_WIDTH,
    (100 - HORIZONTAL_PADDING * 2 - MIN_HORIZONTAL_GAP * Math.max(levelsPerRow - 1, 0)) / levelsPerRow,
  ))
  const availableWidth = 100 - HORIZONTAL_PADDING * 2 - nodeWidth
  const levelGap = levelsPerRow > 1
    ? availableWidth / (levelsPerRow - 1)
    : 0
  const startX = levelsPerRow > 1
    ? HORIZONTAL_PADDING
    : 50 - nodeWidth / 2
  const availableHeight = 100 - TOP_PADDING - BOTTOM_PADDING
  const rowHeight = availableHeight / rowCount
  const laidOut = new Map()

  orderedLevels.forEach((level, levelIndex) => {
    const row = Math.floor(levelIndex / levelsPerRow)
    const columnInRow = levelIndex % levelsPerRow
    const displayColumn = row % 2 === 0 ? columnInRow : levelsPerRow - columnInRow - 1
    const x = Math.min(100 - HORIZONTAL_PADDING - nodeWidth, startX + displayColumn * levelGap)
    const rowBounds = {
      top: TOP_PADDING + row * rowHeight,
      bottom: TOP_PADDING + (row + 1) * rowHeight,
    }
    distributeLevelNodes(levels.get(level), lanes, row, rowCount, rowBounds).forEach(({ node, centerY }) => {
      laidOut.set(node.id, {
        ...node,
        x,
        y: Math.max(TOP_PADDING, Math.min(100 - BOTTOM_PADDING - NODE_HEIGHT, centerY - NODE_HEIGHT / 2)),
        width: nodeWidth,
        height: NODE_HEIGHT,
      })
    })
  })

  return nodes.map((node) => {
    const laidOutNode = laidOut.get(node.id)
    if (!laidOutNode) return node
    const { index: _index, ...result } = laidOutNode
    return result
  })
}

function layoutGrid(nodes) {
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(nodes.length))))
  const rows = Math.ceil(nodes.length / columns)
  const horizontalGap = (100 - HORIZONTAL_PADDING * 2 - columns * DEFAULT_NODE_WIDTH) / Math.max(columns - 1, 1)
  const availableHeight = 100 - TOP_PADDING - BOTTOM_PADDING - rows * NODE_HEIGHT
  const verticalGap = rows > 1 ? Math.max(MIN_VERTICAL_GAP, availableHeight / (rows - 1)) : 0

  return nodes.map((node, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      ...node,
      x: HORIZONTAL_PADDING + column * (DEFAULT_NODE_WIDTH + horizontalGap),
      y: TOP_PADDING + row * (NODE_HEIGHT + verticalGap),
      width: DEFAULT_NODE_WIDTH,
      height: NODE_HEIGHT,
    }
  })
}

export function layoutDiagramNodes(nodes, lanes, edges = []) {
  if (nodes.length === 0) return []
  if (edges.length === 0) return layoutGrid(nodes)

  const levelById = getTopologicalLevels(nodes, edges)
  return levelById ? layoutByLevels(nodes, lanes, levelById) : layoutGrid(nodes)
}
