import nodeSizing from '../../shared/nodeSizing.json' with { type: 'json' }

const BOARD_HEIGHT = 900
const CARD_PADDING_Y = 14
const CARD_PADDING_X = 16
const TITLE_LINE_HEIGHT = 18
const BODY_LINE_HEIGHT = 16
const TITLE_MARGIN = 6
const TAG_HEIGHT_WITH_MARGIN = 32

function getVisualLength(value) {
  return [...value].reduce((total, character) => total + (/[\u2e80-\u9fff]/u.test(character) ? 1 : 0.55), 0)
}

function getLineCount(value, availableWidth, fontSize, maxLines = Number.POSITIVE_INFINITY) {
  if (!value) return 0
  const capacity = Math.max(1, availableWidth / fontSize)
  return Math.min(maxLines, Math.max(1, Math.ceil(getVisualLength(value) / capacity)))
}

export function estimateNodeHeight(node, width = nodeSizing.defaultWidth) {
  const availableWidth = (width / 100) * 1600 - CARD_PADDING_X * 2
  const titleLines = getLineCount(node.title, availableWidth, 17)
  const descriptionLines = getLineCount(node.description, availableWidth, 12)
  const contentHeight = CARD_PADDING_Y * 2
    + titleLines * TITLE_LINE_HEIGHT
    + (descriptionLines > 0 ? TITLE_MARGIN + descriptionLines * BODY_LINE_HEIGHT : 0)
    + (node.tag ? TAG_HEIGHT_WITH_MARGIN : 0)

  return Number(Math.max(nodeSizing.minAutoHeight, (contentHeight / BOARD_HEIGHT) * 100).toFixed(2))
}

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
  return { top: resolvedIndex * height, bottom: (resolvedIndex + 1) * height }
}

function distributeVertically(nodes, bounds, preferredCenter) {
  const sorted = [...nodes].sort((left, right) => left.index - right.index)
  const totalHeight = sorted.reduce((total, node) => total + node.height, 0)
    + nodeSizing.minVerticalGap * Math.max(sorted.length - 1, 0)
  const globalTop = nodeSizing.topPadding
  const globalBottom = 100 - nodeSizing.bottomPadding
  const availableTop = Math.max(globalTop, bounds.top)
  const availableBottom = Math.min(globalBottom, bounds.bottom)
  const preferredStart = preferredCenter - totalHeight / 2
  const start = totalHeight <= availableBottom - availableTop
    ? Math.max(availableTop, Math.min(availableBottom - totalHeight, preferredStart))
    : Math.max(globalTop, Math.min(globalBottom - totalHeight, preferredStart))
  let cursor = start

  return sorted.map((node) => {
    const result = { node, y: cursor }
    cursor += node.height + nodeSizing.minVerticalGap
    return result
  })
}

function distributeLevelNodes(nodes, lanes, row, rowCount, rowBounds) {
  if (lanes.length <= 1) {
    return distributeVertically(nodes, rowBounds, (rowBounds.top + rowBounds.bottom) / 2)
  }

  const nodesByLane = new Map()
  nodes.forEach((node) => {
    const laneNodes = nodesByLane.get(node.laneId) ?? []
    laneNodes.push(node)
    nodesByLane.set(node.laneId, laneNodes)
  })

  return [...nodesByLane.entries()].flatMap(([laneId, laneNodes]) => {
    const laneBounds = getLaneBounds(lanes, laneId)
    const laneTop = Math.max(nodeSizing.topPadding, laneBounds.top)
    const laneBottom = Math.min(100 - nodeSizing.bottomPadding, laneBounds.bottom)
    const preferredCenter = laneTop + ((row + 0.5) / rowCount) * (laneBottom - laneTop)
    return distributeVertically(laneNodes, { top: laneTop, bottom: laneBottom }, preferredCenter)
  })
}

