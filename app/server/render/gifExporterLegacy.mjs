import { createCanvas } from '@napi-rs/canvas'
import gifenc from 'gifenc'
import { BOARD_WIDTH, BOARD_HEIGHT } from './presentationProfile.mjs'
import { getNodeSidePoint, percentXToCanvas, percentYToCanvas, withAlpha } from './utils.mjs'

const { GIFEncoder, quantize, applyPalette } = gifenc

const DASH_DURATION = 2.8
const FRAME_RATE = 20
const FRAME_DELAY = Math.round((1 / FRAME_RATE) * 100)
const DASH_TOTAL_OFFSET = 44
const TOTAL_FRAMES = Math.round(DASH_DURATION * FRAME_RATE)

const RADIUS_LANE = 24
const RADIUS_NODE = 22
const RADIUS_BOARD = 32
const NODE_PADDING_X = 16
const NODE_PADDING_Y = 14
const TAG_PADDING_X = 10
const TAG_PADDING_Y = 4

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function buildEdgePath(edge, nodes) {
  const source = nodes.find((node) => node.id === edge.fromNodeId)
  const target = nodes.find((node) => node.id === edge.toNodeId)
  if (!source || !target) return null
  const anchor = getNodeSidePoint(source, target)
  const startX = percentXToCanvas(anchor.startX)
  const startY = percentYToCanvas(anchor.startY)
  const endX = percentXToCanvas(anchor.endX)
  const endY = percentYToCanvas(anchor.endY)
  const dx = endX - startX
  const dy = endY - startY
  const controlLength = Math.max(Math.abs(dx) * 0.35, 64)
  const controlY = Math.max(Math.abs(dy) * 0.28, 42)
  const isVertical = anchor.endSide === 'top' || anchor.endSide === 'bottom'

  if (!isVertical) {
    const c1x = startX + (dx >= 0 ? controlLength : -controlLength)
    const c2x = endX - (dx >= 0 ? controlLength : -controlLength)
    return {
      startX,
      startY,
      c1x,
      c1y: startY,
      c2x,
      c2y: endY,
      endX,
      endY,
      endAngle: Math.atan2(endY - endY, endX - c2x),
    }
  }
  const c1y = startY + (dy >= 0 ? controlY : -controlY)
  const c2y = endY - (dy >= 0 ? controlY : -controlY)
  return {
    startX,
    startY,
    c1x: startX,
    c1y,
    c2x: endX,
    c2y,
    endX,
    endY,
    endAngle: Math.atan2(endY - c2y, endX - endX),
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawArrowHead(ctx, x, y, angle, size, color) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, -size * 0.3)
  ctx.lineTo(-size, size * 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function renderBackground(ctx, theme) {
  const { bgPrimary, accent } = theme
  const bgGrad = ctx.createLinearGradient(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  bgGrad.addColorStop(0, bgPrimary)
  bgGrad.addColorStop(0.56, 'rgba(255,255,255,0.94)')
  bgGrad.addColorStop(1, 'rgba(255,255,255,0.98)')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  const glow1 = ctx.createRadialGradient(
    BOARD_WIDTH * 0.12, BOARD_HEIGHT * 0.18, 0,
    BOARD_WIDTH * 0.12, BOARD_HEIGHT * 0.18, BOARD_HEIGHT * 0.26,
  )
  glow1.addColorStop(0, withAlpha(accent, 0.11))
  glow1.addColorStop(1, 'transparent')
  ctx.fillStyle = glow1
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  const glow2 = ctx.createRadialGradient(
    BOARD_WIDTH * 0.84, BOARD_HEIGHT * 0.74, 0,
    BOARD_WIDTH * 0.84, BOARD_HEIGHT * 0.74, BOARD_HEIGHT * 0.24,
  )
  glow2.addColorStop(0, withAlpha(accent, 0.08))
  glow2.addColorStop(1, 'transparent')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
}

function renderGridTexture(ctx, theme) {
  const gridSize = 32
  ctx.strokeStyle = 'rgba(11,11,15,0.07)'
  ctx.lineWidth = 1
  for (let x = 0; x <= BOARD_WIDTH; x += gridSize) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, BOARD_HEIGHT)
    ctx.stroke()
  }
  for (let y = 0; y <= BOARD_HEIGHT; y += gridSize) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(BOARD_WIDTH, y)
    ctx.stroke()
  }
}

