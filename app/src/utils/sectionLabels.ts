import type { Lane } from '../model/diagram'

export function getSectionTitle(lane: Pick<Lane, 'title'>): string {
  return lane.title.trim()
}

export function getSectionSubtitle(lane: Pick<Lane, 'subtitle'>): string {
  return lane.subtitle.trim()
}
