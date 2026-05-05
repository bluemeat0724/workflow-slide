import fs from 'node:fs/promises'
import path from 'node:path'

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function getContentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream'
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}

async function resolveStaticFile(distDir, requestPath) {
  const relativePath = decodeURIComponent(requestPath === '/' ? '/index.html' : requestPath).replace(/^\/+/, '')
  const filePath = path.join(distDir, path.normalize(relativePath))

  if (!isPathInside(distDir, filePath)) {
    return null
  }

  return await fileExists(filePath) ? filePath : null
}

async function serveFile(response, filePath, method) {
  const content = await fs.readFile(filePath)
  response.writeHead(200, {
    'Content-Type': getContentType(filePath),
    'Content-Length': content.length,
  })

  if (method === 'HEAD') {
    response.end()
    return
  }

  response.end(content)
}

export async function tryServeFrontend(distDir, requestPath, method, response) {
  if (method !== 'GET' && method !== 'HEAD') {
    return false
  }

  const staticFile = await resolveStaticFile(distDir, requestPath)
  if (staticFile) {
    await serveFile(response, staticFile, method)
    return true
  }

  if (path.extname(requestPath)) {
    return false
  }

  const indexFile = path.join(distDir, 'index.html')
  if (!(await fileExists(indexFile))) {
    return false
  }

  await serveFile(response, indexFile, method)
  return true
}
