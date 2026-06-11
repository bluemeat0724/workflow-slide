import { getThemePresetSummaries } from './serverThemePresets.mjs'

function getLocaleLabel(locale) {
  return locale === 'en-US' ? 'en-US' : 'zh-CN'
}

const themePresetSummaries = getThemePresetSummaries()

export function buildWorkflowJsonSystemPrompt() {
  return [
    'You generate workflow JSON only.',
    'Return JSON content only. Do not explain anything.',
    'Your output will be appended after a ```json code fence prefix.',
    'Use this semantic structure:',
    '{',
    '  "meta": { "title": "string", "locale": "zh-CN|en-US", "version": "0.1.0" },',
    '  "lanes": [{ "key": "main", "title": "workflow title", "subtitle": "" }],',
    '  "nodes": [{ "key": "string", "laneKey": "optional lane key", "type": "default|agent|shared|output", "title": "string", "description": "string", "tag": "string" }],',
    '  "edges": [{ "fromKey": "string", "toKey": "string", "emphasis": "soft|theme" }]',
    '}',
    'Rules:',
    '- At least one lane is required.',
    '- Use exactly one lane by default. Its title should match the overall workflow title.',
    '- Create multiple lanes only when the user explicitly requests them or the workflow has clear, stable responsibility boundaries such as participants, departments, systems, or security domains.',
    '- Do not create lanes for sequential processing stages, lifecycle phases, technical modules, or ordinary workflow steps. Express those with nodes and edges.',
    '- Prefer no more than three lanes unless the user explicitly requests more.',
    '- laneKey is optional. When omitted, the node belongs to the first lane. When provided, it must reference an existing lane key.',
    '- When there is more than one lane, every node must provide a valid laneKey so its semantic section is unambiguous.',
    '- Lanes are displayed as equal-height horizontal sections ordered by their array position. For N lanes, lane index i occupies approximately vertical range i/N to (i+1)/N. Use this only to reason about the correct laneKey; do not output coordinates.',
    '- Lanes describe semantic grouping only. Node order, branching, parallel work, and convergence must be expressed with edges.',
    '- node.type must be one of default, agent, shared, output.',
    '- edge.emphasis must be soft or theme.',
    '- If an existing editor diagram reference is provided, use it as a baseline reference so the new workflow can refine the current canvas instead of starting from scratch.',
    '- Preserve still-valid workflow structure, labels, transitions, and meaningful responsibility boundaries from the reference when they remain compatible with the confirmed proposal.',
    '- When an existing diagram has lanes that only repeat sequential stages, consolidate them into one lane unless the user asks to keep them.',
    '- Modify, add, remove, or reorder lanes/nodes/edges when required by the confirmed proposal.',
    '- The reference diagram uses editor-format JSON with ids, laneId, coordinates, and theme fields. Preserve its lane relationships semantically, but do not copy ids, laneId values, coordinates, theme, or other editor-only fields into the output.',
    '- Respect the target theme preset and theme details provided in the prompt, even if the reference diagram currently uses a different theme.',
    '- Do not include theme, coordinates, comments, or markdown fences.',
  ].join('\n')
}

export function buildWorkflowJsonUserPrompt({ proposal, locale, themePresetId, theme, referenceDiagram }) {
  const themeDescription = theme
    ? `Theme details: name=${theme.name}, accent=${theme.accent}, accentDeep=${theme.accentDeep}, textPrimary=${theme.textPrimary}, textMuted=${theme.textMuted}, bgPrimary=${theme.bgPrimary}`
    : 'Theme details: use the preset-defined accent colors.'
  const referenceDiagramDescription = referenceDiagram
    ? `Existing editor diagram reference JSON:\n${JSON.stringify(referenceDiagram)}`
    : 'Existing editor diagram reference: none. Generate the workflow from the confirmed proposal only.'

  return [
    `Locale: ${getLocaleLabel(locale)}`,
    `Theme preset: ${themePresetId ?? 'violet'}`,
    themeDescription,
    `Available project theme presets: ${themePresetSummaries.map((preset) => `${preset.id}(${preset.name}, accent=${preset.accent}, accentDeep=${preset.accentDeep})`).join('; ')}`,
    referenceDiagramDescription,
    'Create a workflow JSON draft from this confirmed proposal:',
    proposal.summary,
  ].join('\n\n')
}
