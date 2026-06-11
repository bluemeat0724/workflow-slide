import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PORT = 3103
const DEFAULT_DEV_USER_ID = '00000000-0000-0000-0000-000000000001'

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue
  }

  return value === '1' || value === 'true'
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getStorageDriver() {
  const driver = process.env.STORAGE_DRIVER
  if (driver === 'sqlite' || driver === 'postgres') {
    return driver
  }

  if (!driver) {
    throw new Error('Missing required environment variable: STORAGE_DRIVER')
  }

  throw new Error('Invalid STORAGE_DRIVER. Expected "sqlite" or "postgres".')
}

export function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }

  const host = requireEnv('DB_HOST')
  const port = requireEnv('DB_PORT')
  const name = requireEnv('DB_NAME')
  const user = requireEnv('DB_USER')
  const password = requireEnv('DB_PASSWORD')

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${name}`
}

export function getSqliteConfig() {
  return {
    filePath: process.env.SQLITE_FILE ?? path.join(__dirname, '..', 'data', 'workflow-tool.sqlite'),
  }
}

export function getServerConfig() {
  return {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    schemaVersion: process.env.SCHEMA_VERSION ?? '1.0',
    defaultUserId: process.env.DEFAULT_USER_ID ?? DEFAULT_DEV_USER_ID,
    defaultUserEmail: process.env.DEFAULT_USER_EMAIL ?? 'local-dev@workflow-tool.local',
    defaultUserName: process.env.DEFAULT_USER_NAME ?? 'Local Dev User',
  }
}

export function hasAiConfig() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.DEFAULT_MODEL_NAME)
}

export function resolveWorkflowJsonBaseUrl({ apiBase, workflowJsonBaseUrl }) {
  if (workflowJsonBaseUrl) {
    return workflowJsonBaseUrl
  }

  if (!apiBase) {
    return undefined
  }

  try {
    const parsed = new URL(apiBase)
    if (parsed.hostname === 'api.deepseek.com' && !parsed.pathname.startsWith('/beta')) {
      return `${parsed.origin}/beta`
    }
  } catch {
    return apiBase
  }

  return apiBase
}

export function getAiConfig() {
  const apiKey = requireEnv('OPENAI_API_KEY')
  const defaultModelName = requireEnv('DEFAULT_MODEL_NAME')
  const apiBase = process.env.OPENAI_API_BASE
  const workflowJsonBaseUrl = resolveWorkflowJsonBaseUrl({
    apiBase,
    workflowJsonBaseUrl: process.env.WORKFLOW_JSON_BASE_URL,
  })

  return {
    apiKey,
    apiBase,
    defaultModelName,
    enableThinking: parseBooleanEnv(process.env.ENABLE_THINKING, false),
    defaultReasoningEffort: process.env.DEFAULT_REASONING_EFFORT ?? 'medium',
    workflowJsonBaseUrl,
    workflowJsonModelName: process.env.WORKFLOW_JSON_MODEL_NAME || defaultModelName,
  }
}
