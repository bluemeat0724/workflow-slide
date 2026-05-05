import themePresetDefs from '../../shared/themePresetDefs.json' with { type: 'json' }
import { withAlpha } from '../render/utils.mjs'

const presetAliases = new Map([
  ['accenture-purple', 'violet'],
  ['lenovo-red', 'crimson'],
  ['pfizer-blue', 'azure'],
])

function normalizeHex(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const chars = trimmed.slice(1).split('')
    return `#${chars.map((char) => `${char}${char}`).join('')}`
  }

  return fallback
}

function createPresetTheme(name, accent, accentDeep) {
  const safeAccent = normalizeHex(accent, '#7d2cff')
  const safeAccentDeep = normalizeHex(accentDeep, '#5b16c7')
  const textPrimary = '#0b0b0f'

  return {
    name,
    bgPrimary: '#ffffff',
    boardBackground: 'linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))',
    laneBackground: `linear-gradient(90deg, ${withAlpha(safeAccent, 0.05)}, rgba(255,255,255,0.72) 24%, rgba(255,255,255,0.84) 100%)`,
    textPrimary,
    textMuted: '#555563',
    accent: safeAccent,
    accentDeep: safeAccentDeep,
    accentSoft: withAlpha(safeAccent, 0.08),
    lineSoft: withAlpha(textPrimary, 0.28),
  }
}

const presets = themePresetDefs.map((definition) => ({
  id: definition.id,
  theme: createPresetTheme(definition.name, definition.accent, definition.accentDeep),
}))

export function getThemePresetSummaries() {
  return presets.map((preset) => ({
    id: preset.id,
    name: preset.theme.name,
    accent: preset.theme.accent,
    accentDeep: preset.theme.accentDeep,
  }))
}

export function getThemePresetById(presetId) {
  const resolvedPresetId = presetAliases.get(presetId) ?? presetId
  return presets.find((preset) => preset.id === resolvedPresetId)
}

export function getDefaultThemePreset() {
  return presets[0]
}
