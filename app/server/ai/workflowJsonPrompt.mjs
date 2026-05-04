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
    '  "lanes": [{ "key": "string", "title": "string", "subtitle": "string" }],',
    '  "nodes": [{ "key": "string", "laneKey": "string", "type": "default|agent|shared|output", "title": "string", "description": "string", "tag": "string" }],',
    '  "edges": [{ "fromKey": "string", "toKey": "string", "emphasis": "soft|theme" }]',
    '}',
    'Rules:',
    '- At least one lane is required.',
    '- node.type must be one of default, agent, shared, output.',
    '- edge.emphasis must be soft or theme.',
    '- If an existing editor diagram reference is provided, use it as a baseline reference so the new workflow can refine the current canvas instead of starting from scratch.',
    '- Preserve still-valid workflow structure, labels, and transitions from the reference when they remain compatible with the confirmed proposal.',
    '- Modify, add, remove, or reorder lanes/nodes/edges when required by the confirmed proposal.',
    '- The reference diagram uses editor-format JSON with ids, coordinates, and theme fields. Use it only as context; do not copy its ids, coordinates, theme, or other editor-only fields into the output.',
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
