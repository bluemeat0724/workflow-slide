import { chromium } from 'playwright'
import { generatePresentationHtml } from './exportTemplate.mjs'
import { ANIMATION, SIZE_PRESETS } from './presentationProfile.mjs'
import { buildEdgeAnimationPlan, getEdgeAnimationCycleDurationMs, resolveEdgeAnimationMode } from './edgeAnimationPlan.mjs'

let browserInstance = null
let browserRefCount = 0

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function readBooleanEnv(name, defaultValue = false) {
  const value = process.env[name]
  if (value === undefined) {
    return defaultValue
  }

  return value === '1' || value === 'true'
}

function getLaunchOptions() {
  const useSandbox = readBooleanEnv('GIF_EXPORT_USE_SANDBOX', false)
  const args = useSandbox
    ? ['--disable-gpu']
    : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']

  return {
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    timeout: parsePositiveInteger(process.env.GIF_EXPORT_BROWSER_LAUNCH_TIMEOUT_MS, 30_000),
    args,
  }
}

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch(getLaunchOptions())
    browserRefCount = 0
  }
  browserRefCount++
  return browserInstance
}

async function releaseBrowser() {
  browserRefCount = Math.max(0, browserRefCount - 1)
  if (browserRefCount === 0 && browserInstance && browserInstance.isConnected()) {
    await browserInstance.close()
    browserInstance = null
  }
}

export async function captureFrames(diagram, { size = 'standard', scale = 1 } = {}) {
  const preset = SIZE_PRESETS[size] ?? SIZE_PRESETS.standard
  const { width, height } = preset
  const browser = await getBrowser()
  let context = null
  let page = null

  try {
    context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      colorScheme: 'light',
    })

    page = await context.newPage()

    const html = generatePresentationHtml(diagram)

    await page.setContent(html, { waitUntil: 'networkidle' })

    const edgeAnimationMode = resolveEdgeAnimationMode(diagram.meta?.edgeAnimationMode)
    const edgeAnimationPlan = buildEdgeAnimationPlan(diagram)
    const cycleDurationMs = getEdgeAnimationCycleDurationMs(edgeAnimationMode, edgeAnimationPlan)
    const totalFrames = Math.max(1, Math.round((cycleDurationMs / 1000) * ANIMATION.fps))
    const frames = []

    for (let i = 0; i < totalFrames; i++) {
      const elapsedMs = (i / totalFrames) * cycleDurationMs
      await page.evaluate(async (currentElapsedMs) => {
        if (typeof window.__setEdgeAnimationElapsedMs === 'function') {
          window.__setEdgeAnimationElapsedMs(currentElapsedMs)
        }

        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
      }, elapsedMs)

      const buffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width, height },
      })

      frames.push(buffer)
    }

    return { frames, totalFrames, width, height }
  } finally {
    if (page) {
      await page.close().catch(() => {})
    }
    if (context) {
      await context.close().catch(() => {})
    }
    await releaseBrowser().catch(() => {})
  }
}

export async function shutdownBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    await browserInstance.close()
    browserInstance = null
    browserRefCount = 0
  }
}
