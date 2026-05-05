import { createCanvas, Image } from '@napi-rs/canvas'
import gifenc from 'gifenc'

const { GIFEncoder, quantize, applyPalette } = gifenc

function decodePngToRgba(pngBuffer) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = createCanvas(img.width, img.height)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
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
      resolve({ data: result, width, height })
    }
    img.onerror = (err) => reject(err)
    img.src = pngBuffer
  })
}

function buildGlobalPalette(frameDataList) {
  const totalPixels = frameDataList.reduce((sum, fd) => sum + fd.width * fd.height, 0)
  const sampleInterval = Math.max(1, Math.floor(totalPixels / 50000))
  const allPixels = []

  for (const frameData of frameDataList) {
    const { data, width, height } = frameData
    for (let i = 0; i < width * height; i += sampleInterval) {
      const idx = i * 4
      allPixels.push(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])
    }
  }

  const sampled = new Uint8Array(allPixels)
  return quantize(sampled, 256, { format: 'rgba', oneBitAlpha: false })
}

export async function encodeGif(frameBuffers, { delay, loop = true } = {}) {
  const frameDataList = await Promise.all(frameBuffers.map((buf) => decodePngToRgba(buf)))

  if (frameDataList.length === 0) {
    throw new Error('No frames to encode')
  }

  const palette = buildGlobalPalette(frameDataList)

  const encoder = GIFEncoder()

  for (let i = 0; i < frameDataList.length; i++) {
    const frameData = frameDataList[i]
    const indexed = applyPalette(frameData.data, palette)

    encoder.writeFrame(indexed, frameData.width, frameData.height, {
      palette,
      delay,
      repeat: i === 0 && loop ? 0 : undefined,
    })
  }

  encoder.finish()

  return Buffer.from(encoder.bytes())
}