function renderBoard(ctx, theme) {
  const inset = 20
  const x = inset
  const y = inset
  const w = BOARD_WIDTH - inset * 2
  const h = BOARD_HEIGHT - inset * 2
  ctx.save()
  ctx.shadowColor = 'rgba(11,11,15,0.1)'
  ctx.shadowBlur = 56
  ctx.shadowOffsetY = 32
  roundRect(ctx, x, y, w, h, RADIUS_BOARD)
  const boardBg = ctx.createLinearGradient(0, y, 0, y + h)
  boardBg.addColorStop(0, 'rgba(255,255,255,0.84)')
  boardBg.addColorStop(1, 'rgba(255,255,255,0.74)')
  ctx.fillStyle = boardBg
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = 'rgba(11,11,15,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()
  const overlay = ctx.createLinearGradient(0, y, 0, y + h)
  overlay.addColorStop(0, withAlpha(theme.accent, 0.045))
  overlay.addColorStop(0.18, 'transparent')
  ctx.fillStyle = overlay
  ctx.fill()
  ctx.restore()
}

function renderLanes(ctx, diagram) {
  const { lanes, theme } = diagram
  const inset = 20
  const boardX = inset + 14
  const boardW = BOARD_WIDTH - inset * 2 - 28
  lanes.forEach((lane) => {
    const bounds = getLaneBounds(lanes, lane.id)
    const ly = inset + (bounds.top / 100) * (BOARD_HEIGHT - inset * 2)
    const lh = (bounds.height / 100) * (BOARD_HEIGHT - inset * 2)
    ctx.save()
    roundRect(ctx, boardX, ly, boardW, lh, RADIUS_LANE)
    const laneBg = ctx.createLinearGradient(boardX, 0, boardX + boardW, 0)
    laneBg.addColorStop(0, withAlpha(theme.accent, 0.05))
    laneBg.addColorStop(0.24, 'rgba(255,255,255,0.72)')
    laneBg.addColorStop(1, 'rgba(255,255,255,0.84)')
    ctx.fillStyle = laneBg
    ctx.fill()
    ctx.strokeStyle = withAlpha(theme.accent, 0.12)
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
    ctx.save()
    ctx.font = 'bold 18px Georgia, "Iowan Old Style", "Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", serif'
    ctx.fillStyle = theme.accentDeep
    ctx.textBaseline = 'top'
    ctx.fillText(lane.title || `Section ${lane.order + 1}`, boardX + 18, ly + 14)
    if (lane.subtitle) {
      ctx.font = '11px "Courier New", "Hiragino Sans GB", "PingFang SC", monospace'
      ctx.fillStyle = theme.textMuted
      ctx.fillText(lane.subtitle, boardX + 18 + ctx.measureText(lane.title || '').width + 10, ly + 16)
    }
    ctx.restore()
  })
}

