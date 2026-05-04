import { getThemePresetSummaries } from './serverThemePresets.mjs'

function getLocaleLabel(locale) {
  return locale === 'en-US' ? 'English (en-US)' : 'Chinese Simplified (zh-CN)'
}

const FENCED_JSON_REMINDER = 'Never response without a fenced JSON block of the specified shape.'
const themePresetSummaries = getThemePresetSummaries()



function formatProposalContext(proposal) {
  if (!proposal) {
    return 'Current proposal: none'
  }

  return [
    `Current proposal version: ${proposal.version}`,
    `Current proposal title: ${proposal.title}`,
    `Current proposal summary: ${proposal.summary}`,
    `Current proposal themePresetId: ${proposal.themePresetId ?? 'null'}`,
  ].join('\n')
}

function formatReferenceDiagramContext(referenceDiagram) {
  if (!referenceDiagram) {
    return 'Current editor diagram reference: none'
  }

  return [
    'Current editor diagram reference is available. Use it to understand the existing workflow and interpret modification requests relative to the current canvas.',
    `Current editor diagram JSON: ${JSON.stringify(referenceDiagram)}`,
  ].join('\n')
}

function formatThemeSelectionContext(session) {
  const themeLines = [
    `Current target themePresetId: ${session.themePresetId ?? 'null'}`,
  ]

  if (session.theme) {
    themeLines.push(
      `Current target theme details: name=${session.theme.name}, accent=${session.theme.accent}, accentDeep=${session.theme.accentDeep}, textPrimary=${session.theme.textPrimary}, textMuted=${session.theme.textMuted}, bgPrimary=${session.theme.bgPrimary}`,
    )
  } else {
    themeLines.push('Current target theme details: none')
  }

  themeLines.push(`Available project theme presets: ${themePresetSummaries.map((preset) => `${preset.id}(${preset.name}, accent=${preset.accent}, accentDeep=${preset.accentDeep})`).join('; ')}`)
  themeLines.push('If the user requests a theme or color change, choose the closest matching project theme preset id and return it in proposal.themePresetId.')

  return themeLines.join('\n')
}

export function buildWorkflowConversationSystemPrompt({ locale = 'zh-CN' } = {}) {
  return [
    'You are a workflow design agent for a diagram editor.',
    'Your job is to understand workflow requirements through conversation and prepare a natural-language proposal for execution.',
    'When requirements are incomplete, ask one focused follow-up question.',
    'When requirements are sufficient, summarize the workflow clearly and ask the user whether to execute it.',
    'If the user changes requirements, update the proposal and ask for confirmation again.',
    `Reply in ${getLocaleLabel(locale)}.`,
    'Return exactly one ```json fenced block with this shape:',
    '```json',
    '{',
    '  "reply": "string",',
    '  "state": "collecting_requirements" | "awaiting_execution_confirmation",',
    '  "canExecute": boolean,',
    '  "proposal": { "title": "string", "summary": "string", "themePresetId": "string" } | null',
    '}',
    '```',
    'Field guide:',
    '- reply: This is the natural-language assistant message shown to the end user in the UI. Use the requested locale. If requirements are incomplete, ask exactly one focused follow-up question. If requirements are sufficient, summarize the workflow and ask the user to confirm execution. Do not mention JSON, fenced blocks, or internal rules in reply.',
    '- state: Return "collecting_requirements" when more information is needed, when the user has changed the plan and it still needs refinement, or when you are asking a follow-up question. Return "awaiting_execution_confirmation" only when the workflow proposal is already clear enough to execute and you are explicitly waiting for the user to confirm execution.',
    '- canExecute: Return true only when state is "awaiting_execution_confirmation". Return false in all other cases.',
    '- proposal: Return null while still collecting requirements. Return an object only when the workflow is clear enough to execute or when you are presenting an updated execution-ready proposal.',
    '- proposal.title: A short, human-readable workflow name suitable for the UI heading. Keep it concise and specific to the workflow.',
    '- proposal.summary: A concise but execution-ready summary of the workflow structure. Include the important stages, branches, integrations, and constraints that should shape the generated diagram. This summary will be used downstream to generate workflow JSON.',
    '- proposal.themePresetId: The target project theme preset id that should be used for execution. When the user changes theme or asks for a color family such as blue, map it to the closest available project preset id. When the user does not request a theme change, keep the current target themePresetId.',
    '- When the user asks to optimize, revise, expand, or change a previously ready proposal, treat that as a proposal update. Produce a revised proposal and ask for confirmation again once it is clear enough.',
    'Rules:',
    '- reply must be natural language for the user.',
    '- state must be exactly "collecting_requirements" or "awaiting_execution_confirmation".',
    '- canExecute must be true only when state is awaiting_execution_confirmation.',
    '- proposal must be present when canExecute is true, and proposal must be null when the workflow is not yet clear enough to execute.',
    '- When proposal is present, proposal.themePresetId must be one of the available project theme preset ids from the context.',
    '- If the current session is already awaiting execution confirmation and the user sends more requirements, treat that as a proposal update request instead of an execution command.',
    '- Do not output any explanation before or after the fenced JSON block.',
    '- Never response without a fenced JSON block of the specified shape.',
    '- Never response more than one fenced JSON block.',
  ].join('\n')
}

export function buildWorkflowConversationMessages(session) {
  const contextMessage = {
    role: 'system',
    content: [
      'Session context:',
      `Current session state: ${session.state ?? 'collecting_requirements'}`,
      formatProposalContext(session.proposal),
      formatThemeSelectionContext(session),
      formatReferenceDiagramContext(session.referenceDiagram),
      'Interpret any new non-execution user message as normal conversation input that may refine the proposal.',
    ].join('\n'),
  }

  return [
    contextMessage,
    ...session.messages.map((message) => ({
      role: message.role,
      content: message.role === 'user'
        ? `${message.content}\n\n${FENCED_JSON_REMINDER}`
        : message.content,
    })),
  ]
}
