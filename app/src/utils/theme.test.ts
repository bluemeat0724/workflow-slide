import { describe, expect, it } from 'vitest'
import { getThemePresetById, getThemePresetId } from '../data/themePresets'
import { getThemeCssVars } from './theme'

describe('getThemeCssVars', () => {
  it('provides shared accent alpha variables for app chrome', () => {
    const theme = getThemePresetById('azure')!.theme
    const vars = getThemeCssVars(theme) as Record<string, string>

    expect(vars['--theme-accent']).toBe('#0093d0')
    expect(vars['--theme-accent-025']).toBe('rgba(0, 147, 208, 0.025)')
    expect(vars['--theme-accent-028']).toBe('rgba(0, 147, 208, 0.028)')
    expect(vars['--theme-accent-045']).toBe('rgba(0, 147, 208, 0.045)')
    expect(vars['--theme-accent-06']).toBe('rgba(0, 147, 208, 0.06)')
    expect(vars['--theme-accent-24']).toBe('rgba(0, 147, 208, 0.24)')
  })

  it('maps legacy preset names to the current preset id when colors still match', () => {
    const theme = {
      ...getThemePresetById('violet')!.theme,
      name: 'Legacy Violet',
    }

    expect(getThemePresetId(theme)).toBe('violet')
  })
})