function renderEdges(ctx, diagram, dashOffset) {
  const { edges, nodes, theme } = diagram
  edges.forEach((edge) => {
    const pathData = buildEdgePath(edge, nodes)
    if (!pathData) return
    ctx.save()
    const isTheme = edge.emphasis === 'theme'
    const strokeColor = isTheme ? withAlpha(theme.accent, 0.58) : (theme.lineSoft || 'rgba(11,11,15,0.28)')
    const dashPattern = isTheme ? [14, 9] : [10, 7]
    if (isTheme) {
      ctx.shadowColor = withAlpha(theme.accent, 0.18)
      ctx.shadowBlur = 6
    }
    ctx.setLineDash(dashPattern)
    ctx.lineDashOffset = -dashOffset
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = isTheme ? 3 : 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(pathData.startX, pathData.startY)
    ctx.bezierCurveTo(pathData.c1x, pathData.c1y, pathData.c2x, pathData.c2y, pathData.endX, pathData.endY)
    ctx.stroke()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    const arrowColor = isTheme ? theme.accent : (theme.lineSoft || 'rgba(11,11,15,0.28)')
    ctx.setLineDash([])
    drawArrowHead(ctx, pathData.endX, pathData.endY, pathData.endAngle, 8, arrowColor)
    ctx.restore()
  })
}

function renderNodes(ctx, diagram) {
  const { nodes, theme } = diagram
  const inset = 20
  const BOARD_PADDING = inset + 14
  nodes.forEach((node) => {
    const cx = BOARD_PADDING + (node.x / 100) * (BOARD_WIDTH - BOARD_PADDING * 2)
    const ny = inset + (node.y / 100) * (BOARD_HEIGHT - inset * 2)
    const nw = (node.width / 100) * (BOARD_WIDTH - BOARD_PADDING * 2)
    const minHeight = 80
    const nh = Math.max(minHeight, (node.height / 100) * (BOARD_HEIGHT - inset * 2))
    ctx.save()
    ctx.shadowColor = 'rgba(11,11,15,0.08)'
    ctx.shadowBlur = 38
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 22
    roundRect(ctx, cx, ny, nw, nh, RADIUS_NODE)
    if (node.type === 'agent') {
      const bg = ctx.createLinearGradient(cx, ny, cx + nw, ny + nh)
      bg.addColorStop(0, withAlpha(theme.accent, 0.08))
      bg.addColorStop(1, 'rgba(255,255,255,0.9)')
      ctx.fillStyle = bg
    } else if (node.type === 'shared') {
      const bg = ctx.createLinearGradient(cx, ny, cx + nw, ny + nh)
      bg.addColorStop(0, withAlpha(theme.accent, 0.11))
      bg.addColorStop(0.55, 'rgba(255,255,255,0.9)')
      ctx.fillStyle = bg
    } else if (node.type === 'output') {
      const bg = ctx.createLinearGradient(cx, ny, cx + nw, ny + nh)
      bg.addColorStop(0, 'rgba(11,11,15,0.03)')
      bg.addColorStop(1, 'rgba(255,255,255,0.92)')
      ctx.fillStyle = bg
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.88)'
    }
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    let borderColor = 'rgba(11,11,15,0.09)'
    if (node.type === 'agent') borderColor = withAlpha(theme.accent, 0.16)
    if (node.type === 'shared') borderColor = withAlpha(theme.accent, 0.2)
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    roundRect(ctx, cx + NODE_PADDING_X, ny + NODE_PADDING_Y, nw - NODE_PADDING_X * 2, nh - NODE_PADDING_Y * 2, 0)
    ctx.clip()
    ctx.font = 'bold 17px Georgia, "Iowan Old Style", "Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", serif'
    ctx.fillStyle = theme.textPrimary
    ctx.textBaseline = 'top'
    const titleY = ny + NODE_PADDING_Y
    const titleMaxWidth = nw - NODE_PADDING_X * 2
    ctx.fillText(node.title, cx + NODE_PADDING_X, titleY)
    if (node.description) {
      ctx.font = '12px -apple-system, Arial, "Hiragino Sans GB", "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillStyle = 'rgba(11,11,15,0.76)'
      const descY = titleY + 30
      const words = node.description.split('')
      let line = ''
      let lineCount = 0
      const lineHeight = 18
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i]
        const testWidth = ctx.measureText(testLine).width
        if (testWidth > titleMaxWidth && line.length > 0) {
          ctx.fillText(line, cx + NODE_PADDING_X, descY + lineCount * lineHeight)
          line = words[i]
          lineCount++
        } else {
          line = testLine
        }
      }
      if (line.length > 0) {
        ctx.fillText(line, cx + NODE_PADDING_X, descY + lineCount * lineHeight)
        lineCount++
      }
    }
    if (node.tag && node.tag.trim()) {
      const tagY = ny + nh - NODE_PADDING_Y - 24
      ctx.font = '10px "Courier New", "Hiragino Sans GB", "PingFang SC", monospace'
      const tagWidth = ctx.measureText(node.tag).width + TAG_PADDING_X * 2
      const tagHeight = 20
      roundRect(ctx, cx + NODE_PADDING_X, tagY, tagWidth, tagHeight, 999)
      ctx.fillStyle = withAlpha(theme.accent, 0.07)
      ctx.fill()
      ctx.strokeStyle = withAlpha(theme.accent, 0.14)
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = theme.accentDeep
      ctx.textBaseline = 'middle'
      ctx.fillText(node.tag, cx + NODE_PADDING_X + TAG_PADDING_X, tagY + tagHeight / 2)
    }
    ctx.restore()
  })
}

