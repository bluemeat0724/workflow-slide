import { DEFAULT_EDGE_ANIMATION_MODE, type Diagram, type Locale } from '../model/diagram'
import { getThemePresetById } from './themePresets'

const defaultTheme = getThemePresetById('violet')?.theme

export function createEmptyDiagram(locale: Locale = 'zh-CN'): Diagram {
  return {
    meta: {
      title: locale === 'zh-CN' ? '未命名流程图' : 'Untitled Workflow',
      locale,
      version: '0.1.0',
      edgeAnimationMode: DEFAULT_EDGE_ANIMATION_MODE,
    },
    theme: defaultTheme!,
    lanes: [
      {
        id: 'lane-1',
        title: '',
        subtitle: '',
        order: 0,
      },
    ],
    nodes: [],
    edges: [],
  }
}
