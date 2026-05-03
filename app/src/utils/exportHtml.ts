import type { Diagram } from '../model/diagram'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../model/diagram'
import { buildEdgePath, getLaneBounds } from './geometry'
import { getSectionSubtitle, getSectionTitle } from './sectionLabels'
import { withAlpha } from './theme'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getNodeClassName(type: Diagram['nodes'][number]['type']) {
  if (type === 'agent') return 'node-card node-card--agent'
  if (type === 'shared') return 'node-card node-card--shared'
  if (type === 'output') return 'node-card node-card--output'
  return 'node-card'
}

export function generateStandaloneHtml(diagram: Diagram): string {
  const laneMarkup = diagram.lanes
    .map((lane) => {
      const bounds = getLaneBounds(diagram.lanes, lane.id)
      const laneTitle = getSectionTitle(lane)
      const laneSubtitle = getSectionSubtitle(lane)
      return `
        <section class="lane" style="top:${bounds.top}%;height:${bounds.height}%;background:${escapeHtml(diagram.theme.laneBackground)};">
          <div class="lane__label">
            <span class="lane__title">${escapeHtml(laneTitle)}</span>
            ${laneSubtitle ? `<span class="lane__subtitle">${escapeHtml(laneSubtitle)}</span>` : ''}
          </div>
        </section>`
    })
    .join('')

  const edgeMarkup = diagram.edges
    .map((edge) => {
      const marker = edge.emphasis === 'theme' ? 'url(#arrow-theme)' : 'url(#arrow-soft)'
      return `<path d="${buildEdgePath(edge, diagram.nodes)}" class="edge-path edge-path--${edge.emphasis}" marker-end="${marker}" />`
    })
    .join('')

  const nodeMarkup = diagram.nodes
    .map(
      (node) => `
        <article class="${getNodeClassName(node.type)}" style="left:${node.x}%;top:${node.y}%;width:${node.width}%;min-height:${node.height}%;">
          <h3>${escapeHtml(node.title)}</h3>
          <p>${escapeHtml(node.description)}</p>
          ${node.tag.trim() ? `<span class="node-card__tag">${escapeHtml(node.tag)}</span>` : ''}
        </article>`,
    )
    .join('')

  return `<!doctype html>
<html lang="${diagram.meta.locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(diagram.meta.title)}</title>
<style>
:root {
  --bg-primary: ${diagram.theme.bgPrimary};
  --board-background: ${diagram.theme.boardBackground};
  --lane-background: ${diagram.theme.laneBackground};
  --text-primary: ${diagram.theme.textPrimary};
  --text-muted: ${diagram.theme.textMuted};
  --accent: ${diagram.theme.accent};
  --accent-deep: ${diagram.theme.accentDeep};
  --accent-soft: ${diagram.theme.accentSoft};
  --line-soft: ${diagram.theme.lineSoft};
}
* { box-sizing: border-box; }
html, body { width: 100%; height: 100%; margin: 0; }
body {
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 18%, ${withAlpha(diagram.theme.accent, 0.11)}, transparent 26%),
    radial-gradient(circle at 84% 74%, ${withAlpha(diagram.theme.accent, 0.08)}, transparent 24%),
    linear-gradient(130deg, ${diagram.theme.bgPrimary}, rgba(255,255,255,.94) 56%, rgba(255,250,250,.98));
  color: var(--text-primary);
  font-family: "Avenir Next Condensed", "DIN Condensed", "Microsoft YaHei", sans-serif;
}
.slide {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
.slide::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(11,11,15,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(11,11,15,.07) 1px, transparent 1px),
    radial-gradient(circle at 25% 80%, rgba(11,11,15,.03), transparent 35%),
    repeating-linear-gradient(115deg, transparent 0, transparent 3.7rem, ${withAlpha(diagram.theme.accent, 0.025)} 3.7rem, ${withAlpha(diagram.theme.accent, 0.025)} 3.82rem);
  background-size: 2rem 2rem, 2rem 2rem, auto, auto;
  opacity: .92;
}
.board {
  position: absolute;
  inset: 20px;
  border-radius: 32px;
  overflow: hidden;
  border: 1px solid rgba(11,11,15,.08);
  box-shadow: 0 32px 56px rgba(11,11,15,.1);
  background: var(--board-background);
}
.board::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(209,0,0,.045), transparent 18%),
    linear-gradient(90deg, transparent 0%, ${withAlpha(diagram.theme.accent, 0.028)} 44%, ${withAlpha(diagram.theme.accent, 0.07)} 52%, ${withAlpha(diagram.theme.accent, 0.028)} 60%, transparent 100%);
}
.lane {
  position: absolute;
  left: 14px;
  right: 14px;
  border-radius: 24px;
  border: 1px solid ${withAlpha(diagram.theme.accent, 0.12)};
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.55);
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
  font-family: "Iowan Old Style", "Baskerville", "Songti SC", Georgia, serif;
  font-size: 1.14rem;
  color: var(--accent-deep);
}
.lane__subtitle {
  color: var(--text-muted);
  font-family: "Cascadia Mono", "Courier New", monospace;
  font-size: .7rem;
}
.edge-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.edge-path {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 14 9;
  animation: dash 2.8s linear infinite;
}
.edge-path--theme {
  stroke: ${withAlpha(diagram.theme.accent, 0.58)};
  filter: drop-shadow(0 0 6px ${withAlpha(diagram.theme.accent, 0.18)});
}
.edge-path--soft {
  stroke: var(--line-soft);
  stroke-width: 2.4;
  stroke-dasharray: 10 7;
}
.node-card {
  position: absolute;
  z-index: 2;
  padding: 14px 16px;
  border-radius: 22px;
  background: rgba(255,255,255,.88);
  border: 1px solid rgba(11,11,15,.09);
  box-shadow: 0 22px 38px rgba(11,11,15,.08);
}
.node-card::before {
  content: "";
  position: absolute;
  inset: 4px;
  border-radius: 18px;
  border: 1px solid ${withAlpha(diagram.theme.accent, 0.11)};
}
.node-card h3 {
  margin: 0 0 6px;
  font-family: "Iowan Old Style", "Baskerville", "Songti SC", Georgia, serif;
  font-size: 1.04rem;
  line-height: 1.04;
}
.node-card p {
  margin: 0;
  color: rgba(11,11,15,.76);
  font-size: .76rem;
  line-height: 1.22;
}
.node-card__tag {
  display: inline-block;
  margin-top: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  font-family: "Cascadia Mono", "Courier New", monospace;
  font-size: .62rem;
  background: ${withAlpha(diagram.theme.accent, 0.07)};
  color: var(--accent-deep);
  border: 1px solid ${withAlpha(diagram.theme.accent, 0.14)};
}
.node-card--agent {
  background: linear-gradient(135deg, ${withAlpha(diagram.theme.accent, 0.08)}, rgba(255,255,255,.9));
  border-color: ${withAlpha(diagram.theme.accent, 0.16)};
}
.node-card--shared {
  background: linear-gradient(135deg, ${withAlpha(diagram.theme.accent, 0.11)}, rgba(255,255,255,.9) 55%);
  border-color: ${withAlpha(diagram.theme.accent, 0.2)};
  box-shadow: 0 22px 38px rgba(11,11,15,.08), 0 0 0 8px ${withAlpha(diagram.theme.accent, 0.05)};
}
.node-card--output {
  background: linear-gradient(135deg, rgba(11,11,15,.03), rgba(255,255,255,.92));
}
@keyframes dash { to { stroke-dashoffset: -44; } }
</style>
</head>
<body>
  <section class="slide">
    <div class="board">
      ${laneMarkup}
      <svg class="edge-layer" viewBox="0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="arrow-theme" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L8,3 z" fill="rgba(209,0,0,.76)"></path>
          </marker>
          <marker id="arrow-soft" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L8,3 z" fill="rgba(11,11,15,.28)"></path>
          </marker>
        </defs>
        ${edgeMarkup}
      </svg>
      ${nodeMarkup}
    </div>
  </section>
</body>
</html>`
}
