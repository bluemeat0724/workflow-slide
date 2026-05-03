import { enUS } from './en-US'
import { zhCN } from './zh-CN'
import type { Locale } from '../model/diagram'

export type Messages = {
  appTitle: string
  subtitle: string
  toolbar: {
    locale: string
    newDiagram: string
    newDiagramConfirm: string
    createRemote: string
    diagramList: string
    revisionHistory: string
    saveRevision: string
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
    newDiagramCreated: string
    laneDeleteBlocked: string
    edgeCreated: string
    edgeExists: string
    edgeTargetMissing: string
    edgeSelfBlocked: string
    edgeUpdateDuplicate: string
    edgeUpdateInvalid: string
    edgeDeleted: string
    nodesDeleted: string
    createRemoteCreating: string
    createRemoteFailed: string
    persistenceSaving: string
    persistenceSaved: string
    persistenceOfflineDraft: string
    persistenceConflict: string
    persistenceError: string
    remoteLoadNotFound: string
    remoteLoadForbidden: string
    remoteLoadServerError: string
    remoteLoadNetworkError: string
    remoteLoadUnknownError: string
    revisionSaved: string
    revisionSaveFailed: string
    revisionRestoreFailed: string
    revisionRestored: string
    diagramsLoaded: string
    diagramsLoadFailed: string
    diagramDeleted: string
    diagramDeleteFailed: string
    revisionsLoaded: string
    revisionsLoadFailed: string
  }
  library: {
    close: string
    diagramsTitle: string
    revisionsTitle: string
    searchPlaceholder: string
    diagramsEmpty: string
    revisionsEmpty: string
    currentDiagram: string
    openDiagram: string
    deleteDiagram: string
    deletingDiagram: string
    restoreRevision: string
    deleteDiagramConfirm: string
    restoreRevisionConfirm: string
    saveRevisionPrompt: string
    saveRevisionPlaceholder: string
    revisionSource: string
    revisionVersion: string
    updatedAt: string
    createdAt: string
    previousPage: string
    nextPage: string
    pageLabel: string
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
