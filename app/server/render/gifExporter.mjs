import { captureFrames, shutdownBrowser } from './browserFrameCapture.mjs'
import { encodeGif } from './gifEncoder.mjs'
import { ANIMATION } from './presentationProfile.mjs'

function isLegacyRequest(body) {
  return body && typeof body === 'object' && !body.profile && (body.meta || body.nodes || body.lanes)
}

export async function generateDiagramGif(body) {
  if (isLegacyRequest(body)) {
    return generateDiagramGifLegacy(body)
  }

  const { diagram, profile = 'presentation-gif', size = 'standard', loop = true } = body

  if (!diagram) {
    throw new Error('Missing required field: diagram')
  }

  const { frames, width, height, totalFrames } = await captureFrames(diagram, { size })

  const gifBuffer = await encodeGif(frames, {
    delay: ANIMATION.frameDelay,
    loop,
  })

  return { buffer: gifBuffer, width, height, frameCount: totalFrames }
}

async function generateDiagramGifLegacy(diagram) {
  const { default: legacyGifExporter } = await import('./gifExporterLegacy.mjs')
  return legacyGifExporter(diagram)
}

export { shutdownBrowser }
