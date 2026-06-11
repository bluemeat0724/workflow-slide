import { assertDiagramPayload } from '../schema.mjs'
import { createAiResponseInvalidError } from './errors.mjs'
import { layoutDiagramNodes } from './diagramLayout.mjs'
import { parseJsonBody } from './jsonFenceParser.mjs'
import { getDefaultThemePreset, getThemePresetById } from './serverThemePresets.mjs'

function toNonEmptyString(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  return fallback
}

function toNodeType(value) {
  if (value === 'default' || value === 'agent' || value === 'shared' || value === 'output') {
    return value
  }

  return 'default'
}

function toEdgeEmphasis(value) {
  return value === 'soft' || value === 'theme' ? value : 'theme'
}

function normalizeThemeDraft(theme, fallbackTheme) {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return fallbackTheme
  }

  return {
    name: toNonEmptyString(theme.name, fallbackTheme.name),
    bgPrimary: toNonEmptyString(theme.bgPrimary, fallbackTheme.bgPrimary),
    boardBackground: toNonEmptyString(theme.boardBackground, fallbackTheme.boardBackground),
    laneBackground: toNonEmptyString(theme.laneBackground, fallbackTheme.laneBackground),
    textPrimary: toNonEmptyString(theme.textPrimary, fallbackTheme.textPrimary),
    textMuted: toNonEmptyString(theme.textMuted, fallbackTheme.textMuted),
    accent: toNonEmptyString(theme.accent, fallbackTheme.accent),
    accentDeep: toNonEmptyString(theme.accentDeep, fallbackTheme.accentDeep),
    accentSoft: toNonEmptyString(theme.accentSoft, fallbackTheme.accentSoft),
    lineSoft: toNonEmptyString(theme.lineSoft, fallbackTheme.lineSoft),
  }
}

function normalizeLaneDrafts(parsed, warnings) {
  const rawLanes = Array.isArray(parsed?.lanes) ? parsed.lanes : []
  const lanes = rawLanes
    .map((lane, index) => {
      if (!lane || typeof lane !== 'object') {
        warnings.push(`Ignored invalid lane at index ${index + 1}.`)
        return null
      }

      return {
        key: toNonEmptyString(lane.key, `lane-${index + 1}`),
        title: toNonEmptyString(lane.title, `Lane ${index + 1}`),
        subtitle: typeof lane.subtitle === 'string' ? lane.subtitle.trim() : '',
      }
    })
    .filter(Boolean)

  if (lanes.length > 0) {
    return lanes
  }

  warnings.push('No valid lanes were provided. Added a default lane.')
  return [
    {
      key: 'lane-1',
      title: 'Main Flow',
      subtitle: '',
    },
  ]
}

function normalizeNodeDrafts(parsed, warnings) {
  const rawNodes = Array.isArray(parsed?.nodes) ? parsed.nodes : []

  return rawNodes
    .map((node, index) => {
      if (!node || typeof node !== 'object') {
        warnings.push(`Ignored invalid node at index ${index + 1}.`)
        return null
      }

      return {
        key: toNonEmptyString(node.key, `node-${index + 1}`),
        laneKey: toNonEmptyString(node.laneKey, null),
        type: toNodeType(node.type),
        title: toNonEmptyString(node.title, `Step ${index + 1}`),
        description: typeof node.description === 'string' ? node.description.trim() : '',
        tag: typeof node.tag === 'string' ? node.tag.trim() : '',
      }
    })
    .filter(Boolean)
}

function normalizeEdgeDrafts(parsed, nodeKeySet, warnings) {
  const rawEdges = Array.isArray(parsed?.edges) ? parsed.edges : []

  return rawEdges
    .map((edge, index) => {
      if (!edge || typeof edge !== 'object') {
        warnings.push(`Ignored invalid edge at index ${index + 1}.`)
        return null
      }

      const fromKey = toNonEmptyString(edge.fromKey ?? edge.fromNodeId, '')
      const toKey = toNonEmptyString(edge.toKey ?? edge.toNodeId, '')
      if (!nodeKeySet.has(fromKey) || !nodeKeySet.has(toKey) || fromKey === toKey) {
        warnings.push(`Dropped invalid edge at index ${index + 1}.`)
        return null
      }

      return {
        fromKey,
        toKey,
        emphasis: toEdgeEmphasis(edge.emphasis),
      }
    })
    .filter(Boolean)
}

export function normalizeWorkflowJson({
  jsonText,
  locale = 'zh-CN',
  themePresetId = 'violet',
  theme = null,
}) {
  const { parsed } = parseJsonBody(jsonText)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createAiResponseInvalidError('Workflow JSON must parse to an object.')
  }

  const warnings = []
  const laneDrafts = normalizeLaneDrafts(parsed, warnings)
  const lanes = laneDrafts.map((lane, index) => {
    const id = `lane-${index + 1}`
    return {
      id,
      title: lane.title,
      subtitle: lane.subtitle,
      order: index,
    }
  })

  const nodeDrafts = normalizeNodeDrafts(parsed, warnings)
  const laneIdByKey = new Map(laneDrafts.map((lane, index) => [lane.key, lanes[index].id]))
  const fallbackLaneId = lanes[0].id
  const nodeIdByKey = new Map()
  const draftNodes = nodeDrafts.map((node, index) => {
    const id = `node-${index + 1}`
    nodeIdByKey.set(node.key, id)
    const laneId = node.laneKey ? laneIdByKey.get(node.laneKey) ?? fallbackLaneId : fallbackLaneId
    if (node.laneKey && !laneIdByKey.has(node.laneKey)) {
      warnings.push(`Node "${node.key}" referenced an invalid laneKey and was assigned to "${laneDrafts[0].key}".`)
    }
    return {
      id,
      laneId,
      type: node.type,
      title: node.title,
      description: node.description,
      tag: node.tag,
      x: 0,
      y: 0,
      width: 18,
      height: 16,
    }
  })

  const edges = normalizeEdgeDrafts(parsed, new Set(nodeIdByKey.keys()), warnings).map((edge, index) => ({
    id: `edge-${index + 1}`,
    fromNodeId: nodeIdByKey.get(edge.fromKey),
    toNodeId: nodeIdByKey.get(edge.toKey),
    emphasis: edge.emphasis,
  }))
  const nodes = layoutDiagramNodes(draftNodes, lanes, edges)

  const preset = getThemePresetById(themePresetId) ?? getDefaultThemePreset()
  if (themePresetId && preset.id !== themePresetId && !theme) {
    warnings.push(`Unknown theme preset "${themePresetId}" was replaced with "${preset.id}".`)
  }
  const resolvedTheme = normalizeThemeDraft(theme, preset.theme)

  const title = toNonEmptyString(parsed?.meta?.title, 'AI Generated Workflow')
  const diagram = assertDiagramPayload({
    meta: {
      title,
      locale: parsed?.meta?.locale === 'en-US' ? 'en-US' : locale,
      version: '0.1.0',
    },
    theme: resolvedTheme,
    lanes,
    nodes,
    edges,
  })

  return {
    diagram,
    warnings,
  }
}
