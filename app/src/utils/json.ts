import {
  DEFAULT_EDGE_ANIMATION_MODE,
  type Diagram,
  type Edge,
  type EdgeAnimationMode,
  type Lane,
  type Locale,
  type Node,
  type NodeType,
  type Theme,
} from '../model/diagram'

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`)
  }

  return value
}

function assertNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a valid number`)
  }

  return value
}

function assertLocale(value: unknown): Locale {
  if (value === 'zh-CN' || value === 'en-US') {
    return value
  }

  throw new Error('locale is invalid')
}

function parseEdgeAnimationMode(value: unknown): EdgeAnimationMode {
  return value === 'sequential' || value === 'all-active' ? value : DEFAULT_EDGE_ANIMATION_MODE
}

function assertNodeType(value: unknown): NodeType {
  if (value === 'default' || value === 'agent' || value === 'shared' || value === 'output') {
    return value
  }

  throw new Error('node type is invalid')
}

function parseTheme(value: unknown): Theme {
  const source = value as Record<string, unknown>
  return {
    name: assertString(source.name, 'theme.name'),
    bgPrimary: assertString(source.bgPrimary, 'theme.bgPrimary'),
    boardBackground: assertString(source.boardBackground, 'theme.boardBackground'),
    laneBackground: assertString(source.laneBackground, 'theme.laneBackground'),
    textPrimary: assertString(source.textPrimary, 'theme.textPrimary'),
    textMuted: assertString(source.textMuted, 'theme.textMuted'),
    accent: assertString(source.accent, 'theme.accent'),
    accentDeep: assertString(source.accentDeep, 'theme.accentDeep'),
    accentSoft: assertString(source.accentSoft, 'theme.accentSoft'),
    lineSoft: assertString(source.lineSoft, 'theme.lineSoft'),
  }
}

function parseLane(value: unknown): Lane {
  const source = value as Record<string, unknown>
  return {
    id: assertString(source.id, 'lane.id'),
    title: assertString(source.title, 'lane.title'),
    subtitle: assertString(source.subtitle, 'lane.subtitle'),
    order: assertNumber(source.order, 'lane.order'),
  }
}

function parseNode(value: unknown): Node {
  const source = value as Record<string, unknown>
  return {
    id: assertString(source.id, 'node.id'),
    laneId: assertString(source.laneId, 'node.laneId'),
    type: assertNodeType(source.type),
    title: assertString(source.title, 'node.title'),
    description: assertString(source.description, 'node.description'),
    tag: assertString(source.tag, 'node.tag'),
    x: assertNumber(source.x, 'node.x'),
    y: assertNumber(source.y, 'node.y'),
    width: assertNumber(source.width, 'node.width'),
    height: assertNumber(source.height, 'node.height'),
  }
}

function parseEdge(value: unknown): Edge {
  const source = value as Record<string, unknown>
  const emphasis = source.emphasis

  if (emphasis !== 'soft' && emphasis !== 'theme') {
    throw new Error('edge.emphasis is invalid')
  }

  return {
    id: assertString(source.id, 'edge.id'),
    fromNodeId: assertString(source.fromNodeId, 'edge.fromNodeId'),
    toNodeId: assertString(source.toNodeId, 'edge.toNodeId'),
    emphasis,
  }
}

export function parseDiagramJson(content: string): Diagram {
  const raw = JSON.parse(content) as Record<string, unknown>
  const meta = raw.meta as Record<string, unknown>
  const lanes = Array.isArray(raw.lanes) ? raw.lanes.map(parseLane).sort((a, b) => a.order - b.order) : []
  const nodes = Array.isArray(raw.nodes) ? raw.nodes.map(parseNode) : []
  const nodeIds = new Set(nodes.map((node) => node.id))
  const laneIds = new Set(lanes.map((lane) => lane.id))
  const edges = Array.isArray(raw.edges)
    ? raw.edges
        .map(parseEdge)
        .filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId) && edge.fromNodeId !== edge.toNodeId)
    : []

  if (lanes.length === 0) {
    throw new Error('At least one lane is required')
  }

  const normalizedNodes = nodes.map((node) => ({
    ...node,
    laneId: laneIds.has(node.laneId) ? node.laneId : lanes[0].id,
  }))

  return {
    meta: {
      title: assertString(meta.title, 'meta.title'),
      locale: assertLocale(meta.locale),
      version: assertString(meta.version, 'meta.version'),
      edgeAnimationMode: parseEdgeAnimationMode(meta.edgeAnimationMode),
    },
    theme: parseTheme(raw.theme),
    lanes,
    nodes: normalizedNodes,
    edges,
  }
}

export function serializeDiagramJson(diagram: Diagram): string {
  return JSON.stringify(diagram, null, 2)
}
