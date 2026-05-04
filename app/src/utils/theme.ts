import type { CSSProperties } from 'react'
import type { Theme } from '../model/diagram'

type EditableThemeFields = Pick<Theme, 'name' | 'bgPrimary' | 'textPrimary' | 'textMuted' | 'accent' | 'accentDeep'>

function normalizeHex(input: string, fallback: string): string {
  const value = input.trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value
  }

  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const chars = value.slice(1).split('')
    return `#${chars.map((char) => `${char}${char}`).join('')}`
  }

  return fallback
}

function hexToRgb(hex: string) {
  const safeHex = normalizeHex(hex, '#000000').slice(1)
  const red = Number.parseInt(safeHex.slice(0, 2), 16)
  const green = Number.parseInt(safeHex.slice(2, 4), 16)
  const blue = Number.parseInt(safeHex.slice(4, 6), 16)

  return { red, green, blue }
}

export function withAlpha(hex: string, alpha: number): string {
  const { red, green, blue } = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function rebuildTheme(current: Theme, updates: Partial<EditableThemeFields>): Theme {
  const next = {
    ...current,
    ...updates,
  }

  const accent = normalizeHex(next.accent, current.accent)
  const accentDeep = normalizeHex(next.accentDeep, current.accentDeep)
  const bgPrimary = normalizeHex(next.bgPrimary, current.bgPrimary)
  const textPrimary = normalizeHex(next.textPrimary, current.textPrimary)
  const textMuted = normalizeHex(next.textMuted, current.textMuted)

  return {
    ...next,
    accent,
    accentDeep,
    bgPrimary,
    textPrimary,
    textMuted,
    accentSoft: withAlpha(accent, 0.08),
    lineSoft: withAlpha(textPrimary, 0.28),
    boardBackground: 'linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))',
    laneBackground: `linear-gradient(90deg, ${withAlpha(accent, 0.05)}, rgba(255,255,255,0.72) 24%, rgba(255,255,255,0.84) 100%)`,
  }
}

export function getThemeCssVars(theme: Theme): CSSProperties {
  return {
    '--theme-bg-primary': theme.bgPrimary,
    '--theme-text-primary': theme.textPrimary,
    '--theme-text-muted': theme.textMuted,
    '--theme-accent': theme.accent,
    '--theme-accent-deep': theme.accentDeep,
    '--theme-accent-soft': theme.accentSoft,
    '--theme-line-soft': theme.lineSoft,
    '--theme-board-background': theme.boardBackground,
    '--theme-lane-background': theme.laneBackground,
    '--theme-accent-025': withAlpha(theme.accent, 0.025),
    '--theme-accent-028': withAlpha(theme.accent, 0.028),
    '--theme-accent-05': withAlpha(theme.accent, 0.05),
    '--theme-accent-06': withAlpha(theme.accent, 0.06),
    '--theme-accent-07': withAlpha(theme.accent, 0.07),
    '--theme-accent-08': withAlpha(theme.accent, 0.08),
    '--theme-accent-10': withAlpha(theme.accent, 0.1),
    '--theme-accent-11': withAlpha(theme.accent, 0.11),
    '--theme-accent-12': withAlpha(theme.accent, 0.12),
    '--theme-accent-14': withAlpha(theme.accent, 0.14),
    '--theme-accent-16': withAlpha(theme.accent, 0.16),
    '--theme-accent-18': withAlpha(theme.accent, 0.18),
    '--theme-accent-20': withAlpha(theme.accent, 0.2),
    '--theme-accent-24': withAlpha(theme.accent, 0.24),
    '--theme-accent-28': withAlpha(theme.accent, 0.28),
    '--theme-accent-34': withAlpha(theme.accent, 0.34),
    '--theme-accent-42': withAlpha(theme.accent, 0.42),
    '--theme-accent-045': withAlpha(theme.accent, 0.045),
    '--theme-accent-58': withAlpha(theme.accent, 0.58),
    '--theme-accent-76': withAlpha(theme.accent, 0.76),
    '--theme-text-76': withAlpha(theme.textPrimary, 0.76),
  } as CSSProperties
}
