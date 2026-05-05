import { BOARD_WIDTH, BOARD_HEIGHT, ANIMATION, LINE, NODE, LANE, BOARD, FONT_FAMILY } from './presentationProfile.mjs'
import { buildEdgeAnimationPlan, getEdgeAnimationCycleDurationMs, resolveEdgeAnimationMode } from './edgeAnimationPlan.mjs'
import { getLaneBounds, getNodeSidePoint, percentXToCanvas, percentYToCanvas, withAlpha } from './utils.mjs'

function escapeHtml(value) {
  if (!value) return ''
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildEdgePath(edge, nodes) {
  const source = nodes.find((n) => n.id === edge.fromNodeId)
  const target = nodes.find((n) => n.id === edge.toNodeId)
  if (!source || !target) return ''

  const anchor = getNodeSidePoint(source, target)
  const startX = percentXToCanvas(anchor.startX)
  const startY = percentYToCanvas(anchor.startY)
  const endX = percentXToCanvas(anchor.endX)
  const endY = percentYToCanvas(anchor.endY)
  const dx = endX - startX
  const dy = endY - startY
  const controlX = Math.max(Math.abs(dx) * 0.35, 64)
  const controlY = Math.max(Math.abs(dy) * 0.28, 42)

  const isVertical = anchor.endSide === 'top' || anchor.endSide === 'bottom'

  if (!isVertical) {
    const c1x = startX + (dx >= 0 ? controlX : -controlX)
    const c2x = endX - (dx >= 0 ? controlX : -controlX)
    return `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`
  }
  const c1y = startY + (dy >= 0 ? controlY : -controlY)
  const c2y = endY - (dy >= 0 ? controlY : -controlY)
  return `M ${startX} ${startY} C ${startX} ${c1y}, ${endX} ${c2y}, ${endX} ${endY}`
}

function getSectionTitle(lane) {
  return (lane.title || '').trim()
}

function getSectionSubtitle(lane) {
  return (lane.subtitle || '').trim()
}

function getNodeClassName(type) {
  if (type === 'agent') return 'node-card node-card--agent'
  if (type === 'shared') return 'node-card node-card--shared'
  if (type === 'output') return 'node-card node-card--output'
  return 'node-card'
}

export function generatePresentationHtml(diagram) {
  const edgeAnimationMode = resolveEdgeAnimationMode(diagram.meta?.edgeAnimationMode)
  const edgeAnimationPlan = buildEdgeAnimationPlan(diagram)
  const accent = diagram.theme.accent
  const accentDeep = diagram.theme.accentDeep
  const textPrimary = diagram.theme.textPrimary
  const textMuted = diagram.theme.textMuted
  const bgPrimary = diagram.theme.bgPrimary
  const lineSoft = diagram.theme.lineSoft

  const laneMarkup = diagram.lanes
    .map((lane) => {
      const bounds = getLaneBounds(diagram.lanes, lane.id)
      return `
        <section class="lane" style="top:${bounds.top}%;height:${bounds.height}%;">
          <div class="lane__label">
            <span class="lane__title">${escapeHtml(getSectionTitle(lane))}</span>
            ${getSectionSubtitle(lane) ? `<span class="lane__subtitle">${escapeHtml(getSectionSubtitle(lane))}</span>` : ''}
          </div>
        </section>`
    })
    .join('')

  const edgeMarkup = diagram.edges
    .map((edge) => {
      const marker = edge.emphasis === 'theme' ? 'url(#arrow-theme)' : 'url(#arrow-soft)'
      const animationStep = edgeAnimationPlan.edgeSteps[edge.id] ?? 0
      return `<path d="${buildEdgePath(edge, diagram.nodes)}" class="edge-path edge-path--${edge.emphasis}" data-edge-id="${edge.id}" data-animation-step="${animationStep}" data-animation-mode="${edgeAnimationMode}" marker-end="${marker}" />`
    })
    .join('')

  const nodeMarkup = diagram.nodes
    .map((node) => `
        <article class="${getNodeClassName(node.type)}" style="left:${node.x}%;top:${node.y}%;width:${node.width}%;min-height:${node.height}%;">
          <h3>${escapeHtml(node.title)}</h3>
          <p>${escapeHtml(node.description)}</p>
          ${node.tag && node.tag.trim() ? `<span class="node-card__tag">${escapeHtml(node.tag)}</span>` : ''}
        </article>`)
    .join('')

  const title = escapeHtml(diagram.meta.title || 'Workflow')

  return `<!doctype html>
<html lang="${diagram.meta.locale || 'zh-CN'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
:root {
  --accent: ${accent};
  --accent-deep: ${accentDeep};
  --text-primary: ${textPrimary};
  --text-muted: ${textMuted};
  --bg-primary: ${bgPrimary};
  --line-soft: ${lineSoft};
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  width: ${BOARD_WIDTH}px;
  height: ${BOARD_HEIGHT}px;
  overflow: hidden;
}

body {
  background: linear-gradient(130deg, ${bgPrimary}, rgba(255,255,255,.96) 56%, rgba(255,255,255,.99));
  color: ${textPrimary};
  font-family: ${FONT_FAMILY.title};
  -webkit-font-smoothing: antialiased;
}

.slide {
  position: relative;
  width: ${BOARD_WIDTH}px;
  height: ${BOARD_HEIGHT}px;
  overflow: hidden;
}

.board {
  position: absolute;
  inset: ${BOARD.inset}px;
  border-radius: ${BOARD.borderRadius}px;
  overflow: hidden;
  border: 1px solid rgba(11,11,15,.1);
  box-shadow: 0 24px 48px rgba(11,11,15,.08);
  background: rgba(255,255,255,.82);
}

.board::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, ${withAlpha(accent, 0.03)}, transparent 18%),
    linear-gradient(90deg, transparent 0%, ${withAlpha(accent, 0.02)} 50%, transparent 100%);
}

.lane {
  position: absolute;
  left: ${LANE.insetLeft}px;
  right: ${LANE.insetRight}px;
  border-radius: ${LANE.borderRadius}px;
  border: 1px solid ${withAlpha(accent, 0.14)};
  background: rgba(255,255,255,.76);
}

.lane__label {
  position: absolute;
  left: 18px;
  top: 14px;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.lane__title {
  font-family: ${FONT_FAMILY.laneTitle};
  font-size: 18px;
  color: ${accentDeep};
}

.lane__subtitle {
  color: ${textMuted};
  font-family: ${FONT_FAMILY.laneSubtitle};
  font-size: 11px;
}

.edge-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.edge-path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.edge-path--theme {
  stroke: ${accent};
  stroke-width: ${LINE.themeWidth};
  stroke-dasharray: ${ANIMATION.dashPatternTheme[0]} ${ANIMATION.dashPatternTheme[1]};
  stroke-dashoffset: var(--edge-dash-offset, 0);
  opacity: 0.85;
}

.edge-path--soft {
  stroke: ${lineSoft};
  stroke-width: ${LINE.softWidth};
  stroke-dasharray: ${ANIMATION.dashPatternSoft[0]} ${ANIMATION.dashPatternSoft[1]};
  stroke-dashoffset: var(--edge-dash-offset, 0);
  opacity: 0.7;
}

.node-card {
  position: absolute;
  z-index: 2;
  padding: ${NODE.paddingY}px ${NODE.paddingX}px;
  border-radius: ${NODE.borderRadius}px;
  background: rgba(255,255,255,.94);
  border: 1px solid rgba(11,11,15,.12);
  box-shadow: 0 12px 28px rgba(11,11,15,.06);
}

.node-card h3 {
  margin: 0 0 6px;
  font-family: ${FONT_FAMILY.title};
  font-size: ${NODE.titleFontSize}px;
  line-height: 1.15;
  color: ${textPrimary};
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.node-card p {
  margin: 0;
  color: rgba(11,11,15,.78);
  font-size: ${NODE.bodyFontSize}px;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: ${NODE.maxDescriptionLines};
  -webkit-box-orient: vertical;
}

.node-card__tag {
  display: inline-block;
  margin-top: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-family: ${FONT_FAMILY.tag};
  font-size: ${NODE.tagFontSize}px;
  background: ${withAlpha(accent, 0.08)};
  color: ${accentDeep};
  border: 1px solid ${withAlpha(accent, 0.16)};
}

.node-card--agent {
  background: linear-gradient(135deg, ${withAlpha(accent, 0.06)}, rgba(255,255,255,.94));
  border-color: ${withAlpha(accent, 0.18)};
}

.node-card--shared {
  background: linear-gradient(135deg, ${withAlpha(accent, 0.08)}, rgba(255,255,255,.94) 55%);
  border-color: ${withAlpha(accent, 0.24)};
}

.node-card--output {
  background: linear-gradient(135deg, rgba(11,11,15,.02), rgba(255,255,255,.94));
}
</style>
</head>
<body>
  <section class="slide">
    <div class="board">
      ${laneMarkup}
      <svg class="edge-layer" viewBox="0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="arrow-theme" markerWidth="${LINE.arrowSize}" markerHeight="${LINE.arrowSize}" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L8,3 z" fill="${accent}"></path>
          </marker>
          <marker id="arrow-soft" markerWidth="${LINE.arrowSize}" markerHeight="${LINE.arrowSize}" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L8,3 z" fill="${lineSoft}"></path>
          </marker>
        </defs>
        ${edgeMarkup}
      </svg>
      ${nodeMarkup}
    </div>
  </section>
  <script>
    (() => {
      const mode = ${JSON.stringify(edgeAnimationMode)}
      const totalSteps = ${edgeAnimationPlan.totalSteps}
      const stepDurationMs = ${edgeAnimationPlan.stepDurationMs}
      const activeDurationMs = ${edgeAnimationPlan.activeDurationMs}
      const totalDurationMs = ${getEdgeAnimationCycleDurationMs(edgeAnimationMode, edgeAnimationPlan)}
      const dashTotalOffset = ${edgeAnimationPlan.dashTotalOffset}
      const edgeElements = Array.from(document.querySelectorAll('.edge-path'))

      const getEdgeOffset = (step, elapsedMs) => {
        if (mode === 'all-active') {
          const cycleElapsed = ((elapsedMs % totalDurationMs) + totalDurationMs) % totalDurationMs
          return -dashTotalOffset * (cycleElapsed / totalDurationMs)
        }

        if (totalSteps === 0) return 0

        const cycleElapsed = ((elapsedMs % totalDurationMs) + totalDurationMs) % totalDurationMs
        const activeStart = step * stepDurationMs
        const activeEnd = activeStart + activeDurationMs

        if (cycleElapsed <= activeStart) return 0
        if (cycleElapsed >= activeEnd) return -dashTotalOffset

        const progress = (cycleElapsed - activeStart) / activeDurationMs
        return -dashTotalOffset * progress
      }

      window.__setEdgeAnimationElapsedMs = (elapsedMs) => {
        edgeElements.forEach((edgeElement) => {
          const step = Number(edgeElement.dataset.animationStep || '0')
          edgeElement.style.setProperty('--edge-dash-offset', String(getEdgeOffset(step, elapsedMs)))
        })
      }

      window.__setEdgeAnimationElapsedMs(0)
    })()
  </script>
</body>
</html>`
}
