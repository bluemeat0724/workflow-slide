export const SIZE_PRESETS = {
  standard: { width: 1600, height: 900 },
  hd: { width: 1920, height: 1080 },
}

export const BOARD_WIDTH = 1600
export const BOARD_HEIGHT = 900

export const ANIMATION = {
  duration: 1.4,
  fps: 12,
  get totalFrames() { return Math.round(this.duration * this.fps) },
  get frameDelay() { return Math.round((1 / this.fps) * 100) },
  dashTotalOffset: 44,
  dashPatternTheme: [14, 9],
  dashPatternSoft: [10, 7],
  loop: true,
}

export const LINE = {
  themeWidth: 3,
  softWidth: 2.4,
  arrowSize: 10,
}

export const NODE = {
  borderRadius: 18,
  paddingX: 16,
  paddingY: 14,
  titleFontSize: 17,
  bodyFontSize: 12,
  tagFontSize: 10,
  maxDescriptionLines: 3,
}

export const LANE = {
  borderRadius: 20,
  insetLeft: 14,
  insetRight: 14,
}

export const BOARD = {
  inset: 20,
  borderRadius: 28,
}

export const FONT_FAMILY = {
  title: '"Iowan Old Style", "Baskerville", "Songti SC", Georgia, serif',
  body: '-apple-system, Arial, "Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", sans-serif',
  tag: '"Cascadia Mono", "Courier New", monospace',
  laneTitle: '"Iowan Old Style", "Baskerville", "Songti SC", Georgia, serif',
  laneSubtitle: '"Cascadia Mono", "Courier New", monospace',
}