function renderFrame(diagram, dashOffset) {
  const canvas = createCanvas(BOARD_WIDTH, BOARD_HEIGHT)
  const ctx = canvas.getContext('2d')
  renderBackground(ctx, diagram.theme)
  renderGridTexture(ctx, diagram.theme)
  renderBoard(ctx, diagram.theme)
  renderLanes(ctx, diagram)
  renderEdges(ctx, diagram, dashOffset)
  renderNodes(ctx, diagram)
  return ctx.getImageData(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
}

function rgbaToRgbaArray(imageData) {
  const { data, width, height } = imageData
  const result = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * 4
    const dstIdx = i * 4
    result[dstIdx] = data[srcIdx]
    result[dstIdx + 1] = data[srcIdx + 1]
    result[dstIdx + 2] = data[srcIdx + 2]
    result[dstIdx + 3] = data[srcIdx + 3]
  }
  return { data: result, width, height }
}

export default function generateDiagramGifLegacy(diagram, options = {}) {
  const { scale = 1 } = options
  const width = Math.round(BOARD_WIDTH * scale)
  const height = Math.round(BOARD_HEIGHT * scale)
  const frames = []
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const dashOffset = (i / TOTAL_FRAMES) * DASH_TOTAL_OFFSET
    const imageData = renderFrame(diagram, dashOffset)
    let frameData
    if (scale === 1) {
      frameData = rgbaToRgbaArray(imageData)
    } else {
      const scaledCanvas = createCanvas(width, height)
      const scaledCtx = scaledCanvas.getContext('2d')
      const tempCanvas = createCanvas(BOARD_WIDTH, BOARD_HEIGHT)
      const tempCtx = tempCanvas.getContext('2d')
      tempCtx.putImageData(imageData, 0, 0)
      scaledCtx.imageSmoothingEnabled = true
      scaledCtx.imageSmoothingQuality = 'high'
      scaledCtx.drawImage(tempCanvas, 0, 0, width, height)
      const scaledImageData = scaledCtx.getImageData(0, 0, width, height)
      frameData = rgbaToRgbaArray(scaledImageData)
    }
    frames.push(frameData)
  }
  if (frames.length === 0) {
    throw new Error('Failed to render any frames')
  }
  const palette = quantize(frames[0].data, 256, {
    format: 'rgba',
    oneBitAlpha: false,
  })
  const encoder = GIFEncoder()
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const indexed = applyPalette(frame.data, palette, 'floyd-steinberg', {
      format: 'rgba',
    })
    encoder.writeFrame(indexed, frame.width, frame.height, {
      palette,
      delay: FRAME_DELAY,
    })
  }
  encoder.finish()
  return { buffer: Buffer.from(encoder.bytes()), width, height, frameCount: TOTAL_FRAMES }
}