function withEstimatedHeights(nodes, width) {
  return nodes.map((node) => ({
    ...node,
    width,
    height: estimateNodeHeight(node, width),
    heightMode: 'auto',
  }))
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
  const levelsPerRow = Math.min(nodeSizing.maxLevelsPerRow, orderedLevels.length)
  const rowCount = Math.ceil(orderedLevels.length / levelsPerRow)
  const nodeWidth = Math.max(nodeSizing.minWidth, Math.min(
    nodeSizing.defaultWidth,
    (100 - nodeSizing.horizontalPadding * 2 - nodeSizing.minHorizontalGap * Math.max(levelsPerRow - 1, 0)) / levelsPerRow,
  ))
  const measuredNodes = withEstimatedHeights(indexedNodes, nodeWidth)
  const measuredById = new Map(measuredNodes.map((node) => [node.id, node]))
  const availableWidth = 100 - nodeSizing.horizontalPadding * 2 - nodeWidth
  const levelGap = levelsPerRow > 1 ? availableWidth / (levelsPerRow - 1) : 0
  const startX = levelsPerRow > 1 ? nodeSizing.horizontalPadding : 50 - nodeWidth / 2
  const availableHeight = 100 - nodeSizing.topPadding - nodeSizing.bottomPadding
  const rowHeight = availableHeight / rowCount
  const laidOut = new Map()

  orderedLevels.forEach((level, levelIndex) => {
    const row = Math.floor(levelIndex / levelsPerRow)
    const columnInRow = levelIndex % levelsPerRow
    const displayColumn = row % 2 === 0 ? columnInRow : levelsPerRow - columnInRow - 1
    const x = Math.min(100 - nodeSizing.horizontalPadding - nodeWidth, startX + displayColumn * levelGap)
    const rowBounds = {
      top: nodeSizing.topPadding + row * rowHeight,
      bottom: nodeSizing.topPadding + (row + 1) * rowHeight,
    }
    const levelNodes = levels.get(level).map((node) => measuredById.get(node.id))
    distributeLevelNodes(levelNodes, lanes, row, rowCount, rowBounds).forEach(({ node, y }) => {
      laidOut.set(node.id, {
        ...node,
        x,
        y: Math.max(nodeSizing.topPadding, Math.min(100 - nodeSizing.bottomPadding - node.height, y)),
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
  const columns = Math.min(nodeSizing.maxLevelsPerRow, Math.max(1, Math.ceil(Math.sqrt(nodes.length))))
  const rows = Math.ceil(nodes.length / columns)
  const measuredNodes = withEstimatedHeights(nodes, nodeSizing.defaultWidth)
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(
    ...measuredNodes.slice(row * columns, (row + 1) * columns).map((node) => node.height),
  ))
  const horizontalGap = (100 - nodeSizing.horizontalPadding * 2 - columns * nodeSizing.defaultWidth) / Math.max(columns - 1, 1)
  const availableGap = 100 - nodeSizing.topPadding - nodeSizing.bottomPadding
    - rowHeights.reduce((total, height) => total + height, 0)
  const verticalGap = rows > 1 ? Math.max(nodeSizing.minVerticalGap, availableGap / (rows - 1)) : 0
  const rowTops = []
  let rowCursor = nodeSizing.topPadding
  rowHeights.forEach((height) => {
    rowTops.push(rowCursor)
    rowCursor += height + verticalGap
  })

  return measuredNodes.map((node, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      ...node,
      x: nodeSizing.horizontalPadding + column * (nodeSizing.defaultWidth + horizontalGap),
      y: Math.min(100 - nodeSizing.bottomPadding - node.height, rowTops[row]),
    }
  })
}

export function layoutDiagramNodes(nodes, lanes, edges = []) {
  if (nodes.length === 0) return []
  if (edges.length === 0) return layoutGrid(nodes)

  const levelById = getTopologicalLevels(nodes, edges)
  return levelById ? layoutByLevels(nodes, lanes, levelById) : layoutGrid(nodes)
}
