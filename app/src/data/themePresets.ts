import type { Theme } from '../model/diagram'
import { rebuildTheme } from '../utils/theme'

const themePresetDefinitions = [
  { id: 'violet', name: 'Violet', accent: '#7d2cff', accentDeep: '#5b16c7' },
  { id: 'crimson', name: 'Crimson', accent: '#d10000', accentDeep: '#a80000' },
  { id: 'azure', name: 'Azure', accent: '#0093d0', accentDeep: '#005bbb' },
  { id: 'amber', name: 'Amber', accent: '#d97706', accentDeep: '#b45309' },
  { id: 'graphite', name: 'Graphite', accent: '#475569', accentDeep: '#0f172a' },
  { id: 'aqua', name: 'Aqua', accent: '#2aa7ff', accentDeep: '#1d4ed8' },
  { id: 'teal', name: 'Teal', accent: '#00a39a', accentDeep: '#0f766e' },
] as const

export type ThemePresetId = typeof themePresetDefinitions[number]['id']

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

export const themePresets: ThemePreset[] = themePresetDefinitions.map((preset) => ({
  id: preset.id,
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
