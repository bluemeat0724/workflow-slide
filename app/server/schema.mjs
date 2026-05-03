import crypto from 'node:crypto'

export function assertDiagramPayload(value) {
  if (!value || typeof value !== 'object') {
    throw createValidationError('diagram', 'Diagram must be an object.')
  }

  const diagram = value
  const meta = assertObject(diagram.meta, 'diagram.meta')
  const theme = assertTheme(diagram.theme)
  const lanes = assertArray(diagram.lanes, 'diagram.lanes').map(assertLane)
  const nodes = assertArray(diagram.nodes, 'diagram.nodes').map(assertNode)
  const edges = assertArray(diagram.edges, 'diagram.edges').map(assertEdge)

  if (lanes.length === 0) {
    throw createValidationError('diagram.lanes', 'At least one lane is required.')
  }

  const laneIds = new Set(lanes.map((lane) => lane.id))
  const normalizedNodes = nodes.map((node) => ({
    ...node,
    laneId: laneIds.has(node.laneId) ? node.laneId : lanes[0].id,
  }))
  const nodeIds = new Set(normalizedNodes.map((node) => node.id))
  const normalizedEdges = edges.filter(
    (edge) => edge.fromNodeId !== edge.toNodeId && nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId),
  )

  return {
    meta: {
      title: assertString(meta.title, 'diagram.meta.title'),
      locale: assertLocale(meta.locale),
      version: assertString(meta.version, 'diagram.meta.version'),
    },
    theme,
    lanes: [...lanes].sort((left, right) => left.order - right.order),
    nodes: normalizedNodes,
    edges: normalizedEdges,
  }
}

export function hashDiagram(diagram) {
  return crypto.createHash('sha256').update(JSON.stringify(diagram)).digest('hex')
}

function assertArray(value, field) {
  if (!Array.isArray(value)) {
    throw createValidationError(field, `${field} must be an array.`)
  }

  return value
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createValidationError(field, `${field} must be an object.`)
  }

  return value
}

function assertString(value, field) {
  if (typeof value !== 'string') {
    throw createValidationError(field, `${field} must be a string.`)
  }

  return value
}

function assertNumber(value, field) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw createValidationError(field, `${field} must be a valid number.`)
  }

  return value
}

function assertLocale(value) {
  if (value === 'zh-CN' || value === 'en-US') {
    return value
  }

  throw createValidationError('diagram.meta.locale', 'diagram.meta.locale is invalid.')
}

function assertNodeType(value) {
  if (value === 'default' || value === 'agent' || value === 'shared' || value === 'output') {
    return value
  }

  throw createValidationError('diagram.nodes.type', 'diagram.nodes.type is invalid.')
}

function assertEdgeEmphasis(value) {
  if (value === 'soft' || value === 'theme') {
    return value
  }

  throw createValidationError('diagram.edges.emphasis', 'diagram.edges.emphasis is invalid.')
}

function assertTheme(value) {
  const theme = assertObject(value, 'diagram.theme')

  return {
    name: assertString(theme.name, 'diagram.theme.name'),
    bgPrimary: assertString(theme.bgPrimary, 'diagram.theme.bgPrimary'),
    boardBackground: assertString(theme.boardBackground, 'diagram.theme.boardBackground'),
    laneBackground: assertString(theme.laneBackground, 'diagram.theme.laneBackground'),
    textPrimary: assertString(theme.textPrimary, 'diagram.theme.textPrimary'),
    textMuted: assertString(theme.textMuted, 'diagram.theme.textMuted'),
    accent: assertString(theme.accent, 'diagram.theme.accent'),
    accentDeep: assertString(theme.accentDeep, 'diagram.theme.accentDeep'),
    accentSoft: assertString(theme.accentSoft, 'diagram.theme.accentSoft'),
    lineSoft: assertString(theme.lineSoft, 'diagram.theme.lineSoft'),
  }
}

function assertLane(value) {
  const lane = assertObject(value, 'diagram.lanes[]')

  return {
    id: assertString(lane.id, 'diagram.lanes[].id'),
    title: assertString(lane.title, 'diagram.lanes[].title'),
    subtitle: assertString(lane.subtitle, 'diagram.lanes[].subtitle'),
    order: assertNumber(lane.order, 'diagram.lanes[].order'),
  }
}

function assertNode(value) {
  const node = assertObject(value, 'diagram.nodes[]')

  return {
    id: assertString(node.id, 'diagram.nodes[].id'),
    laneId: assertString(node.laneId, 'diagram.nodes[].laneId'),
    type: assertNodeType(node.type),
    title: assertString(node.title, 'diagram.nodes[].title'),
    description: assertString(node.description, 'diagram.nodes[].description'),
    tag: assertString(node.tag, 'diagram.nodes[].tag'),
    x: assertNumber(node.x, 'diagram.nodes[].x'),
    y: assertNumber(node.y, 'diagram.nodes[].y'),
    width: assertNumber(node.width, 'diagram.nodes[].width'),
    height: assertNumber(node.height, 'diagram.nodes[].height'),
  }
}

function assertEdge(value) {
  const edge = assertObject(value, 'diagram.edges[]')

  return {
    id: assertString(edge.id, 'diagram.edges[].id'),
    fromNodeId: assertString(edge.fromNodeId, 'diagram.edges[].fromNodeId'),
    toNodeId: assertString(edge.toNodeId, 'diagram.edges[].toNodeId'),
    emphasis: assertEdgeEmphasis(edge.emphasis),
  }
}

function createValidationError(field, message) {
  return {
    name: 'ValidationError',
    status: 422,
    code: 'VALIDATION_ERROR',
    message,
    details: { field },
  }
}
