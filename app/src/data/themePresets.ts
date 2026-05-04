import type { Theme } from '../model/diagram'
import { rebuildTheme } from '../utils/theme'
import themePresetDefs from '../../shared/themePresetDefs.json'

export type ThemePresetId = 'violet' | 'crimson' | 'azure' | 'amber' | 'graphite' | 'aqua' | 'teal'

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

export const themePresets: ThemePreset[] = themePresetDefs.map((preset) => ({
  id: preset.id as ThemePresetId,
  theme: createPresetTheme(preset.name, preset.accent, preset.accentDeep),
}))

export function getThemePresetById(presetId: ThemePresetId): ThemePreset | undefined {
  return themePresets.find((preset) => preset.id === presetId)
}

export function getThemePresetId(theme: Theme): ThemePresetId | null {
  const matched = themePresets.find((preset) => (
    preset.theme.accent === theme.accent &&
    preset.theme.accentDeep === theme.accentDeep &&
    preset.theme.bgPrimary === theme.bgPrimary &&
    preset.theme.textPrimary === theme.textPrimary &&
    preset.theme.textMuted === theme.textMuted
  ))
  return matched?.id ?? null
}
