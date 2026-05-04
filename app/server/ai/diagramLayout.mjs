function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function getLaneBounds(lanes, laneId) {
  const ordered = [...lanes].sort((left, right) => left.order - right.order)
  const index = Math.max(ordered.findIndex((lane) => lane.id === laneId), 0)
  const laneHeight = 100 / Math.max(ordered.length, 1)

  return {
    top: index * laneHeight,
    height: laneHeight,
  }
}

function constrainNodeToLane(node, lanes, laneId) {
  const bounds = getLaneBounds(lanes, laneId)
  const width = clamp(node.width, 12, Math.min(36, 100 - 4 - node.x))
  const maxHeight = Math.max(12, bounds.height - 4)
  const height = clamp(node.height, 12, maxHeight)
  const x = clamp(node.x, 2, 100 - width - 2)
  const maxY = Math.max(bounds.top + 2, bounds.top + bounds.height - height - 2)
  const y = clamp(node.y, bounds.top + 2, maxY)

  return {
    ...node,
    laneId,
    x,
    y,
    width,
    height,
  }
}

function getNodeWidth(nodeCount) {
  if (nodeCount <= 3) {
    return 18
  }

  if (nodeCount <= 6) {
    return 14
  }

  return 13
}

export function layoutDiagramNodes({ lanes, nodes }) {
  const nodesByLane = new Map()

  for (const node of nodes) {
    const laneNodes = nodesByLane.get(node.laneId) ?? []
    laneNodes.push(node)
    nodesByLane.set(node.laneId, laneNodes)
  }

  return lanes.flatMap((lane) => {
    const laneNodes = nodesByLane.get(lane.id) ?? []
    const count = laneNodes.length
    if (count === 0) {
      return []
    }

    const rows = count >= 7 ? 2 : 1
    const columns = Math.ceil(count / rows)
    const width = getNodeWidth(count)
    const height = 16
    const usableWidth = 96
    const horizontalGap = Math.max(2, (usableWidth - columns * width) / (columns + 1))
    const bounds = getLaneBounds(lanes, lane.id)
    const rowGap = rows === 1 ? 0 : 4
    const totalHeight = rows * height + (rows - 1) * rowGap
    const startY = bounds.top + Math.max(2, (bounds.height - totalHeight) / 2)

    return laneNodes.map((node, index) => {
      const row = rows === 1 ? 0 : Math.floor(index / columns)
      const column = rows === 1 ? index : index % columns
      const x = 2 + horizontalGap + column * (width + horizontalGap)
      const y = startY + row * (height + rowGap)

      return constrainNodeToLane({
        ...node,
        x,
        y,
        width,
        height,
      }, lanes, lane.id)
    })
  })
}
