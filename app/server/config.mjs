const DEFAULT_PORT = 3103
const DEFAULT_DEV_USER_ID = '00000000-0000-0000-0000-000000000001'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
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

export function getServerConfig() {
  return {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    schemaVersion: process.env.SCHEMA_VERSION ?? '1.0',
    defaultUserId: process.env.DEFAULT_USER_ID ?? DEFAULT_DEV_USER_ID,
    defaultUserEmail: process.env.DEFAULT_USER_EMAIL ?? 'local-dev@workflow-tool.local',
    defaultUserName: process.env.DEFAULT_USER_NAME ?? 'Local Dev User',
  }
}
