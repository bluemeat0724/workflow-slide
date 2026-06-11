import { getStorageDriver } from './config.mjs'
import { fileURLToPath } from 'node:url'

export function getMigrationModule(storageDriver) {
  if (storageDriver === 'sqlite') {
    return './migrate-sqlite.mjs'
  }

  if (storageDriver === 'postgres') {
    return './migrate-postgres.mjs'
  }

  throw new Error(`Unsupported storage driver: ${storageDriver}`)
}

export async function migrate(storageDriver = getStorageDriver()) {
  const migrationModule = await import(getMigrationModule(storageDriver))
  await migrationModule.migrate()
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url)

if (isMainModule) {
  migrate().catch((error) => {
    console.error('Database migration failed.')
    console.error(error)
    process.exitCode = 1
  })
}
