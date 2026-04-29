import { enUS } from './en-US'
import { zhCN } from './zh-CN'
import type { Locale } from '../model/diagram'

export type Messages = {
  appTitle: string
  subtitle: string
  toolbar: {
    locale: string
    exportHtml: string
    exportJson: string
    importJson: string
    clearDraft: string
  }
  status: {
    jsonExported: string
    htmlExported: string
    jsonImported: string
    jsonImportFailed: string
    draftRestored: string
    draftCleared: string
    laneDeleteBlocked: string
    edgeCreated: string
    edgeExists: string
    edgeTargetMissing: string
    edgeSelfBlocked: string
    edgeUpdateDuplicate: string
    edgeUpdateInvalid: string
    edgeDeleted: string
    nodesDeleted: string
  }
  sidebar: {
    title: string
    lanes: string
    nodes: string
    edges: string
    addLane: string
    addNode: string
  }
  inspector: {
    title: string
    canvas: string
    theme: string
    lane: string
    node: string
    edge: string
    empty: string
    titleField: string
    subtitleField: string
    descriptionField: string
    tagField: string
    typeField: string
    emphasisField: string
    fromField: string
    toField: string
    laneCount: string
    deleteLane: string
    deleteNode: string
    deleteEdge: string
    canvasTitle: string
    connectToField: string
    createEdge: string
    themeNameField: string
    themePresetField: string
    bgPrimaryField: string
    textPrimaryField: string
    textMutedField: string
    accentField: string
    accentDeepField: string
  }
  themePresets: {
    'accenture-purple': string
    'lenovo-red': string
    'pfizer-blue': string
    custom: string
  }
  canvas: {
    guide: string
    legendTheme: string
    legendSoft: string
    dragHint: string
    connectHint: string
    inlineTitlePlaceholder: string
    inlineDescriptionPlaceholder: string
    inlineTagPlaceholder: string
    contextSelectNode: string
    contextDeleteNode: string
    contextDeleteEdge: string
  }
  nodeTypes: {
    default: string
    agent: string
    shared: string
    output: string
  }
  edgeEmphasis: {
    soft: string
    theme: string
  }
}

export const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
} satisfies Record<Locale, Messages>

export function getMessages(locale: Locale): Messages {
  return messages[locale]
}
