export type Locale = 'zh-CN' | 'en-US'
export type EdgeAnimationMode = 'all-active' | 'sequential'

export const DEFAULT_EDGE_ANIMATION_MODE: EdgeAnimationMode = 'all-active'

export type Theme = {
  name: string
  bgPrimary: string
  boardBackground: string
  laneBackground: string
  textPrimary: string
  textMuted: string
  accent: string
  accentDeep: string
  accentSoft: string
  lineSoft: string
}

export type Lane = {
  id: string
  title: string
  subtitle: string
  order: number
}

export type NodeType = 'default' | 'agent' | 'shared' | 'output'

export type Node = {
  id: string
  laneId: string
  type: NodeType
  title: string
  description: string
  tag: string
  x: number
  y: number
  width: number
  height: number
}

export type EdgeEmphasis = 'soft' | 'theme'

export type Edge = {
  id: string
  fromNodeId: string
  toNodeId: string
  emphasis: EdgeEmphasis
}

export type Diagram = {
  meta: {
    title: string
    locale: Locale
    version: string
    edgeAnimationMode: EdgeAnimationMode
  }
  theme: Theme
  lanes: Lane[]
  nodes: Node[]
  edges: Edge[]
}

export type Selection =
  | { kind: 'canvas' }
  | { kind: 'lane'; id: string }
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }

export type MultiSelection = {
  nodeIds: string[]
}

export const BOARD_WIDTH = 1600
export const BOARD_HEIGHT = 900
