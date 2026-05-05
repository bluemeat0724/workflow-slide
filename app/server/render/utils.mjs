import { BOARD_WIDTH, BOARD_HEIGHT } from './presentationProfile.mjs'

export function hexToRgb(hex) {
  const safeHex = hex.replace(/^#/, '')
  if (safeHex.length === 3) {
    const chars = safeHex.split('')
    return {
      red: Number.parseInt(chars[0] + chars[0], 16),
      green: Number.parseInt(chars[1] + chars[1], 16),
      blue: Number.parseInt(chars[2] + chars[2], 16),
    }
  }
  return {
    red: Number.parseInt(safeHex.slice(0, 2), 16),
    green: Number.parseInt(safeHex.slice(2, 4), 16),
    blue: Number.parseInt(safeHex.slice(4, 6), 16),
  }
}

export function withAlpha(hex, alpha) {
  const { red, green, blue } = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function percentXToCanvas(value) {
  return (value / 100) * BOARD_WIDTH
}

export function percentYToCanvas(value) {
  return (value / 100) * BOARD_HEIGHT
}

export function getLaneBounds(lanes, laneId) {
  const ordered = [...lanes].sort((a, b) => a.order - b.order)
  const index = Math.max(ordered.findIndex((lane) => lane.id === laneId), 0)
  const laneHeight = 100 / Math.max(ordered.length, 1)
  const top = index * laneHeight
  return { top, height: laneHeight }
}

function getAxisGap(sourceStart, sourceEnd, targetStart, targetEnd) {
  if (sourceEnd < targetStart) {
    return targetStart - sourceEnd
  }

  if (targetEnd < sourceStart) {
    return sourceStart - targetEnd
  }

  return 0
}

export function getNodeSidePoint(source, target) {
  const sourceCx = source.x + source.width / 2
  const sourceCy = source.y + source.height / 2
  const targetCx = target.x + target.width / 2
  const targetCy = target.y + target.height / 2
  const dx = targetCx - sourceCx
  const dy = targetCy - sourceCy
  const horizontalGap = getAxisGap(source.x, source.x + source.width, target.x, target.x + target.width)
  const verticalGap = getAxisGap(source.y, source.y + source.height, target.y, target.y + target.height)

  if (source.y + source.height <= target.y || target.y + target.height <= source.y || verticalGap > horizontalGap) {
    return dy >= 0
      ? { startX: sourceCx, startY: source.y + source.height, endX: targetCx, endY: target.y, startSide: 'bottom', endSide: 'top' }
      : { startX: sourceCx, startY: source.y, endX: targetCx, endY: target.y + target.height, startSide: 'top', endSide: 'bottom' }
  }

  if (horizontalGap > verticalGap) {
    return dx >= 0
      ? { startX: source.x + source.width, startY: sourceCy, endX: target.x, endY: targetCy, startSide: 'right', endSide: 'left' }
      : { startX: source.x, startY: sourceCy, endX: target.x + target.width, endY: targetCy, startSide: 'left', endSide: 'right' }
  }

  if (Math.abs(dy) > Math.abs(dx)) {
    return dy >= 0
      ? { startX: sourceCx, startY: source.y + source.height, endX: targetCx, endY: target.y, startSide: 'bottom', endSide: 'top' }
      : { startX: sourceCx, startY: source.y, endX: targetCx, endY: target.y + target.height, startSide: 'top', endSide: 'bottom' }
  }

  return dx >= 0
    ? { startX: source.x + source.width, startY: sourceCy, endX: target.x, endY: targetCy, startSide: 'right', endSide: 'left' }
    : { startX: source.x, startY: sourceCy, endX: target.x + target.width, endY: targetCy, startSide: 'left', endSide: 'right' }
}
