import type { Theme } from '../model/diagram'
import { rebuildTheme } from '../utils/theme'

export type ThemePresetId = 'accenture-purple' | 'lenovo-red' | 'pfizer-blue'

type ThemePreset = {
  id: ThemePresetId
  theme: Theme
}

function createPresetTheme(name: string, accent: string, accentDeep: string): Theme {
  return rebuildTheme(
    {
      name,
      bgPrimary: '#ffffff',
      boardBackground: 'linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))',
      laneBackground: '',
      textPrimary: '#0b0b0f',
      textMuted: '#555563',
      accent,
      accentDeep,
      accentSoft: '',
      lineSoft: '',
    },
    {},
  )
}

export const themePresets: ThemePreset[] = [
  {
    id: 'accenture-purple',
    theme: createPresetTheme('Accenture Purple', '#7d2cff', '#5b16c7'),
  },
  {
    id: 'lenovo-red',
    theme: createPresetTheme('Lenovo Red', '#d10000', '#a80000'),
  },
  {
    id: 'pfizer-blue',
    theme: createPresetTheme('Pfizer Blue', '#0093d0', '#005bbb'),
  },
]

export function getThemePresetById(presetId: ThemePresetId): ThemePreset | undefined {
  return themePresets.find((preset) => preset.id === presetId)
}

export function getThemePresetId(theme: Theme): ThemePresetId | null {
  const matched = themePresets.find((preset) => preset.theme.name === theme.name)
  return matched?.id ?? null
}
