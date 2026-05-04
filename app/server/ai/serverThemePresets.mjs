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

function withAlpha(hex, alpha) {
  const safeHex = normalizeHex(hex, '#000000').slice(1)
  const red = Number.parseInt(safeHex.slice(0, 2), 16)
  const green = Number.parseInt(safeHex.slice(2, 4), 16)
  const blue = Number.parseInt(safeHex.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
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

const presets = [
  {
    id: 'violet',
    theme: createPresetTheme('Violet', '#7d2cff', '#5b16c7'),
  },
  {
    id: 'crimson',
    theme: createPresetTheme('Crimson', '#d10000', '#a80000'),
  },
  {
    id: 'azure',
    theme: createPresetTheme('Azure', '#0093d0', '#005bbb'),
  },
  {
    id: 'amber',
    theme: createPresetTheme('Amber', '#d97706', '#b45309'),
  },
  {
    id: 'graphite',
    theme: createPresetTheme('Graphite', '#475569', '#0f172a'),
  },
  {
    id: 'aqua',
    theme: createPresetTheme('Aqua', '#2aa7ff', '#1d4ed8'),
  },
  {
    id: 'teal',
    theme: createPresetTheme('Teal', '#00a39a', '#0f766e'),
  },
]

const presetAliases = new Map([
  ['accenture-purple', 'violet'],
  ['lenovo-red', 'crimson'],
  ['pfizer-blue', 'azure'],
])

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
